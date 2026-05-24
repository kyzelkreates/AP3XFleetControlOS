// AP3X — /api/obs
// Consolidated observability handler. READ-ONLY — zero state mutations.
// GET  /api/obs   → query events (mode: query|timeline|replay|fleet-activity|driver-history)
// POST /api/obs   → compliance export (type: fleet-compliance|driver-compliance|violation-report|event-log)

import store from "../core/storage.js";
import {
  queryEvents,
  getFleetActivityLog,
  getDriverHistory,
  replayEvents,
  buildTimeline
}                from "../core/observability/event-log.js";
import {
  exportFleetCompliance,
  exportDriverCompliance,
  exportViolationReport,
  exportEventLog
}                from "../core/observability/compliance-exporter.js";

const CONTENT_TYPE = { json: "application/json", csv: "text/csv", ndjson: "application/x-ndjson" };

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // ── GET — event query ─────────────────────────────────────────────────────
  if (req.method === "GET") {
    const q      = req.query || {};
    const events = store.events || [];

    const filters = Object.fromEntries(
      Object.entries({
        fleetId:    q.fleetId,
        driverId:   q.driverId,
        vehicleId:  q.vehicleId,
        entityId:   q.entityId,
        typePrefix: q.typePrefix,
        category:   q.category,
        severity:   q.severity,
        searchText: q.searchText,
        sinceMs:    q.sinceMs  ? Number(q.sinceMs)  : q.sinceIso ? new Date(q.sinceIso).getTime() : undefined,
        untilMs:    q.untilMs  ? Number(q.untilMs)  : q.untilIso ? new Date(q.untilIso).getTime() : undefined,
        types:      q.types    ? q.types.split(",") : undefined
      }).filter(([, v]) => v !== undefined)
    );

    const mode = q.mode || "query";
    try {
      switch (mode) {
        case "timeline": {
          return res.status(200).json(buildTimeline(events, q.bucket || "hour", filters));
        }
        case "replay": {
          return res.status(200).json(replayEvents(events, { ...filters, maxEvents: q.maxEvents ? parseInt(q.maxEvents) : 500 }));
        }
        case "fleet-activity": {
          if (!q.fleetId) return res.status(400).json({ error: "fleetId required" });
          return res.status(200).json(getFleetActivityLog(events, q.fleetId, { sinceMs: filters.sinceMs, limit: q.limit ? parseInt(q.limit) : 50 }));
        }
        case "driver-history": {
          if (!q.driverId) return res.status(400).json({ error: "driverId required" });
          return res.status(200).json(getDriverHistory(events, store, q.driverId, { sinceMs: filters.sinceMs }));
        }
        default: {
          return res.status(200).json(queryEvents(events, filters, { page: q.page ? parseInt(q.page) : 1, pageSize: q.pageSize ? parseInt(q.pageSize) : 50 }));
        }
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST — compliance export ───────────────────────────────────────────────
  if (req.method === "POST") {
    const { type, fleetId, driverId, format, sinceMs, untilMs, sinceIso, untilIso } = req.body || {};
    if (!type) return res.status(400).json({ error: "type required" });

    const options = {
      format,
      sinceMs: sinceMs ? Number(sinceMs) : sinceIso ? new Date(sinceIso).getTime() : undefined,
      untilMs: untilMs ? Number(untilMs) : untilIso ? new Date(untilIso).getTime() : undefined
    };

    let result;
    try {
      switch (type) {
        case "fleet-compliance":
          if (!fleetId) return res.status(400).json({ error: "fleetId required" });
          result = exportFleetCompliance(store, fleetId, options);
          break;
        case "driver-compliance":
          if (!driverId) return res.status(400).json({ error: "driverId required" });
          result = exportDriverCompliance(store, driverId, options);
          break;
        case "violation-report":
          if (!fleetId) return res.status(400).json({ error: "fleetId required" });
          result = exportViolationReport(store, fleetId, options);
          break;
        case "event-log":
          result = exportEventLog(store, store.events || [], fleetId || null, options);
          break;
        default:
          return res.status(400).json({ error: "type must be fleet-compliance | driver-compliance | violation-report | event-log" });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }

    res.setHeader("Content-Type",        CONTENT_TYPE[result.format] || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("X-AP3X-Record-Count", String(result.recordCount));
    res.setHeader("X-AP3X-Generated-At", new Date(result.generatedAt).toISOString());
    return res.status(200).send(result.content);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
