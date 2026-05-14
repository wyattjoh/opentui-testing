# opentui-testing

Published as `@wyattjoh/opentui-testing`. A thin, snapshot-friendly testing
helper layer for OpenTUI React apps run under `bun test`.

## What this is

OpenTUI already ships official headless testing utilities at
`@opentui/core/testing` and `@opentui/react/test-utils`. Those give you
`createTestRenderer` / `testRender` plus `captureCharFrame`,
`captureSpans`, `mockInput.pressArrow`, `renderOnce`, and so on.

This package is a thin layer above that. It provides:

- `render(node, options?)` — `testRender` with sensible defaults (80x24)
  and built-in initial flush so the first frame is ready synchronously.
  Accepts an `env` map (`{ FOO: "bar", FEATURE: undefined }`) that mutates
  `process.env` before mount and restores prior values during `cleanup()`.
  `undefined` means "unset that variable for the duration of the test".
  Caveat: this only helps for runtime `process.env.X` reads. If the
  component-under-test reads env at module import time, set it before the
  `import` itself runs.
- `input` (returned from `render`) — a wrapped `MockInput` whose methods
  (`pressKey`, `pressArrow`, `typeText`, etc.) auto-flush React updates
  inside `act()` so tests don't emit stray warnings. All methods return
  promises; `await` them.
- `cleanup()` (returned from `render`) — destroys the renderer inside
  `act()`. Always call at the end of a test.
- `keys` — the upstream `KeyCodes` plus a `space` alias.
- `flushFrames(renderOnce, n)` — drive N frames manually, wrapped in `act()`.
- `waitForFrame(renderOnce, captureCharFrame, predicate, opts)` — drive
  frames until `predicate(captureCharFrame())` returns truthy or a timeout
  elapses. The wrapper bound to the renderer is also returned from
  `render()` as `waitForFrame(predicate, opts)`. Most tests need this
  because `renderOnce()` is one frame and React state updates often need
  several to settle.

That is the whole surface. The wrapper deliberately stays small so the
upstream `@opentui/react/test-utils` API stays the source of truth.

## Versioning

Peer-deps target `@opentui/core` and `@opentui/react` `^0.2.7`. Bump in
lockstep with consumers; if the upstream test-utils signature changes
across a minor version, pin tighter.

## Conventions

- Bun + TypeScript, no build step. Consumers import from `./src/index.ts`
  via the `exports` map; this is a source-only package.
- React JSX via `jsxImportSource: "@opentui/react"`, matching the
  primary consumer (`agent-toolkit`).
- Tests live in `tests/`. Smoke test uses a small fixture component that
  mirrors the `<box>`/`<text>` patterns the consumer uses; do not import
  from sibling repos.
- No em dashes anywhere in code, docs, or commit messages.

## Linking during development

Consume the package as a packed tarball, not via `bun link` or
`file:source`. The tarball mirrors the published install exactly, so
peer deps resolve through the consumer's React/OpenTUI install instead
of spawning a second copy in this package's `node_modules`.

```
cd ~/Code/github.com/wyattjoh/opentui-testing && bun pm pack
cd ~/Code/github.com/wyattjoh/agent-toolkit/cli
# In cli/package.json:
#   "@wyattjoh/opentui-testing": "file:../../opentui-testing/wyattjoh-opentui-testing-0.1.0.tgz"
bun install --force
```

The tarball is gitignored. After any change in `src/`, repack and reinstall.
Don't use `bun link` for this consumer: linking carries this package's own
`node_modules/react` along, causing the "Invalid hook call / two React
copies" error.

## Anti-scope

- Do not build a virtual terminal. OpenTUI's testing mode already
  bypasses the ANSI write path.
- Do not build a PTY harness. The renderer is in-process by design.
- Do not write custom matchers until a real test needs one. Bun's
  built-in `toMatchSnapshot()` against `captureCharFrame()` is the
  baseline; only extend if a frame-comparison gap shows up.
