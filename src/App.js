import React, { useEffect, useMemo, useRef, useState } from "react";

/** -------- utils -------- */
function uuid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function clamp(n, a, b) {
  const x = Number(n);
  if (Number.isNaN(x)) return a;
  return Math.max(a, Math.min(b, x));
}
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

async function postJson(url, payload) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

async function getJson(url) {
  const r = await fetch(url, { method: "GET" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

/** 壓縮圖片：避免 HTTP 413 */
async function compressImageToDataUrl(
  file,
  { maxSize = 1280, quality = 0.78, mime = "image/jpeg" } = {}
) {
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

  const { width, height } = img;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL(mime, quality);
}

function normalizeColor(colors) {
  const safe = colors || {};
  const d = safe?.dominant || {};
  const s = safe?.secondary || {};
  const okHex = (h) => typeof h === "string" && /^#[0-9A-Fa-f]{6}$/.test(h);
  return {
    dominant: { name: d.name || "未知", hex: okHex(d.hex) ? d.hex : "#000000" },
    secondary: { name: s.name || "未知", hex: okHex(s.hex) ? s.hex : "#ffffff" },
    tone: safe.tone || "中性",
    saturation: safe.saturation || "中",
    brightness: safe.brightness || "中"
  };
}

const CATEGORY_9 = ["上衣", "下著", "鞋子", "外套", "包包", "配件", "內著", "運動", "正式"];
const STYLE_LIST = ["極簡", "日系", "韓系", "街頭", "商務", "復古", "戶外", "運動", "正式"];
function mapCategoryTo9(c) {
  if (!c) return "上衣";
  return CATEGORY_9.includes(c) ? c : "上衣";
}
function mapStyleToList(s) {
  if (!s) return "極簡";
  return STYLE_LIST.includes(s) ? s : "極簡";
}

/** -------- UI -------- */
function Card({ children }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 10px 24px rgba(0,0,0,0.06)"
      }}
    >
      {children}
    </div>
  );
}
function Pill({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        padding: "10px 14px",
        borderRadius: 999,
        background: active ? "#6c63ff" : "rgba(255,255,255,0.9)",
        color: active ? "white" : "#333",
        fontWeight: 800,
        fontSize: 14,
        boxShadow: active ? "0 8px 20px rgba(108,99,255,0.25)" : "none"
      }}
    >
      {children}
    </button>
  );
}
function MiniTag({ children }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.06)"
      }}
    >
      {children}
    </span>
  );
}

function btn(type, extra = {}) {
  const base = {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.9)",
    borderRadius: 14,
    padding: "10px 12px",
    fontWeight: 900,
    cursor: "pointer"
  };
  if (type === "primary") {
    return {
      ...base,
      background: "#6c63ff",
      color: "white",
      border: "none",
      boxShadow: "0 12px 24px rgba(108,99,255,0.25)",
      ...extra
    };
  }
  if (type === "danger") {
    return {
      ...base,
      background: "rgba(255, 77, 79, 0.10)",
      color: "#d4380d",
      border: "1px solid rgba(255,77,79,0.25)",
      ...extra
    };
  }
  return { ...base, ...extra };
}

function navBtn(active) {
  return {
    border: "none",
    background: "transparent",
    fontWeight: 900,
    color: active ? "#6c63ff" : "rgba(0,0,0,0.4)",
    padding: 10,
    fontSize: 14
  };
}

