// AP3X Offline Navigation Logic — RUN 9
// Manages route state, drop sequencing, ETA tracking, and corridor tile readiness.
// NO map rendering. NO routing creation. Reads route objects only.
// Works fully offline — all data from IndexedDB + in-memory store.

import { requestTile, latLonToTile, prefetchRouteCorridor, getCacheSummary }
  from "../../core/tiles/tile-manager.js";
import { ZOOM, TILE_PROVIDER } from "../../core/tiles/tile-constants.js";

// ─── NAV STATE ────────────────────────────────────────────────────────────────
// Singleton — one active route per driver session
let _navState = null;

export const NAV_STATUS = {
  IDLE:        "idle",
  ACTIVE:      "active",
  DROP_REACHED:"drop_reached",
  PAUSED:      "paused",
  COMPLETE:    "complete"
};

// ─── START NAV ────────────────────────────────────────────────────────────────

/**
 * Initialise navigation for a route.
 * @param {object} route - Route object from SSOT/local store
 * @returns {NavState}
 */
export function startNavigation(route) {
  if (!route || !route.drops || route.drops.length === 0) {
    throw new Error("Cannot start navigation — route has no drops");
  }

  _navState = {
    routeId:       route.id,
    fleetId:       route.fleetId,
    vehicleId:     route.vehicleId,
    driverId:      route.driverId,
    status:        NAV_STATUS.ACTIVE,
    drops:         route.drops.map((d, i) => ({
                    ...d,
                    index:  i,
                    done:   false,
                    active: i === 0
                   })),
    legs:          route.legs  || [],
    summary:       route.summary || {},
    currentDropIndex: 0,
    startedAt:     Date.now(),
    elapsedMin:    0,
    distanceCoveredKm: 0,
    lastPosition:  null,
    tilesReady:    false,
    tileStats:     null,
    events:        []
  };

  _log("nav.started", { routeId: route.id, dropCount: route.drops.length });
  return _navState;
}

// ─── POSITION UPDATE ─────────────────────────────────────────────────────────

/**
 * Update driver position. Called from Geolocation API in app.js.
 * Checks proximity to current drop — auto-advances if within ARRIVAL_RADIUS_M.
 * @param {{ lat, lon, accuracy?, heading?, speed? }} position
 */
export function updatePosition(position) {
  if (!_navState || _navState.status !== NAV_STATUS.ACTIVE) return null;

  _navState.lastPosition = { ...position, timestamp: Date.now() };

  const drop = _navState.drops[_navState.currentDropIndex];
  if (!drop || drop.done) return _navState;

  const dist = _haversineM(position.lat, position.lon, drop.lat, drop.lon);

  if (dist <= ARRIVAL_RADIUS_M) {
    return _reachDrop(_navState.currentDropIndex);
  }

  return _navState;
}

// ─── DROP MANAGEMENT ─────────────────────────────────────────────────────────

const ARRIVAL_RADIUS_M = 75; // auto-advance within 75m of drop point

/**
 * Manually mark current drop as complete (driver taps "Arrived").
 */
export function confirmDropArrival() {
  if (!_navState) throw new Error("No active navigation");
  return _reachDrop(_navState.currentDropIndex);
}

/**
 * Skip current drop (fleet admin pre-approved — driver cannot skip otherwise).
 */
export function skipDrop(approved = false) {
  if (!_navState) throw new Error("No active navigation");
  if (!approved) throw new Error("Drop skip requires fleet admin approval");

  const drop = _navState.drops[_navState.currentDropIndex];
  drop.done    = true;
  drop.active  = false;
  drop.skipped = true;
  drop.skippedAt = Date.now();

  _log("drop.skipped", { dropIndex: _navState.currentDropIndex, label: drop.label });
  return _advanceToNextDrop();
}

function _reachDrop(index) {
  const drop     = _navState.drops[index];
  drop.done      = true;
  drop.active    = false;
  drop.arrivedAt = Date.now();

  _log("drop.reached", {
    dropIndex: index,
    label:     drop.label,
    arrivedAt: drop.arrivedAt,
    etaDelta:  drop.estimatedArrival
      ? Math.round((drop.arrivedAt - drop.estimatedArrival) / 60000)
      : null
  });

  return _advanceToNextDrop();
}

