// ─── HTTP primitives ──────────────────────────────────────────────────────────

export type IMethod = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';

export interface IRequestConfig {
  baseURL?: string;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout?: number;
}

// ─── Interceptor context ──────────────────────────────────────────────────────

/**
 * Mutable context object threaded through every interceptor in the pipeline.
 * You can attach custom keys (e.g. `_traceId`, `_startedAt`) that later
 * interceptors or response interceptors can read.
 */
export type RequestContext = IRequestConfig & {
  url: string;
  method: IMethod;
  body?: unknown;
  [key: string]: unknown;
};

// ─── Interceptor signatures ───────────────────────────────────────────────────

/** Mutate or replace the outgoing request context before the network call. */
export type RequestInterceptor = (
  ctx: RequestContext
) => RequestContext | Promise<RequestContext>;

/** Inspect or replace the Response after a successful network call. */
export type ResponseInterceptor = (
  response: Response,
  ctx: RequestContext
) => Response | Promise<Response>;

/**
 * Called when the network call throws (timeout, offline, etc.).
 * Return a `Response` to recover (e.g. serve a cached fallback).
 * Return `void` to let the error propagate.
 */
export type ErrorInterceptor = (
  error: unknown,
  ctx: RequestContext
) => Response | void | Promise<Response | void>;

// ─── Builder interface ────────────────────────────────────────────────────────

/**
 * Minimal HTTP client contract used by nitro-retrofit internally.
 * Implement this to plug in any HTTP client (axios, ky, node-fetch, …).
 * `NitroRetrofitClient` and `NitroRetrofitBuilder` (axios adapter) already
 * implement it out of the box.
 */
export interface INitroRetrofitBuilder {
  get(path: string, config?: IRequestConfig): Promise<Response>;
  post(
    path: string,
    body?: unknown,
    config?: IRequestConfig
  ): Promise<Response>;
  postForm(
    path: string,
    formData?: FormData,
    config?: IRequestConfig
  ): Promise<Response>;
  put(path: string, body?: unknown, config?: IRequestConfig): Promise<Response>;
  putForm(
    path: string,
    formData?: FormData,
    config?: IRequestConfig
  ): Promise<Response>;
  patch(
    path: string,
    body?: unknown,
    config?: IRequestConfig
  ): Promise<Response>;
  patchForm(
    path: string,
    formData?: FormData,
    config?: IRequestConfig
  ): Promise<Response>;
  delete(path: string, config?: IRequestConfig): Promise<Response>;
}

// ─── Query param primitives ───────────────────────────────────────────────────

/**
 * Allowed value types for `@QueriesMap` and `@StaticQuery` — query params
 * must be primitives. Passing a nested object or array produces a compile-time error.
 */
export type QueryPrimitive = string | number | boolean | null | undefined;
export type QueryMap = Record<string, QueryPrimitive>;

// ─── Internal metadata model ──────────────────────────────────────────────────

export interface IRequestMeta {
  method?: IMethod;
  path?: string;
  /** Key: path-param name → argument index */
  params?: Record<string, number>;
  /** Key: query-param name → argument index */
  queries?: Record<string, number>;
  /** Key: query-param name → static literal value (must be a primitive) */
  staticQueries?: Record<string, QueryPrimitive>;
  body?: number;
  queryMapIndex?: number;
  headers?: Record<string, string>;
  isMultipart?: boolean;
  /** Key: form-field name → argument index */
  parts?: Record<string, number>;
  transformerParams?: <P, R>(params: P) => R;
  transformerBody?: <B, R>(body: B) => R;
}

export interface IService {
  prefixUrl?: string;
  baseUrl?: string;
  requests?: Record<string, IRequestMeta>;
}

// ─── Decorator target type ────────────────────────────────────────────────────

/**
 * The static (constructor) side of a service class.
 * Only `name` is required — metadata is attached directly to the constructor
 * via `Symbol.for` + `Object.defineProperty`; builders live on `globalThis`.
 */
export type TargetType = (new (...args: any[]) => object) & {
  readonly name: string;
};

// ─── Public decorator option types ───────────────────────────────────────────

export interface IApiServiceOption {
  baseUrl?: string;
}

export interface IMultipartFile {
  uri: string;
  name: string;
  /** MIME type, e.g. 'image/jpeg'. Required by React Native's FormData on Android. */
  type: string;
}
