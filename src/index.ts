/**
 * Snapshot-friendly testing helpers for OpenTUI React apps run under
 * `bun test`. A thin layer on top of `@opentui/react/test-utils` that handles
 * React `act()` wrapping, frame quiescence, env overrides, and ergonomic
 * cleanup.
 *
 * The public surface is intentionally narrow: {@link render} and the types
 * surfaced through its signature. The standalone helper forms (`flushFrames`,
 * `waitForFrame`, `wrapInput`, env/cwd helpers) live under `src/` and are
 * used internally; they are not part of the package's stable API. For key
 * constants, import `KeyCodes` from `@opentui/core/testing` directly.
 *
 * @packageDocumentation
 */

export { render, type RenderOptions, type RenderResult } from "./render.js";
export type { Input } from "./input.js";
export type { EnvOverrides } from "./env.js";
export type { WaitForFrameOptions } from "./wait.js";
