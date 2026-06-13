# Changelog

All notable changes to this project will be documented in this file.

## v0.0.2

### 🐛 Bug Fixes

- **`extractPath`** — fixed `https://` being corrupted by naive `replace('//', '/')` when `prefixUrl` is an absolute URL
- **`extractPath`** — `@GET('')` (empty path) no longer silently drops the `@ApiService` prefix; `path == null` check now correctly distinguishes "no decorator" from "call the root"
- **Path param substring collision** — keys are now sorted longest-first and replaced via `split/join` (global) so `:id` can never corrupt `:idType` in patterns like `@GET('/users/:id/docs/:idType')`
- **Path param without leading slash** — `@GET(':id')` and `@GET('users-:id/details')` now resolve correctly; the hardcoded `/:key` pattern has been removed
- **Zombie timer leak** — the `setTimeout` fallback for `AbortSignal.timeout` (Hermes < RN 0.74) is now cleared in a `finally` block immediately after the request completes
- **`mergeHeaders`** — passing `undefined` as an override value now deletes the default header (e.g. strip `Authorization` on public endpoints); previously `undefined` was silently ignored
- **`mergeHeaders`** — all header keys are normalised to lowercase per RFC 7230, both at merge time and as the final step before `fetch`; request interceptors injecting mixed-case keys (e.g. `Authorization`) are also normalised
- **`ctx.headers` guard** — header normalisation loop now guards against `undefined` headers instead of blindly iterating
- **`validateQueryMap` error message** — replaced `JSON.stringify(val)` with `typeof val` to prevent crash on circular references

### ✨ Improvements

- **`arrayFormat` config option** — control array query param serialisation: `'repeat'` (default, `?ids=1&ids=2`), `'comma'` (`?ids=1,2`), `'brackets'` (`?ids[]=1&ids[]=2`; brackets are kept raw, not percent-encoded)
- **Interceptor memory leak warning** — `console.warn` fires in `__DEV__` mode when more than 20 interceptors are registered on a single client (likely missing `useEffect` cleanup)
- **`AxiosRetrofitAdapter` FormData warning** — `__DEV__` warning when a React Native `{ uri, name, type }` file object is detected inside FormData passed to `postForm`/`putForm`/`patchForm`; Axios cannot handle RN's FormData format correctly
- **`AbortSignal.timeout` fallback** — graceful degradation to `AbortController` + `setTimeout` on Hermes engines older than RN 0.74 that lack the static method
- **GET dedup error fan-out** — documented in JSDoc and README: when `deduplicateRequests: true` and the shared request fails, error interceptors fire once per caller; debounce token-refresh or toast logic on the consumer side

### 🧪 Tests

66 tests across 7 suites — 5 new cases added:
- `undefined` header override removes the default header
- All header keys are sent lowercase
- Path param substring collision (`/:id` + `/:idType`)
- `@GET(':id')` with no leading slash resolves correctly
- `validateQueryMap` error message uses `typeof`, not `JSON.stringify`

### 📖 Documentation

- **README** — `arrayFormat` added to config table with format comparison table (`repeat`/`comma`/`brackets`)
- **README** — "Removing a default header" section with `undefined` override pattern
- **README** — GET deduplication section warns about error interceptor fan-out
- **README** — "Why this library?" rewritten: separates `nitro-fetch` capabilities from `nitro-retrofit` USP; accurate comparison table includes prefetching, worklet mapping, streaming
- **README** — `nitro-fetch` feature list updated to reflect actual docs (prefetch, worklet, streaming, RN 0.75+ requirement)

---

## v0.0.1

### 🎉 Initial Release

First public release of `react-native-nitro-retrofit` — a Retrofit-style decorator library for React Native, powered by [`react-native-nitro-fetch`](https://github.com/mrousavy/nitro) for native-thread HTTP performance.

---

### ✨ Features

#### HTTP Method Decorators
- `@GET(path)` — HTTP GET
- `@POST(path)` — HTTP POST with automatic JSON serialisation
- `@PUT(path)` — HTTP PUT with automatic JSON serialisation
- `@PATCH(path)` — HTTP PATCH with automatic JSON serialisation
- `@DELETE(path)` — HTTP DELETE

#### Parameter Decorators (method-level, Babel-compatible)
- `@Param(name, index)` — path parameter replacing `/:name`
- `@Query(name, index)` — dynamic query string parameter
- `@StaticQuery(name, value)` — fixed query parameter hardcoded at decoration time
- `@QueriesMap(index)` — spread a plain object as query params; arrays serialised as repeat-key (`?ids=1&ids=2`)
- `@Body(index)` — JSON request body; `Content-Type: application/json` set automatically
- `@Headers(obj)` — per-method header overrides
- `@Multipart()` + `@Part(name, index)` — multipart/FormData upload, supports file arrays
- `@TransformParams(fn)` — rewrite query params before send
- `@TransformBody(fn)` — rewrite request body before send

#### `NitroRetrofitClient` (recommended transport)
- Direct JSI path via `react-native-nitro-fetch` — HTTP/3, QUIC, Brotli, TLS 1.3
- Full interceptor pipeline: `addRequestInterceptor`, `addResponseInterceptor`, `addErrorInterceptor`
- All interceptors return an unsubscribe function for cleanup
- `RequestContext` carries custom fields (`[key: string]: unknown`) across the pipeline
- GET request deduplication (`deduplicateRequests: true`) — concurrent identical GETs share one network call, each caller receives an independent `Response.clone()`
- `throwOnNon2xx: true` (default) — automatically throws `HttpError` for HTTP status ≥ 400, consistent with Axios behaviour
- `HttpError` class with `.status` and `.response` properties for structured error handling
- Error interceptors can recover from `HttpError` by returning a fallback `Response`
- Per-request `Content-Type: application/json` set only when body is present — safe for strict servers
- `AbortSignal.timeout()` wired automatically when `timeout` is configured

#### `AxiosRetrofitAdapter` (optional, migration path)
- Wraps an existing Axios instance to satisfy `INitroRetrofitBuilder`
- Fast-path `.json()` override — Axios already parses the body, no redundant `JSON.parse`
- `postForm` / `putForm` / `patchForm` fallback to standard methods when Axios lacks them

#### Registry & Setup
- `networkInit(config)` — one-call setup, creates and registers `NitroRetrofitClient`
- `networkRegisterBuilder(builder, ServiceClass?)` — optional per-service scoping for multi-backend apps
- `@ApiService(prefix, { baseUrl? })` — class decorator with optional per-service base URL override
- Metro Fast Refresh safe — metadata stored via `Symbol.for + Object.defineProperty` on constructors; builders stored on `globalThis` — both survive hot-reload without data loss

#### TypeScript
- Zero `any` in public API surface — all interfaces use `unknown`
- `QueryPrimitive` / `QueryMap` compile-time guards prevent nested objects in query params
- `HttpError` fully typed with `status: number` and `response: Response`
- `INitroRetrofitBuilder` interface — plug in any HTTP client (Axios, ky, node-fetch, …)

---

### 🧪 Tests

50 tests across 6 suites covering:
- All HTTP method decorators (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`)
- Full interceptor pipeline (request · response · error · cleanup · ordering)
- `throwOnNon2xx` and `HttpError` recovery
- GET deduplication
- Array query params, `Content-Type` edge cases, timeout signal
- Header merging, `@QueriesMap`, `@StaticQuery`, `@TransformBody`

---

### 📦 Peer Dependencies

| Package | Required |
|---|---|
| `react-native` | ✅ |
| `react-native-nitro-fetch` | ✅ |
| `axios` | optional — only needed for `AxiosRetrofitAdapter` |
