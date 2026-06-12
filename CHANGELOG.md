# Changelog

All notable changes to this project will be documented in this file.

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
