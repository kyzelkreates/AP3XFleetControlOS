import React, { useState } from "react";

const ICONS = {
  road_closed:"🚫", road_flooded:"🌊", road_icy:"🧊", pothole:"⚠️", debris:"🪨",
  accident:"💥", congestion:"🚗", roadworks:"🚧", fog:"🌫️", high_wind:"💨",
  flooding:"🌧️", black_ice:"❄️", police_incident:"🚔", fuel_spillage:"⛽",
  load_spillage:"📦", other:"❗"
};
const SEV_COLOR = { critical:"var(--red)", high:"var(--amber)", medium:"#94a3b8", low:"var(--muted)" };

export default function HazardView({ hazards, activeHazards, HAZARD_TYPES, reportHazard, confirmHazard, disputeHazard, position }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]   = useState({ type:"pothole", severity:"medium", description:"" });
  const [posting, setPosting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!position && !form.lat) { alert("No GPS position — cannot report hazard without location."); return; }
    setPosting(true);
    try {
      await reportHazard({
        type:        form.type,
        severity:    form.severity,
        description: form.description,
        lat:         position?.lat  ?? parseFloat(form.lat),
        lon:         position?.lon  ?? parseFloat(form.lon),
      });
      setSuccess(true);
      setShowForm(false);
      setForm({ type:"pothole", severity:"medium", description:"" });
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="view-inner">

      {/* Summary */}
      <div className="card highlight">
        <div className="card-row">
          <div><div className="card-label">Active</div>
            <div className="card-val" style={{ color: activeHazards.length > 0 ? "var(--amber)" : "var(--green)" }}>{activeHazards.length}</div></div>
          <div><div className="card-label">Critical</div>
            <div className="card-val" style={{ color:"var(--red)" }}>{activeHazards.filter(h=>h.severity==="critical").length}</div></div>
          <div><div className="card-label">Total</div><div className="card-val">{hazards.length}</div></div>
        </div>
      </div>

      {success && (
        <div className="alert alert-success">✅ Hazard reported — queued for sync</div>
      )}

      {/* Report button */}
      <button className="btn btn-primary btn-full" style={{ marginBottom:".75rem" }} onClick={() => setShowForm(p => !p)}>
        {showForm ? "✕ Cancel" : "⚠️ Report Hazard"}
      </button>

      {/* Report form */}
      {showForm && (
        <form className="card" onSubmit={submit} style={{ marginBottom:".75rem" }}>
          <div className="card-label" style={{ marginBottom:".65rem" }}>New Hazard Report</div>
          <div className="form-group">
            <label className="form-label">Hazard Type</label>
            <select className="form-select" value={form.type} onChange={e => setForm(p=>({...p,type:e.target.value}))}>
              {HAZARD_TYPES.map(t => <option key={t} value={t}>{ICONS[t]||"❗"} {t.replace(/_/g," ")}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Severity</label>
            <select className="form-select" value={form.severity} onChange={e => setForm(p=>({...p,severity:e.target.value}))}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          {!position && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Latitude</label>
                <input className="form-input" type="number" step="any" placeholder="51.5074"
                  value={form.lat||""} onChange={e=>setForm(p=>({...p,lat:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Longitude</label>
                <input className="form-input" type="number" step="any" placeholder="-0.1278"
                  value={form.lon||""} onChange={e=>setForm(p=>({...p,lon:e.target.value}))} />
              </div>
            </div>
          )}
          {position && (
            <div className="form-group">
              <div className="form-label">Location (GPS)</div>
              <div className="form-static">{position.lat?.toFixed(5)}, {position.lon?.toFixed(5)}</div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={2} placeholder="Optional detail…"
              value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={posting}>
            {posting ? "Submitting…" : "Submit Report"}
          </button>
        </form>
      )}

      {/* Active hazard list */}
      {activeHazards.length === 0 && !showForm && (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <div className="empty-title">No Active Hazards</div>
          <div className="empty-sub">Your route is clear.</div>
        </div>
      )}
      {activeHazards.map(h => (
        <div key={h.id} className="card" style={{ borderLeft:`3px solid ${SEV_COLOR[h.severity]||"var(--muted)"}`, marginBottom:".5rem" }}>
          <div className="flex-between" style={{ marginBottom:".4rem" }}>
            <span style={{ fontWeight:700 }}>{ICONS[h.type]||"❗"} {h.type?.replace(/_/g," ")}</span>
            <span className={`badge badge-${h.severity}`}>{h.severity}</span>
          </div>
          <div style={{ fontSize:".75rem", color:"var(--muted)", marginBottom:".5rem" }}>
            📍 {h.lat?.toFixed(4)}, {h.lon?.toFixed(4)} &nbsp;·&nbsp; ✅ {h.confirmations} &nbsp;·&nbsp; ❌ {h.rejections}
          </div>
          {h.description && <div style={{ fontSize:".8rem", marginBottom:".5rem" }}>{h.description}</div>}
          <div style={{ display:"flex", gap:".5rem" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => confirmHazard(h.id)}>✅ Confirm</button>
            <button className="btn btn-secondary btn-sm" onClick={() => disputeHazard(h.id)}>❌ Dispute</button>
          </div>
        </div>
      ))}
    </div>
  );
}
