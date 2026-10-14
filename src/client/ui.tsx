import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Urgency } from "../shared/calc";
import { chf } from "../shared/money";
import { PENSION_LABEL, TYPE_LABEL, type Account, type Person } from "../shared/types";
import { useApp } from "./api";

/* icons */
const PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />,
  refresh: <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></>,
  repeat: <path d="M4 10V9a3 3 0 0 1 3-3h12l-3-3M20 14v1a3 3 0 0 1-3 3H5l3 3" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  alert: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="M5 12.5 10 17l9-10" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 20V9M7 14l5-5 5 5M5 4h14" />,
};
export type IconName = keyof typeof PATHS;
export const Icon = ({ name }: { name: IconName }) => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name]}
  </svg>
);

/** Brand mark; CSS shows the variant matching the active theme. */
export const Logo = ({ size = 40 }: { size?: number }) => (
  <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
    <img className="logo-light" src="/brand/logo-light.png" alt="" width={size} height={size} />
    <img className="logo-dark" src="/brand/logo-dark.png" alt="" width={size} height={size} />
  </span>
);

/* people */
export const Avatar = ({ p }: { p?: Person }) =>
  p ? (
    <span className="avatar" style={{ background: p.color }} title={p.name}>
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  ) : null;

export function Owners({ ids }: { ids: string[] }) {
  const { person } = useApp();
  const ps = ids.map(person).filter((p): p is Person => !!p);
  if (ps.length === 1)
    return (
      <span className="owner">
        <Avatar p={ps[0]} />
        {ps[0].name}
      </span>
    );
  return (
    <span className="owner">
      <span className="avatars">{ps.map((p) => <Avatar key={p.id} p={p} />)}</span>
      Shared <span className="muted">· 1/{ps.length} each</span>
    </span>
  );
}

/* small pieces */
export const Pill = ({ level, children }: { level: Urgency | "lock"; children: ReactNode }) => <span className={`pill ${level}`}>{children}</span>;

export function StalePill({ a }: { a: Account }) {
  const { ledger } = useApp();
  if (!ledger.isStale(a)) return null;
  const d = ledger.daysSinceUpdate(a);
  return <Pill level="warn">{d === null ? "No balance yet" : `${d} days old`}</Pill>;
}

export function Delta({ cur, prev, label }: { cur: number; prev: number; label: string }) {
  const d = cur - prev;
  const pct = prev ? (d / prev) * 100 : 0;
  const up = d >= 0;
  return (
    <div className={`delta ${up ? "up" : "down"}`}>
      <span className="num">
        {up ? "+" : "−"}
        {chf(Math.abs(d))} <span className="pct">{up ? "+" : "−"}{Math.abs(pct).toFixed(1)}%</span>
      </span>
      <span className="dl">{label}</span>
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="ph">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="ph-actions">{children}</div>
    </header>
  );
}

export function Spark({ values, color, w = 110, h = 30 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const mx = Math.max(...values), mn = Math.min(...values), span = mx - mn || 1;
  const pts = values.map((v, i) => [(i * (w - 4)) / (values.length - 1) + 2, h - 3 - ((v - mn) / span) * (h - 6)]);
  const [ex, ey] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={"M" + pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join("L")} style={{ fill: "none", stroke: color }} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r={2.5} style={{ fill: color }} />
    </svg>
  );
}

export const typeLabel = (a: Account) => (a.type === "pension" && a.pensionKind ? PENSION_LABEL[a.pensionKind] : TYPE_LABEL[a.type]);
export const typeColor = (t: Account["type"]) => (t === "bank" ? "var(--bank)" : t === "investment" ? "var(--invest)" : "var(--pension)");

/** Two-click button for destructive actions (no browser confirm dialogs). */
export function ConfirmButton({ onConfirm, confirmText, className = "btn danger", children, disabled, title }: {
  onConfirm: () => void; confirmText: string; className?: string; children: ReactNode; disabled?: boolean; title?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className} data-armed={armed ? "1" : undefined} disabled={disabled} title={title}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmText : children}
    </button>
  );
}

/* modal */
export function Modal({ title, sub, onClose, children, footer }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input:not([type=checkbox]),select")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" ref={ref}>
        <div className="modal-h">
          <div>
            <h2 style={{ fontSize: "1.25rem" }}>{title}</h2>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button className="btn sm ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function OwnerPick({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useApp();
  return (
    <div className="owners-pick">
      {data.persons.map((p) => (
        <label key={p.id}>
          <input type="checkbox" checked={value.includes(p.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((id) => id !== p.id))} />
          <Avatar p={p} />
          {p.name}
        </label>
      ))}
    </div>
  );
}

/* toast */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  const show = useCallback((text: string) => setMsg({ text, key: Date.now() }), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status" key={msg.key}>{msg.text}</div>}
    </ToastCtx.Provider>
  );
}
