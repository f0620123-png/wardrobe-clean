import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, RefreshCw, Heart, User, ArrowRightLeft, Camera, 
  Loader2, Settings, ExternalLink, CheckCircle, XCircle, PlusCircle
} from 'lucide-react';

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];
const BODY_TYPES = ['H型', '倒三角形', '梨形', '沙漏型', '圓形(O型)'];

// 安全讀取 LocalStorage
const safeParse = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    return fallback;
  }
};

const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北', desc: '版型：合身修身\n材質：挺括牛津布\n分析：適合商務場合，百搭經典。' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('closet'); 
  
  // 核心數據狀態
  const [clothes, setClothes] = useState(() => safeParse('my_clothes_v14', INITIAL_CLOTHES));
  const [favorites, setFavorites] = useState(() => safeParse('my_favorites_v14', []));
  const [notes, setNotes] = useState(() => safeParse('my_notes_v14', []));
  
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('my_gemini_key') || '');
  const [keyStatus, setKeyStatus] = useState('idle');

  // UI 狀態
  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]); 
  const [isGenerating, setIsGenerating] = useState(false); 
  const [loadingText, setLoadingText] = useState(''); 
  const [aiResult, setAiResult] = useState(null);
  const [currentViewLocation, setCurrentViewLocation] = useState('全部'); 
  const [userLocation, setUserLocation] = useState('台北'); 
  const [userProfile, setUserProfile] = useState(() => safeParse('user_profile', { height: 175, weight: 70, bodyType: 'H型' }));
  const [noteTab, setNoteTab] = useState('notes'); 
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNoteData, setNewNoteData] = useState({ title: '', content: '' });
  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });

  const fileInputRef = useRef(null);

  // 自動保存
  useEffect(() => { localStorage.setItem('my_clothes_v14', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_favorites_v14', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('my_notes_v14', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('my_gemini_key', userApiKey); }, [userApiKey]);
  useEffect(() => { localStorage.setItem('user_profile', JSON.stringify(userProfile)); }, [userProfile]);

  // --- API 呼叫核心 (V14 穩健版：自動切換模型) ---
  const callGeminiAPI = async (prompt, imageBase64 = null) => {
    // 解決 models/gemini-1.5-flash is not found 的方案：嘗試多個端點
    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
    
    for (const model of models) {
      try {
        const bodyPayload = {
          contents: [{
            parts: [
              { text: prompt },
              ...(imageBase64 ? [{ inline_data: { mime_type: "image/jpeg", data: imageBase64 } }] : [])
            ]
          }]
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${userApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        if (data.candidates && data.candidates[0].content) {
          return data.candidates[0].content.parts[0].text;
        }
      } catch (e) {
        console.warn(`模型 ${model} 連線失敗，嘗試下一個...`);
        if (model === 'gemini-pro') throw e; 
      }
    }
  };

  // --- 驗證 Key ---
  const verifyKey = async () => {
    if (!userApiKey) return;
    setKeyStatus('validating');
    try {
      await callGeminiAPI("Hi");
      setKeyStatus('valid');
    } catch (e) {
      setKeyStatus('invalid');
      alert("API Key 驗證失敗，請檢查權限或輸入是否正確。");
    }
  };

  // --- 圖像分析 ---
  const analyzeImageWithGemini = async (base64Image) => {
    setIsGenerating(true);
    setLoadingText('AI 正在辨識衣物材質與細節...');

    if (!userApiKey) {
      alert("請先至「個人」設定頁面輸入 API Key。");
      setIsGenerating(false);
      return;
    }

    const base64Data = base64Image.split(',')[1];
    const prompt = `你是一名專業服裝分析師。請分析這張圖片並回傳純 JSON (不要有 Markdown)：
    {
      "name": "衣物簡稱",
      "category": "從 [${CATEGORIES.join(', ')}] 選一個",
      "style": "從 [${STYLES.join(', ')}] 選一個",
      "tempRange": "適合溫標 (如 15-22°C)",
      "desc": "簡短的版型與搭配建議 (40字內)"
    }`;

    try {
      const text = await callGeminiAPI(prompt, base64Data);
      const result = JSON.parse(text.replace(/```json|```/g, '').trim());

      const newItem = {
        id: Date.now().toString(),
        ...result,
        image: base64Image,
        location: userLocation
      };

      setClothes([newItem, ...clothes]);
      setSelectedCategory(newItem.category);
    } catch (error) {
      alert(`AI 分析失敗：${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- 自動搭配 ---
  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setLoadingText('AI 正在為您挑選最佳搭配...');
    setAiResult(null);

    const available = clothes.filter(c => c.location === userLocation);
    if (available.length < 2) {
      alert("目前地點的衣服太少囉！");
      setIsGenerating(false);
      return;
    }

    const prompt = `場合：${outfitConfig.occasion}，風格：${outfitConfig.style}。
    身型：${userProfile.height}cm/${userProfile.weight}kg/${userProfile.bodyType}。
    衣櫃清單：${JSON.stringify(available.map(c => ({id:c.id, name:c.name, cat:c.category})))}。
    請挑選一套搭配，回傳 JSON：{"selectedIds": ["id1", "id2"], "reason": "推薦理由"}`;

    try {
      const text = await callGeminiAPI(prompt);
      const result = JSON.parse(text.replace(/```json|```/g, '').trim());
      const picked = clothes.filter(c => result.selectedIds.includes(c.id));
      setSelectedItems(picked);
      setAiResult(result.reason);
    } catch (e) {
      alert("AI 搭配暫時無法使用。");
    } finally {
      setIsGenerating(false);
    }
  };

  // --- UI 邏輯 ---
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
      setClothes(clothes.filter(c => c.id !== id));
      setSelectedItems(selectedItems.filter(i => i.id !== id));
    }
  };

  const toggleSelectItem = (item) => {
    setSelectedItems(prev => prev.find(i => i.id === item.id) ? prev.filter(i => i.id !== item.id) : [...prev, item]);
  };

  const moveLocation = (id) => {
    setClothes(clothes.map(c => c.id === id ? { ...c, location: c.location === '台北' ? '新竹' : '台北' } : c));
  };

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] max-w-md mx-auto relative overflow-hidden font-sans">
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* Header */}
      <header className="px-6 pt-10 pb-4 bg-[#FFFBF7] z-10 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-black text-[#6B5AED]">V14.1 功能全回歸</h1>
          <button onClick={() => setActiveTab('profile')} className="p-2 bg-white rounded-full shadow-sm border border-orange-50">
            <User size={20} className={keyStatus === 'valid' ? "text-green-500" : "text-gray-400"} />
          </button>
        </div>
        <div className="flex bg-orange-100/50 p-1 rounded-2xl">
          {['全部', ...LOCATIONS].map(loc => (
            <button key={loc} onClick={() => setCurrentViewLocation(loc)} className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${currentViewLocation === loc ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400'}`}>{loc}</button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 pb-32 no-scrollbar">
        {activeTab === 'closet' && (
          <div className="animate-in fade-in">
            <div className="flex overflow-x-auto no-scrollbar gap-2 mb-4 py-2">
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-2 rounded-full text-xs font-bold flex-shrink-0 border-2 ${selectedCategory === cat ? 'bg-[#6B5AED] border-[#6B5AED] text-white' : 'bg-white border-transparent text-gray-400'}`}>{cat}</button>
              ))}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {clothes.filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation)).map(item => (
                <div key={item.id} className="bg-white rounded-[24px] p-2 shadow-sm border border-orange-50 relative group">
                  <div className="aspect-[4/5] rounded-[20px] overflow-hidden relative">
                    <img src={item.image} className="w-full h-full object-cover" alt="" />
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[9px] font-bold text-white flex items-center gap-1"><MapPin size={8} /> {item.location}</div>
                    <button onClick={() => toggleSelectItem(item)} className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center ${selectedItems.find(i=>i.id===item.id) ? 'bg-[#6B5AED] text-white border-[#6B5AED]' : 'bg-black/20 text-white border-white/60'}`}><Check size={16} /></button>
                    <button onClick={() => deleteItem(item.id)} className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center border-2 border-white"><Trash2 size={14} /></button>
                    <button onClick={() => moveLocation(item.id)} className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/80 text-gray-600 flex items-center justify-center"><ArrowRightLeft size={14} /></button>
                  </div>
                  <div className="p-2">
                    <h3 className="text-xs font-bold line-clamp-1">{item.name}</h3>
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
              <h2 className="font-bold flex items-center gap-2 mb-4 text-indigo-600"><Sparkles size={18} /> AI 造型推薦</h2>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <select value={outfitConfig.occasion} onChange={e=>setOutfitConfig({...outfitConfig, occasion:e.target.value})} className="bg-gray-50 rounded-xl p-3 text-xs font-bold">{OCCASIONS.map(o=><option key={o}>{o}</option>)}</select>
                <select value={outfitConfig.style} onChange={e=>setOutfitConfig({...outfitConfig, style:e.target.value})} className="bg-gray-50 rounded-xl p-3 text-xs font-bold">{STYLES.map(s=><option key={s}>{s}</option>)}</select>
              </div>
              <button onClick={autoPickOutfit} className="w-full py-4 bg-[#6B5AED] text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all">AI 自動搭配</button>
            </div>
            
            {aiResult && <div className="bg-indigo-50 p-4 rounded-2xl text-xs leading-relaxed text-indigo-900 shadow-inner">{aiResult}</div>}
            
            {selectedItems.length > 0 && (
              <div className="flex gap-2 overflow-x-auto py-2">
                {selectedItems.map(item => (
                  <img key={item.id} src={item.image} className="w-20 h-20 rounded-xl object-cover border-2 border-white shadow-sm" alt="" />
                ))}
                <button onClick={() => { setFavorites([{id:Date.now(), items:selectedItems, date:new Date().toLocaleDateString()}, ...favorites]); alert("已加入收藏"); }} className="w-20 h-20 bg-white rounded-xl flex flex-col items-center justify-center text-red-400 border-2 border-dashed border-red-100"><Heart size={20}/><span className="text-[9px] font-bold">收藏</span></button>
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
              <button onClick={() => setNoteTab('notes')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${noteTab === 'notes' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>穿搭筆記</button>
              <button onClick={() => setNoteTab('courses')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${noteTab === 'courses' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>課程教材</button>
            </div>
            <button onClick={() => setShowAddModal(true)} className="w-full py-8 border-2 border-dashed border-indigo-100 rounded-[24px] flex flex-col items-center justify-center text-indigo-300 bg-indigo-50/20">
              <PlusCircle size={24} />
              <span className="text-[10px] font-bold mt-2">新增紀錄</span>
            </button>
            <div className="space-y-3">
              {notes.filter(n => n.type === noteTab).map(note => (
                <div key={note.id} className="bg-white p-5 rounded-[24px] shadow-sm relative border border-orange-50">
                  {note.title && <h4 className="font-bold text-sm mb-2">{note.title}</h4>}
                  <p className="text-xs text-gray-600 leading-relaxed">{note.content}</p>
                  <button onClick={() => setNotes(notes.filter(n=>n.id!==note.id))} className="absolute top-4 right-4 text-gray-300"><Trash2 size={12}/></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50">
              <h2 className="font-black mb-6 flex items-center gap-2 text-lg"><Settings size={18} /> 系統設定</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 mb-2 block uppercase">Gemini API Key</label>
                  <div className="flex gap-2">
                    <input type="password" value={userApiKey} onChange={e=>setUserApiKey(e.target.value)} placeholder="貼上 Key..." className="flex-1 bg-gray-50 p-3 rounded-xl text-xs font-bold border-2 border-transparent focus:border-indigo-500 focus:outline-none" />
                    <button onClick={verifyKey} className={`px-4 rounded-xl text-white font-bold transition-all ${keyStatus === 'valid' ? 'bg-green-500' : 'bg-[#6B5AED]'}`}>{keyStatus === 'valid' ? <CheckCircle size={16}/> : '驗證'}</button>
                  </div>
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-indigo-500 mt-2 block font-bold flex items-center gap-1"><ExternalLink size={10} /> 點此取得免費 API Key</a>
                </div>
                
                <div className="pt-4 border-t border-gray-100">
                  <label className="text-[10px] font-bold text-gray-400 mb-2 block uppercase">預設拍照地點</label>
                  <div className="flex gap-2">
                    {LOCATIONS.map(loc => (
                      <button key={loc} onClick={() => setUserLocation(loc)} className={`flex-1 py-3 rounded-xl text-xs font-bold border-2 ${userLocation === loc ? 'border-[#6B5AED] bg-indigo-50 text-[#6B5AED]' : 'border-gray-100 text-gray-400'}`}>{loc}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50">
              <h3 className="font-bold text-xs text-gray-400 uppercase mb-4 tracking-widest">身型檔案 (AI 搭配依據)</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <input type="number" value={userProfile.height} onChange={e=>setUserProfile({...userProfile, height:e.target.value})} placeholder="身高" className="bg-gray-50 p-3 rounded-xl text-xs font-bold" />
                <input type="number" value={userProfile.weight} onChange={e=>setUserProfile({...userProfile, weight:e.target.value})} placeholder="體重" className="bg-gray-50 p-3 rounded-xl text-xs font-bold" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {BODY_TYPES.map(bt => (
                  <button key={bt} onClick={()=>setUserProfile({...userProfile, bodyType:bt})} className={`py-2.5 rounded-xl text-[10px] font-bold border-2 ${userProfile.bodyType === bt ? 'border-[#6B5AED] bg-indigo-50 text-[#6B5AED]' : 'border-gray-100 text-gray-400'}`}>{bt}</button>
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
        <button onClick={() => fileInputRef.current?.click()} className="w-14 h-14 bg-[#4A443F] text-white rounded-[20px] shadow-xl flex items-center justify-center -mt-8 border-4 border-[#FFFBF7] active:scale-90 transition-all"><Plus size={28} /></button>
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
            <input placeholder="輸入標題 (選填)" className="w-full bg-gray-50 p-4 rounded-2xl mb-3 font-bold text-xs" value={newNoteData.title} onChange={e=>setNewNoteData({...newNoteData, title:e.target.value})} />
            <textarea placeholder="寫下你的穿搭靈感或學習筆記..." className="w-full bg-gray-50 p-4 rounded-2xl mb-4 text-xs h-32 focus:outline-none" value={newNoteData.content} onChange={e=>setNewNoteData({...newNoteData, content:e.target.value})} />
            <div className="flex gap-4">
              <button onClick={()=>setShowAddModal(false)} className="flex-1 py-3 text-xs font-bold text-gray-400">取消</button>
              <button onClick={()=>{
                if(newNoteData.content) {
                  setNotes([{id:Date.now(), type:noteTab, title:newNoteData.title, content:newNoteData.content, date:new Date().toLocaleDateString()}, ...notes]);
                  setShowAddModal(false);
                  setNewNoteData({title:'', content:''});
                }
              }} className="flex-1 py-3 bg-indigo-500 text-white rounded-2xl text-xs font-bold shadow-lg">儲存內容</button>
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

