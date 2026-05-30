import { listTradeSignals } from './trade-signal-service';
import { getMarketPrices } from './market-price-service';
import { getPortfolioSize } from './settings-service';
import type {
  Position,
  PositionLeg,
  TradeDirection,
  TradeSignalWithMessage,
} from '@/types';

const OPENING_ACTIONS = new Set(['entry', 'add']);

// Single Discord server ("RG Trading Academy"). Used to deep-link to the
// source message. Backfilled rows use synthetic ids and get no link.
const GUILD_ID = '932255769481596959';

function assetOf(s: TradeSignalWithMessage): string {
  return s.asset ?? s.asset_raw ?? 'unknown';
}

function discordUrl(s: TradeSignalWithMessage): string | null {
  const ch = s.message.channel_id;
  const mid = s.message.discord_message_id;
  if (/^\d+$/.test(ch) && /^\d+$/.test(mid)) {
    return `https://discord.com/channels/${GUILD_ID}/${ch}/${mid}`;
  }
  return null;
}

function newPosition(
  asset: string,
  direction: TradeDirection | 'unknown',
  openedAt: string,
): Position {
  return {
    key: `${asset}|${direction}`,
    asset,
    direction,
    status: 'open',
    opened_at: openedAt,
    closed_at: null,
    legs: [],
    signal_ids: [],
    closed_fraction: 0,
    confirm_dates: [],
    current_stop: null,
    current_tp: null,
    total_risk_percent: 0,
    avg_entry_price: null,
    avg_exit_price: null,
    r_achieved: null,
    pnl_percent: null,
    pnl_dollars: null,
    current_price: null,
    unrealized_pnl_percent: null,
    unrealized_pnl_dollars: null,
    unrealized_r: null,
    potential_profit_percent: null,
    potential_profit_dollars: null,
    potential_loss_percent: null,
    potential_loss_dollars: null,
    potential_rr: null,
    peak_price: null,
    left_on_floor_dollars: null,
    left_on_floor_percent: null,
    left_on_floor_r: null,
    needs_review: false,
  };
}

function legFromSignal(
  s: TradeSignalWithMessage,
  kind: PositionLeg['kind'],
): PositionLeg {
  return {
    signal_id: s.id,
    date: s.message.created_at,
    kind,
    entry_type: s.entry_type,
    // Entry legs carry the entry price; exit legs carry the (manual) exit price.
    price: kind === 'entry' ? s.entry_price : s.exit_price,
    stop: s.stop_price,
    tp: s.tp_price,
    risk_percent: s.risk_percent,
    quantity_text: s.quantity_text,
    close_percent: s.close_percent,
    needs_percent: false, // set in finalize
    manually_edited: s.manually_edited,
    remaining: 1, // recomputed in finalize for entry legs
    realized_dollars: null, // accumulated in finalize (closed portions)
    open_dollars: null, // accumulated in mark (open portion)
    peak_price: s.peak_price, // manual position peak (set on the anchor entry leg)
    closes: [], // realization steps recorded in finalize
    excluded: s.excluded,
    pending: false, // computed in finalize
    filled_override: s.filled,
    raw_content: s.message.raw_content,
    discord_url: discordUrl(s),
  };
}

// A limit/trigger entry is pending (0 performance) until it's confirmed filled.
function computePending(leg: PositionLeg, confirmDates: string[]): boolean {
  if (leg.kind !== 'entry') return false;
  if (leg.filled_override === true) return false;
  if (leg.filled_override === false) return true;
  if (leg.entry_type !== 'limit' && leg.entry_type !== 'trigger') return false; // immediate fills now
  return !confirmDates.some((d) => d >= leg.date);
}

