import { useState } from "react";
import { isActive } from "../../shared/calc";
import { fmtDate } from "../../shared/dates";
import { amount2, chf, parseChf, plain } from "../../shared/money";
import type { Account } from "../../shared/types";
import { api, useApp, useMutate } from "../api";
import { Avatar, Icon, PageHead, StalePill, typeLabel } from "../ui";

const ORDER = { bank: 0, investment: 1, pension: 2 };

export default function Update() {
  const { data, ledger, today } = useApp();
  const mutate = useMutate();
  const active = data.accounts.filter((a) => isActive(a, today)).sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.name.localeCompare(b.name));
  // Prefill with the last balance so unchanged accounts need no typing
  const initial = () => Object.fromEntries(active.map((a) => [a.id, ledger.lastSnapshot(a) ? plain(ledger.lastSnapshot(a)!.balance) : ""]));
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const rowState = (a: Account) => {
    const last = ledger.lastSnapshot(a);
    const raw = values[a.id] ?? "";
    const v = parseChf(raw);
    const invalid = raw.trim() !== "" && Number.isNaN(v);
    const changed = !Number.isNaN(v) && (!last || v !== last.balance);
    return { last, v, invalid, changed, pending: !Number.isNaN(v) && (changed || !!confirmed[a.id]) };
  };
  const pending = active.filter((a) => rowState(a).pending);
  const staleN = active.filter(ledger.isStale).length;

  const groups = [
    ...data.persons.map((p) => ({ key: p.id, head: <><Avatar p={p} />{p.name}</>, accs: active.filter((a) => a.owners.length === 1 && a.owners[0] === p.id) })),
    { key: "shared", head: <><span className="avatars">{data.persons.map((p) => <Avatar key={p.id} p={p} />)}</span>Shared</>, accs: active.filter((a) => a.owners.length > 1) },
  ].filter((g) => g.accs.length);

  async function save() {
    setSaving(true);
    const entries = pending.map((a) => ({ accountId: a.id, balance: rowState(a).v }));
    const ok = await mutate(() => api.post("/snapshots/bulk", { date, entries }), `Saved ${entries.length} balance${entries.length > 1 ? "s" : ""} for ${fmtDate(date)}`);
    setSaving(false);
    if (ok === true) {
      setConfirmed({});
      window.scrollTo(0, 0);
    }
  }

  return (
    <>
      <PageHead eyebrow="Monthly routine" title="Update balances" />
      <div className="card u-bar">
        <label className="field" style={{ maxWidth: 200 }}>
          <span>Balance date</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        <p className="sub" style={{ flex: 1, minWidth: 220 }}>
          Type the current balance from your e-banking or statement. Tick <b>Still correct</b> for accounts that didn’t change (for example a
          pension fund between yearly certificates) so they count as up to date.
          {staleN > 0 && <b style={{ color: "var(--warn)" }}> {staleN} account{staleN > 1 ? "s are" : " is"} overdue.</b>}
        </p>
      </div>

      {active.length === 0 && <div className="card sub">No accounts yet. Add one under Accounts.</div>}

      {groups.map((g) => (
        <section className="card u-group" key={g.key}>
          <h3>{g.head}</h3>
          <div className="tbl-wrap">
            <table className="tbl fixed">
              <colgroup><col /><col style={{ width: 190 }} /><col style={{ width: 190 }} /><col style={{ width: 120 }} /><col style={{ width: 140 }} /></colgroup>
              <thead>
                <tr><th>Account</th><th className="r">Last balance</th><th className="r">New balance (CHF)</th><th className="r">Change</th><th /></tr>
              </thead>
              <tbody>
                {g.accs.map((a) => {
                  const { last, v, invalid, changed } = rowState(a);
                  const diff = changed && last ? v - last.balance : null;
                  return (
                    <tr key={a.id} className={ledger.isStale(a) ? "is-stale" : ""}>
                      <td><div className="acc-name">{a.name}</div><div className="sub">{a.institution} · {typeLabel(a)}</div></td>
                      <td className="r">
                        <div className="num">{last ? chf(last.balance, true) : "—"}</div>
                        <div className="sub">{last ? fmtDate(last.date) : "never"} <StalePill a={a} /></div>
                      </td>
                      <td className="r">
                        <input className={`u-in ${invalid ? "err" : ""}`} inputMode="decimal" autoComplete="off" value={values[a.id] ?? ""}
                          aria-label={`New balance for ${a.name}, ${a.institution}`}
                          onChange={(e) => setValues({ ...values, [a.id]: e.target.value })} />
                      </td>
                      <td className={`r num u-diff ${diff === null ? "" : diff > 0 ? "up" : "down"}`}>
                        {diff === null ? "—" : `${diff > 0 ? "+" : "−"}${amount2(Math.abs(diff))}`}
                      </td>
                      <td className="r">
                        <label className="chk">
                          <input type="checkbox" disabled={changed} checked={!changed && !!confirmed[a.id]}
                            onChange={(e) => setConfirmed({ ...confirmed, [a.id]: e.target.checked })} />
                          Still correct
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <div className="savebar">
        <span className="sub">{pending.length ? `${pending.length} balance${pending.length > 1 ? "s" : ""} ready to save` : "No changes yet"}</span>
        <button className="btn primary" disabled={!pending.length || saving} onClick={save}><Icon name="check" />Save balances</button>
      </div>
    </>
  );
}
