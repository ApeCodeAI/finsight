/**
 * [INPUT]: tsup defineConfig type.
 * [OUTPUT]: dist/index.js (single-file ESM bundle with a shebang) and
 *          dist/index.d.ts (types) for the published `finsight` package.
 * [POS]: build config for the npm-published CLI.
 * [RUNTIME]: build-time.
 * [PROTOCOL]: noExternal inlines monorepo `@finsight/*` packages so the
 *             published tarball ships with zero workspace links. Native /
 *             third-party deps stay external — they're declared in
 *             packages/cli/package.json#dependencies for npm to resolve.
 */
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  target: "node22",
  splitting: false,
  shims: false,
  dts: true,
  noExternal: [/^@finsight\//],
});
