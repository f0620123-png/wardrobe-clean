const KEY = "wc_v16_db";
const SCHEMA = 1;

export function uid(prefix="id"){
  const s = Math.random().toString(16).slice(2) + Date.now().toString(16);
  return `${prefix}_${s}`;
}

export function loadDb(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return initDb();
    const db = JSON.parse(raw);
    if(!db || !db.schema) return initDb();
    if(db.schema !== SCHEMA) return migrate(db);
    return db;
  }catch{
    return initDb();
  }
}

export function saveDb(db){
  localStorage.setItem(KEY, JSON.stringify(db));
  return db;
}

export function resetDb(){
  localStorage.removeItem(KEY);
  return initDb();
}

function initDb(){
  const db = {
    schema: SCHEMA,
    profile: { height: 175, weight: 70, shape: "H型" },
    settings: { location: "全部", category: "全部" },
    items: [],
    outfits: [],
    notes: { inspiration: [], lessons: [] },
    lastAi: { vision: null, stylist: null }
  };
  saveDb(db);
  return db;
}

function migrate(db){
  db.schema = SCHEMA;
  saveDb(db);
  return db;
}

export function addItem(db, item){
  db.items.unshift(item);
  return saveDb(db);
}
export function updateItem(db, id, patch){
  db.items = db.items.map(it => it.id===id ? {...it, ...patch} : it);
  return saveDb(db);
}
export function removeItem(db, id){
  db.items = db.items.filter(it => it.id!==id);
  db.outfits = db.outfits.map(o => ({...o, itemIds: o.itemIds.filter(x => x!==id)}));
  return saveDb(db);
}
export function moveItem(db, id, location){
  return updateItem(db, id, { location });
}
export function addOutfit(db, outfit){
  db.outfits.unshift(outfit);
  return saveDb(db);
}
export function removeOutfit(db, id){
  db.outfits = db.outfits.filter(o => o.id!==id);
  return saveDb(db);
}
export function addNote(db, mode, note){
  const key = mode === "lessons" ? "lessons" : "inspiration";
  db.notes[key].unshift(note);
  return saveDb(db);
}
export function removeNote(db, mode, id){
  const key = mode === "lessons" ? "lessons" : "inspiration";
  db.notes[key] = db.notes[key].filter(n => n.id!==id);
  return saveDb(db);
}
