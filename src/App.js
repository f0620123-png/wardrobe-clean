import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * ===========
 * LocalStorage Keys
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

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function fmtDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * ===========
 * Image compression (avoid HTTP 413)
 * ===========
 */
async function compressImage(file, maxSize = 1280, quality = 0.78) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * ===========
 * Simple UI building blocks
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
  card: {
    background: "rgba(255,255,255,0.70)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)"
  },
  h1: { fontSize: 24, margin: "14px 0 8px", letterSpacing: 0.2 },
  sub: { color: "rgba(0,0,0,0.55)", fontSize: 13 },
  row: { display: "flex", alignItems: "center", gap: 10 },
  btn: {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.85)",
    cursor: "pointer",
    fontWeight: 600
  },
  btnPrimary: {
    padding: "12px 16px",
    borderRadius: 16,
    border: "none",
    color: "white",
    background: "linear-gradient(90deg,#6b5cff,#8b7bff)",
    cursor: "pointer",
    fontWeight: 800
  },
  chip: (active) => ({
    padding: "8px 12px",
    borderRadius: 999,
    border: active ? "none" : "1px solid rgba(0,0,0,0.12)",
    background: active ? "rgba(107,92,255,0.14)" : "rgba(255,255,255,0.6)",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13
  }),
  nav: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    height: 76,
    background: "rgba(255,255,255,0.78)",
    borderTop: "1px solid rgba(0,0,0,0.06)",
    backdropFilter: "blur(16px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    padding: "10px 12px",
    zIndex: 50
  },
  navItem: (active) => ({
    width: 66,
    textAlign: "center",
    fontSize: 12,
    fontWeight: active ? 900 : 700,
    color: active ? "#5b4bff" : "rgba(0,0,0,0.55)",
    cursor: "pointer"
  }),
  fab: {
    width: 56,
    height: 56,
    borderRadius: 999,
    background: "linear-gradient(135deg,#ffcc7a,#8b7bff)",
    border: "none",
    boxShadow: "0 14px 28px rgba(0,0,0,0.18)",
    color: "#2a1f00",
    fontSize: 26,
    fontWeight: 900,
    cursor: "pointer",
    transform: "translateY(-18px)"
  },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.85)",
    outline: "none",
    fontSize: 14
  },
  textarea: {
    width: "100%",
    minHeight: 92,
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.85)",
    outline: "none",
    fontSize: 14
  }
};

function SectionTitle({ title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
      {right}
    </div>
  );
}

/**
 * ===========
 * V15.2 App
 * ===========
 */
