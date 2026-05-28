import { supabaseAdmin } from './supabase';

const DEFAULT_PORTFOLIO_SIZE = 100000;

export async function getPortfolioSize(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'portfolio_size')
    .maybeSingle();
  const n = data ? Number((data as { value: string }).value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORTFOLIO_SIZE;
}

export async function setPortfolioSize(size: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('app_settings')
    .upsert(
      { key: 'portfolio_size', value: String(size), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  if (error) {
    throw new Error(`Failed to set portfolio size: ${error.message}`);
  }
}
