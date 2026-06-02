/**
 * 天天基金 (Tiantian / Eastmoney) NAV fetcher.
 *
 * Endpoint: https://fundgz.1234567.com.cn/js/<code>.js?rt=<epoch_ms>
 *
 * Response is JSONP wrapping a single object:
 *   jsonpgz({
 *     fundcode: "110020",
 *     name: "易方达沪深300ETF联接A",
 *     jzrq: "2026-05-28",       // last close date
 *     dwjz: "1.9783",            // unit NAV at last close
 *     gsz:  "1.9785",            // intraday estimate
 *     gszzl: "0.01",             // intraday estimate % change
 *     gztime: "2026-05-29 10:29"
 *   })
 *
 * Empty / suspended funds return `jsonpgz();` with no payload.
 */

export interface FundQuote {
  code: string;
  name: string;
  /** Date of `nav` (YYYY-MM-DD). */
  nav_date: string;
  /** Unit NAV at last close. */
  nav: number;
  /** Optional intraday estimate (盘中估值). May be undefined if no estimate. */
  estimated?: number;
  /** Estimate % change vs last close. */
  estimated_pct?: number;
  /** Timestamp of the intraday estimate (e.g. "2026-05-29 10:29"). */
  estimated_at?: string;
  /**
   * Recommended price to write into FinSight: estimated when fresh,
   * otherwise the last-close NAV.
   */
  current_price: number;
  /** Source of `current_price`: "estimated" or "nav". */
  source: "estimated" | "nav";
}

export type FundQuoteOutcome =
  | { status: "ok"; quote: FundQuote }
  | { status: "error"; code: string; reason: string };

const ENDPOINT = "https://fundgz.1234567.com.cn/js/";
const FALLBACK_ENDPOINT = "https://api.fund.eastmoney.com/f10/lsjz";
const USER_AGENT =
  "FinSight/0.1 (+https://github.com/ApeCodeAI/finsight) Mozilla/5.0";
const COMMON_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  accept: "*/*",
  referer: "https://fund.eastmoney.com/",
};

