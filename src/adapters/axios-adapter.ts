/**
 * Optional Axios adapter — use only when migrating a codebase that already
 * relies on axios interceptors and cannot switch to NitroRetrofitClient directly.
 *
 * For new projects, prefer the zero-overhead setup:
 *   networkInit({ baseURL: '...', deduplicateRequests: true })
 *
 * This adapter's role:
 *   - Satisfies the INitroRetrofitBuilder interface expected by decorators.
 *   - Converts axios responses to Web-standard Response objects.
 *   - Applies a fast-path override on .json() to avoid a redundant JSON.parse
 *     (axios already parsed the body; we would otherwise stringify → re-parse).
 *
 * Recommended production flow when keeping axios:
 *   @GET/POST/… decorator
 *     → AxiosRetrofitAdapter
 *       → axios (handles interceptors: auth, logging, Crashlytics, retry…)
 *         → axios fetch adapter + nitro-fetch transport (HTTP/3 / QUIC / Brotli)
 */
import type { INitroRetrofitBuilder, IRequestConfig } from '../types';

// ─── Axios-compatible instance interface ──────────────────────────────────────

interface AxiosLikeInstance {
  get(url: string, config?: object): Promise<AxiosLikeResponse>;
  post(
    url: string,
    data?: unknown,
    config?: object
  ): Promise<AxiosLikeResponse>;
  postForm?(
    url: string,
    data?: unknown,
    config?: object
  ): Promise<AxiosLikeResponse>;
  put(url: string, data?: unknown, config?: object): Promise<AxiosLikeResponse>;
  putForm?(
    url: string,
    data?: unknown,
    config?: object
  ): Promise<AxiosLikeResponse>;
  patch(
    url: string,
    data?: unknown,
    config?: object
  ): Promise<AxiosLikeResponse>;
  patchForm?(
    url: string,
    data?: unknown,
    config?: object
  ): Promise<AxiosLikeResponse>;
  delete(url: string, config?: object): Promise<AxiosLikeResponse>;
}

interface AxiosLikeResponse {
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  data: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Warn when a React Native-style file object `{ uri, name, type }` is passed
 * to an Axios FormData method. Axios uses the browser/Node FormData spec and
 * does not understand the RN `uri` field — the multipart boundary will be
 * malformed and the server will reject the upload.
 *
 * For file uploads in React Native, use `NitroRetrofitClient.postForm()` /
 * `putForm()` / `patchForm()` which passes FormData straight to the native
 * fetch layer without any transformation.
 */
function warnIfRNFileObject(formData: FormData | undefined): void {
  if (
    typeof __DEV__ === 'undefined' ||
    !__DEV__ ||
    !(formData instanceof FormData)
  )
    return;

  const parts: unknown[] = (formData as { _parts?: unknown[] })._parts ?? [];
  for (const part of parts) {
    if (
      Array.isArray(part) &&
      part[1] != null &&
      typeof part[1] === 'object' &&
      'uri' in (part[1] as object)
    ) {
      console.warn(
        '[nitro-retrofit] AxiosRetrofitAdapter received a React Native file object ' +
          '({ uri, name, type }) inside FormData. Axios does not support the RN FormData ' +
          'format — the multipart boundary will be malformed. ' +
          'Use NitroRetrofitClient (postForm / putForm / patchForm) for file uploads in React Native.'
      );
      return;
    }
  }
}

function toAdapterConfig(config?: IRequestConfig): object {
  return {
    ...(config?.baseURL ? { baseURL: config.baseURL } : {}),
    params: config?.params,
    headers: config?.headers,
    timeout: config?.timeout,
  };
}

/**
 * Convert an axios response to a Web-standard `Response`.
 *
 * Fast-path optimisation: axios already JSON-parsed the body.
 * We override `.json()` to return the cached value directly, avoiding:
 *   JSON.stringify(data)  → stored as Response body string
 *   JSON.parse(body)      → triggered by consumer's .json()  ← eliminated
 */
function toFetchResponse(res: AxiosLikeResponse): Response {
  const headers = new Headers();
  for (const [k, v] of Object.entries(res.headers ?? {})) {
    if (v === undefined) continue;
    headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }

  const rawBody =
    res.data == null
      ? null
      : typeof res.data === 'string'
        ? res.data
        : JSON.stringify(res.data);

  const response = new Response(rawBody, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });

  // Fast-path: skip re-parse for already-parsed objects
  if (res.data != null && typeof res.data !== 'string') {
    const parsed = res.data;
    Object.defineProperty(response, 'json', {
      value: () => Promise.resolve(parsed),
      writable: true,
      configurable: true,
    });
  }

  return response;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class AxiosRetrofitAdapter implements INitroRetrofitBuilder {
  constructor(private readonly _axios: AxiosLikeInstance) {}

  async get(path: string, config?: IRequestConfig): Promise<Response> {
    return toFetchResponse(
      await this._axios.get(path, toAdapterConfig(config))
    );
  }

  async post(
    path: string,
    body?: unknown,
    config?: IRequestConfig
  ): Promise<Response> {
    return toFetchResponse(
      await this._axios.post(path, body, toAdapterConfig(config))
    );
  }

  async postForm(
    path: string,
    formData?: FormData,
    config?: IRequestConfig
  ): Promise<Response> {
    warnIfRNFileObject(formData);
    const fn = this._axios.postForm ?? this._axios.post;
    return toFetchResponse(
      await fn.call(this._axios, path, formData, toAdapterConfig(config))
    );
  }

  async put(
    path: string,
    body?: unknown,
    config?: IRequestConfig
  ): Promise<Response> {
    return toFetchResponse(
      await this._axios.put(path, body, toAdapterConfig(config))
    );
  }

  async putForm(
    path: string,
    formData?: FormData,
    config?: IRequestConfig
  ): Promise<Response> {
    warnIfRNFileObject(formData);
    const fn = this._axios.putForm ?? this._axios.put;
    return toFetchResponse(
      await fn.call(this._axios, path, formData, toAdapterConfig(config))
    );
  }

  async patch(
    path: string,
    body?: unknown,
    config?: IRequestConfig
  ): Promise<Response> {
    return toFetchResponse(
      await this._axios.patch(path, body, toAdapterConfig(config))
    );
  }

  async patchForm(
    path: string,
    formData?: FormData,
    config?: IRequestConfig
  ): Promise<Response> {
    warnIfRNFileObject(formData);
    const fn = this._axios.patchForm ?? this._axios.patch;
    return toFetchResponse(
      await fn.call(this._axios, path, formData, toAdapterConfig(config))
    );
  }

  async delete(path: string, config?: IRequestConfig): Promise<Response> {
    return toFetchResponse(
      await this._axios.delete(path, toAdapterConfig(config))
    );
  }
}
