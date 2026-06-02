/**
 * AI-friendly exit codes & structured error output.
 *
 * Exit codes:
 *   0 OK              — command succeeded
 *   1 USER_ERROR      — bad input, missing arg, unknown flag
 *   2 DATA_CONFLICT   — invariant violated (e.g. negative quantity, snapshot diff missing)
 *   3 NOT_FOUND       — account/position/snapshot id missing
 *   4 INTERNAL        — uncaught exception
 *
 * In --json mode, all errors are emitted as JSON to stderr.
 */
export const ExitCode = {
  OK: 0,
  USER_ERROR: 1,
  DATA_CONFLICT: 2,
  NOT_FOUND: 3,
  INTERNAL: 4,
} as const;

export type ExitCodeName = keyof typeof ExitCode;

export interface CliError {
  error: string;
  code: ExitCodeName;
  hint?: string;
}

/** Emit a structured error and exit. Honors --json by writing JSON to stderr. */
export function fail(
  code: ExitCodeName,
  message: string,
  opts?: { json?: boolean; hint?: string },
): never {
  const payload: CliError = { error: message, code };
  if (opts?.hint) payload.hint = opts.hint;

  if (opts?.json) {
    process.stderr.write(`${JSON.stringify(payload)}\n`);
  } else {
    process.stderr.write(`✗ ${message}\n`);
    if (opts?.hint) process.stderr.write(`  hint: ${opts.hint}\n`);
  }
  process.exit(ExitCode[code]);
}

/** Output JSON to stdout (one compact line — easy for AI to grep). */
export function emitJson(data: unknown) {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}
