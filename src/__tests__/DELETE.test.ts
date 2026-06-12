import { describe, it, expect, beforeEach } from '@jest/globals';
import { ApiService, BaseService, DELETE, Param } from '../index';
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
// NitroRetrofitClient.delete()
// ---------------------------------------------------------------------------

describe('client.delete()', () => {
  it('sends DELETE', async () => {
    const client = setupClient();
    await client.delete('/users/1');
    const [url, init] = lastCall();
    expect(url).toBe(`${SERVER_URL}/users/1`);
    expect(init.method).toBe('DELETE');
  });
});

// ---------------------------------------------------------------------------
// @DELETE decorator
// ---------------------------------------------------------------------------

describe('@DELETE decorator', () => {
  @ApiService('posts')
  class PostService extends BaseService {
    @Param('id', 0)
    @DELETE('/:id')
    remove(_id: number): Promise<Response> {
      return null!;
    }
  }

  const svc = new PostService();

  it('fires DELETE with path param', async () => {
    await svc.remove(3);
    const [url, init] = lastCall();
    expect(url).toContain('/posts/3');
    expect(init.method).toBe('DELETE');
  });
});
