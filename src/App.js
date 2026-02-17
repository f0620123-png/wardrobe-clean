import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus, Trash2, Shirt, Sparkles, BookOpen, Wand2,
  MapPin, Heart, User, ArrowRightLeft, Loader2, Settings, PlusCircle
} from 'lucide-react';

// --- 常數 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];
const BODY_TYPES = ['H型', '倒三角形', '梨形', '沙漏型', '圓形(O型)'];

// --- LocalStorage Safe ---
const safeParse = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    return fallback;
  }
};

const INITIAL_CLOTHES = [
  {
    id: 't1',
    name: '白牛津襯衫',
    category: '上衣',
    style: '商務',
    styleTags: ['商務', '極簡'],
    temp: { min: 15, max: 25 },
    material: '棉(牛津布)',
    thickness: 2,
    color: {
      mainName: '白',
      mainHex: '#FFFFFF',
      undertone: '中性',
      brightness: '高',
      saturation: '低'
    },
    image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400',
    location: '台北',
    desc: '版型：合身修身；材質挺括；百搭商務/日常皆可。'
  }
];

// --- 工具：從文字中抽出第一段 JSON Object（避免模型夾雜說明）---
function extractFirstJsonObject(text) {
  if (!text) return null;
  const s = String(text);

  // 先移除常見 code fence
  const cleaned = s.replace(/```json|```/g, '').trim();

  // 找第一個 '{'，用括號配對抽出完整 object
  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) {
      const candidate = cleaned.slice(start, i + 1);
      return candidate;
    }
  }
  return null;
}

function safeJsonParseFromModel(text) {
  const objStr = extractFirstJsonObject(text);
  if (!objStr) throw new Error('模型回覆中找不到 JSON。');
  try {
    return JSON.parse(objStr);
  } catch (e) {
    throw new Error('JSON 解析失敗（可能是多餘逗號或格式不合法）。');
  }
}

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function formatTempRange(item) {
  if (item?.temp?.min != null && item?.temp?.max != null) {
    return `${item.temp.min}-${item.temp.max}°C`;
  }
  if (item?.tempRange) return item.tempRange; // 舊資料相容
  return '—';
}

function normalizeColorFields(color) {
  if (!color || typeof color !== 'object') return null;
  const undertone = ['冷', '暖', '中性'].includes(color.undertone) ? color.undertone : '中性';
  const brightness = ['高', '中', '低'].includes(color.brightness) ? color.brightness : '中';
  const saturation = ['高', '中', '低'].includes(color.saturation) ? color.saturation : '中';

  let hex = (color.mainHex || '').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) hex = '#999999';

  return {
    mainName: String(color.mainName || '未知'),
    mainHex: hex,
    undertone,
    brightness,
    saturation
  };
}

