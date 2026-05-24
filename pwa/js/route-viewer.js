// AP3X Route Viewer — RUN 9
// Renders the route execution view from a route object.
// Manages drop list, ETA display, progress, and tile readiness indicator.
// NO map rendering. NO routing creation. Read-only display + nav controls.

import {
  startNavigation, confirmDropArrival, skipDrop,
  recalculateETAs, checkTileReadiness, prefetchRouteCorridorBackground,
  getNavState, getCurrentDrop, getRemainingDrops,
  isNavActive, pauseNavigation, resumeNavigation, endNavigation,
  NAV_STATUS
} from "./offline-nav.js";

// ─── MODULE STATE ─────────────────────────────────────────────────────────────
let _route        = null;
let _refreshTimer = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────

export function initRouteViewer(container) {
  container.innerHTML = _renderShell();
  _bindStaticEvents(container);

  // Listen for nav events
  window.addEventListener("ap3x:nav", (e) => _handleNavEvent(e.detail, container));

  // Initial render
  _renderNoRoute(container);
}

/**
 * Load a route into the viewer and start navigation.
 * Called from app.js when a route is synced from the control plane.
 */
export function loadRoute(route, container) {
  _route = route;
  const nav = startNavigation(route);
  _render(container, nav);
  _startRefreshLoop(container);

  // Background tile prefetch
  checkTileReadiness(route).then(({ ready }) => {
    if (!ready) prefetchRouteCorridorBackground(route);
    _updateTileStatus(container, ready);
  });
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function _renderShell() {
  return `
    <div class="card highlight" id="rv-summary">
      <div class="card-title">Active Route</div>
      <div id="rv-summary-body" class="text-muted text-sm">No route loaded</div>
    </div>

    <div class="card" id="rv-tile-status" style="display:none">
      <div class="flex-between">
        <span class="text-sm text-muted">📦 Offline Tiles</span>
        <span id="rv-tile-label" class="text-sm text-amber">Checking…</span>
      </div>
      <div class="tacho-bar-track mt-4">
        <div class="tacho-bar-fill" id="rv-tile-bar" style="width:0%"></div>
      </div>
    </div>

    <div class="card" id="rv-drops-card" style="display:none">
      <div class="card-title">Drop Sequence</div>
      <div class="drop-list" id="rv-drop-list"></div>
    </div>

    <div id="rv-controls" style="display:none">
      <button class="btn btn-primary btn-full" id="rv-btn-arrived">✓ Mark Arrived</button>
      <div style="height:8px"></div>
      <div class="flex gap-8">
        <button class="btn btn-secondary" style="flex:1" id="rv-btn-pause">⏸ Pause</button>
        <button class="btn btn-danger" style="flex:1" id="rv-btn-end">■ End Route</button>
      </div>
    </div>
  `;
}

function _render(container, nav) {
  if (!nav || !_route) { _renderNoRoute(container); return; }

  // Summary
  const summaryEl = container.querySelector("#rv-summary-body");
  if (summaryEl) {
    const remaining = getRemainingDrops().length;
    const prog      = nav.drops.filter(d => d.done).length;
    summaryEl.innerHTML = `
      <div class="kpi-row mt-4">
        <div class="kpi"><div class="kpi-value">${nav.drops.length}</div><div class="kpi-label">Drops</div></div>
        <div class="kpi green"><div class="kpi-value">${prog}</div><div class="kpi-label">Done</div></div>
        <div class="kpi"><div class="kpi-value">${remaining}</div><div class="kpi-label">Left</div></div>
      </div>
      <div class="text-sm text-muted mt-8">
        ${_route.summary?.distanceKm || "—"}km · ${_fmtMin(_route.summary?.durationMin)} · via ${nav.drops[0]?.label || "—"}
      </div>
      ${nav.status === NAV_STATUS.COMPLETE ? '<div class="text-green mt-8 font-mono">✓ ROUTE COMPLETE</div>' : ''}
    `;
  }

  // Drop list
  const dropsCard = container.querySelector("#rv-drops-card");
  const dropList  = container.querySelector("#rv-drop-list");
  if (dropsCard && dropList) {
    dropsCard.style.display = "";
    dropList.innerHTML = nav.drops.map((d, i) => _renderDrop(d, i, nav.drops.length)).join("");
  }

  // Controls
  const ctrl = container.querySelector("#rv-controls");
  if (ctrl) {
    ctrl.style.display = nav.status === NAV_STATUS.COMPLETE ? "none" : "";
    const pauseBtn = ctrl.querySelector("#rv-btn-pause");
    if (pauseBtn) pauseBtn.textContent = nav.status === NAV_STATUS.PAUSED ? "▶ Resume" : "⏸ Pause";
  }

  // Tile status
  const tileCard = container.querySelector("#rv-tile-status");
  if (tileCard) tileCard.style.display = "";
}

function _renderDrop(drop, i, total) {
  const isLast  = i === total - 1;
  const status  = drop.done ? "done" : drop.active ? "active" : "pending";
  const badge   = drop.done ? "badge-done" : drop.active ? "badge-active" : "badge-pending";
  const label   = drop.done ? "Done" : drop.active ? "Current" : "Pending";
  const eta     = drop.etaMs
    ? `ETA ${_fmtTime(drop.etaMs)}`
    : drop.estimatedArrival
    ? `ETA ${_fmtTime(drop.estimatedArrival)}`
    : "";
  const arrived = drop.arrivedAt ? `Arrived ${_fmtTime(drop.arrivedAt)}` : "";

  return `
    <div class="drop-item animate-in">
      <div class="drop-connector">
        <div class="drop-dot ${status}"></div>
        ${!isLast ? '<div class="drop-line"></div>' : ''}
      </div>
      <div class="drop-content">
        <div class="drop-label">${drop.label || `Stop ${i + 1}`}</div>
        ${eta     ? `<div class="drop-eta">${eta}</div>` : ""}
        ${arrived ? `<div class="drop-eta text-green">${arrived}</div>` : ""}
        ${drop.notes ? `<div class="drop-notes">${drop.notes}</div>` : ""}
      </div>
      <span class="drop-status-badge ${badge}">${drop.skipped ? "Skipped" : label}</span>
    </div>
  `;
}

function _renderNoRoute(container) {
  const body = container.querySelector("#rv-summary-body");
  if (body) body.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🗺️</div>
      <p>No active route. Your fleet controller will assign one.</p>
    </div>
  `;
}

function _updateTileStatus(container, ready) {
  const label = container.querySelector("#rv-tile-label");
  const bar   = container.querySelector("#rv-tile-bar");
  if (!label || !bar) return;

  if (ready) {
    label.textContent  = "Ready offline";
    label.className    = "text-sm text-green";
    bar.style.width    = "100%";
    bar.className      = "tacho-bar-fill";
  } else {
    label.textContent  = "Downloading…";
    label.className    = "text-sm text-amber";
    bar.style.width    = "40%";
    bar.className      = "tacho-bar-fill amber";
  }
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────

function _bindStaticEvents(container) {
  container.addEventListener("click", (e) => {
    const nav = getNavState();
    if (!nav) return;

    if (e.target.id === "rv-btn-arrived") {
      const updated = confirmDropArrival();
      _render(container, updated);
    }
    if (e.target.id === "rv-btn-pause") {
      if (nav.status === NAV_STATUS.PAUSED) resumeNavigation();
      else pauseNavigation();
      _render(container, getNavState());
    }
    if (e.target.id === "rv-btn-end") {
      if (confirm("End route? This cannot be undone.")) {
        const final = endNavigation();
        _stopRefreshLoop();
        _render(container, final);
      }
    }
  });
}

function _handleNavEvent(event, container) {
  const nav = getNavState();
  if (nav) _render(container, nav);
}

// ─── AUTO-REFRESH ─────────────────────────────────────────────────────────────
// Re-renders ETA every 60s while nav is active

function _startRefreshLoop(container) {
  _stopRefreshLoop();
  _refreshTimer = setInterval(() => {
    const nav = getNavState();
    if (!nav || nav.status === NAV_STATUS.COMPLETE) { _stopRefreshLoop(); return; }
    if (nav.lastPosition) {
      recalculateETAs(nav.lastPosition.lat, nav.lastPosition.lon);
    }
    _render(container, nav);
  }, 60_000);
}

function _stopRefreshLoop() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────

function _fmtTime(ms) {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function _fmtMin(min) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}
