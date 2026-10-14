import { useState } from "react";
import { isActive } from "../../shared/calc";
import { addMonths, firstOfMonth, fmtDate, monthEnd } from "../../shared/dates";
import { amount2, chf, parseChf, plain } from "../../shared/money";
import { ACCOUNT_TYPES, PENSION_KINDS, PENSION_LABEL, TYPE_LABEL, TYPE_PLURAL, type Account, type AccountType, type PensionKind } from "../../shared/types";
import { api, useApp, useMutate } from "../api";
import { ConfirmButton, Icon, Modal, OwnerPick, Owners, PageHead, Spark, StalePill, typeColor, typeLabel } from "../ui";

export default function Accounts() {
  const { data, ledger, today } = useApp();
  const [showClosed, setShowClosed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Account | "new" | null>(null);

  const closedN = data.accounts.filter((a) => !isActive(a, today)).length;
  const list = data.accounts.filter((a) => showClosed || isActive(a, today));
  const last12 = (a: Account) => {
    const out: number[] = [];
    for (let k = 12; k >= 1; k--) out.push(ledger.valueAt(a, monthEnd(addMonths(firstOfMonth(today), -k))));
    out.push(ledger.valueAt(a, today));
    return out;
  };
  const opened = data.accounts.find((a) => a.id === openId);

  return (
    <>
      <PageHead eyebrow="Net worth" title="Accounts">
        {closedN > 0 && (
          <label className="chk">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            Show closed ({closedN})
          </label>
        )}
        <button className="btn primary" onClick={() => setForm("new")}><Icon name="plus" />Add account</button>
      </PageHead>

      {list.length === 0 && (
        <div className="card">
          <h2>No accounts yet</h2>
          <p className="sub" style={{ marginTop: 6 }}>Add your bank, investment and pension accounts. Then record their balances once a month under Update balances.</p>
        </div>
      )}

      {ACCOUNT_TYPES.map((type) => {
        const accs = list.filter((a) => a.type === type).sort((a, b) => ledger.valueAt(b, today) - ledger.valueAt(a, today));
        if (!accs.length) return null;
        const sum = accs.reduce((s, a) => s + ledger.valueAt(a, today), 0);
        return (
          <section className="card" key={type}>
            <div className="sec-h">
              <h2>{type === "pension" && <Icon name="lock" />}{TYPE_PLURAL[type]}</h2>
              <span className="num">{chf(sum)}</span>
            </div>
            {type === "pension" && (
              <p className="sub" style={{ marginBottom: 8 }}>
                Not liquid. Paid out at retirement (or in special cases such as buying a home or leaving Switzerland).
              </p>
            )}
            <div className="tbl-wrap">
              <table className="tbl fixed">
                <colgroup><col /><col style={{ width: 210 }} /><col style={{ width: 140 }} /><col style={{ width: 150 }} /><col style={{ width: 120 }} /></colgroup>
                <thead><tr><th>Account</th><th>Owner</th><th>12 months</th><th className="r">Balance</th><th className="r">Updated</th></tr></thead>
                <tbody>
                  {accs.map((a) => {
                    const l = ledger.lastSnapshot(a);
                    const closed = !isActive(a, today);
                    return (
                      <tr key={a.id} tabIndex={0} className={`click ${ledger.isStale(a) ? "is-stale" : ""} ${closed ? "row-ended" : ""}`}
                        onClick={() => setOpenId(a.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(a.id)}>
                        <td><div className="acc-name">{a.name}</div><div className="sub">{a.institution}{a.type === "pension" && a.pensionKind ? ` · ${PENSION_LABEL[a.pensionKind]}` : ""}</div></td>
                        <td><Owners ids={a.owners} /></td>
                        <td><Spark values={last12(a)} color={typeColor(a.type)} /></td>
                        <td className="r num">{closed ? "Closed" : chf(ledger.valueAt(a, today), true)}</td>
                        <td className="r"><div className="sub">{l ? fmtDate(l.date) : "—"}</div><StalePill a={a} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {opened && !form && <AccountDetail a={opened} onClose={() => setOpenId(null)} onEdit={() => setForm(opened)} />}
      {form && <AccountForm account={form === "new" ? null : form} onClose={() => setForm(null)} />}
    </>
  );
}

function AccountDetail({ a, onClose, onEdit }: { a: Account; onClose: () => void; onEdit: () => void }) {
  const { ledger, today } = useApp();
  const mutate = useMutate();
  const snaps = ledger.snapshotsOf(a.id);
  const history = [...snaps].reverse();
  const last = history[0];
  const closed = !isActive(a, today);
  const [date, setDate] = useState(today);
  const [bal, setBal] = useState(last ? plain(last.balance) : "");
  const balV = parseChf(bal);

  const addSnapshot = () =>
    mutate(() => api.put("/snapshots", { accountId: a.id, date, balance: balV }), "Balance saved");

  return (
    <Modal onClose={onClose}
      title={<>{a.name} <span className="muted" style={{ fontWeight: 500 }}>· {a.institution}</span></>}
      sub={<>{typeLabel(a)} · <Owners ids={a.owners} /></>}
      footer={
        <>
          <div>
            {closed ? (
              <button className="btn" onClick={() => mutate(() => api.patch(`/accounts/${a.id}`, { closedAt: null }), "Account reopened")}>Reopen account</button>
            ) : (
              <ConfirmButton className="btn" confirmText="Click again to close" onConfirm={async () => {
                if ((await mutate(() => api.patch(`/accounts/${a.id}`, { closedAt: today }), "Account closed. History is kept.")) === true) onClose();
              }}>Close account</ConfirmButton>
            )}
            <ConfirmButton confirmText="Delete account and history?" onConfirm={async () => {
              if ((await mutate(() => api.del(`/accounts/${a.id}`), "Account deleted")) === true) onClose();
            }}>Delete</ConfirmButton>
          </div>
          <div><button className="btn" onClick={onEdit}>Edit details</button></div>
        </>
      }>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="label">{closed ? `Closed ${fmtDate(a.closedAt)}` : "Current balance"}</p>
          <p className="big num" style={{ fontSize: "2rem" }}>{last ? chf(last.balance, true) : "—"}</p>
          <p className="sub">{last ? `as of ${fmtDate(last.date)}` : "No balance recorded"} <StalePill a={a} /></p>
        </div>
        <Spark values={snaps.slice(-24).map((s) => s.balance)} color={typeColor(a.type)} w={220} h={60} />
      </div>
      {a.type === "pension" && (
        <div className="hint"><Icon name="lock" /> Counted as <b>pension, locked until retirement</b>. Not included in liquid net worth.</div>
      )}
      {a.notes && <p className="sub">{a.notes}</p>}
      {!closed && (
        <div className="card" style={{ padding: 14, background: "var(--surface-2)" }}>
          <p className="label" style={{ marginBottom: 8 }}>Record a balance</p>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr auto", alignItems: "end" }}>
            <label className="field"><span>Date</span><input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} /></label>
            <label className="field"><span>Balance (CHF)</span><input type="text" inputMode="decimal" className={bal && Number.isNaN(balV) ? "u-in err" : ""} value={bal} onChange={(e) => setBal(e.target.value)} /></label>
            <button className="btn primary" disabled={Number.isNaN(balV)} onClick={addSnapshot}>Save</button>
          </div>
          <p className="sub" style={{ marginTop: 6 }}>Saving on a date that already has a balance replaces it.</p>
        </div>
      )}
      <div>
        <p className="label" style={{ marginBottom: 4 }}>History ({history.length})</p>
        <div className="tbl-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th className="r">Balance</th><th className="r">Change</th><th /></tr></thead>
            <tbody>
              {history.map((s, i) => {
                const prev = history[i + 1];
                const d = prev ? s.balance - prev.balance : null;
                return (
                  <tr key={s.id}>
                    <td className="num">{fmtDate(s.date)}</td>
                    <td className="r num">{chf(s.balance, true)}</td>
                    <td className={`r num ${d === null || d === 0 ? "" : d > 0 ? "u-diff up" : "u-diff down"}`}>{d === null ? "—" : `${d >= 0 ? "+" : "−"}${amount2(Math.abs(d))}`}</td>
                    <td className="r">
                      <ConfirmButton className="btn sm ghost danger" confirmText="Delete?" onConfirm={() => mutate(() => api.del(`/snapshots/${s.id}`), "Entry deleted")}>
                        <Icon name="x" />
                      </ConfirmButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function AccountForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { data, today } = useApp();
  const mutate = useMutate();
  const [name, setName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "bank");
  const [pensionKind, setPensionKind] = useState<PensionKind>(account?.pensionKind ?? "pillar3a");
  const [owners, setOwners] = useState<string[]>(account?.owners ?? (data.persons[0] ? [data.persons[0].id] : []));
  const [notes, setNotes] = useState(account?.notes ?? "");
  const [balance, setBalance] = useState("");
  const [balanceDate, setBalanceDate] = useState(today);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) return setError("Give the account a name.");
    if (!owners.length) return setError("Pick at least one owner.");
    const v = balance.trim() ? parseChf(balance) : undefined;
    if (v !== undefined && Number.isNaN(v)) return setError("Balance must be a number, for example 12'345.50.");
    const body = { name, institution, type, pensionKind: type === "pension" ? pensionKind : null, owners, notes };
    const r = account
      ? await mutate(() => api.patch(`/accounts/${account.id}`, body), "Account saved")
      : await mutate(() => api.post("/accounts", { ...body, initialBalance: v, initialDate: v !== undefined ? balanceDate : undefined }), "Account added");
    if (r === true) onClose();
    else setError(r);
  }

  return (
    <Modal title={account ? "Edit account" : "Add account"} onClose={onClose}
      footer={<><div /><div><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>{account ? "Save" : "Add account"}</button></div></>}>
      <div className="form-grid">
        <label className="field"><span>Name</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Private account" /></label>
        <label className="field"><span>Bank / institution</span><input type="text" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. PostFinance" /></label>
        <label className="field"><span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        {type === "pension" && (
          <label className="field"><span>Pension kind</span>
            <select value={pensionKind} onChange={(e) => setPensionKind(e.target.value as PensionKind)}>
              {PENSION_KINDS.map((k) => <option key={k} value={k}>{PENSION_LABEL[k]}</option>)}
            </select>
          </label>
        )}
        <div className="field full"><span>Owner</span><OwnerPick value={owners} onChange={setOwners} /><small>Pick two or more for a shared account. Its value is split evenly.</small></div>
        {!account && (
          <>
            <label className="field"><span>Current balance (CHF)</span><input type="text" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" /></label>
            <label className="field"><span>As of</span><input type="date" value={balanceDate} max={today} onChange={(e) => setBalanceDate(e.target.value || today)} /></label>
          </>
        )}
        <label className="field full"><span>Notes</span><input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></label>
      </div>
      {error && <p className="form-err">{error}</p>}
    </Modal>
  );
}
