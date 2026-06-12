# react-native-nitro-retrofit

A **Retrofit-style** decorator library for React Native, powered by [`react-native-nitro-fetch`](https://github.com/mrousavy/nitro) for native-thread HTTP performance.

```
@GET / @POST / …           1. decorator → build URL + params + body from metadata
  → NitroRetrofitClient    2. interceptor pipeline (auth · perf metrics · error tracking)
    → nitro-fetch (JSI)    3. native HTTP thread — Cronet (Android) / URLSession (iOS)
      → HTTP/3 · QUIC · Brotli · TLS 1.3
```

---

## Why this library?

### The problem with writing API calls by hand

```ts
// ❌ Raw fetch — repeated everywhere, every caller handles URL, headers, errors
const res = await fetch(`${BASE_URL}/users/${id}?include=profile`, {
  method: 'GET',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const user = await res.json();

// ❌ axios — still verbose, every endpoint needs a wrapper function
async function getUser(id: number) {
  const res = await api.get(`/users/${id}`, { params: { include: 'profile' } });
  return res.data;
}
// And another for POST... and another for PUT...
// No structure, no contract, just functions floating around.
```

### The solution: describe your API as a typed class

```ts
// ✅ Declare once, call anywhere — clean, typed, testable
@ApiService('users')
class UserService extends BaseService {
  @Param('id', 0)
  @Query('include', 1)
  @GET('/:id')
  getUser(_id: number, _include: string): Promise<Response> { return null!; }

  @Body(0)
  @POST('/')
  createUser(_payload: CreateUserDto): Promise<Response> { return null!; }

  @Body(1)
  @Param('id', 0)
  @PATCH('/:id')
  patchUser(_id: number, _payload: Partial<User>): Promise<Response> { return null!; }

  @Param('id', 0)
  @DELETE('/:id')
  removeUser(_id: number): Promise<Response> { return null!; }
}

// Usage — no boilerplate, full type safety
const res = await userService.getUser(42, 'profile');
const user: User = await res.json();
```

The library builds the URL, injects headers, serialises params, and fires the request. Your service class becomes a **typed contract** — readable, testable, and in one place.

### Why `react-native-nitro-fetch` instead of plain `fetch`?

`react-native-nitro-fetch` runs HTTP on a **native thread** (C++ via JSI), not the JS thread. Requests don't compete with UI, animations, or React re-renders. It delivers:

- HTTP/3 and QUIC out of the box (Cronet on Android, URLSession on iOS)
- Brotli compression — smaller payloads over the wire
- No JS bridge — requests never block your event loop

---

## Why decorators are defined this way

If you've used Retrofit (Android/Java) or NestJS you'd expect parameter decorators:

```ts
// 🚫 What you'd want — Babel does NOT support this in React Native
getUser(@Param('id') id: number, @Query('include') include: string)
```

**Babel does not support parameter decorators.** `@babel/plugin-proposal-decorators` only implements class- and method-level decorators. React Native uses Babel at runtime, so parameter decorators simply don't work.

**The workaround** — move metadata to the _method level_ with an explicit 0-based argument index:

```ts
// ✅ Method-level with explicit index
@Param('id', 0)       // "take argument 0 → path param :id"
@Query('include', 1)  // "take argument 1 → query param include"
@GET('/:id')
getUser(_id: number, _include: string): Promise<Response> { return null!; }
//       ↑ index 0         ↑ index 1
```

The `_` prefix suppresses the TypeScript "unused variable" warning — the method body is replaced by the decorator at class-definition time, so arguments are never actually read by your code.

> **TL;DR:** `@Query('name', 0)` means "take argument at index 0 and append it as `?name=value`". The number is the position of that argument in the method signature, starting from 0.

---

## Installation

```sh
npm install react-native-nitro-retrofit react-native-nitro-fetch
# or
yarn add react-native-nitro-retrofit react-native-nitro-fetch
```

**`tsconfig.json`** — enable legacy decorators:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

**`babel.config.js`** — register the decorator transform:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['@babel/plugin-proposal-decorators', { legacy: true }],
  ],
};
```

---

## Quick start

### 1. Create and register the HTTP client (once, at app entry)

```ts
// network/index.ts  — import this in your index.js / App.tsx
import { createNitroRetrofitClient, networkRegisterBuilder } from 'react-native-nitro-retrofit';

