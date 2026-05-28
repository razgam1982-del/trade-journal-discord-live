import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/services/supabase';
import { fetchCandles, priceAt, symbolFor } from '@/services/market-data-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface Row {
  id: string;
  asset: string | null;
  asset_raw: string | null;
  action: string | null;
  entry_price: number | null;
  exit_price: number | null;
  message: { created_at: string } | null;
}

const ENTRY_ACTIONS = new Set(['entry', 'add']);
const EXIT_ACTIONS = new Set(['reduce', 'close']);

// Fills missing entry/exit prices from historical market data (one call per
// asset). Skips trigger/limit entries (they already carry their price) and
// anything manually edited.
export async function POST(req: NextRequest) {
  if (req.headers.get('x-webhook-secret') !== process.env.DISCORD_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('trade_signals')
    .select('id, asset, asset_raw, action, entry_price, exit_price, manually_edited, message:discord_messages(created_at)')
    .eq('is_trade', true)
    .eq('manually_edited', false);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];

  // Which signals need a price, and which field.
  type Need = { row: Row; field: 'entry_price' | 'exit_price'; ts: string };
  const needs: Need[] = [];
  for (const r of rows) {
    const ts = r.message?.created_at;
    const asset = r.asset ?? r.asset_raw;
    if (!ts || !asset || !symbolFor(asset)) continue;
    if (ENTRY_ACTIONS.has(r.action ?? '') && r.entry_price == null) needs.push({ row: r, field: 'entry_price', ts });
    else if (EXIT_ACTIONS.has(r.action ?? '') && r.exit_price == null) needs.push({ row: r, field: 'exit_price', ts });
  }

  // Group by asset and fetch candles once per asset.
  const byAsset = new Map<string, Need[]>();
  for (const n of needs) {
    const a = (n.row.asset ?? n.row.asset_raw) as string;
    if (!byAsset.has(a)) byAsset.set(a, []);
    byAsset.get(a)!.push(n);
  }

  const results: { asset: string; filled: number; missing: number }[] = [];
  for (const [asset, list] of byAsset) {
    const times = list.map((n) => Date.parse(n.ts)).sort((a, b) => a - b);
    const start = new Date(times[0] - 60 * 60 * 1000).toISOString();
    const end = new Date(times[times.length - 1] + 60 * 60 * 1000).toISOString();
    const candles = await fetchCandles(asset, start, end);
    let filled = 0;
    let missing = 0;
    if (candles) {
      for (const n of list) {
        const price = priceAt(candles, n.ts);
        if (price == null) {
          missing++;
          continue;
        }
        const { error: upErr } = await supabaseAdmin
          .from('trade_signals')
          .update({ [n.field]: price })
          .eq('id', n.row.id);
        if (upErr) missing++;
        else filled++;
      }
    } else {
      missing = list.length;
    }
    results.push({ asset, filled, missing });
  }

  return NextResponse.json({ totalNeeds: needs.length, results });
}
