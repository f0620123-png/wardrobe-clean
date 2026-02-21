// src/db.js
const DB_NAME = "wardrobe_db";
const STORE_NAME = "images";

// Open or create IndexedDB
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

// Low-level helpers
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

// =====================================================
// Clothing images (2 versions)
// Keys: "full:<id>" , "thumb:<id>"
// =====================================================
export async function saveFullImage(id, base64) {
  return putValue(`full:${id}`, base64);
}

export async function loadFullImage(id) {
  const v = await getValue(`full:${id}`);
  if (v) return v;

  // Backward compat (old versions stored full image with key = id)
  const old = await getValue(id);
  return old || null;
}

export async function saveThumbImage(id, base64) {
  return putValue(`thumb:${id}`, base64);
}

export async function loadThumbImage(id) {
  const v = await getValue(`thumb:${id}`);
  return v || null;
}

export async function deleteItemImages(id) {
  await Promise.allSettled([delValue(`full:${id}`), delValue(`thumb:${id}`), delValue(id)]);
}

// =====================================================
// Notes images
// Key: "note:<noteId>"
// =====================================================
export async function saveNoteImage(noteId, base64) {
  return putValue(`note:${noteId}`, base64);
}

export async function loadNoteImage(noteId) {
  const v = await getValue(`note:${noteId}`);
  return v || null;
}

export async function deleteNoteImage(noteId) {
  await delValue(`note:${noteId}`);
}