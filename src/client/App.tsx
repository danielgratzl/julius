import { useMemo } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { costStatus, createLedger } from "../shared/calc";
import { localToday } from "../shared/dates";
import { AppContext, useDataQuery, type AppCtx } from "./api";
import Accounts from "./pages/Accounts";
import Costs from "./pages/Costs";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Update from "./pages/Update";
import { Icon, Logo, type IconName } from "./ui";

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try {
    localStorage.setItem("julius-theme", root.dataset.theme);
  } catch {
    /* storage unavailable */
  }
}

export default function App() {
  const { data, error } = useDataQuery();
  const today = localToday();
  const ctx = useMemo<AppCtx | null>(() => {
    if (!data) return null;
    const byId = new Map(data.persons.map((p) => [p.id, p]));
    return { data, today, ledger: createLedger(data, today), person: (id) => byId.get(id) };
  }, [data, today]);

  if (error) return <div className="loading"><Logo size={64} />Could not load data: {error.message}</div>;
  if (!ctx) return <div className="loading"><Logo size={64} />Loading…</div>;

  const staleN = ctx.data.accounts.filter(ctx.ledger.isStale).length;
  const soonN = ctx.data.costs.filter((c) => {
    const st = costStatus(c, today);
    return st.kind === "term" && st.days <= 30;
  }).length;
  // [path, icon, label, badge, exact match]
  const nav: [string, IconName, string, number?, boolean?][] = [
    ["/", "home", "Overview", 0, true],
    ["/update", "refresh", "Update balances", staleN],
    ["/accounts", "wallet", "Accounts"],
    ["/costs", "repeat", "Recurring costs", soonN],
    ["/settings", "gear", "Settings"],
  ];

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <aside className="rail">
          <div className="brand">
            <Logo />
            <div>
              <div className="brand-name">Julius</div>
              <div className="brand-sub">Household ledger</div>
            </div>
          </div>
          <nav className="nav" aria-label="Main">
            {nav.map(([to, icon, label, badge, exact]) => (
              <NavLink key={to} to={to} end={exact} title={label}>
                <span className="nav-item">
                  <Icon name={icon} />
                  <span className="nl">{label}</span>
                  {badge ? <span className="badge" aria-label={`${badge} need attention`}>{badge}</span> : null}
                </span>
              </NavLink>
            ))}
          </nav>
          <div className="rail-foot">
            <button className="btn sm" onClick={toggleTheme}><Icon name="moon" />Toggle theme</button>
          </div>
        </aside>
        <main className="main">
          <div className="wrap">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/update" element={<Update />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/costs" element={<Costs tab="all" />} />
              <Route path="/costs/subscriptions" element={<Costs tab="subscriptions" />} />
              <Route path="/subscriptions" element={<Navigate to="/costs/subscriptions" replace />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </AppContext.Provider>
  );
}
