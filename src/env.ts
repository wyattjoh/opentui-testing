/**
 * Map of environment variable names to override values.
 *
 * A `string` value sets the variable. An `undefined` value means "unset that
 * variable for the duration of the test". Variables not listed are left alone.
 */
export type EnvOverrides = Record<string, string | undefined>;

/**
 * Apply a set of `process.env` overrides and return a function that restores
 * the previous state.
 *
 * Snapshots the prior value of each named key (including its absence) before
 * mutating `process.env`, so the restore function returns the environment to
 * exactly what it was before. Only catches runtime reads of `process.env.X`.
 * Constants captured at module-load time will not see the override unless the
 * variable was set before the module's `import` line ran.
 *
 * Typically called by {@link render} via its `env` option; use this directly
 * only when you are managing a renderer outside of {@link render}.
 *
 * @param env - Map of variable names to override values. `undefined` unsets.
 * @returns A function that restores `process.env` to its pre-call state.
 */
export function applyEnv(env: EnvOverrides): () => void {
  const original: EnvOverrides = {};
  for (const key of Object.keys(env)) {
    original[key] = process.env[key];
    const value = env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const key of Object.keys(original)) {
      const prev = original[key];
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    }
  };
}
