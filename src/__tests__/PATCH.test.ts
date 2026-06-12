import { describe, it, expect, beforeEach } from '@jest/globals';
import { ApiService, BaseService, PATCH, Body, Param } from '../index';
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
  setupClient();
});

// ---------------------------------------------------------------------------
// NitroRetrofitClient.patch()
// ---------------------------------------------------------------------------

describe('client.patch()', () => {
  it('sends PATCH', async () => {
    const client = setupClient();
    await client.patch('/users/1', { name: 'Patched' });
    const [url, init] = lastCall();
    expect(url).toBe(`${SERVER_URL}/users/1`);
    expect(init.method).toBe('PATCH');
  });

  it('sets Content-Type when body is present', async () => {
    const client = setupClient();
    await client.patch('/users/1', { name: 'Patched' });
    const [, init] = lastCall();
    expect(init.headers?.['Content-Type']).toBe('application/json');
  });

  it('does NOT set Content-Type when body is absent', async () => {
    const client = setupClient();
    await client.patch('/users/1');
    const [, init] = lastCall();
    expect(init.headers?.['Content-Type']).toBeUndefined();
  });

  it('sends JSON-serialised body', async () => {
    const client = setupClient();
    const payload = { status: 'active' };
    await client.patch('/users/1', payload);
    const [, init] = lastCall();
    expect(init.body).toBe(JSON.stringify(payload));
  });
});

// ---------------------------------------------------------------------------
// @PATCH decorator
// ---------------------------------------------------------------------------

describe('@PATCH + @Body + @Param', () => {
  @ApiService('users')
  class UserService extends BaseService {
    @Body(1)
    @Param('id', 0)
    @PATCH('/:id')
    partialUpdate(_id: number, _body: object): Promise<Response> {
      return null!;
    }
  }

  const svc = new UserService();

  it('sends PATCH with path param and JSON body', async () => {
    await svc.partialUpdate(3, { email: 'new@example.com' });
    const [url, init] = lastCall();
    expect(url).toContain('/users/3');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ email: 'new@example.com' }));
    expect(init.headers?.['Content-Type']).toBe('application/json');
  });
});
