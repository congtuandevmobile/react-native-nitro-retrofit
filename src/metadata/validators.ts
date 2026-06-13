/**
 * Metadata validators and initializers.
 * Sole responsibility: ensure metadata entries exist and reject invalid inputs
 * as early as possible (decorator time or dispatch time).
 */
import { getOrCreateMeta } from './registry';
import type { IMethod, QueryMap } from '../types';

// ─── Initialization helpers (used by decorators) ──────────────────────────────

export function validateClassService(ctor: Function): void {
  const meta = getOrCreateMeta(ctor);
  meta.requests ??= {};
}

export function validateMethod(ctor: Function, methodName: string): void {
  const meta = getOrCreateMeta(ctor);
  meta.requests ??= {};
  meta.requests[methodName] ??= {};
}

export function preprocessMethod(
  ctor: Function,
  path: string,
  methodName: string,
  method: IMethod
): void {
  const req = getOrCreateMeta(ctor).requests![methodName]!;
  req.method = method;
  req.path = path;
}

// ─── Runtime validators (used by dispatcher) ──────────────────────────────────

/**
 * Validate the value passed to @QueriesMap at request dispatch time.
 * TypeScript already enforces `QueryMap` at compile time; this guard defends
 * against plain-JS callers and catches subtle runtime mistakes.
 */
export function validateQueryMap(
  queryMap: unknown
): asserts queryMap is QueryMap {
  if (queryMap === undefined) return;

  if (
    typeof queryMap !== 'object' ||
    Array.isArray(queryMap) ||
    queryMap === null
  ) {
    throw new Error(
      `@QueriesMap: expected a plain object but received ` +
        `${Array.isArray(queryMap) ? 'an array' : typeof queryMap}. ` +
        `Pass an object like { page: 1, limit: 10 }.`
    );
  }

  for (const key of Object.keys(queryMap)) {
    const val = (queryMap as Record<string, unknown>)[key];
    if (val !== null && val !== undefined && typeof val === 'object') {
      throw new Error(
        `@QueriesMap: value for key "${key}" must be a primitive ` +
          `(string | number | boolean | null) — got ${typeof val}.`
      );
    }
  }
}
