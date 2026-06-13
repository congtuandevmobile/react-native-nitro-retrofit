import { fetch as nitroFetch } from 'react-native-nitro-fetch';
import type {
  ErrorInterceptor,
  IMethod,
  INitroRetrofitBuilder,
  IRequestConfig,
  RequestContext,
  RequestInterceptor,
  ResponseInterceptor,
} from '../types';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface NitroRetrofitConfig {
  baseURL?: string;
  headers?: Record<string, string>;
  timeout?: number;
  /**
   * Deduplicate concurrent GET requests to the same URL.
   *
   * When `true`, if two GET calls to the same URL fire simultaneously,
   * only **one** network request is made. All callers receive an independent
   * clone of that response. Response interceptors still run once per caller.
   *
   * ⚠️ **Error interceptor fan-out**: if the shared request fails (e.g. 401),
   * error interceptors run independently for **each caller**. Logic such as
   * token refresh or toast notifications must be debounced on the consumer
   * side to avoid triggering N times for N concurrent callers.
   *
   * Safe for mobile — GET is idempotent and there is only one authenticated user.
   * Default: `false`.
   */
  deduplicateRequests?: boolean;
  /**
   * When `true` (default), automatically throw an `HttpError` for any response
   * with HTTP status >= 400. Error interceptors are still called first and may
   * recover by returning a fallback `Response`.
   *
   * Set to `false` to match raw Web Fetch behaviour and handle `response.ok`
   * manually in your own interceptors.
   *
   * Default: `true`.
   */
  throwOnNon2xx?: boolean;
  /**
   * Controls how array values are serialised in query strings.
   *
   * - `'repeat'`   → `?ids=1&ids=2&ids=3`   (default — Spring Boot / NestJS)
   * - `'comma'`    → `?ids=1,2,3`            (many REST APIs)
   * - `'brackets'` → `?ids[]=1&ids[]=2`      (PHP / Laravel)
   *
   * Default: `'repeat'`.
   */
  arrayFormat?: 'repeat' | 'comma' | 'brackets';
  /** Extra fields are forwarded to the underlying fetch RequestInit */
  [key: string]: unknown;
}

// ─── HttpError ────────────────────────────────────────────────────────────────

/**
 * Thrown by `NitroRetrofitClient` when the server responds with HTTP >= 400
 * and `throwOnNon2xx` is `true` (the default).
 *
 * @example
 * try {
 *   await userService.getProfile(id);
 * } catch (err) {
 *   if (err instanceof HttpError) {
 *     console.log(err.status);           // e.g. 404
 *     const body = await err.response.json(); // error payload from server
 *   }
 * }
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly response: Response
  ) {
    super(`[nitro-retrofit] HTTP ${status} ${response.statusText}`);
    this.name = 'HttpError';
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildUrl(
  path: string,
  config?: IRequestConfig,
  arrayFormat: NitroRetrofitConfig['arrayFormat'] = 'repeat'
): string {
  const base = (config?.baseURL ?? '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = base ? `${base}${normalizedPath}` : path;

  const params = config?.params;
  if (!params) return fullUrl;

  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (arrayFormat === 'comma') {
        searchParams.append(k, v.map(String).join(','));
      } else if (arrayFormat === 'brackets') {
        for (const item of v) searchParams.append(`${k}[]`, String(item));
      } else {
        // 'repeat' (default) — ?ids=1&ids=2&ids=3
        for (const item of v) searchParams.append(k, String(item));
      }
    } else {
      searchParams.append(k, String(v));
    }
  }

  let qs = searchParams.toString();
  // URLSearchParams encodes `[]` → `%5B%5D`. Most backends (Laravel, PHP) handle
  // both forms, but strict API gateways may reject the encoded variant.
  if (arrayFormat === 'brackets') qs = qs.replace(/%5B%5D/g, '[]');
  return qs ? `${fullUrl}?${qs}` : fullUrl;
}

/**
 * Merge HTTP headers — case-insensitive per RFC 7230.
 *
 * Normalises every key to lowercase before merging so that
 * `{'Content-Type': 'application/json'}` and `{'content-type': 'text/plain'}`
 * are treated as the same header, not two separate entries.
 */
function mergeHeaders(
  defaults: Record<string, string>,
  override?: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key in defaults) {
    if (defaults[key] !== undefined) result[key.toLowerCase()] = defaults[key]!;
  }
  if (override) {
    for (const key in override) {
      if (override[key] === undefined) {
        // Intentional `undefined` → remove the default header entirely.
        // This lets callers opt-out of a client-level default (e.g. strip
        // `Authorization` on public endpoints like login/register).
        delete result[key.toLowerCase()];
      } else {
        result[key.toLowerCase()] = override[key]!;
      }
    }
  }
  return result;
}

