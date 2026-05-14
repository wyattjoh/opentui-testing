---
name: opentui-testing
description: Use whenever working with OpenTUI React apps that need tests or debugging. This is the source of truth for writing `bun test` suites with `@wyattjoh/opentui-testing`, capturing terminal frames, simulating keyboard input, snapshotting TUIs, and using captured frames to diagnose layout, focus, color, and state bugs in OpenTUI components. Apply whenever the user mentions opentui, TUI testing, `captureCharFrame`, `testRender`, terminal snapshot tests, debugging a TUI render, or wants to verify what a TUI looks like after some interaction. Prefer this over generic React testing advice (React Testing Library, Ink, jsdom) because OpenTUI runs against an in-process headless renderer with a different API.
---

# Testing and debugging OpenTUI React apps

`@wyattjoh/opentui-testing` is a small wrapper over `@opentui/react/test-utils`.
It adds React `act()` plumbing, an auto-flushed initial frame, a frame-quiescence
helper, an env-override hook, and an async-disposable cleanup hook. Tests run
under `bun test`. There is no virtual terminal and no PTY; the OpenTUI renderer
is in-process.

## Mental model

OpenTUI renders a scene graph to a character grid each frame. The test renderer
exposes that grid through `captureCharFrame()` (plain text) and `captureSpans()`
(per-cell color and attributes). Driving a frame is explicit: nothing renders
between input events unless you call `renderOnce()`, `flushFrames(n)`, or
`waitForFrame(predicate)`. React state updates frequently take several frames
to settle, so `captureCharFrame()` right after `await input.pressArrow(...)`
often shows the previous state. When in doubt, reach for `waitForFrame`.

Why this matters: most flaky-looking TUI tests come from snapshotting before
the scene has caught up with state. The fix is almost never `await sleep(...)`;
it is pumping more frames.

## Setup

The package is consumed as `@wyattjoh/opentui-testing`. Inside this repo, import
from `../src/index.ts` (see `tests/render.test.tsx`). In consumers, install via
the packed tarball described in the project `CLAUDE.md`, not `bun link`, to
avoid duplicating React.

A test file looks like this:

```tsx
import { describe, expect, test } from "bun:test";
import { render } from "@wyattjoh/opentui-testing";
import { App } from "./app.tsx";

describe("App", () => {
  test("first frame", async () => {
    await using app = await render(<App />);
    expect(app.captureCharFrame()).toMatchSnapshot();
  });
});
```

Name the binding after the root component being rendered (`<App />` → `app`,
`<Picker />` → `picker`, etc.) so destructured calls like
`app.captureCharFrame()` read naturally at the call site.

The renderer is an async disposable. `await using` calls
`app[Symbol.asyncDispose]()` at scope exit, which destroys the renderer
inside `act()` and restores any `env` overrides. Forget the `await using` and
the frame loop, timers, and stdin listeners stay alive across tests; the next
test may pass locally and fail in CI for reasons that have nothing to do with
the code.

If a test legitimately needs to dispose mid-scope (rare), call
`await app[Symbol.asyncDispose]()` directly.

## The API surface, in one place

`await render(<App />, options?)` returns:

| Name | Shape | When to reach for it |
| --- | --- | --- |
| `captureCharFrame()` | `() => string` | Snapshot or `toContain` assertions. The everyday workhorse. |
| `captureSpans()` | `() => CapturedFrame` | When you need fg/bg color or bold/underline state, not just glyphs. |
| `input` | wrapped `MockInput` | `pressKey`, `pressArrow`, `typeText`, etc. All async, all `act()`-wrapped. |
| `waitForFrame(predicate, opts?)` | drive frames until truthy | The default tool for async state. Use this before any post-interaction snapshot. |
| `flushFrames(n)` | pump exactly N frames | Animations, effect chains, or when `waitForFrame` is overkill. |
| `renderOnce()` | pump one frame, no `act()` | Rare. Prefer `flushFrames(1)`. |
| `renderer` | `TestRenderer` | Escape hatch for direct OpenTUI APIs. |
| `mockMouse` | `MockMouse` | Click and hover simulation, passed through from upstream. |
| `resize(w, h)` | `(number, number) => void` | Test responsive layouts. |
| `[Symbol.asyncDispose]()` | `() => Promise<void>` | Bound to the renderer; called automatically by `await using`. |

