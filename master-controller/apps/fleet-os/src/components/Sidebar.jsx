import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useFleetOS, sel } from "../lib/store.js";

const NAV = [
  { section:"Operations" },
  { to:"/",        icon:"◈",  label:"Live Fleet"    },
  { to:"/assign",  icon:"🔗", label:"Assignments"   },
  { to:"/routes",  icon:"🗺️", label:"Route Mgmt"    },
  { section:"Intelligence" },
  { to:"/hazards", icon:"⚠️", label:"Hazards"       },
  { to:"/events",  icon:"📡", label:"Event Stream"  },
];

export default function Sidebar({ activeFleet, onFleetChange }) {
  const { store } = useFleetOS();
  const fleets = sel.fleets(store);
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">⬡</div>
        <div>
          <div className="logo-name">AP3X</div>
          <div className="logo-sub">FLEET OS</div>
        </div>
      </div>
      <div style={{ padding:".65rem .85rem", borderBottom:"1px solid var(--border)" }}>
        <div className="label" style={{ marginBottom:".35rem" }}>Active Fleet</div>
        <select className="select" value={activeFleet} onChange={e => onFleetChange(e.target.value)} style={{ fontSize:".78rem", padding:".38rem .6rem" }}>
          <option value="">— All Fleets —</option>
          {fleets.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <div className="sidebar-nav">
        {NAV.map((item,i) =>
          item.section
            ? <div key={i} className="nav-section">{item.section}</div>
            : <NavLink key={item.to} to={item.to} end={item.to==="/"} className={({isActive}) => `nav-item${isActive?" active":""}`}>
                <span className="nav-icon">{item.icon}</span>{item.label}
              </NavLink>
        )}
      </div>
      <div className="sidebar-footer">
        <span className="pulse-dot"></span>Runtime Plane · Operations
      </div>
    </nav>
  );
}
