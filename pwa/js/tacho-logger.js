// AP3X Tachograph Logger UI — RUN 9
// Driver-side compliance view + activity recording.
// Reads from local session state (synced from control plane).
// Submits activity changes via sync queue for tachograph-engine.js on server.
// NO AI decisions. NO route changes. Read + record only.

import { ACTIVITY, VIOLATION_SEVERITY } from "../../core/compliance/compliance-constants.js";
import { queueSync } from "./sync-agent.js";

// ─── MODULE STATE ─────────────────────────────────────────────────────────────
let _snapshot    = null;   // compliance snapshot from server
let _localAccum  = null;   // local accumulator (updated optimistically)
let _driverId    = null;
let _fleetId     = null;
let _timerHandle = null;
let _sessionStart= null;
let _localDriveMin = 0;   // local drive minute counter (ticks while DRIVING)
let _currentActivity = ACTIVITY.DRIVING;

// ─── INIT ─────────────────────────────────────────────────────────────────────

export function initTachoLogger(container, { driverId, fleetId, snapshot }) {
  _driverId    = driverId;
  _fleetId     = fleetId;
  _snapshot    = snapshot || null;
  _localAccum  = snapshot?.accum ? { ..._snapshot.accum } : _zeroAccum();
  _sessionStart= Date.now();
  _currentActivity = snapshot?.currentActivity || ACTIVITY.DRIVING;

  container.innerHTML = _renderShell();
  _bindEvents(container);
  _render(container);
  _startTicker(container);
}

/**
 * Ingest a fresh compliance snapshot from server sync.
 */
