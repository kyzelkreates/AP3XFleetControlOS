// AP3X Hazard Manager — RUN 6
// Core CRUD + lifecycle for hazard records.
// All writes go through the validator. All state changes emit events.
// NO routing changes. NO map rendering. Data + events only.

import { emitEvent }            from "../event-emitter.js";
import { validateHazardReport } from "./hazard-validator.js";
import {
  HAZARD_STATUS,
  HAZARD_SEVERITY,
  HAZARD_SOURCE,
  HAZARD_TTL_MS,
  BROADCAST_SCOPE,
  SEVERITY_SCORE
} from "./hazard-constants.js";

// ─── REPORT (CREATE) ─────────────────────────────────────────────────────────

/**
 * Submit a new hazard report. Entry point for all hazard creation.
 *
 * @param {object} store    - AP3X SSOT
 * @param {string} fleetId  - owning fleet
 * @param {object} report   - raw hazard input
 * @returns {{ hazard, validation }}
 */
export function reportHazard(store, fleetId, report) {
  // ── 1. Validate ──────────────────────────────────────────────────────────
  const validation = validateHazardReport(report, store, fleetId);

  if (!validation.valid) {
    emitEvent(store, {
      type:      "hazard.report.rejected",
      fleetId,
      entityId:  null,
      collection:"hazards",
      payload:   { errors: validation.errors, input: _safeInput(report) }
    });
    return { hazard: null, validation };
  }

  const s = validation.sanitised;

  // ── 2. Build hazard record ───────────────────────────────────────────────
  const hazardId = crypto.randomUUID();
  const now      = Date.now();

  const hazard = {
    id:                 hazardId,
    fleetId,
    type:               s.type,
    severity:           s.severity,
    severityScore:      SEVERITY_SCORE[s.severity] || 0,
    status:             HAZARD_STATUS.ACTIVE,
    lat:                s.lat,
    lon:                s.lon,
    radiusM:            s.radiusM,
    description:        s.description,
    source:             s.source,
    reportedByDriverId: s.reportedByDriverId,
    broadcastScope:     s.broadcastScope || BROADCAST_SCOPE.FLEET,
    tags:               s.tags || [],
    confirmations:      0,       // other drivers can confirm — future
    rejections:         0,       // other drivers can dispute — future
    reportedAt:         now,
    updatedAt:          now,
    expiresAt:          s.expiresAt,
    resolvedAt:         null,
    resolvedBy:         null,
    broadcastHistory:   []       // populated by hazard-broadcast.js
  };

  // ── 3. Persist ───────────────────────────────────────────────────────────
  if (!store.hazards) store.hazards = {};
  store.hazards[hazardId] = hazard;

  // ── 4. Emit ──────────────────────────────────────────────────────────────
  emitEvent(store, {
    type:      "hazard.reported",
    fleetId,
    entityId:  hazardId,
    collection:"hazards",
    payload: {
      hazardId,
      type:     hazard.type,
      severity: hazard.severity,
      lat:      hazard.lat,
      lon:      hazard.lon,
      source:   hazard.source,
      reportedByDriverId: hazard.reportedByDriverId,
      expiresAt:hazard.expiresAt,
      warnings: validation.warnings
    }
  });

  return { hazard, validation };
}

// ─── RESOLVE ─────────────────────────────────────────────────────────────────

/**
 * Mark a hazard as resolved. Only writes status, resolvedAt, resolvedBy.
 * Does NOT delete — hazard history is permanent.
 */
export function resolveHazard(store, fleetId, hazardId, resolvedBy = null) {
  const hazard = _getHazard(store, fleetId, hazardId);

  if (hazard.status === HAZARD_STATUS.RESOLVED) {
    throw new Error(`Hazard ${hazardId} is already resolved`);
  }
  if (hazard.status === HAZARD_STATUS.REJECTED) {
    throw new Error(`Hazard ${hazardId} was rejected — cannot resolve`);
  }

  hazard.status     = HAZARD_STATUS.RESOLVED;
  hazard.resolvedAt = Date.now();
  hazard.resolvedBy = resolvedBy;
  hazard.updatedAt  = Date.now();

  emitEvent(store, {
    type:      "hazard.resolved",
    fleetId,
    entityId:  hazardId,
    collection:"hazards",
    payload:   { hazardId, resolvedBy, resolvedAt: hazard.resolvedAt }
  });

  return hazard;
}

