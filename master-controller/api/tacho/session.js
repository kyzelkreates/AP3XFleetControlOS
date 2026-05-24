// AP3X API — POST /api/tacho/session
// Start or end a tachograph session for a driver.
// Body: { action: "start"|"end", driverId, vehicleId, fleetId }
// Core signature: startSession(store, fleetId, driverId, options)
//                 endSession(store, fleetId, driverId)

import { startSession, endSession, getActiveSession } from "../../core/compliance/tachograph-engine.js";
import store                                          from "../../core/storage.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, driverId, vehicleId, fleetId } = req.body || {};
  if (!action || !driverId || !fleetId) {
    return res.status(400).json({ error: "action, driverId, and fleetId required" });
  }

  try {
    if (action === "start") {
      const existing = getActiveSession(store, driverId);
      if (existing) {
        return res.status(409).json({ error: "Session already active", sessionId: existing.id });
      }
      // Core: startSession(store, fleetId, driverId, options)
      const session = startSession(store, fleetId, driverId, { vehicleId });
      return res.status(201).json({
        sessionId: session.id,
        status:    session.status,
        startTime: session.startTime
      });
    }

    if (action === "end") {
      // Core: endSession(store, fleetId, driverId)
      const session = endSession(store, fleetId, driverId);
      return res.status(200).json({
        sessionId: session.id,
        status:    session.status,
        endTime:   session.endTime,
        accum:     session.accum
      });
    }

    return res.status(400).json({ error: "action must be 'start' or 'end'" });
  } catch (err) {
    console.error("[API] tacho/session error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
