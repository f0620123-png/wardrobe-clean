import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveFullImage, loadFullImage, saveThumbImage, loadThumbImage, deleteItemImages, saveNoteImage, loadNoteImage, deleteNoteImage } from './db';

/**
 * ===========
 * LocalStorage Keys & Helpers
 * ===========
 */
const K = {
  CLOSET: "wg_closet",
  PROFILE: "wg_profile",
  FAVORITES: "wg_favorites",
  NOTES: "wg_notes",
  TIMELINE: "wg_timeline",
  STYLE_MEMORY: "wg_style_memory",
  GEMINI_KEY: "wg_gemini_key"
};

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// 優化：LocalStorage 防爆機制
function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.error("LocalStorage 已滿，請刪除部分舊資料或圖片。");
      alert("儲存空間已滿！請清理部分衣物或教材，否則新資料將無法存檔。");
    }
  }
}

function fmtDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


const CITY_COORDS = {
  "台北": { lat: 25.0330, lon: 121.5654 },
  "新竹": { lat: 24.8138, lon: 120.9675 }
};

function nearestSupportedCity(lat, lon) {
  const entries = Object.entries(CITY_COORDS);
  let best = entries[0][0];
  let bestD = Infinity;
  for (const [city, c] of entries) {
    const d = (lat - c.lat) ** 2 + (lon - c.lon) ** 2;
    if (d < bestD) { bestD = d; best = city; }
  }
  return best;
}

function weatherCodeMeta(code, tempC) {
  if (tempC != null && Number(tempC) >= 30) return { icon: "🥵", label: "炎熱" };
  if (tempC != null && Number(tempC) <= 14) return { icon: "🥶", label: "偏冷" };
  if ([0].includes(code)) return { icon: "☀️", label: "晴" };
  if ([1,2].includes(code)) return { icon: "⛅", label: "多雲" };
  if ([3,45,48].includes(code)) return { icon: "☁️", label: "陰" };
  if ([51,53,55,56,57].includes(code)) return { icon: "🌦️", label: "毛雨" };
  if ([61,63,65,66,67,80,81,82].includes(code)) return { icon: "🌧️", label: "雨" };
  if ([71,73,75,77,85,86].includes(code)) return { icon: "❄️", label: "雪" };
  if ([95,96,99].includes(code)) return { icon: "⛈️", label: "雷雨" };
  return { icon: "🌤️", label: "天氣" };
}

/**
 * ===========
 * Image compression (優化版：保護 LocalStorage)
 * ===========
 */
// 圖片壓縮工具：將圖片縮小以產生輕量縮圖或傳給 AI 用的高畫質圖
function compressImage(base64Str, maxWidth = 300, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = maxWidth / img.width;
      if (scale >= 1) return resolve(base64Str); // 若圖片已經很小就不處理
      
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = base64Str;
  });
}

/**
 * ===========
 * AI Style Memory 邏輯
 * ===========
 */
function buildStyleMemory({ favorites, notes, closet }) {
  const fav = favorites || [];
  const tut = (notes || []).filter((n) => n.type === "tutorial" && n.aiSummary);

  const tagCount = {};
  const doCount = {};
  const dontCount = {};

  tut.forEach((t) => {
    const s = t.aiSummary;
    if (!s) return;
    (s.tags || []).forEach((x) => (tagCount[x] = (tagCount[x] || 0) + 1));
    (s.do || []).forEach((x) => (doCount[x] = (doCount[x] || 0) + 1));
    (s.dont || []).forEach((x) => (dontCount[x] = (dontCount[x] || 0) + 1));
  });

  const topN = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);

  const tagTop = topN(tagCount, 5);
  const doTop = topN(doCount, 5);
  const dontTop = topN(dontCount, 5);

  const catCount = {};
  const matCount = {};
  const colorCount = {};

  const scanOutfit = (outfit) => {
    if (!outfit) return;
    const ids = [outfit.topId, outfit.bottomId, outfit.outerId, outfit.shoeId, ...(outfit.accessoryIds || [])].filter(Boolean);
    ids.forEach((id) => {
      const item = closet.find((c) => c.id === id);
      if (item) {
        catCount[item.category] = (catCount[item.category] || 0) + 1;
        matCount[item.material] = (matCount[item.material] || 0) + 1;
        if (item.colors?.dominant) colorCount[item.colors.dominant] = (colorCount[item.colors.dominant] || 0) + 1;
      }
    });
  };

  fav.forEach((f) => scanOutfit(f.outfit));

  const favStyles = {};
  fav.forEach((f) => {
    const sn = f.styleName || "";
    if (sn) favStyles[sn] = (favStyles[sn] || 0) + 1;
  });

  const parts = [];

  if (fav.length) {
    parts.push("【收藏偏好】");
    parts.push(`常收藏風格：${topN(favStyles, 6).join("、") || "（不足）"}`);
    parts.push(`常用類別：${topN(catCount, 6).join("、") || "（不足）"}`);
    parts.push(`常見材質：${topN(matCount, 5).join("、") || "（不足）"}`);
    parts.push(`常見主色：${topN(colorCount, 6).join("、") || "（不足）"}`);
  }

  if (tut.length) {
    parts.push("\n【教材規則】");
    if (tagTop.length) parts.push(`關鍵標籤：${tagTop.join("、")}`);
    if (doTop.length) parts.push(`建議做：${doTop.join("；")}`);
    if (dontTop.length) parts.push(`避免：${dontTop.join("；")}`);
  }

  if (!parts.length) return "";

  parts.push("\n【Stylist 指令】請優先讓穿搭符合以上偏好與規則，在衣櫥不足時請清楚說明缺少的單品與替代策略。");
  return parts.join("\n");
}

function roughOutfitFromSelected(items) {
  const outfit = { topId: null, bottomId: null, outerId: null, shoeId: null, accessoryIds: [] };
  items.forEach((x) => {
    if (x.category === "上衣" && !outfit.topId) outfit.topId = x.id;
    else if (x.category === "下著" && !outfit.bottomId) outfit.bottomId = x.id;
    else if (x.category === "外套" && !outfit.outerId) outfit.outerId = x.id;
    else if (x.category === "鞋子" && !outfit.shoeId) outfit.shoeId = x.id;
    else outfit.accessoryIds.push(x.id);
  });
  return outfit;
}

/**
 * ===========
 * UI Styles
 * ===========
 */
const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(#fbf6ef, #f6f1e8)",
    color: "#1d1d1f",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans TC', sans-serif",
    paddingBottom: "calc(132px + env(safe-area-inset-bottom))"
  },

  topWrap: { padding: "14px 16px 8px" },
  topRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  h1: { fontSize: 22, margin: 0, letterSpacing: 0.2, fontWeight: 1000 },
  sub: { color: "rgba(0,0,0,0.55)", fontSize: 12, marginTop: 6, lineHeight: 1.25 },

  card: {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(20,20,20,0.06)",
    borderRadius: 20,
    padding: 14,
    boxShadow: "0 8px 24px rgba(23,20,14,0.06)",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    WebkitBackdropFilter: "blur(10px)",
    backdropFilter: "blur(10px)"
  },

  btn: {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.88)",
    cursor: "pointer",
    fontWeight: 700
  },
  btnPrimary: {
    padding: "12px 16px",
    borderRadius: 16,
    border: "none",
    color: "white",
    background: "linear-gradient(90deg,#6b5cff,#8b7bff)",
    cursor: "pointer",
    fontWeight: 900
  },
  btnGhost: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.55)",
    cursor: "pointer",
    fontWeight: 800,
    color: "rgba(0,0,0,0.75)"
  },
  weatherPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.70)",
    fontSize: 12,
    fontWeight: 900
  },

  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.9)",
    outline: "none",
    fontSize: 14
  },
  label: { fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.65)", marginBottom: 4 },
  textarea: {
    width: "100%",
    minHeight: 92,
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.9)",
    outline: "none",
    fontSize: 14
  },

  chip: (active) => ({
    padding: "8px 12px",
    borderRadius: 999,
    border: active ? "1px solid rgba(107,92,255,0.25)" : "1px solid rgba(0,0,0,0.10)",
    background: active ? "rgba(107,92,255,0.12)" : "rgba(255,255,255,0.6)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
    color: active ? "#5b4bff" : "rgba(0,0,0,0.70)"
  }),
  segmentWrap: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },

  sectionTitleRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 14 },
  sectionTitle: { fontSize: 16, fontWeight: 1000 },

  nav: {
    position: "fixed",
    left: 8,
    right: 8,
    bottom: 8,
    height: "calc(86px + env(safe-area-inset-bottom))",
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(20,20,20,0.06)",
    borderRadius: 22,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    alignItems: "center",
    padding: "8px 8px calc(8px + env(safe-area-inset-bottom))",
    zIndex: 80
  },
  navBtn: (active) => ({
    userSelect: "none",
    cursor: "pointer",
    textAlign: "center",
    padding: "10px 4px",
    minHeight: 56,
    borderRadius: 16,
    marginInline: 2,
    border: active ? "1px solid rgba(107,92,255,0.18)" : "1px solid transparent",
    background: active ? "rgba(107,92,255,0.10)" : "transparent",
    color: active ? "#5b4bff" : "rgba(0,0,0,0.72)"
  }),
  navIcon: { fontSize: 18, fontWeight: 1000, lineHeight: 1 },
  navText: { marginTop: 4, fontSize: 12, fontWeight: 900 }
};

