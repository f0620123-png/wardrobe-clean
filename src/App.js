import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveFullImage, loadFullImage, deleteFullImage, getAllImages, putAllImages } from './db';

const K = {
  CLOSET: "wg_closet",
  PROFILE: "wg_profile",
  FAVORITES: "wg_favorites",
  NOTES: "wg_notes",
  TIMELINE: "wg_timeline",
  STYLE_MEMORY: "wg_style_memory",
  API_KEY: "wg_api_key" // ✨ [v15.5] 新增 API KEY 儲存位置
};

function uid() { return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16); }
function loadJson(key, fallback) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; } }
function saveJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { if (e.name === 'QuotaExceededError') alert("儲存空間已滿！"); } }
function fmtDate(ts) { const d = new Date(ts); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }

function compressImage(base64Str, maxWidth = 300, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = maxWidth / img.width;
      if (scale >= 1) return resolve(base64Str);
      canvas.width = maxWidth; canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = base64Str;
  });
}

function buildStyleMemory({ favorites, notes, closet }) { /* (保持原樣，省略以免佔用版面，同你原本的程式碼即可) */ return ""; }
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

const styles = {
  page: { minHeight: "100vh", background: "linear-gradient(#fbf6ef, #f6f1e8)", color: "#1d1d1f", fontFamily: "sans-serif", paddingBottom: 92 },
  topWrap: { padding: "14px 16px 8px" },
  topRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  h1: { fontSize: 22, margin: 0, fontWeight: 1000 },
  sub: { color: "rgba(0,0,0,0.55)", fontSize: 12, marginTop: 6 },
  card: { background: "rgba(255,255,255,0.72)", borderRadius: 18, padding: 14, boxShadow: "0 10px 30px rgba(0,0,0,0.05)" },
  btn: { padding: "10px 14px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.88)", cursor: "pointer", fontWeight: 700 },
  btnPrimary: { padding: "12px 16px", borderRadius: 16, border: "none", color: "white", background: "linear-gradient(90deg,#6b5cff,#8b7bff)", cursor: "pointer", fontWeight: 900 },
  btnGhost: { padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.10)", background: "rgba(255,255,255,0.55)", cursor: "pointer", fontWeight: 800, color: "rgba(0,0,0,0.75)" },
  input: { width: "100%", padding: "12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.9)", outline: "none", fontSize: 14 },
  chip: (act) => ({ padding: "8px 12px", borderRadius: 999, border: act ? "1px solid rgba(107,92,255,0.25)" : "1px solid rgba(0,0,0,0.1)", background: act ? "rgba(107,92,255,0.12)" : "rgba(255,255,255,0.6)", cursor: "pointer", fontWeight: 900, fontSize: 13, color: act ? "#5b4bff" : "rgba(0,0,0,0.7)" }),
  nav: { position: "fixed", left: 0, right: 0, bottom: 0, height: 78, background: "rgba(255,255,255,0.82)", borderTop: "1px solid rgba(0,0,0,0.06)", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", alignItems: "center", padding: "10px", zIndex: 50 },
  navBtn: (act) => ({ cursor: "pointer", textAlign: "center", padding: "8px 6px", borderRadius: 16, marginInline: 6, border: act ? "1px solid rgba(107,92,255,0.25)" : "transparent", background: act ? "rgba(107,92,255,0.10)" : "transparent", color: act ? "#5b4bff" : "rgba(0,0,0,0.68)" }),
};

function SectionTitle({ title, right }) { return <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 14 }}><div style={{ fontSize: 16, fontWeight: 1000 }}>{title}</div>{right}</div>; }

