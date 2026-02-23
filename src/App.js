import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveFullImage, loadFullImage, deleteFullImage } from './db';

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
  STYLE_MEMORY: "wg_style_memory"
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
  const [weatherNow, setWeatherNow] = useState({ city: null, tempC: null, feelsLikeC: null, humidity: null, code: null, error: "" });
  const [weatherTomorrow, setWeatherTomorrow] = useState({ city: null, tempMinC: null, tempMaxC: null, feelsLikeC: null, code: null, error: "" });
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [mixWhen, setMixWhen] = useState("now");
  const [styWhen, setStyWhen] = useState("now");
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

  // ================= 新增的大圖預覽狀態 =================
  const [fullViewMode, setFullViewMode] = useState(null);
  // ======================================================

  const styleMemory = useMemo(() => buildStyleMemory({ favorites, notes, closet }), [favorites, notes, closet]);

  useEffect(() => saveJson(K.CLOSET, closet), [closet]);
  useEffect(() => saveJson(K.FAVORITES, favorites), [favorites]);
  useEffect(() => saveJson(K.NOTES, notes), [notes]);
  useEffect(() => saveJson(K.TIMELINE, timeline), [timeline]);
  useEffect(() => saveJson(K.PROFILE, profile), [profile]);
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

  /**
   * ===========
   * Core actions
   * ===========
   */
  function openAdd() {
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
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "vision", imageDataUrl: aiBase64 })
      });
      
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "AI 分析失敗");
      if (j.error && !j.name) throw new Error(j.error);

      const newItemId = uid();
      
      // 4. 【重點】將高畫質大圖存入 IndexedDB
      await saveFullImage(newItemId, aiBase64); 

      // 5. 存入衣服清單狀態 (注意：image 欄位只存縮圖 thumbBase64！)
      const newItem = {
        id: newItemId,
        image: thumbBase64, 
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

  function confirmAdd() {
    if (!addDraft) return;
    setCloset([addDraft, ...closet]);
    setAddOpen(false);
  }

  // 查看大圖
  async function handleViewFullImage(id, fallbackThumb) {
    const original = await loadFullImage(id);
    setFullViewMode(original || fallbackThumb);
  }

  // 刪除衣物時，同步刪除大圖
  async function handleDeleteItem(id) {
    if (!window.confirm("確定刪除此衣物？")) return;
    setCloset(closet.filter((x) => x.id !== id));
    setSelectedIds(selectedIds.filter((x) => x !== id));
    await deleteFullImage(id);
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

  function weatherCodeMeta(code, feelsLikeC) {
    const c = Number(code);
    let icon = "🌤️";
    if ([0].includes(c)) icon = "☀️";
    else if ([1, 2, 3].includes(c)) icon = "⛅";
    else if ([45, 48].includes(c)) icon = "🌫️";
    else if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c)) icon = "🌧️";
    else if ([71,73,75,77,85,86].includes(c)) icon = "❄️";
    else if ([95,96,99].includes(c)) icon = "⛈️";
    if (typeof feelsLikeC === "number") {
      if (feelsLikeC >= 30) icon = "🥵";
      else if (feelsLikeC <= 12) icon = "🥶";
    }
    return { icon };
  }

  function getWeatherCityByLocation() {
    return location === "新竹" ? { city: "新竹", lat: 24.8138, lon: 120.9675 } : { city: "台北", lat: 25.0330, lon: 121.5654 };
  }

  async function detectWeatherAuto() {
    setWeatherLoading(true);
    try {
      const picked = getWeatherCityByLocation();
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${picked.lat}&longitude=${picked.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min&forecast_days=3&timezone=Asia%2FTaipei`;
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok || !j) throw new Error("天氣抓取失敗");
      const cur = j.current || {};
      const d = j.daily || {};
      const nowPack = {
        city: picked.city,
        tempC: Number.isFinite(Number(cur.temperature_2m)) ? Math.round(Number(cur.temperature_2m)) : null,
        feelsLikeC: Number.isFinite(Number(cur.apparent_temperature)) ? Math.round(Number(cur.apparent_temperature)) : null,
        humidity: Number.isFinite(Number(cur.relative_humidity_2m)) ? Math.round(Number(cur.relative_humidity_2m)) : null,
        code: cur.weather_code ?? null,
        error: ""
      };
      const tMin = Number(d.temperature_2m_min?.[1]);
      const tMax = Number(d.temperature_2m_max?.[1]);
      const afMin = Number(d.apparent_temperature_min?.[1]);
      const afMax = Number(d.apparent_temperature_max?.[1]);
      const tomorrowFeels = Number.isFinite(afMin) && Number.isFinite(afMax) ? Math.round((afMin + afMax) / 2) : (Number.isFinite(tMin) && Number.isFinite(tMax) ? Math.round((tMin + tMax) / 2) : null);
      const tmPack = {
        city: picked.city,
        tempMinC: Number.isFinite(tMin) ? Math.round(tMin) : null,
        tempMaxC: Number.isFinite(tMax) ? Math.round(tMax) : null,
        feelsLikeC: tomorrowFeels,
        code: d.weather_code?.[1] ?? null,
        error: ""
      };
      setWeatherNow(nowPack);
      setWeatherTomorrow(tmPack);
    } catch (e) {
      const msg = e?.message || "天氣抓取失敗";
      setWeatherNow((w) => ({ ...w, error: msg }));
      setWeatherTomorrow((w) => ({ ...w, error: msg }));
    } finally {
      setWeatherLoading(false);
    }
  }

  function applyWeatherTempToMix(mode) {
    const target = mode === "tomorrow" ? weatherTomorrow : weatherNow;
    if (target?.feelsLikeC != null) setMixTempC(String(target.feelsLikeC));
  }

  function applyWeatherTempToSty(mode) {
    const target = mode === "tomorrow" ? weatherTomorrow : weatherNow;
    if (target?.feelsLikeC != null) setStyTempC(String(target.feelsLikeC));
  }

  function getDeltaWarning() {
    const a = Number(weatherNow?.feelsLikeC);
    const b = Number(weatherTomorrow?.feelsLikeC);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const d = b - a;
    if (Math.abs(d) < 3) return null;
    return d < 0
      ? `明日體感可能比現在低 ${Math.abs(d)}°C，建議先準備保暖一點。`
      : `明日體感可能比現在高 ${Math.abs(d)}°C，建議避免穿太厚。`;
  }

  useEffect(() => {
    detectWeatherAuto();
  }, [location]);

  useEffect(() => {
    const target = mixWhen === "tomorrow" ? weatherTomorrow : weatherNow;
    if (target?.feelsLikeC != null) setMixTempC(String(target.feelsLikeC));
  }, [mixWhen, weatherNow.feelsLikeC, weatherTomorrow.feelsLikeC]);

  useEffect(() => {
    const target = styWhen === "tomorrow" ? weatherTomorrow : weatherNow;
    if (target?.feelsLikeC != null) setStyTempC(String(target.feelsLikeC));
  }, [styWhen, weatherNow.feelsLikeC, weatherTomorrow.feelsLikeC]);

  async function runMixExplain() {
    const selectedItems = closet.filter((x) => selectedIds.includes(x.id));
    if (selectedItems.length === 0) return alert("請先勾選衣物");

    setLoading(true);
    try {
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "mixExplain",
          selectedItems,
          profile,
          styleMemory,
          tempC: mixTempC ? Number(mixTempC) : null,
          occasion: mixOccasion
        })
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
    setLoading(true);
    try {
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "stylist",
          closet,
          profile,
          location,
          occasion: styOccasion,
          style: styStyle,
          styleMemory,
          tempC: styTempC ? Number(styTempC) : null
        })
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

    setLoading(true);
    try {
      let aiSummary = null;
      if (doAiSummary) {
        const r = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: "noteSummarize",
            text: noteText || "",
            imageDataUrl: noteImage || null
          })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "AI 摘要失敗");
        aiSummary = j;
        setNoteAI(j);
      }

      const n = {
        id: uid(),
        type, 
        createdAt: Date.now(),
        text: noteText || "",
        image: noteImage || null,
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
          {item?.image ? (
            <img
              src={item.image}
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
                  <img src={x.image} alt="" style={{ width: 28, height: 28, borderRadius: 10, objectFit: "cover" }} />
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
                    src={x.image} 
                    alt={x.name}
                    onClick={() => handleViewFullImage(x.id, x.image)}
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
          <div style={{ fontWeight: 1000, marginBottom: 10 }}>參數</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button style={styles.chip(mixWhen === "now")} onClick={() => { setMixWhen("now"); applyWeatherTempToMix("now"); }}>現在</button>
            <button style={styles.chip(mixWhen === "tomorrow")} onClick={() => { setMixWhen("tomorrow"); applyWeatherTempToMix("tomorrow"); }}>隔日</button>
            <button style={styles.btnGhost} onClick={detectWeatherAuto} disabled={weatherLoading}>{weatherLoading ? "抓天氣中…" : "更新天氣"}</button>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)", alignSelf: "center" }}>
              {(mixWhen === "tomorrow" ? weatherTomorrow : weatherNow)?.city || ""} {weatherCodeMeta((mixWhen === "tomorrow" ? weatherTomorrow : weatherNow)?.code, (mixWhen === "tomorrow" ? weatherTomorrow : weatherNow)?.feelsLikeC).icon} 體感 {(mixWhen === "tomorrow" ? weatherTomorrow : weatherNow)?.feelsLikeC ?? "--"}°C
            </div>
          </div>
          {getDeltaWarning() && (
            <div style={{ marginBottom: 10, padding: 10, borderRadius: 12, background: "rgba(255,193,7,0.12)", border: "1px solid rgba(255,193,7,0.35)", fontSize: 12, color: "rgba(0,0,0,0.78)" }}>
              ⚠️ {getDeltaWarning()}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={mixOccasion} onChange={(e) => setMixOccasion(e.target.value)} style={{ ...styles.input, width: 160 }}>
              {["日常", "上班", "約會", "聚會", "戶外", "正式"].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            <input style={{ ...styles.input, width: 160 }} value={mixTempC} onChange={(e) => setMixTempC(e.target.value)} placeholder="體感溫度（可空）" inputMode="numeric" />
            <button style={styles.btnPrimary} onClick={runMixExplain} disabled={loading}>
              {loading ? "AI 分析中…" : "AI 解析搭配"}
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>已選 {selectedItems.length} 件。{mixWhen === "tomorrow" ? "目前採用隔日預報體感" : "目前採用現在體感"}。解析完成可直接收藏 + 寫入時間軸。</div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {selectedItems.map((x) => (
            <div key={x.id} style={styles.card}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <img src={x.image} alt="" style={{ width: 70, height: 70, borderRadius: 16, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)" }} />
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button style={styles.chip(styWhen === "now")} onClick={() => { setStyWhen("now"); applyWeatherTempToSty("now"); }}>現在</button>
            <button style={styles.chip(styWhen === "tomorrow")} onClick={() => { setStyWhen("tomorrow"); applyWeatherTempToSty("tomorrow"); }}>隔日</button>
            <button style={styles.btnGhost} onClick={detectWeatherAuto} disabled={weatherLoading}>{weatherLoading ? "抓天氣中…" : "更新天氣"}</button>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)", alignSelf: "center" }}>
              {(styWhen === "tomorrow" ? weatherTomorrow : weatherNow)?.city || ""} {weatherCodeMeta((styWhen === "tomorrow" ? weatherTomorrow : weatherNow)?.code, (styWhen === "tomorrow" ? weatherTomorrow : weatherNow)?.feelsLikeC).icon} 體感 {(styWhen === "tomorrow" ? weatherTomorrow : weatherNow)?.feelsLikeC ?? "--"}°C
            </div>
          </div>
          {getDeltaWarning() && (
            <div style={{ marginBottom: 10, padding: 10, borderRadius: 12, background: "rgba(255,193,7,0.12)", border: "1px solid rgba(255,193,7,0.35)", fontSize: 12, color: "rgba(0,0,0,0.78)" }}>
              ⚠️ {getDeltaWarning()}
            </div>
          )}
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
            <input style={{ ...styles.input, flex: 1 }} value={styTempC} onChange={(e) => setStyTempC(e.target.value)} placeholder="體感溫度（選填）" inputMode="numeric" />
            <button style={styles.btnPrimary} onClick={runStylist} disabled={loading} style={{ ...styles.btnPrimary, width: "100%" }}>
              {loading ? "AI 搭配中…" : "✨ 幫我搭配"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, ...styles.card, fontSize: 12, color: "rgba(0,0,0,0.65)" }}>
          現在：{weatherNow.city || "--"} {weatherCodeMeta(weatherNow.code, weatherNow.feelsLikeC).icon} 體感 {weatherNow.feelsLikeC ?? "--"}°C
          {"  ·  "}
          隔日：{weatherCodeMeta(weatherTomorrow.code, weatherTomorrow.feelsLikeC).icon} {weatherTomorrow.tempMinC ?? "--"}°C~{weatherTomorrow.tempMaxC ?? "--"}°C（估體感 {weatherTomorrow.feelsLikeC ?? "--"}°C）
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
                <button style={styles.btn} onClick={() => {
                  if (window.confirm("刪除這筆筆記？")) setNotes(notes.filter(x => x.id !== n.id));
                }}>🗑️</button>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                {n.image && <img src={n.image} alt="" style={{ width: 60, height: 60, borderRadius: 12, objectFit: "cover" }} />}
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
          ref={fileRef}
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              onPickFile(e.target.files[0]);
            }
          }}
        />

        {addErr && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "rgba(255,0,0,0.05)", border: "1px solid rgba(255,0,0,0.15)" }}>
            <div style={{ fontWeight: 1000, color: "red" }}>發生錯誤</div>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.75)", marginTop: 6 }}>{addErr}</div>
          </div>
        )}

        {!addImage && (
          <div style={{ marginTop: 12, ...styles.card }}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>提示</div>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)", lineHeight: 1.5 }}>
              選擇照片後會先壓縮再送 AI 分析（大圖會存在底層資料庫，確保流暢）。
            </div>
            <div style={{ marginTop: 12 }}>
              <button style={styles.btnPrimary} onClick={() => fileRef.current?.click()}>選擇照片</button>
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
