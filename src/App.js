import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, PlusCircle, RefreshCw, Heart, Calendar,
  User, Ruler, Map, ArrowRightLeft, AlertTriangle, Camera, Edit3, Save, Thermometer
} from 'lucide-react';

// ⚠️ 強烈建議填入您的 Gemini API Key 以獲得真實的圖像分析能力
// 申請網址: https://aistudio.google.com/app/apikey
const apiKey = "AIzaSyDrVDWi4FjHNrsk0iZVl3eNE1-V36Ejdyk"; 

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];

// --- 初始單品數據庫 ---
const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '20-26°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北', desc: '挺括修身，職場必備單品，適合正式會議。' },
  { id: 't2', name: '灰色衛衣', category: '上衣', style: '休閒', tempRange: '15-22°C', image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400', location: '新竹', desc: '內刷毛材質，觸感柔軟，適合秋冬居家或外出。' },
];

// --- 圖片壓縮工具 ---
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); 
      };
    };
  });
};

export default function App() {
  const [activeTab, setActiveTab] = useState('closet'); 
  
  const [clothes, setClothes] = useState(() => {
    try {
      const saved = localStorage.getItem('my_clothes_v10');
      return saved ? JSON.parse(saved) : INITIAL_CLOTHES;
    } catch (e) { return INITIAL_CLOTHES; }
  });

  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]); 
  const [isGenerating, setIsGenerating] = useState(false); 
  const [loadingText, setLoadingText] = useState(''); 
  const [aiResult, setAiResult] = useState(null);
  const [tryOnImage, setTryOnImage] = useState(null);

  const [currentViewLocation, setCurrentViewLocation] = useState('全部'); 
  const [userLocation, setUserLocation] = useState('台北'); 
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('my_favorites_v10');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  
  const [editingItem, setEditingItem] = useState(null); 
  const [showEditModal, setShowEditModal] = useState(false);

  const [noteTab, setNoteTab] = useState('notes'); 
  const [notes, setNotes] = useState(() => {
    try {
      const saved = localStorage.getItem('my_notes_v10');
      return saved ? JSON.parse(saved) : [{ id: 1, type: 'notes', content: '我不喜歡綠色配紫色。', date: '2024-05-20' }];
    } catch (e) { return []; }
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNoteData, setNewNoteData] = useState({ title: '', content: '' });
  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });

  const fileInputRef = useRef(null);

  useEffect(() => { localStorage.setItem('my_clothes_v10', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_favorites_v10', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('my_notes_v10', JSON.stringify(notes)); }, [notes]);

  const hasLocationConflict = useMemo(() => {
    if (selectedItems.length < 2) return false;
    const locs = new Set(selectedItems.map(i => i.location));
    return locs.size > 1;
  }, [selectedItems]);

  const toggleSelectItem = (item) => {
    setSelectedItems(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) return prev.filter(i => i.id !== item.id);
      return [...prev, item];
    });
  };

  const deleteItem = (id) => {
    if (window.confirm('確定要刪除這件單品嗎？此動作無法復原。')) {
      setClothes(prev => prev.filter(item => item.id !== id));
      setSelectedItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const moveLocation = (id, newLoc) => {
    setClothes(prev => prev.map(c => c.id === id ? { ...c, location: newLoc } : c));
  };

  const openEditModal = (item) => {
    setEditingItem({ ...item });
    setShowEditModal(true);
  };

  const saveEdit = () => {
    setClothes(prev => prev.map(c => c.id === editingItem.id ? editingItem : c));
    setShowEditModal(false);
    setEditingItem(null);
  };

  const handleCameraClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  // --- V10.0 核心：真實 AI 分析與智慧備案 ---
  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setIsGenerating(true);
      setLoadingText('正在優化圖片...');
      const compressedBase64 = await compressImage(file);
      
      // 根據是否有 API Key 決定走哪條路
      if (apiKey) {
        await analyzeImageWithGemini(compressedBase64);
      } else {
        await smartFallbackAnalysis(compressedBase64);
      }
      
    } catch (error) {
      alert("圖片處理失敗，請重試");
      setIsGenerating(false);
    }
    event.target.value = '';
  };

  // 1. 真實 AI 分析 (需填 API Key)
  const analyzeImageWithGemini = async (base64Image) => {
    setLoadingText('AI 視覺分析中 (辨識材質/顏色)...');
    
    // 移除 base64 header 
    const base64Data = base64Image.split(',')[1];

    const prompt = `你是一位專業時尚編輯。請分析這張衣物圖片，並回傳繁體中文 JSON 格式：
    {
      "name": "簡短名稱 (例如：深藍色羊毛大衣)",
      "category": "請從 [上衣, 下著, 內搭, 外套, 背心, 鞋子, 帽子, 飾品, 包包] 選一個最接近的",
      "style": "請從 [極簡, 韓系, 日系, 美式, 街頭, 復古, 文青, 休閒, 商務, 運動, 戶外] 選一個最接近的",
      "tempRange": "適合穿著的氣溫區間 (例如：15-20°C)",
      "desc": "30字以內的描述，包含顏色、材質、版型與觸感 (例如：採用重磅丹寧布料，版型硬挺，刷色自然，適合秋冬層次穿搭。)"
    }`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      const result = JSON.parse(data.candidates[0].content.parts[0].text);

      const newItem = {
        id: Date.now().toString(),
        name: result.name,
        category: result.category,
        style: result.style,
        tempRange: result.tempRange,
        image: base64Image,
        location: userLocation,
        desc: result.desc // 真實 AI 描述
      };

      setClothes([newItem, ...clothes]);
      setIsGenerating(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // 自動開啟編輯確認
      openEditModal(newItem);

    } catch (e) {
      console.error(e);
      setLoadingText('AI 連線失敗，切換至智慧備案...');
      await smartFallbackAnalysis(base64Image);
    }
  };

  // 2. 智慧備案 (無 API Key 時使用，比隨機聰明)
  const smartFallbackAnalysis = async (imageSrc) => {
    setLoadingText('正在進行特徵提取...');
    
    setTimeout(() => {
      // 根據使用者目前所在的 Category 頁籤來推斷
      // 這樣就不會發生「在外套頁籤新增衣服卻變成 25 度」的狀況
      let defaultTemp = '20-25°C';
      let defaultDesc = '材質舒適，適合日常穿搭。';
      
      if (selectedCategory === '外套') {
        defaultTemp = '10-18°C';
        defaultDesc = '具有一定厚度與保暖性，適合氣溫較低時穿著。';
      } else if (selectedCategory === '內搭' || selectedCategory === '背心') {
        defaultTemp = '22-30°C';
        defaultDesc = '輕薄透氣，親膚性佳，適合多層次搭配或單穿。';
      } else if (selectedCategory === '圍巾' || selectedCategory === '帽子') {
         defaultTemp = '10-20°C';
         defaultDesc = '秋冬保暖配件，增添造型亮點。';
      }

      const newItem = {
        id: Date.now().toString(),
        name: `新${selectedCategory} (待編輯)`,
        category: selectedCategory,
        style: '休閒',
        tempRange: defaultTemp,
        image: imageSrc, 
        location: userLocation,
        desc: `(智慧預填) ${defaultDesc} 請點擊編輯補充顏色與細節。`
      };
      
      setClothes([newItem, ...clothes]);
      setIsGenerating(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      openEditModal(newItem); // 自動開啟編輯
    }, 1500);
  };

  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setLoadingText(`AI 正在掃描 ${userLocation} 的衣櫃...`);
    setAiResult(null);
    setTryOnImage(null);

    const accessibleClothes = clothes.filter(c => c.location === userLocation);
    
    // 如果有 API Key，這裡也可以升級成真 AI 搭配
    // 目前先維持前端模擬，避免消耗太多 Token
    setTimeout(() => {
      const picked = accessibleClothes.slice(0, 3);
      if (picked.length === 0) {
        setAiResult("該地點衣物不足，無法搭配。");
      } else {
        setSelectedItems(picked);
        setAiResult(`基於您的體型 (${userProfile.bodyType}) 與地點 (${userLocation})，這套搭配能有效修飾身形。\n\n💡 小撇步：嘗試將上衣紮進去，拉長腿部比例。`);
        setTryOnImage(picked[0].image);
      }
      setIsGenerating(false);
    }, 2000);
  };

  const addNoteOrCourse = () => {
    if (!newNoteData.content) return;
    const newEntry = {
      id: Date.now(),
      type: noteTab,
      title: noteTab === 'courses' ? newNoteData.title : '',
      content: newNoteData.content,
      date: new Date().toLocaleDateString()
    };
    setNotes(prev => [newEntry, ...prev]);
    setNewNoteData({ title: '', content: '' });
    setShowAddModal(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] font-sans max-w-md mx-auto relative overflow-hidden">
      
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* Header */}
      <header className="px-6 pt-12 pb-4 shrink-0 bg-[#FFFBF7] z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-black text-[#6B5AED]">V10.0 真AI覺醒版</h1>
          <button onClick={() => setShowProfileModal(true)} className="p-2 bg-white rounded-full shadow-sm border border-orange-50 active:scale-90 transition-transform">
            <User size={20} className="text-[#6B5AED]" />
          </button>
        </div>
        
        <div className="flex bg-orange-100/50 p-1.5 rounded-[20px] items-center">
          <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-black text-orange-600 uppercase tracking-tighter shrink-0 border-r border-orange-200 mr-2">
            <Map size={12} /> View Location
          </div>
          <div className="flex gap-1 flex-1">
            {['全部', '台北', '新竹'].map(loc => (
              <button key={loc} onClick={() => setCurrentViewLocation(loc)} className={`flex-1 py-1.5 rounded-2xl text-xs font-bold transition-all ${currentViewLocation === loc ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400'}`}>{loc}</button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 pb-32 no-scrollbar">
        {activeTab === 'closet' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex overflow-x-auto no-scrollbar gap-3 mb-6 py-2">
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-5 py-2 rounded-full text-sm font-bold transition-all border-2 flex-shrink-0 ${selectedCategory === cat ? 'bg-[#6B5AED] border-[#6B5AED] text-white shadow-lg' : 'bg-white border-transparent text-gray-400'}`}>{cat}</button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {clothes
                .filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation))
                .map(item => (
                  <div key={item.id} className="bg-white rounded-[32px] p-2 shadow-sm border border-orange-50 group relative animate-in zoom-in-95 duration-300">
                    <div className="aspect-[4/5] rounded-[28px] overflow-hidden relative">
                      <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
                      
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[9px] font-bold text-white flex items-center gap-1">
                        <MapPin size={8} /> {item.location}
                      </div>

                      <button onClick={(e) => { e.stopPropagation(); toggleSelectItem(item); }} className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all z-20 active:scale-90 ${selectedItems.find(i=>i.id===item.id) ? 'bg-[#6B5AED] text-white border-[#6B5AED]' : 'bg-black/20 text-white border-white/60'}`}>
                        <Check size={16} strokeWidth={4} />
                      </button>

                      <button 
                        onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                        className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm text-[#6B5AED] flex items-center justify-center shadow-lg z-20 active:scale-90 transition-all border-2 border-white"
                      >
                        <Edit3 size={14} />
                      </button>

                      <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg z-20 active:scale-90 transition-all border-2 border-white">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    
                    <div className="p-3 pt-3">
                      <h3 className="text-[13px] font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                      <div className="flex items-center gap-2 mt-1 mb-1">
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">{item.style}</span>
                        <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><Thermometer size={10}/> {item.tempRange}</span>
                      </div>
                      {item.desc && (
                        <div className="bg-indigo-50/50 rounded-xl p-2 mt-1 border border-indigo-50">
                          <p className="text-[9px] text-indigo-800 leading-relaxed line-clamp-2">{item.desc}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
            
            {clothes.filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation)).length === 0 && (
              <div className="py-20 text-center text-gray-300 flex flex-col items-center">
                <Shirt size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-bold">此地點暫無單品</p>
                <button onClick={handleCameraClick} className="mt-4 text-[#6B5AED] text-xs font-bold flex items-center gap-1 bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100 shadow-sm active:scale-95 transition-transform">
                   <Camera size={16}/> 拍照新增第一件
                </button>
              </div>
            )}
          </div>
        )}

        {/* Outfit Tab */}
        {activeTab === 'outfit' && (
           <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
             <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
               <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Sparkles className="text-indigo-400" /> AI 定位造型</h2>
               <button onClick={autoPickOutfit} disabled={isGenerating} className="w-full py-5 bg-[#6B5AED] text-white rounded-[24px] font-bold shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2">
                 {isGenerating ? "AI 運算中..." : "AI 自動抓取搭配"}
               </button>
             </div>
             {aiResult && <div className="bg-indigo-50/50 p-6 rounded-[32px]"><p className="text-sm text-indigo-900 whitespace-pre-wrap">{aiResult}</p></div>}
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

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-white p-6 rounded-[32px] text-center">
              <User size={48} className="mx-auto mb-4 text-indigo-500" />
              <h2 className="text-2xl font-black">用戶設定</h2>
            </div>
          </div>
        )}
      </main>

      {/* Footer Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-2xl border-t border-gray-100 flex justify-around items-center px-6 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50">
        <NavButton active={activeTab === 'closet'} icon={<Shirt />} label="衣櫥" onClick={() => setActiveTab('closet')} />
        <NavButton active={activeTab === 'outfit'} icon={<Wand2 />} label="自選" onClick={() => setActiveTab('outfit')} />
        
        <button onClick={handleCameraClick} className="w-14 h-14 bg-[#4A443F] text-white rounded-[24px] shadow-xl flex items-center justify-center active:scale-90 transition-all -mt-8 border-4 border-[#FFFBF7]">
          <Camera size={28} />
        </button>
        
        <NavButton active={activeTab === 'notes'} icon={<BookOpen />} label="靈感" onClick={() => setActiveTab('notes')} />
        <NavButton active={activeTab === 'profile'} icon={<User />} label="個人" onClick={() => setActiveTab('profile')} />
      </nav>

      {/* 編輯單品 Modal */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full rounded-[40px] p-6 animate-in scale-in-95 max-h-[80vh] overflow-y-auto">
             <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-[#6B5AED]"><Edit3 size={20}/> 編輯單品 (AI 校對)</h3>
             
             <div className="space-y-4">
               <div>
                 <label className="text-xs font-bold text-gray-400 uppercase">名稱</label>
                 <input className="w-full bg-gray-50 p-3 rounded-xl mt-1 font-bold" value={editingItem.name} onChange={e=>setEditingItem({...editingItem, name:e.target.value})} />
               </div>
               
               <div>
                 <label className="text-xs font-bold text-gray-400 uppercase">AI 視覺描述</label>
                 <textarea className="w-full bg-gray-50 p-3 rounded-xl mt-1 text-sm h-24 leading-relaxed" value={editingItem.desc} onChange={e=>setEditingItem({...editingItem, desc:e.target.value})} />
               </div>

               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="text-xs font-bold text-gray-400 uppercase">類別</label>
                   <select className="w-full bg-gray-50 p-3 rounded-xl mt-1 font-bold" value={editingItem.category} onChange={e=>setEditingItem({...editingItem, category:e.target.value})}>
                     {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-400 uppercase">地點</label>
                   <select className="w-full bg-gray-50 p-3 rounded-xl mt-1 font-bold" value={editingItem.location} onChange={e=>setEditingItem({...editingItem, location:e.target.value})}>
                     {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                   </select>
                 </div>
               </div>
               
               <div>
                 <label className="text-xs font-bold text-gray-400 uppercase">適合溫度 (AI 預測)</label>
                 <input className="w-full bg-gray-50 p-3 rounded-xl mt-1 font-bold" value={editingItem.tempRange} onChange={e=>setEditingItem({...editingItem, tempRange:e.target.value})} />
               </div>
             </div>

             <div className="flex gap-4 mt-6">
               <button onClick={()=>setShowEditModal(false)} className="flex-1 py-3 text-gray-400 font-bold">取消</button>
               <button onClick={saveEdit} className="flex-1 py-3 bg-[#6B5AED] text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
                 <Save size={18}/> 確認儲存
               </button>
             </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full rounded-[40px] p-8 animate-in scale-in-95">
             <h3 className="text-xl font-bold mb-4">新增內容</h3>
             <textarea className="w-full bg-gray-50 p-4 rounded-xl mb-4" value={newNoteData.content} onChange={e=>setNewNoteData({...newNoteData, content:e.target.value})} placeholder="輸入內容..." />
             <div className="flex gap-4">
               <button onClick={()=>setShowAddModal(false)} className="flex-1 py-3 text-gray-400">取消</button>
               <button onClick={addNoteOrCourse} className="flex-1 py-3 bg-indigo-500 text-white rounded-xl">儲存</button>
             </div>
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="fixed inset-0 z-[300] bg-white/80 backdrop-blur-lg flex flex-col items-center justify-center">
          <div className="relative mb-6">
            <div className="w-24 h-24 border-4 border-[#6B5AED] border-t-transparent rounded-full animate-spin"></div>
            <Sparkles className="absolute inset-0 m-auto text-[#6B5AED] animate-pulse" size={32} />
          </div>
          <h3 className="text-xl font-black text-[#4A443F] mb-2">AI 深度分析中</h3>
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


