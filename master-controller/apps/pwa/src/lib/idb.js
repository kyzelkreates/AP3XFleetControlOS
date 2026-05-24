// AP3X PWA v2 — IndexedDB helper
// Lightweight wrapper for ap3x_local store.
// Stores: identity, route, compliance, hazards, sync_queue, tile_meta

const DB_NAME    = "ap3x_driver_v2";
const DB_VERSION = 1;

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("kv"))
        db.createObjectStore("kv", { keyPath: "k" });
      if (!db.objectStoreNames.contains("sync_queue"))
        db.createObjectStore("sync_queue", { keyPath: "id" });
      if (!db.objectStoreNames.contains("tiles"))
        db.createObjectStore("tiles", { keyPath: "key" });
    };
    req.onsuccess  = e => { _db = e.target.result; resolve(_db); };
    req.onerror    = e => reject(e.target.error);
  });
}

export async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = e => resolve(e.target.result?.v ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("kv", "readwrite");
    const req = tx.objectStore("kv").put({ k: key, v: value });
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

export async function queuePush(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("sync_queue", "readwrite");
    const req = tx.objectStore("sync_queue").put({ id: crypto.randomUUID(), queuedAt: Date.now(), retries: 0, ...item });
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

export async function queueGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("sync_queue", "readonly");
    const req = tx.objectStore("sync_queue").getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function queueDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("sync_queue", "readwrite");
    const req = tx.objectStore("sync_queue").delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// Tile cache (offline map tiles)
export async function tilePut(key, blob, meta) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("tiles", "readwrite");
    const req = tx.objectStore("tiles").put({ key, blob, meta, cachedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

export async function tileGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("tiles", "readonly");
    const req = tx.objectStore("tiles").get(key);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}
