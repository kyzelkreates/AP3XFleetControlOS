import React, { useState } from "react";
import { useFleetOS, sel, toast } from "../lib/store.js";
import { useClock } from "../lib/clock.js";
import { shortId, fmtDate, statusBadge } from "../lib/fmt.js";

export default function Assignments({ activeFleet }) {
  const { store, dispatch } = useFleetOS();
  const clock = useClock();

  const drivers  = sel.drivers(store, activeFleet);
  const vehicles = sel.vehicles(store, activeFleet);

  function assignDriver(vehicleId, driverId) {
    const fleet = store.vehicles[vehicleId]?.fleetId;
    dispatch({ type:"ASSIGN_DRIVER_TO_VEHICLE", payload:{ vehicleId, driverId, fleetId:fleet } });
    toast("Driver assigned to vehicle", "success");
  }

  function unassignDriver(vehicleId) {
    const fleet = store.vehicles[vehicleId]?.fleetId;
    dispatch({ type:"UNASSIGN_DRIVER_FROM_VEHICLE", payload:{ vehicleId, fleetId:fleet } });
    toast("Driver unassigned", "info");
  }

  // Drivers without a vehicle assignment
  const assignedDriverIds = vehicles.map(v => v.assignedDriverId).filter(Boolean);
  const freeDrivers = drivers.filter(d => !assignedDriverIds.includes(d.id) && d.identityId);

  return (
    <div className="main">
      <div className="topbar">
        <span className="topbar-title">Driver Assignments</span>
        <div className="topbar-right">
          <span className="topbar-clock">{clock}</span>
          <span className="tag">FLEET OS</span>
        </div>
      </div>
      <div className="content">

        {/* Summary */}
        <div className="grid-kpi" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
          <div className="kpi"><div className="kpi-label">Vehicles</div><div className="kpi-val">{vehicles.length}</div></div>
          <div className="kpi"><div className="kpi-label">Assigned</div><div className="kpi-val" style={{ color:"var(--green)" }}>{vehicles.filter(v=>v.assignedDriverId).length}</div></div>
          <div className="kpi"><div className="kpi-label">Available Drivers</div><div className="kpi-val">{freeDrivers.length}</div></div>
        </div>

        {/* Assignment table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Registration</th>
                <th>Weight</th>
                <th>Status</th>
                <th>Assigned Driver</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 && (
                <tr><td colSpan={6} className="td-empty">No vehicles. Register them in Master Controller.</td></tr>
              )}
              {vehicles.map(v => {
                const driver = v.assignedDriverId ? store.drivers[v.assignedDriverId] : null;
                return (
                  <tr key={v.id}>
                    <td><strong>{v.type}</strong></td>
                    <td className="mono">{v.registration || "—"}</td>
                    <td className="text-sm text-muted">{v.weightClass}</td>
                    <td><span className={`badge ${statusBadge(v.status)}`}>{v.status}</span></td>
                    <td>
                      {driver
                        ? <span style={{ color:"var(--green)", fontWeight:600 }}>{driver.name}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      {driver ? (
                        <button className="btn btn-danger btn-sm" onClick={() => unassignDriver(v.id)}>Unassign</button>
                      ) : (
                        <select
                          className="select"
                          style={{ fontSize:".75rem", padding:".3rem .55rem", width:"auto" }}
                          defaultValue=""
                          onChange={e => { if (e.target.value) assignDriver(v.id, e.target.value); }}
                        >
                          <option value="">Assign driver…</option>
                          {freeDrivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.licenseType})</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Unbound drivers note */}
        {drivers.filter(d => !d.identityId).length > 0 && (
          <div className="card" style={{ background:"var(--amber-bg)", border:"1px solid var(--amber)", marginTop:".5rem" }}>
            <div className="text-xs" style={{ color:"var(--amber)" }}>
              ⚠️ {drivers.filter(d=>!d.identityId).length} driver(s) have no identity binding and cannot be assigned. Bind them in Master Controller → Identities.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
