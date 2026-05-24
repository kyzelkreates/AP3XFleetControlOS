// AP3X Event Log — RUN 11
// Immutable append-only event log reader.
// Reads from store.events (written exclusively by event-emitter.js).
// Provides filtering, pagination, replay, and timeline bucketing.
// READ-ONLY. Zero mutations to store or events array — ever.

import {
  EVENT_DOMAIN, AUDIT_CATEGORY, EVENT_CATEGORY_MAP,
  EVENT_SEVERITY, TIME_WINDOW, PAGE
} from "./obs-constants.js";

// ─── CLASSIFY ─────────────────────────────────────────────────────────────────

/**
 * Enrich a raw event with derived fields — domain, category, severity, label.
 * Returns a new object. Source event is never modified.
 */
export function classifyEvent(event) {
  const type     = event.type || "";
  const domain   = _domainFromType(type);
  const category = _categoryFromType(type);
  const severity = EVENT_SEVERITY[type] || "info";

  return {
    ...event,
    domain,
    category,
    severity,
    label:   _labelFromType(type),
    isoTime: new Date(event.timestamp || 0).toISOString()
  };
}

// ─── QUERY ────────────────────────────────────────────────────────────────────

/**
 * Filter, sort, and paginate the event log.
 * Never modifies the source array.
 *
 * @param {object[]} events
 * @param {object}   filters
 *   fleetId     {string}   exact
 *   driverId    {string}   matches event.driverId or payload.driverId
 *   vehicleId   {string}   matches payload.vehicleId
 *   entityId    {string}   exact
 *   types       {string[]} whitelist of event.type
 *   typePrefix  {string}   e.g. "tacho." → all tacho events
 *   category    {string}   AUDIT_CATEGORY.*
 *   severity    {string}   debug | info | warn | serious | critical
 *   sinceMs     {number}   inclusive lower bound
 *   untilMs     {number}   inclusive upper bound
 *   searchText  {string}   substring in type + serialised payload
 * @param {object} pagination  { page?, pageSize? }
 * @returns {QueryResult} { items, total, page, pageSize, hasMore, pages }
 */
export function queryEvents(events, filters = {}, pagination = {}) {
  const pageSize = Math.min(pagination.pageSize || PAGE.DEFAULT, PAGE.MAX);
  const page     = Math.max(1, pagination.page || 1);

  const filtered = events
    .filter(e => _matchesFilters(e, filters))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));  // newest first

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map(classifyEvent);

  return { items, total, page, pageSize, hasMore: start + pageSize < total, pages: Math.ceil(total / pageSize) };
}

// ─── FLEET ACTIVITY LOG ───────────────────────────────────────────────────────

/**
 * Chronological activity log for a fleet — last 24h by default.
 * Grouped by AUDIT_CATEGORY for a summary count.
 */
export function getFleetActivityLog(events, fleetId, options = {}) {
  const sinceMs = options.sinceMs || (Date.now() - TIME_WINDOW.LAST_24H);
  const limit   = options.limit   || PAGE.DEFAULT;

  const filtered = events
    .filter(e => e.fleetId === fleetId && (e.timestamp || 0) >= sinceMs)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .map(classifyEvent);

  const byCategory = {};
  for (const e of filtered) {
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  }

  const bySeverity = {};
  for (const e of filtered) {
    bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
  }

  return { fleetId, sinceMs, events: filtered, total: filtered.length, byCategory, bySeverity, generatedAt: Date.now() };
}

// ─── DRIVER HISTORY ──────────────────────────────────────────────────────────

/**
 * Full activity history for one driver — last 7 days by default.
 * Pulls tacho sessions and routes from store (read-only).
 */