// --- 安全代理呼叫 ---
async function callGeminiProxy({ prompt, imageBase64 }) {
  const r = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, imageBase64 })
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.error || `Proxy error: HTTP ${r.status}`);
  }
  if (!data?.text) throw new Error('Proxy 回覆空白。');
  return data.text;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('closet');

  // 核心資料
  const [clothes, setClothes] = useState(() => safeParse('my_clothes_v15', INITIAL_CLOTHES));
  const [favorites, setFavorites] = useState(() => safeParse('my_favorites_v15', []));
  const [notes, setNotes] = useState(() => safeParse('my_notes_v15', []));
  const [userProfile, setUserProfile] = useState(() => safeParse('user_profile_v15', { height: 175, weight: 70, bodyType: 'H型' }));

  // UI
  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [currentViewLocation, setCurrentViewLocation] = useState('全部');
  const [userLocation, setUserLocation] = useState('台北');
  const [noteTab, setNoteTab] = useState('notes');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNoteData, setNewNoteData] = useState({ title: '', content: '' });
  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });

  const fileInputRef = useRef(null);

  // 自動保存
  useEffect(() => { localStorage.setItem('my_clothes_v15', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_favorites_v15', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('my_notes_v15', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('user_profile_v15', JSON.stringify(userProfile)); }, [userProfile]);

  // 你原本有 v14 key/profile 等舊 key；這裡做輕微資料遷移（不會刪除，只是讀取 v15）
  useEffect(() => {
    // 若你的舊資料存在 tempRange 字串、但沒有 temp，這裡不強制轉，僅顯示時相容
  }, []);

  const filteredClothes = useMemo(() => {
    return clothes.filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation));
  }, [clothes, selectedCategory, currentViewLocation]);

  // --- 圖像分析（強化版） ---
  const analyzeImageWithGemini = async (base64Image) => {
    setIsGenerating(true);
    setLoadingText('AI 正在分析顏色 / 材質 / 厚度 / 溫度...');
    setAiResult(null);

    const base64Data = base64Image.split(',')[1];

    // 強制模型回傳 schema（enum + 數值欄位）
    const prompt = `
你是一名專業服裝分析師 + 色彩與布料顧問。
請分析圖片中的「單一件」衣物，並【只回傳純 JSON】（不得有 Markdown、不得有多餘文字）。

【可選分類】category 必須從以下擇一：
${CATEGORIES.join('、')}

【可選風格】style 必須從以下擇一：
${STYLES.join('、')}

【可選風格標籤】styleTags 最多 3 個，必須從以下挑選：
${STYLES.join('、')}

【厚度定義】thickness 為 1~5：
1=超薄(背心/薄T/雪紡)；2=薄(襯衫/薄棉T)；3=中(薄針織/丹寧)；4=厚(厚針織/毛呢/鋪棉)；5=極厚(羽絨/厚大衣)

【溫度定義】temp.min/temp.max 為整數（攝氏），且 temp.min < temp.max。
請用「厚度+材質」推估可穿溫度：
- thickness 1：24~34
- thickness 2：18~30
- thickness 3：12~24
- thickness 4：6~18
- thickness 5：-2~10
若圖片顯示更透/更厚，可上下微調 2~4 度，但仍需合理。

【色彩欄位】color：
- mainName：主色名稱（如 白 / 黑 / 深藍 / 卡其 / 灰）
- mainHex：#RRGGBB（合理估計即可）
- undertone：只能是「冷」「暖」「中性」
- brightness：只能是「高」「中」「低」
- saturation：只能是「高」「中」「低」

【材質】material：用最可能的材質（如 棉 / 牛仔丹寧 / 羊毛 / 尼龍 / 皮革 / 針織 / 西裝布）
【描述】desc：40 字內，包含版型觀察 + 搭配建議（不要超過 40 字）

請回傳以下 JSON 結構（欄位不得缺漏）：
{
  "name": "衣物簡稱",
  "category": "上衣/下著/內搭/外套/背心/鞋子/帽子/飾品/包包",
  "style": "從清單選一個",
  "styleTags": ["最多3個，從清單選"],
  "color": {
    "mainName": "主色名",
    "mainHex": "#RRGGBB",
    "undertone": "冷/暖/中性",
    "brightness": "高/中/低",
    "saturation": "高/中/低"
  },
  "material": "材質推測",
  "thickness": 1,
  "temp": { "min": 18, "max": 30 },
  "desc": "40字內建議"
}
`.trim();

    try {
      const rawText = await callGeminiProxy({ prompt, imageBase64: base64Data });
      const result = safeJsonParseFromModel(rawText);

      // --- 基本驗證與修正（防呆）---
      const name = String(result.name || '未命名').slice(0, 30);

      const category = CATEGORIES.includes(result.category) ? result.category : '上衣';
      const style = STYLES.includes(result.style) ? result.style : '極簡';

      const styleTags = Array.isArray(result.styleTags)
        ? result.styleTags.filter(t => STYLES.includes(t)).slice(0, 3)
        : [];

      const color = normalizeColorFields(result.color) || {
        mainName: '未知',
        mainHex: '#999999',
        undertone: '中性',
        brightness: '中',
        saturation: '中'
      };

      const material = String(result.material || '未知').slice(0, 30);

      const thickness = clamp(result.thickness, 1, 5);

      const minT = clamp(result?.temp?.min, -10, 40);
      const maxT = clamp(result?.temp?.max, -10, 45);
      const temp = (minT < maxT) ? { min: Math.round(minT), max: Math.round(maxT) } : { min: 18, max: 30 };

      const desc = String(result.desc || '').trim().slice(0, 60);

      const newItem = {
        id: Date.now().toString(),
        name,
        category,
        style,
        styleTags,
        color,
        material,
        thickness,
        temp,
        desc,
        image: base64Image,
        location: userLocation
      };

      setClothes(prev => [newItem, ...prev]);
      setSelectedCategory(newItem.category);
    } catch (error) {
      alert(`AI 分析失敗：${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- 自動搭配（加強：至少上衣+下著） ---
  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setLoadingText('AI 正在為你挑選一套更合理的搭配...');
    setAiResult(null);

    const available = clothes.filter(c => c.location === userLocation);
    const hasTop = available.some(c => c.category === '上衣' || c.category === '內搭');
    const hasBottom = available.some(c => c.category === '下著');

    if (!hasTop || !hasBottom) {
      alert('目前地點至少需要「上衣/內搭」與「下著」各一件，才能自動搭配。');
      setIsGenerating(false);
      return;
    }

    const wardrobeSlim = available.map(c => ({
      id: c.id,
      name: c.name,
      category: c.category,
      style: c.style,
      styleTags: c.styleTags || [],
      color: c.color || null,
      material: c.material || null,
      thickness: c.thickness || null,
      temp: c.temp || null
    }));

    const prompt = `
你是造型顧問，請從衣櫃中選出「一套」搭配，務必符合：
- 必須包含：上衣或內搭（至少1）+ 下著（至少1）
- 可選：外套/背心/鞋子/帽子/飾品/包包
- 盡量符合場合與風格，並考慮色彩協調（高飽和單品最多1件；或以中性色平衡）
- 若有 temp 欄位，選擇溫度範圍重疊較合理的組合

使用者設定：
- 場合：${outfitConfig.occasion}
- 風格：${outfitConfig.style}
- 身型：${userProfile.height}cm / ${userProfile.weight}kg / ${userProfile.bodyType}

衣櫃清單（JSON）：
${JSON.stringify(wardrobeSlim)}

只回傳純 JSON（不得有 Markdown/多餘文字）：
{
  "selectedIds": ["id1","id2","id3"],
  "reason": "100字內說明搭配邏輯（含色彩與場合）"
}
`.trim();

    try {
      const rawText = await callGeminiProxy({ prompt });
      const result = safeJsonParseFromModel(rawText);

      const selectedIds = Array.isArray(result.selectedIds) ? result.selectedIds : [];
      const picked = clothes.filter(c => selectedIds.includes(c.id));

      // 前端再做一次硬檢查：至少上衣/內搭 + 下著
      const okTop = picked.some(c => c.category === '上衣' || c.category === '內搭');
      const okBottom = picked.some(c => c.category === '下著');

      if (!okTop || !okBottom) throw new Error('模型回傳的搭配不符合「上衣/內搭 + 下著」要求。請再試一次。');

      setSelectedItems(picked);
      setAiResult(String(result.reason || '').slice(0, 200));
    } catch (e) {
      alert(`AI 搭配暫時無法使用：${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- UI ---
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => analyzeImageWithGemini(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const deleteItem = (id) => {
    if (window.confirm('確定要刪除這件衣物嗎？')) {
      setClothes(prev => prev.filter(c => c.id !== id));
      setSelectedItems(prev => prev.filter(i => i.id !== id));
    }
  };

  const toggleSelectItem = (item) => {
    setSelectedItems(prev =>
      prev.find(i => i.id === item.id)
        ? prev.filter(i => i.id !== item.id)
        : [...prev, item]
    );
  };

  const moveLocation = (id) => {
    setClothes(prev => prev.map(c => c.id === id ? { ...c, location: c.location === '台北' ? '新竹' : '台北' } : c));
  };

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] max-w-md mx-auto relative overflow-hidden font-sans">
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* Header */}
      <header className="px-6 pt-10 pb-4 bg-[#FFFBF7] z-10 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-black text-[#6B5AED]">V15 安全代理 + 強化分析</h1>
          <button onClick={() => setActiveTab('profile')} className="p-2 bg-white rounded-full shadow-sm border border-orange-50">
            <User size={20} className="text-[#6B5AED]" />
          </button>
        </div>

        <div className="flex bg-orange-100/50 p-1 rounded-2xl">
          {['全部', ...LOCATIONS].map(loc => (
            <button
              key={loc}
              onClick={() => setCurrentViewLocation(loc)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentViewLocation === loc ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400'
              }`}
            >
              {loc}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 pb-32 no-scrollbar">
        {activeTab === 'closet' && (
          <div className="animate-in fade-in">
            <div className="flex overflow-x-auto no-scrollbar gap-2 mb-4 py-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-full text-xs font-bold flex-shrink-0 border-2 ${
                    selectedCategory === cat
                      ? 'bg-[#6B5AED] border-[#6B5AED] text-white'
                      : 'bg-white border-transparent text-gray-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {filteredClothes.map(item => (
                <div key={item.id} className="bg-white rounded-[24px] p-2 shadow-sm border border-orange-50 relative group">
                  <div className="aspect-[4/5] rounded-[20px] overflow-hidden relative">
                    <img src={item.image} className="w-full h-full object-cover" alt="" />
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[9px] font-bold text-white flex items-center gap-1">
                      <MapPin size={8} /> {item.location}
                    </div>

                    <button
                      onClick={() => toggleSelectItem(item)}
                      className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                        selectedItems.find(i => i.id === item.id)
                          ? 'bg-[#6B5AED] text-white border-[#6B5AED]'
                          : 'bg-black/20 text-white border-white/60'
                      }`}
                    >
                      <span className="text-xs font-black">✓</span>
                    </button>

                    <button
                      onClick={() => deleteItem(item.id)}
                      className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center border-2 border-white"
                    >
                      <Trash2 size={14} />
                    </button>

                    <button
                      onClick={() => moveLocation(item.id)}
                      className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/80 text-gray-600 flex items-center justify-center"
                    >
                      <ArrowRightLeft size={14} />
                    </button>
                  </div>

                  <div className="p-2 space-y-1">
                    <h3 className="text-xs font-bold line-clamp-1">{item.name}</h3>

                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-gray-400">{item.style}</span>
                      <span className="text-[9px] font-bold text-gray-400">{formatTempRange(item)}</span>
                    </div>

                    {/* 顏色/材質/厚度顯示 */}
                    <div className="flex items-center gap-2">
                      {item.color?.mainHex && (
                        <span
                          className="inline-block w-3 h-3 rounded-full border border-gray-200"
                          style={{ backgroundColor: item.color.mainHex }}
                          title={`${item.color.mainName} ${item.color.mainHex}`}
                        />
                      )}
                      <span className="text-[9px] text-gray-400 line-clamp-1">
                        {item.material ? `${item.material}` : '材質—'}{item.thickness ? ` / 厚度${item.thickness}` : ''}
                      </span>
                    </div>

                    <p className="text-[9px] text-gray-400 mt-1 line-clamp-2 leading-tight">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'outfit' && (
          <div className="animate-in slide-in-from-bottom space-y-6">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
              <h2 className="font-bold flex items-center gap-2 mb-4 text-indigo-600">
                <Sparkles size={18} /> AI 造型推薦
              </h2>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <select
                  value={outfitConfig.occasion}
                  onChange={e => setOutfitConfig({ ...outfitConfig, occasion: e.target.value })}
                  className="bg-gray-50 rounded-xl p-3 text-xs font-bold"
                >
                  {OCCASIONS.map(o => <option key={o}>{o}</option>)}
                </select>

                <select
                  value={outfitConfig.style}
                  onChange={e => setOutfitConfig({ ...outfitConfig, style: e.target.value })}
                  className="bg-gray-50 rounded-xl p-3 text-xs font-bold"
                >
                  {STYLES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <button
                onClick={autoPickOutfit}
                className="w-full py-4 bg-[#6B5AED] text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all"
              >
                AI 自動搭配
              </button>
            </div>

            {aiResult && (
              <div className="bg-indigo-50 p-4 rounded-2xl text-xs leading-relaxed text-indigo-900 shadow-inner">
                {aiResult}
              </div>
            )}

            {selectedItems.length > 0 && (
              <div className="flex gap-2 overflow-x-auto py-2">
                {selectedItems.map(item => (
                  <img key={item.id} src={item.image} className="w-20 h-20 rounded-xl object-cover border-2 border-white shadow-sm" alt="" />
                ))}

                <button
                  onClick={() => {
                    setFavorites(prev => [{ id: Date.now(), items: selectedItems, date: new Date().toLocaleDateString() }, ...prev]);
                    alert('已加入收藏');
                  }}
                  className="w-20 h-20 bg-white rounded-xl flex flex-col items-center justify-center text-red-400 border-2 border-dashed border-red-100"
                >
                  <Heart size={20} />
                  <span className="text-[9px] font-bold">收藏</span>
                </button>
              </div>
            )}

            {favorites.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">歷史收藏</h3>
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {favorites.map(f => (
                    <div key={f.id} className="flex-shrink-0 w-32 bg-white p-1 rounded-xl shadow-sm">
                      <img src={f.items[0]?.image} className="w-full h-32 object-cover rounded-lg" alt="" />
                      <p className="text-[10px] text-center p-2 text-gray-400 font-bold">{f.date}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="animate-in fade-in space-y-4">
            <div className="flex bg-gray-100 p-1 rounded-2xl">
              <button
                onClick={() => setNoteTab('notes')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${noteTab === 'notes' ? 'bg-white shadow-sm' : 'text-gray-400'}`}
              >
                穿搭筆記
              </button>
              <button
                onClick={() => setNoteTab('courses')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${noteTab === 'courses' ? 'bg-white shadow-sm' : 'text-gray-400'}`}
              >
                課程教材
              </button>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="w-full py-8 border-2 border-dashed border-indigo-100 rounded-[24px] flex flex-col items-center justify-center text-indigo-300 bg-indigo-50/20"
            >
              <PlusCircle size={24} />
              <span className="text-[10px] font-bold mt-2">新增紀錄</span>
            </button>

            <div className="space-y-3">
              {notes.filter(n => n.type === noteTab).map(note => (
                <div key={note.id} className="bg-white p-5 rounded-[24px] shadow-sm relative border border-orange-50">
                  {note.title && <h4 className="font-bold text-sm mb-2">{note.title}</h4>}
                  <p className="text-xs text-gray-600 leading-relaxed">{note.content}</p>
                  <button onClick={() => setNotes(prev => prev.filter(n => n.id !== note.id))} className="absolute top-4 right-4 text-gray-300">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50">
              <h2 className="font-black mb-6 flex items-center gap-2 text-lg">
                <Settings size={18} /> 系統設定
              </h2>

              <div className="space-y-4">
                <div className="bg-indigo-50/60 border border-indigo-100 p-4 rounded-2xl">
                  <div className="text-xs font-bold text-indigo-700">✅ 已改為安全代理</div>
                  <div className="text-[10px] text-indigo-700/80 mt-1 leading-relaxed">
                    API Key 已移至 Vercel 環境變數（GEMINI_API_KEY），前端不再保存金鑰。
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <label className="text-[10px] font-bold text-gray-400 mb-2 block uppercase">預設拍照地點</label>
                  <div className="flex gap-2">
                    {LOCATIONS.map(loc => (
                      <button
                        key={loc}
                        onClick={() => setUserLocation(loc)}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold border-2 ${
                          userLocation === loc ? 'border-[#6B5AED] bg-indigo-50 text-[#6B5AED]' : 'border-gray-100 text-gray-400'
                        }`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50">
              <h3 className="font-bold text-xs text-gray-400 uppercase mb-4 tracking-widest">身型檔案 (AI 搭配依據)</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <input
                  type="number"
                  value={userProfile.height}
                  onChange={e => setUserProfile({ ...userProfile, height: e.target.value })}
                  placeholder="身高"
                  className="bg-gray-50 p-3 rounded-xl text-xs font-bold"
                />
                <input
                  type="number"
                  value={userProfile.weight}
                  onChange={e => setUserProfile({ ...userProfile, weight: e.target.value })}
                  placeholder="體重"
                  className="bg-gray-50 p-3 rounded-xl text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {BODY_TYPES.map(bt => (
                  <button
                    key={bt}
                    onClick={() => setUserProfile({ ...userProfile, bodyType: bt })}
                    className={`py-2.5 rounded-xl text-[10px] font-bold border-2 ${
                      userProfile.bodyType === bt ? 'border-[#6B5AED] bg-indigo-50 text-[#6B5AED]' : 'border-gray-100 text-gray-400'
                    }`}
                  >
                    {bt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-xl border-t border-gray-100 flex justify-around items-center px-6 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-40">
        <NavButton active={activeTab === 'closet'} icon={<Shirt />} label="衣櫥" onClick={() => setActiveTab('closet')} />
        <NavButton active={activeTab === 'outfit'} icon={<Wand2 />} label="造型" onClick={() => setActiveTab('outfit')} />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-14 h-14 bg-[#4A443F] text-white rounded-[20px] shadow-xl flex items-center justify-center -mt-8 border-4 border-[#FFFBF7] active:scale-90 transition-all"
        >
          <Plus size={28} />
        </button>
        <NavButton active={activeTab === 'notes'} icon={<BookOpen />} label="靈感" onClick={() => setActiveTab('notes')} />
        <NavButton active={activeTab === 'profile'} icon={<Settings />} label="設定" onClick={() => setActiveTab('profile')} />
      </nav>

      {/* Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-[100] bg-white/70 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-[#6B5AED] border-t-transparent rounded-full animate-spin"></div>
            <Loader2 className="absolute inset-0 m-auto text-[#6B5AED] animate-spin" size={24} />
          </div>
          <p className="text-[#6B5AED] font-black text-[10px] tracking-[0.2em] uppercase text-center animate-pulse">{loadingText}</p>
        </div>
      )}

      {/* Note Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white w-full rounded-[40px] p-8 shadow-2xl">
            <h3 className="text-lg font-black mb-4">新增內容</h3>
            <input
              placeholder="輸入標題 (選填)"
              className="w-full bg-gray-50 p-4 rounded-2xl mb-3 font-bold text-xs"
              value={newNoteData.title}
              onChange={e => setNewNoteData({ ...newNoteData, title: e.target.value })}
            />
            <textarea
              placeholder="寫下你的穿搭靈感或學習筆記..."
              className="w-full bg-gray-50 p-4 rounded-2xl mb-4 text-xs h-32 focus:outline-none"
              value={newNoteData.content}
              onChange={e => setNewNoteData({ ...newNoteData, content: e.target.value })}
            />
            <div className="flex gap-4">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 text-xs font-bold text-gray-400">取消</button>
              <button
                onClick={() => {
                  if (newNoteData.content) {
                    setNotes(prev => [{
                      id: Date.now(),
                      type: noteTab,
                      title: newNoteData.title,
                      content: newNoteData.content,
                      date: new Date().toLocaleDateString()
                    }, ...prev]);
                    setShowAddModal(false);
                    setNewNoteData({ title: '', content: '' });
                  }
                }}
                className="flex-1 py-3 bg-indigo-500 text-white rounded-2xl text-xs font-bold shadow-lg"
              >
                儲存內容
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavButton({ active, icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 relative ${active ? 'text-[#6B5AED]' : 'text-gray-300'}`}>
      {active && <div className="absolute -top-4 w-1 h-1 bg-[#6B5AED] rounded-full"></div>}
      {React.cloneElement(icon, { size: 20, strokeWidth: active ? 3 : 2 })}
      <span className={`text-[8px] font-black uppercase tracking-tighter ${active ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
    </button>
  );
}