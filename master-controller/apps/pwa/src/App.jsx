import React, { useState, useEffect, useRef } from "react";
import { useIdentity }  from "./hooks/useIdentity.js";
import { useRoute }     from "./hooks/useRoute.js";
import { useSync }      from "./hooks/useSync.js";
import { useHazards }   from "./hooks/useHazards.js";
import { useTacho }     from "./hooks/useTacho.js";
import RouteView        from "./views/RouteView.jsx";
import HazardView       from "./views/HazardView.jsx";
import TachoView        from "./views/TachoView.jsx";
import StatusView       from "./views/StatusView.jsx";

const TABS = [
  { id:"route",  label:"Route",  icon:"🗺️" },
  { id:"hazard", label:"Hazards",icon:"⚠️" },
  { id:"tacho",  label:"Hours",  icon:"⏱" },
  { id:"status", label:"Status", icon:"📡" },
];

export default function App() {
  const [tab,       setTab]       = useState("route");
  const [online,    setOnline]    = useState(navigator.onLine);
  const [position,  setPosition]  = useState(null);
  const [splashOff, setSplashOff] = useState(false);
  const [hazardBadge, setHazardBadge] = useState(0);

  const { identity, loading: idLoading } = useIdentity();
  const { route, session, currentDrop, remainingDrops, loadRoute, confirmDrop, skipCurrentDrop, updatePos } = useRoute();
  const { status: syncStatus, events: syncEvents, flush } = useSync(identity);
  const { hazards, activeHazards, HAZARD_TYPES, ingestBroadcast, reportHazard, confirmHazard, disputeHazard } = useHazards(identity);
  const tacho = useTacho(identity);

  // Hide splash after identity loads
  useEffect(() => {
    if (!idLoading) setTimeout(() => setSplashOff(true), 900);
  }, [idLoading]);

  // Online/offline
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  }, []);

  // Geolocation
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const wid = navigator.geolocation.watchPosition(
      p => {
        const pos = { lat:p.coords.latitude, lon:p.coords.longitude, accuracy:p.coords.accuracy, heading:p.coords.heading, speed:p.coords.speed };
        setPosition(pos);
        updatePos(pos);
      },
      () => {},
      { enableHighAccuracy:true, timeout:10000, maximumAge:5000 }
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, [updatePos]);

  // Push notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Hazard badge count
  useEffect(() => {
    if (tab !== "hazard") setHazardBadge(activeHazards.length);
    else setHazardBadge(0);
  }, [activeHazards.length, tab]);

  return (
    <>
      {/* Splash */}
      <div className={`splash${splashOff ? " hidden" : ""}`}>
        <div className="splash-logo">AP3X</div>
        <div className="splash-sub">Driver Runtime</div>
        <div className="splash-spinner"></div>
      </div>

      {/* Header */}
      <header className="app-header">
        <div className="header-logo">AP3X</div>
        <div className="header-right">
          <div className={`status-dot${!online ? " offline" : syncStatus?.pending > 0 ? " syncing" : ""}`}></div>
          <span>{online ? (syncStatus?.pending > 0 ? "Syncing…" : "Online") : "Offline"}</span>
        </div>
      </header>

      {/* Offline banner */}
      {!online && (
        <div className="offline-banner">
          <span>📵</span>
          <span>Offline — data will sync on reconnect</span>
        </div>
      )}

      {/* Views */}
      <div className="app-body">
        <div className={`view${tab==="route"  ? " active" : ""}`}>
          <RouteView route={route} session={session} currentDrop={currentDrop} remainingDrops={remainingDrops} confirmDrop={confirmDrop} skipCurrentDrop={skipCurrentDrop} />
        </div>
        <div className={`view${tab==="hazard" ? " active" : ""}`}>
          <HazardView hazards={hazards} activeHazards={activeHazards} HAZARD_TYPES={HAZARD_TYPES} reportHazard={reportHazard} confirmHazard={confirmHazard} disputeHazard={disputeHazard} position={position} />
        </div>
        <div className={`view${tab==="tacho"  ? " active" : ""}`}>
          <TachoView {...tacho} />
        </div>
        <div className={`view${tab==="status" ? " active" : ""}`}>
          <StatusView identity={identity} syncStatus={syncStatus} syncEvents={syncEvents} onFlush={flush} />
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="nav-bar">
        {TABS.map(t => (
          <button key={t.id} className={`nav-btn${tab===t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            <span className="nav-icon">{t.icon}</span>
            <span>{t.label}</span>
            {t.id === "hazard" && hazardBadge > 0 && <span className="nav-badge">{hazardBadge}</span>}
          </button>
        ))}
      </nav>
    </>
  );
}