/** Duck-type check — works for real Response AND plain-object mocks in tests. */
function isResponse(val: unknown): val is Response {
  return (
    val instanceof Response ||
    (val != null && typeof (val as Record<string, unknown>).ok === 'boolean')
  );
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class NitroRetrofitClient implements INitroRetrofitBuilder {
  private readonly _cfg: NitroRetrofitConfig;
  private readonly _requestInterceptors: RequestInterceptor[] = [];
  private readonly _responseInterceptors: ResponseInterceptor[] = [];
  private readonly _errorInterceptors: ErrorInterceptor[] = [];

  /**
   * In-flight GET requests keyed by fully-resolved URL.
   * Only populated when `deduplicateRequests: true`.
   */
  private readonly _inflight = new Map<string, Promise<Response>>();

  constructor(config: NitroRetrofitConfig = {}) {
    this._cfg = config;
  }

  // ─── Interceptor registration ───────────────────────────────────────────────

  /**
   * Threshold above which a dev warning fires — a high interceptor count almost
   * always means the unsubscribe function returned by `addXInterceptor` was
   * never called inside a `useEffect` cleanup.
   */
  private static readonly _INTERCEPTOR_LEAK_THRESHOLD = 20;

  private _warnIfLeaking(label: string, count: number): void {
    if (
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      count > NitroRetrofitClient._INTERCEPTOR_LEAK_THRESHOLD
    ) {
      console.warn(
        `[nitro-retrofit] ${count} ${label} interceptors registered on one client. ` +
          `Possible memory leak — did you forget to call the unsubscribe function returned by add${label.charAt(0).toUpperCase()}${label.slice(1)}Interceptor() inside a useEffect cleanup?`
      );
    }
  }

  /** Returns an unsubscribe function. */
  addRequestInterceptor(fn: RequestInterceptor): () => void {
    this._requestInterceptors.push(fn);
    this._warnIfLeaking('request', this._requestInterceptors.length);
    return () => {
      const i = this._requestInterceptors.indexOf(fn);
      if (i !== -1) this._requestInterceptors.splice(i, 1);
    };
  }

  /** Returns an unsubscribe function. */
  addResponseInterceptor(fn: ResponseInterceptor): () => void {
    this._responseInterceptors.push(fn);
    this._warnIfLeaking('response', this._responseInterceptors.length);
    return () => {
      const i = this._responseInterceptors.indexOf(fn);
      if (i !== -1) this._responseInterceptors.splice(i, 1);
    };
  }

  /** Returns an unsubscribe function. */
  addErrorInterceptor(fn: ErrorInterceptor): () => void {
    this._errorInterceptors.push(fn);
    this._warnIfLeaking('error', this._errorInterceptors.length);
    return () => {
      const i = this._errorInterceptors.indexOf(fn);
      if (i !== -1) this._errorInterceptors.splice(i, 1);
    };
  }

  // ─── Pipeline helpers ───────────────────────────────────────────────────────

  private async _runRequestInterceptors(
    ctx: RequestContext
  ): Promise<RequestContext> {
    let current = ctx;
    for (const fn of this._requestInterceptors) current = await fn(current);
    return current;
  }

  private async _runResponseInterceptors(
    response: Response,
    ctx: RequestContext
  ): Promise<Response> {
    let current = response;
    for (const fn of this._responseInterceptors)
      current = await fn(current, ctx);
    return current;
  }

  private _buildConfig(config?: IRequestConfig): IRequestConfig {
    return {
      baseURL: config?.baseURL ?? this._cfg.baseURL,
      params: config?.params,
      headers: mergeHeaders(this._cfg.headers ?? {}, config?.headers),
      timeout: config?.timeout ?? this._cfg.timeout,
    };
  }

  // ─── Raw network call (without response interceptors) ──────────────────────

  /**
   * Execute the actual fetch + error interceptors.
   * Response interceptors are NOT run here — that lets deduplication share one
   * network call while each caller runs its own response interceptors on a clone.
   */
  private async _fetchRaw(
    ctx: RequestContext,
    init: RequestInit
  ): Promise<Response> {
    try {
      return await (nitroFetch as unknown as typeof fetch)(ctx.url, init);
    } catch (error) {
      for (const fn of this._errorInterceptors) {
        const recovered = await fn(error, ctx);
        if (isResponse(recovered)) return recovered as Response;
      }
      throw error;
    }
  }

  // ─── Core request method ────────────────────────────────────────────────────

  /**
   * If `throwOnNon2xx` is enabled (default), run error interceptors for HTTP
   * error statuses so they have a chance to recover — then throw `HttpError`.
   */
  private async _throwIfNotOk(
    response: Response,
    ctx: RequestContext
  ): Promise<Response> {
    if (this._cfg.throwOnNon2xx === false || response.ok) return response;
    const err = new HttpError(response.status, response);
    for (const fn of this._errorInterceptors) {
      const recovered = await fn(err, ctx);
      if (isResponse(recovered)) return recovered as Response;
    }
    throw err;
  }

  private async _request(
    method: IMethod,
    path: string,
    body: unknown,
    config?: IRequestConfig
  ): Promise<Response> {
    const merged = this._buildConfig(config);
    const url = buildUrl(path, merged, this._cfg.arrayFormat);

    const ctx = await this._runRequestInterceptors({
      ...merged,
      url,
      method,
      body,
    });

    // Normalise headers to lowercase — HTTP headers are case-insensitive per
    // RFC 7230. Request interceptors may inject mixed-case keys (e.g.
    // `Authorization`), so we normalise here as the final step before fetch.
    const normalizedHeaders: Record<string, string> = {};
    if (ctx.headers) {
      for (const key in ctx.headers as Record<string, string>)
        normalizedHeaders[key.toLowerCase()] = (
          ctx.headers as Record<string, string>
        )[key]!;
    }

    const init: RequestInit = {
      method: ctx.method,
      headers: normalizedHeaders,
      body: ctx.body as BodyInit | null | undefined,
    };

    // ── Timeout signal ─────────────────────────────────────────────────────
    // `AbortSignal.timeout()` is unavailable on Hermes < RN 0.74.
    // When falling back to setTimeout we must clearTimeout in `finally` so the
    // timer does not outlive the request and become a zombie leak.
    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (ctx.timeout !== undefined) {
      if (typeof AbortSignal.timeout === 'function') {
        init.signal = AbortSignal.timeout(ctx.timeout);
      } else {
        const controller = new AbortController();
        timerId = setTimeout(
          () => controller.abort(new Error('TimeoutError')),
          ctx.timeout
        );
        init.signal = controller.signal;
      }
    }

    try {
      // ── GET deduplication ────────────────────────────────────────────────
      // One network call, each caller gets an independent Response clone so
      // calling .json() on one does not affect the others.
      if (this._cfg.deduplicateRequests && method === 'GET') {
        let inflight = this._inflight.get(ctx.url);
        if (!inflight) {
          inflight = this._fetchRaw(ctx, init).finally(() =>
            this._inflight.delete(ctx.url)
          );
          this._inflight.set(ctx.url, inflight);
        }
        const raw = await inflight;
        const dedupRes = await this._runResponseInterceptors(raw.clone(), ctx);
        return await this._throwIfNotOk(dedupRes, ctx);
      }

      // ── Normal path ────────────────────────────────────────────────────
      const response = await this._fetchRaw(ctx, init);
      const finalRes = await this._runResponseInterceptors(response, ctx);
      return await this._throwIfNotOk(finalRes, ctx);
    } finally {
      // Clear the fallback timer immediately when fetch completes (success or
      // error) — prevents zombie timers from lingering in the JS thread.
      if (timerId !== undefined) clearTimeout(timerId);
    }
  }

  // ─── Public HTTP methods ────────────────────────────────────────────────────

  get(path: string, config?: IRequestConfig): Promise<Response> {
    return this._request('GET', path, undefined, config);
  }

  post(
    path: string,
    body?: unknown,
    config?: IRequestConfig
  ): Promise<Response> {
    const hasBody = body !== undefined;
    return this._request(
      'POST',
      path,
      hasBody ? JSON.stringify(body) : undefined,
      {
        ...config,
        headers: {
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
          ...(config?.headers ?? {}),
        },
      }
    );
  }

  postForm(
    path: string,
    formData?: FormData,
    config?: IRequestConfig
  ): Promise<Response> {
    return this._request('POST', path, formData, config);
  }

  put(
    path: string,
    body?: unknown,
    config?: IRequestConfig
  ): Promise<Response> {
    const hasBody = body !== undefined;
    return this._request(
      'PUT',
      path,
      hasBody ? JSON.stringify(body) : undefined,
      {
        ...config,
        headers: {
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
          ...(config?.headers ?? {}),
        },
      }
    );
  }

  putForm(
    path: string,
    formData?: FormData,
    config?: IRequestConfig
  ): Promise<Response> {
    return this._request('PUT', path, formData, config);
  }

  patch(
    path: string,
    body?: unknown,
    config?: IRequestConfig
  ): Promise<Response> {
    const hasBody = body !== undefined;
    return this._request(
      'PATCH',
      path,
      hasBody ? JSON.stringify(body) : undefined,
      {
        ...config,
        headers: {
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
          ...(config?.headers ?? {}),
        },
      }
    );
  }

  patchForm(
    path: string,
    formData?: FormData,
    config?: IRequestConfig
  ): Promise<Response> {
    return this._request('PATCH', path, formData, config);
  }

  delete(path: string, config?: IRequestConfig): Promise<Response> {
    return this._request('DELETE', path, undefined, config);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createNitroRetrofitClient(
  config?: NitroRetrofitConfig
): NitroRetrofitClient {
  return new NitroRetrofitClient(config);
}
