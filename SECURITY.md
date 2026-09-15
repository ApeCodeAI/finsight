# Security policy

FinSight is a **local-first, single-user** tool. Your data lives on your
machine (`~/.finsight/`) in a local SQLite database and optional native backup
files. There is no cloud account, telemetry, or multi-user account system.

The optional ledger directory is only an explicitly generated legacy
export/import format. It is not synchronized automatically and is not the
canonical recovery source; use `finsight backup create` for native recovery
copies.

That said, a few security-relevant things still apply.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Email the maintainer listed in [`package.json`](./package.json) with:

- A clear description of the issue
- Steps to reproduce
- The FinSight version (`finsight --version`) and OS
- Your assessment of impact, if any

You'll get a reply within a few days. If a fix is needed, we'll coordinate
disclosure timing with you before publishing.

## Scope

In scope:

- Bugs that allow remote code execution via the local web server
- Bugs that let a network neighbor read your portfolio when the dashboard
  is bound to a non-loopback interface
- Connector code that mishandles untrusted upstream responses (e.g., quote
  feed returning malicious payloads)
- Ledger export/import code that could write outside the explicitly configured
  `ledger_dir`

Out of scope:

- "The web dashboard has no auth" — this is by design. The dashboard is
  meant to bind to `localhost` only. If you expose it to a network, put a
  reverse proxy with auth in front of it (Caddy + basic auth, Tailscale
  serve, Cloudflare Access). See the **Security** section in the README.
- Issues that require you to run code from an untrusted source (e.g.,
  `finsight ledger restore` against a malicious vault you cloned). FinSight
  trusts your local files.

## Hardening tips for users

- Keep native backups and any configured `ledger_dir` in a private or encrypted
  location; they contain portfolio data.
- Don't pipe `finsight context` into a third-party LLM if you consider your
  portfolio sensitive — `finsight context --json` and the Markdown form
  both include account names and dollar amounts.
- Don't expose `finsight web` on `0.0.0.0` without auth in front.

Thanks for helping keep FinSight users safe.
