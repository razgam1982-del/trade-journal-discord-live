"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";

const GREEN = "#22c55e";
const RED = "#ef4444";
const AXIS = "#94a3b8";
const GRID = "#1f2a44";

type Point = { label: string; value: number };
type Bar2 = { label: string; pnl: number };

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

function ChartCard({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 ${className}`}>
      <h3 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--text)]">
        <span>{title}</span>
        {sub && <span className="text-xs font-normal text-[var(--muted)]">{sub}</span>}
      </h3>
      <div style={{ width: "100%", height: 240 }}>{children}</div>
    </div>
  );
}

const tooltipStyle = { backgroundColor: "#0f1830", border: "1px solid #1f2a44", borderRadius: 8, color: "#e6ecf5" };

function TwoBars({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" stroke={AXIS} tick={{ fontSize: 12, fontWeight: 600 }} />
        <YAxis stroke={AXIS} tick={{ fontSize: 11 }} tickFormatter={money} width={70} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={70}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? GREEN : RED} />
          ))}
          <LabelList dataKey="value" position="top" formatter={(v: number) => money(v)} style={{ fill: "#e6ecf5", fontSize: 12, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PositionsCharts({
  equity,
  avgComparison,
  totals,
  perTrade,
  byAsset,
}: {
  equity: Point[];
  avgComparison: Point[];
  totals: Point[];
  perTrade: Bar2[];
  byAsset: Bar2[];
}) {
  const hasData = equity.length > 0 || perTrade.length > 0;
  if (!hasData) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
        הגרפים יתמלאו כשתזין מחירי כניסה/יציאה (רווח/הפסד) על העסקאות.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: equity (wide) + avg comparison + totals */}
      <div className="grid gap-4 lg:grid-cols-4">
        <ChartCard title="עקומת הון מצטברת" sub="($) רווח/הפסד ממומש" className="lg:col-span-2">
          <ResponsiveContainer>
            <LineChart data={equity} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={GRID} />
              <XAxis dataKey="label" stroke={AXIS} tick={{ fontSize: 11 }} />
              <YAxis stroke={AXIS} tick={{ fontSize: 11 }} tickFormatter={money} width={70} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
              <Line type="monotone" dataKey="value" stroke={GREEN} strokeWidth={2} dot={{ r: 3, fill: GREEN }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="ממוצע רווח מול הפסד" sub="($) פר עסקה">
          <TwoBars data={avgComparison} />
        </ChartCard>
        <ChartCard title="סך רווחים מול הפסדים" sub="($) מצטבר">
          <TwoBars data={totals} />
        </ChartCard>
      </div>

      {/* Row 2: P/L per trade + by asset */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="רווח/הפסד פר עסקה" sub="($)">
          <ResponsiveContainer>
            <BarChart data={perTrade} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={GRID} />
              <XAxis dataKey="label" stroke={AXIS} tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis stroke={AXIS} tick={{ fontSize: 11 }} tickFormatter={money} width={70} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {perTrade.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? GREEN : RED} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="ביצועים פר נכס" sub="סך $ מצטבר">
          <ResponsiveContainer>
            <BarChart data={byAsset} layout="vertical" margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
              <CartesianGrid stroke={GRID} />
              <XAxis type="number" stroke={AXIS} tick={{ fontSize: 11 }} tickFormatter={money} />
              <YAxis type="category" dataKey="label" stroke={AXIS} tick={{ fontSize: 11 }} width={70} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
              <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                {byAsset.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? GREEN : RED} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