const NetworkClient = createNitroRetrofitClient({
  baseURL: 'https://api.example.com',
  timeout: 10_000,
  deduplicateRequests: true, // collapse concurrent identical GETs into one network call
});

// Inject auth token on every request
NetworkClient.addRequestInterceptor(async (ctx) => ({
  ...ctx,
  headers: {
    ...ctx.headers,
    Authorization: `Bearer ${getToken()}`,
  },
}));

networkRegisterBuilder(NetworkClient);
export default NetworkClient;
```

### 2. Declare a service

```ts
// services/post.service.ts
import { ApiService, BaseService, GET, POST, PATCH, DELETE, Body, Param, Query } from 'react-native-nitro-retrofit';

@ApiService('posts')
class PostService extends BaseService {
  @Query('_limit', 0)
  @GET('/')
  list(_limit: number): Promise<Response> { return null!; }

  @Param('id', 0)
  @GET('/:id')
  getById(_id: number): Promise<Response> { return null!; }

  @Body(0)
  @POST('/')
  create(_dto: { title: string; body: string }): Promise<Response> { return null!; }

  @Body(1)
  @Param('id', 0)
  @PATCH('/:id')
  partialUpdate(_id: number, _dto: Partial<{ title: string }>): Promise<Response> { return null!; }

  @Param('id', 0)
  @DELETE('/:id')
  remove(_id: number): Promise<Response> { return null!; }
}

export const postService = new PostService();
```

### 3. Call it

```ts
import { HttpError } from 'react-native-nitro-retrofit';

try {
  const res = await postService.getById(1);
  const post = await res.json();
} catch (err) {
  if (err instanceof HttpError) {
    console.log(err.status);                // 404, 500, …
    const body = await err.response.json(); // error payload from server
  }
}
```

> By default, any response with HTTP status ≥ 400 throws an `HttpError`. See [Error handling](#error-handling) to customise this.

---

## API Reference

### Setup

#### `networkInit(config)`

Shorthand — creates and registers the global `NitroRetrofitClient` in one call. Use when you don't need interceptors.

```ts
import { networkInit } from 'react-native-nitro-retrofit';

networkInit({
  baseURL: 'https://api.example.com',
  timeout: 10_000,
  headers: { 'X-App-Version': '2.0.0' },
});
```

#### `createNitroRetrofitClient(config)` + `networkRegisterBuilder(client)`

Use when you need interceptors or multiple backends:

```ts
import { createNitroRetrofitClient, networkRegisterBuilder } from 'react-native-nitro-retrofit';

const client = createNitroRetrofitClient({
  baseURL: 'https://api.example.com',
  timeout: 10_000,
  deduplicateRequests: true,
  throwOnNon2xx: true, // default — throw HttpError for 4xx/5xx
  headers: { 'Accept-Language': 'en' },
});

// … add interceptors …

networkRegisterBuilder(client);
```

#### `NitroRetrofitConfig`

| Option | Type | Default | Description |
|---|---|---|---|
| `baseURL` | `string` | — | Prepended to every request path |
| `timeout` | `number` | — | Milliseconds before `AbortSignal` fires |
| `headers` | `Record<string, string>` | `{}` | Default headers merged with every request |
| `deduplicateRequests` | `boolean` | `false` | Collapse concurrent identical GETs into one network call |
| `throwOnNon2xx` | `boolean` | `true` | Throw `HttpError` for HTTP status ≥ 400 |
| `[key: string]` | `unknown` | — | Extra fields forwarded to the underlying `fetch` `RequestInit` |

---

### Class decorator

#### `@ApiService(prefix, options?)`

```ts
// All methods resolve under https://api.example.com/users/…
@ApiService('users')
class UserService extends BaseService { … }

