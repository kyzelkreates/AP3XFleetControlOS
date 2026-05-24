// AP3X Hazard Reporter — RUN 9
// Driver-side hazard display + reporting.
// Reads active hazards from local store. Submits new reports to sync queue.
// Works fully offline — queued reports replay via sw.js background sync.
// NO routing changes. NO map rendering.

import { HAZARD_TYPE, HAZARD_SEVERITY, HAZARD_SOURCE } from "../../core/hazards/hazard-constants.js";
import { queueSync } from "./sync-agent.js";

// ─── HAZARD ICONS ─────────────────────────────────────────────────────────────
const HAZARD_ICONS = {
  road_closed:          "🚫",
  road_flooded:         "🌊",
  road_icy:             "🧊",
  pothole:              "⚠️",
  debris:               "🪨",
  bridge_closed:        "🌉",
  bridge_height_warning:"⬆️",
  accident:             "💥",
  congestion:           "🚗",
  roadworks:            "🚧",
  lane_closure:         "🔶",
  fog:                  "🌫️",
  high_wind:            "💨",
  flooding:             "🌧️",
  black_ice:            "❄️",
  police_incident:      "🚔",
  fuel_spillage:        "⛽",
  load_spillage:        "📦",
  other:                "❗"
};

// ─── MODULE STATE ─────────────────────────────────────────────────────────────
let _hazards  = [];       // active hazards from local store / broadcast
let _driverId = null;
let _fleetId  = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────

export function initHazardReporter(container, { driverId, fleetId }) {
  _driverId = driverId;
  _fleetId  = fleetId;

  container.innerHTML = _renderShell();
  _bindEvents(container);
  _renderList(container);

  // Listen for broadcast hazards from sw push
  window.addEventListener("ap3x:hazard", (e) => {
    _ingestHazard(e.detail);
    _renderList(container);
  });
}

// ─── INGEST BROADCAST ────────────────────────────────────────────────────────

/**
 * Called by app.js when a hazard.broadcast payload arrives (push or sync).
 */
export function ingestHazardBroadcast(broadcast) {
  if (!broadcast?.hazardSnapshot) return;
  const h = {
    id:          broadcast.hazardId,
    fleetId:     broadcast.fleetId,
    broadcastId: broadcast.id,
    ...broadcast.hazardSnapshot,
    receivedAt:  Date.now()
  };
  _ingestHazard(h);
}

