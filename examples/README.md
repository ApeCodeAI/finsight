# Example portfolios

These YAML files are synthetic demo data. The normal FinSight source of truth is
local SQLite; examples are loaded by `finsight init --demo` or by the demo
script.

| File | Profile | Base currency |
|---|---|---|
| `seed-portfolio.en.yaml` | US-leaning: VOO / VTI / AAPL / NVDA / cash / BTC | USD |
| `seed-portfolio.zh.yaml` | China-leaning: A-share funds + HK + US stocks | CNY |
| `tickers.cn.yaml` | Chinese-name → ticker mapping for optional legacy exports | — |

## Use as demo

```bash
finsight init --non-interactive \
  --base-currency USD \
  --display-locale en-US \
  --labels-language en \
  --demo en
finsight overview
```

Or run the isolated dashboard demo:

```bash
pnpm demo
# pnpm demo zh
```

The demo uses a temporary database and does not touch the user's real
`~/.finsight/` data.

## Optional legacy export

If an older tool needs the plain-text representation, configure a directory
explicitly and export from SQLite:

```bash
finsight ledger init ~/finsight-legacy-export
finsight ledger export
```

The export is for interoperability and inspection. It is not a native backup
and should not be treated as the canonical recovery source.
