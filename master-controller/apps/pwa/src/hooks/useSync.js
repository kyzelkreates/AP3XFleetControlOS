import { useState, useEffect, useCallback } from "react";
import { startSyncAgent, stopSyncAgent, getSyncStatus, onSyncEvent, drainQueue } from "../lib/sync.js";

export function useSync(identity) {
  const [status, setStatus] = useState({ pending: 0, online: navigator.onLine });
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!identity) return;
    startSyncAgent(identity);

    onSyncEvent((type, data) => {
      setEvents(p => [{ type, data, ts: Date.now() }, ...p].slice(0, 50));
      if (type === "drained" || type === "queued") {
        getSyncStatus().then(setStatus);
      }
    });

    const tick = setInterval(() => getSyncStatus().then(setStatus), 5000);
    window.addEventListener("online",  () => setStatus(s => ({ ...s, online:true  })));
    window.addEventListener("offline", () => setStatus(s => ({ ...s, online:false })));

    return () => {
      stopSyncAgent();
      clearInterval(tick);
    };
  }, [identity]);

  const flush = useCallback(() => drainQueue(), []);

  return { status, events, flush };
}
