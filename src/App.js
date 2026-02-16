import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, Camera, Loader2, Key, Settings, ExternalLink, 
  CheckCircle, XCircle, Thermometer, Palette, Layers
} from 'lucide-react';

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];

// 預設資料 (模擬專家口吻)
const INITIAL_CLOTHES = [
  { 
    id: 't1', 
    name: '精紡高支數白襯衫', 
    category: '上衣', 
    style: '商務', 
    tempRange: '18-26°C', 
    image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', 
    location: '台北', 
    desc: '【結構】修身版型(Slim Fit)，採用挺括的精梳棉，領口結構硬挺。\n【色彩】冷調純白，高明度低彩度，屬於中性色。\n【建議】單穿適合空調辦公室，低溫時建議作為內層疊穿羊毛背心。' 
  },
  { 
    id: 't2', 
    name: '重磅落肩灰衛衣', 
    category: '上衣', 
    style: '休閒', 
    tempRange: '12-20°C', 
    image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400', 
    location: '新竹', 
    desc: '【結構】Oversize 落肩剪裁，內裡抓絨棉料，具備份量感。\n【色彩】中明度暖灰，低飽和度，帶有混色雜點質感。\n【建議】適合新竹強風氣候，建議搭配防風外套，下身可搭縮口棉褲。' 
  },
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
  const [keyStatus, setKeyStatus] = useState('idle'); // idle, checking, valid, invalid

  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]); 
  const [isGenerating, setIsGenerating] = useState(false); 
  const [loadingText, setLoadingText] = useState(''); 
  const [aiResult, setAiResult] = useState(null);
  const [tryOnImage, setTryOnImage] = useState(null);
  const [currentViewLocation, setCurrentViewLocation] = useState('全部'); 
  const [userLocation, setUserLocation] = useState('台北'); 
  
  // 筆記與設定
  const [noteTab, setNoteTab] = useState('notes'); 
  const [notes, setNotes] = useState(() => { try { return JSON.parse(localStorage.getItem('my_notes_v11')) || []; } catch { return []; } });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNoteData, setNewNoteData] = useState({ title: '', content: '' });
  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });

  const fileInputRef = useRef(null);

  // --- 存檔監聽 ---
  useEffect(() => { localStorage.setItem('my_clothes_v11', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_notes_v11', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('my_gemini_key', userApiKey); }, [userApiKey]);

  // --- API Key 驗證功能 ---
  const verifyKey = async () => {
    if (!userApiKey) return;
    setKeyStatus('checking');
    try {
      // 發送一個極輕量的請求測試 Key 是否有效
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
      });
      if (res.ok) {
        setKeyStatus('valid');
        alert("✅ API Key 驗證成功！AI 分析功能已就緒。");
      } else {
        const err = await res.json();
        setKeyStatus('invalid');
        alert(`❌ Key 無效或過期。\n錯誤訊息：${err.error?.message || 'Unknown Error'}`);
      }
    } catch (e) {
      setKeyStatus('invalid');
      alert("❌ 連線錯誤，請檢查網路。");
    }
  };

  // --- AI 核心：專家分析 Prompt ---
  const analyzeImageWithGemini = async (base64Image) => {
    setIsGenerating(true);
    setLoadingText('專家正在分析：布料結構與色彩...');

    if (!userApiKey || keyStatus === 'invalid') {
      alert("⚠️ 請先至「個人」頁面輸入有效 API Key 並通過驗證。");
      setIsGenerating(false);
      return;
    }
    
    const base64Data = base64Image.split(',')[1];
    const mimeType = base64Image.split(';')[0].split(':')[1];
    
    // 🔥 大師級指令 🔥
    const prompt = `
    角色：你是一名具備色彩學、布料結構、版型比例與氣候判斷能力的資深服裝設計師。
    任務：請根據圖片進行【系統化分析】，並回傳嚴格的 JSON 格式（不要 Markdown）。
    
    分析邏輯：
    1. 【結構分類】：判斷類別 (${CATEGORIES.join('/')})、版型 (寬鬆/合身/Oversize/修身) 與材質。
    2. 【色彩分析】：分析冷暖屬性、明度與彩度。
    3. 【溫度判斷】：推估適合體感溫度 (如 18-24°C)。

    回傳 JSON 格式如下：
    {
      "name": "專業單品名稱 (如: 高磅數水洗丹寧夾克)",
      "category": "類別",
      "style": "風格 (${STYLES.join('/')})",
      "tempRange": "溫度區間 (如 15-20°C)",
      "desc": "請用條列式呈現分析結果：\\n【結構】... \\n【色彩】... \\n【建議】..."
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
      const cleanJson = text.replace(/```json|```/g, '').trim(); // 清理格式
      const result = JSON.parse(cleanJson);

      const newItem = {
        id: Date.now().toString(),
        name: result.name || 'AI 分析單品',
        category: result.category || '上衣',
        style: result.style || '休閒',
        tempRange: result.tempRange || 'N/A',
        image: base64Image,
        location: userLocation,
        desc: result.desc || '分析完成，但未產生描述。'
      };

      setClothes([newItem, ...clothes]);
      setSelectedCategory(newItem.category);
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
      console.error(error);
      alert(`AI 分析失敗：${error.message}\n請確認 Key 是否正確或有開啟 Billing。`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- AI 搭配邏輯 ---
  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setLoadingText('設計師正在構思搭配...');
    
    try {
      if (!userApiKey) throw new Error("無 API Key");
      
      const accessibleClothes = clothes.filter(c => c.location === userLocation);
      const prompt = `我是造型師。地點：${userLocation}。場合：${outfitConfig.occasion}。
      請從以下衣櫃清單中，考慮【色彩學】與【氣候】，選出一套最佳搭配。
      衣櫃：${JSON.stringify(accessibleClothes.map(c => ({id:c.id, name:c.name, cat:c.category, desc:c.desc})))}。
      回傳JSON: {"selectedIds": [], "reason": "請詳細說明配色邏輯與層次...", "tips": "..."}`;

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

  // --- Helper Functions ---
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => analyzeImageWithGemini(reader.result);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };
  const deleteItem = (id) => { if(window.confirm('確認刪除？')) setClothes(prev=>prev.filter(i=>i.id!==id)); };
  const toggleSelectItem = (item) => { setSelectedItems(prev => prev.find(i=>i.id===item.id) ? prev.filter(i=>i.id!==item.id) : [...prev, item]); };
  const moveLocation = (id, newLoc) => { setClothes(prev => prev.map(c => c.id === id ? { ...c, location: newLoc } : c)); };
  const addNote = () => { if(newNoteData.content) { setNotes(prev=>[{id:Date.now(), type:noteTab, title:newNoteData.title, content:newNoteData.content, date:new Date().toLocaleDateString()}, ...prev]); setShowAddModal(false); }};

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] font-sans max-w-md mx-auto relative overflow-hidden">
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* Header */}
      <header className="px-6 pt-12 pb-4 shrink-0 bg-[#FFFBF7] z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-black text-[#6B5AED]">V11.0 專家分析版</h1>
          <div className="flex items-center gap-2">
             <button onClick={() => setActiveTab('profile')} className={`p-2 rounded-full shadow-sm border ${!userApiKey ? 'bg-red-50 border-red-200 animate-pulse' : 'bg-white border-orange-50'}`}>
                <Key size={20} className={!userApiKey ? "text-red-500" : "text-[#6B5AED]"} />
             </button>
          </div>
        </div>
        <div className="flex bg-orange-100/50 p-1.5 rounded-[20px] items-center">
          <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-black text-orange-600 shrink-0 border-r border-orange-200 mr-2"><Map size={12} /> View</div>
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
                    <p className="text-[10px] text-gray-400 mt-0.5 mb-2 flex items-center gap-1"><Thermometer size={10}/> {item.tempRange}</p>
                    {item.desc && (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] text-gray-600 leading-relaxed whitespace-pre-wrap">{item.desc}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {clothes.filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation)).length === 0 && (
              <div className="py-20 text-center text-gray-300 flex flex-col items-center">
                <Shirt size={48} className="mb-4 opacity-20" />
                <button onClick={() => fileInputRef.current?.click()} className="mt-4 text-[#6B5AED] text-xs font-bold flex items-center gap-1 bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100"><Camera size={16}/> 拍照新增</button>
              </div>
            )}
          </div>
        )}

        {/* --- Profile / Settings Tab with Key Verification --- */}
        {activeTab === 'profile' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50">
              <h2 className="text-xl font-black mb-6 flex items-center gap-2"><Settings className="text-gray-400"/> AI 腦袋設定</h2>
              
              <div className="mb-6">
                <label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider flex items-center justify-between">
                   <span className="flex items-center gap-1"><Key size={12}/> Gemini API Key</span>
                   {keyStatus === 'valid' && <span className="text-green-500 flex items-center gap-1"><CheckCircle size={12}/> 已驗證</span>}
                   {keyStatus === 'invalid' && <span className="text-red-500 flex items-center gap-1"><XCircle size={12}/> 無效</span>}
                </label>
                <div className="flex gap-2 mb-2">
                  <input 
                    type="password" 
                    value={userApiKey}
                    onChange={(e) => { setUserApiKey(e.target.value); setKeyStatus('idle'); }}
                    placeholder="貼上 AI Studio Key..."
                    className={`flex-1 bg-gray-50 border-2 rounded-2xl p-3 text-sm font-bold focus:outline-none transition-colors ${keyStatus === 'invalid' ? 'border-red-200 bg-red-50' : 'border-gray-100 focus:border-[#6B5AED]'}`}
                  />
                  <button onClick={verifyKey} className="bg-gray-800 text-white px-4 rounded-2xl text-xs font-bold whitespace-nowrap active:scale-95 transition-transform">
                    {keyStatus === 'checking' ? <Loader2 size={16} className="animate-spin"/> : '驗證'}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  * 請至 Google AI Studio 申請免費 Key。<br/>
                  * 驗證通過後，才能啟用「專家級」圖片分析。
                </p>
                <div className="mt-4">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="w-full bg-indigo-50 text-indigo-600 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1">
                    <ExternalLink size={12}/> 取得免費 API Key
                  </a>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[32px] text-center">
               <h3 className="font-bold text-gray-400 text-xs uppercase mb-4">Location Setting</h3>
               <div className="flex bg-gray-100 p-1 rounded-2xl">
                 {LOCATIONS.map(l => (
                   <button key={l} onClick={()=>setUserLocation(l)} className={`flex-1 py-3 rounded-xl text-xs font-bold ${userLocation===l ? 'bg-white shadow-sm text-[#6B5AED]' : 'text-gray-400'}`}>{l}</button>
                 ))}
               </div>
            </div>
          </div>
        )}

        {/* ... Outfit & Notes Tabs remain similar ... */}
        {activeTab === 'outfit' && (
           <div className="space-y-6 animate-in slide-in-from-bottom">
             <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
               <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Sparkles className="text-indigo-400" /> 設計師搭配</h2>
               <div className="flex gap-2 mb-4">
                  <select value={outfitConfig.occasion} onChange={e=>setOutfitConfig({...outfitConfig, occasion:e.target.value})} className="bg-gray-50 rounded-xl p-3 text-xs font-bold w-full">{OCCASIONS.map(o=><option key={o}>{o}</option>)}</select>
                  <select value={outfitConfig.style} onChange={e=>setOutfitConfig({...outfitConfig, style:e.target.value})} className="bg-gray-50 rounded-xl p-3 text-xs font-bold w-full">{STYLES.map(s=><option key={s}>{s}</option>)}</select>
               </div>
               <button onClick={autoPickOutfit} disabled={isGenerating} className="w-full py-4 bg-[#6B5AED] text-white rounded-[24px] font-bold shadow-xl flex items-center justify-center gap-2">{isGenerating ? "思考中..." : "AI 自動抓取搭配"}</button>
             </div>
             {aiResult && <div className="bg-indigo-50/50 p-6 rounded-[32px]"><p className="text-sm text-indigo-900 whitespace-pre-wrap">{aiResult}</p></div>}
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
          <h3 className="text-xl font-black text-[#4A443F] mb-2">設計師分析中</h3>
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


