import { NextRequest, NextResponse } from 'next/server';
import { saveDiscordMessage } from '@/services/discord-message-service';
import { parseTradeMessage, parseStockMessage } from '@/services/trade-parser-service';
import { upsertTradeSignal, replaceMessageSignals } from '@/services/trade-signal-service';
import { getChannel } from '@/services/channel-service';
import { setMarketPrice } from '@/services/market-price-service';
import type { DiscordMessagePayload } from '@/types';

export async function POST(req: NextRequest) {
  const secret = process.env.DISCORD_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured: missing secret' }, { status: 500 });
  }

  if (req.headers.get('x-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<DiscordMessagePayload>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    !body.discord_message_id ||
    !body.channel_id ||
    !body.author ||
    typeof body.raw_content !== 'string' ||
    !body.created_at
  ) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const saved = await saveDiscordMessage({
      discord_message_id: body.discord_message_id,
      channel_id: body.channel_id,
      channel_name: body.channel_name ?? null,
      author: body.author,
      raw_content: body.raw_content,
      created_at: body.created_at,
    });

    // Parse and persist the structured signal. A parse failure must not fail
    // the message save — the raw message is the source of truth and can be
    // re-parsed later. The channel's template decides the parser.
    try {
      const channel = await getChannel(body.channel_id);
      if (channel?.template === 'momentum_stocks') {
        const signals = await parseStockMessage(saved.raw_content);
        await replaceMessageSignals(saved.id, signals);
      } else {
        const parsed = await parseTradeMessage(saved.raw_content);
        await upsertTradeSignal(saved.id, parsed);
        if (parsed.current_price != null && parsed.asset) {
          await setMarketPrice(parsed.asset, parsed.current_price);
        }
      }
    } catch (err) {
      console.error(`Parse/persist failed for message ${saved.id}:`, err);
    }

    return NextResponse.json({ ok: true, id: saved.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
