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
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北', desc: '版型：合身修身\n材質：挺括牛津布\n分析：經典必備。' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('closet'); 
  
  const [clothes, setClothes] = useState(() => safeParse('my_clothes_v15', INITIAL_CLOTHES));
  const [favorites, setFavorites] = useState(() => safeParse('my_favorites_v15', []));
  const [notes, setNotes] = useState(() => safeParse('my_notes_v15', []));
  const [calendarHistory, setCalendarHistory] = useState(() => safeParse('my_calendar_v15', {}));
  
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('my_gemini_key') || '');
  const [keyStatus, setKeyStatus] = useState('idle');

  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]); 
  const [isGenerating, setIsGenerating] = useState(false); 
  const [loadingText, setLoadingText] = useState(''); 
  const [aiResult, setAiResult] = useState(null);
  const [tryOnImage, setTryOnImage] = useState(null);
  const [currentViewLocation, setCurrentViewLocation] = useState('全部'); 
  const [userLocation, setUserLocation] = useState('台北'); 
  const [userProfile, setUserProfile] = useState({ height: 175, weight: 70, bodyType: 'H型' });
  const [noteTab, setNoteTab] = useState('notes'); 
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNoteData, setNewNoteData] = useState({ title: '', content: '' });
  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });

  const fileInputRef = useRef(null);

  useEffect(() => { localStorage.setItem('my_clothes_v15', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_favorites_v15', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('my_notes_v15', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('my_calendar_v15', JSON.stringify(calendarHistory)); }, [calendarHistory]);
  useEffect(() => { localStorage.setItem('my_gemini_key', userApiKey); }, [userApiKey]);

  const callGeminiAPI = async (prompt, imageBase64 = null) => {
    // 鎖死 v1beta 版本，並嘗試多個名稱變體
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
        if (model === models[models.length - 1]) throw e;
      }
    }
  };

  const verifyKey = async () => {
    if (!userApiKey) return;
    setKeyStatus('validating');
    try {
      await callGeminiAPI("Hi");
      setKeyStatus('valid');
    } catch (e) {
      setKeyStatus('invalid');
      alert(`連線失敗：${e.message}`);
    }
  };

  const analyzeImageWithGemini = async (base64Image) => {
    setIsGenerating(true);
    setLoadingText('設計師分析中...');
    const base64Data = base64Image.split(',')[1];
    const prompt = `分析這張衣物圖片，回傳純 JSON：{"name": "名稱", "category": "從 [${CATEGORIES.join(', ')}] 選一", "style": "從 [${STYLES.join(', ')}] 選一", "tempRange": "適合溫度", "desc": "50字描述"}`;

    try {
      const text = await callGeminiAPI(prompt, base64Data);
      const result = JSON.parse(text.replace(/```json|```/g, '').trim());
      const newItem = { ...result, id: Date.now().toString(), image: base64Image, location: userLocation };
      setClothes([newItem, ...clothes]);
      setSelectedCategory(newItem.category);
    } catch (error) {
      alert(`AI 分析失敗：${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setLoadingText('AI 搭配中...');
    const accessible = clothes.filter(c => c.location === userLocation);
    if (accessible.length < 1) {
      alert("此地點無衣物");
      setIsGenerating(false);
      return;
    }
    const prompt = `場合：${outfitConfig.occasion}。衣櫃：${JSON.stringify(accessible.map(c => ({id:c.id, name:c.name})))}。請挑選一套，回傳 JSON: {"selectedIds": [], "reason": "...", "tips": "..."}`;
    try {
      const text = await callGeminiAPI(prompt);
      const result = JSON.parse(text.replace(/```json|```/g, '').trim());
      const picked = clothes.filter(c => result.selectedIds.includes(c.id));
      setSelectedItems(picked);
      setAiResult(`${result.reason}\n\n💡 ${result.tips}`);
    } catch (e) {
      alert(`搭配失敗：${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteItem = (id) => {
    if (window.confirm('確定刪除？')) {
      setClothes(prev => prev.filter(c => c.id !== id));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] max-w-md mx-auto relative overflow-hidden">
      <input type="file" ref={fileInputRef} accept="image/*" onChange={(e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => analyzeImageWithGemini(reader.result);
          reader.readAsDataURL(file);
        }
      }} className="hidden" />

      <header className="px-6 pt-12 pb-4 bg-[#FFFBF7] z-10 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-black text-[#6B5AED]">V15.0 強制更新版</h1>
          <button onClick={() => setActiveTab('profile')} className="p-2 bg-white rounded-full shadow-sm border border-orange-50">
            <User size={20} className={keyStatus === 'valid' ? "text-green-500" : "text-gray-400"} />
          </button>
        </div>
        <div className="flex bg-orange-100/50 p-1.5 rounded-[20px] items-center">
          <div className="flex gap-1 flex-1">
            {['全部', ...LOCATIONS].map(loc => (
              <button key={loc} onClick={() => setCurrentViewLocation(loc)} className={`flex-1 py-1.5 rounded-2xl text-xs font-bold ${currentViewLocation === loc ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400'}`}>{loc}</button>
            ))}
          </div>
        </div>
      </header>

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
                <div key={item.id} className="bg-white rounded-[32px] p-2 shadow-sm border border-orange-50 relative animate-in zoom-in-95">
                  <div className="aspect-[4/5] rounded-[28px] overflow-hidden relative">
                    <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
                    <button onClick={() => deleteItem(item.id)} className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center border-2 border-white"><Trash2 size={14} /></button>
                  </div>
                  <div className="p-3">
                    <h3 className="text-[13px] font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                    <p className="text-[9px] text-gray-400 mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'outfit' && (
          <div className="space-y-6 animate-in slide-in-from-bottom">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Sparkles size={20} className="text-indigo-400" /> AI 造型師</h2>
              <button onClick={autoPickOutfit} className="w-full py-4 bg-[#6B5AED] text-white rounded-[24px] font-bold shadow-xl">AI 自動搭配</button>
            </div>
            {aiResult && <div className="bg-indigo-50/50 p-6 rounded-[32px]"><p className="text-sm text-indigo-900 whitespace-pre-wrap">{aiResult}</p></div>}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm">
              <h2 className="font-bold mb-4">API 設定</h2>
              <input type="password" value={userApiKey} onChange={(e) => setUserApiKey(e.target.value)} placeholder="API Key..." className="w-full bg-gray-50 p-3 rounded-xl mb-3" />
              <button onClick={verifyKey} className="w-full py-3 bg-[#6B5AED] text-white rounded-xl font-bold">驗證</button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-2xl border-t flex justify-around items-center px-6 pb-6 z-50">
        <button onClick={() => setActiveTab('closet')} className={`flex flex-col items-center gap-1 ${activeTab === 'closet' ? 'text-[#6B5AED]' : 'text-gray-300'}`}><Shirt size={22} /><span className="text-[9px] font-bold">衣櫥</span></button>
        <button onClick={() => setActiveTab('outfit')} className={`flex flex-col items-center gap-1 ${activeTab === 'outfit' ? 'text-[#6B5AED]' : 'text-gray-300'}`}><Wand2 size={22} /><span className="text-[9px] font-bold">自選</span></button>
        <button onClick={() => fileInputRef.current?.click()} className="w-14 h-14 bg-[#4A443F] text-white rounded-[24px] shadow-xl flex items-center justify-center -mt-8 border-4 border-[#FFFBF7]"><Plus size={28} /></button>
        <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-[#6B5AED]' : 'text-gray-300'}`}><User size={22} /><span className="text-[9px] font-bold">個人</span></button>
      </nav>

      {isGenerating && (
        <div className="fixed inset-0 z-[300] bg-white/80 backdrop-blur-lg flex flex-col items-center justify-center">
          <Loader2 className="text-[#6B5AED] animate-spin mb-4" size={48} />
          <p className="text-[#6B5AED] font-bold uppercase text-xs tracking-widest">{loadingText}</p>
        </div>
      )}
    </div>
  );
}

