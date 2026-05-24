// AP3X API — POST /api/nav/event
// Receives navigation events from the driver PWA sync agent.
// Handles: drop reached, drop skipped, position update, route complete.
// Writes to route record in SSOT and emits events.
//
// Body: { op, routeId, driverId, fleetId, payload }
// op: "nav.drop.reached" | "nav.drop.skipped" | "nav.position.update" | "nav.route.complete"

import store         from "../../core/storage.js";
import { emitEvent } from "../../core/event-emitter.js";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { op, routeId, driverId, fleetId, payload } = req.body || {};
  if (!op || !routeId) return res.status(400).json({ error: "op and routeId required" });

  const route = store.routes?.[routeId];
  if (!route)  return res.status(404).json({ error: `Route not found: ${routeId}` });

  const now = Date.now();
  let updated = { ...route };

  switch (op) {

    case "nav.drop.reached": {
      const { dropIndex, arrivedAt } = payload || {};
      if (dropIndex == null) return res.status(400).json({ error: "dropIndex required" });

      // Mark the drop as arrived
      if (updated.drops?.[dropIndex]) {
        updated.drops = updated.drops.map((d, i) =>
          i === dropIndex
            ? { ...d, status: "arrived", arrivedAt: arrivedAt || now }
            : d
        );
      }

      // Advance currentDropIndex
      updated.currentDropIndex = dropIndex;
      updated.lastEventAt      = now;

      emitEvent(store, {
        type:     "nav.drop.reached",
        fleetId,
        entityId: routeId,
        payload:  { routeId, driverId, dropIndex, arrivedAt: arrivedAt || now }
      });
      break;
    }

    case "nav.drop.skipped": {
      const { dropIndex, reason } = payload || {};
      if (dropIndex == null) return res.status(400).json({ error: "dropIndex required" });

      if (updated.drops?.[dropIndex]) {
        updated.drops = updated.drops.map((d, i) =>
          i === dropIndex
            ? { ...d, status: "skipped", skippedAt: now, skipReason: reason || null }
            : d
        );
      }
      updated.lastEventAt = now;

      emitEvent(store, {
        type:     "nav.drop.skipped",
        fleetId,
        entityId: routeId,
        payload:  { routeId, driverId, dropIndex, reason }
      });
      break;
    }

    case "nav.position.update": {
      const { lat, lon, accuracy, speedKmh, heading } = payload || {};
      if (lat == null || lon == null) return res.status(400).json({ error: "lat and lon required" });

      updated.lastPosition = { lat, lon, accuracy, speedKmh, heading, recordedAt: now };
      updated.lastEventAt  = now;

      // Position updates are debug-level — emit but don't flood audit log
      emitEvent(store, {
        type:     "nav.position.update",
        fleetId,
        entityId: routeId,
        payload:  { routeId, driverId, lat, lon, speedKmh }
      });
      break;
    }

    case "nav.route.complete": {
      updated.status        = "complete";
      updated.completedAt   = now;
      updated.lastEventAt   = now;

      // Mark any remaining active drops as complete
      if (updated.drops) {
        updated.drops = updated.drops.map(d =>
          d.status === "pending" || d.status === "active"
            ? { ...d, status: "complete", completedAt: now }
            : d
        );
      }

      emitEvent(store, {
        type:     "nav.route.complete",
        fleetId,
        entityId: routeId,
        payload:  { routeId, driverId, completedAt: now }
      });
      break;
    }

    default:
      return res.status(400).json({
        error: `Unknown nav op: ${op}`,
        valid: ["nav.drop.reached", "nav.drop.skipped", "nav.position.update", "nav.route.complete"]
      });
  }

  // Write updated route back to SSOT
  store.routes[routeId] = updated;

  return res.status(200).json({ ack: true, routeId, op, updatedAt: now });
}
