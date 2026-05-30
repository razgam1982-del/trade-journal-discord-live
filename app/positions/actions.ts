'use server';

import { revalidatePath } from 'next/cache';
import {
  updateSignalPrice,
  setSignalExcluded,
  setSignalFilled,
  getSignalById,
  updateSignalFields,
  softDeleteSignals,
  restoreSignals,
  setSignalPeak,
} from '@/services/trade-signal-service';
import { setMarketPrice } from '@/services/market-price-service';
import { setPortfolioSize } from '@/services/settings-service';
import { assertEditor } from '@/lib/edit-auth';
import { supabaseAdmin } from '@/services/supabase';
import type { TradeSignal } from '@/types';

// Saves a manually-entered leg price. Entry legs write entry_price; exit
// legs (reduce/close) write exit_price.
export async function saveLegPrice(
  signalId: string,
  kind: string,
  value: number | null,
): Promise<void> {
  await assertEditor();
  const field = kind === 'entry' ? 'entry_price' : 'exit_price';
  await updateSignalPrice(signalId, field, value);
  revalidatePath('/positions');
}

// Exclude/restore a leg from the position's calculations.
export async function toggleLegExcluded(signalId: string, excluded: boolean): Promise<void> {
  await assertEditor();
  await setSignalExcluded(signalId, excluded);
  revalidatePath('/positions');
}

// Updates the portfolio size used to convert % into dollars.
export async function savePortfolioSize(size: number): Promise<void> {
  await assertEditor();
  if (!Number.isFinite(size) || size <= 0) return;
  await setPortfolioSize(size);
  revalidatePath('/positions');
}

// Sets the current market price for an asset (marks open positions to market).
export async function saveMarketPrice(asset: string, price: number | null): Promise<void> {
  await assertEditor();
  await setMarketPrice(asset, price);
  revalidatePath('/positions');
}

// Marks a limit/trigger entry as filled / pending (null = auto).
export async function saveLegFilled(signalId: string, filled: boolean | null): Promise<void> {
  await assertEditor();
  await setSignalFilled(signalId, filled);
  revalidatePath('/positions');
}

// Loads a signal's current values for the edit form.
export async function getSignalForEdit(id: string): Promise<TradeSignal | null> {
  return getSignalById(id);
}

// Saves a full manual edit of a signal's fields (the edit becomes authoritative).
export async function saveSignalEdits(
  id: string,
  fields: Record<string, string | number | null>,
): Promise<void> {
  await assertEditor();
  await updateSignalFields(id, fields);
  revalidatePath('/positions');
}

// Soft-deletes a single leg (one signal). Recoverable from the recycle bin.
export async function deleteSignal(id: string): Promise<void> {
  await assertEditor();
  await softDeleteSignals([id]);
  revalidatePath('/positions');
}

// Soft-deletes a whole position (all its leg signals).
export async function deletePosition(signalIds: string[]): Promise<void> {
  await assertEditor();
  await softDeleteSignals(signalIds);
  revalidatePath('/positions');
}

// Restores soft-deleted legs back into the journal.
export async function restoreSignal(id: string): Promise<void> {
  await assertEditor();
  await restoreSignals([id]);
  revalidatePath('/positions');
}

// Sets the position's manual peak price (on its anchor entry leg) for the
// "money left on the floor" metric.
export async function savePositionPeak(signalId: string, value: number | null): Promise<void> {
  await assertEditor();
  await setSignalPeak(signalId, value);
  revalidatePath('/positions');
}

