// AP3X Hazard System — RUN 6
// Shared constants, type definitions, severity bands, and validation rules.
// Single source of truth for all hazard logic.

// ─── HAZARD TYPES ─────────────────────────────────────────────────────────────
export const HAZARD_TYPE = {
  // Road surface
  ROAD_CLOSED:        "road_closed",
  ROAD_FLOODED:       "road_flooded",
  ROAD_ICY:           "road_icy",
  POTHOLE:            "pothole",
  DEBRIS:             "debris",
  BRIDGE_CLOSED:      "bridge_closed",
  BRIDGE_HEIGHT_WARN: "bridge_height_warning",

  // Traffic
  ACCIDENT:           "accident",
  CONGESTION:         "congestion",
  ROADWORKS:          "roadworks",
  LANE_CLOSURE:       "lane_closure",

  // Hazardous conditions
  FOG:                "fog",
  HIGH_WIND:          "high_wind",
  FLOODING:           "flooding",
  BLACK_ICE:          "black_ice",

  // Security / other
  POLICE_INCIDENT:    "police_incident",
  FUEL_SPILLAGE:      "fuel_spillage",
  LOAD_SPILLAGE:      "load_spillage",
  OTHER:              "other"
};

// ─── HAZARD SEVERITY ──────────────────────────────────────────────────────────
export const HAZARD_SEVERITY = {
  LOW:      "low",       // advisory only — continue with caution
  MEDIUM:   "medium",    // route check recommended
  HIGH:     "high",      // strong avoidance recommended
  CRITICAL: "critical"   // route must avoid — block dispatch if unresolved
};

// Severity → numeric score (used by routing integration in RUN 4+ active phase)
export const SEVERITY_SCORE = {
  low:      10,
  medium:   30,
  high:     60,
  critical: 100
};

// ─── HAZARD STATUS ────────────────────────────────────────────────────────────
export const HAZARD_STATUS = {
  ACTIVE:     "active",       // confirmed, broadcasting to fleet
  UNVERIFIED: "unverified",   // submitted, awaiting validation
  RESOLVED:   "resolved",     // no longer present
  EXPIRED:    "expired",      // TTL elapsed — auto-expired
  REJECTED:   "rejected"      // failed validation
};

// ─── HAZARD SOURCE ────────────────────────────────────────────────────────────
export const HAZARD_SOURCE = {
  DRIVER:     "driver",       // submitted by a driver (primary source)
  FLEET_ADMIN:"fleet_admin",  // submitted by fleet admin
  SYSTEM:     "system",       // auto-generated (e.g. weather integration, future)
  EXTERNAL:   "external"      // external feed (future: Waze, HERE, TomTom)
};

// ─── TTL DEFAULTS (ms) ────────────────────────────────────────────────────────
// Hazards auto-expire after these durations if not manually resolved.
export const HAZARD_TTL_MS = {
  low:      2  * 60 * 60 * 1000,   // 2h
  medium:   4  * 60 * 60 * 1000,   // 4h
  high:     8  * 60 * 60 * 1000,   // 8h
  critical: 24 * 60 * 60 * 1000    // 24h (requires explicit resolve)
};

// ─── BROADCAST SCOPE ──────────────────────────────────────────────────────────
export const BROADCAST_SCOPE = {
  FLEET:    "fleet",      // all drivers in this fleet
  DRIVER:   "driver",     // specific driver only
  ALL:      "all"         // all fleets (master-level — future)
};

// ─── VALIDATION RULES ─────────────────────────────────────────────────────────
export const VALIDATION_RULES = {
  COORD_LAT_RANGE:     [-90,   90],
  COORD_LON_RANGE:     [-180, 180],
  MAX_DESCRIPTION_LEN: 500,
  MIN_DESCRIPTION_LEN: 3,
  MAX_RADIUS_M:        10_000,   // 10km — max hazard influence radius
  MIN_RADIUS_M:        10,       // 10m  — minimum meaningful radius
  DEFAULT_RADIUS_M:    200,      // default if not provided
  DUPLICATE_WINDOW_MS: 5 * 60 * 1000,   // 5min — suppress duplicate reports at same location
  DUPLICATE_RADIUS_M:  100               // within 100m = same hazard for dedup
};

// ─── TYPE → DEFAULT SEVERITY MAP ──────────────────────────────────────────────
// If reporter doesn't specify severity, default by type.
export const TYPE_DEFAULT_SEVERITY = {
  road_closed:         HAZARD_SEVERITY.CRITICAL,
  road_flooded:        HAZARD_SEVERITY.HIGH,
  road_icy:            HAZARD_SEVERITY.HIGH,
  pothole:             HAZARD_SEVERITY.LOW,
  debris:              HAZARD_SEVERITY.MEDIUM,
  bridge_closed:       HAZARD_SEVERITY.CRITICAL,
  bridge_height_warning:HAZARD_SEVERITY.HIGH,
  accident:            HAZARD_SEVERITY.HIGH,
  congestion:          HAZARD_SEVERITY.LOW,
  roadworks:           HAZARD_SEVERITY.MEDIUM,
  lane_closure:        HAZARD_SEVERITY.MEDIUM,
  fog:                 HAZARD_SEVERITY.MEDIUM,
  high_wind:           HAZARD_SEVERITY.HIGH,
  flooding:            HAZARD_SEVERITY.CRITICAL,
  black_ice:           HAZARD_SEVERITY.CRITICAL,
  police_incident:     HAZARD_SEVERITY.MEDIUM,
  fuel_spillage:       HAZARD_SEVERITY.HIGH,
  load_spillage:       HAZARD_SEVERITY.HIGH,
  other:               HAZARD_SEVERITY.LOW
};
