import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, RefreshCw, Heart, Calendar,
  User, Ruler, Map, ArrowRightLeft, Camera, Loader2, Key, Settings, ExternalLink, CheckCircle, XCircle
} from 'lucide-react';

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];
const BODY_TYPES = ['H型', '倒三角形', '梨形', '沙漏型', '圓形(O型)'];

// 🔥 V13 核心：備用模型清單 (自動輪詢用) 🔥
const AI_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-001',
  'gemini-1.5-flash-002'
];

const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北', desc: '版型：合身修身\n材質：挺括牛津布\n色彩：高明度冷白\n分析：適合商務場合，可作為內搭疊穿。' },
];

export default function App() {
  // --- 狀態管理 (鎖死不變) ---
  const [activeTab, setActiveTab] = useState('closet'); 
  
  const [clothes, setClothes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_clothes_v13')) || INITIAL_CLOTHES; } catch { return INITIAL_CLOTHES; }
  });
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_favorites_v13')) || []; } catch { return []; }
  });
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_notes_v13')) || [{ id: 1, type: 'notes', content: '我不喜歡綠色配紫色。', date: '2024-05-20' }]; } catch { return []; }
  });
  const [calendarHistory, setCalendarHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_calendar_v13')) || {}; } catch { return {}; }
  });
  
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('my_gemini_key') || '');
  const [keyStatus, setKeyStatus] = useState('idle');

  // UI 狀態
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

  // --- 存檔 (V13) ---
  useEffect(() => { localStorage.setItem('my_clothes_v13', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_favorites_v13', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('my_notes_v13', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('my_calendar_v13', JSON.stringify(calendarHistory)); }, [calendarHistory]);
  useEffect(() => { localStorage.setItem('my_gemini_key', userApiKey); }, [userApiKey]);

  // --- V13 智慧輪詢 API 呼叫函式 ---
  const callGeminiSmart = async (payload) => {
    let lastError = null;
    
    // 依序嘗試每一個模型名稱
    for (const modelName of AI_MODELS) {
      try {
        console.log(`Trying model: ${modelName}...`); // Debug用
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${userApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        // 如果成功且沒有 error 欄位，直接回傳
        if (!data.error) {
          return data;
        } else {
          // 如果是特定的 "Not Found" 錯誤，我們就繼續試下一個
          if (data.error.message.includes('not found') || data.error.message.includes('not supported')) {
            console.warn(`${modelName} failed, trying next...`);
            lastError = data.error.message;
            continue; 
          } else {
            // 如果是 Key 錯誤或其他嚴重錯誤，直接拋出
            throw new Error(data.error.message);
          }
        }
      } catch (e) {
        lastError = e.message;
        // 繼續迴圈
      }
    }
    // 如果全部都試過了還是失敗
    throw new Error(`所有 AI 模型皆連線失敗。最後錯誤: ${lastError}`);
  };

  // --- 驗證 Key (使用輪詢) ---
  const verifyKey = async () => {
    if (!userApiKey) return;
    setKeyStatus('validating');
    try {
      // 簡單測試：列出模型
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${userApiKey}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      setKeyStatus('valid');
      alert("✅ 驗證成功！API Key 有效。");
    } catch (e) {
      setKeyStatus('invalid');
      alert(`❌ 無效：${e.message}`);
    }
  };

  // --- V13 圖像分析 ---
  const analyzeImageWithGemini = async (base64Image) => {
    setIsGenerating(true);
    setLoadingText('AI 正在嘗試最佳連線...');

    if (!userApiKey) {
      setTimeout(() => {
        alert("⚠️ 請先在「個人」分頁設定 API Key");
        setIsGenerating(false);
      }, 1000);
      return;
    }

    const base64Data = base64Image.split(',')[1];
    const mimeType = base64Image.split(';')[0].split(':')[1];
    
    const prompt = `你是一名時尚設計師。請分析這張衣物圖片，回傳純 JSON (無 Markdown)：
    {
      "name": "時尚單品名稱",
      "category": "從 [${CATEGORIES.join(', ')}] 選一個",
      "style": "從 [${STYLES.join(', ')}] 選一個",
      "tempRange": "適合溫度 (如 18-24°C)",
      "desc": "請分析：1.版型 2.材質 3.色彩(冷暖/明度) 4.季節建議。約50字。"
    }`;

    try {
      // 使用智慧輪詢
      const data = await callGeminiSmart({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }]
      });

      const text = data.candidates[0].content.parts[0].text;
      const result = JSON.parse(text.replace(/```json|```/g, '').trim());

      const newItem = {
        id: Date.now().toString(),
        name: result.name,
        category: result.category,
        style: result.style,
        tempRange: result.tempRange,
        image: base64Image,
        location: userLocation,
        desc: result.desc
      };

      setClothes([newItem, ...clothes]);
      setSelectedCategory(newItem.category);
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
      alert(`AI 分析失敗：${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- V13 自動搭配 ---
  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setLoadingText(`AI 正在掃描 ${userLocation} 的衣櫃...`);
    setAiResult(null);
    setTryOnImage(null);

    const accessibleClothes = clothes.filter(c => c.location === userLocation);
    
    if (accessibleClothes.length < 2) {
      alert("該地點衣物太少，無法搭配");
      setIsGenerating(false);
      return;
    }

    const prompt = `我是造型師。地點：${userLocation}。場合：${outfitConfig.occasion}。
    用戶資料：${userProfile.height}cm/${userProfile.weight}kg/${userProfile.bodyType}。
    衣櫃：${JSON.stringify(accessibleClothes.map(c => ({id:c.id, name:c.name, cat:c.category, desc:c.desc})))}。
    請挑選一套(至少含上衣下著)，回傳JSON: {"selectedIds": [], "reason": "...", "tips": "..."}`;

    try {
      // 使用智慧輪詢
      const data = await callGeminiSmart({
        contents: [{ parts: [{ text: prompt }] }]
      });

      const result = JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim());
      const picked = clothes.filter(c => result.selectedIds.includes(c.id));
      
      setSelectedItems(picked);
      setAiResult(`${result.reason}\n\n💡 ${result.tips}`);
      setTryOnImage(picked[0]?.image);

    } catch (e) {
      alert(`搭配失敗：${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Helper Functions (不變) ---
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => analyzeImageWithGemini(reader.result);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const toggleSelectItem = (item) => {
    setSelectedItems(prev => prev.find(i => i.id === item.id) ? prev.filter(i => i.id !== item.id) : [...prev, item]);
  };

  const deleteItem = (id) => {
    if (window.confirm('確定刪除？')) {
      setClothes(prev => prev.filter(c => c.id !== id));
      setSelectedItems(prev => prev.filter(c => c.id !== id));
    }
  };

  const moveLocation = (id, newLoc) => {
    setClothes(prev => prev.map(c => c.id === id ? { ...c, location: newLoc } : c));
  };

  const addNote = () => {
    if (!newNoteData.content) return;
    setNotes(prev => [{id: Date.now(), type: noteTab, title: newNoteData.title, content: newNoteData.content, date: new Date().toLocaleDateString()}, ...prev]);
    setNewNoteData({ title: '', content: '' });
    setShowAddModal(false);
  };

  const addToFavorites = () => {
    setFavorites([{id: Date.now(), items: selectedItems, image: tryOnImage, style: outfitConfig.style, occasion: outfitConfig.occasion, date: new Date().toLocaleDateString()}, ...favorites]);
    alert("已加入收藏！");
  };

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] font-sans max-w-md mx-auto relative overflow-hidden">
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* Header */}
      <header className="px-6 pt-12 pb-4 shrink-0 bg-[#FFFBF7] z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-black text-[#6B5AED]">V13.0 終極相容版</h1>
          <button onClick={() => setActiveTab('profile')} className="p-2 bg-white rounded-full shadow-sm border border-orange-50">
            <User size={20} className={keyStatus === 'valid' ? "text-green-500" : "text-gray-400"} />
          </button>
        </div>
        <div className="flex bg-orange-100/50 p-1.5 rounded-[20px] items-center">
          <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-black text-orange-600 uppercase shrink-0 border-r border-orange-200 mr-2"><Map size={12} /> View</div>
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
            
            {clothes.filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation)).length === 0 ? (
              <div className="py-20 text-center text-gray-300 flex flex-col items-center">
                <Shirt size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-bold">此分類暫無衣物</p>
                <button onClick={() => fileInputRef.current?.click()} className="mt-4 text-[#6B5AED] text-xs font-bold flex items-center gap-1 bg-indigo-50 px-4 py-2 rounded-full"><Camera size={16}/> 拍照分析</button>
              </div>
            ) : (
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
                      {item.desc && (
                        <div className="bg-gray-50 rounded-xl p-2 mt-2 border border-gray-100">
                          <p className="text-[9px] text-gray-600 leading-relaxed whitespace-pre-line">{item.desc}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
             
             {aiResult && (
               <div className="bg-indigo-50/50 p-6 rounded-[32px] animate-in fade-in">
                 <p className="text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed">{aiResult}</p>
               </div>
             )}

             {selectedItems.length > 0 && (
               <div className="flex gap-2 overflow-x-auto pb-2">
                 {selectedItems.map(item => (
                   <div key={item.id} className="relative flex-shrink-0">
                     <img src={item.image} className="w-16 h-16 rounded-xl object-cover" />
                     <button onClick={() => toggleSelectItem(item)} className="absolute -top-1 -right-1 bg-black text-white rounded-full p-0.5"><X size={10}/></button>
                   </div>
                 ))}
                 <button onClick={addToFavorites} className="w-16 h-16 bg-white rounded-xl flex flex-col items-center justify-center text-red-400 border-2 border-red-100"><Heart size={20}/><span className="text-[9px] font-bold">收藏</span></button>
               </div>
             )}

             {favorites.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xs font-bold text-gray-400 mb-4 uppercase">我的收藏</h3>
                  <div className="flex gap-4 overflow-x-auto">
                    {favorites.map(fav => (
                      <div key={fav.id} className="w-40 flex-shrink-0 bg-white p-2 rounded-2xl">
                        <img src={fav.image || fav.items[0]?.image} className="w-full h-40 object-cover rounded-xl mb-2"/>
                        <p className="text-[10px] font-bold">{fav.style} · {fav.occasion}</p>
                        <p className="text-[9px] text-gray-400">{fav.date}</p>
                      </div>
                    ))}
                  </div>
                </div>
             )}
           </div>
        )}

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
                   {note.title && <h4 className="font-bold mb-1">{note.title}</h4>}
                   <p className="text-sm text-gray-600">{note.content}</p>
                   <div className="mt-2 text-[9px] text-gray-400 flex justify-between">
                     <span>{note.date}</span>
                     <button onClick={() => setNotes(notes.filter(n=>n.id!==note.id))}><Trash2 size={12}/></button>
                   </div>
                 </div>
               ))}
             </div>
           </div>
        )}

        {activeTab === 'profile' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50">
              <h2 className="text-xl font-black mb-6 flex items-center gap-2"><Settings className="text-gray-400"/> AI 設定</h2>
              <div className="mb-4">
                <label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider flex items-center gap-1">
                   <Key size={12}/> Google Gemini API Key
                </label>
                <div className="flex gap-2">
                  <input 
                    type="password" 
                    value={userApiKey}
                    onChange={(e) => { setUserApiKey(e.target.value); setKeyStatus('idle'); }}
                    placeholder="貼上 Key..."
                    className="flex-1 bg-gray-50 border-2 border-gray-100 rounded-2xl p-3 text-sm font-bold focus:border-[#6B5AED] focus:outline-none"
                  />
                  <button onClick={verifyKey} className={`px-4 rounded-2xl font-bold text-white transition-all flex items-center justify-center ${keyStatus === 'valid' ? 'bg-green-500' : keyStatus === 'invalid' ? 'bg-red-500' : 'bg-[#6B5AED]'}`}>
                    {keyStatus === 'validating' ? <Loader2 className="animate-spin" size={16}/> : keyStatus === 'valid' ? <CheckCircle size={16}/> : keyStatus === 'invalid' ? <XCircle size={16}/> : "驗證"}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[32px] shadow-sm">
               <h3 className="font-bold text-gray-400 text-xs uppercase mb-4">Body Profile</h3>
               <div className="grid grid-cols-2 gap-4 mb-4">
                 <input type="number" value={userProfile.height} onChange={e=>setUserProfile({...userProfile, height:e.target.value})} className="bg-gray-50 p-3 rounded-xl text-sm font-bold" placeholder="身高 cm"/>
                 <input type="number" value={userProfile.weight} onChange={e=>setUserProfile({...userProfile, weight:e.target.value})} className="bg-gray-50 p-3 rounded-xl text-sm font-bold" placeholder="體重 kg"/>
               </div>
               <div className="grid grid-cols-3 gap-2">
                 {BODY_TYPES.map(bt => (
                   <button key={bt} onClick={()=>setUserProfile({...userProfile, bodyType:bt})} className={`py-2 rounded-xl text-[10px] font-bold border ${userProfile.bodyType===bt ? 'bg-[#6B5AED] text-white border-[#6B5AED]' : 'border-gray-200'}`}>{bt}</button>
                 ))}
               </div>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-2xl border-t border-gray-100 flex justify-around items-center px-6 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50">
        <NavButton active={activeTab === 'closet'} icon={<Shirt />} label="衣櫥" onClick={() => setActiveTab('closet')} />
        <NavButton active={activeTab === 'outfit'} icon={<Wand2 />} label="自選" onClick={() => setActiveTab('outfit')} />
        <button onClick={() => fileInputRef.current?.click()} className="w-14 h-14 bg-[#4A443F] text-white rounded-[24px] shadow-xl flex items-center justify-center -mt-8 border-4 border-[#FFFBF7]"><Plus size={28} /></button>
        <NavButton active={activeTab === 'notes'} icon={<BookOpen />} label="靈感" onClick={() => setActiveTab('notes')} />
        <NavButton active={activeTab === 'profile'} icon={<User />} label="個人" onClick={() => setActiveTab('profile')} />
      </nav>

      {showAddModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full rounded-[40px] p-8">
             <h3 className="text-xl font-bold mb-4">新增{noteTab==='notes'?'筆記':'教材'}</h3>
             {noteTab === 'courses' && <input placeholder="標題" className="w-full bg-gray-50 p-3 rounded-xl mb-3 font-bold" value={newNoteData.title} onChange={e=>setNewNoteData({...newNoteData, title:e.target.value})} />}
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
          <p className="text-[#6B5AED] font-bold tracking-widest animate-pulse text-xs uppercase text-center px-8">{loadingText}</p>
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


