# `--json` stability contract

FinSight is designed for AI agents and shell scripts to drive via the CLI.
Every command supports `--json`. This document defines what stability
guarantees we make about that JSON shape, so consumers know what they can
rely on.

## TL;DR

- We follow **semver-style stability** on `--json` output. Within a
  major version:
  - **Existing fields will not be renamed or removed.**
  - **Existing field types will not change.**
  - **New fields may be added** at any level.
- Breaking changes go behind a version bump (`finsight --version`).
- Exit codes (0/1/2/3/4) are also stable. See [Exit codes](#exit-codes).

## What this means for you

### Safe assumptions

If today `finsight account list --json` returns:

```json
{ "accounts": [{ "id": "...", "name": "...", "type": "cash", "balance": 0 }] }
```

You can safely:

- Read `accounts[].id` / `name` / `type` / `balance` and expect them to keep
  the same names and types
- Assume the top level is an object with an `accounts` array
- Add new fields to your parser's allowed set without code changes

### What can change without warning

- New top-level fields appearing (e.g. `accounts` payload could gain a
  `total_count` sibling)
- New per-row fields appearing (e.g. `accounts[].annualized_return`)
- Ordering of fields within an object — JSON has no field order
- Whitespace / pretty-printing — we emit compact JSON, but don't depend on
  the exact byte sequence

### What requires a version bump

- Renaming a field (`balance` → `cash_balance`)
- Removing a field
- Changing a field's type (`balance: number` → `balance: string`)
- Reordering an array's natural sort (this is rare but does count)
- Changing exit code semantics for an existing command

## Exit codes

| Code | Name | Meaning |
|---|---|---|
| 0 | OK | Success |
| 1 | USER_ERROR | Bad input, missing arg, validation failure |
| 2 | DATA_CONFLICT | Operation OK but state is off (off-target, large reconcile delta, pending rationales) — useful for AI loops to detect "something's wrong but not user-facing error" |
| 3 | NOT_FOUND | Account/position/snapshot/decision ID doesn't exist |
| 4 | INTERNAL | Uncaught exception (file a bug) |

Error payloads in `--json` mode go to **stderr** with shape:

```json
{ "error": "human message", "code": "USER_ERROR", "hint": "optional fix" }
```

Stdout in `--json` mode is **always** valid JSON or empty (never half-JSON,
never mixed with prose).

## How we enforce this

- CI runs `pnpm typecheck` + `pnpm test` on every PR
- The CI workflow also runs a `skill-drift` check: every command referenced
  in `skills/finsight/SKILL.md` must exist in `finsight --help`
- Adding a field is fine and doesn't require a test
- Removing or renaming a field requires updating tests AND bumping the
  package version

## Versioning

Current version: see `finsight --version`.

We use the major version to signal `--json` shape changes. Patch and minor
bumps preserve the contract; major bumps may break it (with documented
migration notes in `CHANGELOG.md`).

## Examples of stable shapes

These are anchor examples for the AI agent's mental model. Real outputs
have more fields; these are the documented core.

### `finsight overview --json`
```json
{
  "snapshot_date": "2026-05-29",
  "total_net_worth": 1465471.34,
  "currency": "CNY",
  "by_account": [{ "id": "...", "name": "...", "balance_base": 0, "type": "...", "currency": "..." }],
  "allocation": { "cash": 0.5, "us-stock": 0.3 },
  "snapshots": [{ "id": "...", "date": "2026-05-29", "total": 1465471.34 }]
}
```

### `finsight performance --json`
```json
{
  "accounts": [{
    "account_id": "...", "account_name": "...", "currency": "CNY",
    "period_start": "2026-05-29", "period_end": "2026-05-29", "days": 0,
    "net_deposits": 0, "current_value": 0,
    "total_return": 0, "total_return_pct": null,
    "cagr": null, "xirr": null, "cashflow_count": 0
  }],
  "overall": { /* same shape, account_id = null, account_name = "Overall" */ }
}
```

### `finsight doctor --json`
```json
{
  "checks": [{ "name": "...", "level": "ok|warn|error", "message": "...", "hint": "..." }],
  "summary": { "ok": 5, "warn": 2, "error": 0 }
}
```

### `finsight context --json`

The single most useful command for "give the AI the user's whole portfolio
state in one shot". Shape includes `config`, `as_of`, `net_worth`,
`by_asset_class`, `top_symbols`, `accounts`, `recent_decisions`,
`triggered_alerts`, `pending_rationale_count`, `target`. Optional fields
may be present/absent depending on state.
