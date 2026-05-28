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
    risk_percent: s.risk_percent,
    quantity_text: s.quantity_text,
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

  // Interim: weight by risk%. Will switch to FTMO lot sizing once instrument
  // point values are configured.
  const priced = entries.filter((l) => l.price != null);
  if (priced.length === 0) {
    pos.avg_entry_price = null;
    return;
  }
  const weightSum = priced.reduce((s, l) => s + (l.risk_percent ?? 1), 0);
  const priceWeighted = priced.reduce((s, l) => s + l.price! * (l.risk_percent ?? 1), 0);
  pos.avg_entry_price = weightSum > 0 ? priceWeighted / weightSum : null;

  // Realized P/L: average of filled exit prices, then per-leg R against each
  // leg's ORIGINAL stop (the stop set at that entry, which fixed the size).
  const exits = pos.legs.filter(
    (l) => (l.kind === 'reduce' || l.kind === 'close') && !l.excluded && l.price != null,
  );
  pos.avg_exit_price = exits.length
    ? exits.reduce((s, l) => s + l.price!, 0) / exits.length
    : null;

  if (pos.avg_exit_price == null || (pos.direction !== 'long' && pos.direction !== 'short')) {
    return; // no realized exit, or unknown direction — nothing to compute
  }
  const exit = pos.avg_exit_price;
  const short = pos.direction === 'short';

  let pnlPercent = 0;
  let counted = false;
  for (const leg of priced) {
    if (leg.stop == null || leg.risk_percent == null) continue;
    const riskDist = short ? leg.stop - leg.price! : leg.price! - leg.stop;
    if (riskDist <= 0) continue; // malformed stop for this leg
    const reward = short ? leg.price! - exit : exit - leg.price!;
    pnlPercent += (reward / riskDist) * leg.risk_percent;
    counted = true;
  }

  if (!counted) return;
  pos.pnl_percent = pnlPercent;
  pos.pnl_dollars = (pnlPercent / 100) * portfolioSize;
  pos.r_achieved = pos.total_risk_percent > 0 ? pnlPercent / pos.total_risk_percent : null;
}

// Marks an OPEN position to the current market price → unrealized P/L.
function mark(pos: Position, prices: Record<string, number>, portfolioSize: number): void {
  if (pos.status !== 'open') return;
  const price = prices[pos.asset];
  if (price == null) return;
  pos.current_price = price;
  if (pos.direction !== 'long' && pos.direction !== 'short') return;
  const short = pos.direction === 'short';

  const entries = pos.legs.filter((l) => l.kind === 'entry' && !l.excluded && !l.pending && l.price != null);
  let pct = 0;
  let counted = false;
  for (const leg of entries) {
    if (leg.stop == null || leg.risk_percent == null) continue;
    const riskDist = short ? leg.stop - leg.price! : leg.price! - leg.stop;
    if (riskDist <= 0) continue;
    const reward = short ? leg.price! - price : price - leg.price!;
    pct += (reward / riskDist) * leg.risk_percent;
    counted = true;
  }
  if (!counted) return;
  pos.unrealized_pnl_percent = pct;
  pos.unrealized_pnl_dollars = (pct / 100) * portfolioSize;
  pos.unrealized_r = pos.total_risk_percent > 0 ? pct / pos.total_risk_percent : null;
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
  }

  // Newest positions first.
  return all.sort((a, b) => b.opened_at.localeCompare(a.opened_at));
}
