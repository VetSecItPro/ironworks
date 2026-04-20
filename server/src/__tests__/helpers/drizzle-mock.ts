import { vi } from "vitest";

/**
 * Mock Drizzle DB client that supports the full fluent chain used across route
 * tests: `db.select().from().where().limit().then(cb)` or `.update().set().where()`.
 *
 * The `.then` property makes the chainable a JavaScript thenable — awaiting it
 * resolves with the `rows` payload. Callers may pass a custom `rows` value (or
 * a factory) to vary what `.then` yields per test.
 *
 * Returns a fresh chainable object on every call so tests can safely mutate
 * return values per-test without polluting siblings. All method mocks have
 * `.mockReturnValue(chain)` set up so fluent calls keep chaining back to
 * the same chainable.
 *
 * @param rows  Rows returned by `.then(cb)` (default `[]`). May be a function
 *              `() => rows` to regenerate per call — useful for tests that
 *              need different data across multiple awaits on the same chain.
 */
export function makeChainableDb<T = unknown>(rows: T[] | (() => T[]) = []): Record<string, ReturnType<typeof vi.fn>> {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  // Standard drizzle fluent methods
  for (const method of [
    "select",
    "from",
    "where",
    "leftJoin",
    "rightJoin",
    "innerJoin",
    "orderBy",
    "groupBy",
    "limit",
    "offset",
    "update",
    "set",
    "insert",
    "values",
    "onConflictDoNothing",
    "onConflictDoUpdate",
    "returning",
    "delete",
    "execute",
  ]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // Thenable contract — callers do `await db.select()...` or explicit `.then(cb)`
  // biome-ignore lint/suspicious/noThenProperty: test mock drizzle thenable contract
  chain.then = vi.fn().mockImplementation((resolve: (value: T[]) => unknown) => {
    const value = typeof rows === "function" ? (rows as () => T[])() : rows;
    return resolve(value);
  });
  return chain;
}