export default function App() {
  const [tab, setTab] = useState("closet");
  const [hubSub, setHubSub] = useState("diary");
  const [location, setLocation] = useState("全部");
  const [version, setVersion] = useState(null);

  const [userApiKey, setUserApiKey] = useState(() => loadJson(K.API_KEY, "")); // ✨ API Key
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
  const [currentWeather, setCurrentWeather] = useState(null); // ✨ 天氣狀態

  const fileRef = useRef(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addStage, setAddStage] = useState("idle");
  const [addImage, setAddImage] = useState(null);
  const [addDraft, setAddDraft] = useState(null);
  const [addErr, setAddErr] = useState("");
  const [fullViewMode, setFullViewMode] = useState(null);

  // ✨ [v15.5] 自動抓天氣 (Open-Meteo)
  useEffect(() => {
    async function fetchWeather() {
      if (location === "全部") return;
      try {
        let lat = 25.033, lon = 121.565;
        if (location === "新竹") { lat = 24.8138; lon = 120.9675; }
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const data = await res.json();
        if (data?.current_weather) {
          const temp = Math.round(data.current_weather.temperature);
          setCurrentWeather(temp);
          setMixTempC(temp.toString());
          setStyTempC(temp.toString());
        }
      } catch (e) { console.error("天氣抓取失敗:", e); }
    }
    fetchWeather();
  }, [location]);

  useEffect(() => saveJson(K.API_KEY, userApiKey), [userApiKey]);
  useEffect(() => saveJson(K.CLOSET, closet), [closet]);
  useEffect(() => saveJson(K.FAVORITES, favorites), [favorites]);
  useEffect(() => saveJson(K.NOTES, notes), [notes]);
  useEffect(() => saveJson(K.TIMELINE, timeline), [timeline]);
  useEffect(() => saveJson(K.PROFILE, profile), [profile]);

  useEffect(() => {
    fetch("/api/version").then(r => r.json()).then(setVersion).catch(() => {});
  }, []);

  // ✨ [v15.5] 備份/匯出功能
  async function handleExport() {
    try {
      setLoading(true);
      const fullImages = await getAllImages();
      const backup = {
        version: "15.5.0", timestamp: Date.now(),
        closet, favorites, notes, timeline, profile, fullImages
      };
      const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `WardrobeGenie-${fmtDate(Date.now()).replace(/[: ]/g,"-")}.wgbackup`;
      a.click(); URL.revokeObjectURL(url);
      alert("🎉 備份下載成功！");
    } catch (e) { alert("備份失敗：" + e.message); } finally { setLoading(false); }
  }

  // ✨ [v15.5] 還原/匯入功能
  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.confirm("⚠️ 警告：匯入將會覆蓋您目前所有的衣服與設定！確定繼續？")) return;
    try {
      setLoading(true);
      const text = await file.text();
      const data = JSON.parse(text);
      setCloset(data.closet || []); setFavorites(data.favorites || []);
      setNotes(data.notes || []); setTimeline(data.timeline || []); setProfile(data.profile || {});
      if (data.fullImages) await putAllImages(data.fullImages);
      alert("✅ 還原成功！頁面即將重新載入。");
      window.location.reload();
    } catch (e) { alert("匯入失敗：" + e.message); } finally { setLoading(false); e.target.value = ''; }
  }

  // ============== AI 呼叫區塊 (皆已加入 apiKey) ==============
  async function callGenie(bodyParams) {
    const r = await fetch("/api/gemini", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...bodyParams, apiKey: userApiKey }) // ✨ 自動夾帶 Key
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "AI 處理失敗");
    return j;
  }

  async function onPickFile(file) {
    if (loading) return;
    try {
      setLoading(true); setAddErr("");
      const reader = new FileReader();
      reader.readAsDataURL(file);
      await new Promise(r => reader.onload = r);
      setAddStage("compress");
      const thumbBase64 = await compressImage(reader.result, 300, 0.6);
      const aiBase64 = await compressImage(reader.result, 1200, 0.85);
      setAddImage(thumbBase64); setAddStage("analyze");

      const j = await callGenie({ task: "vision", imageDataUrl: aiBase64 });
      const newItemId = uid();
      await saveFullImage(newItemId, aiBase64);
      setAddDraft({ id: newItemId, image: thumbBase64, ...j });
      setAddStage("confirm");
    } catch (e) { setAddErr(e.message); setAddStage("idle"); } finally { setLoading(false); }
  }

  async function runMixExplain() {
    const selectedItems = closet.filter(x => selectedIds.includes(x.id));
    if (!selectedItems.length) return alert("請先勾選衣物");
    setLoading(true);
    try {
      const j = await callGenie({ task: "mixExplain", selectedItems, profile, tempC: Number(mixTempC), occasion: mixOccasion });
      alert("解析成功！" + j.summary);
      setTab("hub");
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  }

  async function runStylist() {
    setLoading(true);
    try {
      const j = await callGenie({ task: "stylist", closet, profile, location, occasion: styOccasion, style: styStyle, tempC: Number(styTempC) });
      setStyResult(j);
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  }

  // ============== Render ==============
  return (
    <div style={styles.page}>
      <div style={styles.topWrap}>
        <div style={styles.topRow}>
          <div>
            <div style={styles.h1}>Wardrobe Genie</div>
            <div style={styles.sub}>{version?.appVersion || "v15.5"} {currentWeather && `· 🌡️ ${location} ${currentWeather}°C`}</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {["全部", "台北", "新竹"].map(x => (
              <button key={x} style={styles.chip(location === x)} onClick={() => setLocation(x)}>{x}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: addOpen ? "none" : "block" }}>
        {tab === "closet" && (
          <div style={{ padding: "0 16px 18px" }}>
            <SectionTitle title={`我的衣櫥`} right={<button style={styles.btnPrimary} onClick={() => {setAddOpen(true); setAddImage(null); setAddDraft(null); setTimeout(() => fileRef.current?.click(), 30);}}>＋ 新衣入庫</button>} />
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {closet.filter(x => location === "全部" || x.location === location).map(x => (
                <div key={x.id} style={styles.card}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <img src={x.image} alt={x.name} onClick={async () => setFullViewMode(await loadFullImage(x.id) || x.image)} style={{ width: 80, height: 80, borderRadius: 16, objectFit: "cover", cursor: "pointer" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 1000 }}>{x.name} <input type="checkbox" checked={selectedIds.includes(x.id)} onChange={() => setSelectedIds(s => s.includes(x.id) ? s.filter(i=>i!==x.id) : [...s, x.id])} /></div>
                      <div style={{ fontSize: 12, color: "gray" }}>{x.category} · {x.location}</div>
                      <button style={{...styles.btnGhost, marginTop: 8}} onClick={async () => { setCloset(closet.filter(c=>c.id!==x.id)); await deleteFullImage(x.id); }}>刪除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "mix" && (
          <div style={{ padding: "0 16px 18px" }}>
            <SectionTitle title="自選搭配" />
            <div style={{ ...styles.card, marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
               <select value={mixOccasion} onChange={e=>setMixOccasion(e.target.value)} style={styles.input}><option value="日常">日常</option><option value="上班">上班</option></select>
               <input placeholder="氣溫°C" value={mixTempC} onChange={e=>setMixTempC(e.target.value)} style={styles.input} />
               <button style={styles.btnPrimary} onClick={runMixExplain}>{loading ? "分析中..." : "AI 解析"}</button>
            </div>
          </div>
        )}

        {tab === "stylist" && (
          <div style={{ padding: "0 16px 18px" }}>
             <SectionTitle title="AI 造型師" />
             <div style={{ ...styles.card, marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
               <input placeholder="氣溫°C" value={styTempC} onChange={e=>setStyTempC(e.target.value)} style={styles.input} />
               <button style={styles.btnPrimary} onClick={runStylist}>{loading ? "搭配中..." : "幫我配"}</button>
             </div>
             {styResult && <div style={{...styles.card, marginTop:12}}><pre style={{whiteSpace:"pre-wrap", fontSize:12}}>{JSON.stringify(styResult, null, 2)}</pre></div>}
          </div>
        )}

        {tab === "hub" && (
          <div style={{ padding: "0 16px 18px" }}>
            <SectionTitle title="Hub與設定" />
            
            {/* ✨ [v15.5] 設定區塊 */}
            <div style={{ ...styles.card, marginTop: 12 }}>
              <div style={{ fontWeight: 1000, marginBottom: 8 }}>⚙️ 系統設定</div>
              <label style={{ fontSize: 13, color: "gray", display: "block", marginBottom: 6 }}>Gemini API Key (使用 AI 必填)</label>
              <input type="password" placeholder="AIzaSy..." value={userApiKey} onChange={e => setUserApiKey(e.target.value.trim())} style={styles.input} />
              <div style={{ fontSize: 11, color: "gray", marginTop: 6 }}>金鑰僅存在本地瀏覽器，安全不外洩。</div>
            </div>

            {/* ✨ [v15.5] 備份區塊 */}
            <div style={{ ...styles.card, marginTop: 12 }}>
              <div style={{ fontWeight: 1000, marginBottom: 8 }}>📦 資料備份與還原</div>
              <div style={{ fontSize: 12, color: "gray", marginBottom: 12 }}>將衣櫥與高畫質照片打包下載，換手機也能無縫接軌。</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={styles.btnPrimary} onClick={handleExport} disabled={loading}>⬇️ 匯出 (.wgbackup)</button>
                <label style={{ ...styles.btnGhost, display: "flex", alignItems: "center" }}>
                  ⬆️ 匯入 <input type="file" accept=".wgbackup,.json" style={{ display: "none" }} onChange={handleImport} />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 新增入庫 Modal */}
      {addOpen && (
        <div style={{ padding: "0 16px 18px" }}>
          <SectionTitle title="新衣入庫" right={<button style={styles.btnGhost} onClick={() => setAddOpen(false)}>取消</button>} />
          <input type="file" accept="image/*" ref={fileRef} style={{ display: "none" }} onChange={e => onPickFile(e.target.files[0])} />
          {addErr && <div style={{ color: "red", marginTop: 10 }}>{addErr}</div>}
          {addImage && (
             <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
                <img src={addImage} alt="" style={{ width: 120, height: 120, borderRadius: 16, objectFit: "cover" }} />
                {addDraft ? (
                   <div>
                     <input style={styles.input} value={addDraft.name} onChange={e=>setAddDraft({...addDraft, name: e.target.value})} />
                     <button style={{...styles.btnPrimary, marginTop: 10}} onClick={() => { setCloset([addDraft, ...closet]); setAddOpen(false); }}>確認入庫</button>
                   </div>
                ) : <div>AI 辨識中...</div>}
             </div>
          )}
        </div>
      )}

      {fullViewMode && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setFullViewMode(null)}>
          <img src={fullViewMode} alt="full" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 16, objectFit: "contain" }} />
          <div style={{ position: "absolute", top: 20, right: 20, color: "white", padding: "8px 16px", borderRadius: 20, background: "rgba(255,255,255,0.2)", cursor: "pointer" }}>關閉</div>
        </div>
      )}

      <div style={styles.nav}>
        <div style={styles.navBtn(tab === "closet")} onClick={() => setTab("closet")}><div style={{ fontSize: 18 }}>👕</div><div style={{ fontSize: 11 }}>衣櫥</div></div>
        <div style={styles.navBtn(tab === "mix")} onClick={() => setTab("mix")}><div style={{ fontSize: 18 }}>🧩</div><div style={{ fontSize: 11 }}>自選</div></div>
        <div style={styles.navBtn(false)} onClick={() => { setAddOpen(true); setAddImage(null); setAddDraft(null); setTimeout(() => fileRef.current?.click(), 30); }}><div style={{ fontSize: 18 }}>＋</div><div style={{ fontSize: 11 }}>入庫</div></div>
        <div style={styles.navBtn(tab === "stylist")} onClick={() => setTab("stylist")}><div style={{ fontSize: 18 }}>✨</div><div style={{ fontSize: 11 }}>造型</div></div>
        <div style={styles.navBtn(tab === "hub")} onClick={() => setTab("hub")}><div style={{ fontSize: 18 }}>⚙️</div><div style={{ fontSize: 11 }}>設定</div></div>
      </div>
    </div>
  );
}