function SectionTitle({ title, right }) {
  return (
    <div style={styles.sectionTitleRow}>
      <div style={styles.sectionTitle}>{title}</div>
      {right}
    </div>
  );
}

/**
 * ===========
 * App
 * ===========
 */
export default function App() {
  const [tab, setTab] = useState("closet");
  const [learnSub, setLearnSub] = useState("idea");
  const [hubSub, setHubSub] = useState("favorites");

  const [location, setLocation] = useState("全部");
  const [version, setVersion] = useState(null);
  const [weather, setWeather] = useState({ city: null, tempC: null, feelsLikeC: null, humidity: null, code: null, updatedAt: null, source: null, error: "" });
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [closet, setCloset] = useState(() => loadJson(K.CLOSET, []));
  const [favorites, setFavorites] = useState(() => loadJson(K.FAVORITES, []));
  const [notes, setNotes] = useState(() => loadJson(K.NOTES, []));
  const [timeline, setTimeline] = useState(() => loadJson(K.TIMELINE, []));
  const [profile, setProfile] = useState(() => loadJson(K.PROFILE, { gender: "male", height: 175, weight: 70, bodyType: "H型", fitPreference: "合身", aestheticFocus: "俐落", shoulder: "", waist: "", hip: "", chest: "" }));

  const [selectedIds, setSelectedIds] = useState([]);
  const [mixOccasion, setMixOccasion] = useState("日常");
  const [mixTempC, setMixTempC] = useState("");

  const [styOccasion, setStyOccasion] = useState("日常");
  const [styStyle, setStyStyle] = useState("極簡");
  const [styTempC, setStyTempC] = useState("");
  const [styResult, setStyResult] = useState(null);

  const [loading, setLoading] = useState(false);

  const fileRef = useRef(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addStage, setAddStage] = useState("idle");
  const [addImage, setAddImage] = useState(null);
  const [addDraft, setAddDraft] = useState(null);
  const [addErr, setAddErr] = useState("");

  const [noteText, setNoteText] = useState("");
  const [noteImage, setNoteImage] = useState(null);
  const [noteAI, setNoteAI] = useState(null);

  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem(K.GEMINI_KEY) || "");
  const [geminiDraftKey, setGeminiDraftKey] = useState(() => localStorage.getItem(K.GEMINI_KEY) || "");
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const geminiKeyRef = useRef((typeof localStorage !== "undefined" ? (localStorage.getItem(K.GEMINI_KEY) || "") : ""));
  const [bootStage, setBootStage] = useState("splash"); // splash | keyGate | ready
  const [gateBusy, setGateBusy] = useState(false);
  const [gateErr, setGateErr] = useState("");
  const [gatePulse, setGatePulse] = useState(false);

  const [editItem, setEditItem] = useState(null);
  const [batchProgress, setBatchProgress] = useState({ running: false, done: 0, total: 0, ok: 0, fail: 0, current: "" });

  const [screen, setScreen] = useState({ w: typeof window !== "undefined" ? window.innerWidth : 390 });

  // ================= 新增的大圖預覽狀態 =================
  const [fullViewMode, setFullViewMode] = useState(null);
  const [thumbCache, setThumbCache] = useState({});
  const [noteImgCache, setNoteImgCache] = useState({});
  // ======================================================

  const styleMemory = useMemo(() => buildStyleMemory({ favorites, notes, closet }), [favorites, notes, closet]);

  const isPhone = screen.w < 640;
  const isTablet = screen.w >= 640 && screen.w < 1024;
  const contentPad = isPhone ? "0 12px 16px" : isTablet ? "0 16px 18px" : "0 20px 20px";

  useEffect(() => saveJson(K.CLOSET, closet), [closet]);
  useEffect(() => saveJson(K.FAVORITES, favorites), [favorites]);
  useEffect(() => saveJson(K.NOTES, notes), [notes]);
  useEffect(() => saveJson(K.TIMELINE, timeline), [timeline]);
  useEffect(() => saveJson(K.PROFILE, profile), [profile]);

  useEffect(() => {
    geminiKeyRef.current = geminiKey || "";
    try { localStorage.setItem(K.GEMINI_KEY, geminiKey || ""); } catch {}
  }, [geminiKey]);

  useEffect(() => {
    const t1 = setTimeout(() => setGatePulse(true), 180);
    const t2 = setTimeout(() => setBootStage("keyGate"), 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    const onResize = () => setScreen({ w: window.innerWidth });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => saveJson(K.STYLE_MEMORY, { updatedAt: Date.now(), styleMemory }), [styleMemory]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = await r.json();
        setVersion(j);
      } catch {
        setVersion(null);
      }
    })();
  }, []);

  const closetFiltered = useMemo(() => {
    if (location === "全部") return closet;
    return closet.filter((x) => x.location === location);
  }, [closet, location]);

  const stats = useMemo(() => {
    const c = closetFiltered;
    const byCat = {};
    c.forEach((x) => {
      byCat[x.category] = (byCat[x.category] || 0) + 1;
    });
    return { total: c.length, byCat };
  }, [closetFiltered]);

  // migrate closet thumbnail base64 out of LocalStorage -> IndexedDB
  useEffect(() => {
    (async () => {
      try {
        let changed = false;
        const next = [...closet];
        for (let i = 0; i < next.length; i++) {
          const it = next[i];
          const hasOldImage = typeof it.image === "string" && it.image.startsWith("data:image");
          if (hasOldImage) {
            const keyId = it.thumbKey || it.id;
            await saveThumbImage(keyId, it.image);
            next[i] = { ...it, thumbKey: keyId };
            delete next[i].image;
            changed = true;
          } else if (!it.thumbKey) {
            next[i] = { ...it, thumbKey: it.id };
            changed = true;
          }
        }
        if (changed) setCloset(next);
      } catch (e) {
        console.warn("Closet migration failed:", e);
      }
    })();
      }, []);

  // migrate note.image(base64) out of LocalStorage -> IndexedDB
  useEffect(() => {
    (async () => {
      try {
        let changed = false;
        const next = [...notes];
        for (let i = 0; i < next.length; i++) {
          const n = next[i];
          const hasOld = typeof n.image === "string" && n.image.startsWith("data:image");
          if (hasOld) {
            await saveNoteImage(n.id, n.image);
            next[i] = { ...n, imageKey: n.id };
            delete next[i].image;
            changed = true;
          }
        }
        if (changed) setNotes(next);
      } catch (e) {
        console.warn("Notes migration failed:", e);
      }
    })();
      }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = closet.map((x) => x.thumbKey || x.id).filter(Boolean);
        for (const id of ids) {
          if (cancelled || thumbCache[id]) continue;
          const img = await loadThumbImage(id);
          if (img && !cancelled) setThumbCache((prev) => (prev[id] ? prev : { ...prev, [id]: img }));
        }
      } catch (e) {
        console.warn("Thumb preload error:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [closet, thumbCache]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = notes.map((n) => n.imageKey).filter(Boolean);
        for (const id of ids) {
          if (cancelled || noteImgCache[id]) continue;
          const img = await loadNoteImage(id);
          if (img && !cancelled) setNoteImgCache((prev) => (prev[id] ? prev : { ...prev, [id]: img }));
        }
      } catch (e) {
        console.warn("Note image preload error:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [notes, noteImgCache]);

  async function fetchWeatherByCoords(lat, lon, source = "gps") {
    setWeatherLoading(true);
    try {
      const city = nearestSupportedCity(lat, lon);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&timezone=auto`;
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok || !j?.current) throw new Error("天氣資料取得失敗");
      const curr = j.current;
      const temp = Math.round(Number(curr.temperature_2m));
      const feel = Math.round(Number(curr.apparent_temperature));
      setWeather({ city, tempC: temp, feelsLikeC: feel, humidity: Number(curr.relative_humidity_2m), code: Number(curr.weather_code), updatedAt: Date.now(), source, error: "" });
      setMixTempC(String(feel));
      setStyTempC(String(feel));
      if (location === "全部") setLocation(city);
    } catch (e) {
      setWeather((prev) => ({ ...prev, error: e.message || "天氣讀取失敗" }));
    } finally {
      setWeatherLoading(false);
    }
  }

  function detectWeatherAuto() {
    if (!navigator.geolocation) {
      setWeather((prev) => ({ ...prev, error: "此裝置不支援 GPS 定位" }));
      return;
    }
    setWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude, "gps"); },
      async () => {
        const city = location === "新竹" ? "新竹" : "台北";
        const c = CITY_COORDS[city];
        await fetchWeatherByCoords(c.lat, c.lon, "city-fallback");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 600000 }
    );
  }

  useEffect(() => { detectWeatherAuto(); }, []);

  function getThumbSrc(item) {
    if (!item) return null;
    const key = item.thumbKey || item.id;
    return thumbCache[key] || item.image || null;
  }

  function getNoteImgSrc(note) {
    if (!note) return null;
    if (note.imageKey) return noteImgCache[note.imageKey] || null;
    return note.image || null;
  }

  /**
   * ===========
   * Core actions
   * ===========
   */
  function openAdd() {
    setTab("add");
    setAddErr("");
    setAddOpen(true);
    setAddStage("idle");
    setAddImage(null);
    setAddDraft(null);
    setTimeout(() => fileRef.current?.click(), 30);
  }

  // 優化：加入 IndexedDB 大圖存儲與 AI 解析
  async function onPickFile(file) {
    if (loading) return;
    try {
      setLoading(true);
      setAddErr("");
      
      // 1. 將使用者上傳的檔案轉為 Base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      await new Promise(r => reader.onload = r);
      const originalBase64 = reader.result;
      
      // 2. 產生雙版本圖片 (這步是瘦身核心！)
      // 小圖：只存 300px，供 UI 列表顯示，超輕量存入 LocalStorage
      // 大圖：存 1200px 供 AI 辨識細節，並存入無容量限制的 IndexedDB
      setAddStage("compress");
      const thumbBase64 = await compressImage(originalBase64, 300, 0.6);
      const aiBase64 = await compressImage(originalBase64, 1200, 0.85);

      setAddImage(thumbBase64); // UI 上先預覽小圖

      setAddStage("analyze");
      // 3. 把高畫質大圖送給 AI 分析
      const j = await apiPostGemini({ task: "vision", imageDataUrl: aiBase64 });
      if (j.error && !j.name) throw new Error(j.error);

      const newItemId = uid();
      
      // 4. 【重點】將高畫質大圖存入 IndexedDB
      await saveFullImage(newItemId, aiBase64);
      await saveThumbImage(newItemId, thumbBase64);
      setThumbCache((prev) => ({ ...prev, [newItemId]: thumbBase64 }));

      // 5. LocalStorage 只存 metadata
      const newItem = {
        id: newItemId,
        thumbKey: newItemId, 
        name: j.name || "未命名單品",
        category: j.category || "上衣",
        style: j.style || "極簡",
        material: j.material || "未知",
        fit: j.fit || "一般",
        thickness: j.thickness || 3,
        temp: j.temp || { min: 15, max: 25 },
        colors: j.colors || { dominant: "#888888", secondary: "#CCCCCC" },
        notes: j.notes || "",
        confidence: j.confidence ?? 0.85,
        aiMeta: j._meta || null,
        location: location === "全部" ? "台北" : location
      };

      setAddDraft(newItem);
      setAddStage("confirm");
      
    } catch (e) {
      setAddErr(e.message || "處理失敗");
      setAddStage("idle");
    } finally {
      setLoading(false);
    }

  }

  async function onPickFilesBatch(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (loading) return;
    setAddOpen(true);
    setAddErr("");
    setAddImage(null);
    setAddDraft(null);
    setBatchProgress({ running: true, done: 0, total: list.length, ok: 0, fail: 0, current: "" });
    let ok = 0, fail = 0, done = 0;
    for (const file of list) {
      try {
        setBatchProgress((p) => ({ ...p, current: file.name }));
        const reader = new FileReader();
        reader.readAsDataURL(file);
        await new Promise(r => reader.onload = r);
        const originalBase64 = reader.result;
        const thumbBase64 = await compressImage(originalBase64, 300, 0.6);
        const aiBase64 = await compressImage(originalBase64, 1200, 0.85);
        setAddImage(thumbBase64);
        const j = await apiPostGemini({ task: "vision", imageDataUrl: aiBase64 });
        if (j.error && !j.name) throw new Error(j.error);
        const id = uid();
        await saveFullImage(id, aiBase64);
        await saveThumbImage(id, thumbBase64);
        setThumbCache((prev) => ({ ...prev, [id]: thumbBase64 }));
        const newItem = normalizeItemDraft({
          id, thumbKey: id,
          name: j.name, category: j.category, style: j.style, material: j.material,
          fit: j.fit, thickness: j.thickness, temp: j.temp, colors: j.colors, notes: j.notes,
          confidence: j.confidence, aiMeta: j._meta,
          location: location === "全部" ? "台北" : location
        }, location === "全部" ? "台北" : location);
        setCloset((prev) => [newItem, ...prev]);
        ok++;
      } catch (e) {
        fail++;
        setAddErr((prev) => (prev ? prev + "\n" : "") + `【${file.name}】${e.message || "失敗"}`);
      } finally {
        done++;
        setBatchProgress((p) => ({ ...p, done, ok, fail }));
      }
    }
    setBatchProgress((p) => ({ ...p, running: false, current: "" }));
  }

  function confirmAdd() {
    if (!addDraft) return;
    setCloset([normalizeItemDraft(addDraft, addDraft.location), ...closet]);
    setAddOpen(false);
    setAddImage(null);
    setAddDraft(null);
  }

  // 查看大圖
  async function handleViewFullImage(id, fallbackThumb) {
    const original = await loadFullImage(id);
    setFullViewMode(original || fallbackThumb);
  }

  // 刪除衣物時，同步刪除大圖
  async function handleDeleteItem(id) {
    if (!window.confirm("確定刪除此衣物？")) return;
    const target = closet.find((x) => x.id === id);
    const thumbKey = target?.thumbKey || id;
    setCloset(closet.filter((x) => x.id !== id));
    setSelectedIds(selectedIds.filter((x) => x !== id));
    setThumbCache((prev) => {
      if (!prev[thumbKey]) return prev;
      const next = { ...prev };
      delete next[thumbKey];
      return next;
    });
    await deleteItemImages(id);
  }

  function moveItem(id) {
    setCloset(
      closet.map((x) => {
        if (x.id !== id) return x;
        const next = x.location === "台北" ? "新竹" : "台北";
        return { ...x, location: next };
      })
    );
  }

  function toggleSelect(id) {
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function apiPostGemini(payload) {
    // 用 ref/localStorage 讀最新值，避免「剛儲存金鑰但閉包還拿到舊 state」的情況
    let key = (geminiKeyRef.current || geminiKey || "").trim();
    if (!key) {
      try { key = (localStorage.getItem(K.GEMINI_KEY) || "").trim(); } catch {}
    }
    if (!key) throw new Error("請先設定 Gemini API Key");
    const r = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userApiKey: key, ...payload })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "AI 服務失敗");
    return j;
  }


async function verifyAndEnterSystem() {
  const key = (geminiDraftKey || "").trim();
  if (!key) {
    setGateErr("請先輸入 Gemini API Key");
    return;
  }
  setGateBusy(true);
  setGateErr("");
  try {
    const r = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "ping", userApiKey: key })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error || "金鑰驗證失敗");
    try { localStorage.setItem(K.GEMINI_KEY, key); } catch {}
    geminiKeyRef.current = key;
    setGeminiKey(key);
    setGateErr("");
    setBootStage("ready");
  } catch (e) {
    setGateErr(e?.message || "金鑰驗證失敗");
  } finally {
    setGateBusy(false);
  }
}

  function saveGeminiKey() {
    const key = (geminiDraftKey || "").trim();
    geminiKeyRef.current = key;
    try { localStorage.setItem(K.GEMINI_KEY, key); } catch {}
    setGeminiKey(key);
    setShowKeyEditor(false);
  }

  function maskedKey(v) {
    if (!v) return "未設定";
    if (v.length <= 8) return "已設定";
    return v.slice(0, 4) + "•••" + v.slice(-4);
  }

  function normalizeItemDraft(base, fallbackLoc) {
    return {
      id: base.id || uid(),
      thumbKey: base.thumbKey || base.id || uid(),
      name: base.name || "未命名單品",
      category: base.category || "上衣",
      style: base.style || "極簡",
      material: base.material || "未知",
      fit: base.fit || "一般",
      thickness: Number(base.thickness || 3),
      temp: base.temp || { min: 15, max: 25 },
      colors: base.colors || { dominant: "#888888", secondary: "#CCCCCC" },
      notes: base.notes || "",
      confidence: base.confidence ?? 0.85,
      aiMeta: base.aiMeta || null,
      location: base.location || fallbackLoc || "台北"
    };
  }

  function openEdit(item) {
    setEditItem(JSON.parse(JSON.stringify(item)));
  }

  function saveEditItem() {
    if (!editItem) return;
    const normalized = normalizeItemDraft(editItem, editItem.location);
    setCloset(prev => prev.map(x => x.id === normalized.id ? normalized : x));
    setEditItem(null);
  }

  async function runMixExplain() {
    const selectedItems = closet.filter((x) => selectedIds.includes(x.id));
    if (selectedItems.length === 0) return alert("請先勾選衣物");

    setLoading(true);
    try {
      const j = await apiPostGemini({
        task: "mixExplain",
        selectedItems,
        profile,
        styleMemory,
        tempC: mixTempC ? Number(mixTempC) : null,
        occasion: mixOccasion
      });

      const outfit = roughOutfitFromSelected(selectedItems);

      const fav = {
        id: uid(),
        type: "mix",
        createdAt: Date.now(),
        title: `自選｜${mixOccasion}`,
        outfit,
        why: [
          j.summary,
          ...(j.goodPoints || []).map((x) => `優點：${x}`),
          ...(j.risks || []).map((x) => `注意：${x}`)
        ].filter(Boolean),
        tips: j.tips || [],
        confidence: j.compatibility ?? 0.7,
        styleName: j.styleName || "自選搭配",
        meta: j._meta || null
      };

      if (window.confirm("AI 已解析多選搭配。要直接收藏到「收藏」與「時間軸」嗎？")) {
        addFavoriteAndTimeline(fav, { occasion: mixOccasion, tempC: mixTempC });
        setTab("hub");
        setHubSub("favorites");
      } else {
        alert("已完成解析（未收藏）");
      }
    } catch (e) {
      alert(e.message || "失敗");
    } finally {
      setLoading(false);
    }
  }

  async function runStylist() {
    setLoading(true);
    try {
      const j = await apiPostGemini({
        task: "stylist",
        closet,
        profile,
        location,
        occasion: styOccasion,
        style: styStyle,
        styleMemory,
        tempC: styTempC ? Number(styTempC) : null
      });
      setStyResult(j);
    } catch (e) {
      alert(e.message || "失敗");
    } finally {
      setLoading(false);
    }
  }

  function saveStylistToFavorite() {
    if (!styResult) return;
    const fav = {
      id: uid(),
      type: "stylist",
      createdAt: Date.now(),
      title: `AI｜${styOccasion}｜${styStyle}`,
      outfit: styResult.outfit,
      why: styResult.why || [],
      tips: styResult.tips || [],
      confidence: styResult.confidence ?? 0.75,
      styleName: styResult.styleName || styStyle,
      meta: styResult._meta || null
    };
    addFavoriteAndTimeline(fav, { occasion: styOccasion, tempC: styTempC, style: styStyle });
    alert("已收藏並寫入時間軸");
  }

  function addFavoriteAndTimeline(fav, extra) {
    setFavorites((prev) => [fav, ...prev]);
    setTimeline((prev) => [
      {
        id: uid(),
        createdAt: Date.now(),
        refFavoriteId: fav.id,
        title: fav.title,
        styleName: fav.styleName,
        confidence: fav.confidence,
        outfit: fav.outfit,
        note: "",
        extra: extra || {}
      },
      ...prev
    ]);
  }

  function deleteFavorite(id) {
    if (!window.confirm("刪除這筆收藏？（時間軸仍保留引用，建議一併清理）")) return;
    setFavorites(favorites.filter((x) => x.id !== id));
  }

  function deleteTimeline(id) {
    if (!window.confirm("刪除這筆時間軸紀錄？")) return;
    setTimeline(timeline.filter((x) => x.id !== id));
  }

  async function createNote({ doAiSummary, type }) {
    if (!noteText && !noteImage) return alert("請輸入文字或上傳圖片");

    setLoading(true);
    try {
      let aiSummary = null;
      if (doAiSummary) {
        aiSummary = await apiPostGemini({
          task: "noteSummarize",
          text: noteText || "",
          imageDataUrl: noteImage || null
        });
        setNoteAI(j);
      }

      const noteId = uid();
      let imageKey = null;
      if (noteImage) {
        await saveNoteImage(noteId, noteImage);
        imageKey = noteId;
        setNoteImgCache((prev) => ({ ...prev, [noteId]: noteImage }));
      }

      const n = {
        id: noteId,
        type,
        createdAt: Date.now(),
        text: noteText || "",
        imageKey,
        aiSummary
      };
      setNotes((prev) => [n, ...prev]);

      setNoteText("");
      setNoteImage(null);
      alert("已新增");
    } catch (e) {
      alert(e.message || "失敗");
    } finally {
      setLoading(false);
    }
  }

  /**
   * ===========
   * Render helpers
   * ===========
   */
  function getItemById(id) {
    return closet.find((x) => x.id === id) || null;
  }

  function renderOutfit(outfit) {
    const top = outfit?.topId ? getItemById(outfit.topId) : null;
    const bottom = outfit?.bottomId ? getItemById(outfit.bottomId) : null;
    const outer = outfit?.outerId ? getItemById(outfit.outerId) : null;
    const shoe = outfit?.shoeId ? getItemById(outfit.shoeId) : null;
    const acc = (outfit?.accessoryIds || []).map(getItemById).filter(Boolean);

    const Item = ({ label, item }) => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 0",
          borderBottom: "1px solid rgba(0,0,0,0.06)"
        }}
      >
        <div style={{ fontWeight: 900, width: 66, color: "rgba(0,0,0,0.55)" }}>{label}</div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          {getThumbSrc(item) ? (
            <img
              src={getThumbSrc(item)}
              alt=""
              style={{ width: 38, height: 38, borderRadius: 12, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)" }}
            />
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(0,0,0,0.06)" }} />
          )}
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontWeight: 1000 }}>{item?.name || "（缺）"}</div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
              {item ? `${item.category}｜${item.location}` : "衣櫥不足或未選擇"}
            </div>
          </div>
        </div>
      </div>
    );

    return (
      <div>
        <Item label="上衣" item={top} />
        <Item label="下著" item={bottom} />
        <Item label="外套" item={outer} />
        <Item label="鞋子" item={shoe} />
        <div style={{ paddingTop: 10 }}>
          <div style={{ fontWeight: 900, color: "rgba(0,0,0,0.55)", marginBottom: 8 }}>配件</div>
          {acc.length ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {acc.map((x) => (
                <div
                  key={x.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.78)",
                    border: "1px solid rgba(0,0,0,0.08)"
                  }}
                >
                  <img src={getThumbSrc(x)} alt="" style={{ width: 28, height: 28, borderRadius: 10, objectFit: "cover" }} />
                  <div style={{ fontWeight: 1000, fontSize: 13 }}>{x.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)" }}>（無）</div>
          )}
        </div>
      </div>
    );
  }

  /**
   * ===========
   * Top Bar
   * ===========
   */
  const [showMemory, setShowMemory] = useState(true);

  
  function TopBar() {
    const showCompactHeader = tab === "closet" || tab === "mix" || tab === "hub";
    return (
      <div style={styles.topWrap}>
        <div style={styles.topRow}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...styles.h1, fontSize: isPhone ? 18 : 22 }}>Wardrobe Genie</div>
            <div style={{ ...styles.sub, fontSize: 11 }}>
              {version ? (
                <>
                  <b>{version.appVersion}</b> · {String(version.git?.commit || "").slice(0, 7)}
                </>
              ) : (
                "版本資訊載入中…"
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: isPhone ? 180 : 260 }}>
            <div style={styles.segmentWrap}>
              {["全部", "台北", "新竹"].map((x) => (
                <button key={x} style={styles.chip(location === x)} onClick={() => setLocation(x)}>{x}</button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <div style={styles.weatherPill}>
                <span>{weatherCodeMeta(weather.code, weather.feelsLikeC).icon}</span>
                <span>{weather.city || "定位中"} · {weather.feelsLikeC ?? "--"}°C</span>
              </div>
              <button style={{ ...styles.btnGhost, padding: "8px 10px" }} onClick={detectWeatherAuto} disabled={weatherLoading}>
                {weatherLoading ? "定位中…" : "📍更新"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", textAlign: "right", lineHeight: 1.25, maxWidth: 320 }}>
              {weather.error ? `天氣：${weather.error}` : `天氣 ${weatherCodeMeta(weather.code, weather.feelsLikeC).label}｜體感 ${weather.feelsLikeC ?? "--"}°C｜濕度 ${weather.humidity ?? "--"}%`}
            </div>
          </div>
        </div>

        {!showCompactHeader && showMemory && (
          <div style={{ marginTop: 10, ...styles.card }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 1000 }}>AI Style Memory（自動學習）</div>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>來源：收藏 + 教材</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "rgba(0,0,0,0.62)", whiteSpace: "pre-wrap" }}>
              {styleMemory || "（目前還沒有收藏/教材可學習）"}
            </div>
          </div>
        )}
      </div>
    );
  }


  /**
   * ===========
   * Pages
   * ===========
   */
  
  function ClosetPage() {
    const cats = ["上衣", "下著", "鞋子", "外套", "包包", "配件", "內著", "帽子", "飾品"];
    const [catFilter, setCatFilter] = useState("全部");

    const list = useMemo(() => {
      const base = closetFiltered;
      if (catFilter === "全部") return base;
      return base.filter((x) => x.category === catFilter);
    }, [closetFiltered, catFilter]);

    return (
      <div style={{ padding: contentPad, position: "relative" }}>
        <div style={{ ...styles.card, padding: isPhone ? 12 : 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: isPhone ? 14 : 15, color: "rgba(0,0,0,0.55)" }}>收集了 <b style={{ fontSize: 20, color: "#1d1d1f" }}>{stats.total}</b> 件服飾</div>
              <div style={{ marginTop: 8, width: isPhone ? "100%" : 280, maxWidth: "100%", height: 8, background: "rgba(0,0,0,0.08)", borderRadius: 999 }}>
                <div style={{ width: `${Math.min(100, (stats.total/150)*100)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#5b4bff,#8b7bff)" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btn} onClick={() => setSelectedIds([])}>清空勾選</button>
              <button style={styles.btn} onClick={() => { setTab("add"); setTimeout(() => fileRef.current?.click(), 30); }}>批量匯入</button>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            <button style={{ ...styles.chip(catFilter === "全部"), whiteSpace: "nowrap" }} onClick={() => setCatFilter("全部")}>全部</button>
            {cats.map((c) => (
              <button key={c} style={{ ...styles.chip(catFilter === c), whiteSpace: "nowrap" }} onClick={() => setCatFilter(c)}>{c}</button>
            ))}
          </div>
        </div>

        <div style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: isPhone ? "1fr 1fr" : "repeat(auto-fill,minmax(220px,1fr))",
          gap: 12
        }}>
          {list.map((x) => (
            <div key={x.id} style={{ ...styles.card, padding: 8, borderRadius: 18 }}>
              <div style={{ position: "relative" }}>
                <img
                  src={getThumbSrc(x)}
                  alt={x.name}
                  onClick={() => handleViewFullImage(x.id, getThumbSrc(x))}
                  style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 14, cursor: "pointer", background: "#f5f5f5" }}
                />
                <label style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "4px 8px", display: "flex", alignItems: "center", gap: 6, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <input type="checkbox" checked={selectedIds.includes(x.id)} onChange={() => toggleSelect(x.id)} />
                  <span style={{ fontSize: 12, fontWeight: 800 }}>選取</span>
                </label>
                {x.temp && (
                  <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "4px 8px", border: "1px solid rgba(0,0,0,0.08)", fontSize: 12, fontWeight: 900 }}>
                    🌡️ {x.temp.min}-{x.temp.max}°C
                  </div>
                )}
              </div>

              <div style={{ padding: 8 }}>
                <div style={{ fontWeight: 900, lineHeight: 1.25, minHeight: 36, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {x.name}
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "rgba(0,0,0,0.05)" }}>{x.category}</span>
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "rgba(0,0,0,0.05)" }}>{x.location}</span>
                  {x.style ? <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "rgba(91,75,255,0.10)", color: "#5b4bff" }}>{x.style}</span> : null}
                </div>

                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <button style={{ ...styles.btn, padding: "8px 6px", fontSize: 12 }} onClick={() => openEdit(x)}>編輯</button>
                  <button style={{ ...styles.btn, padding: "8px 6px", fontSize: 12 }} onClick={() => moveItem(x.id)}>移動</button>
                  <button style={{ ...styles.btn, padding: "8px 6px", fontSize: 12, color: "#b42318" }} onClick={() => handleDeleteItem(x.id)}>刪除</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {list.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "rgba(0,0,0,0.4)" }}>沒有符合的衣物</div>}

        <button
          onClick={openAdd}
          title="新增單品"
          style={{
            position: "fixed",
            right: 16,
            bottom: "calc(96px + env(safe-area-inset-bottom))",
            width: 58,
            height: 58,
            borderRadius: 999,
            border: "none",
            background: "linear-gradient(135deg,#6b5cff,#8b7bff)",
            color: "#fff",
            fontSize: 32,
            lineHeight: 1,
            boxShadow: "0 12px 24px rgba(107,92,255,0.35)",
            zIndex: 70,
            cursor: "pointer"
          }}
        >+</button>
      </div>
    );
  }


  
  function MixPage() {
    const selectedItems = closet.filter((x) => selectedIds.includes(x.id));
    const slotDefs = [
      { key: "上半身", cats: ["內著","上衣","外套","背心"] },
      { key: "下半身", cats: ["下著","連身"] },
      { key: "鞋襪", cats: ["鞋子","襪子"] },
      { key: "配件", cats: ["配件","包包","帽子","飾品"] }
    ];
    const grouped = slotDefs.map((s) => ({...s, items: selectedItems.filter(i => s.cats.includes(i.category))}));

    return (
      <div style={{ padding: contentPad }}>
        <SectionTitle
          title="自選穿搭"
          right={<button style={styles.btn} onClick={() => setTab("closet")}>回衣櫥選件</button>}
        />

        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr" : "1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <div style={styles.label}>場景</div>
              <select value={mixOccasion} onChange={(e) => setMixOccasion(e.target.value)} style={styles.input}>
                {["日常", "上班", "約會", "聚會", "戶外", "正式"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <div style={styles.label}>體感溫度（已自動帶入）</div>
              <input style={styles.input} value={mixTempC} onChange={(e) => setMixTempC(e.target.value)} inputMode="numeric" />
            </div>
            <button style={{ ...styles.btnPrimary, minWidth: 120 }} onClick={runMixExplain} disabled={loading}>{loading ? "分析中…" : "AI 解析"}</button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {grouped.map((slot) => (
            <div key={slot.key} style={{ ...styles.card, padding: 12 }}>
              <div style={{ fontWeight: 1000, marginBottom: 8 }}>{slot.key}</div>
              {slot.items.length ? (
                <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr" : "repeat(2,minmax(0,1fr))", gap: 8 }}>
                  {slot.items.map((x) => (
                    <div key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 14, padding: 8, background: "rgba(255,255,255,0.7)" }}>
                      <img src={getThumbSrc(x)} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover" }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 900, fontSize: 13, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{x.name}</div>
                        <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>{x.category} · {x.location}</div>
                      </div>
                      <button style={{ ...styles.btn, padding: "6px 8px", fontSize: 12 }} onClick={() => toggleSelect(x.id)}>移除</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ border: "1px dashed rgba(0,0,0,0.12)", borderRadius: 14, padding: 14, color: "rgba(0,0,0,0.45)", fontSize: 13 }}>尚未放入單品</div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }


  function StylistPage() {
    return (
      <div style={{ padding: contentPad }}>
        <SectionTitle title="AI 智能造型師" />
        
        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={{ fontWeight: 1000, marginBottom: 10 }}>場景與偏好</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={styOccasion} onChange={(e) => setStyOccasion(e.target.value)} style={{ ...styles.input, width: "calc(50% - 5px)" }}>
              {["日常", "上班", "約會", "聚會", "戶外", "正式"].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            <select value={styStyle} onChange={(e) => setStyStyle(e.target.value)} style={{ ...styles.input, width: "calc(50% - 5px)" }}>
              {["極簡", "街頭", "復古", "山系", "商務", "隨機"].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            <input style={{ ...styles.input, flex: 1 }} value={styTempC} onChange={(e) => setStyTempC(e.target.value)} placeholder="目前體感（已自動帶入）" inputMode="numeric" />
            <button onClick={runStylist} disabled={loading} style={{ ...styles.btnPrimary, width: "100%" }}>
              {loading ? "AI 搭配中…" : "✨ 幫我搭配"}
            </button>
          </div>
        </div>

        {styResult && (
          <div style={{ marginTop: 12, ...styles.card }}>
            <SectionTitle
              title="✨ 推薦搭配"
              right={
                <button style={styles.btnPrimary} onClick={saveStylistToFavorite}>
                  收藏並穿這套
                </button>
              }
            />
            <div style={{ marginTop: 10 }}>{renderOutfit(styResult.outfit)}</div>

            {(styResult.why || []).length ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 1000, marginBottom: 6 }}>搭配理由</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(styResult.why || []).map((x, i) => (
                    <li key={i} style={{ marginBottom: 6, color: "rgba(0,0,0,0.78)" }}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {(styResult.tips || []).length ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 1000, marginBottom: 6 }}>小撇步</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(styResult.tips || []).map((x, i) => (
                    <li key={i} style={{ marginBottom: 6, color: "rgba(0,0,0,0.78)" }}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  function LearnPage() {
    const currentType = learnSub === "idea" ? "idea" : "tutorial";
    const ideaNotes = notes.filter((x) => x.type === "idea");
    const tutNotes = notes.filter((x) => x.type === "tutorial");

    return (
      <div style={{ padding: contentPad }}>
        <SectionTitle title="穿搭筆記與靈感" />
        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={styles.segmentWrap}>
            <button style={styles.chip(learnSub === "idea")} onClick={() => setLearnSub("idea")}>靈感 ({ideaNotes.length})</button>
            <button style={styles.chip(learnSub === "tutorial")} onClick={() => setLearnSub("tutorial")}>教材 ({tutNotes.length})</button>
          </div>
        </div>

        <div style={{ marginTop: 12, ...styles.card }}>
          <div style={{ fontWeight: 1000, marginBottom: 8 }}>新增筆記</div>
          <textarea style={styles.textarea} placeholder="輸入穿搭心得、或上傳參考圖片..." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="file" accept="image/*" onChange={(e) => {
              const f = e.target.files[0];
              if (!f) return;
              const r = new FileReader();
              r.readAsDataURL(f);
              r.onload = () => compressImage(r.result, 600, 0.7).then(setNoteImage);
            }} style={{ display: "none" }} id="noteImgUp" />
            <label htmlFor="noteImgUp" style={styles.btnGhost}>📸 上傳圖</label>
            {noteImage && <img src={noteImage} alt="" style={{ height: 40, borderRadius: 8, objectFit: "cover" }} />}
            <div style={{ flex: 1 }} />
            <button style={styles.btnPrimary} onClick={() => createNote({ doAiSummary: currentType === "tutorial", type: currentType })} disabled={loading}>
              {loading ? "處理中..." : currentType === "idea" ? "＋ 新增靈感" : "＋ AI 解析教材"}
            </button>
          </div>
        </div>

        <SectionTitle title={`清單`} />
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {(notes || []).filter((n) => n.type === currentType).slice(0, 30).map((n) => (
            <div key={n.id} style={styles.card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{fmtDate(n.createdAt)}</div>
                <button style={styles.btn} onClick={async () => {
                  if (!window.confirm("刪除這筆筆記？")) return;
                  setNotes(notes.filter(x => x.id !== n.id));
                  if (n.imageKey) {
                    setNoteImgCache((prev) => {
                      const next = { ...prev };
                      delete next[n.imageKey];
                      return next;
                    });
                    await deleteNoteImage(n.id);
                  }
                }}>🗑️</button>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                {getNoteImgSrc(n) && <img src={getNoteImgSrc(n)} alt="" style={{ width: 60, height: 60, borderRadius: 12, objectFit: "cover" }} />}
                <div style={{ flex: 1, whiteSpace: "pre-wrap", fontSize: 14 }}>{n.text}</div>
              </div>
              {n.aiSummary && (
                <div style={{ marginTop: 10, padding: 10, background: "rgba(0,0,0,0.04)", borderRadius: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 4 }}>AI 總結（學習用）</div>
                  <div style={{ fontSize: 13 }}>
                    標籤：{(n.aiSummary.tags || []).join("、")} <br/>
                    建議作法：{(n.aiSummary.do || []).join("；")} <br/>
                    避免作法：{(n.aiSummary.dont || []).join("；")}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  
  function HubPage() {
    return (
      <div style={{ padding: contentPad }}>
        <SectionTitle title="Hub Dashboard" />

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: isPhone ? "1fr" : "1.2fr 1fr", gap: 12 }}>
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 1000 }}>🔑 Gemini API Key（BYOK）</div>
              <button style={styles.btn} onClick={() => setShowKeyEditor(v => !v)}>{showKeyEditor ? "收合" : (geminiKey ? "已設定" : "設定")}</button>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.6)" }}>目前：{maskedKey(geminiKey)}</div>
            {showKeyEditor && (
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                <input type="password" style={styles.input} value={geminiDraftKey} onChange={(e) => setGeminiDraftKey(e.target.value)} placeholder="貼上你的 Gemini API Key" />
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={styles.btnPrimary} onClick={saveGeminiKey}>儲存</button>
                  <button style={styles.btn} onClick={() => { try { localStorage.removeItem(K.GEMINI_KEY); localStorage.setItem(K.GEMINI_KEY, ""); } catch {} geminiKeyRef.current = ""; setGeminiDraftKey(""); setGeminiKey(""); }}>清除</button>
                </div>
                <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>金鑰只存在你的裝置瀏覽器，不會放在 Vercel。</div>
              </div>
            )}
          </div>

          <div style={styles.card}>
            <div style={{ fontWeight: 1000 }}>🌤️ 天氣</div>
            <div style={{ marginTop: 8, fontSize: 14 }}>{weatherCodeMeta(weather.code, weather.feelsLikeC).icon} {weather.city || "定位中"} · 體感 {weather.feelsLikeC ?? "--"}°C</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
              {weather.error ? weather.error : `溫度 ${weather.tempC ?? "--"}°C｜濕度 ${weather.humidity ?? "--"}%`}
            </div>
            <button style={{ ...styles.btnGhost, marginTop: 8 }} onClick={detectWeatherAuto} disabled={weatherLoading}>{weatherLoading ? "定位中…" : "重新抓天氣"}</button>
          </div>
        </div>

        <div style={{ marginTop: 12, ...styles.card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 1000 }}>AI Style Memory（自動學習）</div>
            <button style={styles.btnGhost} onClick={() => setShowMemory(v => !v)}>{showMemory ? "隱藏" : "顯示"}</button>
          </div>
          {showMemory && (
            <div style={{ marginTop: 8, fontSize: 12, color: "rgba(0,0,0,0.65)", whiteSpace: "pre-wrap" }}>
              {styleMemory || "（目前還沒有收藏/教材可學習）"}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: isPhone ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 10 }}>
          {[
            ["衣櫥件數", stats.total],
            ["收藏套數", favorites.length],
            ["穿搭紀錄", timeline.length],
            ["筆記/教材", notes.length]
          ].map(([label, value]) => (
            <div key={label} style={{ ...styles.card, padding: 12 }}>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{label}</div>
              <div style={{ marginTop: 4, fontSize: 24, fontWeight: 1000 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, ...styles.card }}>
          <div style={styles.segmentWrap}>
            <button style={styles.chip(hubSub === "favorites")} onClick={() => setHubSub("favorites")}>❤️ 收藏</button>
            <button style={styles.chip(hubSub === "diary")} onClick={() => setHubSub("diary")}>🕒 紀錄 / 個人設定</button>
          </div>
        </div>

        {hubSub === "favorites" ? <FavoritesPanel /> : <DiaryPanel />}
      </div>
    );
  }


  function FavoritesPanel() {
    return (
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {favorites.map((f) => (
          <div key={f.id} style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 1000 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 4 }}>{fmtDate(f.createdAt)}</div>
              </div>
              <button style={styles.btn} onClick={() => deleteFavorite(f.id)}>🗑️</button>
            </div>
            <div style={{ marginTop: 10 }}>{renderOutfit(f.outfit)}</div>
          </div>
        ))}
      </div>
    );
  }

  function DiaryPanel() {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={styles.card}>
          <div style={{ fontWeight: 1000, marginBottom: 8 }}>User Profile（個人設定）</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button style={styles.chip(profile.gender === "male")} onClick={() => setProfile({ ...profile, gender: "male", bodyType: profile.bodyType || "H型" })}>男生視角</button>
            <button style={styles.chip(profile.gender === "female")} onClick={() => setProfile({ ...profile, gender: "female", bodyType: profile.bodyType || "沙漏型" })}>女生視角</button>
            <button style={styles.chip(profile.gender === "other")} onClick={() => setProfile({ ...profile, gender: "other" })}>中性/其他</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: 10 }}>
            <div><div style={styles.label}>身高 cm</div><input style={styles.input} value={profile.height} onChange={(e) => setProfile({ ...profile, height: e.target.value })} type="number" /></div>
            <div><div style={styles.label}>體重 kg</div><input style={styles.input} value={profile.weight} onChange={(e) => setProfile({ ...profile, weight: e.target.value })} type="number" /></div>
            <div><div style={styles.label}>版型偏好</div><select style={styles.input} value={profile.fitPreference || "合身"} onChange={(e)=>setProfile({...profile, fitPreference:e.target.value})}><option>合身</option><option>寬鬆</option><option>修身</option><option>舒適</option></select></div>
            <div><div style={styles.label}>審美重點</div><select style={styles.input} value={profile.aestheticFocus || "俐落"} onChange={(e)=>setProfile({...profile, aestheticFocus:e.target.value})}><option>俐落</option><option>顯瘦</option><option>比例</option><option>氣質</option><option>可愛</option><option>中性</option></select></div>
            <div style={{ gridColumn: isPhone ? "1 / -1" : "span 2" }}>
              <div style={styles.label}>身形類型</div>
              <select value={profile.bodyType} onChange={(e) => setProfile({ ...profile, bodyType: e.target.value })} style={styles.input}>
                {(profile.gender === "female"
                  ? ["沙漏型", "梨形", "倒三角形", "H型", "蘋果型"]
                  : profile.gender === "male"
                  ? ["H型", "倒三角形", "矩形", "圓形(O型)", "梨形"]
                  : ["H型", "倒三角形", "梨形", "沙漏型", "圓形(O型)"]
                ).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            {profile.gender === "female" ? (
              <>
                <div><div style={styles.label}>胸圍 cm</div><input style={styles.input} value={profile.chest || ""} onChange={(e)=>setProfile({...profile, chest:e.target.value})} type="number" /></div>
                <div><div style={styles.label}>腰圍 cm</div><input style={styles.input} value={profile.waist || ""} onChange={(e)=>setProfile({...profile, waist:e.target.value})} type="number" /></div>
                <div><div style={styles.label}>臀圍 cm</div><input style={styles.input} value={profile.hip || ""} onChange={(e)=>setProfile({...profile, hip:e.target.value})} type="number" /></div>
              </>
            ) : (
              <>
                <div><div style={styles.label}>肩寬 cm</div><input style={styles.input} value={profile.shoulder || ""} onChange={(e)=>setProfile({...profile, shoulder:e.target.value})} type="number" /></div>
                <div><div style={styles.label}>腰圍 cm</div><input style={styles.input} value={profile.waist || ""} onChange={(e)=>setProfile({...profile, waist:e.target.value})} type="number" /></div>
                <div><div style={styles.label}>臀圍 cm</div><input style={styles.input} value={profile.hip || ""} onChange={(e)=>setProfile({...profile, hip:e.target.value})} type="number" /></div>
              </>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>AI 造型師會依照性別視角、身形與審美重點調整建議。資料僅存在本機。</div>
        </div>

        <SectionTitle title={`Outfit Timeline（${timeline.length}）`} />
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {timeline.slice(0, 20).map((t) => (
            <div key={t.id} style={styles.card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 1000 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 4 }}>
                    {fmtDate(t.createdAt)} · {t.styleName} · conf {Math.round((t.confidence ?? 0.75) * 100)}%
                  </div>
                </div>
                <button style={styles.btn} onClick={() => deleteTimeline(t.id)}>🗑️</button>
              </div>
              <div style={{ marginTop: 10 }}>{renderOutfit(t.outfit)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }


if (bootStage === "splash") {
  return (
    <div style={{ ...styles.page, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 520, textAlign: "center" }}>
        <div style={{
          margin: "0 auto 16px",
          width: 82, height: 82, borderRadius: 24,
          background: "linear-gradient(135deg,#6b5cff,#8b7bff)",
          color: "white", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 34, fontWeight: 900,
          transform: gatePulse ? "translateY(0px) scale(1)" : "translateY(12px) scale(.94)",
          opacity: gatePulse ? 1 : .3,
          transition: "all .5s ease"
        }}>👕</div>
        <div style={{
          fontSize: isPhone ? 28 : 36,
          lineHeight: 1.02,
          fontWeight: 1000,
          letterSpacing: "-0.02em",
          transform: gatePulse ? "translateY(0px)" : "translateY(8px)",
          opacity: gatePulse ? 1 : .25,
          transition: "all .55s ease"
        }}>
          Wardrobe<br/>Genie
        </div>
        <div style={{ marginTop: 10, color: "rgba(0,0,0,.55)", opacity: gatePulse ? 1 : .2, transition: "opacity .55s ease" }}>
          啟動中...
        </div>
      </div>
    </div>
  );
}

if (bootStage === "keyGate") {
  return (
    <div style={{ ...styles.page, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: isPhone ? 14 : 22 }}>
      <div style={{ width: "100%", maxWidth: 620, ...styles.card, borderRadius: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg,#6b5cff,#8b7bff)", color: "#fff", display: "grid", placeItems: "center", fontSize: 22 }}>🔑</div>
          <div>
            <div style={{ fontSize: isPhone ? 22 : 26, fontWeight: 1000, lineHeight: 1.05 }}>先設定 Gemini API Key</div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,.6)", marginTop: 4 }}>驗證成功後才會進入 Wardrobe Genie</div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={styles.label}>Gemini API Key</div>
          <input
            type="password"
            autoFocus
            style={styles.input}
            value={geminiDraftKey}
            onChange={(e) => setGeminiDraftKey(e.target.value)}
            placeholder="貼上你的 Gemini API Key"
          />
          <div style={{ marginTop: 8, fontSize: 12, color: "rgba(0,0,0,.55)", lineHeight: 1.45 }}>
            金鑰只會儲存在你目前這台裝置的瀏覽器（本機），不會替你永久儲存在伺服器。
          </div>
        </div>

        {gateErr && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(255,0,0,.2)", background: "rgba(255,0,0,.05)" }}>
            <div style={{ fontWeight: 900, color: "#d00000" }}>驗證失敗</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "rgba(0,0,0,.75)" }}>{gateErr}</div>
          </div>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...styles.btnPrimary, minWidth: 160 }} onClick={verifyAndEnterSystem} disabled={gateBusy}>
            {gateBusy ? "驗證中..." : "驗證並進入"}
          </button>
          {!!geminiDraftKey && (
            <button
              style={styles.btn}
              onClick={() => { setGeminiDraftKey(""); try { localStorage.setItem(K.GEMINI_KEY, ""); } catch {}
                      setGeminiKey(""); geminiKeyRef.current = ""; try { localStorage.removeItem(K.GEMINI_KEY); } catch {} setGateErr(""); }}
              disabled={gateBusy}
            >
              清除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

  return (
    <div style={styles.page}>
      <TopBar />

      <div style={{ display: addOpen ? "block" : "none", padding: "0 16px calc(140px + env(safe-area-inset-bottom))" }}>
        <SectionTitle
          title="新衣入庫"
          right={
            <button style={styles.btnGhost} onClick={() => setAddOpen(false)}>取消</button>
          }
        />

        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileRef}
          style={{ display: "none" }}
          onChange={(e) => {
            const fs = Array.from(e.target.files || []);
            if (!fs.length) return;
            if (fs.length > 1) onPickFilesBatch(fs);
            else onPickFile(fs[0]);
            e.target.value = "";
          }}
        />

        {addErr && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "rgba(255,0,0,0.05)", border: "1px solid rgba(255,0,0,0.15)" }}>
            <div style={{ fontWeight: 1000, color: "red" }}>發生錯誤</div>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.75)", marginTop: 6 }}>{addErr}</div>
          </div>
        )}

        {batchProgress.total > 0 && (
          <div style={{ marginTop: 12, ...styles.card }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>批量匯入進度</div>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>{batchProgress.done}/{batchProgress.total}</div>
            </div>
            <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${batchProgress.total ? Math.round(batchProgress.done / batchProgress.total * 100) : 0}%`, height: "100%", background: "linear-gradient(90deg,#6b5cff,#8b7bff)" }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "rgba(0,0,0,0.65)" }}>
              成功 {batchProgress.ok}｜失敗 {batchProgress.fail}{batchProgress.current ? `｜處理中：${batchProgress.current}` : ""}
            </div>
          </div>
        )}

        {!addImage && (
          <div style={{ marginTop: 12, ...styles.card }}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>提示</div>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)", lineHeight: 1.5 }}>
              選擇照片後會先壓縮再送 AI 分析（大圖會存在底層資料庫，確保流暢）。
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={styles.btnPrimary} onClick={() => fileRef.current?.click()}>選擇照片</button><button style={styles.btn} onClick={() => fileRef.current?.click()}>批量匯入（可多選）</button></div>
            </div>
          </div>
        )}

        {addImage && (
          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <img src={addImage} alt="" style={{ width: 132, height: 132, borderRadius: 18, objectFit: "cover", border: "1px solid rgba(0,0,0,0.10)" }} />
            {addDraft ? (
              <div style={{ flex: 1, width: "100%" }}>
                <div style={{ ...styles.card, padding: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr" : "1fr 1fr", gap: 10, width: "100%" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={styles.label}>名稱</div>
                      <input style={styles.input} value={addDraft.name} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} placeholder="例如：白色寬褲" />
                    </div>
                    <div>
                      <div style={styles.label}>種類</div>
                      <select style={styles.input} value={addDraft.category} onChange={(e) => setAddDraft({ ...addDraft, category: e.target.value })}>
                        {["上衣", "下著", "鞋子", "外套", "包包", "配件", "內著", "帽子", "飾品"].map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={styles.label}>地點</div>
                      <select style={styles.input} value={addDraft.location} onChange={(e) => setAddDraft({ ...addDraft, location: e.target.value })}>
                        {["台北", "新竹"].map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={styles.label}>風格</div>
                      <input style={styles.input} value={addDraft.style || ""} onChange={(e) => setAddDraft({ ...addDraft, style: e.target.value })} placeholder="休閒 / 極簡 / 正式" />
                    </div>
                    <div>
                      <div style={styles.label}>適溫（°C）</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <input style={styles.input} type="number" value={addDraft.temp?.min ?? 15} onChange={(e)=>setAddDraft({ ...addDraft, temp:{ ...(addDraft.temp||{}), min:Number(e.target.value||0), max:Number(addDraft.temp?.max ?? 25) } })} />
                        <div style={{ fontWeight: 800, color: "rgba(0,0,0,0.45)" }}>–</div>
                        <input style={styles.input} type="number" value={addDraft.temp?.max ?? 25} onChange={(e)=>setAddDraft({ ...addDraft, temp:{ ...(addDraft.temp||{}), min:Number(addDraft.temp?.min ?? 15), max:Number(e.target.value||0) } })} />
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button style={{ ...styles.btn, flex: 1 }} onClick={() => { setAddImage(null); setAddDraft(null); setAddErr(""); }}>重選照片</button>
                    <button style={{ ...styles.btnPrimary, flex: 1, minHeight: 46 }} onClick={confirmAdd}>確認入庫</button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, paddingTop: 10 }}>
                <div style={{ fontWeight: 1000, fontSize: 16 }}>{addStage === "compress" ? "圖片處理中..." : "AI 智能分析中..."}</div>
                <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", marginTop: 4 }}>請稍候，Genie 正在辨識材質與顏色</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: addOpen ? "none" : "block" }}>
        {tab === "closet" && <ClosetPage />}
        {tab === "mix" && <MixPage />}
        {tab === "stylist" && <StylistPage />}
        {tab === "learn" && <LearnPage />}
        {tab === "hub" && <HubPage />}
      </div>

      <div style={styles.nav}>
        <div style={styles.navBtn(tab === "closet")} onClick={() => setTab("closet")}>
          <div style={styles.navIcon}>👕</div>
          <div style={styles.navText}>衣櫥</div>
        </div>
        <div style={styles.navBtn(tab === "mix")} onClick={() => setTab("mix")}>
          <div style={styles.navIcon}>🧩</div>
          <div style={styles.navText}>自選</div>
        </div>
        <div style={styles.navBtn(false)} onClick={openAdd}>
          <div style={styles.navIcon}>＋</div>
          <div style={styles.navText}>入庫</div>
        </div>
        <div style={styles.navBtn(tab === "stylist")} onClick={() => setTab("stylist")}>
          <div style={styles.navIcon}>✨</div>
          <div style={styles.navText}>造型師</div>
        </div>
        <div style={styles.navBtn(tab === "learn" || tab === "hub")} onClick={() => setTab("hub")}>
          <div style={styles.navIcon}>📚</div>
          <div style={styles.navText}>Hub</div>
        </div>
      </div>


      {editItem && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(17,17,19,0.45)", display: "flex", justifyContent: "center", alignItems: isPhone ? "flex-end" : "center", padding: 10 }}>
          <div style={{ width: "100%", maxWidth: 620, maxHeight: "88vh", overflow: "hidden", borderRadius: isPhone ? "20px 20px 0 0" : 22, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 20px 50px rgba(0,0,0,0.18)" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 2, background: "rgba(255,255,255,0.95)", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 1000, fontSize: 16 }}>編輯單品</div>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>只保留常用欄位，避免太雜</div>
              </div>
              <button style={styles.btnGhost} onClick={() => setEditItem(null)}>關閉</button>
            </div>

            <div style={{ padding: 14, overflow: "auto", maxHeight: "calc(88vh - 126px)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <img src={editItem.thumb || ""} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)", background: "#f5f5f5" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.label}>名稱</div>
                  <input style={styles.input} value={editItem.name || ""} onChange={(e)=>setEditItem({...editItem, name:e.target.value})} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={styles.label}>種類</div>
                  <select style={styles.input} value={editItem.category || "上衣"} onChange={(e)=>setEditItem({...editItem, category:e.target.value})}>
                    {["上衣","下著","鞋子","外套","包包","配件","內著","帽子","飾品"].map(x=><option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div>
                  <div style={styles.label}>地點</div>
                  <select style={styles.input} value={editItem.location || "台北"} onChange={(e)=>setEditItem({...editItem, location:e.target.value})}>
                    {["台北","新竹"].map(x=><option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={styles.label}>風格</div>
                  <input style={styles.input} value={editItem.style || ""} onChange={(e)=>setEditItem({...editItem, style:e.target.value})} placeholder="休閒 / 極簡 / 正式" />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ ...styles.label, display: "flex", justifyContent: "space-between" }}>
                    <span>適溫範圍</span>
                    <span style={{ color: "rgba(0,0,0,0.55)" }}>{editItem.temp?.min ?? 15}°C – {editItem.temp?.max ?? 25}°C</span>
                  </div>
                  <div style={{ ...styles.card, padding: 10, background: "rgba(250,250,252,0.95)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.55)", marginBottom: 4 }}>最低</div>
                        <input style={styles.input} type="number" value={editItem.temp?.min ?? 15} onChange={(e)=>setEditItem({...editItem, temp:{ ...(editItem.temp||{}), min:Number(e.target.value||0), max:Number(editItem.temp?.max ?? 25) }})} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.55)", marginBottom: 4 }}>最高</div>
                        <input style={styles.input} type="number" value={editItem.temp?.max ?? 25} onChange={(e)=>setEditItem({...editItem, temp:{ ...(editItem.temp||{}), min:Number(editItem.temp?.min ?? 15), max:Number(e.target.value||0) }})} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ position: "sticky", bottom: 0, background: "rgba(255,255,255,0.96)", borderTop: "1px solid rgba(0,0,0,0.06)", padding: "10px 14px calc(10px + env(safe-area-inset-bottom))" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...styles.btn, flex: 1, minHeight: 46 }} onClick={() => setEditItem(null)}>取消</button>
                <button style={{ ...styles.btnPrimary, flex: 1, minHeight: 46 }} onClick={saveEditItem}>儲存變更</button>
              </div>
            </div>
          </div>
        </div>
      )}

            {/* ================= 全螢幕大圖預覽 Modal ================= */}
      {fullViewMode && (
        <div 
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setFullViewMode(null)}
        >
          <img 
            src={fullViewMode} 
            alt="full-res" 
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 16, objectFit: "contain", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }} 
          />
          <div style={{ position: "absolute", top: 20, right: 20, color: "white", fontWeight: "bold", cursor: "pointer", background: "rgba(255,255,255,0.2)", padding: "8px 16px", borderRadius: 20 }}>
            關閉大圖
          </div>
        </div>
      )}

    </div>
  );
}
