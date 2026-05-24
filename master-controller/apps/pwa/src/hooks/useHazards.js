import { useState, useEffect, useCallback } from "react";
import { idbGet, idbSet } from "../lib/idb.js";
import { queueSync } from "../lib/sync.js";

const HAZARD_TYPES = [
  "road_closed","road_flooded","road_icy","pothole","debris","accident",
  "congestion","roadworks","fog","high_wind","flooding","black_ice",
  "police_incident","fuel_spillage","load_spillage","other"
];

export function useHazards(identity) {
  const [hazards, setHazards] = useState([]);

  useEffect(() => {
    idbGet("ap3x_hazards").then(h => { if (h) setHazards(h); });
  }, []);

  // Ingest a broadcast from sync pull
  const ingestBroadcast = useCallback((incoming = []) => {
    setHazards(prev => {
      const map = {};
      prev.forEach(h => map[h.id] = h);
      incoming.forEach(h => map[h.id] = h);
      const merged = Object.values(map).filter(h => h.status === "active");
      idbSet("ap3x_hazards", merged);
      return merged;
    });
  }, []);

  // Submit a new hazard report — queued if offline
  const reportHazard = useCallback(async ({ type, severity, lat, lon, description }) => {
    if (!identity) return;
    const report = {
      type, severity, lat, lon, description,
      fleetId:             identity.fleetId,
      reportedByDriverId:  identity.driverId,
      source:              "driver_pwa",
    };
    await queueSync("/api/hazard/report", "POST", report, 2);
    // Optimistic local add
    const local = { ...report, id: crypto.randomUUID(), status:"active", confirmations:0, rejections:0, reportedAt: Date.now() };
    setHazards(p => {
      const updated = [local, ...p];
      idbSet("ap3x_hazards", updated);
      return updated;
    });
    return local;
  }, [identity]);

  const confirmHazard = useCallback(async (hazardId) => {
    if (!identity) return;
    await queueSync("/api/hazard/confirm", "POST", { hazardId, driverId: identity.driverId });
  }, [identity]);

  const disputeHazard = useCallback(async (hazardId) => {
    if (!identity) return;
    await queueSync("/api/hazard/dispute", "POST", { hazardId, driverId: identity.driverId });
  }, [identity]);

  const activeHazards = hazards.filter(h => h.status === "active");
  return { hazards, activeHazards, HAZARD_TYPES, ingestBroadcast, reportHazard, confirmHazard, disputeHazard };
}
