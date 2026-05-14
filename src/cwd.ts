/**
 * Change `process.cwd()` and return a function that restores the previous
 * working directory.
 *
 * Snapshots `process.cwd()` before calling `process.chdir(cwd)`, so the
 * restore function returns the process to exactly the directory it was in
 * before. Only catches runtime reads of `process.cwd()`. Values captured at
 * module-load time will not see the override unless the chdir happened
 * before the module's `import` line ran.
 *
 * The input is not normalized with `realpath` before chdir, so on platforms
 * that reach the target through symlinks (e.g. macOS `/var/folders/...`
 * resolves to `/private/var/folders/...`), `process.cwd()` after the call
 * may differ from the literal input string. Pre-resolve with
 * `fs.realpathSync` if your assertions compare the literal string.
 *
 * `process.chdir` is process-global, so two `applyCwd` calls overlapping in
 * time will race and leave the directory in whatever state the last restore
 * happens to run in. Not safe for concurrent test renderers; keep tests
 * serial when using this.
 *
 * Typically called by {@link render} via its `cwd` option; use this
 * directly only when you are managing a renderer outside of {@link render}.
 *
 * @param cwd - Working directory to switch into for the renderer's lifetime.
 * @returns A function that restores `process.cwd()` to its pre-call state.
 */
export function applyCwd(cwd: string): () => void {
  const original = process.cwd();
  process.chdir(cwd);
  return () => {
    process.chdir(original);
  };
}
