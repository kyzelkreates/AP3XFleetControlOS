import { useState, useEffect } from "react";
import { idbGet, idbSet } from "../lib/idb.js";

export function useIdentity() {
  const [identity, setIdentity] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    (async () => {
      let id = await idbGet("ap3x_identity");
      if (!id) {
        // Fall back to URL params (deep link from fleet provisioning)
        const p = new URLSearchParams(window.location.search);
        id = {
          driverId:   p.get("driverId")   || "UNBOUND",
          fleetId:    p.get("fleetId")    || "UNKNOWN",
          deviceId:   p.get("deviceId")   || _getOrCreateDeviceId(),
          driverName: p.get("name")       || "Driver",
        };
        await idbSet("ap3x_identity", id);
      }
      setIdentity(id);
      setLoading(false);
    })();
  }, []);

  async function saveIdentity(data) {
    const merged = { ...identity, ...data };
    await idbSet("ap3x_identity", merged);
    setIdentity(merged);
  }

  return { identity, loading, saveIdentity };
}

function _getOrCreateDeviceId() {
  let id = localStorage.getItem("ap3x_device_id");
  if (!id) {
    id = `DEV-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    localStorage.setItem("ap3x_device_id", id);
  }
  return id;
}