export function updateSnapshot(container, snapshot) {
  _snapshot   = snapshot;
  _localAccum = { ...snapshot.accum };
  _render(container);
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function _renderShell() {
  return `
    <!-- Session header -->
    <div class="card highlight">
      <div class="card-title">Driver Hours</div>
      <div id="tacho-session-info" class="text-sm text-muted">Session active</div>
      <div id="tacho-compliance-status" class="mt-8"></div>
    </div>

    <!-- Current activity -->
    <div class="card">
      <div class="card-title">Current Activity</div>
      <div id="tacho-current-activity" class="text-cyan font-mono" style="font-size:1.1rem;margin-bottom:12px">⏱ DRIVING</div>
      <div class="activity-btn-row">
        <button class="btn btn-secondary activity-btn" data-activity="${ACTIVITY.DRIVING}">🚗 Driving</button>
        <button class="btn btn-amber activity-btn"     data-activity="${ACTIVITY.BREAK}">☕ Break</button>
        <button class="btn btn-secondary activity-btn" data-activity="${ACTIVITY.REST}">💤 Rest</button>
        <button class="btn btn-secondary activity-btn" data-activity="${ACTIVITY.OTHER_WORK}">📋 Other Work</button>
      </div>
    </div>

    <!-- Driving time bars -->
    <div class="card">
      <div class="card-title">Driving Time</div>
      <div style="display:flex;flex-direction:column;gap:14px" id="tacho-bars"></div>
    </div>

    <!-- Live timer -->
    <div class="card">
      <div class="card-title">Continuous Drive Timer</div>
      <div id="tacho-continuous-timer" class="text-cyan font-mono" style="font-size:2rem;text-align:center;letter-spacing:0.1em">00:00</div>
      <div class="text-sm text-muted" style="text-align:center;margin-top:4px">4h 30m limit (EU 561)</div>
      <div class="tacho-bar-track mt-8">
        <div class="tacho-bar-fill" id="tacho-continuous-bar" style="width:0%"></div>
      </div>
    </div>

    <!-- Violations -->
    <div class="card" id="tacho-violations-card">
      <div class="card-title">Compliance Alerts</div>
      <div class="violation-list" id="tacho-violations"></div>
    </div>
  `;
}

function _render(container) {
  if (!container) return;
  const a = _localAccum;

  // Session info
  const infoEl = container.querySelector("#tacho-session-info");
  if (infoEl) {
    const shiftH = (a.shiftMin / 60).toFixed(1);
    const driveH = (a.todayDriveMin / 60).toFixed(1);
    infoEl.innerHTML = `
      Shift: <span class="text-cyan">${shiftH}h</span> &nbsp;·&nbsp;
      Driving today: <span class="text-cyan">${driveH}h</span> &nbsp;·&nbsp;
      Breaks: <span class="text-green">${_fmt(a.breakMin)}</span>
    `;
  }

  // Compliance status
  const statusEl = container.querySelector("#tacho-compliance-status");
  if (statusEl) {
    const violations = _snapshot?.recentViolations || [];
    const hasCrit    = violations.some(v => v.severity === "critical" || v.severity === "serious");
    statusEl.innerHTML = hasCrit
      ? `<div class="text-red font-mono text-sm">⚠ COMPLIANCE ISSUE — see alerts below</div>`
      : `<div class="text-green text-sm">✓ Compliant</div>`;
  }

  // Current activity label
  const actEl = container.querySelector("#tacho-current-activity");
  if (actEl) {
    const icons = { driving: "🚗", break: "☕", rest: "💤", other_work: "📋", available: "⏳" };
    actEl.textContent = `${icons[_currentActivity] || "⏱"} ${_currentActivity.replace(/_/g, " ").toUpperCase()}`;
    actEl.className   = `font-mono ${_currentActivity === ACTIVITY.BREAK || _currentActivity === ACTIVITY.REST ? "text-green" : "text-cyan"}`;
    actEl.style.fontSize = "1.1rem";
  }

  // Activity buttons — highlight active
  container.querySelectorAll(".activity-btn").forEach(btn => {
    btn.classList.toggle("btn-primary", btn.dataset.activity === _currentActivity);
    btn.classList.toggle("btn-secondary",
      btn.dataset.activity !== _currentActivity &&
      btn.dataset.activity !== ACTIVITY.BREAK);
  });

  // Time bars
  const barsEl = container.querySelector("#tacho-bars");
  if (barsEl) {
    const EU_DAILY_STD = 540;
    const EU_DAILY_EXT = 600;
    const EU_WEEKLY    = 3360;
    const EU_CONT      = 270;

    barsEl.innerHTML = [
      _bar("Continuous",    a.continuousDriveMin, EU_CONT,      "4h 30m limit"),
      _bar("Today",         a.todayDriveMin,      EU_DAILY_STD, "9h standard", EU_DAILY_EXT),
      _bar("This Week",     a.weekDriveMin,       EU_WEEKLY,    "56h limit"),
      _bar("Break taken",   a.breakMin,           45,           "45min target", null, true)
    ].join("");
  }

  // Violations
  const violEl  = container.querySelector("#tacho-violations");
  const violCard= container.querySelector("#tacho-violations-card");
  const viols   = _snapshot?.recentViolations || [];
  if (violEl) {
    if (viols.length === 0) {
      violEl.innerHTML = `<div class="text-sm text-muted">No compliance alerts.</div>`;
    } else {
      violEl.innerHTML = viols.map(v => `
        <div class="violation-item ${v.severity}">
          <span>${_violIcon(v.severity)}</span>
          <span>${v.message}</span>
        </div>
      `).join("");
    }
  }
}

function _bar(label, valueMin, maxMin, limitLabel, extMin = null, inverse = false) {
  const pct     = Math.min(100, (valueMin / maxMin) * 100);
  const color   = inverse
    ? (pct >= 100 ? "" : pct > 66 ? "" : "amber")
    : (pct >= 100 ? "red" : pct > 75 ? "amber" : "");
  const extPct  = extMin ? Math.min(100, (valueMin / extMin) * 100) : null;

  return `
    <div class="tacho-bar-wrap">
      <div class="tacho-bar-label">
        <span>${label}</span>
        <span>${_fmt(valueMin)} / ${_fmt(maxMin)}</span>
      </div>
      <div class="tacho-bar-track">
        <div class="tacho-bar-fill ${color}" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <div class="text-sm text-muted">${limitLabel}${extMin ? ` (10h extended: ${_fmt(extMin)})` : ""}</div>
    </div>
  `;
}

// ─── LIVE TIMER ───────────────────────────────────────────────────────────────

function _startTicker(container) {
  _stopTicker();
  let lastTick = Date.now();

  _timerHandle = setInterval(() => {
    const now     = Date.now();
    const elapsed = (now - lastTick) / 60000;
    lastTick      = now;

    // Accumulate locally in real-time
    if (_currentActivity === ACTIVITY.DRIVING) {
      _localAccum.continuousDriveMin += elapsed;
      _localAccum.todayDriveMin      += elapsed;
      _localAccum.weekDriveMin       += elapsed;
      _localAccum.shiftMin           += elapsed;
    } else if (_currentActivity === ACTIVITY.BREAK) {
      _localAccum.breakMin           += elapsed;
      _localAccum.shiftMin           += elapsed;
    } else if (_currentActivity === ACTIVITY.REST) {
      _localAccum.todayRestMin       += elapsed;
    } else {
      _localAccum.shiftMin           += elapsed;
    }

    // Update continuous timer display
    _updateContinuousTimer(container);

    // Full re-render every 30s
    if (Math.round((now - _sessionStart) / 1000) % 30 === 0) _render(container);

  }, 10_000); // tick every 10s
}

function _stopTicker() {
  if (_timerHandle) { clearInterval(_timerHandle); _timerHandle = null; }
}

function _updateContinuousTimer(container) {
  const EU_CONT    = 270;
  const contMin    = _localAccum.continuousDriveMin;
  const pct        = Math.min(100, (contMin / EU_CONT) * 100);

  const timerEl = container.querySelector("#tacho-continuous-timer");
  const barEl   = container.querySelector("#tacho-continuous-bar");

  if (timerEl) {
    const h = Math.floor(contMin / 60);
    const m = Math.floor(contMin % 60);
    timerEl.textContent = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    timerEl.className   = `font-mono ${pct >= 100 ? "text-red" : pct > 75 ? "text-amber" : "text-cyan"}`;
    timerEl.style.fontSize = "2rem";
  }

  if (barEl) {
    barEl.style.width = `${pct.toFixed(1)}%`;
    barEl.className   = `tacho-bar-fill ${pct >= 100 ? "red" : pct > 75 ? "amber" : ""}`;
  }
}

// ─── ACTIVITY CHANGE ─────────────────────────────────────────────────────────

function _bindEvents(container) {
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".activity-btn");
    if (!btn) return;

    const newActivity = btn.dataset.activity;
    if (newActivity === _currentActivity) return;

    // Break resets continuous drive locally
    if (newActivity === ACTIVITY.BREAK || newActivity === ACTIVITY.REST) {
      // Will be reset server-side too — optimistic local reset
      _localAccum.continuousDriveMin = 0;
    }

    _currentActivity = newActivity;
    _render(container);

    // Queue sync to server tachograph-engine
    queueSync("/api/tacho/activity", "POST", {
      driverId:     _driverId,
      fleetId:      _fleetId,
      activityType: newActivity,
      time:         Date.now()
    }).catch(err => console.warn("[Tacho] Activity sync failed:", err.message));
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _zeroAccum() {
  return {
    continuousDriveMin: 0, todayDriveMin: 0, weekDriveMin: 0,
    fortDriveMin: 0, todayRestMin: 0, shiftMin: 0,
    breakMin: 0, extendedDaysUsed: 0, reducedRestDaysUsed: 0
  };
}

function _fmt(min) {
  min = parseFloat(min) || 0;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function _violIcon(severity) {
  return { advisory: "ℹ", minor: "●", serious: "⚠", critical: "🛑" }[severity] || "●";
}
