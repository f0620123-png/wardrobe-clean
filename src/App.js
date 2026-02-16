import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, PlusCircle, RefreshCw, Heart, Calendar,
  User, Ruler, Map, ArrowRightLeft, AlertTriangle, Camera, Loader2, Key, Settings, ExternalLink
} from 'lucide-react';

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];

const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北', desc: '挺括修身，職場必備。' },
  { id: 't2', name: '灰色衛衣', category: '上衣', style: '休閒', tempRange: '10-20°C', image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400', location: '新竹', desc: '舒適親膚，居家外出皆宜。' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('closet'); 
  
  // --- 狀態管理 ---
  const [clothes, setClothes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_clothes_v10')) || INITIAL_CLOTHES; } catch { return INITIAL_CLOTHES; }
  });
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_favorites_v10')) || []; } catch { return []; }
  });
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_notes_v10')) || []; } catch { return []; }
  });
  // 用戶自定義 API Key
  const [userApiKey, setUserApiKey] = useState(() => {
    return localStorage.getItem('my_gemini_key') || '';
  });

  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]); 
  const [isGenerating, setIsGenerating] = useState(false); 
  const [loadingText, setLoadingText] = useState(''); 
  const [aiResult, setAiResult] = useState(null);
  const [tryOnImage, setTryOnImage] = useState(null);
  const [currentViewLocation, setCurrentViewLocation] = useState('全部'); 
  const [userLocation, setUserLocation] = useState('台北'); 
  const [userProfile, setUserProfile] = useState({ height: 175, weight: 70, bodyType: 'H型' });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [noteTab, setNoteTab] = useState('notes'); 
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNoteData, setNewNoteData] = useState({ title: '', content: '' });
  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });

  const fileInputRef = useRef(null);

  // --- 監聽並存檔 ---
  useEffect(() => { localStorage.setItem('my_clothes_v10', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_favorites_v10', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('my_notes_v10', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('my_gemini_key', userApiKey); }, [userApiKey]);

  // --- Helper Functions ---
  const toggleSelectItem = (item) => {
    setSelectedItems(prev => prev.find(i => i.id === item.id) ? prev.filter(i => i.id !== item.id) : [...prev, item]);
  };

  const deleteItem = (id) => {
    if (window.confirm('確定要刪除此單品？')) {
      setClothes(prev => prev.filter(item => item.id !== id));
      setSelectedItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const moveLocation = (id, newLoc) => {
    setClothes(prev => prev.map(c => c.id === id ? { ...c, location: newLoc } : c));
  };

  const handleCameraClick = () => fileInputRef.current?.click();

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => analyzeImageWithGemini(reader.result);
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  // --- 🔥 V10.1 錯誤處理升級 🔥 ---
  const handleApiError = (error) => {
    console.error(error);
    const errMsg = error.message || JSON.stringify(error);
    
    if (errMsg.includes('expired') || errMsg.includes('API key') || errMsg.includes('400')) {
      alert("⚠️ API Key 已失效！\n\n系統已自動清除舊 Key，請前往「個人」頁面貼上新的 Google AI Studio Key。");
      setUserApiKey(''); // 清除無效 Key
      localStorage.removeItem('my_gemini_key');
      setActiveTab('profile'); // 自動跳轉到設定頁
    } else {
      alert(`AI 連線錯誤：${errMsg}\n請檢查網路或稍後再試。`);
    }
  };

  const analyzeImageWithGemini = async (base64Image) => {
    setIsGenerating(true);
    setLoadingText('正在連接 AI 大腦...');

    // 1. 如果沒有 Key，直接跑備案模擬
    if (!userApiKey || userApiKey.length < 10) {
      setTimeout(() => {
        alert("⚠️ 未偵測到有效的 API Key\n\n系統將使用「模擬模式」新增單品。\n若要啟用真 AI 分析，請至「個人」頁面貼上 Key。");
        const mockItem = {
          id: Date.now().toString(),
          name: `模擬單品 ${clothes.length + 1}`,
          category: selectedCategory,
          style: '休閒',
          tempRange: '20-25°C',
          image: base64Image,
          location: userLocation,
          desc: '【模擬描述】這是一張系統自動生成的卡片。填入 API Key 後，AI 將能自動識別材質、顏色與適合溫度。'
        };
        setClothes([mockItem, ...clothes]);
        setIsGenerating(false);
      }, 1500);
      return;
    }

    setLoadingText('Gemini 正在觀察細節...');
    
    const base64Data = base64Image.split(',')[1];
    const mimeType = base64Image.split(';')[0].split(':')[1];
    
    const prompt = `你是時尚專家。請分析這張衣物圖片，回傳純 JSON (不要Markdown)：
    {
      "name": "簡短名稱 (如: 淺藍色丹寧襯衫)",
      "category": "從這選一個: [${CATEGORIES.join(', ')}]",
      "style": "從這選一個: [${STYLES.join(', ')}]",
      "tempRange": "適合溫度 (如 18-24°C)",
      "desc": "30字內的材質與設計描述"
    }`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }]
        })
      });

      const data = await response.json();
      
      if (data.error) throw new Error(data.error.message);

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const cleanJson = text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleanJson);

      const newItem = {
        id: Date.now().toString(),
        name: result.name || 'AI 辨識單品',
        category: result.category || '上衣',
        style: result.style || '休閒',
        tempRange: result.tempRange || '20-25°C',
        image: base64Image,
        location: userLocation,
        desc: result.desc || 'AI 分析完成'
      };

      setClothes([newItem, ...clothes]);
      setSelectedCategory(newItem.category);
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
      handleApiError(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setLoadingText('AI 正在思考搭配...');
    
    if (!userApiKey) {
      setTimeout(() => {
        const picked = clothes.filter(c => c.location === userLocation).slice(0, 3);
        if (picked.length === 0) {
          setAiResult("該地點沒有足夠衣物。");
        } else {
          setSelectedItems(picked);
          setAiResult("【模擬搭配】請填入 API Key 以獲得真實造型建議。\n這是一組隨機挑選的組合。");
          setTryOnImage(picked[0]?.image);
        }
        setIsGenerating(false);
      }, 1500);
      return;
    }

    try {
      const accessibleClothes = clothes.filter(c => c.location === userLocation);
      const prompt = `我是造型師。地點：${userLocation}。場合：${outfitConfig.occasion}。
      衣櫃：${JSON.stringify(accessibleClothes.map(c => ({id:c.id, name:c.name, cat:c.category, desc:c.desc})))}。
      請選一套，回傳JSON: {"selectedIds": [], "reason": "...", "tips": "..."}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const result = JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim());
      const picked = clothes.filter(c => result.selectedIds.includes(c.id));
      
      setSelectedItems(picked);
      setAiResult(`${result.reason}\n\n💡 ${result.tips}`);
      setTryOnImage(picked[0]?.image);

    } catch (e) {
      handleApiError(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const addNote = () => {
    if (!newNoteData.content) return;
    setNotes(prev => [{id: Date.now(), type: noteTab, title: newNoteData.title, content: newNoteData.content, date: new Date().toLocaleDateString()}, ...prev]);
    setNewNoteData({ title: '', content: '' });
    setShowAddModal(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] font-sans max-w-md mx-auto relative overflow-hidden">
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* Header */}
      <header className="px-6 pt-12 pb-4 shrink-0 bg-[#FFFBF7] z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-black text-[#6B5AED]">V10.1 智慧除錯版</h1>
          <button onClick={() => setShowProfileModal(true)} className="p-2 bg-white rounded-full shadow-sm border border-orange-50 active:scale-90 transition-transform">
            <User size={20} className="text-[#6B5AED]" />
          </button>
        </div>
        <div className="flex bg-orange-100/50 p-1.5 rounded-[20px] items-center">
          <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-black text-orange-600 uppercase tracking-tighter shrink-0 border-r border-orange-200 mr-2"><Map size={12} /> View</div>
          <div className="flex gap-1 flex-1">
            {LOCATIONS.map(loc => (
              <button key={loc} onClick={() => setCurrentViewLocation(loc)} className={`flex-1 py-1.5 rounded-2xl text-xs font-bold ${currentViewLocation === loc ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400'}`}>{loc}</button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 pb-32 no-scrollbar">
        {activeTab === 'closet' && (
          <div className="animate-in fade-in">
            <div className="flex overflow-x-auto no-scrollbar gap-3 mb-6 py-2">
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-5 py-2 rounded-full text-sm font-bold flex-shrink-0 border-2 ${selectedCategory === cat ? 'bg-[#6B5AED] border-[#6B5AED] text-white' : 'bg-white border-transparent text-gray-400'}`}>{cat}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {clothes.filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation)).map(item => (
                <div key={item.id} className="bg-white rounded-[32px] p-2 shadow-sm border border-orange-50 relative group animate-in zoom-in-95">
                  <div className="aspect-[4/5] rounded-[28px] overflow-hidden relative">
                    <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[9px] font-bold text-white flex items-center gap-1"><MapPin size={8} /> {item.location}</div>
                    <button onClick={(e) => { e.stopPropagation(); toggleSelectItem(item); }} className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center ${selectedItems.find(i=>i.id===item.id) ? 'bg-[#6B5AED] text-white border-[#6B5AED]' : 'bg-black/20 text-white border-white/60'}`}><Check size={16} /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center border-2 border-white"><Trash2 size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveLocation(item.id, item.location === '台北' ? '新竹' : '台北'); }} className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/80 text-gray-600 flex items-center justify-center"><ArrowRightLeft size={14} /></button>
                  </div>
                  <div className="p-3">
                    <h3 className="text-[13px] font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">{item.style} · {item.tempRange}</p>
                    {item.desc && <div className="bg-gray-50 rounded-xl p-2 mt-1"><p className="text-[9px] text-gray-500 line-clamp-2">{item.desc}</p></div>}
                  </div>
                </div>
              ))}
            </div>
            {clothes.filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation)).length === 0 && (
              <div className="py-20 text-center text-gray-300 flex flex-col items-center">
                <Shirt size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-bold">這裡還沒有衣服</p>
                <button onClick={handleCameraClick} className="mt-4 text-[#6B5AED] text-xs font-bold flex items-center gap-1 bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100"><Camera size={16}/> 拍照新增</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'outfit' && (
           <div className="space-y-6 animate-in slide-in-from-bottom">
             <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
               <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Sparkles className="text-indigo-400" /> AI 定位造型</h2>
               <div className="flex gap-2 mb-4">
                  <select value={outfitConfig.occasion} onChange={e=>setOutfitConfig({...outfitConfig, occasion:e.target.value})} className="bg-gray-50 rounded-xl p-3 text-xs font-bold w-full">{OCCASIONS.map(o=><option key={o}>{o}</option>)}</select>
                  <select value={outfitConfig.style} onChange={e=>setOutfitConfig({...outfitConfig, style:e.target.value})} className="bg-gray-50 rounded-xl p-3 text-xs font-bold w-full">{STYLES.map(s=><option key={s}>{s}</option>)}</select>
               </div>
               <button onClick={autoPickOutfit} disabled={isGenerating} className="w-full py-4 bg-[#6B5AED] text-white rounded-[24px] font-bold shadow-xl flex items-center justify-center gap-2">{isGenerating ? "AI 運算中..." : "AI 自動抓取搭配"}</button>
             </div>
             {aiResult && <div className="bg-indigo-50/50 p-6 rounded-[32px]"><p className="text-sm text-indigo-900 whitespace-pre-wrap">{aiResult}</p></div>}
           </div>
        )}

        {activeTab === 'profile' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50">
              <h2 className="text-xl font-black mb-6 flex items-center gap-2"><Settings className="text-gray-400"/> 進階設定</h2>
              
              <div className="mb-6">
                <label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider flex items-center gap-1">
                   <Key size={12}/> Google Gemini API Key
                </label>
                <input 
                  type="password" 
                  value={userApiKey}
                  onChange={(e) => setUserApiKey(e.target.value)}
                  placeholder="在此貼上您的 AI Studio Key..."
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 text-sm font-bold focus:border-[#6B5AED] focus:outline-none transition-colors"
                />
                <div className="mt-3 flex gap-2">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="flex-1 bg-indigo-50 text-indigo-600 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1">
                    <ExternalLink size={12}/> 免費取得 Key
                  </a>
                  <button onClick={() => {setUserApiKey(''); localStorage.removeItem('my_gemini_key');}} className="px-4 py-3 bg-gray-100 text-gray-500 rounded-xl text-xs font-bold">清除</button>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-[32px] text-center">
               <h3 className="font-bold text-gray-400 text-xs uppercase mb-4">Current Location</h3>
               <div className="flex bg-gray-100 p-1 rounded-2xl">
                 {LOCATIONS.map(l => (
                   <button key={l} onClick={()=>setUserLocation(l)} className={`flex-1 py-3 rounded-xl text-xs font-bold ${userLocation===l ? 'bg-white shadow-sm text-[#6B5AED]' : 'text-gray-400'}`}>{l}</button>
                 ))}
               </div>
            </div>
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
           <div className="animate-in fade-in space-y-6">
             <div className="flex bg-gray-100 p-1 rounded-2xl">
               <button onClick={() => setNoteTab('notes')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${noteTab === 'notes' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>筆記</button>
               <button onClick={() => setNoteTab('courses')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${noteTab === 'courses' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>教材</button>
             </div>
             <button onClick={() => setShowAddModal(true)} className="w-full py-8 border-2 border-dashed border-indigo-200 bg-indigo-50/20 rounded-[28px] flex flex-col items-center justify-center text-indigo-400">
               <PlusCircle size={32} />
               <span className="text-xs font-bold mt-2">新增{noteTab === 'notes' ? '筆記' : '教材'}</span>
             </button>
             <div className="space-y-4">
               {notes.filter(n=>n.type===noteTab).map(note => (
                 <div key={note.id} className="bg-white p-6 rounded-[32px] shadow-sm relative">
                   {note.title && <h4>{note.title}</h4>}
                   <p className="text-sm text-gray-600">{note.content}</p>
                   <button onClick={() => setNotes(notes.filter(n=>n.id!==note.id))} className="absolute top-4 right-4 text-gray-300"><Trash2 size={16}/></button>
                 </div>
               ))}
             </div>
           </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-2xl border-t border-gray-100 flex justify-around items-center px-6 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50">
        <NavButton active={activeTab === 'closet'} icon={<Shirt />} label="衣櫥" onClick={() => setActiveTab('closet')} />
        <NavButton active={activeTab === 'outfit'} icon={<Wand2 />} label="自選" onClick={() => setActiveTab('outfit')} />
        <button onClick={handleCameraClick} className="w-14 h-14 bg-[#4A443F] text-white rounded-[24px] shadow-xl flex items-center justify-center -mt-8 border-4 border-[#FFFBF7]"><Plus size={28} /></button>
        <NavButton active={activeTab === 'notes'} icon={<BookOpen />} label="靈感" onClick={() => setActiveTab('notes')} />
        <NavButton active={activeTab === 'profile'} icon={<User />} label="個人" onClick={() => setActiveTab('profile')} />
      </nav>

      {/* Modals & Loading */}
      {showAddModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full rounded-[40px] p-8">
             <h3 className="text-xl font-bold mb-4">新增內容</h3>
             <textarea className="w-full bg-gray-50 p-4 rounded-xl mb-4" value={newNoteData.content} onChange={e=>setNewNoteData({...newNoteData, content:e.target.value})} placeholder="輸入內容..." />
             <div className="flex gap-4">
               <button onClick={()=>setShowAddModal(false)} className="flex-1 py-3 text-gray-400">取消</button>
               <button onClick={addNote} className="flex-1 py-3 bg-indigo-500 text-white rounded-xl">儲存</button>
             </div>
          </div>
        </div>
      )}
      {isGenerating && (
        <div className="fixed inset-0 z-[300] bg-white/80 backdrop-blur-lg flex flex-col items-center justify-center">
          <div className="relative mb-6">
            <div className="w-24 h-24 border-4 border-[#6B5AED] border-t-transparent rounded-full animate-spin"></div>
            <Loader2 className="absolute inset-0 m-auto text-[#6B5AED] animate-spin" size={32} />
          </div>
          <h3 className="text-xl font-black text-[#4A443F] mb-2">AI 智能運算中</h3>
          <p className="text-[#6B5AED] font-bold tracking-widest animate-pulse text-xs uppercase">{loadingText}</p>
        </div>
      )}
    </div>
  );
}

function NavButton({ active, icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all relative ${active ? 'text-[#6B5AED]' : 'text-gray-300'}`}>
      {active && <div className="absolute -top-4 w-1.5 h-1.5 bg-[#6B5AED] rounded-full"></div>}
      <div className={`${active ? 'scale-110' : 'scale-100'} transition-transform`}>
        {React.cloneElement(icon, { size: 22, strokeWidth: active ? 3 : 2 })}
      </div>
      <span className={`text-[9px] font-black uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
    </button>
  );
}


