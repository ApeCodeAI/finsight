# Changelog

All notable changes to FinSight are documented here. The format roughly
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). We use
[SemVer](https://semver.org/) for versioning — `0.x` releases batch
related changes, breaking changes can land in `0.x → 0.y`.

## [0.1.0] — 2026-06-02 — Initial public release

The first public version of FinSight. A local-first, AI-friendly personal
portfolio tracker — your files are the source of truth, the database is a
working copy, every command outputs JSON for AI tools.

### Highlights

- **Multi-account, multi-currency holdings**, converted to one base
  currency you pick (USD / CNY / JPY / EUR / …).
- **Daily net-worth snapshots and trend** — see how things move over time.
- **Asset allocation with targets** — set ideal stocks/bonds/cash/crypto
  splits and see drift vs current.
- **Investment journal** — record rationale, price targets, stop-losses for
  each decision. The tool flags when targets or stops are hit.
- **Annualized return (XIRR)** per account and overall — the kind that
  accounts for when you actually added or withdrew money.
- **Cross-checking against your broker** — paste in your broker's total,
  see exactly where the discrepancy is.
- **Plain-text vault format** — `accounts.yaml`, `fx-rates.yaml`,
  `transactions.jsonl`, `snapshots/`, `decisions/`. Edit by hand or `git
  commit` as a backup.
- **AI-friendly contract** — every read command supports `--json`, exit
  codes are semantic (0/1/2/3/4), and a portable
  [skill file](./skills/finsight/SKILL.md) teaches any AI (Claude, Cursor,
  Codex, ChatGPT) how to operate the CLI on your behalf.
- **Web dashboard** at `localhost:3210` — Vite + React 19 + Tailwind v4 +
  Hono API. Overview, accounts, positions, symbols, performance, targets,
  decisions, mobile-friendly.
- **Two data connectors** ready out of the box:
  - `connector-yfinance` — Yahoo Finance for US/HK stocks, crypto, FX
  - `connector-tiantian` — 天天基金 (Eastmoney) for China onshore funds
  - Plus an optional `connector-yzyx` importer for the 有知有行 platform.
- **`pnpm demo`** — one-command bootstrap into an isolated
  `/tmp/finsight-demo` sandbox with sample data; quit and it self-cleans.
- **Internationalization** — English and Chinese label bundles built in;
  more locales welcome as PRs.
- **Apache 2.0 licensed**, with `CONTRIBUTING.md`, `SECURITY.md`, issue
  and PR templates, CI on GitHub Actions.

### Known limits at launch

- No built-in authentication for the web dashboard — it binds to
  `localhost` and is designed for single-user, local-first use. Put it
  behind a reverse proxy (Caddy / Tailscale / Cloudflare Access) if you
  need remote access. Full policy in [SECURITY.md](./SECURITY.md).
- XIRR results can be unstable when the time window is very short or
  when net flows are near zero — the CLI warns you when this happens.
- Connector coverage is limited to Yahoo Finance and 天天基金 today;
  Interactive Brokers / Tiger / Futu are on the roadmap. New connectors
  are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

[0.1.0]: https://github.com/ApeCodeAI/finsight/releases/tag/v0.1.0
