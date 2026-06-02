# Where FinSight's market data comes from

FinSight never connects to your broker. Every price you see is either typed by
you or fetched from a **public quote endpoint** anyone can hit from a browser.

## Endpoints used

| Use case | Source | URL pattern | Authentication |
|---|---|---|---|
| US/HK stocks (realtime + historical) | Yahoo Finance | `query1.finance.yahoo.com/v8/finance/chart/<symbol>` | None |
| Crypto | Yahoo Finance | `query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>-USD` | None |
| FX rates | Yahoo Finance | `query1.finance.yahoo.com/v8/finance/chart/<FROM><TO>=X` | None |
| China onshore funds (realtime estimate) | 天天基金 / Eastmoney | `fundgz.1234567.com.cn/js/<code>.js` | None |
| China onshore funds (historical NAV) | 天天基金 / Eastmoney | `api.fund.eastmoney.com/f10/lsjz` | None |

Each request goes out with a generic `FinSight/0.1` user-agent and a
`Referer: https://fund.eastmoney.com/` header (Eastmoney refuses requests
without that). Yahoo doesn't care.

## How a price ends up in your DB

Every transaction row carries a `price_source` field documenting where the
number came from:

| `price_source` | Meaning |
|---|---|
| `user_provided` | You typed `--price` explicitly. We trust it. |
| `eod_close` | Stock fallback — you didn't give `--price`, we used the most recent close from Yahoo. Marked `needs_review = 1`. |
| `eod_nav` | Fund — official last-close NAV from Eastmoney. |
| `realtime_quote` | Fund — intraday estimate (`gsz`) when available. |
| `manual_entry` | Imported from a ledger YAML / vault file with no source info. |

Run `finsight trade list --needs-review` to surface every fallback price you
haven't confirmed yet. Run `finsight transaction confirm <id> --price <p>` to
upgrade one.

## Fund vs stock policy

- **Funds (6-digit numeric ticker)**: NAV is the only valid cost basis.
  `finsight trade buy <account> <code> --amount <X>` is required;
  `--price` is silently ignored with a warning. T-day NAV is auto-pulled
  (intraday estimate during market hours, last-close NAV otherwise).
- **Stocks / ETFs**: your `--price` wins. If absent, FinSight falls back to
  today's close (or the close on `--date`) and flags the row for review.
- **Crypto**: same rules as stocks; price defaults to the Yahoo `BTC-USD` style symbol.

If `--price` deviates more than 10% from the market reference, you get an
interactive prompt:

```
⚠ PDD @ $100 differs from today $83.03 (+20.4%)
? Continue? [y/N]
```

Skip the prompt with `--yes` (auto-confirm) or `--no-warn`.

## Reconciliation

Because we don't talk to your broker, our computed account total can drift from
what the broker app actually shows. Every week or so, run:

```bash
finsight reconcile "Schwab Brokerage"
# FinSight computed: $48,653.20
# ? Total shown in your broker (USD): 48700
# Δ +$46.80 (+0.10%)
# ✓ Within 1% — accounts reconcile cleanly.
```

If the delta is > 5%, `reconcile` tells you to look at `needs-review`
transactions — those fallback prices are the most likely culprits.

The deltas are stored in a `reconciliations` table you can query later:

```bash
finsight reconcile log --account "Schwab"
```

## Going offline

If you don't want any HTTP calls (privacy, slow network, China firewall, etc.):

```bash
finsight config set auto-quote false   # disables fetchers from `quote update`
```

…and pass `--no-quote --price <p>` to every `trade buy/sell`. Funds still
require `--no-quote --price <NAV>` since NAV is mandatory.

## Privacy & rate limits

- We don't keep any cookies or sessions.
- We send no PII to either provider — just symbol codes.
- Yahoo throttles aggressively above ~50 requests/minute; the bundled
  concurrency cap (default 4 in `quote update`) keeps you well under.
- Eastmoney is laxer but blocks bot-like burst traffic.

## Reporting upstream changes

If Yahoo or Eastmoney moves their endpoints (it has happened twice in the past
five years), open an issue with the new URL. We treat connector updates as
small, drop-in patches — they live in `packages/connector-yfinance` and
`packages/connector-tiantian` respectively.
