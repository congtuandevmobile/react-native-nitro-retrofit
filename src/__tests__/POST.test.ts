import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  ApiService,
  BaseService,
  POST,
  Body,
  Part,
  Multipart,
  TransformBody,
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
// NitroRetrofitClient.post()
// ---------------------------------------------------------------------------

describe('client.post()', () => {
  it('sends POST with JSON body', async () => {
    const client = setupClient();
    await client.post('/users', { name: 'Tuan' });
    const [url, init] = lastCall();
    expect(url).toBe(`${SERVER_URL}/users`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Tuan' }));
  });

  it('auto-injects Content-Type: application/json', async () => {
    const client = setupClient();
    await client.post('/users', {});
    const [, init] = lastCall();
    expect(init.headers?.['content-type']).toBe('application/json');
  });
});

describe('client.postForm()', () => {
  it('sends FormData body with POST', async () => {
    const client = setupClient();
    const form = new FormData();
    form.append('key', 'value');
    await client.postForm('/upload', form);
    const [, init] = lastCall();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(form);
  });
});

// ---------------------------------------------------------------------------
// @POST decorator
// ---------------------------------------------------------------------------

describe('@POST + @Body', () => {
  @ApiService('posts')
  class PostService extends BaseService {
    @Body(0)
    @POST('/')
    create(_body: object): Promise<Response> {
      return null!;
    }
  }

  const svc = new PostService();

  it('sends body as JSON', async () => {
    await svc.create({ title: 'Hello' });
    const [, init] = lastCall();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'Hello' }));
  });
});

describe('@Multipart + @Part', () => {
  @ApiService('upload')
  class UploadService extends BaseService {
    @Part('file', 0)
    @Part('caption', 1)
    @Multipart()
    @POST('/photo')
    upload(_file: any, _caption: string): Promise<Response> {
      return null!;
    }
  }

  const svc = new UploadService();

  it('sends FormData body', async () => {
    await svc.upload('file-content', 'My photo');
    const [url, init] = lastCall();
    expect(url).toContain('/upload/photo');
    expect(init.body?.constructor?.name).toBe('FormData');
  });
});

describe('@TransformBody', () => {
  @ApiService('transform-posts')
  class PostServiceTransform extends BaseService {
    @TransformBody((b: { text: string }) => ({ title: b.text.toUpperCase() }))
    @Body(0)
    @POST('/')
    create(_body: { text: string }): Promise<Response> {
      return null!;
    }
  }

  const svc = new PostServiceTransform();

  it('transforms body before sending', async () => {
    await svc.create({ text: 'hello' });
    const [, init] = lastCall();
    expect(init.body).toBe(JSON.stringify({ title: 'HELLO' }));
  });
});

describe('Content-Type header edge cases', () => {
  it('omits Content-Type when body is undefined', async () => {
    const client = setupClient();
    await client.post('/trigger');
    const [, init] = lastCall();
    expect(init.headers?.['content-type']).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('sets Content-Type: application/json only when body is present', async () => {
    const client = setupClient();
    await client.post('/users', { name: 'Tuan' });
    const [, init] = lastCall();
    expect(init.headers?.['content-type']).toBe('application/json');
  });
});
