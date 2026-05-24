// AP3X — /api/devices
// Consolidated device handler.
// POST /api/devices?action=checkin    → first-contact registration
// POST /api/devices?action=heartbeat  → periodic keepalive

import store         from "../core/storage.js";
import { emitEvent } from "../core/event-emitter.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const action = req.query?.action || req.body?.action || "heartbeat";
  const body   = req.body || {};

  // ── CHECKIN ───────────────────────────────────────────────────────────────
  if (action === "checkin") {
    const { deviceId, driverId, fleetId, userAgent } = body;
    if (!deviceId || !driverId || !fleetId) {
      return res.status(400).json({ error: "deviceId, driverId, and fleetId required" });
    }

    const fleet  = store.fleets[fleetId];
    if (!fleet)  return res.status(404).json({ error: `Fleet not found: ${fleetId}` });

    const driver = store.drivers[driverId];
    if (!driver || driver.fleetId !== fleetId) {
      return res.status(403).json({ error: "Driver not authorised for this fleet" });
    }

    const now      = Date.now();
    const existing = store.devices[deviceId] || {};
    store.devices[deviceId] = {
      ...existing,
      id:           deviceId,
      driverId,
      fleetId,
      userAgent:    userAgent || existing.userAgent,
      registeredAt: existing.registeredAt || now,
      lastSeenAt:   now,
      online:       true
    };

    emitEvent(store, { type: "device.checkin", fleetId, entityId: deviceId, payload: { deviceId, driverId, userAgent } });

    return res.status(200).json({
      deviceId,
      driverId,
      fleetId,
      driverName:  driver.name      || null,
      fleetName:   fleet.name       || null,
      regulation:  fleet.regulation || "eu_561",
      checkedInAt: now,
      serverTs:    now
    });
  }

  // ── HEARTBEAT ─────────────────────────────────────────────────────────────
  if (action === "heartbeat") {
    const { deviceId, driverId, fleetId, timestamp, userAgent } = body;
    if (!deviceId) return res.status(400).json({ error: "deviceId required" });

    const now      = Date.now();
    const existing = store.devices[deviceId] || {};
    store.devices[deviceId] = {
      ...existing,
      id:              deviceId,
      driverId:        driverId    || existing.driverId,
      fleetId:         fleetId     || existing.fleetId,
      userAgent:       userAgent   || existing.userAgent,
      lastSeenAt:      now,
      lastHeartbeatAt: now,
      online:          true,
      clientTs:        timestamp   || now
    };

    emitEvent(store, {
      type:     "device.heartbeat",
      fleetId:  fleetId || existing.fleetId,
      entityId: deviceId,
      payload:  { deviceId, driverId, clientTs: timestamp }
    });

    return res.status(200).json({ ack: true, serverTs: now });
  }

  return res.status(400).json({ error: "action must be checkin or heartbeat" });
}
