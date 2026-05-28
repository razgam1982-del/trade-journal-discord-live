-- Initial schema for trade-journal-discord-live
-- Two tables: raw Discord messages (source of truth) + parsed trades (rebuildable layer)

-- Enums
create type asset_type as enum ('stock', 'crypto', 'futures');
create type trade_action as enum ('entry', 'partial_exit', 'full_exit');
create type price_source as enum ('from_message', 'external_api', 'manual');

-- Raw messages captured from Discord. This is the source of truth.
create table discord_messages (
  id uuid primary key default gen_random_uuid(),
  discord_message_id text not null unique,
  channel_id text not null,
  channel_name text,
  author text not null,
  raw_content text not null,
  created_at timestamptz not null,                 -- when the message was written in Discord
  received_at timestamptz not null default now()   -- when our app received it
);

-- Parsed trades derived from a message. Can always be rebuilt from raw_content.
create table trades (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references discord_messages(id) on delete cascade,
  symbol text,
  asset_type asset_type,
  action trade_action,
  quantity_text text,                              -- free text like "חצי" / "שליש" / "הכל"
  price numeric,
  price_source price_source,
  parser_confidence numeric,                       -- 0..1 from the parser
  needs_review boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_trades_message_id on trades(message_id);
create index idx_discord_messages_created_at on discord_messages(created_at desc);

-- Lock down: all access is server-side via the service_role key (which bypasses RLS).
-- No anon policies, so the anon key cannot read or write these tables.
alter table discord_messages enable row level security;
alter table trades enable row level security;
