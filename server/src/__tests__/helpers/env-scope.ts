/**
 * Scoped process.env mutation — save, mutate, restore via try/finally.
 *
 * Use instead of bare `process.env.X = ...` inside `it()` bodies, which leaks
 * the mutation to subsequent tests when a body throws before its cleanup.
 * `withEnv` guarantees restoration even on thrown assertions.
 *
 * @example
 * await withEnv({ IRONWORKS_HOME: "/tmp/foo" }, async () => {
 *   const result = await functionUnderTest();
 *   expect(result).toBe(...);
 * });
 *
 * @example
 * // Explicit delete (env var absent during the block):
 * await withEnv({ IRONWORKS_HOME: undefined }, async () => { ... });
 */
export async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    originals[key] = process.env[key];
    const value = vars[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(vars)) {
      const original = originals[key];
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  }
}
