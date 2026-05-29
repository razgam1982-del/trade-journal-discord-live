import type { StockLeg, StockTrade, StockTradeCalc } from '@/types';

// Pure trade math — safe to import from both server and client code.

const sumQ = (legs: StockLeg[]) => legs.reduce((s, l) => s + (Number(l.q) || 0), 0);
const sumF = (legs: StockLeg[]) => legs.reduce((s, l) => s + (Number(l.f) || 0), 0);
const value = (legs: StockLeg[]) => legs.reduce((s, l) => s + (Number(l.p) || 0) * (Number(l.q) || 0), 0);

// Derives a trade's metrics from its legs. Mirrors the reference journal exactly:
// P/L = sign·(avgExit − avgEntry)·sharesOut − fees, and R = P/L ÷ risk$.
export function calcStockTrade(
  t: Pick<StockTrade, 'direction' | 'risk_dollars' | 'entries' | 'exits'>,
): StockTradeCalc {
  const totalQin = sumQ(t.entries);
  const totalQout = sumQ(t.exits);
  const avgEntry = totalQin > 0 ? value(t.entries) / totalQin : 0;
  const avgExit = totalQout > 0 ? value(t.exits) / totalQout : 0;
  const fees = sumF(t.entries) + sumF(t.exits);
  const positionDollar = value(t.entries);

  let pl = 0;
  if (totalQout > 0 && totalQin > 0) {
    const sign = t.direction === 'short' ? -1 : 1;
    pl = sign * (avgExit - avgEntry) * totalQout - fees;
  }
  const pct = positionDollar > 0 && totalQout > 0 ? (pl / positionDollar) * 100 : 0;
  const rr = Number(t.risk_dollars) > 0 && totalQout > 0 ? pl / Number(t.risk_dollars) : 0;
  const partial = totalQout > 0 && totalQout < totalQin;
  const result: StockTradeCalc['result'] = totalQout > 0 ? (pl >= 0 ? 'win' : 'loss') : 'open';

  return { totalQin, totalQout, avgEntry, avgExit, fees, positionDollar, pl, pct, rr, partial, result };
}