`render` options worth knowing:

- `width`, `height`: terminal size. Defaults `80 x 24`. Snapshots get noisier
  as size grows; shrink to the smallest box that exercises the layout.
- `env`: `Record<string, string | undefined>`. Mutates `process.env` for the
  test and restores on dispose. `undefined` means "unset". Only catches
  runtime reads; if the component reads env at module-load time, set it
  before the `import` of the component (top of file, before the import line).
- `cwd`: `string`. Calls `process.chdir()` for the renderer's lifetime and
  restores the prior directory on dispose. Same module-load caveat as `env`.
  Not realpath-normalized, so on macOS `/var/folders/...` tmpdirs resolve to
  `/private/var/folders/...` once applied; pre-resolve with `fs.realpathSync`
  if assertions compare the literal input string. `process.chdir` is
  process-global, so keep tests serial.
- Anything else from `TestRendererOptions` passes straight through.

`render` is the only top-level export worth pulling in for almost every
test. `flushFrames` and `waitForFrame` are not separate imports; reach for
`app.flushFrames(n)` and `app.waitForFrame(predicate, opts?)` on the result
of `render(...)`. Those are the bound forms; they already know about
`renderOnce` and `captureCharFrame`.

For key constants (arrows, function keys, control codes), import `KeyCodes`
from `@opentui/core/testing` directly — this package does not re-export it.
Single printable characters, including space, go through `pressKey(" ")`
as-is, so there is no `SPACE` alias to reach for.

## Writing a test

The four-line skeleton:

```tsx
await using app = await render(<App />);
// interact via `app.input`
// wait for state to settle via `app.waitForFrame`
expect(app.captureCharFrame()).toMatchSnapshot();
```

If you prefer destructured names, pull them off the disposable binding:

```tsx
await using app = await render(<App />);
const { input, captureCharFrame, waitForFrame } = app;
await input.typeText("hi");
await waitForFrame((frame) => frame.includes("hi"));
expect(captureCharFrame()).toMatchSnapshot();
```

Do not destructure inside the `await using` declaration itself. `await using`
binds the disposable to a single identifier; destructuring would drop the
`[Symbol.asyncDispose]` reference and the renderer would leak.

Reach for the right assertion shape:

- `toMatchSnapshot()` for whole-frame regression tests. Bun writes snapshots
  to `tests/__snapshots__/`. Review them by hand the first time; they are
  human-readable.
- `toContain("Count: 3")` for narrow assertions about a single field. More
  resilient to unrelated layout changes than snapshots.
- `captureSpans()` plus structural assertions when you care about color (for
  example, "the selected row is reverse-video"). Snapshots over `captureSpans()`
  are noisy; prefer targeted assertions.

### Keyboard

`input` mirrors `MockInput`. Real-world usage:

```tsx
import { KeyCodes } from "@opentui/core/testing";

await using app = await render(<App />);
await app.input.pressArrow("down");
await app.input.pressArrow("down");
await app.input.pressKey(KeyCodes.RETURN);
await app.input.typeText("hello world");
```

Every method is async. Awaiting matters: it is what lets the wrapped `act()`
flush React updates triggered by the keypress. Forgetting `await` is the most
common cause of "my snapshot is one keystroke behind".

After a burst of keys, the snapshot is rarely correct on the next line. Pump
until the expected state appears:

```tsx
await using app = await render(<App />);
const { input, captureCharFrame, waitForFrame } = app;

await input.pressArrow("up");
await input.pressArrow("up");
await input.pressArrow("up");
await waitForFrame((frame) => frame.includes("Count: 3"));
expect(captureCharFrame()).toMatchSnapshot();
```

