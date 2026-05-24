import React, { useState, useEffect } from "react";
import { checkTileReadiness } from "../lib/nav.js";

const DROP_ICONS = ["🟢","🔵","🟡","🟠","🔴","🟣","⬜","🔷","🔶"];

export default function RouteView({ route, session, currentDrop, remainingDrops, confirmDrop, skipCurrentDrop }) {
  const [tileStatus, setTileStatus] = useState(null);

  useEffect(() => {
    if (!route) return;
    checkTileReadiness(route).then(r => setTileStatus(r));
  }, [route?.id]);

  if (!route) {
    return (
      <div className="view-inner">
        <div className="empty-state">
          <div className="empty-icon">🗺️</div>
          <div className="empty-title">No Route Loaded</div>
          <div className="empty-sub">Waiting for route from control plane…</div>
          <div className="empty-sub" style={{ marginTop:".5rem", fontSize:".72rem" }}>
            Ensure device is registered and sync is active.
          </div>
        </div>
      </div>
    );
  }

  const isCompleted  = session?.status === "completed";
  const progress     = session ? (session.currentIndex / session.drops.length) * 100 : 0;
  const remaining    = remainingDrops.length;
  const completed    = session?.completedDrops?.length || 0;
  const skipped      = session?.skippedDrops?.length   || 0;
  const distKm       = route.summary?.distanceKm ?? "—";
  const durationMin  = route.summary?.durationMin ?? "—";

  return (
    <div className="view-inner">
      {/* Route summary card */}
      <div className="card highlight">
        <div className="card-row">
          <div>
            <div className="card-label">Route</div>
            <div className="card-mono">{route.id?.slice(0,8)}</div>
          </div>
          <div>
            <div className="card-label">Distance</div>
            <div className="card-val">{distKm} km</div>
          </div>
          <div>
            <div className="card-label">Est. Time</div>
            <div className="card-val">{durationMin} min</div>
          </div>
          <div>
            <div className="card-label">Drops</div>
            <div className="card-val">{route.drops?.length}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop:".75rem" }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:".7rem", marginBottom:".3rem", color:"var(--muted)" }}>
            <span>{completed} done{skipped > 0 ? ` · ${skipped} skipped` : ""}</span>
            <span>{remaining} remaining</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width:`${progress}%` }}></div>
          </div>
        </div>
      </div>

      {/* Tile cache status */}
      {tileStatus !== null && (
        <div className={`tile-status ${tileStatus.ready ? "ready" : "missing"}`}>
          <span>{tileStatus.ready ? "📦 Offline tiles cached" : "⚠️ Tiles not fully cached — go online to download"}</span>
          <span className="tile-count">{tileStatus.count} tiles</span>
        </div>
      )}

      {/* Completed state */}
      {isCompleted && (
        <div className="card" style={{ background:"var(--green-bg)", border:"1px solid var(--green)", textAlign:"center", padding:"2rem" }}>
          <div style={{ fontSize:"2rem", marginBottom:".5rem" }}>✅</div>
          <div style={{ color:"var(--green)", fontWeight:700, fontSize:"1rem" }}>Route Complete</div>
          <div style={{ color:"var(--muted)", fontSize:".8rem", marginTop:".4rem" }}>
            {completed} drops delivered · {skipped} skipped
          </div>
        </div>
      )}

      {/* Current stop */}
      {!isCompleted && currentDrop && (
        <div className="card highlight" style={{ borderColor:"var(--cyan)" }}>
          <div className="card-label" style={{ color:"var(--cyan)" }}>CURRENT STOP</div>
          <div style={{ fontWeight:700, fontSize:"1.05rem", marginBottom:".4rem" }}>
            {DROP_ICONS[session?.currentIndex % DROP_ICONS.length]} {currentDrop.label || `Stop ${session.currentIndex + 1}`}
          </div>
          <div className="card-mono">{currentDrop.lat?.toFixed(5)}, {currentDrop.lon?.toFixed(5)}</div>

          {/* ETA */}
          {session?.etas?.[0] && (
            <div style={{ marginTop:".5rem", fontSize:".8rem", color:"var(--muted)" }}>
              ~{session.etas[0].distKm} km · ~{session.etas[0].etaMin} min ETA
            </div>
          )}

          <div style={{ display:"flex", gap:".6rem", marginTop:"1rem" }}>
            <button className="btn btn-primary btn-full" onClick={confirmDrop}>
              ✅ Confirm Arrival
            </button>
            <button className="btn btn-secondary" onClick={skipCurrentDrop} style={{ flexShrink:0 }}>
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Drop list */}
      <div className="card-label" style={{ margin:".5rem 0 .4rem" }}>All Stops</div>
      {route.drops?.map((d, i) => {
        const isDone    = i < session?.currentIndex;
        const isCurrent = i === session?.currentIndex;
        const isSkipped = session?.skippedDrops?.some(s => s.sequence === d.sequence);
        return (
          <div key={i} className={`drop-row ${isCurrent ? "drop-current" : ""} ${isDone ? "drop-done" : ""}`}>
            <span className="drop-icon">{isDone ? "✅" : isSkipped ? "⏭" : DROP_ICONS[i % DROP_ICONS.length]}</span>
            <div className="drop-info">
              <div className="drop-label">{d.label || `Stop ${i+1}`}</div>
              <div className="drop-coords">{d.lat?.toFixed(4)}, {d.lon?.toFixed(4)}</div>
            </div>
            {isCurrent && <span className="drop-current-badge">NOW</span>}
          </div>
        );
      })}
    </div>
  );
}
