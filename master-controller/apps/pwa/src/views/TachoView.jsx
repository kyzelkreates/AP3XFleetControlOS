import React from "react";

function MinBar({ label, val, max, warn }) {
  const pct = Math.min(100, (val / max) * 100);
  const color = val >= max ? "var(--red)" : warn && val >= warn ? "var(--amber)" : "var(--green)";
  return (
    <div style={{ marginBottom:".6rem" }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:".72rem", marginBottom:".25rem" }}>
        <span style={{ color:"var(--muted)" }}>{label}</span>
        <span style={{ color }}>{Math.round(val)} / {max} min</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width:`${pct}%`, background:color }}></div>
      </div>
    </div>
  );
}

export default function TachoView({
  activity, elapsed, driveMins, contDriveMins, breakMins, restMins,
  warnContinuous, warnDaily, needBreak,
  ACTIVITY, ACTIVITY_LABELS, ACTIVITY_ICONS, switchActivity, fmtElapsed
}) {
  return (
    <div className="view-inner">

      {/* Current activity card */}
      <div className="card highlight" style={{ textAlign:"center", padding:"1.25rem 1rem" }}>
        <div style={{ fontSize:"2.5rem", marginBottom:".25rem" }}>{ACTIVITY_ICONS[activity]}</div>
        <div style={{ fontSize:"1.1rem", fontWeight:700, color:"var(--cyan)", letterSpacing:".05em" }}>
          {ACTIVITY_LABELS[activity]}
        </div>
        <div className="elapsed" style={{ fontFamily:"var(--mono)", fontSize:"2rem", marginTop:".3rem", letterSpacing:".08em" }}>
          {fmtElapsed(elapsed)}
        </div>
      </div>

      {/* Compliance warnings */}
      {needBreak && (
        <div className="alert alert-danger">
          🚨 Mandatory break required — 4h30 continuous driving reached
        </div>
      )}
      {!needBreak && warnContinuous && (
        <div className="alert alert-warn">
          ⚠️ Approaching continuous drive limit — take a break soon
        </div>
      )}
      {warnDaily && (
        <div className="alert alert-warn">
          ⚠️ Daily driving limit approaching (8h)
        </div>
      )}

      {/* Hours bars */}
      <div className="card">
        <div className="card-label">Driver Hours (EU 561)</div>
        <MinBar label="Continuous Drive"  val={contDriveMins} max={270} warn={240} />
        <MinBar label="Daily Drive"       val={driveMins}     max={540} warn={480} />
        <MinBar label="Break Time"        val={breakMins}     max={45}  />
        <MinBar label="Daily Rest"        val={restMins}      max={660} warn={540} />
      </div>

      {/* Activity selector */}
      <div className="card">
        <div className="card-label" style={{ marginBottom:".6rem" }}>Switch Activity</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:".5rem" }}>
          {Object.entries(ACTIVITY).map(([, val]) => (
            <button
              key={val}
              className={`btn ${activity === val ? "btn-primary" : "btn-secondary"} btn-full`}
              onClick={() => switchActivity(val)}
            >
              {ACTIVITY_ICONS[val]} {ACTIVITY_LABELS[val]}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
