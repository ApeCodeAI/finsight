/**
 * [INPUT]: optional --date and --traded-at values.
 * [OUTPUT]: validation and lookup/storage date behavior assertions.
 * [POS]: unit tests for the CLI's shared trade timestamp seam.
 * [RUNTIME]: test.
 * [PROTOCOL]: full timestamps are optional, verbatim, and never replace an
 *             explicitly supplied historical quote date.
 */
import { describe, expect, it } from "vitest";
import { resolveTradeDates, validateTradedAt } from "../utils/traded-at.js";

describe("trade timestamp date handling", () => {
  it("preserves normal ISO timestamps and derives their quote date", () => {
    const tradedAt = "2026-09-14T15:37:42.123-04:00";

    expect(validateTradedAt(tradedAt)).toBe(tradedAt);
    expect(resolveTradeDates(undefined, tradedAt)).toEqual({
      quoteDate: "2026-09-14",
      tradedAt,
    });
  });

  it("lets --date control quote lookup while --traded-at controls storage", () => {
    const tradedAt = "2026-09-14T19:37:42Z";

    expect(resolveTradeDates("2026-09-12", tradedAt)).toEqual({
      quoteDate: "2026-09-12",
      tradedAt,
    });
  });

  it("keeps date-only workflows unchanged", () => {
    expect(resolveTradeDates("2025-11-15")).toEqual({
      quoteDate: "2025-11-15",
      tradedAt: "2025-11-15",
    });
  });

  it("rejects malformed full timestamps clearly", () => {
    expect(() => validateTradedAt("2026-09-14")).toThrow(/Invalid --traded-at/);
    expect(() => validateTradedAt("2026-09-14T15:37:42")).toThrow(/Invalid --traded-at/);
    expect(() => validateTradedAt("2026-02-30T15:37:42Z")).toThrow(/Invalid --traded-at/);
  });
});
