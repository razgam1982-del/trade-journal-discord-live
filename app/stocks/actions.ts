'use server';

import { revalidatePath } from 'next/cache';
import {
  createStockTrade,
  updateStockTrade,
  deleteStockTrade,
} from '@/services/stock-trade-service';
import { assertEditor } from '@/lib/edit-auth';
import type { StockTradeInput } from '@/types';

// Creates a new stock trade or updates an existing one (id = null → create).
export async function saveStockTrade(id: string | null, input: StockTradeInput): Promise<void> {
  await assertEditor();
  if (id) {
    await updateStockTrade(id, input);
  } else {
    await createStockTrade(input);
  }
  revalidatePath('/positions');
  revalidatePath('/');
}

export async function removeStockTrade(id: string): Promise<void> {
  await assertEditor();
  await deleteStockTrade(id);
  revalidatePath('/positions');
  revalidatePath('/');
}
