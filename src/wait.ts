import { act } from "react";

/**
 * Options for {@link waitForFrame}.
 */
export interface WaitForFrameOptions {
  /**
   * Wall-clock budget before {@link waitForFrame} gives up and throws.
   * Defaults to `1000`. Loosen this when a test legitimately needs more time
   * (animations, debounce, real async work). Tightening it rarely catches
   * real bugs and frequently introduces flake.
   */
  timeoutMs?: number;
  /**
   * Maximum number of frames to pump before giving up. Defaults to `240`.
   * Acts as a belt-and-braces guard against runaway loops in tests where the
   * predicate accidentally pins itself to `false`.
   */
  maxFrames?: number;
}

/**
 * Drive a single render frame.
 *
 * Matches the upstream `renderOnce` signature from `@opentui/react/test-utils`.
 * In this package, {@link RenderResult.flushFrames} and
 * {@link RenderResult.waitForFrame} wrap this in React `act()` for you;
 * reach for the bare form only when integrating with an externally-managed
 * renderer.
 */
export type RenderOnce = () => Promise<void>;

/**
 * Capture the most recently rendered frame as plain text.
 *
 * Matches the upstream `captureCharFrame` from `@opentui/react/test-utils`.
 * Returns a newline-joined string of the character grid; the last frame
 * rendered, not the latest React state. Pump frames first if state has
 * changed since the last render.
 */
export type CaptureCharFrame = () => string;

async function pumpFrame(renderOnce: RenderOnce): Promise<void> {
  await act(async () => {
    await renderOnce();
  });
}

/**
 * Drive exactly `n` render frames, each wrapped in React `act()` so queued
 * state updates flush before the next frame.
 *
 * Use this when you know how many frames a behavior takes (animations,
 * effect chains). When you only know what the end state should look like,
 * prefer {@link waitForFrame}.
 *
 * @param renderOnce - The renderer's `renderOnce` function.
 * @param n - Number of frames to drive. Non-positive values are no-ops.
 */
export async function flushFrames(renderOnce: RenderOnce, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await pumpFrame(renderOnce);
  }
}

/**
 * Pump render frames until `predicate` returns truthy against the current
 * character frame, or the timeout or frame budget is exhausted.
 *
 * This is the everyday tool for asserting against post-interaction state.
 * `captureCharFrame()` immediately after `await input.pressX(...)` often
 * reflects the previous state because React updates can take multiple frames
 * to settle; `waitForFrame` removes that race.
 *
 * On timeout, throws an `Error` whose message includes the last captured
 * frame. Read that frame before doing anything else; it usually reveals
 * what state the component is actually in.
 *
 * @param renderOnce - The renderer's `renderOnce` function.
 * @param captureCharFrame - The renderer's `captureCharFrame` function.
 * @param predicate - Returns truthy once the desired state is on-screen.
 * @param options - Optional limits; see {@link WaitForFrameOptions}.
 * @returns The frame that satisfied the predicate.
 * @throws If neither the timeout nor frame budget yields a matching frame.
 */
export async function waitForFrame(
  renderOnce: RenderOnce,
  captureCharFrame: CaptureCharFrame,
  predicate: (frame: string) => boolean,
  options: WaitForFrameOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 1000;
  const maxFrames = options.maxFrames ?? 240;
  const deadline = Date.now() + timeoutMs;

  let frame = captureCharFrame();
  if (predicate(frame)) return frame;

  for (let i = 0; i < maxFrames; i++) {
    if (Date.now() > deadline) break;
    await pumpFrame(renderOnce);
    frame = captureCharFrame();
    if (predicate(frame)) return frame;
  }

  throw new Error(
    `waitForFrame: predicate did not match within ${timeoutMs}ms / ${maxFrames} frames. Last frame:\n${frame}`,
  );
}