// Override base URL for one service (multi-backend)
@ApiService('assets', { baseUrl: 'https://cdn.example.com' })
class AssetService extends BaseService { … }
```

| Argument | Type | Description |
|---|---|---|
| `prefix` | `string` | URL prefix prepended to all method paths |
| `options.baseUrl` | `string?` | Override the global `baseURL` for this service only |

---

### HTTP method decorators

```ts
@GET(path)     // HTTP GET
@POST(path)    // HTTP POST — body serialised to JSON when present
@PUT(path)     // HTTP PUT — body serialised to JSON when present
@PATCH(path)   // HTTP PATCH — body serialised to JSON when present
@DELETE(path)  // HTTP DELETE
```

`path` is appended after the service prefix. Use `/:name` for path parameters.

---

### Parameter decorators

> All are **method-level** because Babel does not support parameter decorators in React Native. The index tells the library which argument provides the value.

#### `@Param(name, index)` — path parameter

Replaces `/:name` in the path with the argument value.

```ts
// GET /users/42
@Param('id', 0)
@GET('/:id')
getUser(_id: number): Promise<Response> { return null!; }
```

#### `@Query(name, index)` — dynamic query param

```ts
// GET /posts?_page=2&_limit=10
@Query('_page', 0)
@Query('_limit', 1)
@GET('/')
list(_page: number, _limit: number): Promise<Response> { return null!; }
```

`null` and `undefined` values are automatically omitted from the query string.

#### `@StaticQuery(name, value)` — fixed query param

Hardcoded at decoration time — no argument needed.

```ts
// Always appends ?version=2&format=json
@StaticQuery('version', 2)
@StaticQuery('format', 'json')
@GET('/')
listV2(): Promise<Response> { return null!; }
```

#### `@QueriesMap(index)` — spread object as query params

Best for endpoints with many optional filters. Only accepts `Record<string, string | number | boolean | null | undefined>` — nested objects are rejected at compile time.

```ts
@QueriesMap(0)
@GET('/')
search(_filters: { userId?: number; status?: string; page?: number }): Promise<Response> { return null!; }

// → GET /posts?userId=1&status=active&page=2
postService.search({ userId: 1, status: 'active', page: 2 });
```

Arrays are serialised as repeat-key format: `?ids=1&ids=2&ids=3` (compatible with Spring Boot, NestJS, etc.).

#### `@Body(index)` — JSON request body

Sets `Content-Type: application/json` automatically. Omitting the argument (or passing `undefined`) sends no body and no `Content-Type` header — safe for strict servers.

```ts
@Body(0)
@POST('/')
create(_dto: CreatePostDTO): Promise<Response> { return null!; }
```

#### `@Headers(obj)` — per-method header overrides

Merged on top of global builder headers for this method only.

```ts
@Headers({ 'X-Admin': 'true', 'Cache-Control': 'no-cache' })
@DELETE('/:id/force')
forceDelete(_id: number): Promise<Response> { return null!; }
```

---

### Multipart / file upload

#### `@Multipart()` + `@Part(name, index)`

```ts
@Multipart()
@Part('avatar', 0)
@Part('username', 1)
@POST('/profile')
updateProfile(_avatar: IMultipartFile, _username: string): Promise<Response> { return null!; }
```

Pass an `IMultipartFile` for file fields:

```ts
import type { IMultipartFile } from 'react-native-nitro-retrofit';

const file: IMultipartFile = {
  uri: result.assets[0].uri,  // from ImagePicker / DocumentPicker
  name: 'photo.jpg',
  type: 'image/jpeg',         // required on Android
};

