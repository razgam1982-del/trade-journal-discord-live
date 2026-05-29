-- Stocks momentum-swing channel ("מסחר מומנטום סווינג הון עצמי").
-- Uses the momentum_stocks template: qualitative fractional sizing, $-denominated
-- risk ($400 = full position), multiple tickers per message.
insert into channels (channel_id, name, template) values
  ('932256154439020544', 'מסחר מומנטום סווינג הון עצמי', 'momentum_stocks')
on conflict (channel_id) do nothing;
