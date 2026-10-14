import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { costSummary } from "../../shared/calc";
import { addDays, addMonths, fmtDate } from "../../shared/dates";
import { chf } from "../../shared/money";
import { COST_KINDS, KIND_PLURAL, type AccountType } from "../../shared/types";
import { useApp } from "../api";
import { WorthChart, type Layer } from "../Chart";
import { Avatar, Delta, Icon, PageHead, typeColor } from "../ui";

type Mode = "person" | "liquidity" | "type";
type Range = "1y" | "3y" | "all";

function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial;
    } catch {
      return initial;
    }
  });
  return [v, (next) => {
    setV(next);
    try { localStorage.setItem(key, next); } catch { /* storage unavailable */ }
  }];
}

export default function Dashboard() {
  const { data, ledger, today } = useApp();
  const [mode, setMode] = usePref<Mode>("julius-chart-mode", "person");
  const [range, setRange] = usePref<Range>("julius-chart-range", "all");

  const now = ledger.worthAt(today);
  const d30 = ledger.worthAt(addDays(today, -30));
  const ytd = ledger.worthAt(`${Number(today.slice(0, 4)) - 1}-12-31`);
  const stale = data.accounts.filter(ledger.isStale);
  const liqPct = now.total ? (now.liquid / now.total) * 100 : 0;
  const costs = costSummary(data.costs, data.persons.map((p) => p.id), today);

  const allPoints = useMemo(() => ledger.series(), [ledger]);
  const points = range === "all" ? allPoints : allPoints.filter((p) => p.date >= addMonths(today, range === "1y" ? -12 : -36));
  const layers = useMemo<Layer[]>(() => {
    if (mode === "person") return data.persons.map((p) => ({ label: p.name, color: p.color, value: (w) => w.byPerson[p.id]?.total ?? 0 }));
    if (mode === "liquidity")
      return [
        { label: "Liquid", color: "var(--liquid)", value: (w) => w.liquid },
        { label: "Pension (locked)", color: "var(--pension)", hatch: true, value: (w) => w.pension },
      ];
    return [
      { label: "Bank", color: "var(--bank)", value: (w) => w.byType.bank },
      { label: "Investments", color: "var(--invest)", value: (w) => w.byType.investment },
      { label: "Pension (locked)", color: "var(--pension)", hatch: true, value: (w) => w.byType.pension },
    ];
  }, [mode, data.persons]);

  const rows: [AccountType, string][] = [["bank", "Bank accounts"], ["investment", "Investments"], ["pension", "Pension (locked)"]];

  return (
    <>
      <PageHead eyebrow={`Overview · ${fmtDate(today)}`} title="Net Worth">
        <Link className="btn primary" to="/update"><Icon name="refresh" />Update balances</Link>
      </PageHead>

      {stale.length > 0 && (
        <div className="banner" role="status">
          <Icon name="alert" />
          <div className="banner-body">
            <strong>
              {stale.length} account{stale.length > 1 ? "s have" : " has"} not been updated in over {data.settings.staleDays} days
            </strong>
            <div className="banner-list">
              {stale.map((a) => {
                const l = ledger.lastSnapshot(a);
                return <span key={a.id}>{a.name} · {a.institution} — {l ? `last ${fmtDate(l.date)}` : "no balance yet"}</span>;
              })}
            </div>
          </div>
          <Link className="btn" to="/update">Update now</Link>
        </div>
      )}

      <section className="hero-row">
        <div className="card hero">
          <p className="label">All persons, all accounts</p>
          <p className="big num">{chf(now.total)}</p>
          <div className="deltas">
            <Delta cur={now.total} prev={d30.total} label="Last 30 days" />
            <Delta cur={now.total} prev={ytd.total} label="Since 1 Jan" />
          </div>
          <div className="split" role="img" aria-label={`Liquid ${liqPct.toFixed(0)} percent, pension ${(100 - liqPct).toFixed(0)} percent`}>
            <span className="split-liq" style={{ width: `${liqPct}%` }} />
            <span className="split-pen" style={{ width: `${100 - liqPct}%` }} />
          </div>
          <div className="split-legend">
            <div><span className="sw sw-liq" />Liquid <b className="num">{chf(now.liquid)}</b></div>
            <div><span className="sw sw-pen" />Pension, locked until retirement <b className="num">{chf(now.pension)}</b></div>
          </div>
        </div>
        <div className="people">
          {data.persons.map((p) => {
            const b = now.byPerson[p.id];
            return (
              <div className="card person" key={p.id}>
                <div className="person-h"><Avatar p={p} /><h2>{p.name}</h2></div>
                <p className="val num">{chf(b.total)}</p>
                <div className="person-rows">
                  <div><span>Liquid</span><span className="num">{chf(b.liquid)}</span></div>
                  <div><span>Pension <Icon name="lock" /></span><span className="num">{chf(b.pension)}</span></div>
                </div>
                <Delta cur={b.total} prev={ytd.byPerson[p.id]?.total ?? 0} label="Since 1 Jan" />
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Net worth over time</h2>
          <div className="ph-actions">
            <div className="seg" role="group" aria-label="Breakdown">
              {([["person", "By person"], ["liquidity", "Liquid vs pension"], ["type", "By account type"]] as const).map(([k, l]) => (
                <button key={k} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Range">
              {([["1y", "1Y"], ["3y", "3Y"], ["all", "All"]] as const).map(([k, l]) => (
                <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <WorthChart points={points} layers={layers} today={today} />
        {mode === "person" && <p className="sub" style={{ marginTop: 6 }}>Shared accounts are split evenly between their owners.</p>}
      </section>

      <section className="grid2">
        <div className="card">
          <div className="card-h"><h2>Breakdown</h2><Link className="btn sm ghost" to="/accounts">All accounts →</Link></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th />{data.persons.map((p) => <th className="r" key={p.id}>{p.name}</th>)}<th className="r">Total</th></tr>
              </thead>
              <tbody>
                {rows.map(([k, l]) => (
                  <tr key={k}>
                    <td><span className="owner"><span className={`sw ${k === "pension" ? "sw-pen" : ""}`} style={k === "pension" ? undefined : { background: typeColor(k) }} />{l}</span></td>
                    {data.persons.map((p) => <td className="r num" key={p.id}>{chf(now.byPerson[p.id][k])}</td>)}
                    <td className="r num">{chf(now.byType[k])}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Total</td>{data.persons.map((p) => <td className="r num" key={p.id}>{chf(now.byPerson[p.id].total)}</td>)}<td className="r num">{chf(now.total)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Recurring costs</h2><Link className="btn sm ghost" to="/costs">Details →</Link></div>
          <div className="sum-row" style={{ marginBottom: 16 }}>
            <div className="stat"><p className="label">Per month</p><p className="v num">{chf(costs.monthly, true)}</p></div>
            <div className="stat"><p className="label">Per year</p><p className="v num">{chf(costs.monthly * 12)}</p></div>
          </div>
          <div className="person-rows">
            {COST_KINDS.map((k) => (
              <div key={k}><span>{KIND_PLURAL[k]}</span><span className="num">{chf(costs.byKind[k], true)} / month</span></div>
            ))}
          </div>
          <div className="person-rows" style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12 }}>
            {data.persons.map((p) => (
              <div key={p.id}><span className="owner"><Avatar p={p} />{p.name}</span><span className="num">{chf(costs.byPerson[p.id], true)} / month</span></div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
