# Changelog

## [1.0.1](https://github.com/wyattjoh/opentui-testing/compare/v1.0.0...v1.0.1) (2026-05-14)


### Miscellaneous Chores

* release 1.0.1 ([#13](https://github.com/wyattjoh/opentui-testing/issues/13)) ([848b0cd](https://github.com/wyattjoh/opentui-testing/commit/848b0cde9de5990e56ed1a141d863544ae908fef))

## [1.0.0](https://github.com/wyattjoh/opentui-testing/compare/v0.1.0...v1.0.0) (2026-05-14)


### ⚠ BREAKING CHANGES

* `keys`, `flushFrames`, `waitForFrame`, `wrapInput`, `applyEnv`, `applyCwd`, and the upstream type re-exports are no longer exported. Use `app.flushFrames` / `app.waitForFrame` for the bound forms; import `KeyCodes` from `@opentui/core/testing` for key constants.

### Features

* package as a Claude Code plugin ([0272aa9](https://github.com/wyattjoh/opentui-testing/commit/0272aa9633f23d5de7851d0bc47701412a5ae3b3))
* package as a Claude Code plugin ([d93244f](https://github.com/wyattjoh/opentui-testing/commit/d93244f2df3bd6a5c59bd82d7f1ece0da5476a05))


### Code Refactoring

* narrow public exports to render ([c3171a1](https://github.com/wyattjoh/opentui-testing/commit/c3171a178caef4ac85b9c1ac00acca41e6ad179a))
