import React, { useState, useEffect } from "react";
import { useFleetOS, sel } from "../lib/store.js";
import { useClock } from "../lib/clock.js";
import { shortId, fmtDate, statusBadge } from "../lib/fmt.js";

export default function LiveFleet({ activeFleet }) {
  const { store } = useFleetOS();
  const clock = useClock();

  const drivers  = sel.drivers(store, activeFleet);
  const vehicles = sel.vehicles(store, activeFleet);
  const devices  = sel.devices(store, activeFleet);
  const routes   = sel.routes(store, activeFleet);
  const hazards  = sel.hazards(store, activeFleet);

  const boundDrivers   = drivers.filter(d => d.boundDeviceId);
  const activeRoutes   = routes.filter(r => r.status === "validated" || r.status === "approved");
  const activeHazards  = hazards.filter(h => h.status === "active");

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">Live Fleet</span>
        <div className="topbar-right">
          <span className="topbar-clock">{clock}</span>
          <span className="tag">FLEET OS</span>
        </div>
      </div>
      <div className="content">

        {/* KPIs */}
        <div className="grid-kpi">
          <div className="kpi"><div className="kpi-label">Drivers</div><div className="kpi-val">{drivers.length}</div><div className="kpi-sub">{boundDrivers.length} bound</div></div>
          <div className="kpi"><div className="kpi-label">Vehicles</div><div className="kpi-val">{vehicles.length}</div><div className="kpi-sub">{vehicles.filter(v=>v.status==="active").length} active</div></div>
          <div className="kpi"><div className="kpi-label">Devices</div><div className="kpi-val">{devices.length}</div><div className="kpi-sub">{devices.filter(d=>d.status==="bound").length} online</div></div>
          <div className="kpi"><div className="kpi-label">Routes</div><div className="kpi-val">{activeRoutes.length}</div><div className="kpi-sub">active</div></div>
          <div className="kpi"><div className="kpi-label">Hazards</div>
            <div className="kpi-val" style={{ color: activeHazards.length > 0 ? "var(--amber)" : "var(--green)" }}>
              {activeHazards.length}
            </div>
            <div className="kpi-sub">live reports</div>
          </div>
        </div>

        {/* Driver grid */}
        <div className="sec-header">
          <span className="sec-title">Driver Status</span>
          <span className="mono">{drivers.length} total</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:".65rem", marginBottom:"1rem" }}>
          {drivers.length === 0 && (
            <div className="card" style={{ gridColumn:"1/-1" }}>
              <div className="empty-state"><div className="empty-state-icon">👤</div><div>No drivers. Add them in Master Controller.</div></div>
            </div>
          )}
          {drivers.map(d => {
            const device  = d.boundDeviceId ? store.devices[d.boundDeviceId]  : null;
            const vehicle = Object.values(store.vehicles).find(v => v.assignedDriverId === d.id);
            const route   = vehicle ? Object.values(store.routes).find(r => r.vehicleId === vehicle.id && (r.status === "validated" || r.status === "approved")) : null;
            const online  = device?.status === "bound";
            return (
              <div key={d.id} className="card" style={{ marginBottom:0, borderLeft:`3px solid ${online?"var(--green)":"var(--border)"}` }}>
                <div className="flex-between mb-8">
                  <span style={{ fontWeight:700, fontSize:".88rem" }}>{d.name}</span>
                  <span className={`badge badge-${online?"active":"unbound"}`}>{online?"online":"offline"}</span>
                </div>
                <div className="text-xs text-muted" style={{ marginBottom:".3rem" }}>
                  🪪 {d.licenseType} &nbsp;|&nbsp; {device ? `${device.platform}` : "No device"}
                </div>
                {vehicle && <div className="text-xs" style={{ color:"var(--blue-light)" }}>🚚 {vehicle.registration || vehicle.type}</div>}
                {route   && <div className="text-xs" style={{ color:"var(--green)", marginTop:".2rem" }}>🗺️ {route.summary?.distanceKm}km route active</div>}
                {!route && vehicle && <div className="text-xs text-muted mt-4">No route assigned</div>}
              </div>
            );
          })}
        </div>

        {/* Active hazards strip */}
        {activeHazards.length > 0 && (
          <>
            <div className="sec-header"><span className="sec-title">⚠️ Active Hazards</span></div>
            <div style={{ display:"flex", flexDirection:"column", gap:".4rem", marginBottom:"1rem" }}>
              {activeHazards.map(h => (
                <div key={h.id} className="card" style={{ marginBottom:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:".6rem 1rem" }}>
                  <div>
                    <span className="text-sm font-bold">{h.type?.replace(/_/g," ")}</span>
                    <span className="mono" style={{ marginLeft:"1rem" }}>{h.lat?.toFixed(3)}, {h.lon?.toFixed(3)}</span>
                  </div>
                  <span className={`badge badge-${h.severity==="critical"?"rejected":h.severity==="high"?"unbound":"pending"}`}>{h.severity}</span>
                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
