/**
 * Parameter extractors.
 * Sole responsibility: read runtime argument values using decorator-written
 * metadata and produce typed structures ready for the dispatcher.
 *
 * All functions accept `args: unknown[]` and use explicit type assertions
 * at the boundary — no `any` leaks into the rest of the codebase.
 */
import { getOrCreateMeta } from '../metadata/registry';
import type { IRequestConfig, IRequestMeta, QueryMap } from '../types';

// ─── Internal shorthand ───────────────────────────────────────────────────────

function getReq(ctor: Function, methodName: string): IRequestMeta {
  return getOrCreateMeta(ctor).requests![methodName]!;
}

// ─── Extractors ───────────────────────────────────────────────────────────────

export function extractPath(ctor: Function, methodName: string): string {
  const meta = getOrCreateMeta(ctor);
  const prefixUrl = meta.prefixUrl;
  const path = meta.requests?.[methodName]?.path;
  if (!path) return '';
  if (!prefixUrl) return path;
  return `${prefixUrl}/${path}`.replace('//', '/');
}

export function extractParams(
  ctor: Function,
  methodName: string,
  args: unknown[]
): Record<string, unknown> {
  const metaParams = getReq(ctor, methodName).params;
  if (!metaParams) return {};
  return Object.fromEntries(
    Object.entries(metaParams).map(([key, idx]) => [key, args[idx]])
  );
}

export function extractQueries(
  ctor: Function,
  methodName: string,
  args: unknown[]
): Record<string, unknown> {
  const req = getReq(ctor, methodName);
  const dynamic = Object.fromEntries(
    Object.entries(req.queries ?? {}).map(([key, idx]) => [key, args[idx]])
  );
  return { ...dynamic, ...(req.staticQueries ?? {}) };
}

export function extractBody(
  ctor: Function,
  methodName: string,
  args: unknown[]
): unknown {
  const bodyIdx = getReq(ctor, methodName).body;
  return typeof bodyIdx === 'number' ? args[bodyIdx] : undefined;
}

export function extractQueryMap(
  ctor: Function,
  methodName: string,
  args: unknown[]
): QueryMap | undefined {
  const idx = getReq(ctor, methodName).queryMapIndex;
  if (typeof idx !== 'number') return undefined;
  // Safe assertion: validated later in validateQueryMap (metadata/validators.ts)
  return args[idx] as QueryMap;
}

export function extractFormData(
  ctor: Function,
  methodName: string,
  args: unknown[]
): FormData | undefined {
  const req = getReq(ctor, methodName);
  if (!req.isMultipart || !req.parts) return undefined;

  const formData = new FormData();

  for (const [fieldName, idx] of Object.entries(req.parts)) {
    if (idx >= args.length) {
      throw new Error(
        `@Part "${fieldName}": argument index ${idx} is out of range ` +
          `(method has ${args.length} argument(s)).`
      );
    }

    const param = args[idx];

    if (Array.isArray(param)) {
      // Each element must be a valid FormData value (string | Blob | File)
      for (const el of param as (string | Blob)[]) {
        formData.append(fieldName, el);
      }
    } else {
      // @ts-expect-error — React Native FormData accepts { uri, name, type }; not in lib.dom types
      formData.append(fieldName, param);
    }
  }

  return formData;
}

// ─── Config builder ───────────────────────────────────────────────────────────

export function buildRequestConfig(
  ctor: Function,
  methodName: string,
  queries: Record<string, unknown>
): IRequestConfig {
  const meta = getOrCreateMeta(ctor);
  const req = getReq(ctor, methodName);
  return {
    baseURL: meta.baseUrl,
    params: queries,
    headers: req.headers,
  };
}
