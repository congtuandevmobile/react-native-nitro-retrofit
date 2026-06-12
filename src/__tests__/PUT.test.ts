import { describe, it, expect, beforeEach } from '@jest/globals';
import { ApiService, BaseService, PUT, Body, Param } from '../index';
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
// NitroRetrofitClient.put()
// ---------------------------------------------------------------------------

describe('client.put()', () => {
  it('sends PUT', async () => {
    const client = setupClient();
    await client.put('/users/1', { name: 'Updated' });
    const [url, init] = lastCall();
    expect(url).toBe(`${SERVER_URL}/users/1`);
    expect(init.method).toBe('PUT');
  });
});

// ---------------------------------------------------------------------------
// @PUT decorator
// ---------------------------------------------------------------------------

describe('@PUT + @Body + @Param', () => {
  @ApiService('posts')
  class PostService extends BaseService {
    @Body(1)
    @Param('id', 0)
    @PUT('/:id')
    update(_id: number, _body: object): Promise<Response> {
      return null!;
    }
  }

  const svc = new PostService();

  it('sends PUT with path param and JSON body', async () => {
    await svc.update(7, { title: 'Updated' });
    const [url, init] = lastCall();
    expect(url).toContain('/posts/7');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ title: 'Updated' }));
  });
});