// Recomputes aggregates that depend only on the active (non-excluded, non-pending) legs.
function finalize(pos: Position, portfolioSize: number): void {
  for (const leg of pos.legs) leg.pending = computePending(leg, pos.confirm_dates);

  const entries = pos.legs.filter((l) => l.kind === 'entry' && !l.excluded && !l.pending);
  pos.total_risk_percent = entries.reduce((sum, l) => sum + (l.risk_percent ?? 0), 0);

  const priced = entries.filter((l) => l.price != null);
  const weightSum = priced.reduce((s, l) => s + (l.risk_percent ?? 1), 0);
  pos.avg_entry_price =
    priced.length && weightSum > 0
      ? priced.reduce((s, l) => s + l.price! * (l.risk_percent ?? 1), 0) / weightSum
      : null;

  const short = pos.direction === 'short';
  const dirKnown = pos.direction === 'long' || pos.direction === 'short';

  // R% a (whole) entry leg realizes if it exits at `price`, against its ORIGINAL
  // stop (the stop that fixed its size). null when not computable (no price yet).
  const legR = (leg: PositionLeg, price: number): number | null => {
    if (!dirKnown || leg.price == null || leg.stop == null || leg.risk_percent == null) return null;
    const riskDist = short ? leg.stop - leg.price : leg.price - leg.stop;
    if (riskDist <= 0) return null;
    const reward = short ? leg.price - price : price - leg.price;
    return (reward / riskDist) * leg.risk_percent;
  };

  // Per-leg accounting: every entry leg starts fully open (remaining = 1). Exit
  // events consume from the legs and realize their R at the event's price. This
  // runs even before prices are filled, so "closed/reduced" shows immediately.
  const open = entries.map((leg) => {
    leg.remaining = 1;
    return { leg, remaining: 1 };
  });
  const dayOf = (iso: string) => iso.slice(0, 10);

  const exitLegs = pos.legs.filter(
    (l) => (l.kind === 'reduce' || l.kind === 'close') && !l.excluded,
  );
  let realized = 0;
  let closedRisk = 0;
  let exitNum = 0;
  let exitDen = 0;
  let anyRealized = false;

  const consume = (o: { leg: PositionLeg; remaining: number }, take: number, ev: PositionLeg) => {
    if (take <= 1e-9) return;
    const price = ev.price; // exit_price of the reduce/close event
    const rk = o.leg.risk_percent ?? 0;
    const r = price != null ? legR(o.leg, price) : null;
    let stepRealized: number | null = null;
    if (r != null) {
      realized += take * r;
      exitNum += take * rk * price!;
      exitDen += take * rk;
      anyRealized = true;
      stepRealized = ((take * r) / 100) * portfolioSize;
      o.leg.realized_dollars = (o.leg.realized_dollars ?? 0) + stepRealized;
    }
    closedRisk += take * rk;
    o.remaining -= take;
    o.leg.remaining = o.remaining;
    // Record this realization step on the entry leg, for the per-leg history view.
    o.leg.closes.push({
      date: ev.date,
      fraction: take,
      price,
      realized_dollars: stepRealized,
      manually_edited: ev.manually_edited,
      label: ev.quantity_text,
    });
  };

  for (const ev of exitLegs) {
    ev.needs_percent = false;
    const qt = ev.quantity_text?.trim() ?? '';
    const frac = exitFraction(ev);

    // A reduce/close only affects legs that were already open when it happened.
    const beforeEv = (o: { leg: PositionLeg; remaining: number }) => o.remaining > 1e-9 && o.leg.date <= ev.date;

    // If close_percent was explicitly set (manual edit), the user has overridden
    // any leg-scoped phrasing in the text — apply the fraction position-wide.
    const explicitPct = ev.close_percent != null;

    if (!explicitPct && /אחרונ/.test(qt)) {
      // Leg-scoped: "עסקה אחרונה" (1 leg) or "N עסקאות אחרונות" (the N most recent
      // legs). A fraction ("חצי מהעסקה האחרונה") applies per leg; else close fully.
      const countMatch = qt.match(/(\d+)\s*עסק/);
      const count = countMatch ? Math.max(1, parseInt(countMatch[1], 10)) : 1;
      const cands = open.filter(beforeEv).sort((a, b) => b.leg.date.localeCompare(a.leg.date));
      for (let i = 0; i < count && i < cands.length; i++) {
        consume(cands[i], frac != null ? Math.min(frac, cands[i].remaining) : cands[i].remaining, ev);
      }
    } else if (!explicitPct && /היום/.test(qt)) {
      // "של היום" — every still-open leg opened on the same day.
      const d = dayOf(ev.date);
      for (const o of open) {
        if (beforeEv(o) && dayOf(o.leg.date) === d) consume(o, frac != null ? Math.min(frac, o.remaining) : o.remaining, ev);
      }
    } else if (frac != null) {
      // Percentage scale-out — take `frac` of each leg open at this point.
      for (const o of open) if (beforeEv(o)) consume(o, Math.min(frac, o.remaining), ev);
    } else if (ev.kind === 'close') {
      // Full close — take whatever remains of legs open at this point.
      for (const o of open) if (beforeEv(o)) consume(o, o.remaining, ev);
    } else {
      ev.needs_percent = true; // reduce with no stated amount
    }
  }

  pos.closed_fraction = pos.total_risk_percent > 0 ? Math.min(1, closedRisk / pos.total_risk_percent) : 0;
  pos.avg_exit_price = exitDen > 0 ? exitNum / exitDen : null;
  if (anyRealized) {
    pos.pnl_percent = realized;
    pos.pnl_dollars = (realized / 100) * portfolioSize;
    pos.r_achieved = pos.total_risk_percent > 0 ? realized / pos.total_risk_percent : null;
  }

  // Once the whole position is realized (via reduces/scale-outs), it's closed —
  // even without an explicit "close" action. Otherwise it lingers as falsely "open".
  if (pos.status === 'open' && pos.closed_fraction >= 0.999) {
    pos.status = 'closed';
    const lastExit = exitLegs.reduce((d, l) => (l.date > d ? l.date : d), pos.closed_at ?? '');
    if (lastExit) pos.closed_at = lastExit;
  }

  // Money left on the floor: for the CLOSED portion of each leg, the extra it
  // would have realized if it exited at the manual peak instead of where it did.
  const peak = entries.map((l) => l.peak_price).find((p) => p != null) ?? null;
  pos.peak_price = peak;
  if (peak != null && portfolioSize > 0) {
    let lofPct = 0;
    for (const leg of entries) {
      const closedFrac = 1 - (leg.remaining ?? 1);
      if (closedFrac <= 1e-9) continue;
      const atPeak = legR(leg, peak); // % of portfolio for the whole leg at peak
      if (atPeak == null) continue;
      const realizedPct = ((leg.realized_dollars ?? 0) / portfolioSize) * 100;
      const extra = closedFrac * atPeak - realizedPct;
      if (extra > 0) lofPct += extra;
    }
    if (lofPct > 1e-9) {
      pos.left_on_floor_percent = lofPct;
      pos.left_on_floor_dollars = (lofPct / 100) * portfolioSize;
      pos.left_on_floor_r = pos.total_risk_percent > 0 ? lofPct / pos.total_risk_percent : null;
    }
  }
}

