-- A single Discord message in the stocks channel often contains several
-- distinct trade events ("נכנסתי שליש כמות FAS ... פתחתי שליש כמות LAES").
-- Allow multiple signals per message, keyed by (message_id, signal_index).
-- Existing rows (one per message) keep signal_index = 0, so the portfolio_risk
-- channels are unaffected.
alter table trade_signals add column signal_index int not null default 0;

drop index if exists idx_trade_signals_message_id;
create unique index idx_trade_signals_message_signal on trade_signals(message_id, signal_index);
