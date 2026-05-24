// AP3X Observability System — RUN 11
// Constants for audit logging, event classification, and export formats.
// READ-ONLY system. No state mutations anywhere in this module.

// ─── LOG LEVELS ───────────────────────────────────────────────────────────────
export const LOG_LEVEL = {
  DEBUG: "debug",
  INFO:  "info",
  WARN:  "warn",
  ERROR: "error",
  AUDIT: "audit"   // compliance-grade immutable audit entry
};

// ─── EVENT DOMAINS ────────────────────────────────────────────────────────────
export const EVENT_DOMAIN = {
  fleet:      "Fleet Management",
  driver:     "Driver",
  vehicle:    "Vehicle",
  device:     "Device",
  route:      "Routing",
  safety:     "Safety",
  hazard:     "Hazard",
  tacho:      "Tachograph",
  sync:       "Sync Engine",
  tile:       "Tile Cache",
  deploy:     "Deployment",
  identity:   "Identity",
  perm:       "Permissions",
  compliance: "Compliance",
  nav:        "Navigation"
};

// ─── AUDIT CATEGORIES ─────────────────────────────────────────────────────────
export const AUDIT_CATEGORY = {
  COMPLIANCE: "compliance",
  SAFETY:     "safety",
  IDENTITY:   "identity",
  OPERATIONS: "operations",
  HAZARD:     "hazard",
  SYNC:       "sync",
  SYSTEM:     "system"
};

// ─── EVENT TYPE → CATEGORY ────────────────────────────────────────────────────
export const EVENT_CATEGORY_MAP = {
  "tacho.":      AUDIT_CATEGORY.COMPLIANCE,
  "compliance.": AUDIT_CATEGORY.COMPLIANCE,
  "safety.":     AUDIT_CATEGORY.SAFETY,
  "identity.":   AUDIT_CATEGORY.IDENTITY,
  "permission.": AUDIT_CATEGORY.IDENTITY,
  "fleet.":      AUDIT_CATEGORY.OPERATIONS,
  "route.":      AUDIT_CATEGORY.OPERATIONS,
  "deploy.":     AUDIT_CATEGORY.OPERATIONS,
  "vehicle.":    AUDIT_CATEGORY.OPERATIONS,
  "driver.":     AUDIT_CATEGORY.OPERATIONS,
  "hazard.":     AUDIT_CATEGORY.HAZARD,
  "sync.":       AUDIT_CATEGORY.SYNC,
  "tile.":       AUDIT_CATEGORY.SYSTEM,
  "device.":     AUDIT_CATEGORY.SYSTEM,
  "nav.":        AUDIT_CATEGORY.OPERATIONS
};

// ─── EVENT SEVERITY MAP ───────────────────────────────────────────────────────
export const EVENT_SEVERITY = {
  "tacho.violation":            "serious",
  "tacho.session.started":      "info",
  "tacho.session.ended":        "info",
  "tacho.activity.recorded":    "debug",
  "safety.block":               "critical",
  "safety.approved":            "info",
  "compliance.violation":       "serious",
  "hazard.critical.alert":      "critical",
  "hazard.reported":            "info",
  "hazard.resolved":            "info",
  "sync.conflict.detected":     "warn",
  "sync.conflict.resolved":     "info",
  "sync.merge.complete":        "info",
  "identity.bound":             "info",
  "identity.unbound":           "warn",
  "permission.granted":         "info",
  "permission.revoked":         "warn",
  "fleet.created":              "info",
  "fleet.deployed":             "info",
  "route.generated":            "info",
  "route.safety.approved":      "info",
  "route.safety.blocked":       "serious",
  "device.heartbeat":           "debug",
  "device.checkin":             "info",
  "nav.drop.reached":           "info",
  "nav.route.complete":         "info"
};

// ─── EXPORT FORMATS ───────────────────────────────────────────────────────────
export const EXPORT_FORMAT = {
  JSON:   "json",
  CSV:    "csv",
  NDJSON: "ndjson"  // newline-delimited JSON — streaming / SIEM ingestion
};

// ─── TIME WINDOWS (ms) ────────────────────────────────────────────────────────
export const TIME_WINDOW = {
  LAST_HOUR: 60 * 60 * 1000,
  LAST_24H:  24 * 60 * 60 * 1000,
  LAST_7D:   7  * 24 * 60 * 60 * 1000,
  LAST_28D:  28 * 24 * 60 * 60 * 1000,
  LAST_90D:  90 * 24 * 60 * 60 * 1000
};

// ─── COMPLIANCE EXPORT FIELDS (EU 561/2006 statutory set) ────────────────────
export const COMPLIANCE_EXPORT_FIELDS = [
  "sessionId", "driverId", "driverName", "vehicleId", "vehicleReg",
  "regulation", "startISO", "endISO", "status",
  "continuousDriveMin", "todayDriveMin", "weekDriveMin", "fortDriveMin",
  "breakMin", "todayRestMin", "shiftMin",
  "extendedDaysUsed", "reducedRestDaysUsed",
  "violationCount", "withinDailyLimit", "withinWeeklyLimit"
];

// ─── PAGINATION ───────────────────────────────────────────────────────────────
export const PAGE = {
  DEFAULT: 50,
  LARGE:   200,
  MAX:     1000
};
