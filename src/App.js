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
  STYLE_MEMORY: "wg_style_memory",
  GEMINI_KEY: "wg_gemini_key",
  GEMINI_OK: "wg_gemini_ok"
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
    return true;
  } catch (e) {
    if (e && (e.name === "QuotaExceededError" || e.code === 22)) {
      console.error("LocalStorage 已滿：", key);
      return false;
    }
    console.error("saveJson 失敗：", key, e);
    return false;
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
  navText: { marginTop: 4, fontSize: 11, fontWeight: 900 },

  label: {
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 6,
    color: "rgba(0,0,0,0.65)"
  },

  fabAdd: {
    position: "fixed",
    right: 16,
    bottom: "calc(84px + env(safe-area-inset-bottom, 0px))",
    width: 58,
    height: 58,
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(90deg,#6b5cff,#8b7bff)",
    color: "#fff",
    fontSize: 30,
    fontWeight: 1000,
    lineHeight: 1,
    boxShadow: "0 10px 24px rgba(107,92,255,0.35)",
    zIndex: 60,
    cursor: "pointer"
  },
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

  const [showKeyEditor, setShowKeyEditor] = useState(false);

const [bootGateOpen, setBootGateOpen] = useState(() => {
  try {
    const k = (localStorage.getItem(K.GEMINI_KEY) || "").trim();
    const ok = localStorage.getItem(K.GEMINI_OK) === "1";
    return !(k && ok);
  } catch { return true; }
});
const [bootGateBusy, setBootGateBusy] = useState(false);
const [bootGateAnim, setBootGateAnim] = useState(false);
const [bootGateErr, setBootGateErr] = useState("");
const [bootKeyInput, setBootKeyInput] = useState(() => {
  try { return (localStorage.getItem(K.GEMINI_KEY) || "").trim(); } catch { return ""; }
});
  const [geminiKey, setGeminiKey] = useState(() => {
    try { return (localStorage.getItem(K.GEMINI_KEY) || "").trim(); } catch { return ""; }
  });
  const [geminiDraftKey, setGeminiDraftKey] = useState(() => {
    try { return (localStorage.getItem(K.GEMINI_KEY) || "").trim(); } catch { return ""; }
  });
  const geminiKeyRef = useRef(geminiKey || "");

  const [weather, setWeather] = useState({
    city: "",
    tempC: null,
    feelsLikeC: null,
    humidity: null,
    code: null,
    error: ""
  });
  const [weatherLoading, setWeatherLoading] = useState(false);

  const contentPad = "0 16px 18px";
  const isPhone = typeof window !== "undefined" ? window.innerWidth <= 768 : true;

  const [closet, setCloset] = useState(() => loadJson(K.CLOSET, []));
  const [favorites, setFavorites] = useState(() => loadJson(K.FAVORITES, []));
  const [notes, setNotes] = useState(() => loadJson(K.NOTES, []));
  const [timeline, setTimeline] = useState(() => loadJson(K.TIMELINE, []));
  const [profile, setProfile] = useState(() => loadJson(K.PROFILE, { height: 175, weight: 70, bodyType: "H型", gender: "male" }));

  const [selectedIds, setSelectedIds] = useState([]);
  const [mixSlots, setMixSlots] = useState({
    innerId: null,
    topId: null,
    outerId: null,
    hatId: null,
    bottomId: null,
    shoeId: null,
    accessoryIds: [],
    jewelryIds: [],
    bagIds: []
  });
  const [mixOccasion, setMixOccasion] = useState("日常");
  const [mixTempC, setMixTempC] = useState("");

  const [styOccasion, setStyOccasion] = useState("日常");
  const [styStyle, setStyStyle] = useState("極簡");
  const [styTempC, setStyTempC] = useState("");
  const [styResult, setStyResult] = useState(null);

  const [loading, setLoading] = useState(false);

  const fileRef = useRef(null);
  const fileMultiRef = useRef(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addStage, setAddStage] = useState("idle");
  const [addImage, setAddImage] = useState(null);
  const [addDraft, setAddDraft] = useState(null);
  const [addErr, setAddErr] = useState("");
  const [batchProgress, setBatchProgress] = useState(null); // {total,current,success,failed,running,cancelled,firstError,currentName}
  const batchCancelRef = useRef(false);
  const storageWarnedRef = useRef(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);

  const [noteText, setNoteText] = useState("");
  const [noteImage, setNoteImage] = useState(null);
  const [noteAI, setNoteAI] = useState(null);

  // ================= 新增的大圖預覽狀態 =================
  const [fullViewMode, setFullViewMode] = useState(null);
  // ======================================================

  const styleMemory = useMemo(() => buildStyleMemory({ favorites, notes, closet }), [favorites, notes, closet]);

  function persistWithQuotaGuard(key, value) {
    const ok = saveJson(key, value);
    if (ok) {
      if (storageWarnedRef.current) storageWarnedRef.current = false;
      return;
    }
    if (!storageWarnedRef.current) {
      storageWarnedRef.current = true;
      alert("儲存空間已滿！請清理部分衣物或教材，否則新資料將無法存檔。");
    }
  }

  useEffect(() => { persistWithQuotaGuard(K.CLOSET, closet); }, [closet]);
  useEffect(() => { persistWithQuotaGuard(K.FAVORITES, favorites); }, [favorites]);
  useEffect(() => { persistWithQuotaGuard(K.NOTES, notes); }, [notes]);
  useEffect(() => { persistWithQuotaGuard(K.TIMELINE, timeline); }, [timeline]);
  useEffect(() => { persistWithQuotaGuard(K.PROFILE, profile); }, [profile]);
  useEffect(() => { persistWithQuotaGuard(K.STYLE_MEMORY, { updatedAt: Date.now(), styleMemory }); }, [styleMemory]);

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


  function maskedKey(k) {
    const x = String(k || "").trim();
    if (!x) return "未設定";
    if (x.length <= 8) return "已設定";
    return `${x.slice(0, 6)}••••${x.slice(-4)}`;
  }

  function saveGeminiKey() {
    const k = (geminiDraftKey || "").trim();
    geminiKeyRef.current = k;
    setGeminiKey(k);
    try {
      localStorage.setItem(K.GEMINI_KEY, k);
      // 設定頁手動更換金鑰時，先清除已驗證旗標，避免舊狀態殘留
      if (k) localStorage.removeItem(K.GEMINI_OK);
      else localStorage.removeItem(K.GEMINI_OK);
    } catch {}
    alert(k ? "Gemini API Key 已儲存（下次重整會重新驗證）" : "已清除 Gemini API Key");
  }

  function getActiveGeminiKey() {
    // 來源優先順序：ref（最新可用）→ state（已設定）→ draft（設定頁尚未收合）→ boot gate input → localStorage
    // 並自動把找到的 key 回寫到 ref，避免不同流程（單張/批量）抓到空值。
    try {
      const candidates = [
        geminiKeyRef.current,
        geminiKey,
        geminiDraftKey,
        bootKeyInput,
        localStorage.getItem(K.GEMINI_KEY),
      ];
      const found = candidates.map((v) => String(v || '').trim()).find(Boolean) || '';
      if (found) geminiKeyRef.current = found;
      return found;
    } catch {
      const fallback = [geminiKeyRef.current, geminiKey, geminiDraftKey, bootKeyInput]
        .map((v) => String(v || '').trim())
        .find(Boolean) || '';
      if (fallback) geminiKeyRef.current = fallback;
      return fallback;
    }
  }

  async function apiPostGemini(payload) {
    const key = getActiveGeminiKey();
    if (!key) throw new Error("請先設定 Gemini API Key");
    const r = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, userApiKey: key })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "Gemini 呼叫失敗");
    return j;
  }


