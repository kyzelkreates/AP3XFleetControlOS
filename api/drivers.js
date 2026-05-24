// AP3X — /api/drivers
// Consolidated driver handler.
// GET  /api/drivers?action=sync  → pull data package for PWA (route, hazards, compliance, safety)

import store                                          from "../core/storage.js";
import { getComplianceSnapshot, getActiveSession }   from "../core/compliance/tachograph-engine.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { driverId, fleetId, deviceId } = req.query || {};
  if (!driverId || !fleetId) return res.status(400).json({ error: "driverId and fleetId required" });

  // ── Active route ──────────────────────────────────────────────────────────
  const route = Object.values(store.routes || {})
    .filter(r => r.driverId === driverId && r.status === "active")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;

  // ── Active hazard broadcasts ───────────────────────────────────────────────
  const now              = Date.now();
  const hazardBroadcasts = Object.values(store.hazardBroadcasts || {})
    .filter(b => b.fleetId === fleetId && b.status === "active" && (!b.expiresAt || b.expiresAt > now))
    .slice(0, 20);

  // ── Compliance snapshot ────────────────────────────────────────────────────
  let complianceSnapshot = null;
  try {
    const session = getActiveSession(store, driverId);
    if (session) complianceSnapshot = getComplianceSnapshot(store, driverId);
  } catch { /* no active session */ }

  // ── Safety decision for active route ──────────────────────────────────────
  const safetyDecision = route
    ? Object.values(store.safetyDecisions || {})
        .filter(d => d.routeId === route.id)
        .sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0))[0] || null
    : null;

  // ── Device ACK ────────────────────────────────────────────────────────────
  if (deviceId && store.devices[deviceId]) {
    store.devices[deviceId].lastSyncAt = now;
  }

  return res.status(200).json({ driverId, fleetId, syncedAt: now, route, hazardBroadcasts, complianceSnapshot, safetyDecision });
}
