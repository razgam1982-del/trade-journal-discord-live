import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  type Message,
  type PartialMessage,
  type TextBasedChannel,
} from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN;
const targetChannelId = process.env.DISCORD_CHANNEL_ID?.trim();
const webhookUrl = process.env.WEBHOOK_URL?.trim();
const webhookSecret = process.env.WEBHOOK_SECRET?.trim();

if (!token) {
  console.error('Missing DISCORD_BOT_TOKEN in bot/.env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  // Needed so edits of messages not in cache still fire Events.MessageUpdate.
  partials: [Partials.Message, Partials.Channel],
});

function channelName(channel: TextBasedChannel): string | null {
  return 'name' in channel && channel.name ? channel.name : null;
}

async function forward(message: Message, label: 'new' | 'edit'): Promise<void> {
  if (message.author?.bot) return;
  if (targetChannelId && message.channelId !== targetChannelId) return;
  if (!message.content?.trim()) return;

  const payload = {
    discord_message_id: message.id,
    channel_id: message.channelId,
    channel_name: channelName(message.channel),
    author: message.author?.username ?? 'unknown',
    raw_content: message.content,
    created_at: message.createdAt.toISOString(),
  };

  console.log('────────────────────────────');
  console.log(`[${label}] ${payload.raw_content}`);

  if (!webhookUrl || !webhookSecret) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': webhookSecret },
      body: JSON.stringify(payload),
    });
    console.log(res.ok ? `✓ forwarded (${res.status})` : `✗ rejected (${res.status}): ${await res.text()}`);
  } catch (err) {
    console.error(`✗ webhook request failed: ${(err as Error).message}`);
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`Bot ready as ${c.user.tag}`);
  console.log(
    targetChannelId
      ? `Listening to channel id: ${targetChannelId} (new messages + edits)`
      : 'Listening to ALL channels',
  );
  if (!webhookUrl || !webhookSecret) {
    console.warn('WEBHOOK_URL / WEBHOOK_SECRET not set — messages logged but NOT forwarded');
  }
});

client.on(Events.MessageCreate, (message) => {
  void forward(message, 'new');
});

client.on(Events.MessageUpdate, async (_old, newMessage: Message | PartialMessage) => {
  // Edited messages may be partial if they weren't cached — fetch the full one.
  const full = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
  if (full) void forward(full as Message, 'edit');
});

client.login(token);
