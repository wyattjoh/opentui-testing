# @wyattjoh/opentui-testing

Snapshot-friendly testing helpers for [OpenTUI](https://github.com/sst/opentui)
React apps run under `bun test`. A thin layer on top of `@opentui/react/test-utils`
that handles React `act()` wrapping, frame quiescence, env overrides, and
ergonomic cleanup.

## Install

```sh
bun add -D @wyattjoh/opentui-testing
```

Peer dependencies (you almost certainly already have these):

```sh
bun add @opentui/core @opentui/react react
```

## Usage

```tsx
import { describe, expect, test } from "bun:test";
import { render } from "@wyattjoh/opentui-testing";
import { App } from "./app.tsx";

describe("App", () => {
  test("captures state after interaction", async () => {
    const { input, captureCharFrame, waitForFrame, cleanup } = await render(<App />, {
      width: 80,
      height: 24,
      env: { FEATURE_FLAG: "1" },
    });

    await input.pressArrow("down");
    await input.pressArrow("down");
    await input.typeText("hello");
    await waitForFrame((frame) => frame.includes("hello"));

    expect(captureCharFrame()).toMatchSnapshot();

    await cleanup();
  });
});
```

## API

### `render(node, options?) => RenderResult`

Mounts a React `node` into an OpenTUI test renderer and drives one initial
frame so `captureCharFrame()` is ready synchronously.

Options:

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `width` | `number` | `80` | Terminal columns |
| `height` | `number` | `24` | Terminal rows |
| `env` | `Record<string, string \| undefined>` | `undefined` | Overrides `process.env.X` for the test; `undefined` unsets. Restored on `cleanup()`. Only catches runtime reads, not module-load reads. |
| ...rest | `TestRendererOptions` | | Anything `@opentui/core/testing#TestRendererOptions` accepts |

Returns:

| Field | Type | Notes |
| --- | --- | --- |
| `renderer` | `TestRenderer` | Underlying OpenTUI renderer |
| `input` | `Input` | Wrapped `MockInput` whose methods auto-wrap React state updates in `act()`. All methods are async — `await` them. |
| `captureCharFrame` | `() => string` | Plain-text grid for snapshots |
| `captureSpans` | `() => CapturedFrame` | Structured grid with fg/bg/attributes |
| `renderOnce` | `() => Promise<void>` | Drive a single frame (not act-wrapped) |
| `flushFrames` | `(n: number) => Promise<void>` | Drive N frames, each wrapped in `act()` |
| `waitForFrame` | `(predicate, opts?) => Promise<string>` | Pump frames until `predicate(captureCharFrame())` returns truthy or `timeoutMs`/`maxFrames` exceeded |
| `cleanup` | `() => Promise<void>` | Destroys renderer inside `act()` and restores any `env` overrides. Always call at the end of a test. |
| `mockMouse` | `MockMouse` | OpenTUI mouse simulator (passed through) |
| `resize` | `(w, h) => void` | OpenTUI resize (passed through) |

### `keys`

The upstream `KeyCodes` plus a `SPACE` alias for convenience.

### `waitForFrame(renderOnce, captureCharFrame, predicate, opts?)`

Standalone form for when you want to drive an existing renderer manually.

## What this is not

- Not a virtual terminal. For PTY-level end-to-end tests, see
  [`@microsoft/tui-test`](https://github.com/microsoft/tui-test).
- Not a custom matcher library. Bun's built-in `toMatchSnapshot()` against
  `captureCharFrame()` works fine.
- Not framework-agnostic. This is OpenTUI-React specific by design.

## License

MIT
