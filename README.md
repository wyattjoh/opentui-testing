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

## Agent testing skill

This repo also ships a Claude Code plugin (`.claude-plugin/plugin.json`)
that bundles an agent testing skill (`skills/opentui-testing/`). The
skill teaches the agent how to write `bun test` suites against OpenTUI
React apps with this package: frame quiescence, keyboard input, `env` /
`cwd` overrides, snapshot recipes, and common debugging flows. Install
it through Claude Code's plugin marketplace:

```text
/plugin marketplace add wyattjoh/claude-code-marketplace
/plugin install opentui-testing@wyattjoh-marketplace
```

The plugin and skill are source-controlled alongside the package so the
two stay in lockstep across releases.

## Usage

```tsx
import { describe, expect, test } from "bun:test";
import { render } from "@wyattjoh/opentui-testing";
import { App } from "./app.tsx";

describe("App", () => {
  test("captures state after interaction", async () => {
    await using app = await render(<App />, {
      width: 80,
      height: 24,
      env: { FEATURE_FLAG: "1" },
      cwd: "/tmp/fixture",
    });
    const { input, captureCharFrame, waitForFrame } = app;

    await input.pressArrow("down");
    await input.pressArrow("down");
    await input.typeText("hello");
    await waitForFrame((frame) => frame.includes("hello"));

    expect(captureCharFrame()).toMatchSnapshot();
  });
});
```

`render` returns an `AsyncDisposable`. `await using` calls
`[Symbol.asyncDispose]()` when the binding leaves scope, which destroys the
renderer inside `act()` and restores any `env` / `cwd` overrides. To dispose
manually (e.g. from an `afterEach` hook, or in environments without `await
using`), call `await app.cleanup()`. Both forms are idempotent.

## API

### `render(node, options?) => RenderResult`

Mounts a React `node` into an OpenTUI test renderer and drives one initial
frame so `captureCharFrame()` is ready synchronously.

Options:

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `width` | `number` | `80` | Terminal columns |
| `height` | `number` | `24` | Terminal rows |
| `env` | `Record<string, string \| undefined>` | `undefined` | Overrides `process.env.X` for the test; `undefined` unsets. Restored on dispose. Only catches runtime reads, not module-load reads. |
| `cwd` | `string` | `undefined` | `process.chdir()` for the renderer's lifetime; restored on dispose. Only catches runtime reads of `process.cwd()`. Not realpath-normalized (macOS tmpdirs resolve through `/private`). `process.chdir` is process-global, so keep tests serial. |
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
| `cleanup` | `() => Promise<void>` | Destroys renderer inside `act()` and restores any `env` / `cwd` overrides. Idempotent. Use this in `afterEach` or when `await using` isn't available. |
| `[Symbol.asyncDispose]` | `() => Promise<void>` | Same callback as `cleanup`; called automatically by `await using`. |
| `mockMouse` | `MockMouse` | OpenTUI mouse simulator (passed through) |
| `resize` | `(w, h) => void` | OpenTUI resize (passed through) |

### Key constants

There is no `keys` export. Import `KeyCodes` from `@opentui/core/testing`
directly:

```tsx
import { KeyCodes } from "@opentui/core/testing";

await app.input.pressKey(KeyCodes.RETURN);
await app.input.pressKey(" "); // space
```

Single printable characters (including space) can go through `pressKey`
as-is; reach for `KeyCodes` for control codes and CSI/SS3 sequences
(arrows, function keys, etc.).

## What this is not

- Not a virtual terminal. For PTY-level end-to-end tests, see
  [`@microsoft/tui-test`](https://github.com/microsoft/tui-test).
- Not a custom matcher library. Bun's built-in `toMatchSnapshot()` against
  `captureCharFrame()` works fine.
- Not framework-agnostic. This is OpenTUI-React specific by design.

## License

MIT
