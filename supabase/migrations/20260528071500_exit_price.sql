-- Actual exit fill price for reduce/close legs (filled manually in the journal).
-- Entry legs use entry_price; exit legs use exit_price.
alter table trade_signals add column exit_price numeric;