function _advanceToNextDrop() {
  const next = _navState.currentDropIndex + 1;

  if (next >= _navState.drops.length) {
    _navState.status = NAV_STATUS.COMPLETE;
    _navState.completedAt = Date.now();
    _log("nav.complete", { routeId: _navState.routeId, totalDrops: _navState.drops.length });
    return _navState;
  }

  _navState.currentDropIndex   = next;
  _navState.drops[next].active = true;
  _navState.status             = NAV_STATUS.ACTIVE;

  _log("drop.next", { dropIndex: next, label: _navState.drops[next].label });
  return _navState;
}

// ─── ETA RECALCULATION ────────────────────────────────────────────────────────

/**
 * Recalculate ETAs for remaining drops based on current position + elapsed time.
 * Uses straight-line haversine at average speed (50km/h) — no road topology.
 * Map provider integration in future run will improve this.
 */
export function recalculateETAs(currentLat, currentLon) {
  if (!_navState) return;

  const AVG_KMH    = 50;
  const now        = Date.now();
  let   cumulativeMin = 0;

  const remaining = _navState.drops.filter(d => !d.done);
  let   prevLat   = currentLat;
  let   prevLon   = currentLon;

  for (const drop of remaining) {
    const km = _haversineM(prevLat, prevLon, drop.lat, drop.lon) / 1000;
    cumulativeMin   += (km / AVG_KMH) * 60;
    drop.etaMs       = now + cumulativeMin * 60000;
    drop.etaISO      = new Date(drop.etaMs).toISOString();
    prevLat          = drop.lat;
    prevLon          = drop.lon;
  }

  return _navState;
}

// ─── TILE READINESS ──────────────────────────────────────────────────────────

/**
 * Check whether the route corridor tiles are cached.
 * Returns { ready, totalTiles, cachedMB, utilizationPct }.
 */
export async function checkTileReadiness(route) {
  try {
    const stats = await getCacheSummary();
    const ready  = stats.totalTiles > 0;

    if (_navState) {
      _navState.tilesReady = ready;
      _navState.tileStats  = stats;
    }

    return { ready, ...stats };
  } catch {
    return { ready: false, totalTiles: 0, totalMB: 0 };
  }
}

/**
 * Trigger a background tile prefetch for the route corridor.
 * Resolves when queued — does NOT block navigation start.
 * Called automatically after startNavigation if tiles not ready.
 */
export async function prefetchRouteCorridorBackground(route) {
  if (!route.legs || route.legs.length === 0) return;

  try {
    const job = await prefetchRouteCorridor(route.legs, {
      provider: TILE_PROVIDER.OSM,
      zoomMin:  ZOOM.ROUTE_MIN,
      zoomMax:  ZOOM.ROUTE_MAX,
      fleetId:  route.fleetId,
      routeId:  route.id
    });

    if (_navState) {
      _navState.tilePrefetchJob = job;
      _navState.tilesReady      = job.fetched > 0;
    }

    return job;
  } catch (err) {
    console.warn("[OfflineNav] Tile prefetch failed:", err.message);
    return null;
  }
}

// ─── STATE ACCESSORS ─────────────────────────────────────────────────────────

export function getNavState()        { return _navState; }
export function getCurrentDrop()     { return _navState?.drops[_navState.currentDropIndex] || null; }
export function getRemainingDrops()  { return _navState?.drops.filter(d => !d.done) || []; }
export function isNavActive()        { return _navState?.status === NAV_STATUS.ACTIVE; }

export function pauseNavigation() {
  if (!_navState) return;
  _navState.status = NAV_STATUS.PAUSED;
  _log("nav.paused", {});
}

export function resumeNavigation() {
  if (!_navState) return;
  _navState.status = NAV_STATUS.ACTIVE;
  _log("nav.resumed", {});
}

export function endNavigation() {
  if (!_navState) return;
  _navState.status      = NAV_STATUS.COMPLETE;
  _navState.completedAt = Date.now();
  _log("nav.ended", { manual: true });
  const final = { ..._navState };
  _navState   = null;
  return final;
}

// ─── EVENT LOG ────────────────────────────────────────────────────────────────

function _log(type, payload) {
  const entry = { type, payload, timestamp: Date.now() };
  if (_navState) _navState.events.push(entry);
  window.dispatchEvent(new CustomEvent("ap3x:nav", { detail: entry }));
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _haversineM(lat1, lon1, lat2, lon2) {
  const R  = 6_371_000;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dG = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(dL / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
