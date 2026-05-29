-- Manually-entered peak price a stock reached after the trade was exited. Used
-- to compute "money left on the floor" — the extra profit missed by exiting
-- before the peak. Null = not tracked.
alter table stock_trades add column peak_price numeric;