function _ingestHazard(h) {
  const exists = _hazards.findIndex(x => x.id === h.id);
  if (exists >= 0) _hazards[exists] = h;
  else             _hazards.unshift(h);

  // Expire old hazards
  const now = Date.now();
  _hazards  = _hazards.filter(x => !x.expiresAt || x.expiresAt > now);

  window.dispatchEvent(new CustomEvent("ap3x:hazardlist", { detail: { count: _hazards.length } }));
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function _renderShell() {
  const typeOptions = Object.values(HAZARD_TYPE)
    .map(t => `<option value="${t}">${t.replace(/_/g, " ")}</option>`)
    .join("");

  return `
    <!-- Active hazards from fleet -->
    <div class="card" id="hz-list-card">
      <div class="flex-between">
        <span class="card-title" style="margin-bottom:0">Active Hazards</span>
        <span id="hz-count" class="text-sm text-muted">0</span>
      </div>
      <div id="hz-list" class="hazard-list mt-8"></div>
    </div>

    <!-- Report new hazard -->
    <div class="card">
      <div class="card-title">Report Hazard</div>
      <form id="hz-form" style="display:flex;flex-direction:column;gap:12px">

        <div class="field">
          <label>Type</label>
          <select id="hz-type" name="type" required>
            <option value="">Select type…</option>
            ${typeOptions}
          </select>
        </div>

        <div class="field">
          <label>Severity</label>
          <select id="hz-severity" name="severity">
            <option value="">Auto (from type)</option>
            <option value="low">Low — advisory</option>
            <option value="medium">Medium — caution</option>
            <option value="high">High — avoid</option>
            <option value="critical">Critical — do not pass</option>
          </select>
        </div>

        <div class="field">
          <label>Description (optional)</label>
          <textarea id="hz-desc" name="description" placeholder="Add detail…" maxlength="500"></textarea>
        </div>

        <div class="flex gap-8">
          <div class="field" style="flex:1">
            <label>Lat</label>
            <input type="number" id="hz-lat" name="lat" step="0.000001" placeholder="Auto" />
          </div>
          <div class="field" style="flex:1">
            <label>Lon</label>
            <input type="number" id="hz-lon" name="lon" step="0.000001" placeholder="Auto" />
          </div>
        </div>

        <button type="button" class="btn btn-secondary btn-sm" id="hz-btn-locate">📍 Use My Location</button>

        <div id="hz-status" class="text-sm text-muted hidden"></div>

        <button type="submit" class="btn btn-primary btn-full">⚠ Submit Hazard Report</button>
      </form>
    </div>
  `;
}

function _renderList(container) {
  const list    = container.querySelector("#hz-list");
  const countEl = container.querySelector("#hz-count");
  if (!list) return;

  const active = _hazards.filter(h => !h.resolvedAt);
  if (countEl) countEl.textContent = active.length;

  if (active.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding:24px">
        <div class="empty-icon">✅</div>
        <p>No active hazards on your route.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = active.map(h => _renderHazardItem(h)).join("");
}

function _renderHazardItem(h) {
  const icon = HAZARD_ICONS[h.type] || "❗";
  const age  = _fmtAge(h.receivedAt || h.reportedAt);
  const exp  = h.expiresAt ? `Expires ${_fmtTime(h.expiresAt)}` : "";

  return `
    <div class="hazard-item ${h.severity || "medium"}" data-hazard-id="${h.id}">
      <div class="hazard-icon">${icon}</div>
      <div class="hazard-body">
        <div class="hazard-type">${(h.type || "").replace(/_/g, " ")}</div>
        <div class="hazard-meta">${h.severity || ""} · ${age}${exp ? " · " + exp : ""}</div>
        ${h.description ? `<div class="hazard-desc">${h.description}</div>` : ""}
        <div class="hazard-actions">
          <button class="btn btn-sm btn-secondary hz-confirm-btn" data-id="${h.id}">✓ Still there</button>
          <button class="btn btn-sm btn-danger hz-dispute-btn" data-id="${h.id}">✗ Gone</button>
        </div>
      </div>
    </div>
  `;
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────

function _bindEvents(container) {
  // Locate button
  container.addEventListener("click", (e) => {
    if (e.target.id === "hz-btn-locate") _fillLocation(container);

    // Confirm hazard still present
    if (e.target.classList.contains("hz-confirm-btn")) {
      const id = e.target.dataset.id;
      _submitCorroboration(id, "confirm");
    }

    // Dispute hazard (gone)
    if (e.target.classList.contains("hz-dispute-btn")) {
      const id = e.target.dataset.id;
      _submitCorroboration(id, "dispute");
    }
  });

  // Form submit
  const form = container.querySelector("#hz-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await _submitReport(container, form);
    });
  }
}

async function _fillLocation(container) {
  const btn = container.querySelector("#hz-btn-locate");
  btn.textContent = "Locating…";
  btn.disabled    = true;

  try {
    const pos = await _getPosition();
    const latEl = container.querySelector("#hz-lat");
    const lonEl = container.querySelector("#hz-lon");
    if (latEl) latEl.value = pos.coords.latitude.toFixed(6);
    if (lonEl) lonEl.value = pos.coords.longitude.toFixed(6);
    btn.textContent = "✓ Location set";
  } catch {
    btn.textContent = "📍 Use My Location";
    _showStatus(container, "Location unavailable — enter coordinates manually.", "amber");
  } finally {
    btn.disabled = false;
  }
}

async function _submitReport(container, form) {
  const status = container.querySelector("#hz-status");
  const type   = form.querySelector("#hz-type").value;
  const lat    = parseFloat(form.querySelector("#hz-lat").value);
  const lon    = parseFloat(form.querySelector("#hz-lon").value);

  if (!type)               { _showStatus(container, "Select a hazard type.", "red"); return; }
  if (isNaN(lat) || isNaN(lon)) {
    _showStatus(container, "Location required — tap 'Use My Location' or enter coordinates.", "red");
    return;
  }

  const payload = {
    type,
    severity:            form.querySelector("#hz-severity").value || undefined,
    description:         form.querySelector("#hz-desc").value     || undefined,
    lat,
    lon,
    source:              HAZARD_SOURCE.DRIVER,
    reportedByDriverId:  _driverId,
    fleetId:             _fleetId,
    submittedAt:         Date.now()
  };

  const submitBtn = form.querySelector("[type=submit]");
  submitBtn.disabled    = true;
  submitBtn.textContent = "Submitting…";

  try {
    await queueSync("/api/hazard/report", "POST", { fleetId: _fleetId, report: payload });
    _showStatus(container, "✓ Hazard reported — will sync when online.", "green");
    form.reset();
    submitBtn.textContent = "⚠ Submit Hazard Report";
  } catch (err) {
    _showStatus(container, `Failed: ${err.message}`, "red");
    submitBtn.textContent = "⚠ Submit Hazard Report";
  } finally {
    submitBtn.disabled = false;
  }
}

async function _submitCorroboration(hazardId, action) {
  await queueSync(`/api/hazard/${action}`, "POST", {
    fleetId:  _fleetId,
    hazardId,
    driverId: _driverId,
    action
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _showStatus(container, msg, color = "muted") {
  const el = container.querySelector("#hz-status");
  if (!el) return;
  el.textContent  = msg;
  el.className    = `text-sm text-${color}`;
  el.classList.remove("hidden");
}

function _getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocation not available")); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 8000, maximumAge: 10000
    });
  });
}

function _fmtAge(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}min ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function _fmtTime(ms) {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
