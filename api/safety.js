// AP3X — /api/safety
// Safety AI Gatekeeper handler.
// POST /api/safety  body: { action, routeId, fleetId, requestedBy, notes }
// actions: evaluate | evaluate_fleet | get_decisions | is_approved

import { evaluateRoute, evaluateFleetRoutes, getRouteDecisions, isRouteApproved } from "../core/safety/safety-engine.js";
import store from "../core/storage.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, routeId, fleetId, requestedBy, notes } = req.body || {};
  if (!action) return res.status(400).json({ error: "action required: evaluate | evaluate_fleet | get_decisions | is_approved" });

  try {
    switch (action) {
      case "evaluate": {
        if (!routeId) return res.status(400).json({ error: "routeId required" });
        const decision = evaluateRoute(store, routeId, { requestedBy, notes });
        return res.status(200).json({ success: true, action: "evaluate", decision });
      }
      case "evaluate_fleet": {
        if (!fleetId) return res.status(400).json({ error: "fleetId required" });
        const decisions = evaluateFleetRoutes(store, fleetId);
        return res.status(200).json({ success: true, action: "evaluate_fleet", fleetId, count: decisions.length, decisions });
      }
      case "get_decisions": {
        if (!routeId) return res.status(400).json({ error: "routeId required" });
        const decisions = getRouteDecisions(store, routeId);
        return res.status(200).json({ success: true, action: "get_decisions", routeId, count: decisions.length, decisions });
      }
      case "is_approved": {
        if (!routeId) return res.status(400).json({ error: "routeId required" });
        const approved = isRouteApproved(store, routeId);
        return res.status(200).json({ success: true, action: "is_approved", routeId, approved, reason: approved ? null : _notApprovedReason(store, routeId) });
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

function _notApprovedReason(store, routeId) {
  const route = store.routes?.[routeId];
  if (!route) return "Route not found";
  if (!route.latestSafetyDecision) return "No safety evaluation — call action=evaluate first";
  const decision = store.safetyDecisions?.[route.latestSafetyDecision];
  if (!decision) return "Safety decision record missing";
  const stale = Date.now() - decision.evaluatedAt > 30 * 60 * 1000;
  if (stale) return "Safety approval expired (>30 min) — re-evaluate before dispatch";
  if (!decision.approved) return `Route rejected: risk score ${decision.riskScore}/100 — ${decision.blockers?.[0] || "see full decision"}`;
  return "Unknown reason";
}
