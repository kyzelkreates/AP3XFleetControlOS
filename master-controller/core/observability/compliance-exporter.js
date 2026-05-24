// AP3X Compliance Exporter — RUN 11
// Statutory compliance exports from tachograph sessions.
// EU Regulation 561/2006 field set. Formats: JSON, CSV, NDJSON.
// READ-ONLY. No state mutations. Pure data projection from store.

import { EXPORT_FORMAT, TIME_WINDOW } from "./obs-constants.js";
import { EU_561, REGULATION }         from "../compliance/compliance-constants.js";

// ─── DRIVER COMPLIANCE EXPORT ─────────────────────────────────────────────────

/**
 * Export compliance data for one driver over a time window.
 *
 * @param {object} store     - SSOT (read-only)
 * @param {string} driverId
 * @param {object} options   sinceMs, untilMs, format
 * @returns {ExportResult}   { format, filename, content, recordCount, generatedAt }
 */
export function exportDriverCompliance(store, driverId, options = {}) {
  const sinceMs  = options.sinceMs || (Date.now() - TIME_WINDOW.LAST_28D);
  const untilMs  = options.untilMs || Date.now();
  const format   = options.format  || EXPORT_FORMAT.JSON;

  const driver   = store.drivers?.[driverId] || null;
  const sessions = _sessionsByDriver(store, driverId, sinceMs, untilMs);
  const records  = sessions.map(s => _projectSession(s, driver, store));

  return {
    format,
    filename:    _filename("driver-compliance", driverId, sinceMs, untilMs, format),
    content:     _serialise(records, format),
    recordCount: records.length,
    driverId,
    sinceMs,
    untilMs,
    generatedAt: Date.now()
  };
}

// ─── FLEET COMPLIANCE EXPORT ──────────────────────────────────────────────────

/**
 * Export compliance data for an entire fleet.
 * One record per driver session, sorted by driver name then session start.
 */
export function exportFleetCompliance(store, fleetId, options = {}) {
  const sinceMs = options.sinceMs || (Date.now() - TIME_WINDOW.LAST_28D);
  const untilMs = options.untilMs || Date.now();
  const format  = options.format  || EXPORT_FORMAT.CSV;

  const fleet = store.fleets?.[fleetId];
  if (!fleet) throw new Error(`Fleet not found: ${fleetId}`);

  const drivers = Object.values(store.drivers || {}).filter(d => d.fleetId === fleetId);

  const records = [];
  for (const driver of drivers) {
    const sessions = _sessionsByDriver(store, driver.id, sinceMs, untilMs);
    for (const s of sessions) records.push(_projectSession(s, driver, store));
  }

  records.sort((a, b) =>
    (a.driverName || "").localeCompare(b.driverName || "") ||
    (a.startTime  || 0) - (b.startTime || 0)
  );

  return {
    format,
    filename:    _filename("fleet-compliance", fleetId, sinceMs, untilMs, format),
    content:     _serialise(records, format),
    recordCount: records.length,
    driverCount: drivers.length,
    fleetId,
    fleetName:   fleet.name || fleetId,
    sinceMs,
    untilMs,
    generatedAt: Date.now()
  };
}

// ─── VIOLATION REPORT ─────────────────────────────────────────────────────────

/**
 * Violation summary per driver — sorted by severity count descending.
 * Suitable for regulatory submission.
 */
export function exportViolationReport(store, fleetId, options = {}) {
  const sinceMs = options.sinceMs || (Date.now() - TIME_WINDOW.LAST_28D);
  const untilMs = options.untilMs || Date.now();
  const format  = options.format  || EXPORT_FORMAT.JSON;

  const fleet = store.fleets?.[fleetId];
  if (!fleet) throw new Error(`Fleet not found: ${fleetId}`);

  const drivers = Object.values(store.drivers || {}).filter(d => d.fleetId === fleetId);
  const summaries = [];

  for (const driver of drivers) {
    const sessions    = _sessionsByDriver(store, driver.id, sinceMs, untilMs);
    const allViolations = sessions.flatMap(s => s.violations || []);
    if (!allViolations.length) continue;

    const byCode = {};
    for (const v of allViolations) {
      if (!byCode[v.code]) byCode[v.code] = { code: v.code, severity: v.severity, count: 0, latest: 0, legalRef: null };
      byCode[v.code].count++;
      byCode[v.code].latest   = Math.max(byCode[v.code].latest, v.timestamp);
      byCode[v.code].legalRef = v.legalRef || byCode[v.code].legalRef;
    }

    summaries.push({
      driverId:       driver.id,
      driverName:     driver.name || driver.id,
      sessionCount:   sessions.length,
      violationTotal: allViolations.length,
      criticalCount:  allViolations.filter(v => v.severity === "critical").length,
      seriousCount:   allViolations.filter(v => v.severity === "serious").length,
      advisoryCount:  allViolations.filter(v => v.severity === "advisory").length,
      violations:     Object.values(byCode).sort((a, b) => b.count - a.count),
      period:         { sinceISO: new Date(sinceMs).toISOString(), untilISO: new Date(untilMs).toISOString() }
    });
  }

  summaries.sort((a, b) => b.criticalCount - a.criticalCount || b.violationTotal - a.violationTotal);

  return {
    format,
    filename:              _filename("violation-report", fleetId, sinceMs, untilMs, format),
    content:               _serialise(summaries, format),
    driverCount:           drivers.length,
    driversWithViolations: summaries.length,
    fleetId,
    fleetName:             fleet.name || fleetId,
    sinceMs,
    untilMs,
    generatedAt:           Date.now()
  };
}

