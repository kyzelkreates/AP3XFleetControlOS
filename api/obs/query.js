// AP3X Observability API — GET /api/obs/query
// HTTP query interface for the event log.
// Supports all event-log.js filter params as query string args.
// READ-ONLY — zero state mutations.
//
// Query params:
//   fleetId, driverId, vehicleId, entityId
//   typePrefix, category, severity
//   sinceMs, untilMs, sinceIso, untilIso
//   searchText, page, pageSize
//   mode: "query" (default) | "timeline" | "replay" | "fleet-activity" | "driver-history"
//   bucket: "hour" | "day"  (mode=timeline only)
//   maxEvents: number       (mode=replay only)

import store from "../../core/storage.js";
import {
  queryEvents,
  getFleetActivityLog,
  getDriverHistory,
  replayEvents,
  buildTimeline
} from "../../core/observability/event-log.js";

export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const q = req.query || {};
  const events = store.events || [];

  // ── Parse common filters ──────────────────────────────────────────────────
  const filters = {
    fleetId:    q.fleetId    || undefined,
    driverId:   q.driverId   || undefined,
    vehicleId:  q.vehicleId  || undefined,
    entityId:   q.entityId   || undefined,
    typePrefix: q.typePrefix || undefined,
    category:   q.category   || undefined,
    severity:   q.severity   || undefined,
    searchText: q.searchText || undefined,
    sinceMs:    q.sinceMs  ? Number(q.sinceMs)
              : q.sinceIso ? new Date(q.sinceIso).getTime()
              : undefined,
    untilMs:    q.untilMs  ? Number(q.untilMs)
              : q.untilIso ? new Date(q.untilIso).getTime()
              : undefined,
    types:      q.types ? q.types.split(",") : undefined
  };

  // Strip undefined keys
  Object.keys(filters).forEach(k => filters[k] === undefined && delete filters[k]);

  const mode = q.mode || "query";

  try {
    switch (mode) {

      case "timeline": {
        const bucket = q.bucket || "hour";
        const result = buildTimeline(events, bucket, filters);
        return res.status(200).json(result);
      }

      case "replay": {
        const result = replayEvents(events, {
          ...filters,
          maxEvents: q.maxEvents ? parseInt(q.maxEvents) : 500
        });
        return res.status(200).json(result);
      }

      case "fleet-activity": {
        if (!q.fleetId) return res.status(400).json({ error: "fleetId required for fleet-activity mode" });
        const result = getFleetActivityLog(events, q.fleetId, {
          sinceMs: filters.sinceMs,
          limit:   q.limit ? parseInt(q.limit) : 50
        });
        return res.status(200).json(result);
      }

      case "driver-history": {
        if (!q.driverId) return res.status(400).json({ error: "driverId required for driver-history mode" });
        const result = getDriverHistory(events, store, q.driverId, {
          sinceMs: filters.sinceMs
        });
        return res.status(200).json(result);
      }

      default: {
        // "query" — filtered + paginated event list
        const pagination = {
          page:     q.page     ? parseInt(q.page)     : 1,
          pageSize: q.pageSize ? parseInt(q.pageSize) : 50
        };
        const result = queryEvents(events, filters, pagination);
        return res.status(200).json(result);
      }
    }
  } catch (err) {
    console.error("[API] obs/query error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
