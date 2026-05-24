// AP3X — /api/deploy
// Consolidated deployment handler.
// POST /api/deploy?action=deploy     → deployFleet (Master Controller only)
// POST /api/deploy?action=preflight  → runPreFlight
// POST /api/deploy?action=rollback   → rollbackFleet (Master Controller only)
// GET  /api/deploy?action=status     → getDeploymentStatus / getActiveDeployment
// GET  /api/deploy?action=list       → listDeployments

import {
  deployFleet,
  runPreFlight,
  rollbackFleet,
  getDeploymentStatus,
  listDeployments,
  getRollbackCandidates
}                                     from "../core/deployment-orchestrator.js";
import { getActiveDeployment }         from "../core/deployment/version-manager.js";
import {
  isGracefulRollbackReady,
  completeGracefulRollback
}                                     from "../core/deployment/rollback-manager.js";
import store                           from "../core/storage.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const action = req.query?.action || req.body?.action;

  // ── GET actions ────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { deploymentId, fleetId, status, limit } = req.query || {};

    if (!action || action === "status") {
      try {
        if (deploymentId) {
          const dep    = getDeploymentStatus(store, deploymentId);
          const bundle = dep.bundleId ? store.bundles?.[dep.bundleId] : null;
          return res.status(200).json({
            deployment: dep,
            bundle: bundle ? {
              id: bundle.id, target: bundle.target,
              checksum: bundle.checksum,
              sizeEstimateBytes: bundle.sizeEstimateBytes,
              sections: Object.keys(bundle.sections || {})
            } : null
          });
        }
        if (fleetId) {
          const active = getActiveDeployment(store, fleetId);
          const recent = listDeployments(store, fleetId).slice(0, 5);
          return res.status(200).json({ active, recent });
        }
        return res.status(400).json({ error: "deploymentId or fleetId required" });
      } catch (err) {
        return res.status(err.message.includes("not found") ? 404 : 500).json({ error: err.message });
      }
    }

    if (action === "list") {
      if (!fleetId) return res.status(400).json({ error: "fleetId required" });
      const maxLimit = Math.min(parseInt(limit) || 20, 100);
      let deployments = listDeployments(store, fleetId);
      if (status) deployments = deployments.filter(d => d.status === status);
      deployments = deployments.slice(0, maxLimit);
      const active     = getActiveDeployment(store, fleetId);
      const candidates = getRollbackCandidates(store, fleetId, 5);
      return res.status(200).json({ fleetId, total: deployments.length, active, rollbackCandidates: candidates, deployments });
    }

    return res.status(400).json({ error: "action must be status or list for GET" });
  }

  // ── POST actions ───────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const body = req.body || {};

    // ── DEPLOY ──────────────────────────────────────────────────────────────
    if (!action || action === "deploy") {
      const { fleetId, initiator, env, bundleTarget, bump, version, changelog, envVars, projectName, teamId, region, dryRun } = body;

      if (initiator !== "master_controller") {
        return res.status(403).json({
          error:  "AP3X DEPLOY RULE VIOLATION",
          detail: "Only the Master Controller may deploy fleets. Fleet OS cannot self-deploy.",
          code:   "INITIATOR_NOT_MASTER_CONTROLLER"
        });
      }
      if (!fleetId) return res.status(400).json({ error: "fleetId required" });

      try {
        const result = deployFleet(store, fleetId, {
          initiator:    "master_controller",
          env:          env          || "vercel",
          bundleTarget: bundleTarget || "full",
          bump:         bump         || "patch",
          version,
          changelog:    changelog    || [],
          envVars:      envVars      || {},
          projectName:  projectName  || process.env.VERCEL_PROJECT_NAME || "ap3x-master-controller",
          teamId:       teamId       || process.env.VERCEL_TEAM_ID      || null,
          region:       region       || process.env.VERCEL_REGION       || "lhr1",
          dryRun:       !!dryRun
        });

        if (result.success && !dryRun && env !== "local" && result.plan?.apiSpec) {
          await _executeVercelDeploy(result.plan, result);
        }

        return res.status(result.success ? 200 : 422).json(result);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // ── PREFLIGHT ───────────────────────────────────────────────────────────
    if (action === "preflight") {
      const { fleetId } = body;
      if (!fleetId) return res.status(400).json({ error: "fleetId required" });
      try {
        const result = runPreFlight(store, fleetId);
        return res.status(result.passed ? 200 : 422).json({
          fleetId,
          passed:   result.passed,
          failures: result.failures,
          warnings: result.warnings,
          checks:   result.checks
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // ── ROLLBACK ────────────────────────────────────────────────────────────
    if (action === "rollback") {
      const { fleetId, initiator, strategy, targetId, reason, completePending } = body;

      if (initiator !== "master_controller") {
        return res.status(403).json({
          error:  "AP3X ROLLBACK RULE VIOLATION",
          detail: "Only the Master Controller may roll back deployments.",
          code:   "INITIATOR_NOT_MASTER_CONTROLLER"
        });
      }
      if (!fleetId) return res.status(400).json({ error: "fleetId required" });

      if (completePending) {
        if (!isGracefulRollbackReady(store, fleetId)) {
          return res.status(409).json({ error: "Graceful rollback not yet ready — active driver sessions or routes still open" });
        }
        const result = completeGracefulRollback(store, fleetId);
        return res.status(200).json(result);
      }

      try {
        const result = rollbackFleet(store, fleetId, {
          initiator: "master_controller",
          strategy:  strategy || "immediate",
          targetId,
          reason:    reason   || "Manual rollback via API"
        });
        return res.status(result.success ? 200 : 422).json(result);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: "action must be deploy, preflight, or rollback for POST" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// ─── VERCEL DEPLOY EXECUTOR ───────────────────────────────────────────────────
async function _executeVercelDeploy(plan, result) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    result.warnings = result.warnings || [];
    result.warnings.push("VERCEL_TOKEN not set — deploy plan generated but remote call skipped");
    return;
  }
  try {
    const spec      = plan.apiSpec;
    const teamQuery = plan.teamId ? `?teamId=${plan.teamId}` : "";
    const resp      = await fetch(`${spec.endpoint}${teamQuery}`, {
      method:  spec.method,
      headers: { ...spec.headers, Authorization: `Bearer ${token}` },
      body:    JSON.stringify(spec.body)
    });
    const data = await resp.json().catch(() => ({}));
    result.vercelDeployment = { id: data.id || null, url: data.url || null, state: data.readyState || "UNKNOWN", httpStatus: resp.status };
    if (!resp.ok) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Vercel API returned ${resp.status}: ${data.error?.message || "unknown"}`);
    }
  } catch (err) {
    result.warnings = result.warnings || [];
    result.warnings.push(`Vercel API call failed: ${err.message}`);
  }
}