// The fraction of the WHOLE position an exit leg closes: explicit close_percent,
// a percentage in the quantity text, or a fraction word. Null when unstated.
function exitFraction(leg: PositionLeg): number | null {
  if (leg.close_percent != null) return leg.close_percent / 100;
  const qt = leg.quantity_text?.trim() ?? '';
  const pctMatch = qt.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) return Number(pctMatch[1]) / 100;
  if (/שני\s*שליש|2\s*\/\s*3/.test(qt)) return 2 / 3;
  if (/חצי/.test(qt)) return 0.5;
  if (/שליש/.test(qt)) return 1 / 3;
  if (/רבע/.test(qt)) return 0.25;
  return null;
}

// Marks an OPEN position to the current market price → unrealized P/L.
function mark(pos: Position, prices: Record<string, number>, portfolioSize: number): void {
  if (pos.status !== 'open') return;
  const price = prices[pos.asset];
  if (price == null) return;
  pos.current_price = price;
  if (pos.direction !== 'long' && pos.direction !== 'short') return;
  const short = pos.direction === 'short';

  // Mark only the still-open share of each entry leg (its remaining fraction).
  const entries = pos.legs.filter((l) => l.kind === 'entry' && !l.excluded && !l.pending && l.price != null);
  let pct = 0;
  let counted = false;
  for (const leg of entries) {
    const rem = leg.remaining ?? 1;
    if (rem <= 1e-9 || leg.stop == null || leg.risk_percent == null) continue;
    const riskDist = short ? leg.stop - leg.price! : leg.price! - leg.stop;
    if (riskDist <= 0) continue;
    const reward = short ? leg.price! - price : price - leg.price!;
    const legPct = rem * (reward / riskDist) * leg.risk_percent;
    pct += legPct;
    leg.open_dollars = (leg.open_dollars ?? 0) + (legPct / 100) * portfolioSize;
    counted = true;
  }
  if (!counted) return;
  pos.unrealized_pnl_percent = pct;
  pos.unrealized_pnl_dollars = (pct / 100) * portfolioSize;
  pos.unrealized_r = pos.total_risk_percent > 0 ? pct / pos.total_risk_percent : null;
}

// Forward-looking potential on the still-open portion: profit if it reaches the
// take-profit, loss if it hits each leg's stop, and the reward/risk ratio.
// Only meaningful for an open position that has a TP set.
function computePotential(pos: Position, portfolioSize: number): void {
  if (pos.status !== 'open' || pos.current_tp == null) return;
  if (pos.direction !== 'long' && pos.direction !== 'short') return;
  const short = pos.direction === 'short';
  const tp = pos.current_tp;

  let profitPct = 0;
  let lossPct = 0;
  let counted = false;
  for (const leg of pos.legs) {
    if (leg.kind !== 'entry' || leg.excluded || leg.pending) continue;
    const rem = leg.remaining ?? 1;
    if (rem <= 1e-9 || leg.price == null || leg.stop == null || leg.risk_percent == null) continue;
    const riskDist = short ? leg.stop - leg.price : leg.price - leg.stop;
    if (riskDist <= 0) continue;
    const reward = short ? leg.price - tp : tp - leg.price;
    profitPct += rem * (reward / riskDist) * leg.risk_percent;
    lossPct += rem * leg.risk_percent; // risk_percent IS the loss if the stop hits
    counted = true;
  }
  if (!counted) return;

  pos.potential_profit_percent = profitPct;
  pos.potential_profit_dollars = (profitPct / 100) * portfolioSize;
  pos.potential_loss_percent = -lossPct;
  pos.potential_loss_dollars = -(lossPct / 100) * portfolioSize;
  pos.potential_rr = lossPct > 0 ? profitPct / lossPct : null;
}

