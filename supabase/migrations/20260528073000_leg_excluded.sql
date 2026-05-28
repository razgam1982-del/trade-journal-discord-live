-- A leg can be excluded from calculations (still visible, struck through, and
-- reversible). Exclusion affects aggregates only, not position grouping.
alter table trade_signals add column excluded boolean not null default false;
