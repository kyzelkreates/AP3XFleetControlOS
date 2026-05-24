// AP3X PWA v2 — Offline Navigation Logic
// Manages route state, drop progression, ETA recalculation.
// NO map UI rendering here — that's the component's job.
// NO routing creation. Read-only execution of pre-computed routes.

const AVG_SPEED_KMH = 45; // conservative urban average

// ── Haversine ─────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R  = 6371;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dG = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dG/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Navigation session ────────────────────────────────────────────────────

export function createNavSession(route) {
  if (!route?.drops?.length) return null;
  const drops = [...route.drops].sort((a,b) => (a.sequence||0)-(b.sequence||0));
  return {
    routeId:        route.id,
    drops,
    currentIndex:   0,
    completedDrops: [],
    skippedDrops:   [],
    startedAt:      Date.now(),
    status:         "active",       // active | paused | completed | abandoned
    position:       null,
    lastUpdated:    Date.now(),
  };
}

export function getCurrentDrop(session) {
  if (!session) return null;
  return session.drops[session.currentIndex] ?? null;
}

export function getRemainingDrops(session) {
  if (!session) return [];
  return session.drops.slice(session.currentIndex);
}

export function confirmArrival(session) {
  if (!session) return session;
  const drop = session.drops[session.currentIndex];
  const next = {
    ...session,
    completedDrops: [...session.completedDrops, { ...drop, arrivedAt: Date.now() }],
    currentIndex: session.currentIndex + 1,
    lastUpdated:  Date.now(),
  };
  if (next.currentIndex >= next.drops.length) {
    next.status      = "completed";
    next.completedAt = Date.now();
  }
  return next;
}

export function skipDrop(session) {
  if (!session) return session;
  const drop = session.drops[session.currentIndex];
  const next = {
    ...session,
    skippedDrops: [...session.skippedDrops, { ...drop, skippedAt: Date.now() }],
    currentIndex: session.currentIndex + 1,
    lastUpdated:  Date.now(),
  };
  if (next.currentIndex >= next.drops.length) {
    next.status      = "completed";
    next.completedAt = Date.now();
  }
  return next;
}

export function updatePosition(session, pos) {
  if (!session) return session;
  return { ...session, position: pos, lastUpdated: Date.now() };
}

export function recalculateETAs(session) {
  if (!session?.position) return session;
  const remaining = getRemainingDrops(session);
  const { lat, lon } = session.position;
  let fromLat = lat, fromLon = lon;
  const etas = remaining.map(drop => {
    const distKm = haversineKm(fromLat, fromLon, drop.lat, drop.lon) * 1.15;
    const mins   = (distKm / AVG_SPEED_KMH) * 60;
    fromLat = drop.lat;
    fromLon = drop.lon;
    return { dropIndex: drop.sequence, distKm: +distKm.toFixed(2), etaMin: +mins.toFixed(1) };
  });
  return { ...session, etas, lastUpdated: Date.now() };
}

// ── Tile readiness check ───────────────────────────────────────────────────

export async function checkTileReadiness(route) {
  // Simple heuristic: if any tiles exist in IDB for this route's bbox, report ready
  try {
    const { openDB } = await import("./idb.js");
    const db = await openDB();
    const tx  = db.transaction("tiles", "readonly");
    const req = tx.objectStore("tiles").count();
    const count = await new Promise((res, rej) => { req.onsuccess = e => res(e.target.result); req.onerror = e => rej(e.target.error); });
    // Conservative: if > 50 tiles cached, assume corridor covered
    return { ready: count > 50, count };
  } catch {
    return { ready: false, count: 0 };
  }
}