async function verifyGeminiKeyForGate(rawKey) {
  const key = String(rawKey || "").trim();
  if (!key) throw new Error("請先輸入 Gemini API Key");
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "ping", userApiKey: key }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.error || "金鑰驗證失敗");
  try {
    localStorage.setItem(K.GEMINI_KEY, key);
    localStorage.setItem(K.GEMINI_OK, "1");
  } catch {}
  geminiKeyRef.current = key;
  setGeminiKey(key);
  setGeminiDraftKey(key);
}

async function handleBootGateConfirm() {
  setBootGateErr("");
  setBootGateBusy(true);
  try {
    await verifyGeminiKeyForGate(bootKeyInput);
    setBootGateAnim(true);
    setTimeout(() => { setBootGateOpen(false); setBootGateAnim(false); }, 650);
  } catch (e) {
    setBootGateErr(e?.message || "金鑰驗證失敗");
  } finally {
    setBootGateBusy(false);
  }
}

  function weatherCodeMeta(code, feelsLikeC) {
    const c = Number(code);
    let icon = "🌤️";
    let text = "晴時多雲";
    if ([0].includes(c)) { icon = "☀️"; text = "晴"; }
    else if ([1,2,3].includes(c)) { icon = "⛅"; text = "多雲"; }
    else if ([45,48].includes(c)) { icon = "🌫️"; text = "霧"; }
    else if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c)) { icon = "🌧️"; text = "下雨"; }
    else if ([71,73,75,77,85,86].includes(c)) { icon = "❄️"; text = "下雪"; }
    else if ([95,96,99].includes(c)) { icon = "⛈️"; text = "雷雨"; }
    if (typeof feelsLikeC === "number") {
      if (feelsLikeC >= 30) icon = "🥵";
      else if (feelsLikeC <= 12) icon = "🥶";
    }
    return { icon, text };
  }

  async function detectWeatherAuto() {
    setWeatherLoading(true);
    try {
      const cityMap = {
        "台北": { lat: 25.0330, lon: 121.5654, city: "台北" },
        "新竹": { lat: 24.8138, lon: 120.9675, city: "新竹" }
      };
      let pos = null;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(
              (p) => resolve(p),
              (e) => reject(e),
              { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
            )
          );
        } catch {}
      }
      let lat, lon, city;
      if (pos?.coords) {
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
        city = Math.abs(lat - cityMap["新竹"].lat) < Math.abs(lat - cityMap["台北"].lat) ? "新竹" : "台北";
      } else {
        const fallback = cityMap[location === "新竹" ? "新竹" : "台北"];
        lat = fallback.lat; lon = fallback.lon; city = fallback.city;
      }

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&timezone=Asia%2FTaipei`;
      const r = await fetch(url);
      const j = await r.json();
      const cur = j?.current || {};
      const next = {
        city,
        tempC: Number.isFinite(cur.temperature_2m) ? Math.round(cur.temperature_2m) : null,
        feelsLikeC: Number.isFinite(cur.apparent_temperature) ? Math.round(cur.apparent_temperature) : null,
        humidity: Number.isFinite(cur.relative_humidity_2m) ? Math.round(cur.relative_humidity_2m) : null,
        code: cur.weather_code ?? null,
        error: ""
      };
      setWeather(next);
      if (next.feelsLikeC != null) {
        setMixTempC(String(next.feelsLikeC));
        setStyTempC(String(next.feelsLikeC));
      }
    } catch (e) {
      setWeather((w) => ({ ...w, error: "天氣抓取失敗" }));
    } finally {
      setWeatherLoading(false);
    }
  }

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
    batchCancelRef.current = false;
    setBatchProgress(null);
    setAddErr("");
    setAddOpen(true);
    setAddStage("idle");
    setAddImage(null);
    setAddDraft(null);
    setTimeout(() => fileRef.current?.click(), 30);
  }

  function openBatchImport() {
    batchCancelRef.current = false;
    setBatchProgress(null);
    setAddErr("");
    setAddOpen(true);
    setAddStage("batch");
    setAddImage(null);
    setAddDraft(null);
    // 等隱藏 input 掛載後再觸發，避免手機瀏覽器偶發沒反應
    setTimeout(() => fileMultiRef.current?.click(), 60);
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
      const thumbBase64 = await compressImage(originalBase64, 180, 0.5);
      const aiBase64 = await compressImage(originalBase64, 1200, 0.85);

      setAddImage(thumbBase64); // UI 上先預覽小圖

      setAddStage("analyze");
      // 3. 把高畫質大圖送給 AI 分析
      const j = await apiPostGemini({ task: "vision", imageDataUrl: aiBase64 });
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


  function getMixSelectedIds() {
    return [
      mixSlots.innerId,
      mixSlots.topId,
      mixSlots.outerId,
      mixSlots.hatId,
      mixSlots.bottomId,
      mixSlots.shoeId,
      ...(mixSlots.accessoryIds || []),
      ...(mixSlots.jewelryIds || []),
      ...(mixSlots.bagIds || [])
    ].filter(Boolean);
  }

  function setMixSlotSingle(slotKey, itemId) {
    setMixSlots((prev) => ({
      ...prev,
      [slotKey]: prev[slotKey] === itemId ? null : itemId
    }));
  }

  function toggleMixSlotMulti(slotKey, itemId) {
    setMixSlots((prev) => {
      const arr = Array.isArray(prev[slotKey]) ? prev[slotKey] : [];
      const next = arr.includes(itemId) ? arr.filter((x) => x !== itemId) : [...arr, itemId];
      return { ...prev, [slotKey]: next };
    });
  }

  async function runMixExplain() {
    const slotIds = getMixSelectedIds();
    const effectiveIds = slotIds.length ? slotIds : selectedIds;
    const selectedItems = closet.filter((x) => effectiveIds.includes(x.id));
    if (selectedItems.length === 0) return alert("請先在槽位放入衣物（或到衣櫥勾選）");

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
        meta: {
          ...(j._meta || null),
          mixSlotsSnapshot: mixSlots
        }
      };

      if (window.confirm("AI 已解析多選搭配。要直接收藏到「收藏」與「時間軸」嗎？")) {
        addFavoriteAndTimeline(fav, { occasion: mixOccasion, tempC: mixTempC, mixSlots });
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
        const j = await apiPostGemini({
          task: "noteSummarize",
          text: noteText || "",
          imageDataUrl: noteImage || null
        });
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

  function renderLookPreviewBoard({ title, upper = [], lower = [], accessories = [], subtitle = "" }) {
    const Tile = ({ label, item, multi = false }) => {
      if (!item) {
        return (
          <div style={{ display: "grid", justifyItems: "center", gap: 6, padding: "10px 8px", borderRadius: 14, border: "1px dashed rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.45)", minHeight: 94 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(0,0,0,0.05)" }} />
            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.42)", fontWeight: 800 }}>{label}</div>
          </div>
        );
      }
      return (
        <div style={{ display: "grid", justifyItems: "center", gap: 6, padding: "10px 8px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.82)", minHeight: 94 }}>
          <img src={item.image} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)" }} />
          <div style={{ fontSize: 11, fontWeight: 900, textAlign: "center", lineHeight: 1.15, color: "rgba(0,0,0,0.78)" }}>{label}</div>
          {!multi && <div style={{ fontSize: 10, color: "rgba(0,0,0,0.52)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72 }}>{item.name}</div>}
        </div>
      );
    };

    const MultiRow = ({ label, items }) => (
      <div style={{ marginTop: 8, borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.7)", padding: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,0,0,0.68)", marginBottom: 8 }}>{label}</div>
        {items.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {items.map((it) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 999, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.9)" }}>
                <img src={it.image} alt="" style={{ width: 24, height: 24, borderRadius: 8, objectFit: "cover" }} />
                <span style={{ fontSize: 11, fontWeight: 800 }}>{it.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>（未選擇）</div>
        )}
      </div>
    );

    return (
      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 1000 }}>{title}</div>
          {!!subtitle && <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)" }}>{subtitle}</div>}
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,0,0,0.62)", marginBottom: 6 }}>上半身</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
            {upper.map((x) => <Tile key={x.label} label={x.label} item={x.item} />)}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,0,0,0.62)", marginBottom: 6 }}>下半身</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
            {lower.map((x) => <Tile key={x.label} label={x.label} item={x.item} />)}
          </div>
        </div>

        <MultiRow label="配件" items={accessories} />
      </div>
    );
  }

  function renderMixSlotsPreviewCard() {
    const accItems = [...(mixSlots.accessory || []), ...(mixSlots.jewelry || []), ...(mixSlots.bag || [])]
      .map(getItemById)
      .filter(Boolean);

    const selectedCount =
      ["inner", "top", "outer", "hat", "bottom", "shoe"].filter((k) => !!mixSlots[k]).length + accItems.length;

    if (selectedCount === 0) return null;

    return renderLookPreviewBoard({
      title: "自選穿搭示意圖",
      subtitle: `已選 ${selectedCount} 件`,
      upper: [
        { label: "內著", item: getItemById(mixSlots.inner) },
        { label: "上衣", item: getItemById(mixSlots.top) },
        { label: "外套", item: getItemById(mixSlots.outer) },
        { label: "帽子", item: getItemById(mixSlots.hat) },
      ],
      lower: [
        { label: "下著", item: getItemById(mixSlots.bottom) },
        { label: "鞋子", item: getItemById(mixSlots.shoe) },
      ],
      accessories: accItems
    });
  }

  function renderStylistPreviewCard(outfit) {
    if (!outfit) return null;
    const accItems = [
      ...(outfit.accessoryIds || []),
      ...(outfit.jewelryIds || []),
      ...(outfit.bagIds || []),
    ].map(getItemById).filter(Boolean);

    return renderLookPreviewBoard({
      title: "AI 穿搭示意圖",
      subtitle: outfit.styleName || "Stylist Result",
      upper: [
        { label: "內著", item: getItemById(outfit.innerId) },
        { label: "上衣", item: getItemById(outfit.topId) },
        { label: "外套", item: getItemById(outfit.outerId) },
        { label: "帽子", item: getItemById(outfit.hatId) },
      ],
      lower: [
        { label: "下著", item: getItemById(outfit.bottomId) },
        { label: "鞋子", item: getItemById(outfit.shoeId) },
      ],
      accessories: accItems
    });
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
              <button style={styles.btn} onClick={openBatchImport}>批量匯入</button><button style={styles.btnPrimary} onClick={openAdd}>＋ 新衣入庫</button>
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
                      <button style={styles.btn} onClick={() => openEditItem(x)}>✏️ 編輯</button>
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
        <button style={styles.fabAdd} onClick={openAdd}>＋</button>
      </div>
    );
  }


  function openEditItem(item) {
    if (!item) return;
    setEditDraft({
      id: item.id,
      name: item.name || "",
      category: item.category || "上衣",
      style: item.style || "休閒",
      location: item.location || "台北",
      tempMin: Number(item?.temp?.min ?? 15),
      tempMax: Number(item?.temp?.max ?? 28),
    });
    setEditOpen(true);
  }

  function saveEditItem() {
    if (!editDraft?.id) return;

    const nextMin = Number(editDraft.tempMin);
    const nextMax = Number(editDraft.tempMax);

    setCloset((prev) =>
      prev.map((x) => {
        if (x.id !== editDraft.id) return x;
        return {
          ...x,
          name: String(editDraft.name || "").trim() || x.name || "未命名單品",
          category: editDraft.category || x.category || "上衣",
          style: editDraft.style || x.style || "休閒",
          location: editDraft.location || x.location || "台北",
          temp: {
            min: Number.isFinite(nextMin) ? nextMin : (x.temp?.min ?? 15),
            max: Number.isFinite(nextMax) ? nextMax : (x.temp?.max ?? 28),
          },
        };
      })
    );

    setEditOpen(false);
    setEditDraft(null);
  }

  function MixPage() {
    const [activePicker, setActivePicker] = useState("topId");

    const slotDefs = {
      upper: [
        { key: "topId", label: "上衣", categories: ["上衣"], multi: false },
        { key: "innerId", label: "內著", categories: ["內著", "內搭"], multi: false },
        { key: "outerId", label: "外套", categories: ["外套"], multi: false },
        { key: "hatId", label: "帽子", categories: ["帽子"], multi: false },
      ],
      lower: [
        { key: "bottomId", label: "下著", categories: ["下著"], multi: false },
        { key: "shoeId", label: "鞋子", categories: ["鞋子"], multi: false },
      ],
      acc: [
        { key: "accessoryIds", label: "配件", categories: ["配件"], multi: true },
        { key: "jewelryIds", label: "飾品", categories: ["飾品"], multi: true },
        { key: "bagIds", label: "包包", categories: ["包包"], multi: true },
      ],
    };

    const allSlotDefs = [...slotDefs.upper, ...slotDefs.lower, ...slotDefs.acc];
    const currentDef = allSlotDefs.find((s) => s.key === activePicker) || allSlotDefs[0];
    const pickerItems = closetFiltered.filter((x) => (currentDef.categories || []).includes(x.category));

    const selectedSlotIds = getMixSelectedIds();
    const selectedItems = closet.filter((x) => selectedSlotIds.includes(x.id));

    const slotHas = (def, id) => {
      if (def.multi) return (mixSlots[def.key] || []).includes(id);
      return mixSlots[def.key] === id;
    };

    const onPickForSlot = (def, id) => {
      if (def.multi) toggleMixSlotMulti(def.key, id);
      else setMixSlotSingle(def.key, id);
    };

    const renderSlot = (def) => {
      const ids = def.multi ? (mixSlots[def.key] || []) : (mixSlots[def.key] ? [mixSlots[def.key]] : []);
      const items = ids.map(getItemById).filter(Boolean);
      const active = activePicker === def.key;

      return (
        <div
          key={def.key}
          onClick={() => setActivePicker(def.key)}
          style={{
            ...styles.card,
            padding: 10,
            cursor: "pointer",
            border: active ? "1px solid rgba(107,92,255,0.35)" : "1px solid rgba(0,0,0,0.06)",
            background: active ? "rgba(107,92,255,0.05)" : "rgba(255,255,255,0.72)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 900 }}>{def.label}</div>
            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
              {def.multi ? `${items.length} 件` : (items[0] ? "已選" : "未選")}
            </div>
          </div>

          {items.length === 0 ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "rgba(0,0,0,0.45)" }}>
              點選此槽位後，從下方清單挑選
            </div>
          ) : def.multi ? (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {items.map((it) => (
                <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 999, background: "rgba(0,0,0,0.04)" }}>
                  <img src={it.image} alt="" style={{ width: 20, height: 20, borderRadius: 6, objectFit: "cover" }} />
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{it.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <img src={items[0].image} alt="" style={{ width: 34, height: 34, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)" }} />
              <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2 }}>{items[0].name}</div>
            </div>
          )}
        </div>
      );
    };

    return (
      <div style={{ padding: "0 16px 18px" }}>
        <SectionTitle
          title="自選搭配"
          right={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={styles.btn}
                onClick={() => {
                  setMixSlots({
                    innerId: null, topId: null, outerId: null, hatId: null,
                    bottomId: null, shoeId: null, accessoryIds: [], jewelryIds: [], bagIds: []
                  });
                }}
              >
                清空槽位
              </button>
              <button style={styles.btnPrimary} onClick={runMixExplain} disabled={loading}>
                {loading ? "AI 分析中…" : "AI 解析搭配"}
              </button>
            </div>
          }
        />

        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={{ fontWeight: 1000, marginBottom: 10 }}>參數</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={mixOccasion} onChange={(e) => setMixOccasion(e.target.value)} style={{ ...styles.input, width: 160 }}>
              {["日常", "上班", "約會", "聚會", "戶外", "正式"].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            <input style={{ ...styles.input, width: 160 }} value={mixTempC} onChange={(e) => setMixTempC(e.target.value)} placeholder="目前溫度（可空）" inputMode="numeric" />
            <button style={styles.btn} onClick={() => setTab("closet")}>去衣櫥管理</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
            槽位模式：同類別單選（上衣/下著/鞋子…），配件/飾品/包包可多選。
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div style={styles.card}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>上半身</div>
            <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: 10 }}>
              {slotDefs.upper.map(renderSlot)}
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>下半身</div>
            <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr 1fr" : "repeat(2, minmax(0,1fr))", gap: 10 }}>
              {slotDefs.lower.map(renderSlot)}
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>配件</div>
            <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 10 }}>
              {slotDefs.acc.map(renderSlot)}
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 1000 }}>候選清單：{currentDef.label}</div>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                {currentDef.multi ? "可多選" : "單選，再點一次可取消"}
              </div>
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {allSlotDefs.map((d) => (
                <button key={d.key} style={styles.chip(activePicker === d.key)} onClick={() => setActivePicker(d.key)}>
                  {d.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {pickerItems.map((x) => {
                const picked = slotHas(currentDef, x.id);
                return (
                  <div
                    key={x.id}
                    onClick={() => onPickForSlot(currentDef, x.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      borderRadius: 14,
                      border: picked ? "1px solid rgba(107,92,255,0.25)" : "1px solid rgba(0,0,0,0.08)",
                      background: picked ? "rgba(107,92,255,0.08)" : "rgba(255,255,255,0.65)",
                      padding: 8,
                      cursor: "pointer"
                    }}
                  >
                    <img src={x.image} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</div>
                      <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{x.category} · {x.location}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: picked ? "#5b4bff" : "rgba(0,0,0,0.45)" }}>
                      {picked ? (currentDef.multi ? "已加入" : "已選擇") : "點選"}
                    </div>
                  </div>
                );
              })}
              {pickerItems.length === 0 && (
                <div style={{ fontSize: 13, color: "rgba(0,0,0,0.5)", padding: "8px 0" }}>
                  目前衣櫥裡沒有「{currentDef.label}」類別的單品。
                </div>
              )}
            </div>
          </div>

          {renderMixSlotsPreviewCard()}

          <div style={styles.card}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>目前已選（{selectedItems.length} 件）</div>
            <div style={{ display: "grid", gap: 8 }}>
              {selectedItems.map((x) => (
                <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, background: "rgba(0,0,0,0.03)" }}>
                  <img src={x.image} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, fontSize: 13 }}>{x.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{x.category}</div>
                  </div>
                </div>
              ))}
              {selectedItems.length === 0 && (
                <div style={{ fontSize: 13, color: "rgba(0,0,0,0.5)" }}>尚未放入任何槽位。</div>
              )}
            </div>
          </div>
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
            <input style={{ ...styles.input, flex: 1 }} value={styTempC} onChange={(e) => setStyTempC(e.target.value)} placeholder="目前溫度（選填）" inputMode="numeric" />
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
            {renderStylistPreviewCard(styResult.outfit || {})}
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
              r.onload = () => compressImage(r.result, 320, 0.6).then(setNoteImage);
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
      <div style={{ padding: contentPad }}>
        <SectionTitle
          title="Hub（收藏與紀錄）"
          right={
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btn} onClick={() => setHubSub("learn")}>📚 教材</button>
              <button style={styles.btnPrimary} onClick={() => setTab("mix")}>🧩 去自選</button>
            </div>
          }
        />

        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={styles.segmentWrap}>
            <button style={styles.chip(hubSub === "favorites")} onClick={() => setHubSub("favorites")}>❤️ 收藏</button>
            <button style={styles.chip(hubSub === "diary")} onClick={() => setHubSub("diary")}>🕒 紀錄</button>
            <button style={styles.chip(hubSub === "learn")} onClick={() => setHubSub("learn")}>📚 教材</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
            收藏會影響 Style Memory；紀錄是 Outfit Timeline；教材可用來累積 AI 風格記憶。
          </div>
        </div>

        {hubSub === "favorites" ? <FavoritesPanel /> : hubSub === "diary" ? <DiaryPanel /> : <LearnPage />}
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

  function SettingsPage() {
    return (
      <div style={{ padding: contentPad }}>
        <SectionTitle title="個人設定" />
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
                  <button style={styles.btn} onClick={() => { try { localStorage.removeItem(K.GEMINI_KEY); localStorage.removeItem(K.GEMINI_OK); localStorage.setItem(K.GEMINI_KEY, ""); } catch {} geminiKeyRef.current = ""; setGeminiDraftKey(""); setGeminiKey(""); }}>清除</button>
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
                {(profile.gender === "female" ? ["沙漏型", "梨形", "倒三角形", "H型", "蘋果型"] : profile.gender === "male" ? ["H型", "倒三角形", "矩形", "圓形(O型)", "梨形"] : ["H型", "倒三角形", "梨形", "沙漏型", "圓形(O型)"]).map((x) => <option key={x} value={x}>{x}</option>)}
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
      </div>
    );
  }


  
    function openBatchPicker() {
    setAddErr("");
    setAddOpen(true);
    setAddStage("batch");
    setTimeout(() => {
      try { if (fileMultiRef.current) fileMultiRef.current.click(); }
      catch (e) { setAddErr(`無法開啟批量匯入：${e?.message || "未知錯誤"}`); }
    }, 0);
  }

async function onPickFilesBatch(files) {
    const list = Array.from(files || []);
    if (!list.length) return;

    // 先檢查 BYOK（避免跑到一半才失敗）
    const key = getActiveGeminiKey();
    if (!key) {
      setAddOpen(true);
      setAddStage("batch");
      setAddErr("批量匯入失敗，請先確認 Gemini API Key 已設定且可用。");
      setBatchProgress({
        total: list.length,
        current: 0,
        success: 0,
        failed: 0,
        running: false,
        cancelled: false,
        firstError: "Gemini API Key 未設定",
        currentName: ""
      });
      return;
    }

    setAddOpen(true);
    setAddStage("batch");
    setAddDraft(null);
    setAddErr("");
    batchCancelRef.current = false;

    let success = 0;
    let failed = 0;
    let firstError = "";
    const created = [];

    setBatchProgress({
      total: list.length,
      current: 0,
      success: 0,
      failed: 0,
      running: true,
      cancelled: false,
      firstError: "",
      currentName: ""
    });

    for (let i = 0; i < list.length; i++) {
      if (batchCancelRef.current) break;

      const f = list[i];
      setBatchProgress((p) => p ? ({
        ...p,
        current: i + 1,
        currentName: f.name,
        success,
        failed,
        running: true,
        cancelled: false,
        firstError: firstError || p.firstError || ""
      }) : p);

      try {
        const originalBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });

        if (batchCancelRef.current) break;

        // 與單張入庫一致：thumb 做 UI，aiBase64 丟 Gemini，full 存 IndexedDB
        const thumbBase64 = await compressImage(originalBase64, 180, 0.5);
        const aiBase64 = await compressImage(originalBase64, 1200, 0.85);

        if (batchCancelRef.current) break;

        setAddImage(thumbBase64);

        // ✅ 與單品入庫一致的 task 名稱：vision
        const j = await apiPostGemini({ task: "vision", imageDataUrl: aiBase64 });
        if (j.error && !j.name) throw new Error(j.error);

        if (batchCancelRef.current) break;

        const id = uid();
        await saveFullImage(id, aiBase64);

        created.push({
          id,
          image: thumbBase64,
          name: j.name || f.name.replace(/\.[^.]+$/, "") || "未命名單品",
          category: j.category || "上衣",
          style: j.style || "極簡",
          material: j.material || "未知",
          fit: j.fit || "一般",
          thickness: Number(j.thickness || 3),
          temp: j.temp || { min: 15, max: 25 },
          colors: j.colors || { dominant: "#888888", secondary: "#CCCCCC" },
          notes: j.notes || "",
          confidence: j.confidence ?? 0.85,
          aiMeta: j._meta || null,
          location: location === "全部" ? "台北" : location,
          createdAt: Date.now() + i
        });

        success += 1;
      } catch (e) {
        console.error("batch import failed", f?.name, e);
        failed += 1;
        const reason = e?.message || String(e) || "未知錯誤";
        if (!firstError) firstError = reason;
      }

      setBatchProgress((p) => p ? ({
        ...p,
        current: i + 1,
        currentName: f.name,
        success,
        failed,
        running: true,
        cancelled: false,
        firstError: firstError || p.firstError || ""
      }) : p);

      // 給 UI 一點喘息，避免手機大量圖片時卡死
      if ((i + 1) % 3 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const cancelled = !!batchCancelRef.current;

    if (created.length) {
      setCloset((prev) => [...created, ...prev]);
      setAddImage(created[0].image || null);
    }

    setBatchProgress((p) => ({
      total: list.length,
      current: cancelled ? (p?.current || 0) : list.length,
      success,
      failed,
      running: false,
      cancelled,
      firstError: firstError || (p?.firstError ?? ""),
      currentName: ""
    }));

    if (!created.length) {
      const baseMsg = cancelled ? "批量匯入已中止，未新增任何單品。" : "批量匯入失敗";
      setAddErr(firstError ? `${baseMsg}（首筆錯誤：${firstError}）` : `${baseMsg}，請先確認 Gemini API Key 已設定且可用。`);
      return;
    }

    if (failed > 0) {
      setAddErr(`批量匯入完成：成功 ${success} / 失敗 ${failed}${firstError ? `（首筆錯誤：${firstError}）` : ""}`);
    } else if (cancelled) {
      setAddErr(`批量匯入已中止：成功 ${success} / ${list.length}`);
    } else {
      setAddErr(`批量匯入完成：${success}/${list.length} 件`);
      // 保留結果面板，方便確認統計與除錯；由使用者自行關閉
    }
  }

return (

  <div style={styles.page}>
    {bootGateOpen && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 12000, background: "linear-gradient(180deg,#f8f4ee 0%, #efe8dd 100%)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20, opacity: bootGateAnim ? 0 : 1, transition: "opacity .35s ease"
      }}>
        <div style={{ width: "100%", maxWidth: 420, background: "rgba(255,255,255,0.97)", borderRadius: 24, padding: 18, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>
          <div style={{ fontSize: 28, fontWeight: 1000, lineHeight: 1.05 }}>Wardrobe Genie</div>
          <div style={{ marginTop: 6, fontSize: 13, color: "rgba(0,0,0,0.6)" }}>請先驗證 Gemini API Key，再進入主系統。</div>
          <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700 }}>Gemini API Key（BYOK）</div>
          <input type="password" value={bootKeyInput} onChange={(e) => { setBootKeyInput(e.target.value); setBootGateErr(""); }} placeholder="貼上你的 API Key" style={{ ...styles.input, marginTop: 6, width: "100%" }} />
          {!!bootGateErr && <div style={{ marginTop: 8, color: "#d93025", fontSize: 12 }}>{bootGateErr}</div>}
          {!bootGateErr && <div style={{ marginTop: 8, color: "rgba(0,0,0,0.55)", fontSize: 11 }}>金鑰只存在你的裝置瀏覽器，不會儲存在 Vercel。</div>}
          <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 12 }} onClick={handleBootGateConfirm} disabled={bootGateBusy}>
            {bootGateBusy ? "驗證中…" : "驗證並進入"}
          </button>
        </div>
      </div>
    )}

      {!bootGateOpen && <TopBar />}

      {!bootGateOpen && <div style={{ display: addOpen ? "block" : "none", padding: "0 16px 18px" }}>
        <SectionTitle
          title="新衣入庫"
          right={
            <button style={styles.btnGhost} onClick={() => { batchCancelRef.current = true; setAddOpen(false); }}>取消</button>
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
        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileMultiRef}
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length) onPickFilesBatch(e.target.files);
            e.target.value = "";
          }}
        />

        {addErr && (() => {
          const msg = String(addErr || "");
          const isSuccess = msg.startsWith("批量匯入完成");
          const isInfo = isSuccess || msg.startsWith("批量匯入已中止");
          return (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                background: isInfo ? "rgba(16,185,129,0.07)" : "rgba(255,0,0,0.05)",
                border: isInfo ? "1px solid rgba(16,185,129,0.22)" : "1px solid rgba(255,0,0,0.15)",
              }}
            >
              <div style={{ fontWeight: 1000, color: isInfo ? "#0f766e" : "red" }}>
                {isSuccess ? "匯入完成" : msg.startsWith("批量匯入已中止") ? "已中止" : "發生錯誤"}
              </div>
              <div style={{ fontSize: 13, color: "rgba(0,0,0,0.75)", marginTop: 6 }}>{msg}</div>
            </div>
          );
        })()}

        {batchProgress && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 900 }}>批量匯入進度</div>
              {batchProgress.running && (
                <button
                  style={{ ...styles.btnGhost, padding: "6px 10px", minHeight: 32 }}
                  onClick={() => {
                    batchCancelRef.current = true;
                    setBatchProgress((p) => p ? { ...p, cancelled: true } : p);
                  }}
                >
                  中止
                </button>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "rgba(0,0,0,0.75)" }}>
              {batchProgress.current}/{batchProgress.total}
              {batchProgress.currentName ? ` · ${batchProgress.currentName}` : ""}
            </div>
            <div style={{ marginTop: 8, height: 8, background: "rgba(0,0,0,0.08)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{
                width: `${batchProgress.total ? Math.min(100, Math.round((batchProgress.current / batchProgress.total) * 100)) : 0}%`,
                height: "100%",
                background: batchProgress.cancelled ? "#999" : "linear-gradient(90deg,#6f5cff,#9f8bff)"
              }} />
            </div>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "rgba(0,0,0,0.7)" }}>
              <span>成功 {batchProgress.success}</span>
              <span>失敗 {batchProgress.failed}</span>
              <span>{batchProgress.running ? "處理中" : (batchProgress.cancelled ? "已中止" : "已完成")}</span>
            </div>
            {!!batchProgress.firstError && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#b42318" }}>
                首筆失敗原因：{batchProgress.firstError}
              </div>
            )}
          </div>
        )}

        {!addImage && (
          <div style={{ marginTop: 12, ...styles.card }}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>提示</div>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)", lineHeight: 1.5 }}>
              選擇照片後會先壓縮再送 AI 分析（大圖會存在底層資料庫，確保流暢）。
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={styles.btnPrimary} onClick={() => fileRef.current?.click()}>選擇照片</button><button style={styles.btn} onClick={openBatchImport}>批量匯入（多張）</button></div>
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
      </div>}

      {!bootGateOpen && <div style={{ display: addOpen ? "none" : "block" }}>
        {tab === "closet" && <ClosetPage />}
        {tab === "mix" && <MixPage />}
        {tab === "stylist" && <StylistPage />}
        {tab === "hub" && <HubPage />}
        {tab === "settings" && <SettingsPage />}
      </div>}

      {!bootGateOpen && <div style={styles.nav}>
        <div style={styles.navBtn(tab === "closet")} onClick={() => setTab("closet")}>
          <div style={styles.navIcon}>👕</div>
          <div style={styles.navText}>衣櫥</div>
        </div>
        <div style={styles.navBtn(tab === "mix")} onClick={() => setTab("mix")}>
          <div style={styles.navIcon}>🧩</div>
          <div style={styles.navText}>自選</div>
        </div>
        <div style={styles.navBtn(tab === "stylist")} onClick={() => setTab("stylist")}>
          <div style={styles.navIcon}>✨</div>
          <div style={styles.navText}>造型師</div>
        </div>
        <div style={styles.navBtn(tab === "hub")} onClick={() => setTab("hub")}>
          <div style={styles.navIcon}>📚</div>
          <div style={styles.navText}>Hub</div>
        </div>
        <div style={styles.navBtn(tab === "settings")} onClick={() => setTab("settings")}>
          <div style={styles.navIcon}>⚙️</div>
          <div style={styles.navText}>設定</div>
        </div>
      </div>}


      {editOpen && editDraft && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9000,
            background: "rgba(0,0,0,0.28)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => {
            setEditOpen(false);
            setEditDraft(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 720,
              background: "#fff",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 14,
              boxShadow: "0 -8px 30px rgba(0,0,0,0.12)",
            }}
          >
            <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(0,0,0,0.12)", margin: "0 auto 10px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 1000, fontSize: 16 }}>編輯單品</div>
              <button
                style={styles.btnGhost}
                onClick={() => {
                  setEditOpen(false);
                  setEditDraft(null);
                }}
              >
                取消
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, color: "rgba(0,0,0,0.68)" }}>名稱</div>
                <input
                  style={{ ...styles.input, width: "100%" }}
                  value={editDraft.name}
                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                  placeholder="單品名稱"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, color: "rgba(0,0,0,0.68)" }}>種類</div>
                  <select
                    style={{ ...styles.input, width: "100%" }}
                    value={editDraft.category}
                    onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}
                  >
                    {["上衣", "下著", "鞋子", "外套", "包包", "配件", "內著", "帽子", "飾品"].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, color: "rgba(0,0,0,0.68)" }}>地點</div>
                  <select
                    style={{ ...styles.input, width: "100%" }}
                    value={editDraft.location}
                    onChange={(e) => setEditDraft({ ...editDraft, location: e.target.value })}
                  >
                    {["台北", "新竹"].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, color: "rgba(0,0,0,0.68)" }}>風格</div>
                <input
                  style={{ ...styles.input, width: "100%" }}
                  value={editDraft.style}
                  onChange={(e) => setEditDraft({ ...editDraft, style: e.target.value })}
                  placeholder="例如：休閒 / 通勤 / 運動休閒"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, color: "rgba(0,0,0,0.68)" }}>適溫最低</div>
                  <input
                    type="number"
                    style={{ ...styles.input, width: "100%" }}
                    value={editDraft.tempMin}
                    onChange={(e) => setEditDraft({ ...editDraft, tempMin: e.target.value })}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, color: "rgba(0,0,0,0.68)" }}>適溫最高</div>
                  <input
                    type="number"
                    style={{ ...styles.input, width: "100%" }}
                    value={editDraft.tempMax}
                    onChange={(e) => setEditDraft({ ...editDraft, tempMax: e.target.value })}
                  />
                </div>
              </div>

              <button style={{ ...styles.btnPrimary, width: "100%" }} onClick={saveEditItem}>
                ✓ 儲存修改
              </button>
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
