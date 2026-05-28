// Shared types — single source of truth for the whole app.

// Taxonomy for the "portfolio risk" signal channels (special trades, nostro).
export type TradeDirection = 'long' | 'short';
export type TradeActionKind =
  | 'entry'
  | 'add'
  | 'reduce'
  | 'close'
  | 'stop_update'
  | 'cancel'
  | 'fill'
  | 'other';
export type EntryType = 'immediate' | 'trigger' | 'limit';

// Payload the Discord bot POSTs to the webhook.
export interface DiscordMessagePayload {
  discord_message_id: string;
  channel_id: string;
  channel_name: string | null;
  author: string;
  raw_content: string;
  created_at: string; // ISO timestamp of when it was written in Discord
}

// A row in the discord_messages table.
export interface DiscordMessage extends DiscordMessagePayload {
  id: string;
  received_at: string;
}

// The structured result of parsing one message (before persistence).
export interface ParsedSignal {
  is_trade: boolean;
  asset: string | null;
  asset_raw: string | null;
  direction: TradeDirection | null;
  action: TradeActionKind | null;
  entry_type: EntryType | null;
  entry_price: number | null;
  risk_percent: number | null;
  stop_price: number | null;
  tp_price: number | null;
  quantity_text: string | null;
  parser_confidence: number;
  parser_notes: string | null;
}

// A row in the trade_signals table.
export interface TradeSignal extends ParsedSignal {
  id: string;
  message_id: string;
  exit_price: number | null; // actual exit fill for reduce/close legs (manual)
  needs_review: boolean;
  manually_edited: boolean;
  excluded: boolean; // excluded from calculations (still shown)
  filled: boolean | null; // manual override for limit/trigger fill (null = auto)
  created_at: string;
}

// A trade signal joined with its source Discord message (for the journal view).
export interface TradeSignalWithMessage extends TradeSignal {
  message: {
    raw_content: string;
    author: string;
    channel_name: string | null;
    created_at: string;
    discord_message_id: string;
    channel_id: string;
  };
}

// ── Positions: signals grouped into trades by asset + direction ──

export type LegKind = 'entry' | 'reduce' | 'close' | 'cancel';

export interface PositionLeg {
  signal_id: string;
  date: string; // the source message's Discord timestamp
  kind: LegKind;
  entry_type: EntryType | null;
  price: number | null; // entry_price for entries; exit price filled manually
  stop: number | null; // the stop stated on this signal (entry leg's original stop)
  risk_percent: number | null;
  quantity_text: string | null;
  excluded: boolean;
  pending: boolean; // limit/trigger entry not yet filled — shown but 0 performance
  filled_override: boolean | null; // manual fill override from the signal
  raw_content: string;
  discord_url: string | null; // deep link to the source Discord message (live only)
}

export interface Position {
  key: string; // `${asset}|${direction}`
  asset: string;
  direction: TradeDirection | 'unknown';
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  legs: PositionLeg[];
  confirm_dates: string[]; // timestamps that confirm pending entries filled (internal)
  current_stop: number | null; // latest stop (after moves) — current risk
  current_tp: number | null;
  total_risk_percent: number; // sum of included entry legs' portfolio risk
  avg_entry_price: number | null; // included entries, weighted by risk%
  avg_exit_price: number | null; // average of filled exit-leg prices
  r_achieved: number | null; // blended R vs each leg's original stop
  pnl_percent: number | null; // realized P/L as % of portfolio
  pnl_dollars: number | null; // realized P/L in $ (P/L% × portfolio size)
  // Unrealized — open positions marked to the current price.
  current_price: number | null;
  unrealized_pnl_percent: number | null;
  unrealized_pnl_dollars: number | null;
  unrealized_r: number | null;
  needs_review: boolean;
}
