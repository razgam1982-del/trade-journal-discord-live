-- momentum_stocks sizing: a position is narrated as a fraction of a "full"
-- position (full = $400 risk). quantity_fraction holds the numeric size this
-- signal refers to (1.0 = full, 0.5 = half, 0.333 = third, ...). Null for the
-- portfolio_risk channels, which size by risk_percent instead.
alter table trade_signals add column quantity_fraction numeric;
