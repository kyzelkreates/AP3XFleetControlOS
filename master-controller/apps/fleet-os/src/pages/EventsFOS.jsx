import React, { useState } from "react";
import { useFleetOS, sel } from "../lib/store.js";
import { useClock } from "../lib/clock.js";
import { shortId, fmtTime } from "../lib/fmt.js";

const FILTERS = [
  { label:"All",       val:"" },
  { label:"Route",     val:"route." },
  { label:"Hazard",    val:"hazard." },
  { label:"Driver",    val:"driver." },
  { label:"Vehicle",   val:"vehicle." },
  { label:"Device",    val:"device." },
  { label:"Identity",  val:"identity." },
  { label:"Sync",      val:"sync." },
];

export default function EventsFOS({ activeFleet }) {
  const { store } = useFleetOS();
  const clock = useClock();
  const [filter, setFilter] = useState("");

  const allEvents = sel.events(store);
  const filtered  = allEvents.filter(e => {
    if (filter && !e.type?.startsWith(filter)) return false;
    if (activeFleet && e.fleetId && e.fleetId !== activeFleet) return false;
    return true;
  });

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">Event Stream</span>
        <div className="topbar-right">
          <span className="topbar-clock">{clock}</span>
          <span className="tag">FLEET OS</span>
        </div>
      </div>
      <div className="content">

        <div className="grid-kpi" style={{ gridTemplateColumns:"repeat(5,1fr)", marginBottom:".85rem" }}>
          <div className="kpi"><div className="kpi-label">Total</div><div className="kpi-val">{allEvents.length}</div></div>
          {["route","hazard","driver","vehicle","device"].map(t => (
            <div key={t} className="kpi">
              <div className="kpi-label">{t}</div>
              <div className="kpi-val" style={{ fontSize:"1.3rem" }}>{allEvents.filter(e=>e.type?.startsWith(t+".")).length}</div>
            </div>
          ))}
        </div>

        {/* Filter pills */}
        <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap", marginBottom:".75rem" }}>
          {FILTERS.map(f => (
            <button key={f.val} onClick={() => setFilter(f.val)} className="btn btn-secondary btn-sm"
              style={filter===f.val ? { borderColor:"var(--blue)", color:"var(--blue-light)" } : {}}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="event-log">
          <div className="event-log-header">
            <span className="text-xs text-muted">{filtered.length} events</span>
            <span style={{ fontSize:".72rem", color:"var(--green)", display:"flex", alignItems:"center", gap:"4px" }}>
              <span className="pulse-dot" style={{ marginRight:0 }}></span> Live
            </span>
          </div>
          <div className="event-entries" style={{ maxHeight:"calc(100vh - 330px)" }}>
            {filtered.length === 0 && <div className="td-empty">No events match filter.</div>}
            {filtered.map(e => (
              <div key={e.id} className="event-entry">
                <span className="ev-time">{fmtTime(e.timestamp)}</span>
                <span className="ev-type">{e.type}</span>
                <span className="ev-ctx">{e.fleetId ? shortId(e.fleetId) : "—"} {e.entityId ? `› ${shortId(e.entityId)}` : ""}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
