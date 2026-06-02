# Example portfolios

Drop one of these YAML files into your `ledger_dir` as `accounts.yaml` to bootstrap a demo.

| File | Profile | Base currency |
|---|---|---|
| `seed-portfolio.en.yaml` | US-leaning: VOO / VTI / AAPL / NVDA / cash / BTC | USD |
| `seed-portfolio.zh.yaml` | China-leaning: A-share funds + HK + US stocks | CNY |
| `tickers.cn.yaml` | Chinese-name → ticker mapping (drop in ledger as `tickers.yaml`) | — |

## Use as demo

```bash
finsight ledger init ~/finsight-demo
cp examples/seed-portfolio.en.yaml ~/finsight-demo/accounts.yaml
finsight ledger restore --yes
finsight overview
```

## Use as template

Treat these as a starting point — edit account names, paste in your real positions, then `finsight ledger restore --yes`.