/** -------- App -------- */
export default function App() {
  const fileRef = useRef(null);

  const [tab, setTab] = useState(lsGet("tab", "closet")); // closet | stylist | inspiration | profile
  const [location, setLocation] = useState(lsGet("location", "全部")); // 全部 | 台北 | 新竹
  const [category, setCategory] = useState(lsGet("category", "上衣"));

  const [profile, setProfile] = useState(lsGet("profile", { height: 175, weight: 70, shape: "H型" }));
  const [notes, setNotes] = useState(lsGet("notes", { inspiration: [], tutorial: [] }));
  const [clothes, setClothes] = useState(lsGet("clothes", []));
  const [selectedIds, setSelectedIds] = useState(lsGet("selectedIds", []));

  const [occasion, setOccasion] = useState(lsGet("occasion", "日常"));
  const [style, setStyle] = useState(lsGet("style", "極簡"));
  const [stylistResult, setStylistResult] = useState(null);
  const [favorites, setFavorites] = useState(lsGet("favorites", []));

  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");

  // ✅ 版本資訊（B 方案：從 /api/version 讀）
  const [versionInfo, setVersionInfo] = useState(null);
  const [versionErr, setVersionErr] = useState("");

  useEffect(() => lsSet("tab", tab), [tab]);
  useEffect(() => lsSet("location", location), [location]);
  useEffect(() => lsSet("category", category), [category]);
  useEffect(() => lsSet("profile", profile), [profile]);
  useEffect(() => lsSet("notes", notes), [notes]);
  useEffect(() => lsSet("clothes", clothes), [clothes]);
  useEffect(() => lsSet("selectedIds", selectedIds), [selectedIds]);
  useEffect(() => lsSet("occasion", occasion), [occasion]);
  useEffect(() => lsSet("style", style), [style]);
  useEffect(() => lsSet("favorites", favorites), [favorites]);

  // App 啟動時抓一次版本資訊
  useEffect(() => {
    (async () => {
      try {
        const v = await getJson("/api/version");
        setVersionInfo(v);
        setVersionErr("");
      } catch (e) {
        setVersionInfo(null);
        setVersionErr(e.message || String(e));
      }
    })();
  }, []);

  const filteredClothes = useMemo(() => {
    return clothes
      .filter((c) => (location === "全部" ? true : c.location === location))
      .filter((c) => (category ? c.category === category : true));
  }, [clothes, location, category]);

  const locationClosetForStylist = useMemo(() => {
    const pool = clothes.filter((c) => (location === "全部" ? true : c.location === location));
    return pool.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      style: c.style,
      material: c.material,
      fit: c.fit,
      thickness: c.thickness,
      temp: c.temp,
      colors: c.colors
    }));
  }, [clothes, location]);

  const selectedItems = useMemo(() => {
    const set = new Set(selectedIds);
    return clothes.filter((c) => set.has(c.id));
  }, [clothes, selectedIds]);

  async function refreshVersion() {
    try {
      setLoading(true);
      setLoadingText("更新版本資訊中...");
      const v = await getJson("/api/version");
      setVersionInfo(v);
      setVersionErr("");
    } catch (e) {
      setVersionInfo(null);
      setVersionErr(e.message || String(e));
    } finally {
      setLoading(false);
      setLoadingText("");
    }
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setLoadingText("圖片壓縮中（避免 413）...");

      const imageDataUrl = await compressImageToDataUrl(file, {
        maxSize: 1280,
        quality: 0.78,
        mime: "image/jpeg"
      });

      setLoadingText("AI 正在分析：顏色 / 材質 / 厚度 / 溫度...");

      const data = await postJson("/api/gemini", { task: "vision", imageDataUrl });
      if (!data?.ok) throw new Error(data?.error || "Vision 解析失敗");

      const r = data.result || {};
      const tempMin = clamp(r?.temp?.min, -5, 40);
      const tempMax = clamp(r?.temp?.max, -5, 40);
      const temp = tempMin < tempMax ? { min: tempMin, max: tempMax } : { min: 18, max: 30 };

      const newItem = {
        id: uuid(),
        createdAt: Date.now(),
        image: imageDataUrl,
        location: location === "全部" ? "台北" : location,
        name: String(r.name || "未命名").slice(0, 30),
        category: mapCategoryTo9(r.category),
        style: mapStyleToList(r.style),
        material: String(r.material || "未知").slice(0, 40),
        fit: String(r.fit || "不確定"),
        thickness: clamp(r.thickness, 1, 5),
        temp,
        colors: normalizeColor(r.colors),
        notes: String(r.notes || "").slice(0, 180),
        confidence: clamp(r.confidence, 0, 1)
      };

      setClothes((prev) => [newItem, ...prev]);
      setCategory(newItem.category);
      setTab("closet");
    } catch (err) {
      alert(`AI 分析失敗：${err.message}`);
    } finally {
      setLoading(false);
      setLoadingText("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  }

  function moveItem(id) {
    setClothes((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = c.location === "台北" ? "新竹" : "台北";
        return { ...c, location: next };
      })
    );
  }

  function removeItem(id) {
    if (!window.confirm("確定要刪除這件單品？")) return;
    setClothes((prev) => prev.filter((c) => c.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  async function runStylist() {
    try {
      setLoading(true);
      setLoadingText("AI 造型師思考中...");

      const data = await postJson("/api/gemini", {
        task: "stylist",
        occasion,
        style,
        location: location === "全部" ? "台北" : location,
        profile,
        closet: locationClosetForStylist
      });

      if (!data?.ok) throw new Error(data?.error || "Stylist 失敗");
      setStylistResult({ ...data.result, _model: data.model, _time: Date.now() });
      setTab("stylist");
    } catch (err) {
      alert(`AI 搭配失敗：${err.message}`);
    } finally {
      setLoading(false);
      setLoadingText("");
    }
  }

  function resolveById(id) {
    return clothes.find((c) => c.id === id) || null;
  }

  function saveFavoriteFromResult() {
    if (!stylistResult?.outfit) return;
    const fav = {
      id: uuid(),
      createdAt: Date.now(),
      occasion,
      style,
      location,
      outfit: stylistResult.outfit,
      why: stylistResult.why || [],
      tips: stylistResult.tips || [],
      confidence: stylistResult.confidence || 0,
      model: stylistResult._model || "unknown"
    };
    setFavorites((prev) => [fav, ...prev]);
    alert("已收藏這套搭配 ✅");
  }

  function addNote(kind) {
    const text = window.prompt(kind === "inspiration" ? "新增靈感筆記" : "新增教材筆記");
    if (!text) return;
    setNotes((prev) => ({
      ...prev,
      [kind]: [{ id: uuid(), createdAt: Date.now(), text }, ...prev[kind]]
    }));
  }

  function removeNote(kind, id) {
    setNotes((prev) => ({ ...prev, [kind]: prev[kind].filter((n) => n.id !== id) }));
  }

  function renderOutfitBox(outfit) {
    if (!outfit) return null;
    const top = outfit.topId ? resolveById(outfit.topId) : null;
    const bottom = outfit.bottomId ? resolveById(outfit.bottomId) : null;
    const shoe = outfit.shoeId ? resolveById(outfit.shoeId) : null;
    const outer = outfit.outerId ? resolveById(outfit.outerId) : null;
    const accessories = Array.isArray(outfit.accessoryIds)
      ? outfit.accessoryIds.map(resolveById).filter(Boolean)
      : [];

    const itemRow = (label, item) => (
      <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, alignItems: "center" }}>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{label}</div>
        {item ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", background: "#eee" }}>
              {item.image ? <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            </div>
            <div>
              <div style={{ fontWeight: 900 }}>{item.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{item.category} · {item.style}</div>
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.6 }}>缺件</div>
        )}
      </div>
    );

    return (
      <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)" }}>
        {itemRow("上衣", top)}
        {itemRow("下著", bottom)}
        {itemRow("鞋子", shoe)}
        {itemRow("外套", outer)}
        <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, alignItems: "start" }}>
          <div style={{ fontSize: 12, opacity: 0.65 }}>配件</div>
          {accessories.length ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {accessories.map((a) => <MiniTag key={a.id}>{a.name}</MiniTag>)}
            </div>
          ) : (
            <div style={{ opacity: 0.6 }}>無</div>
          )}
        </div>
      </div>
    );
  }

  const TopBar = (
    <div style={{ padding: 14, paddingBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#6c63ff" }}>Wardrobe Clean</div>
        <MiniTag>{versionInfo?.appVersion || "version: unknown"}</MiniTag>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 999,
          padding: 10
        }}
      >
        <Pill active={location === "全部"} onClick={() => setLocation("全部")}>全部</Pill>
        <Pill active={location === "台北"} onClick={() => setLocation("台北")}>台北</Pill>
        <Pill active={location === "新竹"} onClick={() => setLocation("新竹")}>新竹</Pill>
      </div>
    </div>
  );

  const CategoryBar = (
    <div style={{ padding: "0 14px 12px" }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {CATEGORY_9.map((c) => (
          <Pill key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Pill>
        ))}
      </div>
    </div>
  );

  const FloatingPlus = (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 66, display: "grid", placeItems: "center" }}>
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          width: 62,
          height: 62,
          borderRadius: 999,
          background: "#1f1f1f",
          color: "white",
          fontSize: 28,
          border: "none",
          boxShadow: "0 18px 30px rgba(0,0,0,0.25)"
        }}
        aria-label="新增衣物"
        title="新增衣物"
      >
        +
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onPickFile}
      />
    </div>
  );

  const BottomNav = (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(255,255,255,0.92)",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        padding: "10px 14px",
        display: "flex",
        justifyContent: "space-around",
        gap: 10
      }}
    >
      <button onClick={() => setTab("closet")} style={navBtn(tab === "closet")}>衣櫥</button>
      <button onClick={() => setTab("stylist")} style={navBtn(tab === "stylist")}>造型</button>
      <button onClick={() => setTab("inspiration")} style={navBtn(tab === "inspiration")}>靈感</button>
      <button onClick={() => setTab("profile")} style={navBtn(tab === "profile")}>個人</button>
    </div>
  );

  const LoadingOverlay = loading ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999
      }}
    >
      <div style={{ width: "min(520px, 92vw)" }}>
        <Card>
          <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>處理中…</div>
          <div style={{ opacity: 0.75, lineHeight: 1.5 }}>{loadingText || "請稍候"}</div>
        </Card>
      </div>
    </div>
  ) : null;

  const ScreenCloset = (
    <div style={{ padding: "0 14px 120px" }}>
      <Card>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>衣櫥管理</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <MiniTag>目前視圖：{location}</MiniTag>
          <MiniTag>分類：{category}</MiniTag>
          <MiniTag>已選：{selectedIds.length}</MiniTag>
        </div>

        {filteredClothes.length === 0 ? (
          <div style={{ padding: 16, opacity: 0.65, textAlign: "center" }}>
            目前分類沒有單品。按下「＋」上傳衣物照片開始建立衣櫥。
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredClothes.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "92px 1fr",
                  gap: 12,
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(0,0,0,0.06)",
                  background: "rgba(255,255,255,0.75)"
                }}
              >
                <div style={{ width: 92, height: 92, borderRadius: 14, overflow: "hidden", background: "#eee" }}>
                  {c.image ? (
                    <img src={c.image} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : null}
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{c.name}</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() => toggleSelect(c.id)}
                      />
                      <span style={{ fontSize: 12, opacity: 0.7 }}>多選</span>
                    </label>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    <MiniTag>{c.location}</MiniTag>
                    <MiniTag>{c.category}</MiniTag>
                    <MiniTag>{c.style}</MiniTag>
                    <MiniTag>{c.material}</MiniTag>
                    <MiniTag>厚度 {c.thickness}/5</MiniTag>
                    <MiniTag>{c.temp?.min}~{c.temp?.max}°C</MiniTag>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    <button onClick={() => moveItem(c.id)} style={btn()}>
                      一鍵搬移（台北↔新竹）
                    </button>
                    <button onClick={() => removeItem(c.id)} style={btn("danger")}>
                      刪除
                    </button>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: c.colors?.dominant?.hex || "#000" }} />
                      <span style={{ fontSize: 12, opacity: 0.75 }}>{c.colors?.dominant?.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: c.colors?.secondary?.hex || "#fff", border: "1px solid rgba(0,0,0,0.12)" }} />
                      <span style={{ fontSize: 12, opacity: 0.75 }}>{c.colors?.secondary?.name}</span>
                    </div>
                    <span style={{ fontSize: 12, opacity: 0.65 }}>
                      可信度 {Math.round((c.confidence || 0) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );

  const ScreenStylist = (
    <div style={{ padding: "0 14px 120px" }}>
      <Card>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>AI 造型建議</div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6, fontWeight: 800 }}>場合</div>
              <select value={occasion} onChange={(e) => setOccasion(e.target.value)} style={{ width: "100%", borderRadius: 14, padding: 12, fontWeight: 800 }}>
                {["日常", "上班", "約會", "聚會", "戶外", "運動", "正式"].map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6, fontWeight: 800 }}>風格</div>
              <select value={style} onChange={(e) => setStyle(e.target.value)} style={{ width: "100%", borderRadius: 14, padding: 12, fontWeight: 800 }}>
                {STYLE_LIST.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>

          <button onClick={runStylist} style={btn("primary", { width: "100%", padding: "14px 16px" })}>
            開始自動搭配
          </button>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <MiniTag>衣櫥來源：{location}</MiniTag>
            <MiniTag>可用單品：{locationClosetForStylist.length}</MiniTag>
            <MiniTag>身型：{profile.shape}</MiniTag>
          </div>
        </div>
      </Card>

      <div style={{ height: 12 }} />

      <Card>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>搭配結果</div>
        {!stylistResult ? (
          <div style={{ opacity: 0.65 }}>尚未產生搭配。</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <MiniTag>模型：{stylistResult._model || "unknown"}</MiniTag>
              <MiniTag>可信度：{Math.round((stylistResult.confidence || 0) * 100)}%</MiniTag>
            </div>

            {renderOutfitBox(stylistResult.outfit)}

            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>為什麼這樣搭</div>
              <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.8, lineHeight: 1.6 }}>
                {(stylistResult.why || []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>

            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>穿搭小撇步</div>
              <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.8, lineHeight: 1.6 }}>
                {(stylistResult.tips || []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>

            <button onClick={saveFavoriteFromResult} style={btn("primary")}>收藏這套搭配</button>
          </div>
        )}
      </Card>
    </div>
  );

  const ScreenInspiration = (
    <div style={{ padding: "0 14px 120px" }}>
      <Card>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>雙模式筆記</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button onClick={() => addNote("inspiration")} style={btn("primary")}>新增靈感筆記</button>
          <button onClick={() => addNote("tutorial")} style={btn()}>新增教材</button>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>靈感筆記</div>
            {notes.inspiration.length === 0 ? (
              <div style={{ opacity: 0.65 }}>尚未新增。</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {notes.inspiration.map((n) => (
                  <div key={n.id} style={{ padding: 12, borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.75)" }}>
                    <div style={{ fontSize: 12, opacity: 0.65 }}>{new Date(n.createdAt).toLocaleString()}</div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{n.text}</div>
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => removeNote("inspiration", n.id)} style={btn("danger")}>刪除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>教材</div>
            {notes.tutorial.length === 0 ? (
              <div style={{ opacity: 0.65 }}>尚未新增。</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {notes.tutorial.map((n) => (
                  <div key={n.id} style={{ padding: 12, borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.75)" }}>
                    <div style={{ fontSize: 12, opacity: 0.65 }}>{new Date(n.createdAt).toLocaleString()}</div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{n.text}</div>
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => removeNote("tutorial", n.id)} style={btn("danger")}>刪除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );

  const ScreenProfile = (
    <div style={{ padding: "0 14px 120px" }}>
      <Card>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>個人設定</div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6, fontWeight: 800 }}>身高 (cm)</div>
              <input
                value={profile.height}
                onChange={(e) => setProfile((p) => ({ ...p, height: clamp(e.target.value, 120, 210) }))}
                style={{ width: "100%", borderRadius: 14, padding: 12, fontWeight: 800 }}
                inputMode="numeric"
              />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6, fontWeight: 800 }}>體重 (kg)</div>
              <input
                value={profile.weight}
                onChange={(e) => setProfile((p) => ({ ...p, weight: clamp(e.target.value, 30, 150) }))}
                style={{ width: "100%", borderRadius: 14, padding: 12, fontWeight: 800 }}
                inputMode="numeric"
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6, fontWeight: 800 }}>身型</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {["H型", "倒三角形", "梨形", "沙漏型", "圓形(O型)"].map((s) => (
                <Pill key={s} active={profile.shape === s} onClick={() => setProfile((p) => ({ ...p, shape: s }))}>
                  {s}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div style={{ height: 12 }} />

      {/* ✅ 你要的：直接顯示版本是否最新 */}
      <Card>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>版本 / 更新驗證（B 方案）</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <button onClick={refreshVersion} style={btn("primary")}>重新讀取版本</button>
          <a href="/api/version" target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none", display: "inline-block" }}>
            直接開 /api/version
          </a>
        </div>

        {versionErr ? (
          <div style={{ color: "#d4380d", fontWeight: 800 }}>讀取失敗：{versionErr}</div>
        ) : !versionInfo ? (
          <div style={{ opacity: 0.7 }}>尚未讀到版本資訊。</div>
        ) : (
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.06)",
              background: "rgba(255,255,255,0.75)",
              lineHeight: 1.7,
              fontWeight: 800
            }}
          >
            <div>appVersion：{versionInfo.appVersion}</div>
            <div>vercelEnv：{versionInfo.vercelEnv}</div>
            <div>branch：{versionInfo.branch}</div>
            <div style={{ fontFamily: "ui-monospace, Menlo, Monaco, Consolas, monospace" }}>
              commit：{versionInfo.commit}
            </div>
            <div style={{ fontFamily: "ui-monospace, Menlo, Monaco, Consolas, monospace" }}>
              deploymentId：{versionInfo.deploymentId}
            </div>
            <div>serverTime：{versionInfo.serverTime}</div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              判斷是否最新：只要你部署後，<b>commit</b> 或 <b>deploymentId</b> 變了，就是新版本。
              serverTime 用來確認你打到的是即時回應（不是舊快取）。
            </div>
          </div>
        )}
      </Card>
    </div>
  );

  return (
    <div>
      {TopBar}
      {tab === "closet" ? CategoryBar : null}

      {tab === "closet" ? ScreenCloset : null}
      {tab === "stylist" ? ScreenStylist : null}
      {tab === "inspiration" ? ScreenInspiration : null}
      {tab === "profile" ? ScreenProfile : null}

      {FloatingPlus}
      {BottomNav}
      {LoadingOverlay}
    </div>
  );
}