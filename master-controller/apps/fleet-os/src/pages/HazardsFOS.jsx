import React from "react";
import { useFleetOS, sel } from "../lib/store.js";
import { useClock } from "../lib/clock.js";
import { shortId, fmtDate } from "../lib/fmt.js";

const ICONS = {
  road_closed:"🚫", road_flooded:"🌊", road_icy:"🧊", pothole:"⚠️", debris:"🪨",
  accident:"💥", congestion:"🚗", roadworks:"🚧", fog:"🌫️", high_wind:"💨",
  flooding:"🌧️", black_ice:"❄️", police_incident:"🚔", other:"❗"
};

const SEV_COLOR = { critical:"var(--red)", high:"var(--amber)", medium:"var(--amber)", low:"var(--muted)" };

export default function HazardsFOS({ activeFleet }) {
  const { store } = useFleetOS();
  const clock = useClock();
  const hazards = sel.hazards(store, activeFleet);
  const active  = hazards.filter(h => h.status === "active");
  const resolved= hazards.filter(h => h.status === "resolved" || h.status === "expired");

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">Hazard Monitor</span>
        <div className="topbar-right">
          <span className="topbar-clock">{clock}</span>
          <span className="tag">FLEET OS</span>
        </div>
      </div>
      <div className="content">

        <div className="grid-kpi" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
          <div className="kpi"><div className="kpi-label">Total</div><div className="kpi-val">{hazards.length}</div></div>
          <div className="kpi"><div className="kpi-label">Active</div>
            <div className="kpi-val" style={{ color:active.length>0?"var(--amber)":"var(--green)" }}>{active.length}</div></div>
          <div className="kpi"><div className="kpi-label">Critical</div>
            <div className="kpi-val" style={{ color:"var(--red)" }}>{hazards.filter(h=>h.severity==="critical"&&h.status==="active").length}</div></div>
          <div className="kpi"><div className="kpi-label">Resolved</div>
            <div className="kpi-val" style={{ color:"var(--green)" }}>{resolved.length}</div></div>
        </div>

        {active.length > 0 && (
          <>
            <div className="sec-header"><span className="sec-title">Active Hazards</span></div>
            {active.map(h => {
              const driver = store.drivers[h.reportedByDriverId];
              return (
                <div key={h.id} className="card" style={{ borderLeft:`3px solid ${SEV_COLOR[h.severity]||"var(--muted)"}`, marginBottom:".5rem" }}>
                  <div className="flex-between mb-8">
                    <span style={{ fontWeight:700, fontSize:".9rem" }}>
                      {ICONS[h.type]||"❗"} {h.type?.replace(/_/g," ")}
                    </span>
                    <span className={`badge badge-${h.severity==="critical"?"rejected":h.severity==="high"?"unbound":"pending"}`}>
                      {h.severity}
                    </span>
                  </div>
                  <div style={{ fontSize:".78rem", color:"var(--muted)", display:"flex", gap:"1.2rem", flexWrap:"wrap" }}>
                    <span>📍 {h.lat?.toFixed(4)}, {h.lon?.toFixed(4)}</span>
                    <span>📏 {h.radiusM}m radius</span>
                    <span>👤 {driver?.name || "Unknown driver"}</span>
                    <span>✅ {h.confirmations} confirmed</span>
                    <span>❌ {h.rejections} disputed</span>
                    <span>⏱ Expires {h.expiresAt ? fmtDate(h.expiresAt) : "—"}</span>
                  </div>
                  {h.description && <div className="text-sm" style={{ marginTop:".5rem", color:"var(--text)" }}>{h.description}</div>}
                </div>
              );
            })}
          </>
        )}

        {active.length === 0 && (
          <div className="card" style={{ background:"var(--green-bg)", border:"1px solid var(--green)", marginBottom:".75rem" }}>
            <div style={{ color:"var(--green)", fontSize:".85rem", textAlign:"center" }}>✅ No active hazards</div>
          </div>
        )}

        {resolved.length > 0 && (
          <>
            <div className="sec-header" style={{ marginTop:".5rem" }}><span className="sec-title">Resolved</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Type</th><th>Severity</th><th>Location</th><th>Resolved</th></tr></thead>
                <tbody>
                  {resolved.map(h => (
                    <tr key={h.id}>
                      <td>{ICONS[h.type]||"❗"} {h.type?.replace(/_/g," ")}</td>
                      <td className="text-xs text-muted">{h.severity}</td>
                      <td className="mono">{h.lat?.toFixed(3)}, {h.lon?.toFixed(3)}</td>
                      <td className="mono">{fmtDate(h.resolvedAt || h.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