export function getDriverHistory(events, store, driverId, options = {}) {
  const sinceMs = options.sinceMs || (Date.now() - TIME_WINDOW.LAST_7D);

  const driverEvents = events
    .filter(e => {
      const p = e.payload || {};
      return (
        e.driverId === driverId ||
        p.driverId === driverId ||
        p.reportedByDriverId === driverId
      );
    })
    .filter(e => (e.timestamp || 0) >= sinceMs)
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(classifyEvent);

  // Read-only pulls from SSOT
  const tachoSessions = Object.values(store.tacho || {})
    .filter(s => s.driverId === driverId)
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, 20);

  const driverRoutes = Object.values(store.routes || {})
    .filter(r => r.driverId === driverId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 10);

  const complianceSummary = _complianceSummary(tachoSessions);

  return {
    driverId,
    sinceMs,
    events:           driverEvents,
    eventCount:       driverEvents.length,
    tachoSessions,
    recentRoutes:     driverRoutes,
    complianceSummary,
    generatedAt:      Date.now()
  };
}

// ─── EVENT REPLAY ─────────────────────────────────────────────────────────────

/**
 * Replay events in chronological order with inter-event deltas.
 * READ-ONLY — does NOT re-apply events to the store.
 *
 * @param {object[]} events
 * @param {object}   options  sinceMs, untilMs, fleetId, driverId, types, maxEvents
 * @returns {ReplayResult}  { events, total, fromMs, toMs, durationMs, truncated }
 */
export function replayEvents(events, options = {}) {
  const {
    sinceMs   = 0,
    untilMs   = Date.now(),
    fleetId   = null,
    driverId  = null,
    types     = null,
    maxEvents = 500
  } = options;

  let filtered = events.filter(e => {
    const ts = e.timestamp || 0;
    if (ts < sinceMs || ts > untilMs)     return false;
    if (fleetId  && e.fleetId  !== fleetId)  return false;
    if (driverId) {
      const p = e.payload || {};
      if (e.driverId !== driverId && p.driverId !== driverId) return false;
    }
    if (types && !types.includes(e.type)) return false;
    return true;
  });

  // Chronological for replay
  filtered = [...filtered]
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .slice(0, maxEvents);

  const annotated = filtered.map((e, i) => {
    const prev    = filtered[i - 1];
    const deltaMs = prev ? e.timestamp - prev.timestamp : 0;
    return { ...classifyEvent(e), replayIndex: i, deltaMs, deltaLabel: _fmtDelta(deltaMs) };
  });

  return {
    events:      annotated,
    total:       annotated.length,
    fromMs:      annotated[0]?.timestamp || sinceMs,
    toMs:        annotated[annotated.length - 1]?.timestamp || untilMs,
    durationMs:  annotated.length > 1
                   ? annotated[annotated.length - 1].timestamp - annotated[0].timestamp
                   : 0,
    truncated:   filtered.length === maxEvents,
    generatedAt: Date.now()
  };
}

// ─── TIMELINE ─────────────────────────────────────────────────────────────────

/**
 * Bucket events by hour or day for a visual timeline strip.
 * Returns ordered buckets with event counts per severity.
 */
export function buildTimeline(events, bucket = "hour", filters = {}) {
  const filtered = events
    .filter(e => _matchesFilters(e, filters))
    .map(classifyEvent)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!filtered.length) return { buckets: [], totalEvents: 0, bucket, generatedAt: Date.now() };

  const map = new Map();

  for (const e of filtered) {
    const key = _bucketKey(e.timestamp, bucket);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label:  _bucketLabel(e.timestamp, bucket),
        start:  _bucketStart(e.timestamp, bucket),
        end:    _bucketEnd(e.timestamp, bucket),
        events: [],
        counts: { debug: 0, info: 0, warn: 0, serious: 0, critical: 0 }
      });
    }
    const b = map.get(key);
    b.events.push(e);
    b.counts[e.severity] = (b.counts[e.severity] || 0) + 1;
  }

  return { buckets: [...map.values()], totalEvents: filtered.length, bucket, generatedAt: Date.now() };
}

