# Contributing to FinSight

Thanks for your interest. FinSight is a small, opinionated codebase — the goal is to keep it that way.

## Setup

```bash
git clone https://github.com/ApeCodeAI/finsight
cd finsight
pnpm install
pnpm -r build
pnpm -r test
```

Required:
- Node.js ≥ 22
- pnpm ≥ 10

## What we love receiving

- **New languages** in `packages/core/src/i18n/index.ts`. Copy the `en` block, translate, add a test. No PR is too small.
- **New connectors** as `packages/connector-<name>`. See `packages/connector-yzyx` for the shape. Connectors are optional packages — they depend on `@finsight/core` but `core` never depends on them.
- **Currency / broker support** that doesn't hard-code regional assumptions.
- **Bug fixes** with a regression test.
- **Documentation in your native language.** A `README.<lang>.md` next to the English README is welcome.

## What we'd rather not merge

- Network-dependent code in `core` (FX feeds, quote feeds belong in connectors).
- UI changes that bake region-specific labels into TSX. Use the runtime `assetClassLabel()` / `accountTypeLabel()` helpers.
- New dependencies in `core` without strong justification. The cache footprint matters.
- Large refactors without an issue first.

## Conventions

### Architecture rules

- `core` is pure logic + types. No UI, no Express/Hono, no platform-specific paths beyond `~/.finsight/`.
- `cli` is thin. Commands parse args, call core, print results. Avoid business logic.
- `web` reads /api, never imports core directly.
- Every TS/TSX file starts with a GEB-style header:
  ```
  /**
   * [INPUT]: what this file depends on
   * [OUTPUT]: what it exports / produces
   * [POS]: where it sits in the system
   * [RUNTIME]: server | client | shared | build-time
   * [PROTOCOL]: when changed, update this header and check CLAUDE.md
   */
  ```

### Commits

We follow Conventional Commits:
```
feat(scope): one-line summary

Optional body explaining the why, not the what.
```

Scopes we use: `core`, `cli`, `web`, `ledger`, `connector-yzyx`, `docs`, `build`.

### Testing

```bash
pnpm --filter @finsight/core test     # vitest
pnpm -r typecheck                     # tsc -b
```

PRs need at least one test covering the new behavior. Snapshot tests for currency arithmetic are encouraged.

## Reporting issues

Use the issue templates under `.github/ISSUE_TEMPLATE/`. Include:
- FinSight version (`finsight --version`)
- Your config (`finsight config list`), masking the ledger path if private
- Steps to reproduce

## Security

Don't open public issues for security problems. Email the maintainer (in the package.json) instead.
