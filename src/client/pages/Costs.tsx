import { useState } from "react";
import { NavLink } from "react-router-dom";
import { costStatus, costSummary, isCostActive, monthlyCost, upcomingEvents, type CostStatus } from "../../shared/calc";
import { addDays, addMonths, fmtDate, monthEnd } from "../../shared/dates";
import { chf, parseChf, plain } from "../../shared/money";
import {
  BILLING_LABEL, BILLINGS, CATEGORIES, CATEGORY_DEFAULT_KIND, CATEGORY_LABEL, COST_KINDS, KIND_LABEL, KIND_PLURAL,
  type Billing, type Category, type CostKind, type RecurringCost,
} from "../../shared/types";
import { api, useApp, useMutate } from "../api";
import { EventList } from "../EventList";
import { Avatar, ConfirmButton, Icon, Modal, OwnerPick, Owners, PageHead, Pill } from "../ui";

type Tab = "all" | "subscriptions";
type StatusFilter = "active" | "cancelled" | "all";

const months = (n: number) => `${n} month${n > 1 ? "s" : ""}`;
const termLabel = (c: RecurringCost) =>
  !c.renewal ? "Ongoing" : c.termMonths === 1 ? "Monthly" : c.termMonths % 12 === 0 ? `${c.termMonths / 12}-year term` : `${c.termMonths}-month term`;
const noticeLabel = (c: RecurringCost) =>
  c.noticeMonths === null ? "not cancellable" : c.noticeMonths === 0 ? "no notice period" : `${months(c.noticeMonths)} notice`;

function StatusCell({ st }: { st: CostStatus }) {
  switch (st.kind) {
    case "ended": return <Pill level="muted">Ended {fmtDate(st.endDate)}</Pill>;
    case "cancelled": return <Pill level="muted">Cancelled, ends {fmtDate(st.endDate)}</Pill>;
    case "mandatory": return <Pill level="muted">Not cancellable</Pill>;
    case "flex": return <Pill level="muted">Cancel any time</Pill>;
    case "ongoing": return <Pill level="muted">{months(st.noticeMonths)} notice</Pill>;
    case "term":
      return (
        <>
          <Pill level={st.urgency}>Cancel by {fmtDate(st.deadline)}</Pill>
          <div className="sub" style={{ marginTop: 3 }}>{st.missed ? `Deadline missed, runs until ${fmtDate(st.runsUntil)}` : `in ${st.days} days`}</div>
        </>
      );
  }
}

function CategoryBars({ byCategory }: { byCategory: Map<Category, number> }) {
  if (byCategory.size === 0) return <p className="sub">Nothing active.</p>;
  const max = Math.max(1, ...byCategory.values());
  return (
    <div className="cat-bars">
      {[...byCategory].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
        <div className="cat-bar" key={k}>
          <span>{CATEGORY_LABEL[k]}</span>
          <div className="track"><div className="fill" style={{ width: `${(v / max) * 100}%` }} /></div>
          <span className="num" style={{ textAlign: "right" }}>{chf(v, true)}</span>
        </div>
      ))}
    </div>
  );
}

const nextDate = (st: CostStatus) => (st.kind === "term" ? st.deadline : "renewal" in st && st.renewal ? st.renewal : "9999");

