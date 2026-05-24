// AP3X — /api/hazards
// Consolidated hazard handler.
// POST /api/hazards?action=report   → report a new hazard
// POST /api/hazards?action=confirm  → driver corroboration
// POST /api/hazards?action=dispute  → driver dispute

import { reportHazard, confirmHazard, disputeHazard } from "../core/hazards/hazard-manager.js";
import { broadcastHazard }                            from "../core/hazards/hazard-broadcast.js";
import { validateHazardReport }                       from "../core/hazards/hazard-validator.js";
import store                                          from "../core/storage.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const action = req.query?.action || req.body?.action || "report";
  const body   = req.body || {};

  // ── REPORT ────────────────────────────────────────────────────────────────
  if (action === "report") {
    const { fleetId, report } = body;
    if (!fleetId || !report)  return res.status(400).json({ error: "fleetId and report required" });

    const validation = validateHazardReport(report, store, fleetId);
    if (!validation.valid) return res.status(422).json({ error: "Invalid report", details: validation.errors });

    try {
      const hazard    = reportHazard(store, fleetId, report);
      const broadcast = broadcastHazard(store, fleetId, hazard.id);
      return res.status(201).json({ hazardId: hazard.id, broadcastId: broadcast?.id || null, status: "reported" });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── CONFIRM ───────────────────────────────────────────────────────────────
  if (action === "confirm") {
    const { hazardId, driverId, fleetId } = body;
    if (!hazardId || !driverId || !fleetId) {
      return res.status(400).json({ error: "hazardId, driverId, and fleetId required" });
    }
    try {
      const result = confirmHazard(store, fleetId, hazardId, driverId);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(err.message.includes("not found") ? 404 : 500).json({ error: err.message });
    }
  }

  // ── DISPUTE ───────────────────────────────────────────────────────────────
  if (action === "dispute") {
    const { hazardId, driverId, fleetId, reason } = body;
    if (!hazardId || !driverId || !fleetId) {
      return res.status(400).json({ error: "hazardId, driverId, and fleetId required" });
    }
    try {
      const result = disputeHazard(store, fleetId, hazardId, driverId, { reason });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(err.message.includes("not found") ? 404 : 500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "action must be report, confirm, or dispute" });
}
