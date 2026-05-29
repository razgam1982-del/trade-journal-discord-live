import { NextRequest, NextResponse } from 'next/server';
import { saveDiscordMessage } from '@/services/discord-message-service';
import { parseTradeMessage, parseStockMessage } from '@/services/trade-parser-service';
import { upsertTradeSignal, replaceMessageSignals } from '@/services/trade-signal-service';
import { getChannel } from '@/services/channel-service';
import { setMarketPrice } from '@/services/market-price-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Backfill route: ingests a batch of historical messages through the same
// pipeline as the live webhook (save → parse → persist signal).
export async function POST(req: NextRequest) {
  if (req.headers.get('x-webhook-secret') !== process.env.DISCORD_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const messages: Array<Record<string, string>> = body.messages ?? [];
  const results = [];

  for (const m of messages) {
    try {
      const channelId = m.channel_id ?? 'backfill';
      const saved = await saveDiscordMessage({
        discord_message_id: m.discord_message_id,
        channel_id: channelId,
        channel_name: m.channel_name ?? 'עסקאות-נדירות-מיוחדות',
        author: m.author ?? 'Raz Gamliel',
        raw_content: m.raw_content,
        created_at: m.created_at,
      });

      const channel = await getChannel(channelId);
      if (channel?.template === 'momentum_stocks') {
        const signals = await parseStockMessage(saved.raw_content);
        await replaceMessageSignals(saved.id, signals);
        results.push({
          id: m.discord_message_id,
          template: 'momentum_stocks',
          signals: signals.map((s) => ({ asset: s.asset, action: s.action, quantity_fraction: s.quantity_fraction })),
        });
      } else {
        const parsed = await parseTradeMessage(saved.raw_content);
        await upsertTradeSignal(saved.id, parsed);
        // A stated "מחיר נוכחי"/"מחיר כעת" updates the asset's current market price.
        if (parsed.current_price != null && parsed.asset) {
          await setMarketPrice(parsed.asset, parsed.current_price);
        }
        results.push({
          id: m.discord_message_id,
          is_trade: parsed.is_trade,
          asset: parsed.asset,
          direction: parsed.direction,
          action: parsed.action,
        });
      }
    } catch (err) {
      results.push({
        id: m.discord_message_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ count: results.length, results });
}
