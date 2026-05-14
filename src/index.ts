/**
 * Snapshot-friendly testing helpers for OpenTUI React apps run under
 * `bun test`. A thin layer on top of `@opentui/react/test-utils` that handles
 * React `act()` wrapping, frame quiescence, env overrides, and ergonomic
 * cleanup.
 *
 * Start with {@link render}. The other exports are useful when integrating
 * with an externally-managed renderer or composing custom helpers.
 *
 * @packageDocumentation
 */

export { render, type RenderOptions, type RenderResult } from "./render.ts";
export { keys, type Key } from "./keys.ts";
export { flushFrames, waitForFrame, type WaitForFrameOptions } from "./wait.ts";
export { wrapInput, type Input } from "./input.ts";
export { applyEnv, type EnvOverrides } from "./env.ts";

/**
 * Upstream OpenTUI testing types re-exported for convenience so consumers
 * don't have to depend on `@opentui/core/testing` directly to type a
 * renderer or input reference.
 */
export type {
  TestRenderer,
  TestRendererOptions,
  MockInput,
  MockMouse,
} from "@opentui/core/testing";

/**
 * Upstream OpenTUI frame-capture types re-exported for convenience. Returned
 * by `captureSpans()` on a {@link RenderResult}; useful when asserting on
 * color or attribute state rather than glyphs.
 */
export type { CapturedFrame, CapturedLine, CapturedSpan } from "@opentui/core";
