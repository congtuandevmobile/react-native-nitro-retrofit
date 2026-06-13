import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  ApiService,
  BaseService,
  GET,
  Query,
  QueriesMap,
  StaticQuery,
  Param,
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
  setupClient();
});

// ---------------------------------------------------------------------------
// NitroRetrofitClient.get()
// ---------------------------------------------------------------------------

describe('client.get()', () => {
  it('calls nitroFetch with GET and correct URL', async () => {
    const client = setupClient();
    await client.get('/users');
    const [url, init] = lastCall();
    expect(url).toBe(`${SERVER_URL}/users`);
    expect(init.method).toBe('GET');
  });

  it('appends query params', async () => {
    const client = setupClient();
    await client.get('/users', { params: { limit: 5, page: 2 } });
    const [url] = lastCall();
    expect(url).toContain('limit=5');
    expect(url).toContain('page=2');
  });

  it('skips null / undefined params', async () => {
    const client = setupClient();
    await client.get('/users', { params: { a: null, b: undefined, c: 1 } });
    const [url] = lastCall();
    expect(url).not.toContain('a=');
    expect(url).not.toContain('b=');
    expect(url).toContain('c=1');
  });
});

// ---------------------------------------------------------------------------
// @GET decorator
// ---------------------------------------------------------------------------

describe('@GET decorator', () => {
  @ApiService('posts')
  class PostService extends BaseService {
    @Query('limit', 0)
    @Query('page', 1)
    @GET('/')
    list(_limit: number, _page: number): Promise<Response> {
      return null!;
    }

    @Param('id', 0)
    @GET('/:id')
    getById(_id: number): Promise<Response> {
      return null!;
    }
  }

  const svc = new PostService();

  it('fires GET', async () => {
    await svc.list(5, 1);
    const [, init] = lastCall();
    expect(init.method).toBe('GET');
  });

  it('@Query appends params', async () => {
    await svc.list(10, 2);
    const [url] = lastCall();
    expect(url).toContain('limit=10');
    expect(url).toContain('page=2');
  });

  it('@Param replaces path segment', async () => {
    await svc.getById(42);
    const [url] = lastCall();
    expect(url).toContain('/posts/42');
  });
});

describe('@Param — substring collision guard', () => {
  @ApiService(SERVER_URL)
  class DocService extends BaseService {
    @Param('idType', 1)
    @Param('id', 0)
    @GET('/users/:id/docs/:idType')
    getDocs(_id: number, _idType: string): Promise<Response> {
      return null!;
    }

    @Param('id', 0)
    @GET(':id')
    getRoot(_id: number): Promise<Response> {
      return null!;
    }
  }

  const svc = new DocService();

  it('longer param (:idType) is not corrupted by shorter (:id)', async () => {
    await svc.getDocs(5, 'pdf');
    const [url] = lastCall();
    expect(url).toContain('/users/5/docs/pdf');
    expect(url).not.toContain(':id');
    expect(url).not.toContain(':idType');
  });

  it('@GET with no leading slash and a single param works', async () => {
    await svc.getRoot(7);
    const [url] = lastCall();
    expect(url).toContain('7');
    expect(url).not.toContain(':id');
  });
});

describe('@StaticQuery', () => {
  @ApiService('posts')
  class PostService extends BaseService {
    @StaticQuery('_format', 'json')
    @Query('userId', 0)
    @GET('/')
    listByUser(_userId: number): Promise<Response> {
      return null!;
    }
  }

  const svc = new PostService();

  it('always appends static value', async () => {
    await svc.listByUser(1);
    const [url] = lastCall();
    expect(url).toContain('_format=json');
    expect(url).toContain('userId=1');
  });
});

describe('@QueriesMap', () => {
  @ApiService('posts')
  class PostService extends BaseService {
    @QueriesMap(0)
    @GET('/')
    search(_filters: Record<string, unknown>): Promise<Response> {
      return null!;
    }
  }

  const svc = new PostService();

  it('spreads map into query string', async () => {
    await svc.search({ userId: 1, _limit: 3 });
    const [url] = lastCall();
    expect(url).toContain('userId=1');
    expect(url).toContain('_limit=3');
  });
});

describe('array query params', () => {
  it('repeats key for each element: ?ids=1&ids=2', async () => {
    const client = setupClient();
    await client.get('/items', { params: { ids: [1, 2, 3] } });
    const [url] = lastCall();
    expect(url).toContain('ids=1');
    expect(url).toContain('ids=2');
    expect(url).toContain('ids=3');
    // Must NOT be comma-joined
    expect(url).not.toContain('ids=1%2C2'); // encoded comma
    expect(url).not.toContain('ids=1,2');
  });
});
