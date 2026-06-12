import {
  ApiService,
  BaseService,
  Body,
  DELETE,
  GET,
  Headers,
  Param,
  POST,
  PUT,
  QueriesMap,
  Query,
  StaticQuery,
  TransformBody,
} from 'react-native-nitro-retrofit';

export interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
}

export interface CreatePostDTO {
  userId: number;
  title: string;
  body: string;
}

@ApiService('posts')
class PostService extends BaseService {
  /** GET /posts?_limit=n&_page=n */
  @Query('_limit', 0)
  @Query('_page', 1)
  @GET('/')
  list(_limit: number, _page: number): Promise<Response> {
    return null!;
  }

  /** GET /posts/:id */
  @Param('id', 0)
  @GET('/:id')
  getById(_id: number): Promise<Response> {
    return null!;
  }

  /** GET /posts?_sort=title&_order=asc&userId=n */
  @StaticQuery('_sort', 'title')
  @StaticQuery('_order', 'asc')
  @Query('userId', 0)
  @GET('/')
  listByUser(_userId: number): Promise<Response> {
    return null!;
  }

  /** GET /posts?<any key>=<value> — dynamic filter object */
  @QueriesMap(0)
  @GET('/')
  search(_filters: Partial<Post> & Record<string, unknown>): Promise<Response> {
    return null!;
  }

  /** POST /posts  { userId, title, body } */
  @Body(0)
  @POST('/')
  create(_dto: CreatePostDTO): Promise<Response> {
    return null!;
  }

  /** POST /posts — body transformed before send (trim + uppercase title) */
  @TransformBody((dto: CreatePostDTO) => ({
    ...dto,
    title: dto.title.trim().toUpperCase(),
  }))
  @Body(0)
  @POST('/')
  createTransformed(_dto: CreatePostDTO): Promise<Response> {
    return null!;
  }

  /** PUT /posts/:id  with partial body */
  @Param('id', 0)
  @Body(1)
  @PUT('/:id')
  update(_id: number, _dto: Partial<CreatePostDTO>): Promise<Response> {
    return null!;
  }

  /** DELETE /posts/:id */
  @Param('id', 0)
  @DELETE('/:id')
  remove(_id: number): Promise<Response> {
    return null!;
  }

  /** POST /posts — per-method custom headers */
  @Headers({ 'X-Custom-Header': 'hello' })
  @Body(0)
  @POST('/')
  createWithHeaders(_dto: CreatePostDTO): Promise<Response> {
    return null!;
  }
}

export const postService = new PostService();
