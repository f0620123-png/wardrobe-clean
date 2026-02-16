import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, PlusCircle, RefreshCw, Heart, Calendar,
  User, Ruler, Map, ArrowRightLeft, AlertTriangle, Camera, Loader2, Key, Settings, Feather
} from 'lucide-react';

const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];

const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北', desc: '挺括修身，職場必備。' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('closet'); 
  const [clothes, setClothes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_clothes_v11')) || INITIAL_CLOTHES; } catch { return INITIAL_CLOTHES; }
  });
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_favorites_v11')) || []; } catch { return []; }
  });
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_notes_v11')) || []; } catch { return []; }
  });
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('my_gemini_key') || '');

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

  useEffect(() => { localStorage.setItem('my_clothes_v11', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_favorites_v11', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('my_notes_v11', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('my_gemini_key', userApiKey); }, [userApiKey]);

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

  // 🔥 V11.0 核心修正：更換模型名稱 + 時尚編輯 Prompt 🔥
  const analyzeImageWithGemini = async (base64Image) => {
    setIsGenerating(true);
    setLoadingText('時尚編輯正在鑑賞細節...');

    if (!userApiKey || userApiKey.length < 10) {
      setTimeout(() => {
        alert("⚠️ 請先至「個人」頁面輸入 API Key 以啟用真 AI 分析。");
        setIsGenerating(false);
      }, 1000);
      return;
    }

    const base64Data = base64Image.split(',')[1];
    const mimeType = base64Image.split(';')[0].split(':')[1];
    
    // 💡 這裡修改了指令，讓 AI 變得更敏銳、更像時尚雜誌編輯
    const prompt = `你是一位眼光獨到的 Vogue 時尚編輯。請仔細分析這張圖片中的單品，並回傳純 JSON 格式（不要 Markdown）：
    {
      "name": "請給出一個高級且具體的名稱 (例如：『復古水洗丹寧廓形外套』，不要只寫『牛仔外套』)",
      "category": "從這選一個最精確的分類: [${CATEGORIES.join(', ')}]",
      "style": "從這選一個主要風格: [${STYLES.join(', ')}]",
      "tempRange": "適合穿著的氣溫範圍 (例如 '18-24°C')。請根據布料厚度、織法與長短判斷：羽絨/羊毛為低溫，亞麻/雪紡為高溫。",
      "desc": "請用約 40 字的『時尚雜誌語氣』描述。具體指出顏色層次（如炭灰、米白）、材質觸感（如親膚磨毛、挺括斜紋）、剪裁細節（如落肩設計、收腰剪裁）與穿搭潛力。"
    }`;

    try {
      // 🛠️ 修正點：使用 'gemini-1.5-flash-latest' 或 'gemini-1.5-flash-001'
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }]
        })
      });

      const data = await response.json();
      
      if (data.error) {
        // 如果 latest 失敗，自動嘗試 -001 版本 (Fallback)
        console.warn("Latest model failed, trying 001...");
        const fallbackResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-001:generateContent?key=${userApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }]
          })
        });
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.error) throw new Error(fallbackData.error.message);
        processAiResponse(fallbackData, base64Image);
      } else {
        processAiResponse(data, base64Image);
      }

    } catch (error) {
      console.error(error);
      alert(`AI 分析失敗：${error.message}\n請確認 Key 是否正確，或是否有開啟 Google Cloud Billing。`);
      setIsGenerating(false);
    }
  };

  const processAiResponse = (data, image) => {
    try {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const cleanJson = text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleanJson);

      const newItem = {
        id: Date.now().toString(),
        name: result.name || 'AI 鑑賞單品',
        category: result.category || '上衣',
        style: result.style || '休閒',
        tempRange: result.tempRange || '20-25°C',
        image: image,
        location: userLocation,
        desc: result.desc || 'AI 完成分析。'
      };

      setClothes([newItem, ...clothes]);
      setSelectedCategory(newItem.category);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      alert("AI 回傳格式錯誤，請重試。");
    } finally {
      setIsGenerating(false);
    }
  };

  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setLoadingText('造型顧問正在搭配...');
    
    if (!userApiKey) { alert("請先設定 API Key"); setIsGenerating(false); return; }

    try {
      const accessibleClothes = clothes.filter(c => c.location === userLocation);
      if(accessibleClothes.length === 0) throw new Error(`在${userLocation}找不到衣物`);

      // 💡 搭配指令也升級了
      const prompt = `我是專業造型顧問。地點：${userLocation}。場合：${outfitConfig.occasion}。
      客戶資料：${userProfile.height}cm/${userProfile.weight}kg/${userProfile.bodyType}。
      衣櫃清單：${JSON.stringify(accessibleClothes.map(c => ({id:c.id, name:c.name, cat:c.category, desc:c.desc})))}。
      請挑選一套「有品味且修飾身形」的組合。
      回傳 JSON: {"selectedIds": [], "reason": "用鼓勵且專業的語氣說明為何這樣搭能修飾身材", "tips": "一個畫龍點睛的穿法建議"}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const result = JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim());
      const picked = clothes.filter(c => result.selectedIds.includes(c.id));
      
      setSelectedItems(picked);
      setAiResult(`${result.reason}\n\n✨ ${result.tips}`);
      setTryOnImage(picked[0]?.image); 

    } catch (e) {
      alert(`搭配建議失敗：${e.message}`);
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
          <h1 className="text-3xl font-black text-[#6B5AED]">V11.0 時尚編輯版</h1>
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
                    {item.desc && <div className="bg-gray-50 rounded-xl p-2 mt-1"><p className="text-[10px] text-gray-600 leading-relaxed line-clamp-3 text-justify">{item.desc}</p></div>}
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

        {/* ... Outfit, Notes, Profile Tabs ... */}
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
             {aiResult && <div className="bg-indigo-50/50 p-6 rounded-[32px]"><p className="text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed">{aiResult}</p></div>}
           </div>
        )}

        {activeTab === 'profile' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50">
              <h2 className="text-xl font-black mb-6 flex items-center gap-2"><Settings className="text-gray-400"/> 設定</h2>
              <div className="mb-6">
                <label className="text-xs font-bold text-gray-400 mb-2 block uppercase flex items-center gap-1"><Key size={12}/> Google Gemini API Key</label>
                <input type="password" value={userApiKey} onChange={(e) => setUserApiKey(e.target.value)} placeholder="貼上 Key..." className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 text-sm font-bold focus:border-[#6B5AED] focus:outline-none" />
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
            <Feather className="absolute inset-0 m-auto text-[#6B5AED] animate-pulse" size={32} />
          </div>
          <h3 className="text-xl font-black text-[#4A443F] mb-2">AI 時尚編輯分析中</h3>
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


