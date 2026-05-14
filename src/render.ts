import { testRender } from "@opentui/react/test-utils";
import type { TestRendererOptions } from "@opentui/core/testing";
import { act, type ReactNode } from "react";

import { applyEnv, type EnvOverrides } from "./env.ts";
import { wrapInput, type Input } from "./input.ts";
import { flushFrames, waitForFrame, type WaitForFrameOptions } from "./wait.ts";

/**
 * Options accepted by {@link render}.
 *
 * Extends OpenTUI's `TestRendererOptions` (width, height, and other renderer
 * knobs) with an `env` override map specific to this wrapper.
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
 * Implements `AsyncDisposable`: use `await using rendered = await render(...)`
 * and the renderer is destroyed and any `env` overrides restored when the
 * binding goes out of scope.
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
};

const DEFAULT_OPTIONS: TestRendererOptions = {
  width: 80,
  height: 24,
};

/**
 * Mount a React node into an OpenTUI test renderer.
 *
 * Applies any `env` overrides, merges `options` over the default 80x24 canvas,
 * and drives one initial frame inside `act()` so `captureCharFrame()` is
 * ready to read synchronously after `await render(...)` resolves.
 *
 * The returned helpers (`input`, `flushFrames`, `waitForFrame`) are pre-bound
 * to this renderer so tests don't have to thread `renderOnce` and
 * `captureCharFrame` around. The result is an `AsyncDisposable`: use
 * `await using rendered = await render(...)` to destroy the renderer and
 * restore `env` overrides automatically when the binding leaves scope.
 *
 * @example
 * ```tsx
 * await using rendered = await render(<App />, {
 *   width: 80, height: 24, env: { FEATURE_FLAG: "1" },
 * });
 * await rendered.input.typeText("hello");
 * await rendered.waitForFrame((frame) => frame.includes("hello"));
 * expect(rendered.captureCharFrame()).toMatchSnapshot();
 * ```
 *
 * @param node - The React element to mount.
 * @param options - Renderer + env overrides. Defaults to 80x24 with no env changes.
 * @returns A {@link RenderResult} pre-bound to the new renderer.
 */
export async function render(node: ReactNode, options: RenderOptions = {}): Promise<RenderResult> {
  const { env, ...rendererOptions } = options;
  const restoreEnv = env ? applyEnv(env) : () => {};

  const merged: TestRendererOptions = { ...DEFAULT_OPTIONS, ...rendererOptions };
  const result = await testRender(node, merged);

  await act(async () => {
    await result.renderOnce();
  });

  const { mockInput: rawInput, ...rest } = result;
  return {
    ...rest,
    input: wrapInput(rawInput),
    flushFrames: (n: number) => flushFrames(result.renderOnce, n),
    waitForFrame: (predicate, waitOptions) =>
      waitForFrame(result.renderOnce, result.captureCharFrame, predicate, waitOptions),
    async [Symbol.asyncDispose]() {
      await act(async () => {
        result.renderer.destroy();
      });
      restoreEnv();
    },
  };
}