`waitForFrame` defaults to a 1000ms / 240-frame ceiling. If a test legitimately
needs more, pass `{ timeoutMs, maxFrames }`. If it needs less, leave the
defaults; tightening them rarely catches real bugs and frequently introduces
flake.

### Env

`env` shines when the component branches on a flag:

```tsx
await using app = await render(<App />, {
  env: { FEATURE_FLAG: "1", DEBUG: undefined },
});
expect(app.captureCharFrame()).toContain("flag on");
```

If the flag is read at module import time (`const FLAG = process.env.FLAG;`
at the top of the file), `render`'s `env` is too late. Either refactor the
component to read at runtime, or set `process.env` before the `import` line
of the component-under-test and reset it in `afterEach`.

### Cwd

`cwd` is useful when the component-under-test resolves paths relative to the
process working directory:

```tsx
import { realpathSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixture = realpathSync(mkdtempSync(join(tmpdir(), "fixture-")));
await using app = await render(<App />, { cwd: fixture });
expect(app.captureCharFrame()).toContain(fixture);
```

Same module-load caveat as `env`: if `process.cwd()` is captured at import
time, `render`'s `cwd` is too late. Either refactor to read at runtime, or
`process.chdir(...)` before the `import` line of the component-under-test
and reset it in `afterEach`. `process.chdir` is process-global, so two
`render()` calls overlapping in time will race; keep tests serial when
using `cwd`. The path is not normalized with `realpath` before chdir; on
macOS, tmpdirs at `/var/folders/...` resolve to `/private/var/folders/...`
once applied, so pre-resolve with `fs.realpathSync` if assertions compare
against the literal input string (the example above does this).

### Mouse and resize

`mockMouse` and `resize` come straight from upstream. Useful for layout tests:

```tsx
await using app = await render(<App />, { width: 80, height: 24 });
const { resize, captureCharFrame, waitForFrame } = app;
resize(40, 12);
await waitForFrame((frame) => frame.split("\n").length <= 12);
expect(captureCharFrame()).toMatchSnapshot();
```

## Debugging a TUI with this package

The same renderer that powers tests is the fastest way to inspect a TUI by
hand. Spin up a one-off `bun test` file or a tiny script that drives the
component, then read the frame.

### Print the frame mid-test

When a test is failing in a way the snapshot doesn't make obvious, log the
frame at each step:

```tsx
await using app = await render(<App />);
console.log("after mount:\n" + app.captureCharFrame());
await app.input.typeText("hi");
await app.waitForFrame((frame) => frame.includes("hi"));
console.log("after type:\n" + app.captureCharFrame());
```

Run with `bun test path/to/file.test.tsx`. The character grid is plain text;
copy-paste it into your editor to inspect alignment, padding, border glyphs,
and overflow. Pair this with shrinking `width`/`height` to the smallest size
that reproduces the bug. A 30 x 6 frame is far easier to read than 80 x 24.

### When a frame looks empty or stale

The two usual causes:

1. **Not enough frames pumped.** `captureCharFrame()` returns the last
   rendered frame, not the latest React state. If the frame looks like the
   pre-interaction state, you forgot to `await waitForFrame(...)` (or the
   right number of `flushFrames(n)`).
2. **Effect hasn't scheduled state yet.** If a `useEffect` posts to a
   microtask, one `flushFrames(1)` may not be enough. Use `waitForFrame` with
   a predicate that names the post-effect state.

If `waitForFrame` throws, the error includes the last captured frame. Read it
before doing anything else; it usually reveals what state the component is
actually in.

### When colors or attributes are wrong

`captureCharFrame()` only shows glyphs. For color or attribute bugs (focus
ring not highlighting, dim text, wrong fg/bg), use `captureSpans()`:

