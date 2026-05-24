// AP3X Fleet OS — shared store (reads from same localStorage key as Master Controller)
// Fleet OS is READ/WRITE for operational data — it cannot deploy or provision.

import React, { createContext, useContext, useReducer } from "react";

const STORE_KEY = "ap3x_store_v2";

function defaultStore() {
  return {
    fleets:{}, drivers:{}, vehicles:{}, devices:{}, identities:{},
    assignments:{}, routes:{}, safetyDecisions:{}, hazards:{},
    hazardBroadcasts:{}, tileJobs:{}, tacho:{}, deployments:{},
    syncQueue:{}, syncConflicts:{}, events:[], fleetBrands:{}, bundles:{}, permissions:{}
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...defaultStore(), ...JSON.parse(raw) } : defaultStore();
  } catch { return defaultStore(); }
}

function saveStore(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
}

function emit(store, event) {
  const e = { id: crypto.randomUUID(), timestamp: Date.now(), status:"pending", ...event };
  return { ...store, events: [e, ...store.events].slice(0, 500) };
}

function reducer(state, action) {
  let next = state;
  switch (action.type) {
    case "ASSIGN_DRIVER_TO_VEHICLE": {
      const { vehicleId, driverId, fleetId } = action.payload;
      next = {
        ...state,
        vehicles: { ...state.vehicles, [vehicleId]: { ...state.vehicles[vehicleId], assignedDriverId: driverId, updatedAt: Date.now() } }
      };
      next = emit(next, { type:"vehicle.driver.assigned", fleetId, entityId:vehicleId, payload:{ vehicleId, driverId } });
      break;
    }
    case "UNASSIGN_DRIVER_FROM_VEHICLE": {
      const { vehicleId, fleetId } = action.payload;
      next = {
        ...state,
        vehicles: { ...state.vehicles, [vehicleId]: { ...state.vehicles[vehicleId], assignedDriverId: null, updatedAt: Date.now() } }
      };
      next = emit(next, { type:"vehicle.driver.unassigned", fleetId, entityId:vehicleId, payload:{ vehicleId } });
      break;
    }
    case "ROUTE_ASSIGN_DRIVER": {
      const { routeId, driverId, fleetId } = action.payload;
      next = {
        ...state,
        routes: { ...state.routes, [routeId]: { ...state.routes[routeId], driverId, updatedAt: Date.now() } }
      };
      next = emit(next, { type:"route.driver.assigned", fleetId, entityId:routeId, payload:{ routeId, driverId } });
      break;
    }
    case "ROUTE_STATUS_UPDATE": {
      const { routeId, status, fleetId } = action.payload;
      next = {
        ...state,
        routes: { ...state.routes, [routeId]: { ...state.routes[routeId], status, updatedAt: Date.now() } }
      };
      next = emit(next, { type:`route.${status}`, fleetId, entityId:routeId, payload:{ routeId, status } });
      break;
    }
    case "STORE_SYNC":
      next = { ...defaultStore(), ...action.payload };
      break;
    default:
      return state;
  }
  saveStore(next);
  return next;
}

const Ctx = createContext(null);
export function FleetOSProvider({ children }) {
  const [store, dispatch] = useReducer(reducer, null, loadStore);
  return React.createElement(Ctx.Provider, { value:{ store, dispatch } }, children);
}
export function useFleetOS() { return useContext(Ctx); }

export const sel = {
  fleets:   (s)  => Object.values(s.fleets),
  drivers:  (s, fid) => Object.values(s.drivers).filter(d => !fid || d.fleetId === fid),
  vehicles: (s, fid) => Object.values(s.vehicles).filter(v => !fid || v.fleetId === fid),
  devices:  (s, fid) => Object.values(s.devices).filter(d => !fid || d.fleetId === fid),
  routes:   (s, fid) => Object.values(s.routes).filter(r => !fid || r.fleetId === fid),
  hazards:  (s, fid) => Object.values(s.hazards).filter(h => !fid || h.fleetId === fid),
  identities:(s,fid) => Object.values(s.identities).filter(i => !fid || i.fleetId === fid),
  events:   (s)  => s.events,
};

// Toast (minimal)
let _toastFn = null;
export function _setToast(fn) { _toastFn = fn; }
export function toast(msg, type="info") { _toastFn?.(msg, type); }
