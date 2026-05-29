-- Manually-entered peak price the asset reached after a position was exited.
-- Stored on the position's anchor (first entry) signal. Used for "money left on
-- the floor" in the R-journal — extra profit missed by exiting before the peak.
alter table trade_signals add column peak_price numeric;
