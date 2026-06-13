import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createNitroRetrofitClient, HttpError } from '../index';
import type { RequestContext } from '../index';
import {
  mockFetch,
  makeResponse,
  lastCall,
  SERVER_URL,
  baseResponse,
} from './setup';

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(makeResponse(baseResponse));
});

describe('request interceptors', () => {
  it('mutates headers', async () => {
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    client.addRequestInterceptor(async (ctx: RequestContext) => ({
      ...ctx,
      headers: { ...ctx.headers, Authorization: 'Bearer injected' },
    }));
    await client.get('/me');
    const [, init] = lastCall();
    expect(init.headers?.authorization).toBe('Bearer injected');
  });

  it('run in registration order', async () => {
    const order: number[] = [];
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    client.addRequestInterceptor(async (ctx: RequestContext) => {
      order.push(1);
      return ctx;
    });
    client.addRequestInterceptor(async (ctx: RequestContext) => {
      order.push(2);
      return ctx;
    });
    await client.get('/me');
    expect(order).toEqual([1, 2]);
  });

  it('cleanup function removes the interceptor', async () => {
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    const spy = jest.fn(async (ctx: RequestContext) => ctx);
    const remove = client.addRequestInterceptor(spy);
    remove();
    await client.get('/me');
    expect(spy).not.toHaveBeenCalled();
  });

  it('calling cleanup twice does not throw', async () => {
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    const remove = client.addRequestInterceptor(
      async (ctx: RequestContext) => ctx
    );
    remove();
    expect(() => remove()).not.toThrow();
  });

  it('interceptor that throws propagates the error', async () => {
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    client.addRequestInterceptor(async () => {
      throw new Error('interceptor boom');
    });
    await expect(client.get('/me')).rejects.toThrow('interceptor boom');
  });
});

describe('response interceptors', () => {
  it('receives the Response and ctx', async () => {
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    const spy = jest.fn(async (res: Response, _ctx: RequestContext) => res);
    client.addResponseInterceptor(spy);
    await client.get('/me');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true } as Record<string, unknown>),
      expect.objectContaining({ method: 'GET' } as Record<string, unknown>)
    );
  });

  it('ctx carries custom data set by request interceptor', async () => {
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    client.addRequestInterceptor(async (ctx: RequestContext) => ({
      ...ctx,
      _traceId: 'abc123',
    }));
    let captured: any;
    client.addResponseInterceptor(
      async (res: Response, ctx: RequestContext) => {
        captured = ctx._traceId;
        return res;
      }
    );
    await client.get('/me');
    expect(captured).toBe('abc123');
  });

  it('can replace the response', async () => {
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    const patched = makeResponse({ patched: true });
    client.addResponseInterceptor(async () => patched);
    const res = await client.get('/me');
    expect(res).toBe(patched);
  });

  it('interceptor that throws propagates the error', async () => {
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    client.addResponseInterceptor(async () => {
      throw new Error('response boom');
    });
    await expect(client.get('/me')).rejects.toThrow('response boom');
  });
});

describe('error interceptors', () => {
  it('is called on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    const spy = jest.fn(async (_err: unknown, _ctx: RequestContext) => {});
    client.addErrorInterceptor(spy);
    await expect(client.get('/me')).rejects.toThrow('network down');
    expect(spy).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ method: 'GET' } as Record<string, unknown>)
    );
  });

  it('can recover by returning a fallback Response', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    const fallback = makeResponse({ fallback: true }, 200);
    client.addErrorInterceptor(async () => fallback);
    const res = await client.get('/me');
    expect(res).toBe(fallback);
  });

  it('error propagates when interceptor returns void', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'));
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    client.addErrorInterceptor(async () => {});
    await expect(client.get('/me')).rejects.toThrow('timeout');
  });
});

describe('timeout', () => {
  it('attaches AbortSignal when timeout is set', async () => {
    const client = createNitroRetrofitClient({
      baseURL: SERVER_URL,
      timeout: 5000,
    });
    await client.get('/users');
    const [, init] = lastCall();
    expect(init.signal).toBeDefined();
  });

  it('omits signal when timeout is not set', async () => {
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    await client.get('/users');
    const [, init] = lastCall();
    expect(init.signal).toBeUndefined();
  });
});

