import { KeyCodes } from "@opentui/core/testing";

/**
 * Key constants for use with {@link Input.pressKey}.
 *
 * Re-exports OpenTUI's `KeyCodes` (arrow keys, function keys, control codes,
 * etc.) and adds a `SPACE` alias so tests can write `keys.SPACE` instead of
 * the literal `" "`. Prefer these constants over raw escape sequences so
 * tests stay readable and tracked by the type system.
 *
 * @example
 * ```ts
 * await input.pressKey(keys.RETURN);
 * await input.pressKey(keys.SPACE);
 * ```
 */
export const keys = {
  ...KeyCodes,
  SPACE: " ",
} as const;

/**
 * Union of every value in {@link keys}. Use as the parameter type for helpers
 * that forward to `input.pressKey`.
 */
export type Key = (typeof keys)[keyof typeof keys];
