-- Replace the generic trades table with trade_signals, tailored to the
-- "portfolio risk" signal channels (special trades, nostro): one parsed row
-- per Discord message. A message may be commentary (is_trade = false) or a
-- trade event (entry / add / reduce / close / stop_update / cancel).

drop table if exists trades;
drop type if exists trade_action;
drop type if exists price_source;
drop type if exists asset_type;

create table trade_signals (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references discord_messages(id) on delete cascade,
  is_trade boolean not null default false,   -- false = general commentary, not a trade signal
  asset text,                                -- normalized, e.g. "XAUUSD", "META"
  asset_raw text,                            -- as written, e.g. "זהב"
  direction text,                            -- "long" | "short"
  action text,                               -- entry | add | reduce | close | stop_update | cancel | other
  entry_type text,                           -- immediate | trigger
  trigger_price numeric,
  risk_percent numeric,                      -- % of portfolio
  stop_price numeric,
  tp_price numeric,
  quantity_text text,                        -- free text like "חצי"
  parser_confidence numeric,                 -- 0..1
  parser_notes text,
  needs_review boolean not null default false,
  created_at timestamptz not null default now()
);

-- One signal per message: re-parsing the same message replaces the row.
create unique index idx_trade_signals_message_id on trade_signals(message_id);

alter table trade_signals enable row level security;
