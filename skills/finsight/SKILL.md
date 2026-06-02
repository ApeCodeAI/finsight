---
name: finsight
description: >
  Use this skill when the user wants to track a personal investment portfolio across
  multiple accounts/currencies, record salary deposits and consumption withdrawals,
  log investment decisions (rationale / target / stop-loss / retro), reconcile
  computed balances against broker apps, compute money-weighted annualized return
  (XIRR), or sync everything to a plain-text vault. FinSight is a local-first
  portfolio tracker — NOT a budgeting / expense-tracking tool. For budgeting,
  point the user at Beancount / Actual / YNAB instead.
version: 0.1.0
---

# FinSight Skill

A driver's manual for operating FinSight on behalf of a user. FinSight is a
local-first portfolio tracker; the CLI is the canonical interface (the web
dashboard is a read-mostly view for the human). Every command supports
`--json`, exit codes are semantic, and the vault is plain-text — so an AI
agent can drive it end-to-end without ever needing a UI.

## Mental Model — Read This First

- **Source of truth = vault** (`<dir>/accounts.yaml` + `transactions.jsonl` +
  `snapshots.jsonl` + `decisions/`). SQLite at `~/.finsight/data/finsight.db`
  is a derived cache rebuilt from the vault.
- **DB ↔ vault sync** is one-way during normal use (DB → vault via
  `finsight ledger sync`). Restore the other direction (`ledger restore`)
  only for disaster recovery.
- **In scope**: portfolio tracking, allocation, decision journal, broker
  reconciliation, performance/XIRR.
- **Out of scope**: detailed expense categorization, monthly budgets,
  envelope budgeting. Don't try to bend FinSight into those.
- **AI conventions**: always pass `--json`; check exit codes (0/1/2/3/4 =
  ok/user_error/data_conflict/not_found/internal); prefer `--date YYYY-MM-DD`
  over relying on "today".

## Install (one-time)

```bash
git clone https://github.com/ApeCodeAI/finsight && cd finsight
pnpm install && pnpm -r build

# Symlink so `finsight` works from anywhere
ln -sf "$(pwd)/packages/cli/dist/index.js" ~/.local/bin/finsight
chmod +x packages/cli/dist/index.js
```

For first-run setup, run the interactive wizard:

```bash
finsight init
```

