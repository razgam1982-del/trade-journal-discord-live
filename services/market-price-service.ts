import { supabaseAdmin } from './supabase';

// Current market price per asset (manual), keyed by normalized asset symbol.
export async function getMarketPrices(): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin.from('market_prices').select('asset, price');
  if (error) {
    throw new Error(`Failed to read market prices: ${error.message}`);
  }
  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    map[(row as { asset: string }).asset] = Number((row as { price: number }).price);
  }
  return map;
}

export async function setMarketPrice(asset: string, price: number | null): Promise<void> {
  if (price == null) {
    const { error } = await supabaseAdmin.from('market_prices').delete().eq('asset', asset);
    if (error) throw new Error(`Failed to clear market price: ${error.message}`);
    return;
  }
  const { error } = await supabaseAdmin
    .from('market_prices')
    .upsert({ asset, price, updated_at: new Date().toISOString() }, { onConflict: 'asset' });
  if (error) {
    throw new Error(`Failed to set market price: ${error.message}`);
  }
}
