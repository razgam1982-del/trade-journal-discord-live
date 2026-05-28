// Historical price lookup via Twelve Data. Maps the channel's assets to
// Twelve Data symbols and fetches intraday candles to fill missing prices.

const API = 'https://api.twelvedata.com';
const KEY = process.env.TWELVEDATA_API_KEY;

const ASSET_SYMBOLS: Record<string, string> = {
  XAUUSD: 'XAU/USD',
  XAGUSD: 'XAG/USD',
  BTC: 'BTC/USD',
  BTCUSD: 'BTC/USD',
  META: 'META',
  MSTR: 'MSTR',
};

export interface Candle {
  t: number; // epoch ms (UTC)
  open: number;
  close: number;
}

export function symbolFor(asset: string): string | null {
  return ASSET_SYMBOLS[asset] ?? null;
}

// Twelve Data expects "YYYY-MM-DD HH:MM:SS"; we query in UTC.
function toUtcStamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`;
}

// One call per asset covering the whole date range (15-min candles).
export async function fetchCandles(asset: string, startISO: string, endISO: string): Promise<Candle[] | null> {
  const symbol = ASSET_SYMBOLS[asset];
  if (!symbol || !KEY) return null;

  const params = new URLSearchParams({
    symbol,
    interval: '15min',
    start_date: toUtcStamp(startISO),
    end_date: toUtcStamp(endISO),
    timezone: 'UTC',
    outputsize: '5000',
    apikey: KEY,
  });

  const res = await fetch(`${API}/time_series?${params.toString()}`);
  const data = (await res.json()) as { status?: string; values?: { datetime: string; open: string; close: string }[] };
  if (data.status === 'error' || !data.values) return null;

  return data.values
    .map((v) => ({ t: Date.parse(v.datetime.replace(' ', 'T') + 'Z'), open: Number(v.open), close: Number(v.close) }))
    .sort((a, b) => a.t - b.t);
}

// Price of the candle covering the timestamp (its close). Falls back to the
// nearest candle if the exact one is missing.
export function priceAt(candles: Candle[], tsISO: string): number | null {
  if (candles.length === 0) return null;
  const ts = Date.parse(tsISO);
  let best: Candle | null = null;
  for (const c of candles) {
    if (c.t <= ts) best = c;
    else break;
  }
  if (!best) best = candles[0];
  return best ? Number(best.close.toFixed(2)) : null;
}