// Groups trade signals into positions. Source of truth stays in trade_signals;
// positions are derived here and can always be recomputed.
export async function getPositions(channelId?: string): Promise<Position[]> {
  const allSignals = await listTradeSignals(1000);
  const signals = channelId
    ? allSignals.filter((s) => s.message.channel_id === channelId)
    : allSignals;
  // Chronological order (listTradeSignals returns newest-first).
  const chrono = [...signals].reverse();

  const open = new Map<string, Position>(); // key -> open position
  const all: Position[] = [];

  // Finds the open position a directionless management signal refers to.
  function resolveManaged(asset: string): Position | null {
    const matches = [...open.values()].filter((p) => p.asset === asset);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      // Ambiguous: long and short both open — attach to the most recent, flag.
      const recent = matches.sort((a, b) => b.opened_at.localeCompare(a.opened_at))[0];
      recent.needs_review = true;
      return recent;
    }
    return null;
  }

  for (const s of chrono) {
    const asset = assetOf(s);
    const action = s.action ?? 'other';

    if (OPENING_ACTIONS.has(action)) {
      const dir = s.direction ?? 'unknown';
      const key = `${asset}|${dir}`;
      let pos = open.get(key);
      if (!pos) {
        pos = newPosition(asset, dir, s.message.created_at);
        open.set(key, pos);
        all.push(pos);
      }
      pos.legs.push(legFromSignal(s, 'entry'));
      pos.signal_ids.push(s.id);
      if (s.stop_price != null) pos.current_stop = s.stop_price;
      if (s.tp_price != null) pos.current_tp = s.tp_price;
      if (s.needs_review) pos.needs_review = true;
      continue;
    }

    // Management actions: reduce / close / stop_update / cancel / other.
    let pos: Position | null = null;
    if (s.direction) {
      pos = open.get(`${asset}|${s.direction}`) ?? null;
    }
    if (!pos) pos = resolveManaged(asset);

    if (!pos) {
      // Management on a position opened before our data window — create a
      // placeholder open position so the event isn't lost.
      const dir = s.direction ?? 'unknown';
      pos = newPosition(asset, dir, s.message.created_at);
      pos.needs_review = true;
      open.set(pos.key, pos);
      all.push(pos);
    }

    if (s.needs_review) pos.needs_review = true;
    pos.signal_ids.push(s.id);
    if (s.stop_price != null) pos.current_stop = s.stop_price;
    if (s.tp_price != null) pos.current_tp = s.tp_price;

    // fill / reduce / close / stop_update all confirm that a prior pending
    // limit/trigger entry actually filled (you can't manage a position that
    // never entered). 'cancel' does NOT confirm.
    if (action === 'fill' || action === 'reduce' || action === 'close' || action === 'stop_update') {
      pos.confirm_dates.push(s.message.created_at);
    }

    if (action === 'reduce') {
      // Partial close (e.g. "לסגור עסקה אחרונה") — position stays open.
      pos.legs.push(legFromSignal(s, 'reduce'));
    } else if (action === 'close') {
      // Full close of the entire position.
      pos.legs.push(legFromSignal(s, 'close'));
      pos.status = 'closed';
      pos.closed_at = s.message.created_at;
      open.delete(pos.key);
    } else if (action === 'cancel') {
      // Cancelled pending order — just shown in the journal; the user edits
      // by hand if it had already entered. No automatic state change.
      pos.legs.push(legFromSignal(s, 'cancel'));
    }
    // stop_update / other: already applied stop/tp above, no leg added.
  }

  const [prices, portfolioSize] = await Promise.all([getMarketPrices(), getPortfolioSize()]);
  for (const pos of all) {
    finalize(pos, portfolioSize);
    mark(pos, prices, portfolioSize);
    computePotential(pos, portfolioSize);
  }

  // Newest positions first.
  return all.sort((a, b) => b.opened_at.localeCompare(a.opened_at));
}