// Manually opens a new trade in the given channel. The raw text is parsed by
// the same Claude parser the live Discord bot uses, so all the patterns the
// channel relies on (immediate / trigger / limit / stop / TP / risk %) work
// out of the box. The user can edit any field afterwards from the trade card.
export async function openTradeManually(
  channelId: string,
  rawText: string,
): Promise<void> {
  await assertEditor();
  if (!rawText.trim()) throw new Error('Empty message');

  const { parseTradeMessage } = await import('@/services/trade-parser-service');
  const parsed = await parseTradeMessage(rawText);

  // Get channel info for the synthetic message.
  const { data: ch, error: chErr } = await supabaseAdmin
    .from('channels')
    .select('channel_id, name')
    .eq('channel_id', channelId)
    .single();
  if (chErr || !ch) throw new Error('Channel not found');

  const nowIso = new Date().toISOString();
  const tag = `manual-open-${Date.now()}`;

  const { data: msg, error: msgErr } = await supabaseAdmin
    .from('discord_messages')
    .insert({
      discord_message_id: tag,
      channel_id: ch.channel_id,
      channel_name: ch.name,
      author: 'Manual',
      raw_content: rawText.trim(),
      created_at: nowIso,
      received_at: nowIso,
    })
    .select()
    .single();
  if (msgErr || !msg) throw new Error(`Failed to create message: ${msgErr?.message}`);

  const { error: sigErr } = await supabaseAdmin.from('trade_signals').insert({
    message_id: msg.id,
    signal_index: 0,
    is_trade: parsed.is_trade,
    asset: parsed.asset,
    asset_raw: parsed.asset_raw,
    direction: parsed.direction,
    action: parsed.action,
    entry_type: parsed.entry_type,
    entry_price: parsed.entry_price,
    exit_price: parsed.exit_price,
    stop_price: parsed.stop_price,
    tp_price: parsed.tp_price,
    risk_percent: parsed.risk_percent,
    quantity_text: parsed.quantity_text,
    close_percent: parsed.close_percent,
    parser_confidence: parsed.parser_confidence,
    parser_notes: parsed.parser_notes ?? 'manual open via UI',
    needs_review: false,
    manually_edited: true,
    excluded: false,
  });
  if (sigErr) throw new Error(`Failed to create signal: ${sigErr.message}`);

  revalidatePath('/positions');
}

// Manually closes an open position by inserting a synthetic 100%-close signal
// at the given price. Uses an anchor leg (an existing signal from the same
// position) for asset/direction/channel metadata.
export async function closePositionManually(
  anchorSignalId: string,
  exitPrice: number,
): Promise<void> {
  await assertEditor();
  if (!Number.isFinite(exitPrice)) throw new Error('Invalid exit price');

  const anchor = await getSignalById(anchorSignalId);
  if (!anchor) throw new Error('Anchor signal not found');

  const nowIso = new Date().toISOString();
  const tag = `manual-close-${anchor.id}-${Date.now()}`;

  // Get the original message for channel metadata.
  const { data: anchorMsg, error: msgErr } = await supabaseAdmin
    .from('discord_messages')
    .select('channel_id, channel_name, author')
    .eq('id', anchor.message_id)
    .single();
  if (msgErr || !anchorMsg) throw new Error('Anchor message not found');

  // Insert a synthetic message to host the close signal.
  const { data: newMsg, error: newMsgErr } = await supabaseAdmin
    .from('discord_messages')
    .insert({
      discord_message_id: tag,
      channel_id: anchorMsg.channel_id,
      channel_name: anchorMsg.channel_name,
      author: anchorMsg.author,
      raw_content: `${anchor.asset ?? ''} סגירה ידנית @ ${exitPrice}`,
      created_at: nowIso,
      received_at: nowIso,
    })
    .select()
    .single();
  if (newMsgErr || !newMsg) throw new Error(`Failed to create message: ${newMsgErr?.message}`);

  // Insert the close signal: 100% of remaining position at exitPrice.
  const { error: sigErr } = await supabaseAdmin.from('trade_signals').insert({
    message_id: newMsg.id,
    signal_index: 0,
    is_trade: true,
    asset: anchor.asset,
    asset_raw: anchor.asset_raw ?? anchor.asset,
    direction: anchor.direction,
    action: 'close',
    entry_type: null,
    entry_price: null,
    exit_price: exitPrice,
    stop_price: null,
    tp_price: null,
    risk_percent: null,
    quantity_text: 'סגירה ידנית',
    close_percent: 100,
    parser_confidence: 1.0,
    parser_notes: 'manual close via UI',
    needs_review: false,
    manually_edited: true,
    excluded: false,
  });
  if (sigErr) throw new Error(`Failed to create signal: ${sigErr.message}`);

  revalidatePath('/positions');
}
