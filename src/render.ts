import { testRender } from "@opentui/react/test-utils";
import type { TestRendererOptions } from "@opentui/core/testing";
import { act, type ReactNode } from "react";

import { applyCwd } from "./cwd.js";
import { applyEnv, type EnvOverrides } from "./env.js";
import { wrapInput, type Input } from "./input.js";
import { flushFrames, waitForFrame, type WaitForFrameOptions } from "./wait.js";

/**
 * Options accepted by {@link render}.
 *
 * Extends OpenTUI's `TestRendererOptions` (width, height, and other renderer
 * knobs) with `env` and `cwd` overrides specific to this wrapper.
 */
export interface RenderOptions extends Partial<TestRendererOptions> {
  /**
   * `process.env` overrides applied before mounting the component and
   * restored on dispose. A `string` value sets the variable, `undefined`
   * unsets it for the duration of the test.
   *
   * Only catches runtime reads of `process.env.X`. Constants captured at
   * module-load time won't see the override; for those, set `process.env`
   * before the `import` of the component-under-test runs.
   */
  env?: EnvOverrides;
  /**
   * Working directory applied via `process.chdir()` before mounting the
   * component and restored on dispose. Useful when the component-under-test
   * resolves paths relative to `process.cwd()`.
   *
   * Only catches runtime reads of `process.cwd()`. Values captured at
   * module-load time won't see the override; for those, chdir before the
   * `import` of the component-under-test runs. The upstream `testRender`
   * does not expose a CWD knob, so this is implemented as a process-wide
   * chdir scoped to the renderer's lifetime.
   *
   * The path is not normalized with `realpath` before chdir; on macOS a
   * tmpdir at `/var/folders/...` resolves to `/private/var/folders/...`
   * once applied. Pre-resolve with `fs.realpathSync` if your tests compare
   * `process.cwd()` against the literal input string. Because chdir is
   * process-global, concurrent `render()` calls with different `cwd`
   * values will race; keep tests serial.
   */
  cwd?: string;
}

type UpstreamRender = Awaited<ReturnType<typeof testRender>>;

/**
 * Object returned by {@link render}.
 *
 * Mirrors the upstream `testRender` result with two differences: the raw
 * `mockInput` is replaced with an `act()`-wrapped {@link Input}, and helper
 * methods (`flushFrames`, `waitForFrame`) are bound to this renderer so call
 * sites don't have to thread `renderOnce` and `captureCharFrame` through
 * manually.
 *
 * Implements `AsyncDisposable`: use
 * `await using app = await render(<App />, ...)` (name the binding after the
 * root component being rendered) and the renderer is destroyed and any `env`
 * / `cwd` overrides restored when the binding goes out of scope. For
 * environments that don't support `await using`, call
 * {@link RenderResult.cleanup} explicitly instead.
 */
export type RenderResult = Omit<UpstreamRender, "mockInput"> & AsyncDisposable & {
  /**
   * `MockInput` whose methods auto-flush React updates inside `act()`. All
   * methods are async. See {@link Input}.
   */
  input: Input;
  /**
   * Drive exactly `n` render frames, each wrapped in `act()`. Use when you
   * know how many frames a behavior takes; otherwise prefer `waitForFrame`.
   */
  flushFrames: (n: number) => Promise<void>;
  /**
   * Pump frames until `predicate(captureCharFrame())` returns truthy or the
   * timeout / frame budget is exhausted. The default tool for asserting on
   * post-interaction state. See {@link WaitForFrameOptions}. Throws with the
   * last captured frame on timeout.
   */
  waitForFrame: (
    predicate: (frame: string) => boolean,
    options?: WaitForFrameOptions,
  ) => Promise<string>;
  /**
   * Destroy the renderer inside `act()` and restore any `env` / `cwd`
   * overrides. Equivalent to `[Symbol.asyncDispose]()`; provided as a named
   * method for `afterEach` hooks or environments where `await using` is not
   * available. Safe to call multiple times — subsequent calls are no-ops.
   */
  cleanup: () => Promise<void>;
};

const DEFAULT_OPTIONS: TestRendererOptions = {
  width: 80,
  height: 24,
};

/**
 * Mount a React node into an OpenTUI test renderer.
 *
 * Applies any `env` and `cwd` overrides, merges `options` over the default
 * 80x24 canvas, and drives one initial frame inside `act()` so
 * `captureCharFrame()` is ready to read synchronously after `await render(...)`
 * resolves.
 *
 * The returned helpers (`input`, `flushFrames`, `waitForFrame`) are pre-bound
 * to this renderer so tests don't have to thread `renderOnce` and
 * `captureCharFrame` around. The result is an `AsyncDisposable`: use
 * `await using app = await render(<App />, ...)` (name the binding after the
 * root component being rendered) to destroy the renderer and restore `env` /
 * `cwd` overrides automatically when the binding leaves scope.
 *
 * @example
 * ```tsx
 * await using app = await render(<App />, {
 *   width: 80, height: 24, env: { FEATURE_FLAG: "1" }, cwd: "/tmp/fixture",
 * });
 * await app.input.typeText("hello");
 * await app.waitForFrame((frame) => frame.includes("hello"));
 * expect(app.captureCharFrame()).toMatchSnapshot();
 * ```
 *
 * @param node - The React element to mount.
 * @param options - Renderer + env overrides. Defaults to 80x24 with no env changes.
 * @returns A {@link RenderResult} pre-bound to the new renderer.
 */
export async function render(node: ReactNode, options: RenderOptions = {}): Promise<RenderResult> {
  const { env, cwd, ...rendererOptions } = options;
  let restoreEnv: () => void = () => {};
  let restoreCwd: () => void = () => {};

  try {
    if (env) restoreEnv = applyEnv(env);
    if (cwd !== undefined) restoreCwd = applyCwd(cwd);

    const merged: TestRendererOptions = { ...DEFAULT_OPTIONS, ...rendererOptions };
    const result = await testRender(node, merged);

    await act(async () => {
      await result.renderOnce();
    });

    let disposed = false;
    const cleanup = async (): Promise<void> => {
      if (disposed) return;
      disposed = true;
      await act(async () => {
        result.renderer.destroy();
      });
      // LIFO: cwd was applied after env, so restore it first.
      restoreCwd();
      restoreEnv();
    };

    const { mockInput: rawInput, ...rest } = result;
    return {
      ...rest,
      input: wrapInput(rawInput, result.renderer),
      flushFrames: (n: number) => flushFrames(result.renderOnce, n),
      waitForFrame: (predicate, waitOptions) =>
        waitForFrame(result.renderOnce, result.captureCharFrame, predicate, waitOptions),
      cleanup,
      [Symbol.asyncDispose]: cleanup,
    };
  } catch (err) {
    // Mount failed after env/cwd were applied. Restore process-global state
    // before propagating so subsequent tests in the worker aren't poisoned.
    restoreCwd();
    restoreEnv();
    throw err;
  }
}
