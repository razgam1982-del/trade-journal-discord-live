// Pulls a benchmark equity curve (SPX / ^GSPC) from Yahoo Finance.
// Returned as a date → cumulative % return map, anchored to 0% at startDate.
// Cached in-memory for 1 hour to avoid hammering Yahoo.

type CachedQuote = { fetchedAt: number; series: Array<{ date: string; pct: number }> };
const cache = new Map<string, CachedQuote>();
const TTL_MS = 60 * 60 * 1000;

export async function fetchBenchmarkSeries(
  symbol: string,
  startIso: string,
  endIso: string,
): Promise<Array<{ date: string; pct: number }>> {
  const key = `${symbol}|${startIso}|${endIso}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.series;

  const start = Math.floor(new Date(startIso).getTime() / 1000) - 86400;
  const end = Math.ceil(new Date(endIso).getTime() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${start}&period2=${end}&interval=1d`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    if (!ts.length) return [];

    let basePrice: number | null = null;
    const series: Array<{ date: string; pct: number }> = [];
    for (let i = 0; i < ts.length; i++) {
      const close = closes[i];
      if (close == null) continue;
      if (basePrice == null) basePrice = close;
      const pct = ((close - basePrice) / basePrice) * 100;
      const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      series.push({ date, pct });
    }
    cache.set(key, { fetchedAt: Date.now(), series });
    return series;
  } catch {
    return [];
  }
}

// Snaps a target ISO date to the nearest entry in `series` (or null if none).
export function spxPctAt(series: Array<{ date: string; pct: number }>, targetIso: string): number | null {
  if (!series.length) return null;
  const target = targetIso.slice(0, 10);
  // Find the latest entry with date <= target.
  let best: number | null = null;
  for (const p of series) {
    if (p.date <= target) best = p.pct;
    else break;
  }
  return best;
}
