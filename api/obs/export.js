// AP3X Observability API — POST /api/obs/export
// HTTP compliance export endpoint. Triggers file download via response headers.
// READ-ONLY — zero state mutations.
//
// Body:
//   type:     "fleet-compliance" | "driver-compliance" | "violation-report" | "event-log"
//   fleetId:  string  (required for fleet-* and violation-report)
//   driverId: string  (required for driver-compliance)
//   format:   "json" | "csv" | "ndjson"  (default varies by type)
//   sinceMs:  number  (optional, default: last 28d)
//   untilMs:  number  (optional, default: now)
//   sinceIso: string  (alternative to sinceMs)
//   untilIso: string  (alternative to untilMs)

import store from "../../core/storage.js";
import {
  exportFleetCompliance,
  exportDriverCompliance,
  exportViolationReport,
  exportEventLog
} from "../../core/observability/compliance-exporter.js";

const CONTENT_TYPE = {
  json:   "application/json",
  csv:    "text/csv",
  ndjson: "application/x-ndjson"
};

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    type, fleetId, driverId, format,
    sinceMs, untilMs, sinceIso, untilIso
  } = req.body || {};

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
        return res.status(400).json({
          error: "Invalid type. Must be: fleet-compliance | driver-compliance | violation-report | event-log"
        });
    }
  } catch (err) {
    console.error("[API] obs/export error:", err.message);
    return res.status(500).json({ error: err.message });
  }

  const contentType = CONTENT_TYPE[result.format] || "application/octet-stream";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.setHeader("X-AP3X-Record-Count", String(result.recordCount));
  res.setHeader("X-AP3X-Generated-At", new Date(result.generatedAt).toISOString());

  return res.status(200).send(result.content);
}
