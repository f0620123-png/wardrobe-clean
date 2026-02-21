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
    paddingBottom: 92
  },

  topWrap: { padding: "14px 16px 8px" },
  topRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  h1: { fontSize: 22, margin: 0, letterSpacing: 0.2, fontWeight: 1000 },
  sub: { color: "rgba(0,0,0,0.55)", fontSize: 12, marginTop: 6, lineHeight: 1.25 },

  card: {
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
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
    left: 0,
    right: 0,
    bottom: 0,
    height: 78,
    background: "rgba(255,255,255,0.82)",
    borderTop: "1px solid rgba(0,0,0,0.06)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    alignItems: "center",
    padding: "10px 10px",
    zIndex: 50
  },
  navBtn: (active) => ({
    userSelect: "none",
    cursor: "pointer",
    textAlign: "center",
    padding: "8px 6px",
    borderRadius: 16,
    marginInline: 6,
    border: active ? "1px solid rgba(107,92,255,0.25)" : "1px solid rgba(0,0,0,0.06)",
    background: active ? "rgba(107,92,255,0.10)" : "rgba(255,255,255,0.40)",
    color: active ? "#5b4bff" : "rgba(0,0,0,0.68)"
  }),
  navIcon: { fontSize: 18, fontWeight: 1000, lineHeight: 1 },
  navText: { marginTop: 4, fontSize: 11, fontWeight: 900 }
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
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem(K.GEMINI_KEY) || "");
  const [showApiKeyPanel, setShowApiKeyPanel] = useState(false);

  const [closet, setCloset] = useState(() => loadJson(K.CLOSET, []));
  const [favorites, setFavorites] = useState(() => loadJson(K.FAVORITES, []));
  const [notes, setNotes] = useState(() => loadJson(K.NOTES, []));
  const [timeline, setTimeline] = useState(() => loadJson(K.TIMELINE, []));
  const [profile, setProfile] = useState(() => loadJson(K.PROFILE, { height: 175, weight: 70, bodyType: "H型" }));

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
  const [batchState, setBatchState] = useState({ running: false, total: 0, done: 0, ok: 0, fail: 0, current: "" });
  const [editDraft, setEditDraft] = useState(null);

  const [noteText, setNoteText] = useState("");
  const [noteImage, setNoteImage] = useState(null);
  const [noteAI, setNoteAI] = useState(null);

  // ================= 新增的大圖預覽狀態 =================
  const [fullViewMode, setFullViewMode] = useState(null);
  const [thumbCache, setThumbCache] = useState({});
  const [noteImgCache, setNoteImgCache] = useState({});
  // ======================================================

  const styleMemory = useMemo(() => buildStyleMemory({ favorites, notes, closet }), [favorites, notes, closet]);

  useEffect(() => saveJson(K.CLOSET, closet), [closet]);
  useEffect(() => saveJson(K.FAVORITES, favorites), [favorites]);
  useEffect(() => saveJson(K.NOTES, notes), [notes]);
  useEffect(() => saveJson(K.TIMELINE, timeline), [timeline]);
  useEffect(() => saveJson(K.PROFILE, profile), [profile]);
  useEffect(() => saveJson(K.STYLE_MEMORY, { updatedAt: Date.now(), styleMemory }), [styleMemory]);
  useEffect(() => {
    try {
      const v = (geminiApiKey || "").trim();
      if (v) localStorage.setItem(K.GEMINI_KEY, v);
      else localStorage.removeItem(K.GEMINI_KEY);
    } catch {}
  }, [geminiApiKey]);

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
    setAddErr("");
    setBatchState({ running: false, total: 0, done: 0, ok: 0, fail: 0, current: "" });
    setAddOpen(true);
    setAddStage("idle");
    setAddImage(null);
    setAddDraft(null);
    setTimeout(() => fileRef.current?.click(), 30);
  }

  function buildGeminiBody(payload) {
    const key = (geminiApiKey || "").trim();
    return key ? { ...payload, userApiKey: key } : payload;
  }

  function ensureGeminiKey() {
    if (!(geminiApiKey || "").trim()) {
      alert("請先在右上角設定你的 Gemini API Key");
      setShowApiKeyPanel(true);
      return false;
    }
    return true;
  }


  // 優化：加入 IndexedDB 大圖存儲與 AI 解析
  async function processOneClothFile(file, opts = {}) {
    const { silent = false } = opts;
    if (loading && !silent) return null;
    if (!ensureGeminiKey()) throw new Error("請先在右上角設定你的 Gemini API Key");

    if (!silent) {
      setLoading(true);
      setAddErr("");
    }

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      await new Promise((r) => (reader.onload = r));
      const originalBase64 = reader.result;

      if (!silent) setAddStage("compress");
      const thumbBase64 = await compressImage(originalBase64, 300, 0.6);
      const aiBase64 = await compressImage(originalBase64, 1200, 0.85);

      if (!silent) setAddImage(thumbBase64);
      if (!silent) setAddStage("analyze");

      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGeminiBody({ task: "vision", imageDataUrl: aiBase64 }))
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "AI 分析失敗");
      if (j.error && !j.name) throw new Error(j.error);

      const newItemId = uid();
      await saveFullImage(newItemId, aiBase64);
      await saveThumbImage(newItemId, thumbBase64);
      setThumbCache((prev) => ({ ...prev, [newItemId]: thumbBase64 }));

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

      return { item: newItem, thumbBase64 };
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function onPickFile(file) {
    try {
      setBatchState({ running: false, total: 0, done: 0, ok: 0, fail: 0, current: "" });
      const result = await processOneClothFile(file, { silent: false });
      if (!result) return;
      setAddDraft(result.item);
      setAddImage(result.thumbBase64);
      setAddStage("confirm");
    } catch (e) {
      setAddErr(e.message || "處理失敗");
      setAddStage("idle");
    }
  }

  async function onPickFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (files.length === 1) return onPickFile(files[0]);
    if (!ensureGeminiKey()) return;

    setAddOpen(true);
    setAddErr("");
    setAddImage(null);
    setAddDraft(null);
    setAddStage("idle");
    setBatchState({ running: true, total: files.length, done: 0, ok: 0, fail: 0, current: "" });

    const created = [];
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setBatchState({ running: true, total: files.length, done: i, ok, fail, current: f.name });
      try {
        const result = await processOneClothFile(f, { silent: true });
        if (result?.item) {
          created.push(result.item);
          ok += 1;
        } else {
          fail += 1;
        }
      } catch (e) {
        console.warn("batch import fail", f.name, e);
        fail += 1;
      }
      setBatchState({ running: true, total: files.length, done: i + 1, ok, fail, current: f.name });
    }

    if (created.length) setCloset((prev) => [...created.reverse(), ...prev]);

    setBatchState({ running: false, total: files.length, done: files.length, ok, fail, current: "" });
    if (fail > 0) {
      setAddErr(`批量匯入完成：成功 ${ok} 件、失敗 ${fail} 件`);
    } else {
      setAddErr("");
      setAddOpen(false);
      alert(`批量匯入完成：成功 ${ok} 件`);
    }
  }

  function startEditItem(item) {
    setEditDraft({
      ...item,
      temp: { min: item?.temp?.min ?? 15, max: item?.temp?.max ?? 25 }
    });
  }

  function saveEditItem() {
    if (!editDraft?.id) return;
    setCloset((prev) =>
      prev.map((x) =>
        x.id !== editDraft.id
          ? x
          : {
              ...x,
              name: editDraft.name || "未命名單品",
              category: editDraft.category || "上衣",
              style: editDraft.style || "極簡",
              material: editDraft.material || "未知",
              thickness: Number(editDraft.thickness) || 3,
              location: editDraft.location || "台北",
              notes: editDraft.notes || "",
              temp: {
                min: Number(editDraft?.temp?.min ?? 15),
                max: Number(editDraft?.temp?.max ?? 25)
              }
            }
      )
    );
    setEditDraft(null);
  }

  function confirmAdd() {
    if (!addDraft) return;
    setCloset((prev) => [addDraft, ...prev]);
    setAddOpen(false);
    setAddDraft(null);
    setAddImage(null);
    setAddErr("");
    setAddStage("idle");
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

  async function runMixExplain() {
    if (!ensureGeminiKey()) return;
    const selectedItems = closet.filter((x) => selectedIds.includes(x.id));
    if (selectedItems.length === 0) return alert("請先勾選衣物");

    setLoading(true);
    try {
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGeminiBody({
          task: "mixExplain",
          selectedItems,
          profile,
          styleMemory,
          tempC: mixTempC ? Number(mixTempC) : null,
          occasion: mixOccasion
        }))
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "AI 分析失敗");

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
    if (!ensureGeminiKey()) return;
    setLoading(true);
    try {
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGeminiBody({
          task: "stylist",
          closet,
          profile,
          location,
          occasion: styOccasion,
          style: styStyle,
          styleMemory,
          tempC: styTempC ? Number(styTempC) : null
        }))
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "生成失敗");
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
    if (doAiSummary && !ensureGeminiKey()) return;

    setLoading(true);
    try {
      let aiSummary = null;
      if (doAiSummary) {
        const r = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildGeminiBody({
            task: "noteSummarize",
            text: noteText || "",
            imageDataUrl: noteImage || null
          }))
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "AI 摘要失敗");
        aiSummary = j;
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
    return (
      <div style={styles.topWrap}>
        <div style={styles.topRow}>
          <div>
            <div style={styles.h1}>Wardrobe Genie</div>
            <div style={styles.sub}>
              {version ? (
                <>
                  <b>{version.appVersion}</b> · {version.git?.branch} · {String(version.git?.commit || "").slice(0, 7)} ·{" "}
                  {version.vercelEnv}
                </>
              ) : (
                "版本資訊載入中…"
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <div style={styles.segmentWrap}>
              {["全部", "台北", "新竹"].map((x) => (
                <button key={x} style={styles.chip(location === x)} onClick={() => setLocation(x)}>
                  {x}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <div style={styles.weatherPill}>
                <span>{weatherCodeMeta(weather.code, weather.feelsLikeC).icon}</span>
                <span>{weather.city || "定位中"} · {weather.feelsLikeC ?? "--"}°C</span>
              </div>
              <button style={{ ...styles.btnGhost, padding: "8px 10px" }} onClick={detectWeatherAuto} disabled={weatherLoading} title="GPS 自動抓取天氣">
                {weatherLoading ? "定位中…" : "📍更新"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", textAlign: "right", maxWidth: 320 }}>
              {weather.error
                ? `天氣：${weather.error}`
                : `天氣 ${weatherCodeMeta(weather.code, weather.feelsLikeC).label}｜溫度 ${weather.tempC ?? "--"}°C｜體感 ${weather.feelsLikeC ?? "--"}°C｜濕度 ${weather.humidity ?? "--"}%`}
            </div>

            <div style={{ ...styles.card, width: 320, maxWidth: "100%", padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 900 }}>🔑 Gemini API Key</div>
                <button style={{ ...styles.btnGhost, padding: "6px 10px", fontSize: 12 }} onClick={() => setShowApiKeyPanel((v) => !v)}>
                  {showApiKeyPanel ? "收合" : ((geminiApiKey || "").trim() ? "已設定" : "設定")}
                </button>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "rgba(0,0,0,0.6)" }}>
                {((geminiApiKey || "").trim())
                  ? `目前：${geminiApiKey.trim().slice(0, 6)}***${geminiApiKey.trim().slice(-4)}`
                  : "尚未設定（每位使用者使用自己的 Key）"}
              </div>
              {showApiKeyPanel && (
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  <input
                    style={{ ...styles.input, padding: "10px 12px", fontSize: 12 }}
                    type="password"
                    placeholder="貼上你的 Gemini API Key"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button style={{ ...styles.btnGhost, padding: "6px 10px", fontSize: 12 }} onClick={() => setGeminiApiKey("")}>清除</button>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(0,0,0,0.5)", textAlign: "left" }}>
                    金鑰僅儲存在此瀏覽器，用於呼叫你的 Gemini 額度。
                  </div>
                </div>
              )}
            </div>

            <button style={styles.btnGhost} onClick={() => setShowMemory((v) => !v)}>
              {showMemory ? "隱藏 AI 記憶" : "顯示 AI 記憶"}
            </button>
          </div>
        </div>

        {showMemory && (
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
      <div style={{ padding: "0 16px 18px" }}>
        <SectionTitle
          title={`衣櫥（${stats.total}）`}
          right={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button style={styles.btn} onClick={() => setSelectedIds([])}>清空勾選</button>
              <button style={styles.btn} onClick={() => { setAddOpen(true); setTimeout(() => fileRef.current?.click(), 30); }}>批量匯入</button>
              <button style={styles.btnPrimary} onClick={openAdd}>＋ 新衣入庫</button>
            </div>
          }
        />

        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.chip(catFilter === "全部")} onClick={() => setCatFilter("全部")}>全部</button>
            {cats.map((c) => (
              <button key={c} style={styles.chip(catFilter === c)} onClick={() => setCatFilter(c)}>{c}</button>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>勾選多件衣物 → 到「自選」請 AI 解析。</div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {list.map((x) => (
            <div key={x.id} style={styles.card}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ position: "relative" }}>
                  <img 
                    src={getThumbSrc(x)} 
                    alt={x.name}
                    onClick={() => handleViewFullImage(x.id, getThumbSrc(x))}
                    style={{ cursor: "pointer", width: 92, height: 92, borderRadius: 18, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)" }} 
                  />
                  <div style={{ position: "absolute", left: 8, top: 8 }}>
                    <input type="checkbox" checked={selectedIds.includes(x.id)} onChange={() => toggleSelect(x.id)} style={{ width: 18, height: 18 }} />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 1000, fontSize: 16 }}>{x.name}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={styles.btn} onClick={() => moveItem(x.id)}>✈️ {x.location}</button>
                      <button style={styles.btn} onClick={() => startEditItem(x)}>✏️</button>
                      <button style={styles.btn} onClick={() => handleDeleteItem(x.id)}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", marginTop: 4 }}>
                    {x.category} · {x.style} · {x.material}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {x.colors?.dominant && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 6, background: x.colors.dominant, border: "1px solid rgba(0,0,0,0.1)" }} />
                      </div>
                    )}
                    {x.colors?.secondary && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 6, background: x.colors.secondary, border: "1px solid rgba(0,0,0,0.1)" }} />
                      </div>
                    )}
                    <div style={{ fontSize: 11, background: "rgba(0,0,0,0.04)", padding: "2px 6px", borderRadius: 8 }}>厚度 {x.thickness}</div>
                    {x.temp && <div style={{ fontSize: 11, background: "rgba(0,0,0,0.04)", padding: "2px 6px", borderRadius: 8 }}>{x.temp.min}°C ~ {x.temp.max}°C</div>}
                  </div>
                  {x.notes && <div style={{ fontSize: 12, color: "rgba(0,0,0,0.65)", marginTop: 6 }}>{x.notes}</div>}
                </div>
              </div>
            </div>
          ))}
          {list.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "rgba(0,0,0,0.4)" }}>沒有符合的衣物</div>}
        </div>
      </div>
    );
  }

  function MixPage() {
    const selectedItems = closet.filter((x) => selectedIds.includes(x.id));

    return (
      <div style={{ padding: "0 16px 18px" }}>
        <SectionTitle
          title="自選搭配"
          right={
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btn} onClick={() => setSelectedIds([])}>清空</button>
              <button style={styles.btnPrimary} onClick={() => setTab("closet")}>去衣櫥勾選</button>
            </div>
          }
        />

        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}><div style={{ fontWeight: 1000 }}>參數</div><div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{weatherCodeMeta(weather.code, weather.feelsLikeC).icon} 體感 {weather.feelsLikeC ?? "--"}°C</div></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={mixOccasion} onChange={(e) => setMixOccasion(e.target.value)} style={{ ...styles.input, width: 160 }}>
              {["日常", "上班", "約會", "聚會", "戶外", "正式"].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            <input style={{ ...styles.input, width: 160 }} value={mixTempC} onChange={(e) => setMixTempC(e.target.value)} placeholder="目前體感（已自動帶入）" inputMode="numeric" />
            <button style={styles.btnPrimary} onClick={runMixExplain} disabled={loading}>
              {loading ? "AI 分析中…" : "AI 解析搭配"}
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>已選 {selectedItems.length} 件。解析完成可直接收藏 + 寫入時間軸。</div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {selectedItems.map((x) => (
            <div key={x.id} style={styles.card}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <img src={getThumbSrc(x)} alt="" style={{ width: 70, height: 70, borderRadius: 16, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 1000 }}>{x.name}</div>
                  <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", marginTop: 4 }}>
                    {x.category} · {x.location}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function StylistPage() {
    return (
      <div style={{ padding: "0 16px 18px" }}>
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
            <button style={styles.btnPrimary} onClick={runStylist} disabled={loading} style={{ ...styles.btnPrimary, width: "100%" }}>
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
      <div style={{ padding: "0 16px 18px" }}>
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
      <div style={{ padding: "0 16px 18px" }}>
        <SectionTitle
          title="Hub（收藏與紀錄）"
          right={
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btn} onClick={() => setTab("learn")}>📚 去教材</button>
              <button style={styles.btnPrimary} onClick={() => setTab("mix")}>🧩 去自選</button>
            </div>
          }
        />

        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={styles.segmentWrap}>
            <button style={styles.chip(hubSub === "favorites")} onClick={() => setHubSub("favorites")}>❤️ 收藏</button>
            <button style={styles.chip(hubSub === "diary")} onClick={() => setHubSub("diary")}>🕒 紀錄</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>收藏會影響 Style Memory；紀錄是 Outfit Timeline + Profile。</div>
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
          <div style={{ fontWeight: 1000, marginBottom: 8 }}>User Profile</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input style={{ ...styles.input, width: 80 }} value={profile.height} onChange={(e) => setProfile({ ...profile, height: e.target.value })} placeholder="身高" type="number" />
            <input style={{ ...styles.input, width: 80 }} value={profile.weight} onChange={(e) => setProfile({ ...profile, weight: e.target.value })} placeholder="體重" type="number" />
            <select value={profile.bodyType} onChange={(e) => setProfile({ ...profile, bodyType: e.target.value })} style={{ ...styles.input, width: 180 }}>
              {["H型", "倒三角形", "梨形", "沙漏型", "圓形(O型)"].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Stylist 會參考此 Profile；教材/收藏會影響 Style Memory。</div>
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

  return (
    <div style={styles.page}>
      <TopBar />

      <div style={{ display: addOpen ? "block" : "none", padding: "0 16px 18px" }}>
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
            if (e.target.files && e.target.files.length) {
              onPickFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />

        {addErr && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "rgba(255,0,0,0.05)", border: "1px solid rgba(255,0,0,0.15)" }}>
            <div style={{ fontWeight: 1000, color: "red" }}>發生錯誤</div>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.75)", marginTop: 6 }}>{addErr}</div>
          </div>
        )}

        {batchState.total > 0 && (
          <div style={{ marginTop: 12, ...styles.card }}>
            <div style={{ fontWeight: 1000 }}>批量匯入進度</div>
            <div style={{ marginTop: 8, fontSize: 13, color: "rgba(0,0,0,0.7)" }}>
              {batchState.running ? "處理中…" : "已完成"} {batchState.done}/{batchState.total}｜成功 {batchState.ok}｜失敗 {batchState.fail}
            </div>
            {!!batchState.current && <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>目前：{batchState.current}</div>}
            <div style={{ marginTop: 8, height: 8, borderRadius: 999, overflow: "hidden", background: "rgba(0,0,0,0.06)" }}>
              <div style={{ height: "100%", width: `${batchState.total ? (batchState.done / batchState.total) * 100 : 0}%`, background: "linear-gradient(90deg,#6b5cff,#8b7bff)" }} />
            </div>
          </div>
        )}

        {!addImage && (
          <div style={{ marginTop: 12, ...styles.card }}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>提示</div>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)", lineHeight: 1.5 }}>
              可單張入庫（AI 辨識後可手動修正）或一次多選批量匯入（自動建檔）。大圖會存在底層資料庫，確保流暢。
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={styles.btnPrimary} onClick={() => fileRef.current?.click()}>選擇照片（可多選）</button></div>
            </div>
          </div>
        )}

        {addImage && (
          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <img src={addImage} alt="" style={{ width: 132, height: 132, borderRadius: 18, objectFit: "cover", border: "1px solid rgba(0,0,0,0.10)" }} />
            {addDraft ? (
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input style={{ ...styles.input, flex: 1 }} value={addDraft.name} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} placeholder="單品名稱" />
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                  <select style={{ ...styles.input, width: 90 }} value={addDraft.category} onChange={(e) => setAddDraft({ ...addDraft, category: e.target.value })}>
                    {["上衣", "下著", "鞋子", "外套", "包包", "配件", "內著", "帽子", "飾品"].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                  <select style={{ ...styles.input, flex: 1 }} value={addDraft.location} onChange={(e) => setAddDraft({ ...addDraft, location: e.target.value })}>
                    {["台北", "新竹"].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button style={{ ...styles.btnPrimary, width: "100%" }} onClick={confirmAdd}>✓ 確認入庫</button>
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

      {editDraft && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ ...styles.card, width: "min(760px, 100%)", maxHeight: "86vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 1000, fontSize: 18 }}>編輯單品資料</div>
              <button style={styles.btnGhost} onClick={() => setEditDraft(null)}>關閉</button>
            </div>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
              <img src={getThumbSrc(editDraft)} alt="" style={{ width: 120, height: 120, borderRadius: 16, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)" }} />
              <div style={{ display: "grid", gap: 8 }}>
                <input style={styles.input} value={editDraft.name || ""} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} placeholder="名稱" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <select style={styles.input} value={editDraft.category || "上衣"} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}>
                    {["上衣", "下著", "鞋子", "外套", "包包", "配件", "內著", "帽子", "飾品"].map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                  <select style={styles.input} value={editDraft.location || "台北"} onChange={(e) => setEditDraft({ ...editDraft, location: e.target.value })}>
                    {["台北", "新竹"].map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input style={styles.input} value={editDraft.style || ""} onChange={(e) => setEditDraft({ ...editDraft, style: e.target.value })} placeholder="風格" />
                  <input style={styles.input} value={editDraft.material || ""} onChange={(e) => setEditDraft({ ...editDraft, material: e.target.value })} placeholder="材質" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  <input style={styles.input} type="number" min="1" max="5" value={editDraft.thickness ?? 3} onChange={(e) => setEditDraft({ ...editDraft, thickness: e.target.value })} placeholder="厚度" />
                  <input style={styles.input} type="number" value={editDraft?.temp?.min ?? ""} onChange={(e) => setEditDraft({ ...editDraft, temp: { ...(editDraft.temp || {}), min: e.target.value } })} placeholder="最低適溫" />
                  <input style={styles.input} type="number" value={editDraft?.temp?.max ?? ""} onChange={(e) => setEditDraft({ ...editDraft, temp: { ...(editDraft.temp || {}), max: e.target.value } })} placeholder="最高適溫" />
                </div>
                <textarea style={{ ...styles.textarea, minHeight: 72 }} value={editDraft.notes || ""} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} placeholder="備註" />
                <button style={styles.btnPrimary} onClick={saveEditItem}>儲存修改</button>
              </div>
            </div>
          </div>
        </div>
      )}

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