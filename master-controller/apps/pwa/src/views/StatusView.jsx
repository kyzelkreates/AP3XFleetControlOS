import React, { useState, useEffect } from "react";

export default function StatusView({ identity, syncStatus, syncEvents, onFlush }) {
  const [swStatus, setSwStatus] = useState("Checking…");
  const [geoStatus, setGeoStatus] = useState("—");
  const [tileCount, setTileCount] = useState("—");

  useEffect(() => {
    // SW status
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        setSwStatus(reg ? `Active (${reg.scope})` : "Not registered");
      }).catch(() => setSwStatus("Error"));
    } else {
      setSwStatus("Not supported");
    }

    // Geo
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => setGeoStatus("Available"),
        () => setGeoStatus("Denied / unavailable")
      );
    } else {
      setGeoStatus("Not supported");
    }

    // Tile count
    import("../lib/idb.js").then(({ openDB }) => {
      openDB().then(db => {
        const tx  = db.transaction("tiles","readonly");
        const req = tx.objectStore("tiles").count();
        req.onsuccess = e => setTileCount(`${e.target.result} tiles cached`);
      }).catch(() => setTileCount("—"));
    });
  }, []);

  const Row = ({ label, val, color }) => (
    <div style={{ display:"flex", justifyContent:"space-between", fontSize:".8rem", padding:".35rem 0", borderBottom:"1px solid var(--border)" }}>
      <span style={{ color:"var(--muted)" }}>{label}</span>
      <span style={{ color: color || "inherit", fontFamily:"monospace" }}>{val}</span>
    </div>
  );

  return (
    <div className="view-inner">

      {/* Identity */}
      <div className="card highlight">
        <div className="card-label">Driver Identity</div>
        {identity ? (
          <>
            <Row label="Driver ID"   val={identity.driverId}   color="var(--cyan)" />
            <Row label="Fleet ID"    val={identity.fleetId}    color="var(--cyan)" />
            <Row label="Device ID"   val={identity.deviceId}   />
            <Row label="Name"        val={identity.driverName || "—"} />
          </>
        ) : <div style={{ color:"var(--muted)", fontSize:".8rem" }}>Loading identity…</div>}
      </div>

      {/* Device */}
      <div className="card">
        <div className="card-label">Device Status</div>
        <Row label="Network"       val={syncStatus?.online ? "Online" : "Offline"} color={syncStatus?.online ? "var(--green)" : "var(--red)"} />
        <Row label="Service Worker" val={swStatus} />
        <Row label="Geolocation"   val={geoStatus} />
        <Row label="Notifications" val={typeof Notification !== "undefined" ? Notification.permission : "N/A"} />
        <Row label="Tile Cache"    val={tileCount} />
      </div>

      {/* Sync queue */}
      <div className="card">
        <div className="card-label" style={{ marginBottom:".5rem" }}>Sync Queue</div>
        <div style={{ fontSize:".8rem", marginBottom:".65rem" }}>
          <span style={{ color:"var(--muted)" }}>{syncStatus?.pending ?? 0} items pending</span>
        </div>
        <button className="btn btn-secondary btn-full" onClick={onFlush}>↻ Flush Queue Now</button>
      </div>

      {/* Recent sync events */}
      {syncEvents?.length > 0 && (
        <div className="card">
          <div className="card-label">Recent Sync Events</div>
          {syncEvents.slice(0,8).map((e,i) => (
            <div key={i} style={{ fontSize:".72rem", fontFamily:"monospace", color:"var(--muted)", padding:".2rem 0" }}>
              <span style={{ color:"var(--purple-light)", marginRight:".6rem" }}>{e.type}</span>
              {new Date(e.ts).toLocaleTimeString("en-GB",{hour12:false})}
            </div>
          ))}
        </div>
      )}

      {/* App info */}
      <div className="card">
        <div className="card-label">AP3X Driver PWA</div>
        <Row label="Version"  val="2.0.0" />
        <Row label="Build"    val="Vite + React + Workbox" />
        <Row label="Offline"  val="✅ Enabled" color="var(--green)" />
        <Row label="Install"  val={window.matchMedia("(display-mode: standalone)").matches ? "Installed" : "Browser"} />
      </div>

    </div>
  );
}
