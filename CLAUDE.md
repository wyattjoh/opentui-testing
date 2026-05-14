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
  `process.env` before mount and restores prior values on dispose.
  `undefined` means "unset that variable for the duration of the test".
  Caveat: this only helps for runtime `process.env.X` reads. If the
  component-under-test reads env at module import time, set it before the
  `import` itself runs. Also accepts a `cwd` string that calls
  `process.chdir()` for the renderer's lifetime and restores the prior
  directory on dispose; same module-load caveat applies. `cwd` is not
  realpath-normalized (on macOS, `/var/folders/...` tmpdirs resolve to
  `/private/var/folders/...`), and `process.chdir` is process-global, so
  keep tests serial when relying on it.
- `input` (returned from `render`) — a wrapped `MockInput` whose methods
  (`pressKey`, `pressArrow`, `typeText`, etc.) auto-flush React updates
  inside `act()` so tests don't emit stray warnings. All methods return
  promises; `await` them.
- `cleanup()` (returned from `render`) — destroys the renderer inside
  `act()` and restores any `env` / `cwd` overrides. Idempotent. Prefer
  `await using app = await render(<App />, ...)` in tests (name the
  binding after the root component being rendered); reach for
  `cleanup()` directly only when an `afterEach` hook owns disposal or
  the runtime doesn't support `await using`. `[Symbol.asyncDispose]` is
  bound to the same callback.
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

- Bun + TypeScript in development; published as compiled JS in `dist/`.
  Source lives in `src/` and uses canonical `./foo.js` imports so the
  same paths work in dev (Bundler resolution) and after `tsc` emit.
- The published `exports` map points at `./dist/index.js` (+ `.d.ts`).
  Consumers never import from `src/`; only `dist/`, `README.md`, and
  `LICENSE` ship in the tarball.
- React JSX via `jsxImportSource: "@opentui/react"`, matching the
  primary consumer (`agent-toolkit`).
- Tests live in `tests/`. Smoke test uses a small fixture component that
  mirrors the `<box>`/`<text>` patterns the consumer uses; do not import
  from sibling repos. Tests still import the source via
  `../src/index.js` so they exercise the un-emitted code.
- No em dashes anywhere in code, docs, or commit messages.

## Build

- `bun run build` runs `tsc -p tsconfig.build.json` after a clean, emitting
  `.js` + `.d.ts` (with sourcemaps and declaration maps) into `dist/`.
- `prepack` is wired to `bun run build`, so `bun pm pack` and `npm publish`
  always ship a fresh build; no need to remember to run it manually.
- `bun run check` keeps using `tsc --noEmit` against the main `tsconfig.json`
  for development typechecking.
- `tsconfig.build.json` switches `module`/`moduleResolution` to `NodeNext`,
  turns on declaration + sourcemap emit, sets `rootDir: ./src`, and
  excludes `tests/`. The base config keeps `moduleResolution: Bundler`
  for dev so the same `.ts` files load under Bun without rewriting.
- `engines.node` is `>=24.0.0` and `engines.bun` is `>=1.2.0`. Node 24
  is the first release where `await using` works unflagged; Bun has
  supported explicit resource management since well before 1.2. Both
  fields are advisory under npm (warnings, not errors) but document the
  intended floor so consumers don't try to use `await using` on a
  runtime that won't parse it.

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

`bun pm pack` triggers `prepack`, which runs `bun run build` and writes
a fresh `dist/`. The tarball is gitignored; `dist/` is gitignored too.
After any change in `src/`, repack and reinstall. Don't use `bun link`
for this consumer: linking carries this package's own `node_modules/react`
along, causing the "Invalid hook call / two React copies" error.

## Claude Code plugin

This repo also ships as a Claude Code plugin published to the
`wyattjoh/claude-code-marketplace` registry. Layout:

- `.claude-plugin/plugin.json` — plugin manifest (`name`, `version`,
  `description`, `keywords`, `repository`, `license`). `version` is
  bumped by release-please via the `extra-files` entry in
  `release-please-config.json`, so npm + plugin versions stay locked.
- `skills/opentui-testing/SKILL.md` — the agent skill the plugin
  exposes. It's the same file the package documents in its README; the
  plugin is the install vehicle for Claude Code users.
- `.github/workflows/release.yml` — after a release-please release
  creates a tag and the npm publish job succeeds, the
  `update-marketplace` job calls `wyattjoh/claude-code-marketplace@v1`
  to open a PR against the marketplace registry bumping
  `opentui-testing`'s `version`, `source.ref`, and `source.sha`. That PR
  is what makes the new release installable via
  `/plugin install opentui-testing@wyattjoh-marketplace`.

The marketplace action requires a pre-existing entry under
`opentui-testing` in the registry's `marketplace.json`; first-time setup
adds that entry manually. The `MARKETPLACE_PAT` secret on this repo must
be a fine-grained PAT with `contents:write` + `pull-requests:write` on
the marketplace repo.

## Anti-scope

- Do not build a virtual terminal. OpenTUI's testing mode already
  bypasses the ANSI write path.
- Do not build a PTY harness. The renderer is in-process by design.
- Do not write custom matchers until a real test needs one. Bun's
  built-in `toMatchSnapshot()` against `captureCharFrame()` is the
  baseline; only extend if a frame-comparison gap shows up.
