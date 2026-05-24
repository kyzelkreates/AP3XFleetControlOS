import { useState, useEffect, useCallback } from "react";
import { idbGet, idbSet } from "../lib/idb.js";
import {
  createNavSession, confirmArrival, skipDrop,
  updatePosition, recalculateETAs, getCurrentDrop, getRemainingDrops
} from "../lib/nav.js";

export function useRoute() {
  const [route,   setRoute]   = useState(null);
  const [session, setSession] = useState(null);

  // Load cached route on mount
  useEffect(() => {
    idbGet("ap3x_route").then(r => {
      if (r) {
        setRoute(r);
        setSession(createNavSession(r));
      }
    });
  }, []);

  // When a fresh route arrives from sync
  const loadRoute = useCallback((r) => {
    setRoute(r);
    idbSet("ap3x_route", r);
    setSession(createNavSession(r));
  }, []);

  const confirmDrop = useCallback(() => {
    setSession(s => confirmArrival(s));
  }, []);

  const skipCurrentDrop = useCallback(() => {
    setSession(s => skipDrop(s));
  }, []);

  const updatePos = useCallback((pos) => {
    setSession(s => {
      if (!s) return s;
      const updated = updatePosition(s, pos);
      return recalculateETAs(updated);
    });
  }, []);

  const currentDrop   = getCurrentDrop(session);
  const remainingDrops = getRemainingDrops(session);

  return {
    route, session, currentDrop, remainingDrops,
    loadRoute, confirmDrop, skipCurrentDrop, updatePos
  };
}
