import { supabaseAdmin } from './supabase';
import type { StockTrade, StockTradeInput } from '@/types';

export { calcStockTrade } from '@/lib/stock-calc';

const STOCKS_CHANNEL = '932256154439020544';

// All trades for the stocks channel, in display order.
// Public-read delay: when cutoffIso is set, hides trades created after the
// cutoff. Owners pass null (or omit) and see everything live.
export async function listStockTrades(channelId: string = STOCKS_CHANNEL, cutoffIso?: string | null): Promise<StockTrade[]> {
  let q = supabaseAdmin
    .from('stock_trades')
    .select('*')
    .eq('channel_id', channelId)
    .is('deleted_at', null);
  if (cutoffIso) q = q.lte('created_at', cutoffIso);
  const { data, error } = await q
    .order('seq', { ascending: true })
    .order('trade_date', { ascending: true });
  if (error) {
    throw new Error(`Failed to list stock trades: ${error.message}`);
  }
  return (data ?? []) as StockTrade[];
}

// Soft-deleted stock trades (for the recycle bin), most-recently-deleted first.
export async function listDeletedStockTrades(channelId: string = STOCKS_CHANNEL): Promise<StockTrade[]> {
  const { data, error } = await supabaseAdmin
    .from('stock_trades')
    .select('*')
    .eq('channel_id', channelId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list deleted stock trades: ${error.message}`);
  }
  return (data ?? []) as StockTrade[];
}

function normalize(input: StockTradeInput) {
  return {
    channel_id: input.channel_id ?? STOCKS_CHANNEL,
    trade_date: input.trade_date,
    symbol: input.symbol.trim().toUpperCase(),
    direction: input.direction,
    risk_dollars: Number(input.risk_dollars) || 0,
    entries: input.entries,
    exits: input.exits,
    seq: input.seq,
    peak_price: input.peak_price ?? null,
  };
}

export async function createStockTrade(input: StockTradeInput): Promise<StockTrade> {
  // New trades go to the end of the list unless a seq is given.
  let seq = input.seq;
  if (seq == null) {
    const { data: max } = await supabaseAdmin
      .from('stock_trades')
      .select('seq')
      .eq('channel_id', input.channel_id ?? STOCKS_CHANNEL)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    seq = (max?.seq ?? 0) + 1;
  }
  const { data, error } = await supabaseAdmin
    .from('stock_trades')
    .insert({ ...normalize(input), seq })
    .select('*')
    .single();
  if (error) {
    throw new Error(`Failed to create stock trade: ${error.message}`);
  }
  return data as StockTrade;
}

export async function updateStockTrade(id: string, input: StockTradeInput): Promise<void> {
  const { error } = await supabaseAdmin
    .from('stock_trades')
    .update(normalize(input))
    .eq('id', id);
  if (error) {
    throw new Error(`Failed to update stock trade: ${error.message}`);
  }
}

// Soft delete — recoverable from the recycle bin (never hard-deletes).
export async function deleteStockTrade(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('stock_trades')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    throw new Error(`Failed to delete stock trade: ${error.message}`);
  }
}

export async function restoreStockTrade(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('stock_trades')
    .update({ deleted_at: null })
    .eq('id', id);
  if (error) {
    throw new Error(`Failed to restore stock trade: ${error.message}`);
  }
}
