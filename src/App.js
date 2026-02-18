import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Shirt,
  Wand2,
  BookOpen,
  User,
  Trash2,
  ArrowRightLeft,
  MapPin,
  Heart,
  Loader2,
  Sparkles,
} from "lucide-react";

/**
 * =========================
 * 產品骨架（V14 UI + V15 安全代理）
 * =========================
 */

// ---- 常數（依你的需求）----
const LOCATIONS_VIEW = ["全部", "台北", "新竹"];
const LOCATIONS = ["台北", "新竹"];

const CATEGORIES = ["上衣", "下著", "鞋子", "外套", "包包", "配件", "內著", "運動", "正式"];
const STYLES = ["極簡", "日系", "韓系", "街頭", "商務", "復古", "戶外", "運動", "正式"];
const OCCASIONS = ["日常", "上班", "約會", "運動", "度假", "正式場合", "派對"];
const BODY_TYPES = ["H型", "倒三角形", "梨形", "沙漏型", "圓形(O型)"];

// ---- Storage keys：鎖死（避免升版資料消失）----
const K_CLOTHES = "wardrobe_clothes_v14";
const K_PROFILE = "wardrobe_profile_v14";
const K_NOTES = "wardrobe_notes_v14";
const K_FAVS = "wardrobe_favorites_v14";

// 舊版（你 repo 現在 V15 版）key：用來搬家
const LEGACY_KEYS = {
  clothes: ["my_clothes_v15", "my_clothes_v14", "my_clothes_v9", "my_clothes"],
  profile: ["user_profile_v15", "user_profile_v14", "user_profile_v9", "user_profile"],
  notes: ["my_notes_v15", "my_notes_v14", "my_notes_v9", "my_notes"],
  favs: ["my_favorites_v15", "my_favorites_v14", "my_favorites_v9", "my_favorites"],
};

