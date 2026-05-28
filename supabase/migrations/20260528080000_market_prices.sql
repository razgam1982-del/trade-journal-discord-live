-- Current market price per asset (entered manually), used to mark open
-- positions to market and show unrealized P/L ("profit on the table").
create table market_prices (
  asset text primary key,
  price numeric not null,
  updated_at timestamptz not null default now()
);

alter table market_prices enable row level security;
