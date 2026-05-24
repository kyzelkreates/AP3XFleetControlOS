import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { FleetOSProvider } from "./lib/store.js";
import Sidebar  from "./components/Sidebar.jsx";
import Toast    from "./components/Toast.jsx";
import LiveFleet   from "./pages/LiveFleet.jsx";
import Assignments from "./pages/Assignments.jsx";
import RoutesMgmt  from "./pages/RoutesMgmt.jsx";
import HazardsFOS  from "./pages/HazardsFOS.jsx";
import EventsFOS   from "./pages/EventsFOS.jsx";

export default function App() {
  const [activeFleet, setActiveFleet] = useState("");
  return (
    <FleetOSProvider>
      <div className="app-shell">
        <Sidebar activeFleet={activeFleet} onFleetChange={setActiveFleet} />
        <Routes>
          <Route path="/"        element={<LiveFleet   activeFleet={activeFleet} />} />
          <Route path="/assign"  element={<Assignments activeFleet={activeFleet} />} />
          <Route path="/routes"  element={<RoutesMgmt  activeFleet={activeFleet} />} />
          <Route path="/hazards" element={<HazardsFOS  activeFleet={activeFleet} />} />
          <Route path="/events"  element={<EventsFOS   activeFleet={activeFleet} />} />
          <Route path="*"        element={<Navigate to="/" />} />
        </Routes>
        <Toast />
      </div>
    </FleetOSProvider>
  );
}
