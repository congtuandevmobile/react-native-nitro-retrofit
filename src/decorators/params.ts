/**
 * Parameter decorators: @Query, @Param, @Body, @Headers,
 *                       @Multipart, @Part, @QueriesMap, @StaticQuery,
 *                       @TransformParams, @TransformBody
 * Sole responsibility: write parameter-level metadata entries.
 */
import { getOrCreateMeta } from '../metadata/registry';
import { validateClassService, validateMethod } from '../metadata/validators';
import type { IRequestMeta, QueryPrimitive, TargetType } from '../types';

function asCtor(target: object): TargetType {
  if (typeof target === 'function') return target as TargetType;
  return (target as { constructor: TargetType }).constructor;
}

function withReq(
  target: object,
  methodName: string,
  cb: (req: IRequestMeta) => void
) {
  const ctor = asCtor(target);
  validateClassService(ctor);
  validateMethod(ctor, methodName);
  cb(getOrCreateMeta(ctor).requests![methodName]!);
}

// ─── Path & query ─────────────────────────────────────────────────────────────

export function Param(name: string, parameterIndex: number) {
  return (target: object, methodName: string) =>
    withReq(target, methodName, (req) => {
      req.params ??= {};
      req.params[name] = parameterIndex;
    });
}

export function Query(name: string, parameterIndex: number) {
  return (target: object, methodName: string) =>
    withReq(target, methodName, (req) => {
      req.queries ??= {};
      req.queries[name] = parameterIndex;
    });
}

export function StaticQuery<T extends QueryPrimitive>(name: string, value: T) {
  return (target: object, methodName: string) =>
    withReq(target, methodName, (req) => {
      req.staticQueries ??= {};
      req.staticQueries[name] = value;
    });
}

/**
 * Spread a plain object into the query string.
 * Type-safe: only `QueryMap` (Record<string, primitive>) is accepted.
 *
 * @example
 * @QueriesMap(0)
 * @GET('/search')
 * search(filters: QueryMap): Promise<Response> { return null! }
 */
export function QueriesMap(parameterIndex: number) {
  return (target: object, methodName: string) =>
    withReq(target, methodName, (req) => {
      req.queryMapIndex = parameterIndex;
    });
}

// ─── Body ────────────────────────────────────────────────────────────────────

export function Body(parameterIndex: number) {
  return (target: object, methodName: string) =>
    withReq(target, methodName, (req) => {
      req.body = parameterIndex;
    });
}

// ─── Headers ─────────────────────────────────────────────────────────────────

export function Headers(headers: Record<string, string>) {
  return (target: object, methodName: string) =>
    withReq(target, methodName, (req) => {
      req.headers = headers;
    });
}

// ─── Multipart / FormData ────────────────────────────────────────────────────

export function Multipart() {
  return (target: object, methodName: string) =>
    withReq(target, methodName, (req) => {
      req.isMultipart = true;
    });
}

export function Part(name: string, parameterIndex: number) {
  return (target: object, methodName: string) =>
    withReq(target, methodName, (req) => {
      req.parts ??= {};
      req.parts[name] = parameterIndex;
    });
}

// ─── Transformers ─────────────────────────────────────────────────────────────

export function TransformParams<TParams extends object, TReturn = object>(
  transformer: (params: TParams) => TReturn
) {
  return (target: object, methodName: string) =>
    withReq(target, methodName, (req) => {
      req.transformerParams = transformer as <P, R>(p: P) => R;
    });
}

export function TransformBody<TBody extends object, TReturn = object>(
  transformer: (body: TBody) => TReturn
) {
  return (target: object, methodName: string) =>
    withReq(target, methodName, (req) => {
      req.transformerBody = transformer as <B, R>(b: B) => R;
    });
}
