-- Manual override for whether a limit/trigger entry actually filled.
-- null = auto (grouping decides), true/false = user override.
alter table trade_signals add column filled boolean;
