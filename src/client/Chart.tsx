import { useMemo, useState } from "react";
import type { Worth } from "../shared/calc";
import { fmtDate, MONTHS } from "../shared/dates";
import { chf, chfShort } from "../shared/money";

export interface Layer {
  label: string;
  color: string;
  hatch?: boolean;
  value: (w: Worth) => number;
}

const W = 880, H = 290, L = 58, R = 14, T = 12, B = 30;
const IW = W - L - R, IH = H - T - B;

function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

const Swatch = ({ l }: { l: Layer }) => <span className={`sw ${l.hatch ? "sw-pen" : ""}`} style={l.hatch ? undefined : { background: l.color }} />;

/** Stacked area chart of net worth; pension layers are hatched to mark them as locked. */
export function WorthChart({ points, layers, today }: { points: Worth[]; layers: Layer[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { stacks, max } = useMemo(() => {
    const stacks = points.map((p) => {
      let acc = 0;
      return layers.map((l) => {
        const lo = acc;
        acc += Math.max(0, l.value(p));
        return [lo, acc] as const;
      });
    });
    return { stacks, max: niceMax(Math.max(100, ...stacks.map((s) => s[s.length - 1][1]))) };
  }, [points, layers]);

  const x = (i: number) => L + (points.length < 2 ? IW / 2 : (i * IW) / (points.length - 1));
  const y = (v: number) => T + IH - (v / max) * IH;
  const step = Math.max(1, Math.ceil(points.length / 7));

  const onMove = (clientX: number, rect: DOMRect) => {
    const vx = ((clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((vx - L) / IW) * (points.length - 1)))));
  };

  const hp = hover !== null ? points[hover] : null;
  const hx = hover !== null ? x(hover) : 0;

  return (
    <>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Net worth over time, stacked">
          <defs>
            <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" style={{ fill: "var(--pension)", fillOpacity: 0.22 }} />
              <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--pension)" }} strokeWidth={2.6} />
            </pattern>
          </defs>
          {[0, 1, 2, 3, 4].map((i) => {
            const v = (max * i) / 4;
            return (
              <g key={i}>
                <line className="grid-line" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
                <text className="axis" x={L - 8} y={y(v) + 4} textAnchor="end">{chfShort(v)}</text>
              </g>
            );
          })}
          {points.map((p, i) =>
            i % step === 0 && i < points.length - Math.ceil(step / 2) ? (
              <text key={p.date} className="axis" x={x(i)} y={H - 8} textAnchor="middle">
                {MONTHS[Number(p.date.slice(5, 7)) - 1]} ’{p.date.slice(2, 4)}
              </text>
            ) : null,
          )}
          <text className="axis" x={x(points.length - 1)} y={H - 8} textAnchor="end">Today</text>
          {layers.map((l, li) => {
            const top = points.map((_, i) => `${x(i).toFixed(1)},${y(stacks[i][li][1]).toFixed(1)}`);
            const bot = points.map((_, i) => `${x(i).toFixed(1)},${y(stacks[i][li][0]).toFixed(1)}`).reverse();
            return (
              <g key={l.label}>
                <path d={`M${top.join("L")}L${bot.join("L")}Z`} style={{ fill: l.hatch ? "url(#hatch)" : l.color, fillOpacity: l.hatch ? 1 : 0.82 }} />
                <path d={`M${top.join("L")}`} style={{ fill: "none", stroke: l.color }} strokeWidth={1.5} />
              </g>
            );
          })}
          {hp && <line x1={hx} x2={hx} y1={T} y2={T + IH} style={{ stroke: "var(--ink)" }} strokeWidth={1} strokeDasharray="3 3" />}
          <rect x={L} y={T} width={IW} height={IH} style={{ fill: "transparent" }}
            onMouseMove={(e) => onMove(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect())}
            onTouchMove={(e) => onMove(e.touches[0].clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect())}
            onTouchStart={(e) => onMove(e.touches[0].clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect())}
            onMouseLeave={() => setHover(null)} />
        </svg>
        {hp && (
          <div className={`tip ${hx / W > 0.6 ? "left" : ""}`} style={{ left: `${(hx / W) * 100}%` }}>
            <div className="tip-row" style={{ marginBottom: 5 }}><b>{hp.date === today ? "Today" : fmtDate(hp.date)}</b></div>
            {[...layers].reverse().map((l) => (
              <div className="tip-row" key={l.label}>
                <span><Swatch l={l} />{l.label}</span>
                <span className="num">{chf(l.value(hp))}</span>
              </div>
            ))}
            <div className="tip-row tip-tot"><span>Total</span><span className="num">{chf(layers.reduce((s, l) => s + l.value(hp), 0))}</span></div>
          </div>
        )}
      </div>
      <div className="legend">
        {layers.map((l) => <span key={l.label}><Swatch l={l} />{l.label}</span>)}
      </div>
    </>
  );
}
