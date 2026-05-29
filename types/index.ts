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
  // reduce/close: the execution price stated in the message ("לסגור 20% במחיר
  // 4442" → 4442). Null for entries/commentary. Written to exit_price on save.
  exit_price: number | null;
  risk_percent: number | null;
  stop_price: number | null;
  tp_price: number | null;
  quantity_text: string | null;
  // momentum_stocks: numeric size this signal refers to as a fraction of a full
  // position (1 = full = $400 risk, 0.5 = half, ...). Null for portfolio_risk.
  quantity_fraction: number | null;
  // portfolio_risk reduce/close: % of the WHOLE position closed at this leg's
  // price ("לסגור 20%" → 20). Null when not a percentage scale-out.
  close_percent: number | null;
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

// ── Stocks journal: shares/price/fees model (momentum_stocks channel) ──
// A trade is a set of entry legs and exit legs; each leg is a fill at a price,
// for a number of shares, with a fee. Risk is a fixed $ amount and R = P/L ÷ risk.

export interface StockLeg {
  p: number; // price
  q: number; // shares
  f: number; // fee ($)
}

export interface StockTrade {
  id: string;
  channel_id: string;
  trade_date: string; // YYYY-MM-DD
  symbol: string;
  direction: TradeDirection;
  risk_dollars: number;
  entries: StockLeg[];
  exits: StockLeg[];
  seq: number; // display order
  created_at: string;
}

// New/edited trade payload (no id/created_at).
export type StockTradeInput = Omit<StockTrade, 'id' | 'created_at' | 'channel_id'> & {
  channel_id?: string;
};

export interface StockTradeCalc {
  totalQin: number;
  totalQout: number;
  avgEntry: number;
  avgExit: number;
  fees: number;
  positionDollar: number;
  pl: number;
  pct: number;
  rr: number;
  partial: boolean;
  result: 'open' | 'win' | 'loss';
}

// ── Positions: signals grouped into trades by asset + direction ──

export type LegKind = 'entry' | 'reduce' | 'close' | 'cancel';

// One realization step applied to an entry leg (which reduce/close consumed it).
export interface LegCloseEvent {
  date: string;
  fraction: number; // share of the leg's ORIGINAL size closed by this step
  price: number | null; // exit price of the step
  realized_dollars: number | null; // P/L $ realized on this step
  manually_edited: boolean; // true = hand-edited, false = from the bot
  label: string | null; // the reduce/close phrasing (חצי / עסקה אחרונה / 20%)
}

export interface PositionLeg {
  signal_id: string;
  date: string; // the source message's Discord timestamp
  kind: LegKind;
  entry_type: EntryType | null;
  price: number | null; // entry_price for entries; exit price filled manually
  stop: number | null; // the stop stated on this signal (entry leg's original stop)
  tp: number | null; // the take-profit stated on this signal
  risk_percent: number | null;
  quantity_text: string | null;
  close_percent: number | null; // % of position closed on this reduce/close leg
  needs_percent: boolean; // reduce leg whose close % couldn't be determined
  manually_edited: boolean; // true = hand-edited (locked from re-parse); false = from the bot
  remaining: number; // entry legs: 0..1 share still open (0 = fully closed → struck through)
  realized_dollars: number | null; // entry legs: P/L $ realized on closed portions (at exit prices)
  open_dollars: number | null; // entry legs: P/L $ on the still-open portion (marked to current price)
  closes: LegCloseEvent[]; // entry legs: the realization steps that consumed this leg
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
  closed_fraction: number; // 0..1 — share of the position realized via exits
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
  // Forward-looking potential on the still-open portion, vs the take-profit and
  // each leg's stop. Null when there's no TP or no open portion.
  potential_profit_percent: number | null;
  potential_profit_dollars: number | null;
  potential_loss_percent: number | null; // negative
  potential_loss_dollars: number | null; // negative
  potential_rr: number | null; // reward / risk (סיכוי/סיכון)
  needs_review: boolean;
}
