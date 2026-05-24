// AP3X Hazard Validator — RUN 6
// Validates incoming hazard reports before they enter the SSOT.
// Never throws — always returns { valid, errors, warnings, sanitised }.
// Called exclusively by hazard-manager.js.

import {
  HAZARD_TYPE,
  HAZARD_SEVERITY,
  HAZARD_SOURCE,
  HAZARD_STATUS,
  VALIDATION_RULES,
  TYPE_DEFAULT_SEVERITY,
  HAZARD_TTL_MS
} from "./hazard-constants.js";

// ─── MAIN VALIDATOR ───────────────────────────────────────────────────────────

/**
 * Validate and sanitise a hazard report submission.
 *
 * @param {object} report  - Raw hazard input from driver/admin/system
 * @param {object} store   - SSOT (read-only — used for dedup + driver checks)
 * @param {string} fleetId - Fleet context
 * @returns {ValidationResult}
 *   { valid, errors, warnings, sanitised }
 */
export function validateHazardReport(report, store, fleetId) {
  const errors   = [];
  const warnings = [];

  // ── A. Fleet check ───────────────────────────────────────────────────────
  if (!store.fleets?.[fleetId]) {
    errors.push("Fleet not found — hazard must belong to a registered fleet");
  }

  // ── B. Required fields ───────────────────────────────────────────────────
  if (!report.type) {
    errors.push("Hazard type is required");
  } else if (!Object.values(HAZARD_TYPE).includes(report.type)) {
    errors.push(`Unknown hazard type: "${report.type}". Valid types: ${Object.values(HAZARD_TYPE).join(", ")}`);
  }

  // ── C. Coordinates ───────────────────────────────────────────────────────
  if (report.lat == null || report.lon == null) {
    errors.push("Hazard coordinates (lat, lon) are required");
  } else {
    if (report.lat < VALIDATION_RULES.COORD_LAT_RANGE[0] || report.lat > VALIDATION_RULES.COORD_LAT_RANGE[1]) {
      errors.push(`Latitude out of range: ${report.lat} (must be ${VALIDATION_RULES.COORD_LAT_RANGE[0]}–${VALIDATION_RULES.COORD_LAT_RANGE[1]})`);
    }
    if (report.lon < VALIDATION_RULES.COORD_LON_RANGE[0] || report.lon > VALIDATION_RULES.COORD_LON_RANGE[1]) {
      errors.push(`Longitude out of range: ${report.lon} (must be ${VALIDATION_RULES.COORD_LON_RANGE[0]}–${VALIDATION_RULES.COORD_LON_RANGE[1]})`);
    }
  }

  // ── D. Source + reporter ─────────────────────────────────────────────────
  const source = report.source || HAZARD_SOURCE.DRIVER;
  if (!Object.values(HAZARD_SOURCE).includes(source)) {
    errors.push(`Unknown hazard source: "${source}"`);
  }

  // If driver source — validate driver exists and is bound
  if (source === HAZARD_SOURCE.DRIVER && report.reportedByDriverId) {
    const driver = store.drivers?.[report.reportedByDriverId];
    if (!driver) {
      errors.push(`Reporting driver not found: ${report.reportedByDriverId}`);
    } else if (driver.fleetId !== fleetId) {
      errors.push(`Reporting driver does not belong to fleet ${fleetId}`);
    } else if (!driver.identityId) {
      warnings.push(`Reporting driver "${driver.name}" has no active identity binding — RULE 2 advisory`);
    }
  }

  // ── E. Severity ──────────────────────────────────────────────────────────
  let severity = report.severity;
  if (severity && !Object.values(HAZARD_SEVERITY).includes(severity)) {
    errors.push(`Unknown severity: "${severity}". Valid: low, medium, high, critical`);
    severity = null;
  }
  // Apply type-default if not provided
  if (!severity && report.type) {
    severity = TYPE_DEFAULT_SEVERITY[report.type] || HAZARD_SEVERITY.MEDIUM;
    warnings.push(`Severity not provided — defaulted to "${severity}" based on hazard type`);
  }

  // ── F. Description ───────────────────────────────────────────────────────
  if (report.description != null) {
    if (report.description.length < VALIDATION_RULES.MIN_DESCRIPTION_LEN) {
      warnings.push(`Description too short (${report.description.length} chars — min ${VALIDATION_RULES.MIN_DESCRIPTION_LEN})`);
    }
    if (report.description.length > VALIDATION_RULES.MAX_DESCRIPTION_LEN) {
      errors.push(`Description too long (${report.description.length} chars — max ${VALIDATION_RULES.MAX_DESCRIPTION_LEN})`);
    }
  }

  // ── G. Radius ────────────────────────────────────────────────────────────
  let radius = report.radiusM ?? VALIDATION_RULES.DEFAULT_RADIUS_M;
  if (radius < VALIDATION_RULES.MIN_RADIUS_M) {
    warnings.push(`Radius too small (${radius}m) — set to minimum ${VALIDATION_RULES.MIN_RADIUS_M}m`);
    radius = VALIDATION_RULES.MIN_RADIUS_M;
  }
  if (radius > VALIDATION_RULES.MAX_RADIUS_M) {
    errors.push(`Radius too large (${radius}m — max ${VALIDATION_RULES.MAX_RADIUS_M}m)`);
  }

  // ── H. Duplicate detection ───────────────────────────────────────────────
  if (errors.length === 0 && report.lat != null && report.lon != null) {
    const dupe = _detectDuplicate(store, fleetId, report);
    if (dupe) {
      warnings.push(`Possible duplicate of hazard ${dupe.id} (${dupe.type} at similar location, reported ${_fmtAge(dupe.reportedAt)} ago)`);
    }
  }

  // ── Build sanitised report ───────────────────────────────────────────────
  const sanitised = errors.length === 0 ? {
    type:                report.type,
    severity,
    lat:                 parseFloat(Number(report.lat).toFixed(6)),
    lon:                 parseFloat(Number(report.lon).toFixed(6)),
    radiusM:             radius,
    description:         report.description ? report.description.trim().slice(0, VALIDATION_RULES.MAX_DESCRIPTION_LEN) : null,
    source,
    reportedByDriverId:  report.reportedByDriverId || null,
    expiresAt:           Date.now() + (HAZARD_TTL_MS[severity] || HAZARD_TTL_MS.medium),
    broadcastScope:      report.broadcastScope || "fleet",
    tags:                Array.isArray(report.tags) ? report.tags.slice(0, 5) : []
  } : null;

  return { valid: errors.length === 0, errors, warnings, sanitised };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _detectDuplicate(store, fleetId, report) {
  const now = Date.now();
  const activeHazards = Object.values(store.hazards || {})
    .filter(h =>
      h.fleetId === fleetId &&
      h.type    === report.type &&
      h.status  === "active" &&
      (now - h.reportedAt) < VALIDATION_RULES.DUPLICATE_WINDOW_MS
    );

  for (const h of activeHazards) {
    if (_distanceM(report.lat, report.lon, h.lat, h.lon) < VALIDATION_RULES.DUPLICATE_RADIUS_M) {
      return h;
    }
  }
  return null;
}

// Haversine distance in metres
function _distanceM(lat1, lon1, lat2, lon2) {
  const R  = 6_371_000;
  const dL = _toRad(lat2 - lat1);
  const dG = _toRad(lon2 - lon1);
  const a  = Math.sin(dL / 2) ** 2
            + Math.cos(_toRad(lat1)) * Math.cos(_toRad(lat2)) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _toRad(deg)  { return deg * Math.PI / 180; }
function _fmtAge(ts)  {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}min`;
  return `${Math.floor(s/3600)}h`;
}
