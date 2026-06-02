/**
 * [INPUT]: vitest worker env (FINSIGHT_CONFIG_DIR), node:fs / node:os.
 * [OUTPUT]: side effects — sets FINSIGHT_CONFIG_DIR to a tmp dir and writes
 *          a deterministic `{base_currency:"CNY"}` config there.
 * [POS]: vitest setupFiles entry for @finsight/core tests.
 * [RUNTIME]: build-time / test.
 * [PROTOCOL]: every fixture in this package assumes CNY base currency.
 *             Don't change the base here without auditing all assertions
 *             on `currency`/`total` in src/__tests__/.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "finsight-core-tests-"));
process.env.FINSIGHT_CONFIG_DIR = dir;

mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "config.json"),
  `${JSON.stringify(
    {
      base_currency: "CNY",
      display_locale: "zh-CN",
      labels_language: "zh",
    },
    null,
    2,
  )}\n`,
);
