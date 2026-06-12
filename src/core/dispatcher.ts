/**
 * Request dispatcher.
 * Sole responsibility: resolve the correct builder and call the right HTTP method.
 * No knowledge of parameter extraction or metadata storage.
 */
import { getBuilder, getOrCreateMeta } from '../metadata/registry';
import { validateQueryMap } from '../metadata/validators';
import {
  buildRequestConfig,
  extractBody,
  extractFormData,
  extractParams,
  extractPath,
  extractQueries,
  extractQueryMap,
} from './extractors';

export function handleRequest(
  ctor: Function,
  methodName: string,
  args: unknown[]
): Promise<Response> {
  const req = getOrCreateMeta(ctor).requests![methodName]!;

  // ── Path ──────────────────────────────────────────────────────────────────
  let path = extractPath(ctor, methodName);
  const params = extractParams(ctor, methodName, args);
  for (const key in params) {
    path = path.replace(`/:${key}`, `/${String(params[key])}`);
  }

  // ── Query params ──────────────────────────────────────────────────────────
  const rawQueryMap = extractQueryMap(ctor, methodName, args);
  validateQueryMap(rawQueryMap);

  let queries: Record<string, unknown> = {
    ...extractQueries(ctor, methodName, args),
    ...(rawQueryMap ?? {}),
  };
  if (req.transformerParams)
    queries = req.transformerParams(queries) as Record<string, unknown>;

  // ── Config ────────────────────────────────────────────────────────────────
  const config = buildRequestConfig(ctor, methodName, queries);

  // ── Dispatch ──────────────────────────────────────────────────────────────
  const builder = getBuilder(ctor);

  switch (req.method) {
    case 'GET':
      return builder.get(path, config);

    case 'DELETE':
      return builder.delete(path, config);

    case 'POST': {
      if (req.isMultipart) {
        return builder.postForm(
          path,
          extractFormData(ctor, methodName, args),
          config
        );
      }
      let body = extractBody(ctor, methodName, args);
      if (body !== undefined && req.transformerBody)
        body = req.transformerBody(body);
      return builder.post(path, body, config);
    }

    case 'PUT': {
      if (req.isMultipart) {
        return builder.putForm(
          path,
          extractFormData(ctor, methodName, args),
          config
        );
      }
      let body = extractBody(ctor, methodName, args);
      if (body !== undefined && req.transformerBody)
        body = req.transformerBody(body);
      return builder.put(path, body, config);
    }

    case 'PATCH': {
      if (req.isMultipart) {
        return builder.patchForm(
          path,
          extractFormData(ctor, methodName, args),
          config
        );
      }
      let body = extractBody(ctor, methodName, args);
      if (body !== undefined && req.transformerBody)
        body = req.transformerBody(body);
      return builder.patch(path, body, config);
    }
  }

  throw new Error(`[nitro-retrofit] Unhandled HTTP method: ${req.method}`);
}
