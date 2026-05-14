import type { MockInput } from "@opentui/core/testing";
import { act } from "react";

type AnyFn = (...args: unknown[]) => unknown;

type Asyncified<T> = {
  [K in keyof T]: T[K] extends AnyFn
    ? (...args: Parameters<T[K]>) => Promise<Awaited<ReturnType<T[K]>>>
    : T[K];
};

/**
 * The OpenTUI `MockInput`, with every function turned into an async wrapper
 * that runs the underlying call inside React `act()`.
 *
 * Every method returns a promise. Always `await` calls so React state updates
 * triggered by the keystroke flush before the next frame snapshot. Forgetting
 * `await` is the most common cause of a captured frame looking one keystroke
 * behind reality.
 *
 * Non-function fields on the original `MockInput` (if any) are passed through
 * unchanged.
 *
 * @example
 * ```ts
 * await input.pressArrow("down");
 * await input.typeText("hello");
 * await input.pressKey(keys.RETURN);
 * ```
 */
export type Input = Asyncified<MockInput>;

/**
 * Wrap a raw `MockInput` so that each method auto-flushes React updates via
 * `act()`.
 *
 * Iterates the input's own keys; functions are wrapped, other values are
 * passed through as-is. Used internally by {@link render}; call directly only
 * when you are managing an OpenTUI renderer outside of {@link render} and
 * want the same ergonomic behavior.
 *
 * @param mockInput - The raw `MockInput` from an OpenTUI test renderer.
 * @returns An {@link Input} mirroring `mockInput` with async, `act()`-wrapped methods.
 */
export function wrapInput(mockInput: MockInput): Input {
  const wrapped = {} as Record<string, unknown>;
  for (const key of Object.keys(mockInput) as Array<keyof MockInput>) {
    const original = mockInput[key];
    if (typeof original === "function") {
      wrapped[key as string] = async (...args: unknown[]) => {
        let result: unknown;
        await act(async () => {
          result = await (original as AnyFn).apply(mockInput, args);
        });
        return result;
      };
    } else {
      wrapped[key as string] = original;
    }
  }
  return wrapped as Input;
}