export default function App() {
  const [tab, setTab] = useState("closet"); // closet | mix | stylist | favorites | diary
  const [location, setLocation] = useState("全部"); // 全部 | 台北 | 新竹
  const [version, setVersion] = useState(null);

  // data
  const [closet, setCloset] = useState(() => loadJson(K.CLOSET, []));
  const [favorites, setFavorites] = useState(() => loadJson(K.FAVORITES, []));
  const [notes, setNotes] = useState(() => loadJson(K.NOTES, []));
  const [timeline, setTimeline] = useState(() => loadJson(K.TIMELINE, []));
  const [profile, setProfile] = useState(() =>
    loadJson(K.PROFILE, { height: 175, weight: 70, bodyType: "H型" })
  );

  const [selectedIds, setSelectedIds] = useState([]);
  const [mixOccasion, setMixOccasion] = useState("日常");
  const [mixTempC, setMixTempC] = useState("");

  const [styOccasion, setStyOccasion] = useState("日常");
  const [styStyle, setStyStyle] = useState("極簡");
  const [styTempC, setStyTempC] = useState("");
  const [styResult, setStyResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Add item modal
  const fileRef = useRef(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addStage, setAddStage] = useState("idle"); // idle | compress | analyze | confirm
  const [addImage, setAddImage] = useState(null);
  const [addDraft, setAddDraft] = useState(null);
  const [addErr, setAddErr] = useState("");

  // Notes UI
  const [noteType, setNoteType] = useState("idea"); // idea | tutorial
  const [noteText, setNoteText] = useState("");
  const [noteImage, setNoteImage] = useState(null);
  const [noteAI, setNoteAI] = useState(null);

  // style memory (learned)
  const styleMemory = useMemo(() => buildStyleMemory({ favorites, notes, closet }), [favorites, notes, closet]);

  useEffect(() => {
    saveJson(K.CLOSET, closet);
  }, [closet]);

  useEffect(() => {
    saveJson(K.FAVORITES, favorites);
  }, [favorites]);

  useEffect(() => {
    saveJson(K.NOTES, notes);
  }, [notes]);

  useEffect(() => {
    saveJson(K.TIMELINE, timeline);
  }, [timeline]);

  useEffect(() => {
    saveJson(K.PROFILE, profile);
  }, [profile]);

  useEffect(() => {
    // store style memory (debug visibility)
    saveJson(K.STYLE_MEMORY, { updatedAt: Date.now(), styleMemory });
  }, [styleMemory]);

  useEffect(() => {
    // fetch version (no-store)
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

  async function onPickFile(file) {
    try {
      setAddErr("");
      setAddStage("compress");
      const compressed = await compressImage(file);
      setAddImage(compressed);

      setAddStage("analyze");
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "vision", imageDataUrl: compressed })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "AI 分析失敗");

      // draft
      setAddDraft({
        id: uid(),
        image: compressed,
        name: j.name || "未命名單品",
        category: j.category || "上衣",
        style: j.style || "極簡",
        material: j.material || "未知",
        fit: j.fit || "一般",
        thickness: j.thickness || 3,
        temp: j.temp || { min: 10, max: 25 },
        colors: j.colors || { dominant: "#888888", secondary: "#CCCCCC" },
        notes: j.notes || "",
        confidence: j.confidence ?? 0.75,
        aiMeta: j._meta || null,
        location: location === "全部" ? "台北" : location
      });

      setAddStage("confirm");
    } catch (e) {
      setAddErr(e.message || "處理失敗");
      setAddStage("idle");
    }
  }

  function confirmAdd() {
    if (!addDraft) return;
    setCloset([addDraft, ...closet]);
    setAddOpen(false);
  }

  function removeItem(id) {
    if (!window.confirm("確定刪除此衣物？")) return;
    setCloset(closet.filter((x) => x.id !== id));
    setSelectedIds(selectedIds.filter((x) => x !== id));
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

      // 轉成可收藏的 outfit（從 selectedItems 粗略映射）
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

      // 直接讓你選擇要不要收藏
      if (window.confirm("AI 已解析多選搭配。要直接收藏到「收藏」與「時間軸」嗎？")) {
        addFavoriteAndTimeline(fav, { occasion: mixOccasion, tempC: mixTempC });
        setTab("favorites");
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

  async function createNote({ doAiSummary }) {
    if (!noteText && !noteImage) return alert("請輸入文字或上傳圖片");

    setLoading(true);
    try {
      let aiSummary = null;
      if (doAiSummary) {
        const r = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: "noteSummarize", text: noteText || "", imageDataUrl: noteImage || null })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "AI 摘要失敗");
        aiSummary = j;
        setNoteAI(j);
      }

      const n = {
        id: uid(),
        type: noteType,
        createdAt: Date.now(),
        text: noteText || "",
        image: noteImage || null,
        aiSummary
      };
      setNotes((prev) => [n, ...prev]);

      // 教材筆記 → 自動強化 Style Memory 的素材
      setNoteText("");
      setNoteImage(null);
      alert("已新增筆記");
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ fontWeight: 800, width: 70, color: "rgba(0,0,0,0.55)" }}>{label}</div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          {item?.image ? (
            <img src={item.image} alt="" style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)" }} />
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(0,0,0,0.06)" }} />
          )}
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontWeight: 900 }}>{item?.name || "（缺）"}</div>
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
        <div style={{ paddingTop: 8 }}>
          <div style={{ fontWeight: 800, color: "rgba(0,0,0,0.55)", marginBottom: 6 }}>配件</div>
          {acc.length ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {acc.map((x) => (
                <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 14, background: "rgba(255,255,255,0.75)", border: "1px solid rgba(0,0,0,0.08)" }}>
                  <img src={x.image} alt="" style={{ width: 28, height: 28, borderRadius: 10, objectFit: "cover" }} />
                  <div style={{ fontWeight: 900, fontSize: 13 }}>{x.name}</div>
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
   * UI pages
   * ===========
   */
  function TopBar() {
    return (
      <div style={{ padding: "12px 16px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
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
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {["全部", "台北", "新竹"].map((x) => (
                <button key={x} style={styles.chip(location === x)} onClick={() => setLocation(x)}>
                  {x}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Debug：Style Memory（你要看 AI 有沒有學到） */}
        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>AI Style Memory（自動學習）</div>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.62)", whiteSpace: "pre-wrap" }}>
            {styleMemory || "（目前還沒有收藏/教材筆記可學習）"}
          </div>
        </div>
      </div>
    );
  }

  function ClosetPage() {
    const cats = ["上衣","下著","鞋子","外套","包包","配件","內著","運動","正式"];
    const [catFilter, setCatFilter] = useState("全部");

    const list = useMemo(() => {
      const base = closetFiltered;
      if (catFilter === "全部") return base;
      return base.filter(x => x.category === catFilter);
    }, [closetFiltered, catFilter]);

    return (
      <div style={{ padding: "0 16px 18px" }}>
        <SectionTitle
          title={`我的衣櫥（${stats.total}）`}
          right={<button style={styles.btn} onClick={() => setSelectedIds([])}>清空勾選</button>}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button style={styles.chip(catFilter === "全部")} onClick={() => setCatFilter("全部")}>全部</button>
          {cats.map(c => (
            <button key={c} style={styles.chip(catFilter === c)} onClick={() => setCatFilter(c)}>{c}</button>
          ))}
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {list.map((x) => (
            <div key={x.id} style={styles.card}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ position: "relative" }}>
                  <img
                    src={x.image}
                    alt=""
                    style={{ width: 88, height: 88, borderRadius: 18, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)" }}
                  />
                  <div style={{ position: "absolute", left: 8, top: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(x.id)}
                      onChange={() => toggleSelect(x.id)}
                      style={{ width: 18, height: 18 }}
                    />
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 1000, fontSize: 16 }}>{x.name}</div>
                    <button style={{ ...styles.btn, padding: "8px 10px" }} onClick={() => removeItem(x.id)}>🗑️</button>
                  </div>

                  <div style={{ fontSize: 13, color: "rgba(0,0,0,0.6)", marginTop: 4 }}>
                    {x.category} · {x.location} · {x.material} · 厚度{x.thickness}/5
                  </div>

                  <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", marginTop: 6 }}>
                    🌡 {x.temp?.min ?? 10}–{x.temp?.max ?? 25}°C · 🎨{" "}
                    <span style={{ display: "inline-flex", gap: 6, verticalAlign: "middle" }}>
                      <span style={{ width: 14, height: 14, borderRadius: 6, background: x.colors?.dominant || "#888", border: "1px solid rgba(0,0,0,0.08)" }} />
                      <span style={{ width: 14, height: 14, borderRadius: 6, background: x.colors?.secondary || "#ccc", border: "1px solid rgba(0,0,0,0.08)" }} />
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button style={styles.btn} onClick={() => moveItem(x.id)}>↔ 一鍵搬移</button>
                    <button
                      style={styles.btn}
                      onClick={() => {
                        setSelectedIds((s) => (s.includes(x.id) ? s : [...s, x.id]));
                        setTab("mix");
                      }}
                    >
                      ➕ 加入自選
                    </button>
                  </div>

                  {x.aiMeta?.models?.length ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: "rgba(0,0,0,0.45)" }}>
                      AI: {x.aiMeta.models.join(" + ")} · conf {Math.round((x.confidence || 0.75) * 100)}%
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          {list.length === 0 && (
            <div style={{ ...styles.card, textAlign: "center", padding: 22 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>目前沒有衣物</div>
              <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>按下底部「＋」新增衣物，AI 會自動分析。</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function MixPage() {
    const selectedItems = closet.filter((x) => selectedIds.includes(x.id));
    return (
      <div style={{ padding: "0 16px 18px" }}>
        <SectionTitle
          title="自選穿搭（多選 → AI 解釋/補位）"
          right={<button style={styles.btn} onClick={() => setSelectedIds([])}>清空</button>}
        />

        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>參數</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={mixOccasion} onChange={(e) => setMixOccasion(e.target.value)} style={{ ...styles.input, width: 160 }}>
              {["日常","上班","約會","聚會","戶外","運動","正式"].map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <input
              style={{ ...styles.input, width: 160 }}
              value={mixTempC}
              onChange={(e) => setMixTempC(e.target.value)}
              placeholder="目前溫度（可空）"
              inputMode="numeric"
            />
            <button style={styles.btnPrimary} onClick={runMixExplain} disabled={loading}>
              {loading ? "AI 分析中…" : "AI 解析搭配"}
            </button>
          </div>

          <div style={{ marginTop: 12, fontSize: 13, color: "rgba(0,0,0,0.55)" }}>
            已選 {selectedItems.length} 件：你可以回到「衣櫥」勾選更多，或在衣櫥卡片直接「加入自選」。
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {selectedItems.map((x) => (
            <div key={x.id} style={styles.card}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <img src={x.image} alt="" style={{ width: 66, height: 66, borderRadius: 16, objectFit: "cover", border: "1px solid rgba(0,0,0,0.08)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 1000 }}>{x.name}</div>
                  <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)" }}>{x.category} · {x.location} · 厚度{x.thickness}/5</div>
                </div>
                <button style={styles.btn} onClick={() => toggleSelect(x.id)}>移除</button>
              </div>
            </div>
          ))}

          {selectedItems.length === 0 && (
            <div style={{ ...styles.card, textAlign: "center", padding: 22 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>尚未選擇衣物</div>
              <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>到「衣櫥」勾選單品後，再回來按「AI 解析搭配」。</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function StylistPage() {
    return (
      <div style={{ padding: "0 16px 18px" }}>
        <SectionTitle title="穿搭靈感（AI Stylist）" />

        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>設定</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={styOccasion} onChange={(e) => setStyOccasion(e.target.value)} style={{ ...styles.input, width: 160 }}>
              {["日常","上班","約會","聚會","戶外","運動","正式"].map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={styStyle} onChange={(e) => setStyStyle(e.target.value)} style={{ ...styles.input, width: 160 }}>
              {["極簡","日系疊穿","日系簡約","韓系極簡","韓系休閒","City Boy","街頭風","美式復古","工裝風","機能風","學院風","休閒","正式"].map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <input
              style={{ ...styles.input, width: 160 }}
              value={styTempC}
              onChange={(e) => setStyTempC(e.target.value)}
              placeholder="目前溫度（可空）"
              inputMode="numeric"
            />
            <button style={styles.btnPrimary} onClick={runStylist} disabled={loading}>
              {loading ? "生成中…" : "直接生成 →"}
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "rgba(0,0,0,0.55)" }}>
            Stylist 會參考：地點（{location}）＋身型（{profile.bodyType}）＋ Style Memory（收藏/教材筆記學到的偏好）
          </div>
        </div>

        {styResult && (
          <div style={{ marginTop: 12, ...styles.card }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 1000, fontSize: 16 }}>
                  {styResult.styleName || styStyle} · conf {Math.round((styResult.confidence ?? 0.75) * 100)}%
                </div>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
                  model: {styResult._meta?.model || "unknown"}
                </div>
              </div>
              <button style={styles.btnPrimary} onClick={saveStylistToFavorite}>❤️ 收藏</button>
            </div>

            <div style={{ marginTop: 10 }}>{renderOutfit(styResult.outfit)}</div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 1000, marginBottom: 6 }}>搭配理由</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(styResult.why || []).map((x, i) => (
                  <li key={i} style={{ marginBottom: 6, color: "rgba(0,0,0,0.78)" }}>{x}</li>
                ))}
              </ul>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 1000, marginBottom: 6 }}>小撇步</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(styResult.tips || []).map((x, i) => (
                  <li key={i} style={{ marginBottom: 6, color: "rgba(0,0,0,0.78)" }}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  }

  function FavoritesPage() {
    return (
      <div style={{ padding: "0 16px 18px" }}>
        <SectionTitle
          title={`收藏（${favorites.length}）`}
          right={<button style={styles.btn} onClick={() => alert("收藏會自動用於 AI 學習風格（Style Memory）")}>ℹ️</button>}
        />

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {favorites.map((f) => (
            <div key={f.id} style={styles.card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 1000 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                    {fmtDate(f.createdAt)} · {f.styleName} · conf {Math.round((f.confidence ?? 0.75) * 100)}% · {f.meta?._meta?.model || f.meta?.model || f.meta?.models?.join("+") || "ai"}
                  </div>
                </div>
                <button style={styles.btn} onClick={() => deleteFavorite(f.id)}>🗑️</button>
              </div>

              <div style={{ marginTop: 10 }}>{renderOutfit(f.outfit)}</div>

              {(f.why?.length || 0) > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 1000, marginBottom: 6 }}>理由</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {f.why.slice(0, 6).map((x, i) => (
                      <li key={i} style={{ marginBottom: 6, color: "rgba(0,0,0,0.78)" }}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(f.tips?.length || 0) > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 1000, marginBottom: 6 }}>Tips</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {f.tips.slice(0, 6).map((x, i) => (
                      <li key={i} style={{ marginBottom: 6, color: "rgba(0,0,0,0.78)" }}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          {favorites.length === 0 && (
            <div style={{ ...styles.card, textAlign: "center", padding: 22 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>還沒有收藏</div>
              <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>
                你可以在「穿搭靈感」按 ❤️ 收藏，或在「自選穿搭」做完 AI 解析後收藏。
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function DiaryPage() {
    const ideaNotes = notes.filter((n) => n.type === "idea");
    const tutNotes = notes.filter((n) => n.type === "tutorial");

    return (
      <div style={{ padding: "0 16px 18px" }}>
        <SectionTitle title="紀錄（筆記 / 時間軸）" />

        {/* Profile */}
        <div style={{ marginTop: 10, ...styles.card }}>
          <div style={{ fontWeight: 1000, marginBottom: 10 }}>身型 Profile</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              style={{ ...styles.input, width: 140 }}
              value={profile.height}
              onChange={(e) => setProfile({ ...profile, height: Number(e.target.value || 0) })}
              inputMode="numeric"
              placeholder="身高 CM"
            />
            <input
              style={{ ...styles.input, width: 140 }}
              value={profile.weight}
              onChange={(e) => setProfile({ ...profile, weight: Number(e.target.value || 0) })}
              inputMode="numeric"
              placeholder="體重 KG"
            />
            <select
              value={profile.bodyType}
              onChange={(e) => setProfile({ ...profile, bodyType: e.target.value })}
              style={{ ...styles.input, width: 160 }}
            >
              {["H型","倒三角形","梨形","沙漏型","圓形(O型)"].map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
            Stylist 會參考此 Profile；教材筆記也會影響 AI 偏好學習。
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginTop: 12, ...styles.card }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.chip(noteType === "idea")} onClick={() => setNoteType("idea")}>靈感筆記</button>
            <button style={styles.chip(noteType === "tutorial")} onClick={() => setNoteType("tutorial")}>教材</button>
          </div>

          <div style={{ marginTop: 10 }}>
            <textarea
              style={styles.textarea}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={noteType === "tutorial" ? "寫下教學重點：例如色彩、比例、版型、場合…" : "記錄靈感：今天看到的穿搭、想法、配色…"}
            />
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ ...styles.btn, display: "inline-block" }}>
              📷 上傳圖片
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const compressed = await compressImage(f);
                  setNoteImage(compressed);
                }}
              />
            </label>

            <button style={styles.btnPrimary} onClick={() => createNote({ doAiSummary: noteType === "tutorial" })} disabled={loading}>
              {loading ? "儲存中…" : (noteType === "tutorial" ? "儲存 + AI 摘要" : "儲存筆記")}
            </button>

            {noteImage && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src={noteImage} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover", border: "1px solid rgba(0,0,0,0.1)" }} />
                <button style={styles.btn} onClick={() => setNoteImage(null)}>移除圖片</button>
              </div>
            )}
          </div>

          {noteType === "tutorial" && noteAI && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 16, background: "rgba(107,92,255,0.10)", border: "1px solid rgba(107,92,255,0.18)" }}>
              <div style={{ fontWeight: 1000 }}>{noteAI.title || "教材摘要"}</div>
              <div style={{ marginTop: 6, fontSize: 13, color: "rgba(0,0,0,0.75)" }}>
                {(noteAI.bullets || []).slice(0, 6).map((x, i) => (
                  <div key={i}>• {x}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notes list */}
        <SectionTitle
          title={`筆記清單（靈感 ${ideaNotes.length} / 教材 ${tutNotes.length}）`}
          right={<button style={styles.btn} onClick={() => alert("教材筆記會自動被 Style Memory 吸收，影響 AI 推薦。")}>ℹ️</button>}
        />

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {notes.slice(0, 12).map((n) => (
            <div key={n.id} style={styles.card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 1000 }}>
                  {n.type === "tutorial" ? "📘 教材" : "💡 靈感"} · {fmtDate(n.createdAt)}
                </div>
                <button
                  style={styles.btn}
                  onClick={() => {
                    if (!window.confirm("刪除此筆記？")) return;
                    setNotes(notes.filter((x) => x.id !== n.id));
                  }}
                >
                  🗑️
                </button>
              </div>

              {n.image && (
                <img src={n.image} alt="" style={{ width: "100%", borderRadius: 16, marginTop: 10, border: "1px solid rgba(0,0,0,0.08)" }} />
              )}

              {n.text && (
                <div style={{ marginTop: 10, whiteSpace: "pre-wrap", color: "rgba(0,0,0,0.78)" }}>{n.text}</div>
              )}

              {n.aiSummary && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 16, background: "rgba(0,0,0,0.04)" }}>
                  <div style={{ fontWeight: 1000 }}>{n.aiSummary.title || "AI 摘要"}</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "rgba(0,0,0,0.7)" }}>
                    {(n.aiSummary.bullets || []).slice(0, 6).map((x, i) => (
                      <div key={i}>• {x}</div>
                    ))}
                  </div>
                  {(n.aiSummary.tags || []).length ? (
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {n.aiSummary.tags.slice(0, 8).map((t) => (
                        <span key={t} style={{ padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: "rgba(107,92,255,0.10)", border: "1px solid rgba(107,92,255,0.16)" }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
          {notes.length === 0 && (
            <div style={{ ...styles.card, textAlign: "center", padding: 22 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>還沒有筆記</div>
              <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>用「靈感」記錄穿搭想法，用「教材」建立教學庫（會被 AI 學習）。</div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <SectionTitle title={`Outfit Timeline（${timeline.length}）`} />

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {timeline.slice(0, 20).map((t) => (
            <div key={t.id} style={styles.card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 1000 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                    {fmtDate(t.createdAt)} · {t.styleName} · conf {Math.round((t.confidence ?? 0.75) * 100)}%
                  </div>
                </div>
                <button style={styles.btn} onClick={() => deleteTimeline(t.id)}>🗑️</button>
              </div>

              <div style={{ marginTop: 10 }}>{renderOutfit(t.outfit)}</div>

              <div style={{ marginTop: 10 }}>
                <input
                  style={styles.input}
                  value={t.note || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTimeline((prev) => prev.map((x) => (x.id === t.id ? { ...x, note: v } : x)));
                  }}
                  placeholder="可加註：今天穿起來的感受、場合、被稱讚點…"
                />
              </div>

              {t.extra && (
                <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                  {t.extra.occasion ? `場合：${t.extra.occasion}` : ""}
                  {t.extra.style ? ` · 風格：${t.extra.style}` : ""}
                  {t.extra.tempC ? ` · 溫度：${t.extra.tempC}°C` : ""}
                </div>
              )}
            </div>
          ))}

          {timeline.length === 0 && (
            <div style={{ ...styles.card, textAlign: "center", padding: 22 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>時間軸是空的</div>
              <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>當你收藏 AI 推薦或自選搭配後，會自動寫入 Timeline。</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /**
   * ===========
   * Add Item Modal
   * ===========
   */
  function AddModal() {
    if (!addOpen) return null;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          zIndex: 200
        }}
        onClick={() => setAddOpen(false)}
      >
        <div style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ ...styles.card, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 1000, fontSize: 18 }}>新衣入庫</div>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                  {addStage === "compress" && "壓縮中（避免 413）…"}
                  {addStage === "analyze" && "AI 自動分析中…"}
                  {addStage === "confirm" && "請確認後入庫"}
                  {addStage === "idle" && "請選擇照片"}
                </div>
              </div>
              <button style={styles.btn} onClick={() => setAddOpen(false)}>✕</button>
            </div>

            {addErr && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 16, background: "rgba(255,0,0,0.08)", border: "1px solid rgba(255,0,0,0.18)" }}>
                <div style={{ fontWeight: 900 }}>發生錯誤</div>
                <div style={{ fontSize: 13, color: "rgba(0,0,0,0.75)", marginTop: 6 }}>{addErr}</div>
              </div>
            )}

            {addImage && (
              <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <img src={addImage} alt="" style={{ width: 120, height: 120, borderRadius: 18, objectFit: "cover", border: "1px solid rgba(0,0,0,0.1)" }} />

                {addDraft ? (
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <input style={{ ...styles.input, flex: 1 }} value={addDraft.name} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} />
                      <select style={{ ...styles.input, width: 140 }} value={addDraft.category} onChange={(e) => setAddDraft({ ...addDraft, category: e.target.value })}>
                        {["上衣","下著","鞋子","外套","包包","配件","內著","運動","正式"].map(x => <option key={x} value={x}>{x}</option>)}
                      </select>
                      <select style={{ ...styles.input, width: 140 }} value={addDraft.location} onChange={(e) => setAddDraft({ ...addDraft, location: e.target.value })}>
                        {["台北","新竹"].map(x => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 13, color: "rgba(0,0,0,0.6)" }}>
                      材質：{addDraft.material} · 厚度：{addDraft.thickness}/5 · 溫度：{addDraft.temp?.min}–{addDraft.temp?.max}°C
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <textarea style={styles.textarea} value={addDraft.notes || ""} onChange={(e) => setAddDraft({ ...addDraft, notes: e.target.value })} placeholder="可補充：尺寸、購買地、搭配注意…" />
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button style={styles.btnPrimary} onClick={confirmAdd}>✅ 確認加入 1 件衣物</button>
                      <button style={styles.btn} onClick={() => fileRef.current?.click()}>重新選照片</button>
                    </div>

                    {addDraft.aiMeta?.models?.length ? (
                      <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
                        Vision: {addDraft.aiMeta.models.join(" + ")} · mode dual_consensus · conf {Math.round((addDraft.confidence || 0.75) * 100)}%
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ flex: 1, color: "rgba(0,0,0,0.6)", fontSize: 13 }}>
                    等待 AI 分析完成…
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  /**
   * ===========
   * Layout
   * ===========
   */
  return (
    <div style={styles.page}>
      <TopBar />

      {tab === "closet" && <ClosetPage />}
      {tab === "mix" && <MixPage />}
      {tab === "stylist" && <StylistPage />}
      {tab === "favorites" && <FavoritesPage />}
      {tab === "diary" && <DiaryPage />}

      <AddModal />

      {/* Bottom Nav */}
      <div style={styles.nav}>
        <div style={styles.navItem(tab === "closet")} onClick={() => setTab("closet")}>衣櫥</div>
        <div style={styles.navItem(tab === "mix")} onClick={() => setTab("mix")}>自選</div>
        <button style={styles.fab} onClick={openAdd}>＋</button>
        <div style={styles.navItem(tab === "stylist")} onClick={() => setTab("stylist")}>靈感</div>
        <div style={styles.navItem(tab === "favorites")} onClick={() => setTab("favorites")}>收藏</div>
        <div style={{ ...styles.navItem(tab === "diary"), position: "absolute", right: 10, bottom: 10 }} onClick={() => setTab("diary")}>紀錄</div>
      </div>
    </div>
  );
}

/**
 * ===========
 * V15.2: AI Style Learning
 * ===========
 * 從 favorites + 教材筆記萃取偏好，輸出一段「可被模型理解」的文字記憶。
 * 目的：每次 Stylist 都帶著它 → 推薦更像你。
 */
function buildStyleMemory({ favorites, notes, closet }) {
  const fav = (favorites || []).slice(0, 30);

  // 1) 從收藏 outfit 找出常出現的類別/顏色
  const ids = [];
  fav.forEach(f => {
    const o = f.outfit || {};
    [o.topId, o.bottomId, o.outerId, o.shoeId].filter(Boolean).forEach(x => ids.push(x));
    (o.accessoryIds || []).forEach(x => ids.push(x));
  });

  const idSet = new Set(ids);
  const picked = (closet || []).filter(x => idSet.has(x.id));

  const catCount = {};
  const colorCount = {};
  const styleCount = {};
  const matCount = {};

  picked.forEach(x => {
    catCount[x.category] = (catCount[x.category] || 0) + 1;
    const c = x.colors?.dominant || "";
    if (c) colorCount[c] = (colorCount[c] || 0) + 1;
    if (x.style) styleCount[x.style] = (styleCount[x.style] || 0) + 1;
    if (x.material) matCount[x.material] = (matCount[x.material] || 0) + 1;
  });

  const topN = (obj, n=5) => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>`${k}(${v})`);

  // 2) 教材筆記萃取 tags / do / dont
  const tut = (notes || []).filter(n => n.type === "tutorial").slice(0, 20);
  const tags = [];
  const dos = [];
  const donts = [];
  tut.forEach(n => {
    const s = n.aiSummary;
    if (!s) return;
    (s.tags || []).forEach(t => tags.push(t));
    (s.do || []).forEach(x => dos.push(x));
    (s.dont || []).forEach(x => donts.push(x));
  });

  const countArr = (arr) => {
    const m = {};
    arr.forEach(x => { m[x] = (m[x] || 0) + 1; });
    return m;
  };

  const tagTop = topN(countArr(tags), 8);
  const doTop = topN(countArr(dos), 6);
  const dontTop = topN(countArr(donts), 6);

  // 3) 收藏標題/風格名（偏好風格）
  const favStyles = {};
  fav.forEach(f => {
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
    if (doTop.length) parts.push(`建議做：${doTop.map(x => x.replace(/$begin:math:text$\\d\+$end:math:text$$/,"")).join("；")}`);
    if (dontTop.length) parts.push(`避免：${dontTop.map(x => x.replace(/$begin:math:text$\\d\+$end:math:text$$/,"")).join("；")}`);
  }

  if (!parts.length) return "";

  parts.push("\n【Stylist 指令】請優先讓穿搭符合以上偏好與規則，在衣櫥不足時請清楚說明缺少的單品與替代策略。");
  return parts.join("\n");
}

/**
 * ===========
 * Rough mapping for mix selected → outfit slots
 * ===========
 */
function roughOutfitFromSelected(items) {
  const pick = (cat) => items.find(x => x.category === cat) || null;

  // 簡易策略：上衣/下著/鞋子/外套/配件
  const top = pick("上衣") || items.find(x => x.category !== "下著" && x.category !== "鞋子") || null;
  const bottom = pick("下著") || null;
  const shoe = pick("鞋子") || null;
  const outer = pick("外套") || null;
  const accessories = items.filter(x => x.category === "配件").map(x => x.id);

  return {
    topId: top?.id || null,
    bottomId: bottom?.id || null,
    outerId: outer?.id || null,
    shoeId: shoe?.id || null,
    accessoryIds: accessories
  };
}