await profileService.updateProfile(file, 'alice');
```

**Array of files** (same field name, repeated):

```ts
@Multipart()
@Part('photos', 0)
@POST('/gallery')
uploadGallery(_photos: IMultipartFile[]): Promise<Response> { return null!; }
```

---

### Transform decorators

#### `@TransformParams(fn)` — rewrite query params before send

```ts
@TransformParams(({ from, to }: { from: Date; to: Date }) => ({
  startDate: from.toISOString(),
  endDate: to.toISOString(),
}))
@QueriesMap(0)
@GET('/events')
getEvents(_range: { from: Date; to: Date }): Promise<Response> { return null!; }
```

#### `@TransformBody(fn)` — rewrite body before send

```ts
// Hash password before it ever leaves the app
@TransformBody((dto: CreateUserDTO) => ({ ...dto, password: hashPassword(dto.password) }))
@Body(0)
@POST('/')
create(_dto: CreateUserDTO): Promise<Response> { return null!; }
```

---

### Interceptors

Interceptors are registered on the `NitroRetrofitClient` instance and apply to every service using that builder.

```ts
const client = createNitroRetrofitClient({ baseURL: 'https://api.example.com' });
```

#### Request interceptor

Receives the full `RequestContext` — mutate headers, attach custom metadata, start perf metrics. Must return the (possibly modified) context.

```ts
client.addRequestInterceptor(async (ctx) => {
  const token = await SecureStore.getItemAsync('token');
  ctx._startedAt = Date.now(); // attach arbitrary data — readable in response interceptor
  return {
    ...ctx,
    headers: { ...ctx.headers, Authorization: `Bearer ${token}` },
  };
});
```

`RequestContext` extends `IRequestConfig` and has an index signature (`[key: string]: unknown`) so you can attach any custom fields.

#### Response interceptor

Receives `(response, ctx)` — ctx is the same object produced by the request interceptors (including any custom fields you attached).

```ts
client.addResponseInterceptor(async (res, ctx) => {
  const ms = Date.now() - (ctx._startedAt as number);
  console.log(`[API] ${ctx.method} ${ctx.url} ${res.status} — ${ms}ms`);
  return res; // return the same or a replacement Response
});
```

#### Error interceptor

Called when the network call throws **or** when `throwOnNon2xx` produces an `HttpError`. Return a `Response` to recover; return `void` (or throw) to propagate.

```ts
import { HttpError } from 'react-native-nitro-retrofit';

client.addErrorInterceptor(async (error, ctx) => {
  if (error instanceof HttpError && error.status === 401) {
    MyEventEmitter.emit('serverUnAuthorized');
  }
  // Return a cached fallback instead of crashing the UI:
  if (error instanceof HttpError && error.status === 503) {
    return getCachedResponse(ctx.url);
  }
  // return void → error propagates to the caller
});
```

#### Cleanup

All three `addXxxInterceptor` methods return an unsubscribe function:

```ts
const removeAuth = client.addRequestInterceptor(authInterceptor);

// Remove on logout / screen unmount
removeAuth();
```

---

### Error handling

#### `HttpError`

By default (`throwOnNon2xx: true`), any response with HTTP status ≥ 400 throws an `HttpError`:

```ts
import { HttpError } from 'react-native-nitro-retrofit';

try {
  const res = await userService.getById(999);
  const user = await res.json();
} catch (err) {
  if (err instanceof HttpError) {
    console.log(err.status);                 // 404
    console.log(err.message);               // "[nitro-retrofit] HTTP 404 Not Found"
    const body = await err.response.json(); // error payload from server
  }
}
```

| Property | Type | Description |
|---|---|---|
| `err.status` | `number` | HTTP status code (404, 500, …) |
| `err.response` | `Response` | The original response — call `.json()`, `.text()` to read the body |
| `err.message` | `string` | `"[nitro-retrofit] HTTP <status> <statusText>"` |

#### Opt out — raw fetch behaviour

Set `throwOnNon2xx: false` to skip automatic throwing and handle `response.ok` yourself:

```ts
const client = createNitroRetrofitClient({
  baseURL: 'https://api.example.com',
  throwOnNon2xx: false, // 4xx/5xx resolve normally — you check res.ok
});

const res = await userService.getById(999);
if (!res.ok) {
  const err = await res.json();
  console.log(`Error: ${err.message}`);
}
```

#### Error interceptor recovery

Even with `throwOnNon2xx: true`, the error interceptor runs first. Return a `Response` to prevent the throw:

```ts
client.addErrorInterceptor(async (error) => {
  if (error instanceof HttpError && error.status === 404) {
    return new Response(JSON.stringify([]), { status: 200 }); // empty fallback
  }
});
```

---

### GET deduplication

When `deduplicateRequests: true`, concurrent GET requests to the same URL share one network call. Each caller gets an independent `Response` clone (safe to call `.json()` on separately).

```ts
const client = createNitroRetrofitClient({
  baseURL: 'https://api.example.com',
  deduplicateRequests: true,
});

