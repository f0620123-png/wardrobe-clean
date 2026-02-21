import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  saveFullImage,
  loadFullImage,
  saveThumbImage,
  loadThumbImage,
  deleteItemImages,
  saveNoteImage,
  loadNoteImage,
  deleteNoteImage
} from "./db";

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

// LocalStorage 防爆機制
function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (e.name === "QuotaExceededError") {
      console.error("LocalStorage 已滿，請刪除部分舊資料或圖片。");
      alert("儲存空間已滿！請清理部分衣物或教材，否則新資料將無法存檔。");
    } else {
      console.error("LocalStorage save error:", e);
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
 * Image compression
 * ===========
 */
function compressImage(base64Str, maxWidth = 300, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = maxWidth / img.width;
      if (scale >= 1) return resolve(base64Str);

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
 * AI Style Memory
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

  const topN = (obj, n) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map((x) => x[0]);

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
 * UI styles
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
  const [styResult, setStyResult] = useState(null);

  const [loading, setLoading] = useState(false);

  const fileRef = useRef(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addStage, setAddStage] = useState("idle");
  const [addImage, setAddImage] = useState(null);
  const [addDraft, setAddDraft] = useState(null);
  const [addErr, setAddErr] = useState("");

  const [noteText, setNoteText] = useState("");
  const [noteImage, setNoteImage] = useState(null); // preview in state only
  const [noteAI, setNoteAI] = useState(null);

  const [fullViewMode, setFullViewMode] = useState(null);

  // caches
  const [thumbCache, setThumbCache] = useState({});      // { [thumbKey]: base64 }
  const [noteImgCache, setNoteImgCache] = useState({});  // { [noteId]: base64 }

  const styleMemory = useMemo(() => buildStyleMemory({ favorites, notes, closet }), [favorites, notes, closet]);

  // Save metadata only
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
   * Migration 1: closet item.image(base64) -> IndexedDB thumb:<id>
   * ===========
   */
  useEffect(() => {
    (async () => {
      try {
        let changed = false;
        const next = [...closet];

        for (let i = 0; i < next.length; i++) {
          const it = next[i];
          const hasOldImage = typeof it.image === "string" && it.image.startsWith("data:image");
          const hasThumbKey = !!it.thumbKey;

          if (hasOldImage) {
            const keyId = it.thumbKey || it.id;
            await saveThumbImage(keyId, it.image);

            const cleaned = { ...it, thumbKey: keyId };
            delete cleaned.image;

            next[i] = cleaned;
            changed = true;
          } else if (!hasThumbKey) {
            next[i] = { ...it, thumbKey: it.id };
            changed = true;
          }
        }

        if (changed) setCloset(next);
      } catch (e) {
        console.warn("Closet migration failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ===========
   * Migration 2: notes.image(base64) -> IndexedDB note:<noteId>
   * - replace with imageKey: noteId
   * ===========
   */
  useEffect(() => {
    (async () => {
      try {
        let changed = false;
        const next = [...notes];

        for (let i = 0; i < next.length; i++) {
          const n = next[i];
          const hasOld = typeof n.image === "string" && n.image.startsWith("data:image");
          const hasKey = !!n.imageKey;

          if (hasOld) {
            await saveNoteImage(n.id, n.image);

            const cleaned = { ...n, imageKey: n.id };
            delete cleaned.image;

            next[i] = cleaned;
            changed = true;
          } else if (!hasKey && n.imageKey == null && n.image == null) {
            // no image
          }
        }

        if (changed) setNotes(next);
      } catch (e) {
        console.warn("Notes migration failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ===========
   * Thumb preloader
   * ===========
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = closet.map((x) => x.thumbKey || x.id).filter(Boolean);
        for (const id of ids) {
          if (cancelled) return;
          if (thumbCache[id]) continue;
          const t = await loadThumbImage(id);
          if (t && !cancelled) {
            setThumbCache((prev) => (prev[id] ? prev : { ...prev, [id]: t }));
          }
        }
      } catch (e) {
        console.warn("Thumb preload error:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [closet, thumbCache]);

  /**
   * ===========
   * Note image preloader
   * ===========
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = (notes || []).map((n) => n.imageKey).filter(Boolean);
        for (const noteId of ids) {
          if (cancelled) return;
          if (noteImgCache[noteId]) continue;
          const img = await loadNoteImage(noteId);
          if (img && !cancelled) {
            setNoteImgCache((prev) => (prev[noteId] ? prev : { ...prev, [noteId]: img }));
          }
        }
      } catch (e) {
        console.warn("Note image preload error:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notes, noteImgCache]);

  function getThumbSrc(item) {
    if (!item) return null;
    const key = item.thumbKey || item.id;
    return thumbCache[key] || null;
  }

  function getNoteImgSrc(note) {
    if (!note?.imageKey) return null;
    return noteImgCache[note.imageKey] || null;
  }

  function openAdd() {
    setAddErr("");
    setAddOpen(true);
    setAddStage("idle");
    setAddImage(null);
    setAddDraft(null);
    setTimeout(() => fileRef.current?.click(), 30);
  }

  async function onPickFile(file) {
    if (loading) return;
    try {
      setLoading(true);
      setAddErr("");

      const reader = new FileReader();
      reader.readAsDataURL(file);
      await new Promise((r) => (reader.onload = r));
      const originalBase64 = reader.result;

      setAddStage("compress");
      const thumbBase64 = await compressImage(originalBase64, 300, 0.6);
      const aiBase64 = await compressImage(originalBase64, 1200, 0.85);

      setAddImage(thumbBase64);

      setAddStage("analyze");
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "vision", imageDataUrl: aiBase64 })
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

  async function handleViewFullImage(id, fallbackThumb) {
    const original = await loadFullImage(id);
    setFullViewMode(original || fallbackThumb || null);
  }

  async function handleDeleteItem(id, thumbKey) {
    if (!window.confirm("確定刪除此衣物？")) return;
    setCloset(closet.filter((x) => x.id !== id));
    setSelectedIds(selectedIds.filter((x) => x !== id));

    const key = thumbKey || id;
    setThumbCache((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
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
        imageKey, // metadata only
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

  async function deleteNote(n) {
    if (!window.confirm("刪除這筆筆記？")) return;
    setNotes((prev) => prev.filter((x) => x.id !== n.id));

    if (n.imageKey) {
      setNoteImgCache((prev) => {
        if (!prev[n.imageKey]) return prev;
        const next = { ...prev };
        delete next[n.imageKey];
        return next;
      });
      await deleteNoteImage(n.id);
    }
  }

  // ======== 下面 UI 你可以維持你原本的也行 ========
  // 我只保留必要的 LearnPage 顯示修改：改用 getNoteImgSrc(note)

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
                  <b>{version.appVersion}</b> · {version.git?.branch} · {String(version.git?.commit || "").slice(0, 7)} · {version.vercelEnv}
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
      </div>
    );
  }

  function LearnPage() {
    const currentType = learnSub === "idea" ? "idea" : "tutorial";
    const ideaNotes = notes.filter((x) => x.type === "idea");
    const tutNotes = notes.filter((x) => x.type === "tutorial");

    return (
      <div style={{ padding: "0 16px 18px" }}>
        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={styles.segmentWrap}>
            <button style={styles.chip(learnSub === "idea")} onClick={() => setLearnSub("idea")}>
              靈感 ({ideaNotes.length})
            </button>
            <button style={styles.chip(learnSub === "tutorial")} onClick={() => setLearnSub("tutorial")}>
              教材 ({tutNotes.length})
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, ...styles.card }}>
          <div style={{ fontWeight: 1000, marginBottom: 8 }}>新增筆記</div>
          <textarea
            style={styles.textarea}
            placeholder="輸入穿搭心得、或上傳參考圖片..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files[0];
                if (!f) return;
                const r = new FileReader();
                r.readAsDataURL(f);
                r.onload = () => compressImage(r.result, 600, 0.7).then(setNoteImage);
              }}
              style={{ display: "none" }}
              id="noteImgUp"
            />
            <label htmlFor="noteImgUp" style={styles.btnGhost}>
              📸 上傳圖
            </label>

            {/* 只顯示暫存預覽，不會寫入 LocalStorage */}
            {noteImage && <img src={noteImage} alt="" style={{ height: 40, borderRadius: 8, objectFit: "cover" }} />}

            <div style={{ flex: 1 }} />
            <button
              style={styles.btnPrimary}
              onClick={() => createNote({ doAiSummary: currentType === "tutorial", type: currentType })}
              disabled={loading}
            >
              {loading ? "處理中..." : currentType === "idea" ? "＋ 新增靈感" : "＋ AI 解析教材"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {(notes || [])
            .filter((n) => n.type === currentType)
            .slice(0, 30)
            .map((n) => {
              const img = getNoteImgSrc(n);
              return (
                <div key={n.id} style={styles.card}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{fmtDate(n.createdAt)}</div>
                    <button style={styles.btn} onClick={() => deleteNote(n)}>
                      🗑️
                    </button>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                    {img && <img src={img} alt="" style={{ width: 60, height: 60, borderRadius: 12, objectFit: "cover" }} />}
                    <div style={{ flex: 1, whiteSpace: "pre-wrap", fontSize: 14 }}>{n.text}</div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <TopBar />
      {tab === "learn" ? <LearnPage /> : <div style={{ padding: 16, color: "rgba(0,0,0,0.6)" }}>（此版本重點在 notes 圖片搬遷，其他頁面可沿用你現有 UI）</div>}
    </div>
  );
}