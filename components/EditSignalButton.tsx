"use client";

import { useState } from "react";
import { getSignalForEdit, saveSignalEdits } from "@/app/positions/actions";

type Form = Record<string, string>;

const DIRECTIONS = [
  { v: "", l: "—" },
  { v: "long", l: "לונג" },
  { v: "short", l: "שורט" },
];
const ACTIONS = [
  { v: "entry", l: "כניסה" },
  { v: "add", l: "הוספה" },
  { v: "reduce", l: "הפחתה" },
  { v: "close", l: "סגירה" },
  { v: "stop_update", l: "עדכון סטופ" },
  { v: "cancel", l: "ביטול" },
  { v: "other", l: "אחר" },
];
const ENTRY_TYPES = [
  { v: "", l: "—" },
  { v: "immediate", l: "מיידית" },
  { v: "trigger", l: "טריגר" },
  { v: "limit", l: "לימיט" },
];

function num(v: string): number | null {
  const t = v.trim();
  return t === "" ? null : Number(t);
}

export function EditSignalButton({ signalId }: { signalId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>({});

  async function openModal() {
    setOpen(true);
    setLoading(true);
    const s = await getSignalForEdit(signalId);
    if (s) {
      setForm({
        asset: s.asset ?? "",
        direction: s.direction ?? "",
        action: s.action ?? "",
        entry_type: s.entry_type ?? "",
        entry_price: s.entry_price?.toString() ?? "",
        exit_price: s.exit_price?.toString() ?? "",
        stop_price: s.stop_price?.toString() ?? "",
        tp_price: s.tp_price?.toString() ?? "",
        risk_percent: s.risk_percent?.toString() ?? "",
        quantity_text: s.quantity_text ?? "",
      });
    }
    setLoading(false);
  }

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    await saveSignalEdits(signalId, {
      asset: form.asset.trim() || null,
      direction: form.direction || null,
      action: form.action || null,
      entry_type: form.entry_type || null,
      entry_price: num(form.entry_price),
      exit_price: num(form.exit_price),
      stop_price: num(form.stop_price),
      tp_price: num(form.tp_price),
      risk_percent: num(form.risk_percent),
      quantity_text: form.quantity_text.trim() || null,
    });
    setSaving(false);
    setOpen(false);
  }

  const inputCls =
    "w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]";
  const inputStyle = { backgroundColor: "#15203a", color: "#e6ecf5" } as const;

  return (
    <>
      <button
        onClick={openModal}
        className="rounded px-2 py-1 text-xs hover:bg-[rgba(56,189,248,0.12)]"
        style={{ color: "var(--muted)" }}
        title="ערוך את כל שדות הרגל"
      >
        ✏ ערוך
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-16"
          style={{ backgroundColor: "rgba(2, 6, 16, 0.85)", backdropFilter: "blur(2px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--border)] p-5"
            style={{ backgroundColor: "#0f1830", color: "#e6ecf5", boxShadow: "0 24px 60px rgba(0,0,0,0.65)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">עריכת רגל</h2>
              <button onClick={() => setOpen(false)} className="text-[var(--muted)]">✕</button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-[var(--muted)]">טוען…</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="נכס">
                  <input className={inputCls} style={inputStyle} value={form.asset ?? ""} onChange={(e) => set("asset", e.target.value)} />
                </Field>
                <Field label="כיוון">
                  <select className={inputCls} style={inputStyle} value={form.direction ?? ""} onChange={(e) => set("direction", e.target.value)}>
                    {DIRECTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </Field>
                <Field label="פעולה">
                  <select className={inputCls} style={inputStyle} value={form.action ?? ""} onChange={(e) => set("action", e.target.value)}>
                    {ACTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </Field>
                <Field label="סוג כניסה">
                  <select className={inputCls} style={inputStyle} value={form.entry_type ?? ""} onChange={(e) => set("entry_type", e.target.value)}>
                    {ENTRY_TYPES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </Field>
                <Field label="מחיר כניסה">
                  <input type="number" step="any" className={inputCls} style={inputStyle} value={form.entry_price ?? ""} onChange={(e) => set("entry_price", e.target.value)} />
                </Field>
                <Field label="מחיר יציאה">
                  <input type="number" step="any" className={inputCls} style={inputStyle} value={form.exit_price ?? ""} onChange={(e) => set("exit_price", e.target.value)} />
                </Field>
                <Field label="סטופ">
                  <input type="number" step="any" className={inputCls} style={inputStyle} value={form.stop_price ?? ""} onChange={(e) => set("stop_price", e.target.value)} />
                </Field>
                <Field label="טייק">
                  <input type="number" step="any" className={inputCls} style={inputStyle} value={form.tp_price ?? ""} onChange={(e) => set("tp_price", e.target.value)} />
                </Field>
                <Field label="סיכון %">
                  <input type="number" step="any" className={inputCls} style={inputStyle} value={form.risk_percent ?? ""} onChange={(e) => set("risk_percent", e.target.value)} />
                </Field>
                <Field label="כמות (טקסט)">
                  <input className={inputCls} style={inputStyle} value={form.quantity_text ?? ""} onChange={(e) => set("quantity_text", e.target.value)} />
                </Field>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)", color: "#e6ecf5" }}
              >
                ביטול
              </button>
              <button
                onClick={save}
                disabled={saving || loading}
                className="rounded-lg px-5 py-2 text-sm font-bold"
                style={{ backgroundColor: "#22c55e", color: "#04210f", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "שומר…" : "שמור"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}