// ─── EVENT LOG EXPORT ─────────────────────────────────────────────────────────

/**
 * Export raw event log entries for a fleet.
 * NDJSON by default — suitable for SIEM ingestion.
 */
export function exportEventLog(store, events, fleetId, options = {}) {
  const sinceMs = options.sinceMs || (Date.now() - TIME_WINDOW.LAST_7D);
  const untilMs = options.untilMs || Date.now();
  const format  = options.format  || EXPORT_FORMAT.NDJSON;

  const records = events
    .filter(e =>
      (!fleetId || e.fleetId === fleetId) &&
      (e.timestamp || 0) >= sinceMs &&
      (e.timestamp || 0) <= untilMs
    )
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(e => ({
      timestamp:  e.timestamp,
      isoTime:    new Date(e.timestamp).toISOString(),
      type:       e.type,
      fleetId:    e.fleetId    || null,
      entityId:   e.entityId   || null,
      collection: e.collection || null,
      payload:    e.payload    || {}
    }));

  return {
    format,
    filename:    _filename("event-log", fleetId || "all", sinceMs, untilMs, format),
    content:     _serialise(records, format),
    recordCount: records.length,
    fleetId,
    sinceMs,
    untilMs,
    generatedAt: Date.now()
  };
}

// ─── SESSION PROJECTION ───────────────────────────────────────────────────────

function _projectSession(s, driver, store) {
  const a       = s.accum || {};
  const vehicle = s.vehicleId ? store.vehicles?.[s.vehicleId] : null;

  return {
    sessionId:           s.id,
    driverId:            s.driverId,
    driverName:          driver?.name || s.driverId,
    vehicleId:           s.vehicleId   || null,
    vehicleReg:          vehicle?.registration || null,
    regulation:          s.regulation  || REGULATION.EU_561,
    startTime:           s.startTime,
    startISO:            new Date(s.startTime).toISOString(),
    endTime:             s.endTime     || null,
    endISO:              s.endTime ? new Date(s.endTime).toISOString() : null,
    status:              s.status,
    continuousDriveMin:  _r(a.continuousDriveMin),
    todayDriveMin:       _r(a.todayDriveMin),
    weekDriveMin:        _r(a.weekDriveMin),
    fortDriveMin:        _r(a.fortDriveMin),
    breakMin:            _r(a.breakMin),
    todayRestMin:        _r(a.todayRestMin),
    shiftMin:            _r(a.shiftMin),
    extendedDaysUsed:    a.extendedDaysUsed    || 0,
    reducedRestDaysUsed: a.reducedRestDaysUsed || 0,
    violationCount:      s.violations?.length  || 0,
    withinDailyLimit:    _r(a.todayDriveMin) <= EU_561.DAILY_DRIVE_STANDARD_MIN,
    withinWeeklyLimit:   _r(a.weekDriveMin)  <= EU_561.WEEKLY_DRIVE_MIN,
    violations: (s.violations || []).map(v => ({
      code:     v.code,
      severity: v.severity,
      message:  v.message,
      legalRef: v.legalRef || null,
      isoTime:  new Date(v.timestamp).toISOString()
    }))
  };
}

// ─── SERIALISERS ─────────────────────────────────────────────────────────────

function _serialise(records, format) {
  switch (format) {
    case EXPORT_FORMAT.CSV:    return _toCsv(records);
    case EXPORT_FORMAT.NDJSON: return records.map(r => JSON.stringify(r)).join("\n");
    default:                   return JSON.stringify(records, null, 2);
  }
}

function _toCsv(records) {
  if (!records.length) return "";
  const keys   = Object.keys(records[0]).filter(k => k !== "violations");
  const header = keys.join(",");
  const rows   = records.map(r =>
    keys.map(k => {
      const s = String(r[k] ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(",")
  );

  // Violations appended as a separate section
  const vRows = [];
  for (const r of records) {
    for (const v of r.violations || []) {
      vRows.push([r.sessionId, r.driverId, v.code, v.severity, v.message, v.legalRef || "", v.isoTime]
        .map(s => { const t = String(s||""); return t.includes(",") ? `"${t}"` : t; }).join(","));
    }
  }

  const parts = [`${header}\n${rows.join("\n")}`];
  if (vRows.length) {
    parts.push("\nVIOLATIONS");
    parts.push("sessionId,driverId,code,severity,message,legalRef,isoTime");
    parts.push(vRows.join("\n"));
  }
  return parts.join("\n");
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _sessionsByDriver(store, driverId, sinceMs, untilMs) {
  return Object.values(store.tacho || {})
    .filter(s => s.driverId === driverId &&
                 (s.startTime || 0) >= sinceMs &&
                 (s.startTime || 0) <= untilMs)
    .sort((a, b) => a.startTime - b.startTime);
}

function _filename(prefix, id, sinceMs, untilMs, format) {
  const from = new Date(sinceMs).toISOString().slice(0, 10);
  const to   = new Date(untilMs).toISOString().slice(0, 10);
  const ext  = format === EXPORT_FORMAT.NDJSON ? "ndjson" : format === EXPORT_FORMAT.CSV ? "csv" : "json";
  return `ap3x_${prefix}_${id}_${from}_${to}.${ext}`;
}

function _r(n) { return parseFloat((n || 0).toFixed(2)); }
