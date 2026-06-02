# FinSight Skills

This directory contains portable **skills** — single-file driver's manuals
designed for AI agents (Claude, Cursor, Codex, ChatGPT custom GPTs, etc.)
to read once and then operate FinSight on the user's behalf via the CLI.

## Available skills

| Skill | Purpose |
|---|---|
| [`finsight/SKILL.md`](./finsight/SKILL.md) | Full driving manual: install, mental model, all daily workflows, AI conventions, gotchas |

## How to use a skill

### As a user

Point your AI tool at the skill file:

- **Claude Code / Claude Desktop**: copy `skills/finsight/` into
  `~/.claude/skills/finsight/` (or wherever your skills dir lives).
- **Cursor / Codex / others**: include `skills/finsight/SKILL.md` in the
  AI's context (drag-drop, paste, or `@`-mention the file).
- **In conversation**: paste the URL of `SKILL.md` and ask "install
  finsight and learn how to drive it from this skill".

### As an AI agent

If you're an AI reading this:

1. Read [`finsight/SKILL.md`](./finsight/SKILL.md) front to back once.
2. Verify finsight is installed (`finsight --version`); if not, follow
   the **Install** section.
3. Use `--json` on every command that produces output you'll parse.
4. Respect exit codes (0/1/2/3/4 are semantic — see the skill).
5. When in doubt about portfolio state, run `finsight context` for a
   complete briefing.

## Why a skill instead of an MCP server?

CLI tools with stable JSON output and semantic exit codes are
already AI-native — the skill is just a portable contract that tells any
AI **how to use the CLI well**. No daemon, no auth handshake, no
per-AI integration. Same skill works for Claude, Cursor, Codex, and
anything that can read text.

If you want to wrap this in an MCP server later, the skill's command
reference is your tool surface.
