// AP3X — /api/tacho
// Consolidated tachograph handler.
// POST /api/tacho?action=session   → start or end a tachograph session
// POST /api/tacho?action=activity  → record a driver activity change

import { startSession, endSession, getActiveSession, recordActivity } from "../core/compliance/tachograph-engine.js";
import store from "../core/storage.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const action = req.query?.action || req.body?.action || "session";
  const body   = req.body || {};

  // ── SESSION ───────────────────────────────────────────────────────────────
  if (action === "session") {
    const { action: sessionAction, driverId, vehicleId, fleetId } = body;
    if (!sessionAction || !driverId || !fleetId) {
      return res.status(400).json({ error: "action (start|end), driverId, and fleetId required" });
    }
    try {
      if (sessionAction === "start") {
        const existing = getActiveSession(store, driverId);
        if (existing) return res.status(409).json({ error: "Session already active", sessionId: existing.id });
        const session = startSession(store, fleetId, driverId, { vehicleId });
        return res.status(201).json({ sessionId: session.id, status: session.status, startTime: session.startTime });
      }
      if (sessionAction === "end") {
        const session = endSession(store, fleetId, driverId);
        return res.status(200).json({ sessionId: session.id, status: session.status, endTime: session.endTime, accum: session.accum });
      }
      return res.status(400).json({ error: "action must be start or end" });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ACTIVITY ──────────────────────────────────────────────────────────────
  if (action === "activity") {
    const { driverId, fleetId, activityType, time } = body;
    if (!driverId || !fleetId || !activityType) {
      return res.status(400).json({ error: "driverId, fleetId, and activityType required" });
    }
    const session = getActiveSession(store, driverId);
    if (!session) {
      return res.status(409).json({ error: "No active tachograph session", driverId, hint: "POST /api/tacho with action=session first" });
    }
    try {
      const result = recordActivity(store, fleetId, driverId, activityType, { time: time ? new Date(time) : undefined });
      return res.status(200).json({ sessionId: result.session.id, activityType: result.activityType, violations: result.violations || [], accum: result.session.accum, updatedAt: Date.now() });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "action must be session or activity" });
}
