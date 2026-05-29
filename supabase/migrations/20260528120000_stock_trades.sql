-- The stocks momentum journal uses a shares/price/fees model (unlike the R-based
-- portfolio_risk channels): each trade has entry legs and exit legs, every leg a
-- {p: price, q: shares, f: fee$}. Risk is a fixed $ amount per trade and R = P/L ÷ risk.
-- This is a standalone, fully manual+editable journal for channel 932256154439020544.
create table stock_trades (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null default '932256154439020544',
  trade_date date not null,
  symbol text not null,
  direction text not null default 'long', -- 'long' | 'short'
  risk_dollars numeric not null default 0,
  entries jsonb not null default '[]'::jsonb, -- [{p,q,f}, ...]
  exits jsonb not null default '[]'::jsonb,   -- [{p,q,f}, ...]
  seq int not null default 0,                 -- preserves reference ordering / tie-break
  created_at timestamptz not null default now()
);

create index idx_stock_trades_channel on stock_trades(channel_id);

alter table stock_trades enable row level security;