// ─── EXPIRE (called by TTL sweep) ────────────────────────────────────────────

/**
 * Expire a hazard whose TTL has elapsed.
 * Called by the TTL sweeper — not by user actions.
 */
export function expireHazard(store, fleetId, hazardId) {
  const hazard = _getHazard(store, fleetId, hazardId);
  if (hazard.status !== HAZARD_STATUS.ACTIVE && hazard.status !== HAZARD_STATUS.UNVERIFIED) return hazard;

  hazard.status    = HAZARD_STATUS.EXPIRED;
  hazard.updatedAt = Date.now();

  emitEvent(store, {
    type:      "hazard.expired",
    fleetId,
    entityId:  hazardId,
    collection:"hazards",
    payload:   { hazardId, type: hazard.type, expiredAt: hazard.updatedAt }
  });

  return hazard;
}

// ─── TTL SWEEP ───────────────────────────────────────────────────────────────

/**
 * Sweep all hazards for a fleet and expire any past their TTL.
 * Call this on a schedule or before route generation.
 * @returns {object[]} list of expired hazards
 */
export function sweepExpiredHazards(store, fleetId) {
  const now     = Date.now();
  const expired = [];

  Object.values(store.hazards || {})
    .filter(h =>
      h.fleetId === fleetId &&
      (h.status === HAZARD_STATUS.ACTIVE || h.status === HAZARD_STATUS.UNVERIFIED) &&
      h.expiresAt <= now
    )
    .forEach(h => {
      expired.push(expireHazard(store, fleetId, h.id));
    });

  return expired;
}

// ─── CONFIRM / DISPUTE (driver corroboration — lightweight) ──────────────────

/**
 * A driver confirms a hazard is still present.
 * Increments confirmation count. Does not change status.
 */
export function confirmHazard(store, fleetId, hazardId, driverId) {
  const hazard = _getHazard(store, fleetId, hazardId);
  _assertDriverInFleet(store, fleetId, driverId);

  hazard.confirmations += 1;
  hazard.updatedAt      = Date.now();

  // Auto-promote unverified → active after 2 confirmations
  if (hazard.status === HAZARD_STATUS.UNVERIFIED && hazard.confirmations >= 2) {
    hazard.status = HAZARD_STATUS.ACTIVE;
    emitEvent(store, {
      type:      "hazard.activated",
      fleetId,
      entityId:  hazardId,
      collection:"hazards",
      payload:   { hazardId, confirmedBy: driverId, confirmations: hazard.confirmations }
    });
  }

  emitEvent(store, {
    type:      "hazard.confirmed",
    fleetId,
    entityId:  hazardId,
    collection:"hazards",
    payload:   { hazardId, confirmedBy: driverId, confirmations: hazard.confirmations }
  });

  return hazard;
}

/**
 * A driver disputes a hazard (no longer present).
 * Increments rejection count. Auto-resolves if disputes ≥ 3.
 */
export function disputeHazard(store, fleetId, hazardId, driverId) {
  const hazard = _getHazard(store, fleetId, hazardId);
  _assertDriverInFleet(store, fleetId, driverId);

  hazard.rejections += 1;
  hazard.updatedAt   = Date.now();

  emitEvent(store, {
    type:      "hazard.disputed",
    fleetId,
    entityId:  hazardId,
    collection:"hazards",
    payload:   { hazardId, disputedBy: driverId, rejections: hazard.rejections }
  });

  // Auto-resolve after 3 disputes (majority says it's clear)
  if (hazard.rejections >= 3 && hazard.status === HAZARD_STATUS.ACTIVE) {
    return resolveHazard(store, fleetId, hazardId, "auto:dispute_threshold");
  }

  return hazard;
}

// ─── QUERY ───────────────────────────────────────────────────────────────────

