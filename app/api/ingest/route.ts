import { NextRequest, NextResponse } from 'next/server';
import { saveDiscordMessage } from '@/services/discord-message-service';
import { parseTradeMessage } from '@/services/trade-parser-service';
import { upsertTradeSignal } from '@/services/trade-signal-service';

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
      const saved = await saveDiscordMessage({
        discord_message_id: m.discord_message_id,
        channel_id: m.channel_id ?? 'backfill',
        channel_name: m.channel_name ?? 'עסקאות-נדירות-מיוחדות',
        author: m.author ?? 'Raz Gamliel',
        raw_content: m.raw_content,
        created_at: m.created_at,
      });
      const parsed = await parseTradeMessage(saved.raw_content);
      await upsertTradeSignal(saved.id, parsed);
      results.push({
        id: m.discord_message_id,
        is_trade: parsed.is_trade,
        asset: parsed.asset,
        direction: parsed.direction,
        action: parsed.action,
      });
    } catch (err) {
      results.push({
        id: m.discord_message_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ count: results.length, results });
}