function parseJsonp(body: string): Record<string, unknown> | null {
  // body looks like `jsonpgz({...});` — strip wrapper.
  const m = body.match(/^\s*jsonpgz\(\s*(.*)\s*\)\s*;?\s*$/s);
  if (!m) return null;
  const inner = m[1].trim();
  if (!inner || inner === "" || inner === "()") return null;
  try {
    return JSON.parse(inner) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isSixDigitCode(s: string): boolean {
  return /^\d{6}$/.test(s);
}

/**
 * Try the realtime estimate endpoint first; if it returns no data (common
 * for QDII funds), fall back to the historical-NAV API which always has at
 * least the previous close.
 */
export async function fetchFundNav(code: string): Promise<FundQuoteOutcome> {
  if (!isSixDigitCode(code)) {
    return { status: "error", code, reason: "Not a 6-digit China fund code" };
  }
  // 1. Realtime estimate (fundgz)
  try {
    const res = await fetch(`${ENDPOINT}${code}.js?rt=${Date.now()}`, {
      headers: COMMON_HEADERS,
    });
    if (res.ok) {
      const data = parseJsonp(await res.text());
      if (data) {
        const dwjz = Number(data.dwjz);
        const gsz =
          data.gsz != null && data.gsz !== "" ? Number(data.gsz) : undefined;
        const gszzl =
          data.gszzl != null && data.gszzl !== ""
            ? Number(data.gszzl) / 100
            : undefined;
        if (Number.isFinite(dwjz)) {
          const useEstimated = Number.isFinite(gsz ?? Number.NaN);
          return {
            status: "ok",
            quote: {
              code: String(data.fundcode ?? code),
              name: String(data.name ?? ""),
              nav_date: String(data.jzrq ?? ""),
              nav: dwjz,
              estimated: useEstimated ? gsz : undefined,
              estimated_pct: useEstimated ? gszzl : undefined,
              estimated_at: useEstimated ? String(data.gztime ?? "") : undefined,
              current_price: useEstimated ? (gsz as number) : dwjz,
              source: useEstimated ? "estimated" : "nav",
            },
          };
        }
      }
    }
  } catch {
    // Swallow and try the fallback.
  }

  // 2. Historical-NAV fallback (covers QDII / suspended estimates)
  try {
    const url = `${FALLBACK_ENDPOINT}?fundCode=${code}&pageIndex=1&pageSize=1`;
    const res = await fetch(url, { headers: COMMON_HEADERS });
    if (!res.ok) return { status: "error", code, reason: `HTTP ${res.status}` };
    const json = (await res.json()) as {
      Data?: { LSJZList?: Array<{ FSRQ?: string; DWJZ?: string; JZZZL?: string }> };
      ErrMsg?: string | null;
    };
    const row = json.Data?.LSJZList?.[0];
    if (!row || !row.DWJZ) {
      return {
        status: "error",
        code,
        reason: json.ErrMsg ?? "No NAV history",
      };
    }
    const dwjz = Number(row.DWJZ);
    const navPct = row.JZZZL != null ? Number(row.JZZZL) / 100 : undefined;
    if (!Number.isFinite(dwjz)) {
      return { status: "error", code, reason: "Malformed NAV" };
    }
    return {
      status: "ok",
      quote: {
        code,
        name: "",
        nav_date: row.FSRQ ?? "",
        nav: dwjz,
        estimated: undefined,
        estimated_pct: navPct,
        estimated_at: undefined,
        current_price: dwjz,
        source: "nav",
      },
    };
  } catch (e) {
    return {
      status: "error",
      code,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Fetch the NAV on or before a specific date. Pages historical NAVs from the
 * lsjz endpoint and returns the closest match ≤ the target date.
 */
export async function fetchFundNavAt(
  code: string,
  date: string,
): Promise<FundQuoteOutcome> {
  if (!isSixDigitCode(code)) {
    return { status: "error", code, reason: "Not a 6-digit China fund code" };
  }
  const target = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) {
    return { status: "error", code, reason: `Invalid date: ${date}` };
  }
  const targetIso = target.toISOString().slice(0, 10);
  const start = new Date(target.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
  const url = `${FALLBACK_ENDPOINT}?fundCode=${code}&pageIndex=1&pageSize=20&startDate=${start}&endDate=${targetIso}`;
  try {
    const res = await fetch(url, { headers: COMMON_HEADERS });
    if (!res.ok) return { status: "error", code, reason: `HTTP ${res.status}` };
    const json = (await res.json()) as {
      Data?: { LSJZList?: Array<{ FSRQ?: string; DWJZ?: string; JZZZL?: string }> };
      ErrMsg?: string | null;
    };
    const list = (json.Data?.LSJZList ?? []).filter(
      (r) => r.DWJZ && r.FSRQ && r.FSRQ <= targetIso,
    );
    if (list.length === 0) {
      return { status: "error", code, reason: `No NAV ≤ ${date}` };
    }
    list.sort((a, b) => (b.FSRQ ?? "").localeCompare(a.FSRQ ?? ""));
    const row = list[0];
    const dwjz = Number(row.DWJZ);
    if (!Number.isFinite(dwjz)) {
      return { status: "error", code, reason: "Malformed NAV" };
    }
    return {
      status: "ok",
      quote: {
        code,
        name: "",
        nav_date: row.FSRQ ?? "",
        nav: dwjz,
        estimated: undefined,
        estimated_pct: row.JZZZL != null ? Number(row.JZZZL) / 100 : undefined,
        estimated_at: undefined,
        current_price: dwjz,
        source: "nav",
      },
    };
  } catch (e) {
    return { status: "error", code, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Batch fetch with bounded concurrency. */
export async function fetchFundNavs(
  codes: string[],
  concurrency = 4,
): Promise<FundQuoteOutcome[]> {
  const out: FundQuoteOutcome[] = new Array(codes.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= codes.length) return;
      out[i] = await fetchFundNav(codes[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, codes.length) }, worker),
  );
  return out;
}

export { isSixDigitCode };