// Only ONE network call is made — all three get independent Response clones
const [r1, r2, r3] = await Promise.all([
  client.get('/users'),
  client.get('/users'),
  client.get('/users'),
]);
```

- Safe for mobile: GET is idempotent and there is only one authenticated user per app instance.
- Response interceptors still run once per caller — each has its own clone.
- Only applies to GET. POST/PUT/PATCH/DELETE are never deduplicated.

---

### Multi-backend support

Register a different builder per service class using the optional second argument:

```ts
import { createNitroRetrofitClient, networkRegisterBuilder, AxiosRetrofitAdapter } from 'react-native-nitro-retrofit';

// Global default — used by most services
networkRegisterBuilder(
  createNitroRetrofitClient({ baseURL: 'https://api.example.com', throwOnNon2xx: true })
);

// CDN service — different host and builder
networkRegisterBuilder(
  createNitroRetrofitClient({ baseURL: 'https://cdn.example.com', throwOnNon2xx: false }),
  AssetService,
);
```

`AssetService` will use its own builder; every other service will fall back to the global default.

---

## Using the Axios adapter (optional, migration path)

If your project already has Axios interceptors you can't drop yet, `AxiosRetrofitAdapter` wraps an existing Axios instance to satisfy the `INitroRetrofitBuilder` interface. All decorators work identically.

```ts
import axios from 'axios';
import { fetch as nitroFetch } from 'react-native-nitro-fetch';
import { AxiosRetrofitAdapter, networkRegisterBuilder } from 'react-native-nitro-retrofit';

const axiosInstance = axios.create({
  baseURL: 'https://api.example.com',
  timeout: 15_000,
  adapter: 'fetch',
  fetchOptions: { fetch: nitroFetch }, // axios ≥ 1.7 — route transport through nitro-fetch
});

// Your existing interceptors stay untouched
axiosInstance.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axiosInstance.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) logout();
    return Promise.reject(err);
  },
);

networkRegisterBuilder(new AxiosRetrofitAdapter(axiosInstance));
```

> **Note:** `AxiosRetrofitAdapter` applies a fast-path optimisation: axios already JSON-parses the response body, so `.json()` on the returned `Response` returns the cached value directly — no second `JSON.parse`.
>
> Once you're ready to drop Axios, swap `new AxiosRetrofitAdapter(axiosInstance)` for `createNitroRetrofitClient(…)` and move your interceptors.

---

## Production example

Full network setup with Firebase Performance Monitoring and Crashlytics:

```ts
// network/index.ts
import { Platform } from 'react-native';
import { createNitroRetrofitClient, networkRegisterBuilder, HttpError } from 'react-native-nitro-retrofit';
import type { RequestContext } from 'react-native-nitro-retrofit';
import { getCrashlytics, log, recordError } from '@react-native-firebase/crashlytics';
import { getPerformance, httpMetric } from '@react-native-firebase/perf';
import type { FirebasePerformanceTypes } from '@react-native-firebase/perf';

const NetworkClient = createNitroRetrofitClient({
  baseURL: MyEnv.apiBaseUrl,
  timeout: 10_000,
  deduplicateRequests: true,
  headers: { 'os': Platform.OS },
});

// 1. Auth token + start Firebase Perf metric
NetworkClient.addRequestInterceptor(async (ctx: RequestContext) => {
  const token = LocalServices.getAuthKey('@TOKEN');
  if (token && !ctx.url.includes('/auth/login')) {
    ctx.headers = { ...ctx.headers, Authorization: `Bearer ${token}` };
  }

  try {
    const metric = httpMetric(
      getPerformance(),
      ctx.url,
      ctx.method as FirebasePerformanceTypes.HttpMethod,
    );
    ctx._httpMetric = metric;
    await metric.start();
  } catch { /* non-critical */ }

  return ctx;
});

// 2. Stop metric on success
NetworkClient.addResponseInterceptor(async (response: Response, ctx: RequestContext) => {
  try {
    const metric = ctx._httpMetric as ReturnType<typeof httpMetric> | undefined;
    if (metric) {
      metric.setHttpResponseCode(response.status);
      const ct = response.headers.get('Content-Type');
      if (ct) metric.setResponseContentType(ct);
      await metric.stop();
    }
  } catch { /* non-critical */ }
  return response;
});