function safeParse(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function uuid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clamp(n, a, b) {
  const x = Number(n);
  if (Number.isNaN(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function fmtTemp(temp) {
  if (!temp || temp.min == null || temp.max == null) return "—";
  return `${temp.min}-${temp.max}°C`;
}

function mapCategoryTo9(cat) {
  // Vision 回來的 category 已是 9 類之一，但保險補一層
  if (CATEGORIES.includes(cat)) return cat;
  return "上衣";
}

function mapStyleToList(style) {
  if (STYLES.includes(style)) return style;
  return "極簡";
}

function normalizeColor(colors) {
  const dom = colors?.dominant || {};
  const sec = colors?.secondary || {};
  const hexOk = (h) => /^#[0-9A-Fa-f]{6}$/.test(h || "");

  return {
    dominant: {
      name: String(dom.name || "未知"),
      hex: hexOk(dom.hex) ? dom.hex : "#999999",
    },
    secondary: {
      name: String(sec.name || "未知"),
      hex: hexOk(sec.hex) ? sec.hex : "#CCCCCC",
    },
    tone: ["冷", "暖", "中性"].includes(colors?.tone) ? colors.tone : "中性",
    saturation: ["低", "中", "高"].includes(colors?.saturation) ? colors.saturation : "中",
    brightness: ["低", "中", "高"].includes(colors?.brightness) ? colors.brightness : "中",
  };
}

// ---- API 呼叫（安全代理）----
async function postGemini(payload) {
  const r = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

export default function App() {
  // ---- Tabs ----
  const [tab, setTab] = useState("closet"); // closet | outfit | inspo | profile
  const fileRef = useRef(null);

  // ---- UI 狀態（頂部地點 view / 目前新增地點）----
  const [viewLocation, setViewLocation] = useState("全部"); // 全部/台北/新竹
  const [captureLocation, setCaptureLocation] = useState("台北"); // 新增衣物時的地點
  const [category, setCategory] = useState("上衣");

  // ---- Loading ----
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");

  // ---- Data ----
  const [clothes, setClothes] = useState(() => safeParse(K_CLOTHES, []));
  const [profile, setProfile] = useState(() =>
    safeParse(K_PROFILE, { height: 175, weight: 70, shape: "H型" })
  );
  const [notes, setNotes] = useState(() => safeParse(K_NOTES, [])); // {id,type,title,content,createdAt}
  const [favorites, setFavorites] = useState(() => safeParse(K_FAVS, [])); // outfit favorites

  // ---- Multi select ----
  const [selectedIds, setSelectedIds] = useState([]); // clothes ids

  // ---- Outfit page ----
  const [occasion, setOccasion] = useState("日常");
  const [style, setStyle] = useState("極簡");
  const [stylistResult, setStylistResult] = useState(null); // { outfit, why, tips, confidence }
  const [stylistPickedItems, setStylistPickedItems] = useState([]); // resolved items

  // ---- Inspo page ----
  const [noteMode, setNoteMode] = useState("靈感"); // 靈感 / 教材
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteDraft, setNoteDraft] = useState({ title: "", content: "" });

  // ---- Profile page ----
  const [verifyState, setVerifyState] = useState({ ok: null, msg: "" });

  // =========================
  // 一次性：資料搬家（從 v15 key 搬回 v14 key）
  // =========================
  useEffect(() => {
    const migrate = (targetKey, legacyKeys, isArray) => {
      const current = safeParse(targetKey, isArray ? [] : null);
      const hasData = isArray ? Array.isArray(current) && current.length > 0 : !!current;
      if (hasData) return;

      for (const k of legacyKeys) {
        const v = safeParse(k, isArray ? [] : null);
        if (isArray && Array.isArray(v) && v.length > 0) {
          safeSet(targetKey, v);
          return;
        }
        if (!isArray && v && typeof v === "object") {
          safeSet(targetKey, v);
          return;
        }
      }
    };

    migrate(K_CLOTHES, LEGACY_KEYS.clothes, true);
    migrate(K_NOTES, LEGACY_KEYS.notes, true);
    migrate(K_FAVS, LEGACY_KEYS.favs, true);
    migrate(K_PROFILE, LEGACY_KEYS.profile, false);

    // re-hydrate once
    setClothes(safeParse(K_CLOTHES, []));
    setNotes(safeParse(K_NOTES, []));
    setFavorites(safeParse(K_FAVS, []));
    setProfile(safeParse(K_PROFILE, { height: 175, weight: 70, shape: "H型" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =========================
  // 自動保存（鎖死 v14 key）
  // =========================
  useEffect(() => safeSet(K_CLOTHES, clothes), [clothes]);
  useEffect(() => safeSet(K_PROFILE, profile), [profile]);
  useEffect(() => safeSet(K_NOTES, notes), [notes]);
  useEffect(() => safeSet(K_FAVS, favorites), [favorites]);

  // =========================
  // 衣櫃過濾：地點 + 分類
  // =========================
  const filteredClothes = useMemo(() => {
    return clothes.filter((c) => {
      const okLoc = viewLocation === "全部" ? true : c.location === viewLocation;
      const okCat = c.category === category;
      return okLoc && okCat;
    });
  }, [clothes, viewLocation, category]);

  const currentLocationCloset = useMemo(() => {
    // 造型頁用：只挑指定地點（台北/新竹）
    return clothes.filter((c) => c.location === captureLocation);
  }, [clothes, captureLocation]);

  // =========================
  // 多選
  // =========================
  function toggleSelected(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const selectedItems = useMemo(() => {
    const set = new Set(selectedIds);
    return clothes.filter((c) => set.has(c.id));
  }, [clothes, selectedIds]);

  // =========================
  // 1) Vision Analysis：上傳衣物照片 → 自動建檔
  // =========================
  async function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const imageDataUrl = reader.result; // data:image/...;base64
      try {
        setLoading(true);
        setLoadingText("AI 正在分析：顏色 / 材質 / 厚度 / 溫度...");

        const data = await postGemini({ task: "vision", imageDataUrl });

        if (!data?.ok) {
          throw new Error(data?.error || "Vision 解析失敗");
        }

        const r = data.result || {};
        const tempMin = clamp(r?.temp?.min, -5, 40);
        const tempMax = clamp(r?.temp?.max, -5, 40);
        const temp = tempMin < tempMax ? { min: tempMin, max: tempMax } : { min: 18, max: 30 };

        const newItem = {
          id: uuid(),
          createdAt: Date.now(),
          image: imageDataUrl,
          location: captureLocation, // 依你需求：新增時看「目前地點」
          name: String(r.name || "未命名").slice(0, 30),
          category: mapCategoryTo9(r.category),
          style: mapStyleToList(r.style),
          material: String(r.material || "未知").slice(0, 40),
          fit: String(r.fit || "不確定"),
          thickness: clamp(r.thickness, 1, 5),
          temp,
          colors: normalizeColor(r.colors),
          notes: String(r.notes || "").slice(0, 180),
          confidence: clamp(r.confidence, 0, 1),
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
    };

    reader.readAsDataURL(file);
  }

  // =========================
  // 2) Multi-Location：一鍵搬移台北/新竹
  // =========================
  function moveItemLocation(id) {
    setClothes((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, location: c.location === "台北" ? "新竹" : "台北" } : c
      )
    );
  }

  function deleteItem(id) {
    if (!window.confirm("確定要刪除這件衣物嗎？")) return;
    setClothes((prev) => prev.filter((c) => c.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  // =========================
  // 3) AI Stylist：場合+風格+地點衣櫥+profile → 一套穿搭
  // =========================
  async function runStylist() {
    try {
      setLoading(true);
      setLoadingText("AI 正在從本地點衣櫥挑選一套穿搭...");

      const closetSlim = currentLocationCloset.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        style: c.style,
        material: c.material,
        fit: c.fit,
        thickness: c.thickness,
        temp: c.temp,
        colors: c.colors,
      }));

      const data = await postGemini({
        task: "stylist",
        occasion,
        style,
        location: captureLocation,
        profile: { height: profile.height, weight: profile.weight, shape: profile.shape },
        closet: closetSlim,
      });

      if (!data?.ok) throw new Error(data?.error || "Stylist 解析失敗");

      const result = data.result;
      setStylistResult(result);

      // resolve items for display
      const ids = [
        result?.outfit?.topId,
        result?.outfit?.bottomId,
        result?.outfit?.shoeId,
        result?.outfit?.outerId,
        ...(Array.isArray(result?.outfit?.accessoryIds) ? result.outfit.accessoryIds : []),
      ].filter(Boolean);

      const setIds = new Set(ids);
      const picked = clothes.filter((c) => setIds.has(c.id));
      setStylistPickedItems(picked);

      // 同步勾選（方便你後續做試穿/收藏）
      setSelectedIds(ids.filter(Boolean));
    } catch (err) {
      alert(`AI 自動搭配失敗：${err.message}`);
    } finally {
      setLoading(false);
      setLoadingText("");
    }
  }

  function saveFavoriteFromStylist() {
    if (!stylistResult?.outfit) {
      alert("目前沒有可收藏的推薦結果。");
      return;
    }
    const fav = {
      id: uuid(),
      createdAt: Date.now(),
      name: `${occasion}｜${style}｜${captureLocation}`,
      location: captureLocation,
      occasion,
      style,
      outfit: stylistResult.outfit,
      why: stylistResult.why || [],
      tips: stylistResult.tips || [],
    };
    setFavorites((prev) => [fav, ...prev]);
    alert("已收藏這套搭配 ✅");
  }

  // =========================
  // 4) Notes：靈感 / 教材
  // =========================
  function addNote() {
    if (!noteDraft.content.trim()) return;
    const n = {
      id: uuid(),
      createdAt: Date.now(),
      type: noteMode, // 靈感 or 教材
      title: noteDraft.title.trim(),
      content: noteDraft.content.trim(),
    };
    setNotes((prev) => [n, ...prev]);
    setNoteDraft({ title: "", content: "" });
    setShowNoteModal(false);
  }

  function deleteNote(id) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  const notesFiltered = useMemo(() => notes.filter((n) => n.type === noteMode), [notes, noteMode]);

  // =========================
  // 5) Profile：驗證（text ping）
  // =========================
  async function verifyGemini() {
    try {
      setVerifyState({ ok: null, msg: "" });
      setLoading(true);
      setLoadingText("正在驗證 AI 服務...");

      const data = await postGemini({
        task: "text",
        prompt: "請回覆：OK（只要回 OK 兩個字即可）",
      });

      const ok = String(data?.text || "").includes("OK");
      setVerifyState({ ok, msg: ok ? "AI 連線正常 ✅" : "AI 有回覆但格式不符合（仍可用）" });
    } catch (e) {
      setVerifyState({ ok: false, msg: `驗證失敗：${e.message}` });
    } finally {
      setLoading(false);
      setLoadingText("");
    }
  }

  // =========================
  // UI Components
  // =========================
  const TopLocationBar = () => (
    <div className="px-6 pt-9 pb-4">
      <div className="bg-orange-100/60 rounded-2xl p-1 flex items-center gap-1">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-orange-600">
          <MapPin size={14} />
          VIEW
        </div>

        <div className="flex-1 flex gap-1">
          {LOCATIONS_VIEW.map((loc) => (
            <button
              key={loc}
              onClick={() => setViewLocation(loc)}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition ${
                viewLocation === loc ? "bg-white text-orange-600 shadow-sm" : "text-gray-400"
              }`}
            >
              {loc}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const BottomNav = () => (
    <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-xl border-t border-gray-100 flex justify-around items-center px-6 pb-6 z-40">
      <NavBtn active={tab === "closet"} icon={<Shirt />} label="衣櫥" onClick={() => setTab("closet")} />
      <NavBtn active={tab === "outfit"} icon={<Wand2 />} label="造型" onClick={() => setTab("outfit")} />

      <button
        onClick={() => fileRef.current?.click()}
        className="w-14 h-14 bg-[#4A443F] text-white rounded-[22px] shadow-xl flex items-center justify-center -mt-8 border-4 border-[#FFFBF7] active:scale-90 transition"
        title="新增衣物（上傳照片）"
      >
        <Plus size={26} />
      </button>

      <NavBtn active={tab === "inspo"} icon={<BookOpen />} label="靈感" onClick={() => setTab("inspo")} />
      <NavBtn active={tab === "profile"} icon={<User />} label="個人" onClick={() => setTab("profile")} />
    </nav>
  );

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] max-w-md mx-auto relative overflow-hidden">
      <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />

      <TopLocationBar />

      {/* Page */}
      <main className="flex-1 overflow-y-auto px-5 pb-32 no-scrollbar">
        {/* CLOSET */}
        {tab === "closet" && (
          <div className="space-y-4 animate-in fade-in">
            {/* category chips */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-full text-xs font-black border-2 whitespace-nowrap ${
                    category === c ? "bg-[#6B5AED] border-[#6B5AED] text-white" : "bg-white border-transparent text-gray-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* multi-select helper */}
            {selectedIds.length > 0 && (
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3 text-xs flex items-center justify-between">
                <div className="font-bold text-indigo-700">已選 {selectedIds.length} 件</div>
                <button
                  className="text-[11px] font-black text-indigo-700 underline"
                  onClick={() => setSelectedIds([])}
                >
                  清空
                </button>
              </div>
            )}

            {/* grid */}
            <div className="grid grid-cols-2 gap-4">
              {filteredClothes.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <div key={item.id} className="bg-white rounded-[24px] p-2 shadow-sm border border-orange-50">
                    <div className="aspect-[4/5] rounded-[20px] overflow-hidden relative">
                      <img src={item.image} alt="" className="w-full h-full object-cover" />

                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[9px] font-black text-white flex items-center gap-1">
                        <MapPin size={8} /> {item.location}
                      </div>

                      {/* checkbox */}
                      <button
                        onClick={() => toggleSelected(item.id)}
                        className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                          checked ? "bg-[#6B5AED] border-[#6B5AED] text-white" : "bg-black/20 border-white/60 text-white"
                        }`}
                        title="多選"
                      >
                        <span className="text-xs font-black">✓</span>
                      </button>

                      {/* move */}
                      <button
                        onClick={() => moveItemLocation(item.id)}
                        className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/85 text-gray-600 flex items-center justify-center"
                        title="一鍵搬移台北/新竹"
                      >
                        <ArrowRightLeft size={14} />
                      </button>

                      {/* delete */}
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center border-2 border-white"
                        title="刪除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="p-2 space-y-1">
                      <div className="text-xs font-black line-clamp-1">{item.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-gray-400">{item.style}</span>
                        <span className="text-[9px] font-bold text-gray-400">{fmtTemp(item.temp)}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full border border-gray-200"
                          style={{ background: item?.colors?.dominant?.hex || "#999" }}
                          title={`${item?.colors?.dominant?.name || ""} ${item?.colors?.dominant?.hex || ""}`}
                        />
                        <span className="text-[9px] text-gray-400 line-clamp-1">
                          {item.material || "材質—"} / 厚度{item.thickness || "—"}
                        </span>
                      </div>

                      {item.notes && (
                        <div className="text-[9px] text-gray-400 line-clamp-2 leading-tight">{item.notes}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredClothes.length === 0 && (
              <div className="text-center text-gray-300 text-sm font-bold py-10">
                目前沒有符合條件的單品（試試切換地點/分類或按 + 上傳）
              </div>
            )}
          </div>
        )}

        {/* OUTFIT */}
        {tab === "outfit" && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
              <h2 className="font-black flex items-center gap-2 mb-4 text-indigo-600">
                <Sparkles size={18} /> AI 造型建議
              </h2>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <select
                  className="bg-gray-50 rounded-xl p-3 text-xs font-black"
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                >
                  {OCCASIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>

                <select
                  className="bg-gray-50 rounded-xl p-3 text-xs font-black"
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                >
                  {STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 mb-4">
                {LOCATIONS.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setCaptureLocation(loc)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 ${
                      captureLocation === loc ? "border-[#6B5AED] bg-indigo-50 text-[#6B5AED]" : "border-gray-100 text-gray-400"
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>

              <button
                onClick={runStylist}
                className="w-full py-4 bg-[#6B5AED] text-white rounded-2xl font-black shadow-lg active:scale-95 transition"
              >
                開始自動搭配
              </button>

              <div className="text-[10px] text-gray-400 mt-3 leading-relaxed">
                會依「場合＋風格＋地點衣櫥＋身型 profile」挑出一套，並提供理由與小撇步。
              </div>
            </div>

            {/* Result */}
            {stylistResult && (
              <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-black text-sm text-indigo-700">推薦結果</div>
                  <button
                    onClick={saveFavoriteFromStylist}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-500 text-xs font-black"
                  >
                    <Heart size={14} /> 收藏
                  </button>
                </div>

                {stylistPickedItems.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                    {stylistPickedItems.map((it) => (
                      <img
                        key={it.id}
                        src={it.image}
                        alt=""
                        className="w-20 h-20 rounded-xl object-cover border-2 border-white shadow-sm"
                        title={it.name}
                      />
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3">
                    <div className="font-black text-indigo-700 mb-2">理由</div>
                    <ul className="list-disc ml-4 space-y-1 text-indigo-900/90">
                      {(stylistResult.why || []).slice(0, 6).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-orange-50/70 border border-orange-100 rounded-2xl p-3">
                    <div className="font-black text-orange-700 mb-2">小撇步</div>
                    <ul className="list-disc ml-4 space-y-1 text-orange-900/90">
                      {(stylistResult.tips || []).slice(0, 6).map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="text-[10px] text-gray-400">
                  confidence：{Number(stylistResult.confidence ?? 0).toFixed(2)}
                </div>
              </div>
            )}

            {/* Favorites preview */}
            {favorites.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-black text-gray-400 tracking-widest uppercase">收藏</div>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                  {favorites.slice(0, 10).map((f) => (
                    <div key={f.id} className="flex-shrink-0 w-44 bg-white rounded-2xl border border-orange-50 shadow-sm p-3">
                      <div className="text-xs font-black line-clamp-1">{f.name}</div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        {new Date(f.createdAt).toLocaleDateString()}｜{f.location}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-2 line-clamp-3">
                        {(f.why || []).slice(0, 3).join("；")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* INSPO */}
        {tab === "inspo" && (
          <div className="animate-in fade-in space-y-5">
            <div className="flex bg-gray-100 p-1 rounded-2xl">
              {["靈感", "教材"].map((m) => (
                <button
                  key={m}
                  onClick={() => setNoteMode(m)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black transition ${
                    noteMode === m ? "bg-white shadow-sm" : "text-gray-400"
                  }`}
                >
                  {m === "靈感" ? "穿搭筆記" : "時尚教材"}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowNoteModal(true)}
              className="w-full py-10 border-2 border-dashed border-indigo-100 rounded-[24px] flex flex-col items-center justify-center text-indigo-300 bg-indigo-50/20"
            >
              <div className="w-10 h-10 rounded-full border-2 border-indigo-200 flex items-center justify-center">
                <Plus size={20} />
              </div>
              <div className="text-[10px] font-black mt-3">新增項目</div>
            </button>

            <div className="space-y-3">
              {notesFiltered.map((n) => (
                <div key={n.id} className="bg-white p-5 rounded-[24px] shadow-sm border border-orange-50 relative">
                  {n.title && <div className="font-black text-sm mb-2">{n.title}</div>}
                  <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{n.content}</div>
                  <button
                    onClick={() => deleteNote(n.id)}
                    className="absolute top-4 right-4 text-gray-300"
                    title="刪除"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="text-[10px] text-gray-300 mt-3">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>

            {notesFiltered.length === 0 && (
              <div className="text-center text-gray-300 text-sm font-bold py-10">
                目前沒有內容，按「新增項目」開始記錄
              </div>
            )}
          </div>
        )}

        {/* PROFILE */}
        {tab === "profile" && (
          <div className="animate-in fade-in space-y-6">
            {/* Gemini setting block (UI follow V14) */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
              <div className="text-sm font-black tracking-widest text-gray-300 mb-4">GEMINI AI 設定</div>

              <div className="flex gap-3 items-center">
                <input
                  value="已使用 Vercel 環境變數 (GEMINI_API_KEY)"
                  readOnly
                  className="flex-1 bg-gray-50 rounded-2xl p-4 text-xs font-black text-gray-400"
                />
                <button
                  onClick={verifyGemini}
                  className="px-5 py-4 rounded-2xl bg-[#6B5AED] text-white text-xs font-black shadow-lg active:scale-95 transition"
                >
                  驗證
                </button>
              </div>

              {verifyState.ok != null && (
                <div className={`mt-3 text-xs font-black ${verifyState.ok ? "text-green-600" : "text-red-500"}`}>
                  {verifyState.msg}
                </div>
              )}

              <div className="mt-4 text-[10px] text-gray-400 leading-relaxed">
                你不需要在前端輸入 API Key；安全代理會從伺服器環境變數讀取，避免金鑰外洩。
              </div>
            </div>

            {/* Body profile */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
              <div className="text-sm font-black tracking-widest text-gray-300 mb-4">身型設定</div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-[10px] font-black text-gray-400 mb-2">身高 CM</div>
                  <input
                    type="number"
                    value={profile.height}
                    onChange={(e) => setProfile((p) => ({ ...p, height: clamp(e.target.value, 120, 220) }))}
                    className="w-full bg-gray-50 rounded-2xl p-4 text-sm font-black"
                  />
                </div>
                <div>
                  <div className="text-[10px] font-black text-gray-400 mb-2">體重 KG</div>
                  <input
                    type="number"
                    value={profile.weight}
                    onChange={(e) => setProfile((p) => ({ ...p, weight: clamp(e.target.value, 30, 180) }))}
                    className="w-full bg-gray-50 rounded-2xl p-4 text-sm font-black"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {BODY_TYPES.map((bt) => (
                  <button
                    key={bt}
                    onClick={() => setProfile((p) => ({ ...p, shape: bt }))}
                    className={`py-3 rounded-2xl text-[11px] font-black border-2 ${
                      profile.shape === bt
                        ? "bg-[#6B5AED] border-[#6B5AED] text-white"
                        : "bg-white border-gray-100 text-gray-400"
                    }`}
                  >
                    {bt}
                  </button>
                ))}
              </div>

              <div className="mt-5 text-[10px] text-gray-400 leading-relaxed">
                AI 造型推薦會參考這些數據（例如倒三角/梨形的視覺平衡策略）。
              </div>
            </div>

            {/* capture location */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
              <div className="text-xs font-black text-gray-400 tracking-widest uppercase mb-4">預設新增地點</div>
              <div className="flex gap-2">
                {LOCATIONS.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setCaptureLocation(loc)}
                    className={`flex-1 py-3 rounded-2xl text-xs font-black border-2 ${
                      captureLocation === loc ? "border-[#6B5AED] bg-indigo-50 text-[#6B5AED]" : "border-gray-100 text-gray-400"
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav />

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-[100] bg-white/70 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-[#6B5AED] border-t-transparent rounded-full animate-spin"></div>
            <Loader2 className="absolute inset-0 m-auto text-[#6B5AED] animate-spin" size={24} />
          </div>
          <p className="text-[#6B5AED] font-black text-[10px] tracking-[0.2em] uppercase text-center animate-pulse">
            {loadingText || "Loading..."}
          </p>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white w-full rounded-[40px] p-8 shadow-2xl">
            <div className="text-lg font-black mb-4">{noteMode === "靈感" ? "新增穿搭筆記" : "新增教材筆記"}</div>

            <input
              placeholder="標題（選填）"
              className="w-full bg-gray-50 p-4 rounded-2xl mb-3 font-black text-xs"
              value={noteDraft.title}
              onChange={(e) => setNoteDraft((d) => ({ ...d, title: e.target.value }))}
            />

            <textarea
              placeholder="內容..."
              className="w-full bg-gray-50 p-4 rounded-2xl mb-4 text-xs h-32 focus:outline-none"
              value={noteDraft.content}
              onChange={(e) => setNoteDraft((d) => ({ ...d, content: e.target.value }))}
            />

            <div className="flex gap-4">
              <button
                onClick={() => setShowNoteModal(false)}
                className="flex-1 py-3 text-xs font-black text-gray-400"
              >
                取消
              </button>
              <button
                onClick={addNote}
                className="flex-1 py-3 bg-indigo-500 text-white rounded-2xl text-xs font-black shadow-lg"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavBtn({ active, icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 ${active ? "text-[#6B5AED]" : "text-gray-300"}`}>
      {React.cloneElement(icon, { size: 22, strokeWidth: active ? 3 : 2 })}
      <span className="text-[9px] font-black">{label}</span>
    </button>
  );
}