import React, { useState } from "react";
import { useFleetOS, sel, toast } from "../lib/store.js";
import { useClock } from "../lib/clock.js";
import { shortId, fmtDate, statusBadge } from "../lib/fmt.js";

const DROP_ICONS = ["🟢", "🔵", "🟡", "🟠", "🔴", "🟣", "⚪"];

export default function RoutesMgmt({ activeFleet }) {
  const { store, dispatch } = useFleetOS();
  const clock = useClock();
  const [selected, setSelected] = useState(null);

  const routes  = sel.routes(store, activeFleet);
  const drivers = sel.drivers(store, activeFleet);

  const sorted = [...routes].sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  const sel_route = selected ? store.routes[selected] : null;

  function assignDriverToRoute(routeId, driverId) {
    const route = store.routes[routeId];
    dispatch({ type:"ROUTE_ASSIGN_DRIVER", payload:{ routeId, driverId, fleetId:route.fleetId } });
    toast("Driver assigned to route", "success");
  }

  function updateStatus(routeId, status) {
    const route = store.routes[routeId];
    dispatch({ type:"ROUTE_STATUS_UPDATE", payload:{ routeId, status, fleetId:route.fleetId } });
    toast(`Route marked as ${status}`, "info");
  }

  const boundDrivers = drivers.filter(d => d.identityId);

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">Route Management</span>
        <div className="topbar-right">
          <span className="topbar-clock">{clock}</span>
          <span className="tag">FLEET OS</span>
        </div>
      </div>
      <div className="content">

        <div className="grid-kpi" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
          <div className="kpi"><div className="kpi-label">Total</div><div className="kpi-val">{routes.length}</div></div>
          <div className="kpi"><div className="kpi-label">Validated</div><div className="kpi-val" style={{ color:"var(--green)" }}>{routes.filter(r=>r.status==="validated"||r.status==="approved").length}</div></div>
          <div className="kpi"><div className="kpi-label">Pending</div><div className="kpi-val" style={{ color:"var(--amber)" }}>{routes.filter(r=>r.status==="pending"||r.status==="computed").length}</div></div>
          <div className="kpi"><div className="kpi-label">Failed</div><div className="kpi-val" style={{ color:"var(--red)" }}>{routes.filter(r=>r.status==="failed"||r.status==="cancelled").length}</div></div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns: sel_route ? "1fr 360px" : "1fr", gap:".75rem" }}>
          {/* Route list */}
          <div className="table-wrap" style={{ marginBottom:0 }}>
            <table>
              <thead>
                <tr><th>ID</th><th>Vehicle</th><th>Driver</th><th>Drops</th><th>Distance</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr><td colSpan={7} className="td-empty">No routes. Generate them in Master Controller → Routes.</td></tr>
                )}
                {sorted.map(r => {
                  const vehicle = store.vehicles[r.vehicleId];
                  const driver  = r.driverId ? store.drivers[r.driverId] : null;
                  return (
                    <tr key={r.id} onClick={() => setSelected(selected===r.id ? null : r.id)}
                      style={{ cursor:"pointer", background: selected===r.id ? "var(--blue-glow)" : "" }}>
                      <td className="mono">{shortId(r.id)}</td>
                      <td className="text-sm">{vehicle?.registration || vehicle?.type || "—"}</td>
                      <td className="text-sm">{driver?.name || <span className="text-muted">Unassigned</span>}</td>
                      <td className="mono">{r.drops?.length ?? "—"}</td>
                      <td className="mono">{r.summary?.distanceKm ?? "—"} km</td>
                      <td><span className={`badge ${statusBadge(r.status)}`}>{r.status}</span></td>
                      <td className="mono">{fmtDate(r.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Route detail panel */}
          {sel_route && (
            <div>
              <div className="card" style={{ marginBottom:".5rem" }}>
                <div className="card-title">Route Detail</div>
                <div className="mono mb-8">{sel_route.id}</div>
                <div style={{ fontSize:".8rem", display:"flex", flexDirection:"column", gap:".35rem", marginBottom:".75rem" }}>
                  <div className="flex-between"><span className="text-muted">Distance</span><span>{sel_route.summary?.distanceKm} km</span></div>
                  <div className="flex-between"><span className="text-muted">Duration</span><span>{sel_route.summary?.durationMin} min</span></div>
                  <div className="flex-between"><span className="text-muted">Provider</span><span className="mono">{sel_route.provider}</span></div>
                  <div className="flex-between"><span className="text-muted">Status</span><span className={`badge ${statusBadge(sel_route.status)}`}>{sel_route.status}</span></div>
                </div>

                {/* Assign driver */}
                <div className="form-group">
                  <label className="label">Assign Driver</label>
                  <select className="select" value={sel_route.driverId||""} onChange={e => assignDriverToRoute(sel_route.id, e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {boundDrivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                {/* Status controls */}
                <div style={{ display:"flex", flexDirection:"column", gap:".4rem" }}>
                  {["validated","cancelled","failed"].map(s => (
                    <button key={s} className={`btn btn-secondary btn-sm`}
                      disabled={sel_route.status===s}
                      onClick={() => updateStatus(sel_route.id, s)}>
                      Mark as {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drop list */}
              <div className="card">
                <div className="card-title">Drop Points ({sel_route.drops?.length})</div>
                {(sel_route.drops||[]).map((d,i) => (
                  <div key={i} style={{ display:"flex", gap:".6rem", alignItems:"flex-start", marginBottom:".5rem", fontSize:".8rem" }}>
                    <span style={{ marginTop:".1rem" }}>{DROP_ICONS[i % DROP_ICONS.length]}</span>
                    <div>
                      <div style={{ fontWeight:600 }}>{d.label || `Stop ${i+1}`}</div>
                      <div className="mono">{d.lat?.toFixed(5)}, {d.lon?.toFixed(5)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
