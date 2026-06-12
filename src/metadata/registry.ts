/**
 * Metadata registry.
 *
 * WHY Symbol.for + Object.defineProperty instead of WeakMap?
 * ─────────────────────────────────────────────────────────────
 * React Native Metro Bundler (Fast Refresh) re-evaluates module files on every
 * save.  A module-level `WeakMap` would be recreated as a fresh empty map, and
 * a new class constructor reference would be created — both losing their data.
 *
 * Symbol.for('…') returns the SAME symbol from the global JS runtime registry
 * regardless of how many times the module is re-evaluated.  Attaching metadata
 * directly to the constructor via `ctor[META_KEY]` means the metadata travels
 * with the class object, surviving Fast Refresh seamlessly.
 *
 * Builders are stored on `globalThis` with the same trick so they survive
 * even if registry.ts itself is hot-reloaded.
 */
import type { IService, INitroRetrofitBuilder } from '../types';

// ─── Symbols (global, stable across module re-evaluations) ───────────────────

const META_KEY = Symbol.for('nitro-retrofit:metadata');
const BUILDERS_KEY = Symbol.for('nitro-retrofit:builders');
const DEFAULT_BUILDER = Symbol.for('nitro-retrofit:default-builder');

// ─── Builders: stored on globalThis so they survive registry hot-reload ──────

type BuilderMap = Map<Function | symbol, INitroRetrofitBuilder>;

const g = globalThis as Record<symbol, unknown>;
if (!g[BUILDERS_KEY])
  g[BUILDERS_KEY] = new Map<Function | symbol, INitroRetrofitBuilder>();
const _builders = g[BUILDERS_KEY] as BuilderMap;

// ─── Metadata API ─────────────────────────────────────────────────────────────

/**
 * Return (or lazily create) the IService metadata for a class constructor.
 * Uses `Object.defineProperty` with `enumerable: false` so the hidden key
 * never pollutes `Object.keys()`, `JSON.stringify()`, or console logs.
 */
export function getOrCreateMeta(ctor: any): IService {
  if (!ctor[META_KEY]) {
    Object.defineProperty(ctor, META_KEY, {
      value: { requests: {} } as IService,
      writable: true,
      enumerable: false,
      configurable: false,
    });
  }
  return ctor[META_KEY] as IService;
}

// ─── Builder API ──────────────────────────────────────────────────────────────

/**
 * Register an HTTP client builder.
 *
 * @param builder  The adapter to use (NitroRetrofitClient, axios adapter, …).
 * @param ctor     Optional — scope to one service class only.
 *                 Omit to set a global default for all services.
 *
 * @example
 * // Global default (recommended)
 * registerBuilder(createNitroRetrofitClient({ baseURL: 'https://api.example.com' }));
 *
 * // Per-service override (multi-backend apps)
 * registerBuilder(new AxiosRetrofitAdapter(cdnAxios), AssetService);
 */
export function registerBuilder(
  builder: INitroRetrofitBuilder,
  ctor?: Function
): void {
  _builders.set(ctor ?? DEFAULT_BUILDER, builder);
}

/**
 * Resolve the builder for a given service constructor.
 * Class-specific registration takes precedence over the global default.
 */
export function getBuilder(ctor: Function): INitroRetrofitBuilder {
  const builder =
    (_builders.get(ctor) as INitroRetrofitBuilder | undefined) ??
    (_builders.get(DEFAULT_BUILDER) as INitroRetrofitBuilder | undefined);

  if (!builder) {
    throw new Error(
      `[nitro-retrofit] No builder registered for "${(ctor as { name?: string }).name ?? 'unknown'}". ` +
        `Call networkRegisterBuilder() once at app entry before using any @ApiService class.`
    );
  }

  return builder;
}