describe('header merging', () => {
  it('per-request header overrides default', async () => {
    const client = createNitroRetrofitClient({
      baseURL: SERVER_URL,
      headers: { 'X-App': 'test', 'Authorization': 'Bearer default' },
    });
    await client.get('/users', {
      headers: { Authorization: 'Bearer override' },
    });
    const [, init] = lastCall();
    expect(init.headers?.['x-app']).toBe('test');
    expect(init.headers?.authorization).toBe('Bearer override');
  });

  it('undefined override removes a default header', async () => {
    const client = createNitroRetrofitClient({
      baseURL: SERVER_URL,
      headers: { 'Authorization': 'Bearer default', 'X-App': 'test' },
    });
    await client.get('/public', {
      headers: { Authorization: undefined as unknown as string },
    });
    const [, init] = lastCall();
    expect(init.headers?.authorization).toBeUndefined();
    expect(init.headers?.['x-app']).toBe('test');
  });

  it('headers are always sent lowercase', async () => {
    const client = createNitroRetrofitClient({
      baseURL: SERVER_URL,
      headers: { 'Content-Type': 'application/json', 'X-Trace-Id': 'abc' },
    });
    await client.get('/users');
    const [, init] = lastCall();
    expect(init.headers?.['content-type']).toBe('application/json');
    expect(init.headers?.['x-trace-id']).toBe('abc');
    expect(init.headers?.['Content-Type']).toBeUndefined();
  });
});

describe('throwOnNon2xx (default: true)', () => {
  it('throws HttpError for 4xx responses', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'Not Found' }, 404));
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    await expect(client.get('/missing')).rejects.toBeInstanceOf(HttpError);
  });

  it('HttpError carries status and response', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'Forbidden' }, 403));
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    try {
      await client.get('/secret');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(403);
      expect((err as HttpError).response).toBeDefined();
    }
  });

  it('throws HttpError for 5xx responses', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'Server Error' }, 500));
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    await expect(client.get('/crash')).rejects.toBeInstanceOf(HttpError);
  });

  it('does NOT throw for 2xx responses', async () => {
    mockFetch.mockResolvedValue(makeResponse({ ok: true }, 200));
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    const res = await client.get('/ok');
    expect(res.ok).toBe(true);
  });

  it('does NOT throw when throwOnNon2xx is false', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'Not Found' }, 404));
    const client = createNitroRetrofitClient({
      baseURL: SERVER_URL,
      throwOnNon2xx: false,
    });
    const res = await client.get('/missing');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
  });

  it('error interceptor can recover from HttpError', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'Not Found' }, 404));
    const fallback = makeResponse({ fallback: true }, 200);
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    client.addErrorInterceptor(async (err) => {
      if (err instanceof HttpError && err.status === 404) return fallback;
      return undefined;
    });
    const res = await client.get('/missing');
    expect(res).toBe(fallback);
  });
});

describe('GET deduplication', () => {
  it('fires only one network request for concurrent identical GETs', async () => {
    const client = createNitroRetrofitClient({
      baseURL: SERVER_URL,
      deduplicateRequests: true,
    });

    // Simulate concurrent calls
    const [r1, r2, r3] = await Promise.all([
      client.get('/users'),
      client.get('/users'),
      client.get('/users'),
    ]);

    // Only one actual fetch despite three calls
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Each caller gets an independent Response (not the same object)
    expect(r1).not.toBe(r2);
    expect(r2).not.toBe(r3);
    // But all have the same status
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
  });

  it('different URLs are not deduplicated', async () => {
    const client = createNitroRetrofitClient({
      baseURL: SERVER_URL,
      deduplicateRequests: true,
    });

    await Promise.all([client.get('/users'), client.get('/posts')]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not deduplicate when flag is off (default)', async () => {
    const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
    await Promise.all([client.get('/users'), client.get('/users')]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
