// AP3X — /api/fleets
// Consolidated fleet handler.
// POST /api/fleets?action=create  → createFleet
// POST /api/fleets?action=update  → setFleetBrand (brand config)
// GET  /api/fleets                → list all fleets

import { createFleet }  from "../core/fleet-manager.js";
import { setFleetBrand } from "../core/branding-engine.js";
import store             from "../core/storage.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      return res.status(200).json({ fleets: Object.values(store.fleets) });
    }

    if (req.method === "POST") {
      const action = req.query?.action || req.body?.action || "create";

      if (action === "create") {
        const fleet = createFleet(store, req.body);
        return res.status(201).json({ success: true, fleet });
      }

      if (action === "update") {
        const { fleetId, brand } = req.body || {};
        if (!fleetId) return res.status(400).json({ error: "fleetId required" });
        const result = setFleetBrand(store, fleetId, brand);
        return res.status(200).json({ success: true, brand: result });
      }

      return res.status(400).json({ error: "action must be create or update" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}
