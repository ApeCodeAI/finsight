/**
 * [INPUT]: vitest defineConfig type.
 * [OUTPUT]: vitest configuration for @finsight/core.
 * [POS]: package root config; picks up setupFiles so every test starts
 *        with FINSIGHT_CONFIG_DIR pointing at an isolated CNY config.
 * [RUNTIME]: build-time / test.
 * [PROTOCOL]: keep setupFiles aligned with src/__tests__/setup.ts.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
