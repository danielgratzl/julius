import { useRef, useState } from "react";
import { api, useApp, useMutate } from "../api";
import { ConfirmButton, Icon, PageHead } from "../ui";

const COLORS = ["#7b62b8", "#2a9d84", "#c2417a", "#5d7c2f"];

export default function Settings() {
  const { data } = useApp();
  const mutate = useMutate();
  const [staleDays, setStaleDays] = useState(String(data.settings.staleDays));
  const [restore, setRestore] = useState<{ name: string; json: unknown } | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const used = (id: string) => data.accounts.some((a) => a.owners.includes(id)) || data.costs.some((c) => c.owners.includes(id));

  async function pickFile(file: File | undefined) {
    setRestoreError("");
    if (!file) return;
    try {
      setRestore({ name: file.name, json: JSON.parse(await file.text()) });
    } catch {
      setRestore(null);
      setRestoreError("This file is not valid JSON.");
    }
  }

  return (
    <>
      <PageHead eyebrow="Configuration" title="Settings" />
      <section className="grid2">
        <div className="card">
          <div className="card-h">
            <h2>Persons</h2>
            <button className="btn sm" onClick={() => mutate(() => api.post("/persons", { name: "New person", color: COLORS[data.persons.length % COLORS.length] }), "Person added")}>
              <Icon name="plus" />Add person
            </button>
          </div>
          <p className="sub" style={{ marginBottom: 6 }}>Accounts and recurring costs belong to one person or are shared. Shared values are split evenly.</p>
          {data.persons.map((p) => (
            <div className="person-edit" key={p.id}>
              <input type="color" defaultValue={p.color} aria-label={`Colour for ${p.name}`}
                onBlur={(e) => e.target.value !== p.color && mutate(() => api.patch(`/persons/${p.id}`, { color: e.target.value }))} />
              <input type="text" defaultValue={p.name} aria-label="Name"
                onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== p.name) mutate(() => api.patch(`/persons/${p.id}`, { name }), "Name saved"); }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
              <ConfirmButton className="btn sm danger" confirmText="Remove?" disabled={used(p.id)}
                title={used(p.id) ? "Still owns accounts or recurring costs" : undefined}
                onConfirm={() => mutate(() => api.del(`/persons/${p.id}`), "Person removed")}>Remove</ConfirmButton>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-h"><h2>Reminders</h2></div>
          <label className="field" style={{ maxWidth: 300 }}>
            <span>Flag accounts as outdated after</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" min={1} max={365} value={staleDays} style={{ maxWidth: 90 }} onChange={(e) => setStaleDays(e.target.value)}
                onBlur={() => {
                  const v = Math.max(1, Math.min(365, Math.round(Number(staleDays)) || 31));
                  setStaleDays(String(v));
                  if (v !== data.settings.staleDays) mutate(() => api.patch("/settings", { staleDays: v }), `Reminder after ${v} days`);
                }} />
              <span className="sub">days without a new balance</span>
            </div>
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Backup</h2></div>
        <p className="sub" style={{ marginBottom: 12 }}>
          The backup file contains everything: persons, accounts, balance history and recurring costs. The SQLite database lives in the Docker volume as well.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn" href="/api/backup" download><Icon name="download" />Download backup (JSON)</a>
          <a className="btn" href="/api/export/balances.csv" download><Icon name="download" />Export balances (CSV)</a>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" />Restore from backup…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {restoreError && <p className="form-err" style={{ marginTop: 10 }}>{restoreError}</p>}
        {restore && (
          <div className="banner" style={{ marginTop: 14 }}>
            <Icon name="alert" />
            <div className="banner-body">
              <strong>Replace all data with {restore.name}?</strong>
              <span className="sub">Everything currently stored is deleted. Download a backup first if you might need it.</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => setRestore(null)}>Cancel</button>
              <ConfirmButton confirmText="Click again to replace" onConfirm={async () => {
                const r = await mutate(() => api.post("/backup", restore.json), "Backup restored");
                if (r === true) setRestore(null);
                else setRestoreError(r);
              }}>Replace data</ConfirmButton>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