export default function Costs({ tab }: { tab: Tab }) {
  const { data, today } = useApp();
  const [form, setForm] = useState<RecurringCost | "new" | null>(null);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [kind, setKind] = useState<CostKind | "all">("all");
  const [cat, setCat] = useState<Category | "all">("all");
  const [who, setWho] = useState("all");

  const personIds = data.persons.map((p) => p.id);
  const inTab = tab === "subscriptions" ? data.costs.filter((c) => c.kind === "subscription") : data.costs;
  const summary = costSummary(inTab, personIds, today);

  const list = inTab
    .filter((c) => (status === "all" ? true : status === "active" ? isCostActive(c, today) && !c.endDate : !!c.endDate))
    .filter((c) => tab === "subscriptions" || kind === "all" || c.kind === kind)
    .filter((c) => cat === "all" || c.category === cat)
    .filter((c) => (who === "all" ? true : who === "shared" ? c.owners.length > 1 : c.owners.includes(who)))
    .sort(tab === "subscriptions"
      ? (a, b) => (nextDate(costStatus(a, today)) < nextDate(costStatus(b, today)) ? -1 : 1)
      : (a, b) => a.kind.localeCompare(b.kind) || monthlyCost(b) - monthlyCost(a));

  return (
    <>
      <PageHead eyebrow="Monthly & yearly" title="Recurring costs">
        <button className="btn primary" onClick={() => setForm("new")}>
          <Icon name="plus" />{tab === "subscriptions" ? "Add subscription" : "Add recurring cost"}
        </button>
      </PageHead>
      <nav className="seg tabs" aria-label="Recurring cost views">
        <NavLink to="/costs" end>All costs</NavLink>
        <NavLink to="/costs/subscriptions">Subscriptions</NavLink>
      </nav>

      <section className="sum-row">
        <div className="card stat"><p className="label">Per month</p><p className="v num">{chf(summary.monthly, true)}</p><p className="sub">{summary.count} active</p></div>
        <div className="card stat"><p className="label">Per year</p><p className="v num">{chf(summary.monthly * 12)}</p><p className="sub">Normalised from all billing cycles</p></div>
        {tab === "all" &&
          COST_KINDS.map((k) => (
            <div className="card stat" key={k}><p className="label">{KIND_PLURAL[k]}</p><p className="v num">{chf(summary.byKind[k], true)}</p><p className="sub">per month</p></div>
          ))}
        {tab === "subscriptions" &&
          data.persons.map((p) => (
            <div className="card stat" key={p.id}>
              <p className="label"><span className="owner"><Avatar p={p} />{p.name}</span></p>
              <p className="v num">{chf(summary.byPerson[p.id], true)}</p>
              <p className="sub">per month incl. share of shared</p>
            </div>
          ))}
      </section>

      <section className="grid2">
        {tab === "all" ? (
          <div className="card">
            <div className="card-h"><h2>By person</h2><span className="sub">per month, shared costs split evenly</span></div>
            <div className="cat-bars">
              {data.persons.map((p) => (
                <div className="cat-bar" key={p.id}>
                  <span className="owner"><Avatar p={p} />{p.name}</span>
                  <div className="track"><div className="fill" style={{ width: `${summary.monthly ? (summary.byPerson[p.id] / summary.monthly) * 100 : 0}%`, background: p.color }} /></div>
                  <span className="num" style={{ textAlign: "right" }}>{chf(summary.byPerson[p.id], true)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-h"><h2>Deadlines & renewals</h2><span className="sub">next 90 days</span></div>
            <EventList events={upcomingEvents(inTab, today, 90)} />
          </div>
        )}
        <div className="card">
          <div className="card-h"><h2>By category</h2><span className="sub">per month</span></div>
          <CategoryBars byCategory={summary.byCategory} />
        </div>
      </section>

      <section className="card">
        <div className="card-h">
          <div className="filters">
            <div className="seg" role="group" aria-label="Status">
              {([["active", "Active"], ["cancelled", "Cancelled"], ["all", "All"]] as const).map(([k, l]) => (
                <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>
              ))}
            </div>
            {tab === "all" && (
              <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as CostKind | "all")}>
                <option value="all">All kinds</option>
                {COST_KINDS.map((k) => <option key={k} value={k}>{KIND_PLURAL[k]}</option>)}
              </select>
            )}
            <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value as Category | "all")}>
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <select aria-label="Person" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="all">Everyone</option>
              {data.persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="shared">Shared only</option>
            </select>
          </div>
          <span className="sub">{list.length} shown</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{tab === "subscriptions" ? "Subscription" : "Cost"}</th><th>Category</th><th>Who</th><th className="r">Amount</th><th className="r">Per month</th>
                <th>Contract</th>{tab === "subscriptions" && <th>Next renewal</th>}<th>Cancellation</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const st = costStatus(c, today);
                return (
                  <tr key={c.id} tabIndex={0} className={`click ${st.kind === "ended" ? "row-ended" : ""}`}
                    onClick={() => setForm(c)} onKeyDown={(e) => e.key === "Enter" && setForm(c)}>
                    <td><div className="acc-name">{c.name}</div><div className="sub">{c.provider}</div></td>
                    <td><div className="sub">{CATEGORY_LABEL[c.category]}</div>{tab === "all" && <div className="sub" style={{ color: "var(--faint)" }}>{KIND_LABEL[c.kind]}</div>}</td>
                    <td><Owners ids={c.owners} /></td>
                    <td className="r num">{chf(c.amount, true)}<div className="sub">/{BILLING_LABEL[c.billing]}</div></td>
                    <td className="r num">{chf(monthlyCost(c), true)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div className="sub">{termLabel(c)}</div>
                      {/* other statuses already state the notice in the Cancellation pill */}
                      {st.kind === "term" && <div className="sub">{noticeLabel(c)}</div>}
                    </td>
                    {tab === "subscriptions" && <td className="num">{"renewal" in st && st.renewal ? fmtDate(st.renewal) : "—"}</td>}
                    <td><StatusCell st={st} /></td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={8} className="sub">Nothing matches these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {form && <CostForm cost={form === "new" ? null : form} defaultKind={tab === "subscriptions" ? "subscription" : "fixed"} onClose={() => setForm(null)} />}
    </>
  );
}

const TERMS = [1, 3, 6, 12, 24, 36];
const NOTICES: [string, string][] = [["none", "Not cancellable"], ["0", "No notice period"], ["1", "1 month"], ["2", "2 months"], ["3", "3 months"], ["6", "6 months"]];

/** Default last day when marking a cost as cancelled today. */
function defaultEndDate(st: CostStatus | null, today: string): string {
  if (!st) return today;
  if (st.kind === "term") return st.runsUntil;
  if (st.kind === "ongoing") return monthEnd(addMonths(today, st.noticeMonths));
  if ((st.kind === "flex" || st.kind === "mandatory") && st.renewal) return addDays(st.renewal, -1);
  return monthEnd(today);
}

function CostForm({ cost, defaultKind, onClose }: { cost: RecurringCost | null; defaultKind: CostKind; onClose: () => void }) {
  const { data, today } = useApp();
  const mutate = useMutate();
  const st = cost ? costStatus(cost, today) : null;
  const isFixed = (cost?.kind ?? defaultKind) === "fixed";
  const [name, setName] = useState(cost?.name ?? "");
  const [provider, setProvider] = useState(cost?.provider ?? "");
  const [kind, setKind] = useState<CostKind>(cost?.kind ?? defaultKind);
  const [category, setCategory] = useState<Category>(cost?.category ?? (isFixed ? "housing" : "streaming"));
  const [owners, setOwners] = useState<string[]>(cost?.owners ?? (data.persons[0] ? [data.persons[0].id] : []));
  const [amount, setAmount] = useState(cost ? plain(cost.amount) : "");
  const [billing, setBilling] = useState<Billing>(cost?.billing ?? "monthly");
  const [hasTerm, setHasTerm] = useState(cost ? cost.renewal !== null : !isFixed);
  const [term, setTerm] = useState(cost?.termMonths ?? 1);
  const [notice, setNotice] = useState(cost ? String(cost.noticeMonths ?? "none") : isFixed ? "3" : "0");
  const [renewal, setRenewal] = useState(st && "renewal" in st && st.renewal ? st.renewal : cost?.renewal ?? addMonths(today, 1));
  const [notes, setNotes] = useState(cost?.notes ?? "");
  const [endDate, setEndDate] = useState(defaultEndDate(st, today));
  const [error, setError] = useState("");

  const noun = kind === "subscription" ? "subscription" : "recurring cost";
  const done = (r: true | string) => (r === true ? onClose() : setError(r));

  async function save() {
    if (!name.trim()) return setError("Give it a name.");
    if (!owners.length) return setError("Pick who pays for it.");
    const amt = parseChf(amount);
    if (Number.isNaN(amt) || amt < 0) return setError("Amount must be a number, for example 18.90.");
    if (hasTerm && !renewal) return setError("Set the next renewal date.");
    const body = {
      name, provider, kind, category, owners, amount: amt, billing, notes,
      termMonths: hasTerm ? term : 1,
      renewal: hasTerm ? renewal : null,
      noticeMonths: notice === "none" ? null : Number(notice),
    };
    done(cost ? await mutate(() => api.patch(`/costs/${cost.id}`, body), "Saved") : await mutate(() => api.post("/costs", body), `Added ${name}`));
  }

  return (
    <Modal title={cost ? `Edit ${noun}` : `Add ${noun}`} sub={cost?.provider} onClose={onClose}
      footer={
        <>
          <div>{cost && <ConfirmButton confirmText="Click again to delete" onConfirm={async () => done(await mutate(() => api.del(`/costs/${cost.id}`), "Deleted"))}>Delete</ConfirmButton>}</div>
          <div><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>{cost ? "Save" : `Add ${noun}`}</button></div>
        </>
      }>
      <div className="form-grid">
        <label className="field"><span>Name</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "fixed" ? "e.g. Rent" : "e.g. Household insurance"} /></label>
        <label className="field"><span>Paid to</span><input type="text" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder={kind === "fixed" ? "e.g. Landlord" : "e.g. Die Mobiliar"} /></label>
        <label className="field"><span>Category</span>
          <select value={category} onChange={(e) => { const c = e.target.value as Category; setCategory(c); setKind(CATEGORY_DEFAULT_KIND[c]); }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <div className="field"><span>Kind</span>
          <div className="seg" role="group" aria-label="Kind">
            {COST_KINDS.map((k) => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
          </div>
          <small>Subscriptions also appear on the Subscriptions tab with renewals and deadlines</small>
        </div>
        <div className="field full"><span>Who pays</span><OwnerPick value={owners} onChange={setOwners} /><small>Shared costs are split evenly.</small></div>
        <label className="field"><span>Amount (CHF)</span><input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
        <label className="field"><span>Billed</span>
          <select value={billing} onChange={(e) => setBilling(e.target.value as Billing)}>
            {BILLINGS.map((b) => <option key={b} value={b}>per {BILLING_LABEL[b]}</option>)}
          </select>
        </label>
        <label className="chk full" style={{ color: "var(--ink)" }}>
          <input type="checkbox" checked={hasTerm} onChange={(e) => setHasTerm(e.target.checked)} />
          Fixed contract term with a renewal date
        </label>
        {hasTerm && (
          <>
            <label className="field"><span>Contract term</span>
              <select value={term} onChange={(e) => setTerm(Number(e.target.value))}>
                {TERMS.map((m) => <option key={m} value={m}>{m === 1 ? "Month to month" : m < 12 ? `${m} months` : `${m / 12} year${m > 12 ? "s" : ""}`}</option>)}
              </select>
              <small>Renews automatically after each term</small>
            </label>
            <label className="field"><span>Next renewal</span><input type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)} /><small>First day of the next term</small></label>
          </>
        )}
        <label className="field"><span>Notice period</span>
          <select value={notice} onChange={(e) => setNotice(e.target.value)}>
            {NOTICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <small>{hasTerm ? "Kündigungsfrist before the term ends" : "Kündigungsfrist, e.g. 3 months for rent"}</small>
        </label>
        <label className="field"><span>Notes</span><input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></label>
      </div>
      {error && <p className="form-err">{error}</p>}
      {st?.kind === "term" && (
        <div className="hint">Last day to cancel: <b>{fmtDate(st.deadline)}</b> (in {st.days} days){st.missed ? ". The deadline for the current term was missed." : "."}</div>
      )}
      {cost && !cost.endDate && st?.kind !== "mandatory" && (
        <div className="card" style={{ padding: 14, background: "var(--surface-2)" }}>
          <p className="label" style={{ marginBottom: 8 }}>Cancelled it?</p>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr auto", alignItems: "end" }}>
            <label className="field"><span>Runs until</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            <button className="btn" disabled={!endDate} onClick={async () => done(await mutate(() => api.patch(`/costs/${cost.id}`, { endDate }), "Marked as cancelled"))}>Mark as cancelled</button>
          </div>
        </div>
      )}
      {cost?.endDate && (
        <div className="hint">
          {st?.kind === "ended" ? "Ended" : "Cancelled, ends"} {fmtDate(cost.endDate)}.{" "}
          <button className="btn sm" onClick={async () => done(await mutate(() => api.patch(`/costs/${cost.id}`, { endDate: null }), "Cancellation undone"))}>Undo cancellation</button>
        </div>
      )}
    </Modal>
  );
}
