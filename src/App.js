import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, PlusCircle, RefreshCw, Heart, Calendar,
  User, Ruler, Map, ArrowRightLeft, AlertTriangle, Camera, Loader2, Key, Settings, ExternalLink, CheckCircle, XCircle
} from 'lucide-react';

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];

// --- 初始資料 ---
const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北', desc: '版型：合身修身\n材質：挺括牛津布\n色彩：高明度冷白\n分析：適合商務場合，可作為內搭疊穿。' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('closet'); 
  
  // --- 狀態管理 ---
  const [clothes, setClothes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_clothes_v11')) || INITIAL_CLOTHES; } catch { return INITIAL_CLOTHES; }
  });
  const [userApiKey, setUserApiKey] = useState(() => {
    return localStorage.getItem('my_gemini_key') || '';
  });
  const [keyStatus, setKeyStatus] = useState('idle'); // idle, validating, valid, invalid

  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]); 
  const [isGenerating, setIsGenerating] = useState(false); 
  const [loadingText, setLoadingText] = useState(''); 
  const [aiResult, setAiResult] = useState(null);
  const [tryOnImage, setTryOnImage] = useState(null);
  const [currentViewLocation, setCurrentViewLocation] = useState('全部'); 
  const [userLocation, setUserLocation] = useState('台北'); 
  
  // 狀態存檔
  useEffect(() => { localStorage.setItem('my_clothes_v11', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_gemini_key', userApiKey); }, [userApiKey]);

  const fileInputRef = useRef(null);

  // --- API Key 驗證功能 ---
  const verifyKey = async () => {
    if (!userApiKey) return;
    setKeyStatus('validating');
    try {
      // 嘗試列出模型來測試 Key 是否有效
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${userApiKey}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      setKeyStatus('valid');
      alert("✅ API Key 驗證成功！AI 功能已就緒。");
    } catch (e) {
      setKeyStatus('invalid');
      alert(`❌ 驗證失敗：${e.message}\n請檢查 Key 是否正確，或是否啟用了 Billing。`);
    }
  };

  // --- AI 核心邏輯 (V11.0 專家 Prompt) ---
  const analyzeImageWithGemini = async (base64Image) => {
    setIsGenerating(true);
    setLoadingText('設計師正在分析布料結構與色彩...');

    if (!userApiKey) {
      setTimeout(() => {
        alert("⚠️ 請先設定 API Key 才能啟用專家分析模式。");
        setIsGenerating(false);
      }, 1000);
      return;
    }

    const base64Data = base64Image.split(',')[1];
    const mimeType = base64Image.split(';')[0].split(':')[1];
    
    // 專業設計師 Prompt
    const prompt = `你現在是一名具備色彩學、布料結構、版型比例與氣候判斷能力的服裝設計師。
    請分析這張圖片，並嚴格依照以下 JSON 格式回傳 (不要 Markdown)：
    {
      "name": "單品名稱 (如：高磅數水洗丹寧夾克)",
      "category": "從 [${CATEGORIES.join(', ')}] 選一個",
      "style": "從 [${STYLES.join(', ')}] 選一個",
      "tempRange": "適合溫度 (如 18-24°C)",
      "desc": "請依序分析：1.版型(寬鬆/合身/Oversize)、2.材質(棉/羊毛/針織/防風)、3.色彩(冷暖/明度/彩度)、4.季節屬性與穿搭建議。總字數約 50 字。"
    }`;

    try {
      // 使用 gemini-1.5-flash-latest 嘗試解決 model not found
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }]
        })
      });

      const data = await response.json();
      
      if (data.error) throw new Error(data.error.message);
      if (!data.candidates) throw new Error("AI 無回應，可能圖片無法辨識。");

      const text = data.candidates[0].content.parts[0].text;
      const cleanJson = text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleanJson);

      const newItem = {
        id: Date.now().toString(),
        name: result.name,
        category: result.category,
        style: result.style,
        tempRange: result.tempRange,
        image: base64Image,
        location: userLocation,
        desc: result.desc // 這裡會包含專業分析
      };

      setClothes([newItem, ...clothes]);
      setSelectedCategory(newItem.category);
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
      console.error(error);
      alert(`AI 分析失敗：${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- UI 組件 ---
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

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] font-sans max-w-md mx-auto relative overflow-hidden">
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* Header */}
      <header className="px-6 pt-12 pb-4 shrink-0 bg-[#FFFBF7] z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-black text-[#6B5AED]">V11.0 時尚專家版</h1>
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
                      <button onClick={() => toggleSelectItem(item)} className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center ${selectedItems.find(i=>i.id===item.id) ? 'bg-[#6B5AED] text-white border-[#6B5AED]' : 'bg-black/20 text-white border-white/60'}`}><Check size={16} /></button>
                      <button onClick={() => { if(window.confirm('刪除？')) setClothes(clothes.filter(c=>c.id!==item.id)); }} className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center border-2 border-white"><Trash2 size={14} /></button>
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
                  <button 
                    onClick={verifyKey}
                    className={`px-4 rounded-2xl font-bold text-white transition-all flex items-center justify-center ${keyStatus === 'valid' ? 'bg-green-500' : keyStatus === 'invalid' ? 'bg-red-500' : 'bg-[#6B5AED]'}`}
                  >
                    {keyStatus === 'validating' ? <Loader2 className="animate-spin" size={16}/> : keyStatus === 'valid' ? <CheckCircle size={16}/> : keyStatus === 'invalid' ? <XCircle size={16}/> : "驗證"}
                  </button>
                </div>
                {keyStatus === 'invalid' && <p className="text-[10px] text-red-500 mt-2 font-bold">Key 無效，請檢查是否複製完整。</p>}
                
                <div className="mt-4 flex gap-2">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="flex-1 bg-indigo-50 text-indigo-600 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1">
                    <ExternalLink size={12}/> 取得免費 Key
                  </a>
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
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-2xl border-t border-gray-100 flex justify-around items-center px-6 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50">
        <NavButton active={activeTab === 'closet'} icon={<Shirt />} label="衣櫥" onClick={() => setActiveTab('closet')} />
        <NavButton active={activeTab === 'outfit'} icon={<Wand2 />} label="自選" onClick={() => setActiveTab('outfit')} />
        <button onClick={() => fileInputRef.current?.click()} className="w-14 h-14 bg-[#4A443F] text-white rounded-[24px] shadow-xl flex items-center justify-center -mt-8 border-4 border-[#FFFBF7]"><Plus size={28} /></button>
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


