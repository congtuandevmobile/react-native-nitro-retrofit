import {
  ApiService,
  BaseService,
  type IMultipartFile,
  Multipart,
  Part,
  POST,
} from 'react-native-nitro-retrofit';

@ApiService('/post', { baseUrl: 'https://httpbin.org' })
class UploadService extends BaseService {
  /** POST multipart — single file + text caption */
  @Multipart()
  @Part('file', 0)
  @Part('caption', 1)
  @POST('/')
  uploadPhoto(_file: IMultipartFile, _caption: string): Promise<Response> {
    return null!;
  }

  /** POST multipart — array of files in one field */
  @Multipart()
  @Part('images', 0)
  @POST('/')
  uploadMultiple(_images: IMultipartFile[]): Promise<Response> {
    return null!;
  }
}

export const uploadService = new UploadService();
