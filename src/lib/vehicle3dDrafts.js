// Browser-only staging storage. Files never leave the device in Phase 1.
// Supabase-backed uploads and server-side reconstruction require a separate
// authenticated implementation and company-scoped storage policies.
const DB_NAME = "transittrack-vehicle-3d-drafts";
const STORE = "assets";
const KEY = (vehicleId, kind, id) => [String(vehicleId), kind, id].join(":");

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Offline storage is unavailable on this device."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local photo storage."));
  });
}

async function transact(mode, callback) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = callback(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not save scan."));
      tx.onerror = () => reject(tx.error || new Error("Storage transaction failed."));
    });
  } finally {
    db.close();
  }
}

export async function putAsset(vehicleId, kind, id, value) {
  return transact("readwrite", (store) => store.put(value, KEY(vehicleId, kind, id)));
}
export async function getAsset(vehicleId, kind, id) {
  return transact("readonly", (store) => store.get(KEY(vehicleId, kind, id)));
}
export async function deleteAsset(vehicleId, kind, id) {
  return transact("readwrite", (store) => store.delete(KEY(vehicleId, kind, id)));
}
export async function listPhotos(vehicleId) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const prefix = KEY(vehicleId, "photo", "");
      const result = [];
      const request = tx.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(result.sort((a, b) => a.createdAt - b.createdAt));
        if (String(cursor.key).startsWith(prefix)) result.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
