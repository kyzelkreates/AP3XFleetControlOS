// AP3X Hazard Broadcast — RUN 6
// Fleet-wide hazard distribution system.
// Distributes hazard events to all eligible recipients in a fleet.
// NO map rendering. NO routing changes. Events + records only.
// PWA push delivery comes in RUN driver PWA (future run).

import { emitEvent }     from "../event-emitter.js";
import { BROADCAST_SCOPE, HAZARD_STATUS, HAZARD_SEVERITY } from "./hazard-constants.js";

// ─── BROADCAST ENTRY POINT ────────────────────────────────────────────────────

/**
 * Broadcast a hazard to all eligible recipients in the fleet.
 * Called automatically by hazard-manager after reportHazard().
 * Can also be called manually to re-broadcast updated/critical hazards.
 *
 * @param {object} store    - AP3X SSOT
 * @param {string} fleetId
 * @param {string} hazardId
 * @param {object} options  - { forceScope?, note? }
 * @returns {BroadcastRecord}
 */
export function broadcastHazard(store, fleetId, hazardId, options = {}) {
  const hazard = store.hazards?.[hazardId];
  if (!hazard) throw new Error(`Hazard not found: ${hazardId}`);
  if (hazard.fleetId !== fleetId) throw new Error(`Hazard does not belong to fleet ${fleetId}`);

  if (hazard.status !== HAZARD_STATUS.ACTIVE) {
    // Still allow re-broadcast of resolved/expired for awareness — but flag it
    if (!options.allowInactive) {
      throw new Error(`Cannot broadcast inactive hazard (status: ${hazard.status}) — pass allowInactive: true to override`);
    }
  }

  const scope      = options.forceScope || hazard.broadcastScope || BROADCAST_SCOPE.FLEET;
  const recipients = _resolveRecipients(store, fleetId, hazardId, scope);
  const broadcastId= crypto.randomUUID();
  const now        = Date.now();

  // ── Build broadcast record ────────────────────────────────────────────────
  const broadcastRecord = {
    id:          broadcastId,
    hazardId,
    fleetId,
    scope,
    recipients,             // list of { driverId, deviceId, name }
    recipientCount:recipients.length,
    sentAt:      now,
    note:        options.note || null,
    hazardSnapshot: {
      type:        hazard.type,
      severity:    hazard.severity,
      lat:         hazard.lat,
      lon:         hazard.lon,
      radiusM:     hazard.radiusM,
      description: hazard.description,
      expiresAt:   hazard.expiresAt
    }
  };

  // ── Append to hazard's broadcast history ─────────────────────────────────
  if (!hazard.broadcastHistory) hazard.broadcastHistory = [];
  hazard.broadcastHistory.push({ broadcastId, sentAt: now, scope, recipientCount: recipients.length });
  hazard.updatedAt = now;

  // ── Persist broadcast record ──────────────────────────────────────────────
  if (!store.hazardBroadcasts) store.hazardBroadcasts = {};
  store.hazardBroadcasts[broadcastId] = broadcastRecord;

  // ── Emit fleet-wide event ─────────────────────────────────────────────────
  emitEvent(store, {
    type:      "hazard.broadcast.sent",
    fleetId,
    entityId:  broadcastId,
    collection:"hazardBroadcasts",
    payload: {
      broadcastId,
      hazardId,
      hazardType:     hazard.type,
      severity:       hazard.severity,
      scope,
      recipientCount: recipients.length,
      lat:            hazard.lat,
      lon:            hazard.lon
    }
  });

  // ── Per-driver delivery events (driver PWA will consume these in future run) ─
  for (const r of recipients) {
    emitEvent(store, {
      type:      "hazard.delivered",
      fleetId,
      entityId:  broadcastId,
      collection:"hazardBroadcasts",
      payload: {
        broadcastId,
        hazardId,
        driverId:   r.driverId,
        deviceId:   r.deviceId || null,
        deliveredAt:now
      }
    });
  }

  return broadcastRecord;
}

// ─── AUTO-BROADCAST (called by hazard-manager on new critical/high reports) ───

/**
 * Decides whether a hazard warrants automatic broadcast and triggers it.
 * LOW severity: broadcast but no urgency flag.
 * MEDIUM+: immediate broadcast.
 * CRITICAL: broadcast + emit urgency alert event.
 */
export function autoBroadcast(store, fleetId, hazardId) {
  const hazard = store.hazards?.[hazardId];
  if (!hazard || hazard.status !== HAZARD_STATUS.ACTIVE) return null;

  const result = broadcastHazard(store, fleetId, hazardId, {
    note: "auto-broadcast on report"
  });

  // Critical hazards get an additional urgency event
  if (hazard.severity === HAZARD_SEVERITY.CRITICAL) {
    emitEvent(store, {
      type:      "hazard.critical.alert",
      fleetId,
      entityId:  hazardId,
      collection:"hazards",
      payload: {
        hazardId,
        type:        hazard.type,
        severity:    hazard.severity,
        lat:         hazard.lat,
        lon:         hazard.lon,
        broadcastId: result.id,
        message:     `CRITICAL HAZARD: ${hazard.type.replace(/_/g, " ").toUpperCase()} reported at (${hazard.lat}, ${hazard.lon})`
      }
    });
  }

  return result;
}

// ─── BROADCAST HISTORY ────────────────────────────────────────────────────────

export function getBroadcastHistory(store, hazardId) {
  return Object.values(store.hazardBroadcasts || {})
    .filter(b => b.hazardId === hazardId)
    .sort((a, b) => b.sentAt - a.sentAt);
}

export function getFleetBroadcasts(store, fleetId) {
  return Object.values(store.hazardBroadcasts || {})
    .filter(b => b.fleetId === fleetId)
    .sort((a, b) => b.sentAt - a.sentAt);
}

// ─── RECIPIENT RESOLUTION ────────────────────────────────────────────────────

function _resolveRecipients(store, fleetId, hazardId, scope) {
  const hazard  = store.hazards[hazardId];
  const drivers = Object.values(store.drivers || {})
    .filter(d => d.fleetId === fleetId && d.status === "active");

  // Exclude the reporting driver — they already know
  const others  = drivers.filter(d => d.id !== hazard.reportedByDriverId);

  switch (scope) {
    case BROADCAST_SCOPE.FLEET:
      return others.map(d => ({
        driverId: d.id,
        name:     d.name,
        deviceId: d.boundDeviceId || null
      }));

    case BROADCAST_SCOPE.DRIVER:
      // Targeted broadcast — only relevant if a specific driverId is set in options
      // For now, fleet-scoped same as FLEET until PWA routing is in scope
      return others.map(d => ({
        driverId: d.id,
        name:     d.name,
        deviceId: d.boundDeviceId || null
      }));

    case BROADCAST_SCOPE.ALL:
      // Cross-fleet broadcast — master only (future)
      return Object.values(store.drivers || {})
        .filter(d => d.status === "active" && d.id !== hazard.reportedByDriverId)
        .map(d => ({ driverId: d.id, name: d.name, deviceId: d.boundDeviceId || null }));

    default:
      return [];
  }
}
