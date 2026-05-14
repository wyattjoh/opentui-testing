import type { MockInput, TestRenderer } from "@opentui/core/testing";
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
 * await input.pressKey(KeyCodes.RETURN); // import { KeyCodes } from "@opentui/core/testing"
 * ```
 */
export type Input = Asyncified<MockInput>;

// `CliRenderer` keeps its stdin parser private, but {@link wrapInput} needs to
// reach into it for the bare-Escape disambiguation case (see the comment on
// {@link flushPendingStdinInput}). These local types describe just the shape
// we actually touch so the cast is narrow and the failure mode (an upstream
// rename) is grep-able instead of silent.
type StdinParserInternals = {
  pendingSinceMs: number | null;
  flushTimeout: (nowMsValue?: number) => void;
};

type RendererInternals = {
  stdinParser?: StdinParserInternals;
  drainStdinParser?: () => void;
};

/**
 * If the renderer's `StdinParser` is sitting on a pending byte sequence,
 * commit it now and drain the resulting events into the renderer's key
 * dispatch path.
 *
 * This exists for one specific case: a bare Escape (``). The parser
 * can't tell that byte apart from the prefix of a CSI/SS3 sequence (e.g.
 * `[A` for arrow up), so it buffers it for ~20ms waiting for a
 * follow-up byte before the `armTimeouts` `setTimeout` flushes it as a
 * standalone Escape. `waitForFrame` loops at JS speed and routinely outruns
 * that window, so without an explicit flush the dispatched key event either
 * arrives too late to satisfy the predicate or fires outside React `act()`
 * and produces "update was not wrapped in act" warnings.
 *
 * Calling this after each input keystroke (inside the same `act()`) treats
 * every `await input.X(...)` as a discrete event boundary in legacy keyboard
 * mode. That matches the kitty-keyboard behavior most users expect from a
 * synchronous-feeling test API. The trade-off: `pressKey('')` followed
 * by `pressKey('a')` becomes Escape + 'a' instead of Alt+a; for Alt+key
 * chords, send both bytes in a single emit (e.g. `pressKey('a', { meta: true })`)
 * so the parser sees the prefix and the payload together.
 *
 * Reaches past the `private` type wall on `CliRenderer` because the upstream
 * renderer doesn't currently expose a public flush hook. If a future OpenTUI
 * release adds one, swap to it; if the private fields get renamed, this will
 * become a no-op (`pendingSinceMs` will be `undefined`, treated as null) and
 * tests that rely on bare Escape will start failing again — that's the
 * intended signal to refresh the cast.
 */
function flushPendingStdinInput(renderer: TestRenderer | undefined): void {
  if (!renderer) return;
  const internals = renderer as unknown as RendererInternals;
  const parser = internals.stdinParser;
  if (!parser || parser.pendingSinceMs === null) return;
  // Pass a far-future timestamp so the parser's "has `timeoutMs` elapsed?"
  // guard always resolves true and `tryForceFlush()` actually runs. The real
  // method signature accepts a current-time reading, not a duration.
  parser.flushTimeout(Number.MAX_SAFE_INTEGER);
  internals.drainStdinParser?.();
}

/**
 * Wrap a raw `MockInput` so that each method auto-flushes React updates via
 * `act()`.
 *
 * Iterates the input's own keys; functions are wrapped, other values are
 * passed through as-is. Used internally by {@link render}; call directly only
 * when you are managing an OpenTUI renderer outside of {@link render} and
 * want the same ergonomic behavior.
 *
 * Pass `renderer` so the wrapper can force-commit any pending stdin bytes
 * after each keystroke (see {@link flushPendingStdinInput}). Without it,
 * keystrokes whose byte representation is ambiguous on its own — most
 * notably a bare Escape in legacy keyboard mode — race the parser's 20ms
 * disambiguation timer.
 *
 * @param mockInput - The raw `MockInput` from an OpenTUI test renderer.
 * @param renderer - The matching `TestRenderer`. Optional for the free
 *   function form; {@link render} always passes it.
 * @returns An {@link Input} mirroring `mockInput` with async, `act()`-wrapped methods.
 */
export function wrapInput(mockInput: MockInput, renderer?: TestRenderer): Input {
  const wrapped = {} as Record<string, unknown>;
  for (const key of Object.keys(mockInput) as Array<keyof MockInput>) {
    const original = mockInput[key];
    if (typeof original === "function") {
      wrapped[key as string] = async (...args: unknown[]) => {
        let result: unknown;
        await act(async () => {
          result = await (original as AnyFn).apply(mockInput, args);
          flushPendingStdinInput(renderer);
        });
        return result;
      };
    } else {
      wrapped[key as string] = original;
    }
  }
  return wrapped as Input;
}
