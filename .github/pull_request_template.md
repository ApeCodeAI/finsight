<!--
Thanks for the PR! A few things that make review fast:
- Keep the PR focused on one change.
- For UI/connector changes, include a screenshot or sample output.
- Substantial changes? Please open an issue first to align on direction.
-->

## What this changes



## Why



## How to test

```bash
# commands a reviewer should run
```

## Checklist

- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r test` passes
- [ ] `pnpm lint` clean (or explicitly justified)
- [ ] Docs / README updated if user-facing behavior changed
- [ ] New connectors: package depends on `@finsight/core`, not the reverse
- [ ] New i18n keys: copied into every locale, with a sane fallback

## Related issues / discussion


