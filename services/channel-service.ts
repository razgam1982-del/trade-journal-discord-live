import { supabaseAdmin } from './supabase';

export interface Channel {
  channel_id: string;
  name: string;
  template: 'portfolio_risk' | 'momentum_stocks';
  enabled: boolean;
}

export async function listChannels(): Promise<Channel[]> {
  const { data, error } = await supabaseAdmin
    .from('channels')
    .select('channel_id, name, template, enabled')
    .eq('enabled', true)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`Failed to list channels: ${error.message}`);
  }
  return (data ?? []) as Channel[];
}

export async function getChannel(channelId: string): Promise<Channel | null> {
  const { data } = await supabaseAdmin
    .from('channels')
    .select('channel_id, name, template, enabled')
    .eq('channel_id', channelId)
    .maybeSingle();
  return (data as Channel) ?? null;
}
