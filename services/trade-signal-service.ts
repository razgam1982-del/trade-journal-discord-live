import { supabaseAdmin } from './supabase';
import type { ParsedSignal, TradeSignal, TradeSignalWithMessage } from '@/types';

const EDITABLE_FIELDS = new Set([
  'asset',
  'asset_raw',
  'direction',
  'action',
  'entry_type',
  'entry_price',
  'exit_price',
  'stop_price',
  'tp_price',
  'risk_percent',
  'quantity_text',
]);

// Reads a single signal row (for the edit form).
export async function getSignalById(id: string): Promise<TradeSignal | null> {
  const { data, error } = await supabaseAdmin
    .from('trade_signals')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read signal: ${error.message}`);
  }
  return (data as TradeSignal) ?? null;
}

// Applies a manual edit to any whitelisted fields and marks the row edited so a
// re-parse won't overwrite it. The user's edit is the source of truth.
export async function updateSignalFields(
  id: string,
  fields: Record<string, string | number | null>,
): Promise<void> {
  const update: Record<string, string | number | null | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (EDITABLE_FIELDS.has(key)) update[key] = value;
  }
  update.manually_edited = true;
  const { error } = await supabaseAdmin.from('trade_signals').update(update).eq('id', id);
  if (error) {
    throw new Error(`Failed to update signal: ${error.message}`);
  }
}

// Persists the parsed signal for a message. Idempotent on message_id, so a
// re-parse (e.g. after a Discord edit) updates the same row — but never
// overwrites a signal that was corrected by hand in the journal.
export async function upsertTradeSignal(
  messageId: string,
  parsed: ParsedSignal,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('trade_signals')
    .select('manually_edited')
    .eq('message_id', messageId)
    .maybeSingle();

  if (existing?.manually_edited) return;

  const { error } = await supabaseAdmin.from('trade_signals').upsert(
    {
      message_id: messageId,
      ...parsed,
      needs_review: parsed.parser_confidence < 0.6,
    },
    { onConflict: 'message_id' },
  );

  if (error) {
    throw new Error(`Failed to upsert trade signal: ${error.message}`);
  }
}

const EDITABLE_PRICE_FIELDS = new Set(['entry_price', 'exit_price', 'stop_price', 'tp_price']);

// Manually sets a price field on a signal and marks it edited, so a later
// re-parse (Discord edit) won't overwrite the correction.
export async function updateSignalPrice(
  signalId: string,
  field: string,
  value: number | null,
): Promise<void> {
  if (!EDITABLE_PRICE_FIELDS.has(field)) {
    throw new Error(`Field not editable: ${field}`);
  }
  const { error } = await supabaseAdmin
    .from('trade_signals')
    .update({ [field]: value, manually_edited: true })
    .eq('id', signalId);
  if (error) {
    throw new Error(`Failed to update signal: ${error.message}`);
  }
}

// Manually sets whether a limit/trigger entry filled (null = auto).
export async function setSignalFilled(signalId: string, filled: boolean | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from('trade_signals')
    .update({ filled })
    .eq('id', signalId);
  if (error) {
    throw new Error(`Failed to update signal: ${error.message}`);
  }
}

// Excludes/restores a leg from calculations (still shown in the journal).
export async function setSignalExcluded(signalId: string, excluded: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from('trade_signals')
    .update({ excluded })
    .eq('id', signalId);
  if (error) {
    throw new Error(`Failed to update signal: ${error.message}`);
  }
}

// Trade signals (is_trade = true) joined with their source message, newest first.
export async function listTradeSignals(limit = 200): Promise<TradeSignalWithMessage[]> {
  const { data, error } = await supabaseAdmin
    .from('trade_signals')
    .select('*, message:discord_messages(raw_content, author, channel_name, created_at, discord_message_id, channel_id)')
    .eq('is_trade', true)
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list trade signals: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as TradeSignalWithMessage[];
  return rows.sort(
    (a, b) =>
      new Date(b.message.created_at).getTime() - new Date(a.message.created_at).getTime(),
  );
}