/**
 * Get all active hazards for a fleet.
 * Optionally filter by severity, type, or proximity to a point.
 */
export function getActiveHazards(store, fleetId, options = {}) {
  sweepExpiredHazards(store, fleetId);

  let hazards = Object.values(store.hazards || {})
    .filter(h => h.fleetId === fleetId && h.status === HAZARD_STATUS.ACTIVE);

  if (options.severity) {
    hazards = hazards.filter(h => h.severity === options.severity);
  }
  if (options.type) {
    hazards = hazards.filter(h => h.type === options.type);
  }
  if (options.minSeverityScore != null) {
    hazards = hazards.filter(h => h.severityScore >= options.minSeverityScore);
  }

  // Proximity filter — returns hazards within radiusM of a point
  if (options.nearLat != null && options.nearLon != null && options.nearRadiusM != null) {
    hazards = hazards.filter(h =>
      _distanceM(options.nearLat, options.nearLon, h.lat, h.lon) <= options.nearRadiusM
    );
  }

  // Sort: critical first, then by reportedAt desc
  return hazards.sort((a, b) =>
    b.severityScore - a.severityScore || b.reportedAt - a.reportedAt
  );
}

export function getHazard(store, fleetId, hazardId) {
  return _getHazard(store, fleetId, hazardId);
}

export function listAllHazards(store, fleetId) {
  sweepExpiredHazards(store, fleetId);
  return Object.values(store.hazards || {})
    .filter(h => h.fleetId === fleetId)
    .sort((a, b) => b.reportedAt - a.reportedAt);
}

// ─── CRITICAL GATE (used by routing/safety before dispatch) ──────────────────

/**
 * Returns any CRITICAL active hazards near a set of route drops.
 * Used by the safety engine in future integration — routing checks this
 * before dispatch to flag unresolved critical hazards on path.
 * NO routing changes applied here — this is read-only advisory output.
 */
export function getCriticalHazardsOnPath(store, fleetId, drops, bufferM = 500) {
  sweepExpiredHazards(store, fleetId);

  const critical = Object.values(store.hazards || {})
    .filter(h =>
      h.fleetId  === fleetId &&
      h.status   === HAZARD_STATUS.ACTIVE &&
      h.severity === HAZARD_SEVERITY.CRITICAL
    );

  const affected = [];
  for (const h of critical) {
    for (const drop of drops) {
      const dist = _distanceM(drop.lat, drop.lon, h.lat, h.lon);
      if (dist <= (h.radiusM + bufferM)) {
        affected.push({ hazard: h, nearDrop: drop, distanceM: Math.round(dist) });
        break; // only count each hazard once
      }
    }
  }

  return affected; // empty = clear. Non-empty = safety engine should flag.
}

// ─── INTERNAL HELPERS ────────────────────────────────────────────────────────

function _getHazard(store, fleetId, hazardId) {
  if (!store.hazards?.[hazardId]) throw new Error(`Hazard not found: ${hazardId}`);
  const h = store.hazards[hazardId];
  if (h.fleetId !== fleetId) throw new Error(`Hazard ${hazardId} does not belong to fleet ${fleetId}`);
  return h;
}

function _assertDriverInFleet(store, fleetId, driverId) {
  const driver = store.drivers?.[driverId];
  if (!driver) throw new Error(`Driver not found: ${driverId}`);
  if (driver.fleetId !== fleetId) throw new Error(`Driver ${driverId} does not belong to fleet ${fleetId}`);
}

function _distanceM(lat1, lon1, lat2, lon2) {
  const R  = 6_371_000;
  const dL = _toRad(lat2 - lat1);
  const dG = _toRad(lon2 - lon1);
  const a  = Math.sin(dL / 2) ** 2
            + Math.cos(_toRad(lat1)) * Math.cos(_toRad(lat2)) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _toRad(deg) { return deg * Math.PI / 180; }

function _safeInput(report) {
  return {
    type:     report.type     || null,
    lat:      report.lat      ?? null,
    lon:      report.lon      ?? null,
    severity: report.severity || null,
    source:   report.source   || null
  };
}
