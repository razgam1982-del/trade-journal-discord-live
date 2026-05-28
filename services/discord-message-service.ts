import { supabaseAdmin } from './supabase';
import type { DiscordMessage, DiscordMessagePayload } from '@/types';

// Saves a raw Discord message. Idempotent: a repeated delivery of the same
// discord_message_id updates the existing row instead of creating a duplicate.
export async function saveDiscordMessage(
  payload: DiscordMessagePayload,
): Promise<DiscordMessage> {
  const { data, error } = await supabaseAdmin
    .from('discord_messages')
    .upsert(
      {
        discord_message_id: payload.discord_message_id,
        channel_id: payload.channel_id,
        channel_name: payload.channel_name,
        author: payload.author,
        raw_content: payload.raw_content,
        created_at: payload.created_at,
      },
      { onConflict: 'discord_message_id' },
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save discord message: ${error.message}`);
  }

  return data as DiscordMessage;
}

// Returns the most recent messages, newest first.
export async function listDiscordMessages(limit = 100): Promise<DiscordMessage[]> {
  const { data, error } = await supabaseAdmin
    .from('discord_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list discord messages: ${error.message}`);
  }

  return (data ?? []) as DiscordMessage[];
}
