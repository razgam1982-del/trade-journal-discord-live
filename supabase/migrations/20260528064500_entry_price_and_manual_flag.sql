-- trigger_price now holds the planned entry level for either a trigger
-- (breakout) or a limit (pullback) entry, so rename it to entry_price.
alter table trade_signals rename column trigger_price to entry_price;

-- A signal corrected by hand in the journal must not be overwritten when the
-- source message is edited in Discord and re-parsed.
alter table trade_signals add column manually_edited boolean not null default false;
