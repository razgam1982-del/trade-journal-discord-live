-- Percentage scale-outs for the R-journal (portfolio_risk channels): a reduce/
-- close leg can state what fraction of the WHOLE position it closes ("לסגור 20%").
-- The journal weights each scale-out by this % to realize only that portion of
-- the position's R at the leg's price, leaving the rest open. Null = not stated.
alter table trade_signals add column close_percent numeric;
