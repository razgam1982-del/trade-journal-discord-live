-- Soft delete for both journals. A non-null deleted_at hides the row from the
-- journal views but keeps it recoverable from the owner-only recycle bin. The
-- delete action never hard-deletes — forward-only and reversible.
alter table trade_signals add column deleted_at timestamptz;
alter table stock_trades add column deleted_at timestamptz;
