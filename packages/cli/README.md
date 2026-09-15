# finsight

> Local-first, AI-friendly personal portfolio tracker.

See your money. Know where it sits. Decide what's next.

`finsight` tracks a personal investment portfolio across multiple accounts and
currencies. Data stays in a local SQLite database, every command can output
structured JSON, and AI assistants can drive the CLI on your behalf.

[Full documentation and roadmap on GitHub →](https://github.com/ApeCodeAI/finsight)

## Install

```bash
npm install -g finsight
```

Requires Node.js >= 22.

## Quickstart

```bash
finsight init           # interactive setup — base currency and locale
finsight overview       # net worth + breakdown by asset class
finsight overview --json | jq    # same data, machine-readable
```

## What it does

- **Multi-account, multi-currency holdings** — converted to one base
  currency you pick (USD / CNY / JPY / EUR / …).
- **Daily net-worth snapshots and trend.**
- **Asset allocation with targets** — set ideal splits, see drift.
- **Investment journal** — record rationale, price targets, stop-losses
  per decision. Auto-flagged when prices cross.
- **Annualized return (XIRR)** per account and portfolio-wide.
- **Broker cross-checking** — paste your broker's total, see where the
  discrepancy is.
- **AI briefings** via `finsight context` — Markdown or JSON payload
  for handing the portfolio to an LLM.
- **Native SQLite backups** via `finsight backup create` and
  `finsight backup verify`.

## What it doesn't do

It doesn't track income, expenses, or budgets — that's a different
product. Pair `finsight` with [Beancount](https://beancount.github.io/),
[Actual](https://actualbudget.org/), or YNAB for that.

## CLI reference (highlights)

```bash
finsight account list / show
finsight symbol show PDD            # PDD across all your accounts
finsight trade buy <acc> PDD 100    # auto-fetches today's price
finsight quote update               # refresh prices + FX
finsight reconcile <acc>            # compare to broker app
finsight backup create --json       # create a verified native backup
finsight backup verify <file> --json
finsight doctor --json              # inspect local DB health
finsight context | pbcopy           # hand briefing to ChatGPT/Claude
```

The `ledger` commands remain available only for explicit legacy
export/import interoperability. Ledger export is lossy and is not the native
recovery path.

All read commands support `--json`. Exit codes are semantic:
`0` ok · `1` bad input · `2` rule violated · `3` not found · `4` internal.

## Web dashboard

The `finsight web` command launches a Vite + React + Hono dashboard at
`localhost:3210`, but it requires running from a repo clone for now —
the production-bundled dashboard remains on the future roadmap. For the full
visual experience today:

```bash
git clone https://github.com/ApeCodeAI/finsight
cd finsight && pnpm install && pnpm demo
```

## AI integration

The repo ships a single markdown file —
[`skills/finsight/SKILL.md`](https://github.com/ApeCodeAI/finsight/blob/main/skills/finsight/SKILL.md)
— that teaches any AI assistant how to operate the CLI on your behalf.
No MCP server, no auth handshake; just a written guide your AI reads
once, then drives the tool.

Tell your AI:

> Read `skills/finsight/SKILL.md` and start tracking my portfolio.
> Record operations with the CLI and use `--json` for machine-readable output.

## Project

Built by **[ApeCode.ai](https://apecode.ai)** ·
sponsored by **[BytePass.ai](https://bytepass.ai)**.

- Source: <https://github.com/ApeCodeAI/finsight>
- Issues: <https://github.com/ApeCodeAI/finsight/issues>
- 中文 README: <https://github.com/ApeCodeAI/finsight/blob/main/README.zh-CN.md>

Apache 2.0 licensed.
