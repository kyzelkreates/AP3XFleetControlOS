// AP3X Master Controller — API client
// All calls go through /api/* Vercel serverless functions.

const BASE = "";

async function request(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({ error: "Invalid JSON response" }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Fleet ──────────────────────────────────────────────────────────────────
export const fleetApi = {
  list:   ()               => request("GET",  "/api/fleets"),
  create: (data)           => request("POST", "/api/fleets", { ...data, action: "create" }),
  update: (data)           => request("POST", "/api/fleets", { ...data, action: "update" }),
  deploy: (data)           => request("POST", "/api/deploy", {
    ...data, action: "deploy", initiator: "master_controller", env: "vercel",
    bundleTarget: "full", bump: "patch"
  }),
  deploymentStatus: (id)       => request("GET",  `/api/deploy?action=status&deploymentId=${id}`),
  listDeployments:  (fleetId)  => request("GET",  `/api/deploy?action=list&fleetId=${fleetId}`),
  preflight: (fleetId)         => request("POST", "/api/deploy", { action: "preflight", fleetId }),
  rollback: (fleetId, targetId) => request("POST", "/api/deploy", {
    action: "rollback", fleetId, targetId, initiator: "master_controller"
  }),
};

// ── Driver ─────────────────────────────────────────────────────────────────
export const driverApi = {
  sync: (params) => request("GET", `/api/drivers?${new URLSearchParams(params)}`),
};

// ── Device ─────────────────────────────────────────────────────────────────
export const deviceApi = {
  checkin:   (data) => request("POST", "/api/devices", { ...data, action: "checkin"   }),
  heartbeat: (data) => request("POST", "/api/devices", { ...data, action: "heartbeat" }),
};

// ── Hazard ─────────────────────────────────────────────────────────────────
export const hazardApi = {
  report:  (data) => request("POST", "/api/hazards", { ...data, action: "report"  }),
  confirm: (data) => request("POST", "/api/hazards", { ...data, action: "confirm" }),
  dispute: (data) => request("POST", "/api/hazards", { ...data, action: "dispute" }),
};

// ── Safety ─────────────────────────────────────────────────────────────────
export const safetyApi = {
  evaluate:    (routeId, requestedBy) =>
    request("POST", "/api/safety", { action: "evaluate",   routeId, requestedBy }),
  isApproved:  (routeId) =>
    request("POST", "/api/safety", { action: "is_approved", routeId }),
  getDecisions: (routeId) =>
    request("POST", "/api/safety", { action: "get_decisions", routeId }),
  evaluateFleet: (fleetId) =>
    request("POST", "/api/safety", { action: "evaluate_fleet", fleetId }),
};

// ── Tacho ──────────────────────────────────────────────────────────────────
export const tachoApi = {
  startSession: (driverId, vehicleId, fleetId) =>
    request("POST", "/api/tacho", { action: "session", action: "start", driverId, vehicleId, fleetId }),
  endSession: (driverId, fleetId) =>
    request("POST", "/api/tacho", { action: "session", action: "end", driverId, fleetId }),
  recordActivity: (driverId, fleetId, activityType, time) =>
    request("POST", "/api/tacho", { action: "activity", driverId, fleetId, activityType, time }),
};

// ── Navigation ─────────────────────────────────────────────────────────────
export const navApi = {
  event: (data) => request("POST", "/api/nav", data),
};

// ── Observability ──────────────────────────────────────────────────────────
export const obsApi = {
  query:  (params) => request("GET",  `/api/obs?${new URLSearchParams(params)}`),
  export: (data)   => request("POST", "/api/obs", data),
};
