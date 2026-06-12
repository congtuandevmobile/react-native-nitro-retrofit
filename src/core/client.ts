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

function buildUrl(path: string, config?: IRequestConfig): string {
  const base = (config?.baseURL ?? '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = base ? `${base}${normalizedPath}` : path;

  const params = config?.params;
  if (!params) return fullUrl;

  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      // Repeat-key format: ?ids=1&ids=2 (compatible with Spring Boot, NestJS, etc.)
      for (const item of v) searchParams.append(k, String(item));
    } else {
      searchParams.append(k, String(v));
    }
  }

  const qs = searchParams.toString();
  return qs ? `${fullUrl}?${qs}` : fullUrl;
}

function mergeHeaders(
  defaults: Record<string, string>,
  override?: Record<string, string>
): Record<string, string> {
  return { ...defaults, ...(override ?? {}) };
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

  /** Returns an unsubscribe function. */
  addRequestInterceptor(fn: RequestInterceptor): () => void {
    this._requestInterceptors.push(fn);
    return () => {
      const i = this._requestInterceptors.indexOf(fn);
      if (i !== -1) this._requestInterceptors.splice(i, 1);
    };
  }

  /** Returns an unsubscribe function. */
  addResponseInterceptor(fn: ResponseInterceptor): () => void {
    this._responseInterceptors.push(fn);
    return () => {
      const i = this._responseInterceptors.indexOf(fn);
      if (i !== -1) this._responseInterceptors.splice(i, 1);
    };
  }

  /** Returns an unsubscribe function. */
  addErrorInterceptor(fn: ErrorInterceptor): () => void {
    this._errorInterceptors.push(fn);
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
    const url = buildUrl(path, merged);

    const ctx = await this._runRequestInterceptors({
      ...merged,
      url,
      method,
      body,
    });

    const init: RequestInit = {
      method: ctx.method,
      headers: ctx.headers as Record<string, string>,
      body: ctx.body as BodyInit | null | undefined,
      ...(ctx.timeout !== undefined
        ? { signal: AbortSignal.timeout(ctx.timeout) }
        : {}),
    };

    // ── GET deduplication ──────────────────────────────────────────────────
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
      return this._throwIfNotOk(dedupRes, ctx);
    }

    // ── Normal path ────────────────────────────────────────────────────────
    const response = await this._fetchRaw(ctx, init);
    const finalRes = await this._runResponseInterceptors(response, ctx);
    return this._throwIfNotOk(finalRes, ctx);
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
