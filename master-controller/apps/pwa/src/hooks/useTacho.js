import { useState, useEffect, useRef, useCallback } from "react";
import { idbGet, idbSet } from "../lib/idb.js";
import { queueSync } from "../lib/sync.js";

export const ACTIVITY = { DRIVING:"driving", BREAK:"break", REST:"rest", OTHER_WORK:"other_work", POA:"poa" };
const ACTIVITY_LABELS = { driving:"Driving", break:"Break", rest:"Rest", other_work:"Other Work", poa:"POA" };
const ACTIVITY_ICONS  = { driving:"🚗", break:"☕", rest:"🛏", other_work:"📋", poa:"⏳" };

export function useTacho(identity) {
  const [snapshot,    setSnapshot]    = useState(null);
  const [activity,    setActivity]    = useState(ACTIVITY.DRIVING);
  const [elapsed,     setElapsed]     = useState(0);   // seconds on current activity
  const [localDrive,  setLocalDrive]  = useState(0);   // minutes driven this session
  const actStart = useRef(Date.now());
  const ticker   = useRef(null);

  // Load cached compliance snapshot
  useEffect(() => {
    idbGet("ap3x_compliance").then(s => { if (s) setSnapshot(s); });
  }, []);

  // Tick every second for elapsed counter
  useEffect(() => {
    ticker.current = setInterval(() => {
      const secs = Math.floor((Date.now() - actStart.current) / 1000);
      setElapsed(secs);
      if (activity === ACTIVITY.DRIVING) {
        setLocalDrive(Math.floor(secs / 60));
      }
    }, 1000);
    return () => clearInterval(ticker.current);
  }, [activity]);

  const switchActivity = useCallback(async (newActivity) => {
    if (!identity) return;
    const now = Date.now();
    const durationMin = Math.round((now - actStart.current) / 60000);
    // Queue server-side tacho update
    await queueSync("/api/tacho/activity", "POST", {
      driverId:    identity.driverId,
      fleetId:     identity.fleetId,
      activityType: activity,
      durationMin,
      endedAt:     now,
    }, 3);
    actStart.current = now;
    setElapsed(0);
    setActivity(newActivity);
    if (newActivity === ACTIVITY.DRIVING) setLocalDrive(0);
  }, [identity, activity]);

  const ingestSnapshot = useCallback((s) => {
    setSnapshot(s);
    idbSet("ap3x_compliance", s);
  }, []);

  function fmtElapsed(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${String(s).padStart(2,"0")}s` : `${s}s`;
  }

  const driveMins    = (snapshot?.accum?.todayDriveMin || 0) + localDrive;
  const contDriveMins= (snapshot?.accum?.continuousDriveMin || 0) + (activity === ACTIVITY.DRIVING ? localDrive : 0);
  const breakMins    = snapshot?.accum?.breakMin || 0;
  const restMins     = snapshot?.accum?.todayRestMin || 0;

  // EU 561 simple warn thresholds
  const warnContinuous = contDriveMins >= 240; // 4h
  const warnDaily      = driveMins     >= 480; // 8h
  const needBreak      = contDriveMins >= 270; // 4h30 — mandatory break

  return {
    activity, snapshot, elapsed, localDrive,
    driveMins, contDriveMins, breakMins, restMins,
    warnContinuous, warnDaily, needBreak,
    ACTIVITY, ACTIVITY_LABELS, ACTIVITY_ICONS,
    switchActivity, ingestSnapshot, fmtElapsed,
  };
}
