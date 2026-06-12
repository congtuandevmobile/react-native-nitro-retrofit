/**
 * react-native-nitro-retrofit — public API barrel
 *
 * ─── Decorator requirement ────────────────────────────────────────────────────
 * Uses Legacy TypeScript decorators (experimentalDecorators: true).
 * Babel config must include: @babel/plugin-proposal-decorators { legacy: true }
 *
 * ECMAScript Stage 3 (standard) decorators have a different signature.
 * When React Native's Babel preset adopts Stage 3, only the files under
 * src/decorators/ need to change — registry, extractors, and dispatcher stay.
 *
 * ─── Transport recommendation ─────────────────────────────────────────────────
 * NitroRetrofitClient (default)  →  react-native-nitro-fetch (C++ / JSI transport)
 *   • Zero JS-bridge overhead
 *   • HTTP/3, QUIC, Brotli via Cronet (Android) / URLSession (iOS)
 *   • Own interceptor pipeline + GET deduplication
 *
 * AxiosRetrofitAdapter (optional)  →  axios  →  nitro-fetch as fetch adapter
 *   • Keep existing axios interceptors during migration
 *   • Import: import { AxiosRetrofitAdapter } from 'react-native-nitro-retrofit'
 */

// ─── Core types ───────────────────────────────────────────────────────────────
export * from './types';

// ─── First-class client (recommended) ────────────────────────────────────────
export {
  NitroRetrofitClient,
  createNitroRetrofitClient,
  HttpError,
} from './core/client';
export type { NitroRetrofitConfig } from './core/client';

// ─── Optional adapter (axios migration path) ──────────────────────────────────
export { AxiosRetrofitAdapter } from './adapters/axios-adapter';

// ─── Decorators ───────────────────────────────────────────────────────────────
export { GET, POST, PUT, PATCH, DELETE } from './decorators/methods';
export {
  Param,
  Query,
  StaticQuery,
  QueriesMap,
  Body,
  Headers,
  Multipart,
  Part,
  TransformParams,
  TransformBody,
} from './decorators/params';

// ─── Registry helpers ─────────────────────────────────────────────────────────
import { getOrCreateMeta, registerBuilder } from './metadata/registry';
import { validateClassService } from './metadata/validators';
import { NitroRetrofitClient } from './core/client';
import type { NitroRetrofitConfig } from './core/client';
import type {
  IApiServiceOption,
  INitroRetrofitBuilder,
  TargetType,
} from './types';

export class BaseService {}

/**
 * Register the HTTP client used by decorated services.
 *
 * - **Global default** — omit `ServiceClass`.
 * - **Per-service** — pass a class to scope the builder (multi-backend).
 *
 * @example
 * // Recommended: zero-overhead, direct nitro-fetch transport
 * networkRegisterBuilder(
 *   createNitroRetrofitClient({ baseURL: 'https://api.example.com', deduplicateRequests: true })
 * );
 *
 * // Legacy / migration: keep axios interceptors
 * networkRegisterBuilder(new AxiosRetrofitAdapter(axiosInstance));
 *
 * // Multi-backend: different builder per service
 * networkRegisterBuilder(new AxiosRetrofitAdapter(cdnAxios), AssetService);
 */
export function networkRegisterBuilder(
  builder: INitroRetrofitBuilder,
  ServiceClass?: new (...args: any[]) => BaseService
): void {
  registerBuilder(builder, ServiceClass);
}

/**
 * Convenience: create and register a NitroRetrofitClient in one call.
 * This is the zero-dependency, maximum-performance setup.
 *
 * @example
 * networkInit({ baseURL: 'https://api.example.com', timeout: 10_000, deduplicateRequests: true });
 */
export function networkInit(config: NitroRetrofitConfig): void {
  registerBuilder(new NitroRetrofitClient(config));
}

// ─── @ApiService ──────────────────────────────────────────────────────────────

export function ApiService(prefix: string, option?: IApiServiceOption) {
  return function <T extends TargetType>(constructor: T): void {
    validateClassService(constructor);
    const meta = getOrCreateMeta(constructor);
    meta.prefixUrl = prefix;
    if (option?.baseUrl) meta.baseUrl = option.baseUrl;
  };
}
