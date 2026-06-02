import { Command } from "commander";
import { accountCmd } from "./commands/account.js";
import { tradeCmd } from "./commands/trade.js";
import { balanceCmd } from "./commands/balance.js";
import { positionCmd } from "./commands/position.js";
import { symbolCmd } from "./commands/symbol.js";
import { ledgerCmd } from "./commands/ledger.js";
import { configCmd } from "./commands/config.js";
import { contextCmd } from "./commands/context.js";
import { initCmd } from "./commands/init.js";
import { quoteCmd } from "./commands/quote.js";
import { decisionCmd } from "./commands/decision.js";
import { targetCmd } from "./commands/target.js";
import { transactionCmd } from "./commands/transaction.js";
import { reconcileCmd } from "./commands/reconcile.js";
import { snapshotCmd } from "./commands/snapshot.js";
import { importCmd } from "./commands/import-cmd.js";
import { overviewCmd } from "./commands/overview.js";
import { performanceCmd } from "./commands/performance.js";
import { doctorCmd } from "./commands/doctor.js";
import { webCmd } from "./commands/web.js";

const program = new Command();
program
  .name("finsight")
  .description(
    "Local-first portfolio tracker. Every command supports --json.\n\n" +
      "  AI agents: read `skills/finsight/SKILL.md`, then start with\n" +
      "  `finsight context` (LLM-ready briefing) or `finsight doctor` (health check).",
  )
  .version("0.2.0");

program.addCommand(initCmd);
program.addCommand(accountCmd);
program.addCommand(tradeCmd);
program.addCommand(balanceCmd);
program.addCommand(positionCmd);
program.addCommand(symbolCmd);
program.addCommand(quoteCmd);
program.addCommand(decisionCmd);
program.addCommand(targetCmd);
program.addCommand(transactionCmd);
program.addCommand(reconcileCmd);
program.addCommand(ledgerCmd);
program.addCommand(configCmd);
program.addCommand(contextCmd);
program.addCommand(snapshotCmd);
program.addCommand(importCmd);
program.addCommand(overviewCmd);
program.addCommand(performanceCmd);
program.addCommand(doctorCmd);
program.addCommand(webCmd);

program.parse(process.argv);
