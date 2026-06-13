/**
 * Coverage for decorators and registry behaviours not exercised by the
 * per-method test files: @Headers, @TransformParams, validateQueryMap error
 * cases, multi-backend (per-service builder), and no-builder error.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ApiService,
  BaseService,
  GET,
  POST,
  Body,
  Headers,
  QueriesMap,
  TransformParams,
  createNitroRetrofitClient,
  networkRegisterBuilder,
} from '../index';
import {
  mockFetch,
  makeResponse,
  lastCall,
  setupClient,
  SERVER_URL,
  baseResponse,
} from './setup';

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(makeResponse(baseResponse));
  setupClient(); // register global default builder
});

// ─── @Headers ────────────────────────────────────────────────────────────────

describe('@Headers', () => {
  @ApiService('admin')
  class AdminService extends BaseService {
    @Headers({ 'X-Admin': 'true', 'Cache-Control': 'no-cache' })
    @GET('/dashboard')
    getDashboard(): Promise<Response> {
      return null!;
    }

    @GET('/users')
    getUsers(): Promise<Response> {
      return null!;
    }
  }

  const svc = new AdminService();

  it('sends per-method headers', async () => {
    await svc.getDashboard();
    const [, init] = lastCall();
    expect(init.headers?.['x-admin']).toBe('true');
    expect(init.headers?.['cache-control']).toBe('no-cache');
  });

  it('does NOT bleed headers to other methods on the same service', async () => {
    await svc.getUsers();
    const [, init] = lastCall();
    expect(init.headers?.['x-admin']).toBeUndefined();
  });
});

// ─── @TransformParams ─────────────────────────────────────────────────────────

describe('@TransformParams', () => {
  @ApiService('events')
  class EventService extends BaseService {
    @TransformParams(({ from, to }: { from: string; to: string }) => ({
      startDate: `${from}T00:00:00Z`,
      endDate: `${to}T23:59:59Z`,
    }))
    @QueriesMap(0)
    @GET('/')
    list(_range: { from: string; to: string }): Promise<Response> {
      return null!;
    }
  }

  const svc = new EventService();

  it('rewrites query params before send', async () => {
    await svc.list({ from: '2024-01-01', to: '2024-01-31' });
    const [url] = lastCall();
    expect(url).toContain('startDate=');
    expect(url).toContain('endDate=');
    expect(url).not.toContain('from=');
    expect(url).not.toContain('to=');
  });
});

// ─── validateQueryMap — runtime error cases ───────────────────────────────────
//
// validateQueryMap is called synchronously inside handleRequest (not inside an
// async function), so these throw synchronously — use .toThrow(), not .rejects.

describe('validateQueryMap — error cases', () => {
  @ApiService('search-validation')
  class SearchService extends BaseService {
    @QueriesMap(0)
    @GET('/')
    search(_filters: unknown): Promise<Response> {
      return null!;
    }
  }

  const svc = new SearchService();

  it('throws synchronously when @QueriesMap receives an array', () => {
    expect(() => svc.search([1, 2, 3] as unknown as object)).toThrow(
      '@QueriesMap: expected a plain object'
    );
  });

  it('throws synchronously when @QueriesMap receives a primitive', () => {
    expect(() => svc.search('string' as unknown as object)).toThrow(
      '@QueriesMap: expected a plain object'
    );
  });

  it('throws synchronously when @QueriesMap value is a nested object', () => {
    expect(() =>
      svc.search({ filter: { nested: true } } as unknown as object)
    ).toThrow('@QueriesMap: value for key "filter" must be a primitive');
  });

  it('error message shows typeof, not JSON.stringify (safe for circular refs)', () => {
    expect(() =>
      svc.search({ filter: { nested: true } } as unknown as object)
    ).toThrow('got object');
  });

  it('accepts a valid QueryMap without throwing', async () => {
    await expect(
      svc.search({ userId: 1, status: 'active', flag: true })
    ).resolves.toBeDefined();
  });
});

// ─── Multi-backend (per-service builder) ─────────────────────────────────────

describe('multi-backend — per-service builder', () => {
  @ApiService('cdn-assets', { baseUrl: 'https://cdn.example.com' })
  class CdnService extends BaseService {
    @GET('/logo.png')
    getLogo(): Promise<Response> {
      return null!;
    }
  }

  @ApiService('api-users')
  class UserService extends BaseService {
    @GET('/')
    list(): Promise<Response> {
      return null!;
    }
  }

  it('uses the per-service builder when registered', async () => {
    const cdnClient = createNitroRetrofitClient({
      baseURL: 'https://cdn.example.com',
    });
    networkRegisterBuilder(cdnClient, CdnService);

    await new CdnService().getLogo();
    const [url] = lastCall();
    expect(url).toContain('cdn.example.com');
  });

  it('falls back to global default for unregistered service', async () => {
    await new UserService().list();
    const [url] = lastCall();
    expect(url).toContain(SERVER_URL);
  });
});

// ─── No builder registered ────────────────────────────────────────────────────
//
// The global DEFAULT_BUILDER is set by beforeEach → setupClient(), so any
// service call would succeed via the fallback. To test the "no builder" path we
// temporarily remove DEFAULT_BUILDER from the globalThis map and restore it
// in afterEach.

const BUILDERS_KEY = Symbol.for('nitro-retrofit:builders');
const DEFAULT_BUILDER_KEY = Symbol.for('nitro-retrofit:default-builder');
type BuilderMap = Map<Function | symbol, unknown>;

describe('no builder registered', () => {
  let savedDefault: unknown;

  beforeEach(() => {
    const map = (globalThis as Record<symbol, unknown>)[
      BUILDERS_KEY
    ] as BuilderMap;
    savedDefault = map.get(DEFAULT_BUILDER_KEY);
    map.delete(DEFAULT_BUILDER_KEY);
  });

  afterEach(() => {
    const map = (globalThis as Record<symbol, unknown>)[
      BUILDERS_KEY
    ] as BuilderMap;
    if (savedDefault !== undefined) {
      map.set(DEFAULT_BUILDER_KEY, savedDefault as never);
    }
  });

  it('throws a descriptive error when no builder is set', () => {
    @ApiService('orphan-svc')
    class OrphanService extends BaseService {
      @GET('/')
      fetch(): Promise<Response> {
        return null!;
      }
    }

    expect(() => new OrphanService().fetch()).toThrow(
      '[nitro-retrofit] No builder registered'
    );
  });

  it('error message includes the service class name', () => {
    @ApiService('unregistered-svc')
    class UnregisteredService extends BaseService {
      @Body(0)
      @POST('/')
      create(_body: object): Promise<Response> {
        return null!;
      }
    }

    expect(() => new UnregisteredService().create({})).toThrow(
      'UnregisteredService'
    );
  });
});
