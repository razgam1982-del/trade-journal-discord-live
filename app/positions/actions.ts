'use server';

import { revalidatePath } from 'next/cache';
import {
  updateSignalPrice,
  setSignalExcluded,
  getSignalById,
  updateSignalFields,
} from '@/services/trade-signal-service';
import { setMarketPrice } from '@/services/market-price-service';
import { setPortfolioSize } from '@/services/settings-service';
import type { TradeSignal } from '@/types';

// Saves a manually-entered leg price. Entry legs write entry_price; exit
// legs (reduce/close) write exit_price.
export async function saveLegPrice(
  signalId: string,
  kind: string,
  value: number | null,
): Promise<void> {
  const field = kind === 'entry' ? 'entry_price' : 'exit_price';
  await updateSignalPrice(signalId, field, value);
  revalidatePath('/positions');
}

// Exclude/restore a leg from the position's calculations.
export async function toggleLegExcluded(signalId: string, excluded: boolean): Promise<void> {
  await setSignalExcluded(signalId, excluded);
  revalidatePath('/positions');
}

// Updates the portfolio size used to convert % into dollars.
export async function savePortfolioSize(size: number): Promise<void> {
  if (!Number.isFinite(size) || size <= 0) return;
  await setPortfolioSize(size);
  revalidatePath('/positions');
}

// Sets the current market price for an asset (marks open positions to market).
export async function saveMarketPrice(asset: string, price: number | null): Promise<void> {
  await setMarketPrice(asset, price);
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
  await updateSignalFields(id, fields);
  revalidatePath('/positions');
}
