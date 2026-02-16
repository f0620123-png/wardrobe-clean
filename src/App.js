import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, RefreshCw, Heart, User, Settings, Key, Camera, 
  Loader2, ArrowRightLeft, Info, CheckCircle, XCircle
} from 'lucide-react';

const APP_VERSION = "V11.0.0"; // 版本顯示

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];

// --- 初始資料 ---
const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '18-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北', desc: '【版型】合身修身\n【材質】硬挺牛津棉\n【色彩】中性冷白，高明度\n適合商務與正式場合。' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('closet'); 
  
  // --- 狀態管理 ---
  const [clothes, setClothes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_clothes_v11')) || INITIAL_CLOTHES; } catch { return INITIAL_CLOTHES; }
  });
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('my_gemini_key') || '');
  const [keyStatus, setKeyStatus] = useState('idle'); // idle, checking, valid, invalid

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
  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });

  const fileInputRef = useRef(null);

  // --- 存檔監聽 ---
  useEffect(() => { localStorage.setItem('my_clothes_v11', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_gemini_key', userApiKey); }, [userApiKey]);

  // --- 測試 API Key 有效性 ---
  const validateApiKey = async (key) => {
    if (!key) { setKeyStatus('idle'); return; }
    setKeyStatus('checking');
    try {
      // 嘗試發送一個極簡請求來測試
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
      });
      if (res.ok) {
        setKeyStatus('valid');
      } else {
        const err = await res.json();
        console.error("Key Validation Error:", err);
        setKeyStatus('invalid');
      }
    } catch (e) {
      setKeyStatus('invalid');
    }
  };

  // --- 強制清除快取並重整 ---
  const forceReload = () => {
    if(window.confirm("這將清除瀏覽器快取並強制更新到最新版本，確定嗎？(您的衣櫥資料不會消失)")) {
      // 清除 Service Worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          for(let registration of registrations) {
            registration.unregister();
          }
        });
      }
      // 強制重整
      window.location.reload(true);
    }
  };

  // --- 功能邏輯 ---
  const toggleSelectItem = (item) => {
    setSelectedItems(prev => prev.find(i => i.id === item.id) ? prev.filter(i => i.id !== item.id) : [...prev, item]);
  };

  const deleteItem = (id) => {
    if (window.confirm('確定要刪除此單品？')) {
      setClothes(prev => prev.filter(item => item.id !== id));
      setSelectedItems(prev => prev.filter(item => item.id !== id));
    }
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

  // --- 🔥 V11.0 專業設計師 AI 分析 🔥 ---
  const analyzeImageWithGemini = async (base64Image) => {
    if (!userApiKey || keyStatus === 'invalid') {
      alert("請先至「個人」頁面設定有效的 API Key，才能啟用 AI 設計師分析功能。");
      setActiveTab('profile');
      return;
    }

    setIsGenerating(true);
    setLoadingText('設計師正在分析布料結構與色彩...');
    
    const base64Data = base64Image.split(',')[1];
    const mimeType = base64Image.split(';')[0].split(':')[1];
    
    // 專業 Prompt
    const prompt = `你現在是一名具備色彩學、布料結構、版型比例與氣候判斷能力的資深服裝設計師。
    請根據這張圖片，完成以下系統化分析，並回傳純 JSON 格式：
    
    Step 1 — 單品結構分類
    - name: 給予一個專業的商品名稱 (例如：重磅丹寧落肩外套)
    - category: 必須是 [${CATEGORIES.join(', ')}] 之一
    - style: 必須是 [${STYLES.join(', ')}] 之一
    
    Step 2 — 深度分析 (請將以下資訊整合在 'desc' 欄位，使用條列式)
    - 版型：(寬鬆 / 合身 / Oversize / 修身)
    - 材質：(棉 / 羊毛 / 丹寧 / 針織 / 防風布...等)
    - 色彩分析：(冷暖屬性、明度、彩度)
    
    Step 3 — 溫度判斷
    - tempRange: 根據布料厚度與結構推估適合溫度 (例如 "18-24°C")

    JSON 格式範例：
    {
      "name": "...",
      "category": "...",
      "style": "...",
      "tempRange": "...",
      "desc": "【版型】...\n【材質】...\n【色彩】..."
    }`;

    try {
      // 改用 gemini-1.5-flash (最穩定版本)
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
        name: result.name || 'AI 分析單品',
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
      console.error(error);
      alert(`分析失敗：${error.message}\n請確認 Key 是否正確。`);
    } finally {
      setIsGenerating(false);
    }
  };

  const autoPickOutfit = async () => {
    if (!userApiKey || keyStatus === 'invalid') {
      alert("請先設定有效的 API Key。"); return;
    }
    setIsGenerating(true);
    setLoadingText('設計師正在構思搭配...');
    
    try {
      const accessibleClothes = clothes.filter(c => c.location === userLocation);
      const prompt = `我是造型師。地點：${userLocation}。場合：${outfitConfig.occasion}。
      請從衣櫃中挑選一套：${JSON.stringify(accessibleClothes.map(c => ({id:c.id, name:c.name, cat:c.category, desc:c.desc})))}。
      回傳JSON: {"selectedIds": [], "reason": "專業搭配理由...", "tips": "穿搭技巧..."}`;

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
      alert(`搭配失敗：${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] font-sans max-w-md mx-auto relative overflow-hidden">
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* Header */}
      <header className="px-6 pt-12 pb-4 shrink-0 bg-[#FFFBF7] z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-black text-[#6B5AED]">Wardrobe {APP_VERSION}</h1>
          <button onClick={() => setActiveTab('profile')} className="p-2 bg-white rounded-full shadow-sm border border-orange-50 active:scale-90 transition-transform">
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
                  </div>
                  <div className="p-3">
                    <h3 className="text-[13px] font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">{item.style} · {item.tempRange}</p>
                    {item.desc && <div className="bg-gray-50 rounded-xl p-2 mt-1"><p className="text-[9px] text-gray-500 line-clamp-3 whitespace-pre-wrap">{item.desc}</p></div>}
                  </div>
                </div>
              ))}
            </div>
            {clothes.filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation)).length === 0 && (
              <div className="py-20 text-center text-gray-300 flex flex-col items-center">
                <Shirt size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-bold">這裡還沒有衣服</p>
                <button onClick={handleCameraClick} className="mt-4 text-[#6B5AED] text-xs font-bold flex items-center gap-1 bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100"><Camera size={16}/> 拍照分析</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'outfit' && (
           <div className="space-y-6 animate-in slide-in-from-bottom">
             <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
               <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Sparkles className="text-indigo-400" /> AI 設計師搭配</h2>
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
              <h2 className="text-xl font-black mb-6 flex items-center gap-2"><Settings className="text-gray-400"/> 系統設定</h2>
              
              <div className="mb-6">
                <label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider flex items-center gap-1">
                   <Key size={12}/> API Key 設定
                </label>
                <div className="flex gap-2 mb-2">
                  <input 
                    type="password" 
                    value={userApiKey}
                    onChange={(e) => {setUserApiKey(e.target.value); setKeyStatus('idle');}}
                    placeholder="貼上 Google AI Studio Key..."
                    className="flex-1 bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 text-sm font-bold focus:border-[#6B5AED] focus:outline-none"
                  />
                  <button 
                    onClick={() => validateApiKey(userApiKey)}
                    className={`px-4 rounded-2xl font-bold text-white transition-all ${keyStatus === 'valid' ? 'bg-green-500' : keyStatus === 'invalid' ? 'bg-red-500' : 'bg-gray-400'}`}
                  >
                    {keyStatus === 'checking' ? <Loader2 className="animate-spin" /> : keyStatus === 'valid' ? <CheckCircle /> : keyStatus === 'invalid' ? <XCircle /> : '驗證'}
                  </button>
                </div>
                
                {keyStatus === 'valid' && <p className="text-xs text-green-600 font-bold">✅ API Key 有效！AI 功能已就緒。</p>}
                {keyStatus === 'invalid' && <p className="text-xs text-red-500 font-bold">❌ 無效的 Key，請檢查是否過期或複製錯誤。</p>}
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl mb-6">
                 <button onClick={forceReload} className="w-full py-3 bg-white border-2 border-red-100 text-red-500 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm">
                   <RefreshCw size={14} /> 強制清除快取並重整 (Fix Version)
                 </button>
                 <p className="text-[10px] text-gray-400 text-center mt-2">若版本卡住或發生異常，請點擊此處。</p>
              </div>
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

      {isGenerating && (
        <div className="fixed inset-0 z-[300] bg-white/80 backdrop-blur-lg flex flex-col items-center justify-center">
          <div className="relative mb-6">
            <div className="w-24 h-24 border-4 border-[#6B5AED] border-t-transparent rounded-full animate-spin"></div>
            <Loader2 className="absolute inset-0 m-auto text-[#6B5AED] animate-spin" size={32} />
          </div>
          <h3 className="text-xl font-black text-[#4A443F] mb-2">AI 設計師分析中</h3>
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