// ─── COMPLIANCE SUMMARY ───────────────────────────────────────────────────────

function _complianceSummary(sessions) {
  if (!sessions.length) return null;

  let totalDriveMin = 0, totalBreakMin = 0, totalViolations = 0;
  const vByCode = {};

  for (const s of sessions) {
    const a = s.accum || {};
    totalDriveMin    += a.todayDriveMin || 0;
    totalBreakMin    += a.breakMin      || 0;
    totalViolations  += s.violations?.length || 0;
    for (const v of (s.violations || [])) {
      vByCode[v.code] = (vByCode[v.code] || 0) + 1;
    }
  }

  const topViolations = Object.entries(vByCode)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));

  const cleanSessions = sessions.filter(s => !s.violations?.length).length;

  return {
    sessionCount:   sessions.length,
    totalDriveMin:  +totalDriveMin.toFixed(1),
    totalBreakMin:  +totalBreakMin.toFixed(1),
    totalViolations,
    topViolations,
    complianceRate: +((cleanSessions / sessions.length) * 100).toFixed(1)
  };
}

// ─── FILTERS ─────────────────────────────────────────────────────────────────

function _matchesFilters(e, f) {
  const p = e.payload || {};
  if (f.fleetId   && e.fleetId  !== f.fleetId)   return false;
  if (f.entityId  && e.entityId !== f.entityId)   return false;
  if (f.driverId) {
    if (e.driverId !== f.driverId && p.driverId !== f.driverId &&
        p.reportedByDriverId !== f.driverId) return false;
  }
  if (f.vehicleId && p.vehicleId !== f.vehicleId) return false;
  if (f.types?.length && !f.types.includes(e.type)) return false;
  if (f.typePrefix && !e.type?.startsWith(f.typePrefix)) return false;
  if (f.category  && _categoryFromType(e.type) !== f.category) return false;
  if (f.severity  && (EVENT_SEVERITY[e.type] || "info") !== f.severity) return false;
  if (f.sinceMs   && (e.timestamp || 0) < f.sinceMs) return false;
  if (f.untilMs   && (e.timestamp || 0) > f.untilMs) return false;
  if (f.searchText) {
    const needle = f.searchText.toLowerCase();
    if (!(e.type + " " + JSON.stringify(p)).toLowerCase().includes(needle)) return false;
  }
  return true;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _domainFromType(type) {
  return EVENT_DOMAIN[type.split(".")[0]] || type.split(".")[0];
}

function _categoryFromType(type) {
  for (const [prefix, cat] of Object.entries(EVENT_CATEGORY_MAP)) {
    if (type.startsWith(prefix)) return cat;
  }
  return AUDIT_CATEGORY.SYSTEM;
}

function _labelFromType(type) {
  return type.replace(/\./g, " › ").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function _bucketKey(ts, bucket) {
  const d = new Date(ts);
  return bucket === "day"
    ? `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
    : `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

function _bucketLabel(ts, bucket) {
  const d = new Date(ts);
  return bucket === "day"
    ? d.toLocaleDateString("en-GB",  { weekday: "short", day: "numeric", month: "short" })
    : d.toLocaleString("en-GB",      { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}

function _bucketStart(ts, bucket) {
  const d = new Date(ts);
  bucket === "day" ? d.setUTCHours(0,0,0,0) : d.setUTCMinutes(0,0,0);
  return d.getTime();
}

function _bucketEnd(ts, bucket) {
  const d = new Date(ts);
  bucket === "day" ? d.setUTCHours(23,59,59,999) : d.setUTCMinutes(59,59,999);
  return d.getTime();
}

function _fmtDelta(ms) {
  if (ms < 1000)    return `+${ms}ms`;
  if (ms < 60000)   return `+${(ms/1000).toFixed(1)}s`;
  if (ms < 3600000) return `+${Math.round(ms/60000)}min`;
  return `+${(ms/3600000).toFixed(1)}h`;
}