```tsx
await using app = await render(<App />);
const frame = app.captureSpans();
// frame.lines[row].spans[col].fg, .bg, .attributes
```

Drive an isolated assertion (for example, "the cell at row 3 col 5 has fg
`#ff0000`"). Snapshotting the full span grid produces giant, fragile fixtures.

### When focus or input handling is broken

Mount the component, send a key, and check the frame for the focused
indicator. If the frame doesn't change, the component either (a) has no
focused child that consumed the key, or (b) consumed it but didn't trigger a
re-render. `captureCharFrame()` after `waitForFrame(predicate)` failing is a
strong signal you are in case (a). Verify by adding a temporary `useKeyboard`
log in the component, or by inspecting `renderer` directly via the escape
hatch.

### When layout collapses at small sizes

Resize and snapshot at each interesting breakpoint:

```tsx
for (const [w, h] of [[80, 24], [60, 20], [40, 12]]) {
  await using app = await render(<App />, { width: w, height: h });
  console.log(`${w}x${h}:\n` + app.captureCharFrame());
}
```

Each iteration of the loop has its own scope, so `await using` disposes the
previous renderer before the next mount.

Look for clipped borders, truncated text, and wrapping that breaks a flex
row. The cleanest fix is usually a `flexShrink`/`flexGrow` adjustment on the
offending `<box>`.

## Anti-patterns and pitfalls

- **Sleeping instead of pumping frames.** `await new Promise(r => setTimeout(r, 50))`
  works by accident in trivial cases and times out in CI. Always use
  `waitForFrame` or `flushFrames`.
- **Forgetting `await` on `input` calls.** The wrapper returns a promise so
  that `act()` can flush; not awaiting means the React update is in-flight
  when you snapshot.
- **Forgetting `await using`.** Without it the renderer is never disposed,
  the frame loop and stdin listeners stay alive, and the next test inherits
  them. A plain `const app = await render(...)` is almost always a bug.
- **Destructuring inside the `await using` declaration.** `await using { input } = await render(...)` is a syntax error today, but writing
  `await using app = await render(...)` and then re-binding to a fresh
  object also drops the disposable reference. Keep the disposable binding
  intact; destructure into separate `const`s afterwards.
- **Module-load env reads.** `env` in `render` cannot retroactively change a
  constant captured at import time. If you need that, refactor or hoist a
  `process.env.X =` before the `import`.
- **Snapshotting `captureSpans()` wholesale.** The structure is verbose and
  changes for unrelated reasons. Assert on the specific cells you care about.
- **Massive default canvas.** 80 x 24 is fine for the consumer; for a
  focused component test, smaller is sharper.
- **Importing across sibling repos.** This package's tests intentionally use
  small inline fixtures rather than importing from `agent-toolkit` or any
  other consumer. Mirror that in new tests in this repo.

## Reference cheat sheet

```tsx
import { describe, expect, test } from "bun:test";
import { render } from "@wyattjoh/opentui-testing";
import { KeyCodes } from "@opentui/core/testing";

await using app = await render(<App />, {
  width: 80,
  height: 24,
  env: { FEATURE_FLAG: "1", LEGACY: undefined },
  cwd: "/tmp/fixture",
});

const {
  input,
  captureCharFrame,
  captureSpans,
  waitForFrame,
  flushFrames,
  resize,
  mockMouse,
  renderer,
} = app;

await input.pressArrow("down");
await input.pressKey(KeyCodes.RETURN);
await input.pressKey(" "); // space — printable chars pass straight through
await input.typeText("hello");

await waitForFrame((frame) => frame.includes("hello"));
await flushFrames(3);

expect(captureCharFrame()).toMatchSnapshot();
expect(captureCharFrame()).toContain("Saved");
```

That is the whole working set. When a test genuinely needs something this
wrapper doesn't, reach for the underlying `@opentui/core/testing` and
`@opentui/react/test-utils` types by importing from those packages directly
(they're peer dependencies, so already installed); this package no longer
re-exports them.
