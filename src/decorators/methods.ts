/**
 * HTTP method decorators: @GET, @POST, @PUT, @DELETE
 * Sole responsibility: register the HTTP method + path in metadata and
 * replace the decorated method body with a handleRequest call.
 */
import { handleRequest } from '../core/dispatcher';
import {
  preprocessMethod,
  validateClassService,
  validateMethod,
} from '../metadata/validators';
import type { TargetType } from '../types';

function asCtor(target: object): TargetType {
  if (typeof target === 'function') return target as TargetType;
  return (target as { constructor: TargetType }).constructor;
}

function makeMethodDecorator(
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
) {
  return (path: string) =>
    (target: object, methodName: string, descriptor: PropertyDescriptor) => {
      const ctor = asCtor(target);
      validateClassService(ctor);
      validateMethod(ctor, methodName);
      preprocessMethod(ctor, path, methodName, httpMethod);
      descriptor.value = function (...args: unknown[]) {
        return handleRequest(ctor, methodName, args);
      };
    };
}

export const GET = makeMethodDecorator('GET');
export const POST = makeMethodDecorator('POST');
export const PUT = makeMethodDecorator('PUT');
export const PATCH = makeMethodDecorator('PATCH');
export const DELETE = makeMethodDecorator('DELETE');
