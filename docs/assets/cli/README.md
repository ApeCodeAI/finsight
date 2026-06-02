# CLI screenshots

This folder holds terminal screenshots referenced by the project README.
The goal: prove FinSight's "AI-friendly + local-first" identity by showing
the CLI surface alongside the web one.

## Expected files

| File | Command captured | Why we want it |
|---|---|---|
| `overview.png` | `finsight overview` | The killer text view — net worth + by-class table |
| `overview-json.png` | `finsight overview --json \| jq` | Proves the AI-friendly contract: same data, machine-readable |
| `context.png` | `finsight context` | The Markdown briefing handed to an LLM (optional but powerful) |

## How to capture

1. Run the demo so numbers look rich and no real data is exposed:
   ```bash
   pnpm demo            # USD/EN
   # or: pnpm demo zh   # CNY/ZH
   ```
2. In a separate terminal (Hack / JetBrains Mono / SF Mono, ~14pt, dark theme
   for contrast), run the command you want to capture.
3. Crop to just the relevant output. Aim for ~1600px wide; PNG.
4. Drop the file here using exactly the names above.

The README already references these paths — no further wiring needed once
the files exist.