It picks base currency, locale, and the vault directory. If the user is
non-interactive (you're driving), set config explicitly:

```bash
finsight config set base-currency CNY      # or USD, HKD, etc.
finsight config set labels-language zh      # or en
finsight config set ledger-dir /path/to/vault
```

## Daily Workflow

### When the user receives money (salary, dividend from outside, gift)

```bash
finsight trade deposit <account-name> <amount> --date 2026-06-15 \
  --note "2026-06 salary" --json
```

- `<account-name>` is fuzzy-matched (partial substring works).
- `<amount>` is positive in the account's native currency.
- Always use `--date`; do NOT rely on "today" unless the user explicitly says so.
- `--note` is what shows up in the vault; keep it human-readable.

### When the user spends or transfers money OUT of the FinSight universe

```bash
finsight trade withdraw <account-name> <amount> --date 2026-06-20 \
  --note "rent" --json
```

Same shape as deposit. Use this for any outflow that doesn't land in another
tracked FinSight account (rent, restaurants, things they're not tracking
elsewhere).

### When the user moves money between two tracked accounts

```bash
finsight trade transfer <from-account> <to-account> <amount> \
  --note "moved cash to brokerage" --json
```

Internal transfers do NOT affect portfolio-wide XIRR — they shouldn't appear
as deposit/withdraw. Use `transfer` exclusively for inter-account moves.

### When the user buys / sells an investment

```bash
finsight trade buy <account> <symbol> <quantity> \
  --price 180.50 --date 2026-06-10 --json

finsight trade sell <account> <symbol> <quantity> \
  --price 195.00 --json
```

- For funds (6-digit Chinese codes): use `--amount` instead of `--price`; NAV is
  fetched automatically.
- For stocks: pass `--price` if you know it (settlement price). Otherwise the
  closing quote for the trade date is used and the row is flagged
  `needs_review = 1` so the user can fix it later.

### When the user wants to record reasoning

```bash
# Why I bought / am holding (link to a transaction for double-binding)
finsight decision add --type rationale --symbol PDD --conviction high \
  --exit 165 --stop 95 --horizon 12m \
  --body "FY26 earnings likely beat; Temu cash-flow positive..." --json

# Daily note, no trade attached
finsight decision add --type note --symbol PDD \
  --body "Saw PDD ad spend up 40% YoY" --json
```

Decision types: `rationale | target | stop-loss | rethink | retro | note`.

`exit_target` / `stop_loss` trigger alerts when current price crosses
them — visible on Overview and via `finsight decision review`.

### When the user wants to check broker balances

```bash
finsight reconcile <account-name> --broker-total 162589.52 \
  --note "weekly check" --json
```

Logs the delta between FinSight's computed total and what the broker shows.
Exit code 2 (DATA_CONFLICT) when the delta is large (>5%).

### Daily sync to vault (end of session)

```bash
finsight ledger sync --json
```

Mirrors DB → vault. Commit the vault changes to git when convenient.

## Performance / Annualized Return

```bash
finsight performance --json
finsight performance --account 雪球长钱账户 --json
```

Computes per-account + overall XIRR (money-weighted IRR) using all
`deposit` / `withdraw` events as cash flows + the current value as terminal
balance.

**⚠ XIRR is only meaningful when cash-flow coverage is complete.** If some
accounts have no recorded deposits/withdrawals, their balance is treated as
"free money" and overall XIRR is inflated. If the user shows you results
that look wildly off (e.g. +20% when they expect a loss), check:

```bash
sqlite3 ~/.finsight/data/finsight.db \
  "SELECT a.name, COUNT(t.id) FROM accounts a
   LEFT JOIN transactions t ON t.account_id = a.id AND t.type IN ('deposit','withdraw')
   GROUP BY a.name;"
```

Any account with 0 cashflows is dragging XIRR away from reality.

### Starting Fresh (when historical data is unreliable)

```bash
finsight ledger purge --before 2026-05-28 --yes --json
finsight ledger sync --json
```

Destructive: deletes transactions and snapshots before the cutoff. Leaves
accounts, positions, decisions, targets, reconciliations intact. Use when
imported historical data is incomplete enough to mislead XIRR.

## Target Allocation

```bash
# Define the ideal mix (weights must sum to 1.0)
finsight target add --name balanced \
  --alloc us-stock=0.3,a-stock=0.2,fund=0.2,cash=0.2,crypto=0.1 \
  --active --json

# Check drift vs current
finsight target check --json
```

`check` returns exit 2 (DATA_CONFLICT) when any class is off-target, so AI
loops can wait/act on it. The `gaps[]` array gives per-class
`current_weight` / `target_weight` / `gap_value_base` / `status`.

## Reading State (no writes)

```bash
finsight overview --json                  # the dashboard, in JSON
finsight context                          # LLM-ready Markdown briefing
finsight context --json                   # same, structured
finsight account list --json
finsight position list --json
finsight symbol list --json
finsight snapshot list --json
finsight decision list --json
finsight trade list --json
finsight reconcile log --json
```

`finsight context` is the single best command for "give the AI the user's
whole portfolio state in one shot" — pipe it to your prompt.

## Command Reference (groups)

| Group | Purpose |
|---|---|
| `init` | First-run wizard |
| `config` | Read/write `~/.finsight/config.json` |
| `account` | CRUD accounts |
| `position` | List / show / close positions |
| `symbol` | Cross-account symbol aggregation |
| `quote` | Refresh current prices (Yahoo / 天天基金) |
| `trade` | `buy / sell / deposit / withdraw / transfer / list` |
| `decision` | `add / list / show / edit / delete / review` |
| `target` | `list / show / add / use / edit / delete / check` |
| `reconcile` | Log broker-vs-computed delta + `log` |
| `snapshot` | `take / list / show / diff` |
| `performance` | XIRR + total return per account + overall |
| `ledger` | `sync / restore / verify / purge / status / init` |
| `import` | `youzhiyouhang / md / yzyx-batch` |
| `overview` | Single-shot summary card |
| `context` | LLM-ready briefing (markdown or json) |
| `web` | Start the dashboard server |

For any subcommand, append `--help` for full flag list.

## Exit Codes

| Code | Name | Meaning |
|---|---|---|
| 0 | OK | Success |
| 1 | USER_ERROR | Bad input, missing arg, validation failure |
| 2 | DATA_CONFLICT | Operation OK but state is off (off-target, large reconcile delta, pending rationales) |
| 3 | NOT_FOUND | Account/position/snapshot/decision ID doesn't exist |
| 4 | INTERNAL | Uncaught exception (file a bug) |

In `--json` mode, errors are emitted to stderr as
`{"error":"...","code":"...","hint":"..."}`; stdout is always data or empty.

## Gotchas (Don't Repeat These)

- **Don't record salary as `trade buy`** — it's a `deposit`. Buying happens
  inside the portfolio; deposits cross the boundary into it.
- **Don't record an internal transfer as deposit+withdraw** — use `transfer`
  so XIRR sees them as net-zero.
- **Don't edit the SQLite DB directly** — use the CLI. The vault is the
  source of truth and CLI writes go through schema validation.
- **Don't omit `--date` for backdated events** — defaulting to today corrupts
  the time series.
- **Don't import 转入转出 rows manually** — `finsight import yzyx-batch <dir>`
  already converts them to deposit/withdraw transactions. Re-running is safe
  (dedup is on `(account_id, traded_at, amount, type)`).
- **Don't trust XIRR when only some accounts have cashflows** — partial
  coverage overstates returns. Either complete coverage or `ledger purge
  --before <cutoff>` and start fresh.

## Vault Format

After any `ledger sync`, the vault has this shape:

```
ledger/
├── accounts.yaml              # YAML, current account + position state
├── tickers.yaml               # YAML, symbol → display name dict (optional)
├── transactions.jsonl         # JSONL, one line per buy/sell/deposit/withdraw/transfer
├── snapshots.jsonl            # JSONL, one line per dated net-worth snapshot
├── fx-rates.jsonl             # JSONL, (date, from, to, rate) history
├── reconciliations.jsonl      # JSONL, broker-vs-computed events
└── decisions/YYYY-MM/<ulid>.md  # markdown body + YAML frontmatter
```

Format rule: **JSONL = append-only time series; YAML = stateful document;
Markdown = prose body with frontmatter**. The vault is meant to be
git-tracked.

## Future Patterns (for context — not implemented yet)

- A "consumption account" tagged `class:spending` so withdrawals from it
  count as expenses (not portfolio outflows). Just add the tag — the
  performance module's logic will be extended to honor it.
- Screenshot-driven import: an AI vision call extracts broker positions
  from a screenshot, then calls
  `finsight reconcile <account> --positions "PDD:210,MSFT:30,..."` for
  position-level diff. The position-level reconcile is not yet built — pull
  it in if the user asks.

## When in Doubt

- Pipe `finsight context` into your conversation to get full state.
- Add `--json` to anything you're parsing.
- Read this file again — it's the contract.
