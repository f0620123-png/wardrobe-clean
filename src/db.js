// src/db.js
const DB_NAME = "wardrobe_db";
const STORE_NAME = "images";

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putValue(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getValue(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function delValue(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveFullImage(id, base64) { return putValue(`full:${id}`, base64); }
export async function loadFullImage(id) {
  const v = await getValue(`full:${id}`);
  if (v) return v;
  return (await getValue(id)) || null;
}
export async function saveThumbImage(id, base64) { return putValue(`thumb:${id}`, base64); }
export async function loadThumbImage(id) { return (await getValue(`thumb:${id}`)) || null; }
export async function deleteItemImages(id) {
  await Promise.allSettled([delValue(`full:${id}`), delValue(`thumb:${id}`), delValue(id)]);
}

export async function saveNoteImage(noteId, base64) { return putValue(`note:${noteId}`, base64); }
export async function loadNoteImage(noteId) { return (await getValue(`note:${noteId}`)) || null; }
export async function deleteNoteImage(noteId) { return delValue(`note:${noteId}`); }

// backward alias for older imports (safe)
export async function deleteFullImage(id) { return deleteItemImages(id); }
