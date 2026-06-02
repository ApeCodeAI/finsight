import { Command } from "commander";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

export const webCmd = new Command("web")
  .description("Start the web dashboard (Hono API + Vite dev — requires a repo clone)")
  .option("--port <port>", "Vite dev port", "3210")
  .option("--api-port <port>", "Hono API port", "3211")
  .action((opts) => {
    const cliDir = resolve(fileURLToPath(import.meta.url), "../../..");
    const webDir = resolve(cliDir, "../web");

    // npm-installed builds ship CLI only — packages/web/ isn't in the tarball.
    // Fall back to a friendly pointer until the v0.2 bundled dashboard lands.
    if (!existsSync(webDir)) {
      console.log(chalk.yellow("⚠ The web dashboard isn't bundled in this install."));
      console.log();
      console.log("Run it from a repo clone:");
      console.log(chalk.cyan("  git clone https://github.com/ApeCodeAI/finsight"));
      console.log(chalk.cyan("  cd finsight && pnpm install && pnpm demo"));
      console.log();
      console.log(chalk.dim("Bundled web dashboard is on the v0.2 roadmap."));
      console.log(chalk.dim("Track: https://github.com/ApeCodeAI/finsight/issues"));
      return;
    }

    console.log(chalk.bold("  FinSight Web Dashboard"));
    console.log(chalk.dim(`  UI:  http://localhost:${opts.port}`));
    console.log(chalk.dim(`  API: http://localhost:${opts.apiPort}/api`));
    console.log();

    const child = spawn("pnpm", ["run", "dev"], {
      cwd: webDir,
      stdio: "inherit",
      env: {
        ...process.env,
        FINSIGHT_WEB_PORT: opts.apiPort,
        VITE_PORT: opts.port,
      },
    });

    child.on("error", (err) => {
      console.error(chalk.red(`Failed to start web: ${err.message}`));
      console.error(chalk.dim("Run `pnpm install` in the repo root first."));
      process.exit(1);
    });

    child.on("exit", (code) => process.exit(code ?? 0));

    process.on("SIGINT", () => child.kill("SIGINT"));
    process.on("SIGTERM", () => child.kill("SIGTERM"));
  });