// 3. Stop metric on error + Crashlytics + 401 logout
NetworkClient.addErrorInterceptor(async (error: unknown, ctx: RequestContext) => {
  const metric = ctx._httpMetric as ReturnType<typeof httpMetric> | undefined;
  const status = error instanceof HttpError ? error.status : undefined;

  if (metric) {
    if (status !== undefined) metric.setHttpResponseCode(status);
    await metric.stop();
  }

  if ((ctx.isAutoTrackingError as boolean | undefined) ?? true) {
    const label = `${ctx.url} — ${error instanceof Error ? error.message : String(error)}`;
    const crashlytics = getCrashlytics();
    log(crashlytics, label);
    recordError(crashlytics, new Error(label));
  }

  if (status === 401) {
    MyEventEmitter.emit('serverUnAuthorized');
  }
  // return void → error propagates to the caller's catch block
});

networkRegisterBuilder(NetworkClient);
export default NetworkClient;
```

---

## Full service example

```ts
import {
  ApiService, BaseService,
  GET, POST, PUT, PATCH, DELETE,
  Param, Query, QueriesMap, StaticQuery, Body, Headers,
  Multipart, Part, TransformBody,
  type IMultipartFile,
} from 'react-native-nitro-retrofit';

interface User { id: number; name: string; email: string; }
interface CreateUserDTO { name: string; email: string; password: string; }

@ApiService('users')
class UserService extends BaseService {

  @GET('/')
  getAll(): Promise<Response> { return null!; }

  @Param('id', 0)
  @GET('/:id')
  getById(_id: number): Promise<Response> { return null!; }

  // Many optional filters — one object instead of stacked @Query
  @QueriesMap(0)
  @GET('/')
  search(_filters: Partial<User>): Promise<Response> { return null!; }

  // Always append ?_sort=name
  @StaticQuery('_sort', 'name')
  @GET('/')
  listSorted(): Promise<Response> { return null!; }

  // Hash password before it leaves the app
  @TransformBody((dto: CreateUserDTO) => ({ ...dto, password: hash(dto.password) }))
  @Body(0)
  @POST('/')
  create(_dto: CreateUserDTO): Promise<Response> { return null!; }

  @Body(1)
  @Param('id', 0)
  @PUT('/:id')
  replace(_id: number, _dto: User): Promise<Response> { return null!; }

  // Partial update
  @Body(1)
  @Param('id', 0)
  @PATCH('/:id')
  update(_id: number, _dto: Partial<User>): Promise<Response> { return null!; }

  @Param('id', 0)
  @DELETE('/:id')
  remove(_id: number): Promise<Response> { return null!; }

  @Headers({ 'X-Admin': 'true' })
  @Param('id', 0)
  @DELETE('/:id/hard')
  forceDelete(_id: number): Promise<Response> { return null!; }

  @Multipart()
  @Part('avatar', 0)
  @POST('/avatar')
  uploadAvatar(_file: IMultipartFile): Promise<Response> { return null!; }
}

export const userService = new UserService();
```

---

## Decorator cheat sheet

| Decorator | Level | Description |
|---|---|---|
| `@ApiService(prefix, opts?)` | Class | Register service + URL prefix |
| `@GET(path)` | Method | HTTP GET |
| `@POST(path)` | Method | HTTP POST — JSON body when `@Body` present |
| `@PUT(path)` | Method | HTTP PUT — JSON body when `@Body` present |
| `@PATCH(path)` | Method | HTTP PATCH — JSON body when `@Body` present |
| `@DELETE(path)` | Method | HTTP DELETE |
| `@Param(name, idx)` | Method | Path param — replaces `/:name` |
| `@Query(name, idx)` | Method | Dynamic query param |
| `@StaticQuery(name, val)` | Method | Fixed query param (no argument needed) |
| `@QueriesMap(idx)` | Method | Spread object as query params; arrays → repeat-key |
| `@Body(idx)` | Method | JSON request body; `Content-Type` set automatically |
| `@Headers(obj)` | Method | Per-method header overrides |
| `@Multipart()` | Method | Switch to multipart/form-data |
| `@Part(name, idx)` | Method | FormData field; pass `IMultipartFile` for files |
| `@TransformParams(fn)` | Method | Rewrite query params before send |
| `@TransformBody(fn)` | Method | Rewrite body before send |

> **Index (`idx`)** is always the 0-based position of the method argument that provides the value.

---

## License

MIT
