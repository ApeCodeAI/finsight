<div align="center">

# FinSight

**See your money. Know where it sits. Decide what's next.**

A personal portfolio tracker that runs on your laptop, plays well with AI tools,
and keeps your data in plain text files you can read and edit yourself.

[![CI](https://github.com/ApeCodeAI/finsight/actions/workflows/ci.yml/badge.svg)](https://github.com/ApeCodeAI/finsight/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)](./tsconfig.base.json)
[![Node >=22](https://img.shields.io/badge/Node-%3E%3D22-339933.svg?logo=node.js&logoColor=white)](./package.json)
[![pnpm workspace](https://img.shields.io/badge/pnpm-workspace-F69220.svg?logo=pnpm&logoColor=white)](./pnpm-workspace.yaml)
[![Status: early](https://img.shields.io/badge/status-early%20access-orange.svg)](#-status)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Sponsored by BytePass](https://img.shields.io/badge/sponsored%20by-BytePass.ai-7C3AED.svg)](https://bytepass.ai)

Built by **[ApeCode.ai](https://apecode.ai)** · Sponsored by **[BytePass.ai](https://bytepass.ai)**

[中文版 / 中文 README →](./README.zh-CN.md)

<br />

<img src="./docs/assets/web/overview.jpg" alt="FinSight web dashboard — net worth overview" width="900" />

<sub><i>FinSight web dashboard — multi-currency net worth, allocation, and trend, at <code>localhost:3210</code></i></sub>

</div>

---

## Why FinSight exists

Most portfolio trackers ask you to sign up, hand over your numbers, and trust
their cloud. The moment you want to ask an AI assistant "what should I
rebalance?", you're stuck taking screenshots.

FinSight takes the other path:

- 🗂 **Your files are the truth.** Holdings live in plain text on your disk
  (YAML — readable by humans). Back them up with `git`, edit them in any editor,
  open them on any machine. The app's database is just a working copy.
- 🌍 **You pick the base currency.** USD, CNY, JPY, EUR — pick one, everything
  else gets converted automatically. No region-locked product here.
- 🤖 **AI is a first-class user.** Every command can output structured JSON, and
  a single markdown file ([the skill](./skills/finsight/SKILL.md)) teaches Claude,
  Cursor, Codex, or ChatGPT how to operate the tool on your behalf.
- 🔒 **Stays on your machine.** No cloud account, no signup, no telemetry. The
  dashboard runs at `localhost`.

> A good portfolio tracker should be a file format first, a command-line tool
> second, and a dashboard third — in that order.

## ⚡ Install

```bash
npm install -g finsight
finsight init        # asks for base currency, locale, where to store your files
finsight overview    # see your portfolio
```

Requires Node.js >= 22. The package is on
[npmjs.com/package/finsight](https://www.npmjs.com/package/finsight).

## 🧪 Or — try it without committing

If you want to see the dashboard with realistic sample data before installing
anything globally, clone and run the demo:

```bash
git clone https://github.com/ApeCodeAI/finsight && cd finsight
pnpm install
pnpm demo            # ← USD/English demo + dashboard at localhost:3210
# pnpm demo zh       # ← CNY/中文 demo (A-shares funds / HK / US / crypto)
```

The demo creates a throwaway sandbox under `/tmp/finsight-demo`, loads a sample
portfolio, and opens the dashboard. Quit it (Ctrl+C) and the sandbox is wiped —
nothing touches your real config.

> The web dashboard (`finsight web`) currently runs from a repo clone only —
> the production-bundled dashboard is on the v0.2 roadmap. For now,
> `npm install -g finsight` gives you the full CLI + AI integration; clone
> the repo if you also want the visual dashboard.

## 🔭 Three windows into the same data

The same portfolio, three different ways to look at it — pick whichever fits
the moment.

### 1. Web dashboard — for the human eye

<img src="./docs/assets/web/positions.jpg" alt="Web positions page — holdings across accounts" width="900" />

<sub><i>Positions page — every holding aggregated across accounts, with cost, current price, profit/loss, and weight</i></sub>

### 2. CLI table — for the terminal, in one breath

<img src="./docs/assets/cli/overview.png" alt="finsight overview — terminal output" width="780" />

```bash
$ finsight overview
# net worth + breakdown by category, everything in your base currency
```

### 3. AI-friendly JSON — for the agent in the next tab

<img src="./docs/assets/cli/overview-json.png" alt="finsight overview --json — machine-readable output" width="780" />

```bash
$ finsight overview --json | jq
# the same data, structured. The output format is documented and stable.
# See docs/json-stability.md
```

> Same numbers, three windows. The web dashboard, the terminal, and the JSON
> output all show the exact same thing — so you never have to screenshot
> or copy-paste between them.

## ✨ How it compares

| Decision | Most trackers | FinSight |
|---|---|---|
| Where data lives | Their cloud | Your laptop, in plain text files |
| Source of truth | Their database | Your text files; the app's DB is a copy |
| AI access | Maybe a chat box | A documented JSON output any AI can read |
| Base currency | Hard-coded | `finsight config set base-currency JPY` |
| Schema changes | Their migration | You edit the file |
| Backup | Vendor lock-in | `git commit` your folder |
| Account model | Sign up first | None — runs as you, on your machine |

## 🎯 What it does and doesn't do

FinSight is a **portfolio tracker** — it answers "what do I own and what's it
worth?". It's not a budgeting app.

What it does:

- **Multi-account, multi-currency holdings** — everything converted to one base currency you choose
- **Daily net-worth snapshots and trend** — see how things move over time
- **Asset allocation** — how your money splits across stocks, bonds, cash, crypto, with a target you can set and compare against
- **An investment journal** — for each buy, record why you bought, your price target, your stop-loss. The tool flags when targets get hit so you can act.
- **Cross-checking with your broker** — paste in your broker's total and the tool tells you where the discrepancy is
- **Annualized return (XIRR)** per account and overall — the kind that accounts for when you actually added or withdrew money, not just gross gain
- **AI briefings** via `finsight context` — copy the output, paste into ChatGPT or Claude, ask for advice

What it doesn't do:

It doesn't track income, expenses, or budgets — that's a different product.
For budgeting, you can pair FinSight with:

- [**Beancount**](https://beancount.github.io/) — plain-text double-entry accounting
- [**Actual**](https://actualbudget.org/) — local-first envelope budgeting (open source)
- [**YNAB**](https://www.ynab.com/) / [**Lunch Money**](https://lunchmoney.app/) — commercial, polished

Since FinSight uses plain text files, running both side by side is easy.

## 🤖 Let an AI agent drive it

In the repo there's a single markdown file —
[`skills/finsight/SKILL.md`](./skills/finsight/SKILL.md) — that teaches any AI
assistant how to use FinSight on your behalf. It's not an API integration, not
a plugin. It's just a written guide, the way you'd onboard a new colleague.

Once your AI has read it, you can say things like:

```text
"Read skills/finsight/SKILL.md, then install finsight and start tracking my
 portfolio. My salary lands in 招商 on the 15th of each month — record it
 automatically."
```

And for day-to-day "what does my portfolio look like, what should I do
next?", pipe the briefing in:

<img src="./docs/assets/cli/context.png" alt="finsight context — Markdown briefing for LLMs" width="780" />

```bash
finsight context | pbcopy    # Markdown briefing → clipboard → paste into ChatGPT/Claude
finsight context --json      # structured payload for an autonomous agent
```

No MCP server to install, no auth handshake. The skill works with any tool
that can read text. See [`skills/README.md`](./skills/README.md) for how to
wire it into your specific assistant.

## 🏗 How it's built

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐
│  finsight CLI   │     │  Web (Vite)  │     │  AI agent    │
└────────┬────────┘     └──────┬───────┘     └──────┬───────┘
         │                     │                     │
         └─────────┬───────────┴─────────┬───────────┘
                   │                     │
              ┌────▼─────┐         ┌─────▼─────┐
              │ Hono API │ ◄─────► │  SQLite   │   ← working copy
              └────┬─────┘         └─────▲─────┘
                   │                     │
                   │              finsight ledger sync (once a day)
                   │                     ▼
                   │             ┌───────────────┐
                   └────────────►│  your folder  │   ← source of truth
                                 │  accounts.yaml│      (git-tracked)
                                 │  fx-rates.yaml│
                                 │  transactions │
                                 │  snapshots/   │
                                 │  decisions/   │
                                 └───────────────┘
```

For details: [`docs/data-sources.md`](./docs/data-sources.md) explains how
price and currency feeds work, and [`docs/json-stability.md`](./docs/json-stability.md)
documents what AI tools can rely on in the JSON output.

## ⚙️ Configuration

```bash
finsight config set base-currency USD       # USD / CNY / JPY / EUR / ...
finsight config set display-locale en-US    # any standard locale code
finsight config set labels-language en      # en / zh (more PRs welcome)
finsight config set ledger-dir ~/notes/finance/ledger
```

Your settings live in `~/.finsight/config.json`. The `FINSIGHT_DB_PATH`
environment variable can override where the SQLite working copy lives.

### 🔒 Note on security

The web dashboard **has no login screen** — it's designed to run on
`localhost` only. Don't expose it on a public network; anyone who can reach
the port can read your portfolio.

If you do need remote access, put it behind a reverse proxy that adds auth
(Caddy + basic auth, Tailscale serve, Cloudflare Access, etc.). Built-in
auth isn't planned — FinSight is meant as a personal tool. The full policy
lives in [SECURITY.md](./SECURITY.md).

## 📖 CLI reference

**Setup & config**
```bash
finsight init                     # interactive first-time setup
finsight config list              # show current settings
finsight config set base-currency JPY
```

**Look at your portfolio**
```bash
finsight overview                 # net worth + breakdown
finsight account list / show
finsight symbol list              # holdings grouped by ticker (across accounts)
finsight symbol show PDD          # PDD across all your accounts
finsight position list
finsight web                      # the dashboard
```

**Record trades and balances**
```bash
finsight trade buy <acc> PDD 100              # auto-fetches today's price
finsight trade buy <acc> 110020 --amount 1000 # fund: buy by amount, --amount required
finsight trade buy <acc> PDD 100 --price 82.5 # explicit price
finsight trade buy <acc> PDD 100 --date 2025-11-15
finsight trade list --needs-review            # trades where the price was guessed — confirm later
finsight transaction confirm <id> --price 84  # replace a guessed price with the real one
finsight balance update <acc> 250000
```

**Refresh prices**
```bash
finsight quote update                         # everything (all positions + exchange rates)
finsight quote update --symbols PDD,MSFT      # just a few
finsight quote update --dry-run               # preview, don't write
```

**Cross-check and back up**
```bash
finsight reconcile <acc>                      # compare to what your broker app shows
finsight reconcile log                        # past cross-check results
finsight ledger sync                          # save today's database snapshot into your folder
finsight ledger verify                        # check that the DB and your files match
finsight ledger restore --yes                 # rebuild the DB from your files (disaster recovery)
```

**Hand the portfolio to an LLM**
```bash
finsight context | pbcopy                     # Markdown briefing → clipboard
finsight context --json                       # structured payload
```

All read commands accept `--json` for machine consumption. Exit codes
are predictable:

| Code | Meaning |
|---|---|
| 0 | OK |
| 1 | USER_ERROR — bad input |
| 2 | DATA_CONFLICT — a rule was violated (e.g., sold more than you own) |
| 3 | NOT_FOUND — name/id doesn't exist |
| 4 | INTERNAL — uncaught exception |

In `--json` mode, errors print `{"error","code","hint?"}` to stderr.

## 🗂 Repository layout

```
finsight/
├── packages/              # the actual code (pnpm workspaces)
│   ├── core/              #   shared logic, DB, file I/O, translations — no UI
│   ├── cli/               #   the `finsight` command
│   ├── web/               #   Vite + React 19 + Tailwind v4 + Hono API
│   ├── connector-yfinance #   Yahoo Finance (US/HK stocks, crypto, exchange rates)
│   ├── connector-tiantian #   天天基金 (Eastmoney) — China onshore funds
│   └── connector-yzyx     #   有知有行 importer (optional)
├── examples/              # sample portfolios (EN / ZH) you can drop into your folder
├── skills/                # how-to-drive-finsight guides for AI tools
│   └── finsight/SKILL.md  #   the one-file manual
├── docs/
│   ├── data-sources.md    # how price / exchange-rate feeds work
│   ├── json-stability.md  # what AI tools can rely on in the JSON output
│   └── assets/            # screenshots used by these READMEs
├── scripts/demo.mjs       # the `pnpm demo` entry point
├── .github/               # CI, issue & PR templates
├── README.md              # you are here
├── README.zh-CN.md        # 中文版
├── CONTRIBUTING.md        # how to send a PR
├── SECURITY.md            # how to report a security issue
├── CHANGELOG.md           # version history
└── LICENSE                # Apache 2.0
```

New brokers or data sources land as new `connector-*` packages — the core
never depends on a specific provider. New languages go in
`packages/core/src/i18n/index.ts`. See [CONTRIBUTING.md](./CONTRIBUTING.md)
for the full guide.

## 🗃 What lives in your folder

```
ledger/
├── README.md            (auto-generated)
├── accounts.yaml        — your accounts + holdings (you can edit this directly)
├── fx-rates.yaml        — exchange rates between currencies
├── transactions.jsonl   — every event, appended one per line
├── snapshots/           — daily JSON snapshots
└── decisions/           — markdown notes per investment decision
```

This layout is deliberately simple. Paste `accounts.yaml` into any AI and
ask for advice; commit the diff after a buy; restore the database from any
point in your git history.

## 🚧 Status

FinSight is in **early access**. The author uses it daily to track a real
portfolio, so the core is solid — but expect rough edges, breaking changes
between minor versions, and a roadmap that shifts based on real feedback.
If you adopt it now, please open issues. That's how the priorities get set.

In active development:

- More broker / data-source connectors (Interactive Brokers, Tiger, Futu)
- An optional MCP server (in addition to the existing skill file)
- Mobile-friendly dashboard polish
- More locales / language packs (PRs especially welcome)

## 🙏 Sponsors and acknowledgments

FinSight is built by **[ApeCode.ai](https://apecode.ai)** — a small team
shipping practical, AI-native tools for developers and individuals.

Generously sponsored by **[BytePass.ai](https://bytepass.ai)** — thank you
for backing open-source work and making this kind of development
sustainable. If you find BytePass.ai useful, please give them a look —
their support is what lets us ship for free.

If you're using FinSight, the best ways to support it are: open issues,
send PRs, share it with a friend, and star the repo. All three keep
development going.

## 🤝 Contributing

PRs welcome — new languages, new brokers, new connectors, UI polish, docs.
See [CONTRIBUTING.md](./CONTRIBUTING.md). For substantial changes, please
open an issue first so we can align on direction.

## 📜 License

Apache License 2.0 — see [LICENSE](./LICENSE).
Copyright © 2026 [ApeCode.ai](https://apecode.ai) and FinSight contributors.
