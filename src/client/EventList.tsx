import type { CostEvent } from "../shared/calc";
import { daysBetween } from "../shared/dates";
import { chf } from "../shared/money";
import { useApp } from "./api";
import { Pill } from "./ui";

const WHAT = { cancel: "Last day to cancel", renews: "Renews", ends: "Ends" } as const;
const PILL = { cancel: "Cancel by", renews: "Renews", ends: "Ends" } as const;

export function EventList({ events }: { events: CostEvent[] }) {
  const { today } = useApp();
  if (!events.length) return <p className="sub">Nothing due in this period.</p>;
  return (
    <div className="events">
      {events.map((e) => (
        <div className="event" key={e.cost.id + e.what + e.date}>
          <div className="when">
            <b>{e.date.slice(8, 10)}.{e.date.slice(5, 7)}.</b>in {daysBetween(today, e.date)} d
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="acc-name">{e.cost.name}</div>
            <div className="sub">
              {e.cost.provider} · {WHAT[e.what]}
              {e.what === "renews" && ` · ${chf(e.cost.amount, true)} due`}
            </div>
          </div>
          <Pill level={e.urgency}>{PILL[e.what]}</Pill>
        </div>
      ))}
    </div>
  );
}
