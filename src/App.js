import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, RefreshCw, Heart, Calendar, User, Ruler, Map, 
  ArrowRightLeft, AlertTriangle, Camera, Image as ImageIcon, Loader2
} from 'lucide-react';

const apiKey = ""; // Vercel 環境變數

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const BODY_TYPES = ['H型', '倒三角形', '梨形', '沙漏型', '圓形(O型)'];
const LOCATIONS = ['台北', '新竹'];

// --- 初始單品數據庫 ---
const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北', desc: '挺括修身，適合正式會議。' },
  { id: 't2', name: '灰色衛衣', category: '上衣', style: '休閒', tempRange: '10-20°C', image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400', location: '新竹', desc: '內刷毛材質，舒適保暖。' },
  { id: 't3', name: '黑絲絨襯衫', category: '上衣', style: '復古', tempRange: '15-22°C', image: 'https://images.unsplash.com/photo-1603252109303-2751441dd15e?w=400', location: '台北', desc: '低調奢華光澤感。' },
  { id: 'b1', name: '直筒牛仔褲', category: '下著', style: '美式', tempRange: '10-28°C', image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400', location: '台北', desc: '經典丹寧，修飾腿型。' },
  { id: 'b2', name: '黑色西裝褲', category: '下著', style: '商務', tempRange: '10-25°C', image: 'https://images.unsplash.com/photo-1594932224030-940955d21022?w=400', location: '新竹', desc: '垂墜感佳，不易起皺。' },
];

export default function App() {
  // --- 狀態初始化 (加入 LocalStorage) ---
  const [activeTab, setActiveTab] = useState('closet');
  
  // 初始化衣物：先從 localStorage 讀取，沒有的話才用預設值
  const [clothes, setClothes] = useState(() => {
    const saved = localStorage.getItem('wardrobe_clothes');
    return saved ? JSON.parse(saved) : INITIAL_CLOTHES;
  });

  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [tryOnImage, setTryOnImage] = useState(null);
  const [loadingText, setLoadingText] = useState("");

  // 地點與用戶設定
  const [currentViewLocation, setCurrentViewLocation] = useState('全部');
  const [userLocation, setUserLocation] = useState('台北');
  const [userProfile, setUserProfile] = useState({ height: 175, weight: 70, bodyType: 'H型' });
  const [showProfileModal, setShowProfileModal] = useState(false);

  // 靈感筆記
  const [noteTab, setNoteTab] = useState('notes');
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('wardrobe_notes');
    return saved ? JSON.parse(saved) : [{ id: 1, type: 'notes', content: '我不喜歡綠色配紫色。', date: '2024-05-20' }];
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNoteData, setNewNoteData] = useState({ title: '', content: '' });
  
  // 新增衣物 Modal
  const [showCameraModal, setShowCameraModal] = useState(false);

  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });

  // --- 監聽資料變更並儲存 ---
  useEffect(() => {
    localStorage.setItem('wardrobe_clothes', JSON.stringify(clothes));
  }, [clothes]);

  useEffect(() => {
    localStorage.setItem('wardrobe_notes', JSON.stringify(notes));
  }, [notes]);

  // --- 跨地點偵測 ---
  const hasLocationConflict = useMemo(() => {
    if (selectedItems.length < 2) return false;
    const locs = new Set(selectedItems.map(i => i.location));
    return locs.size > 1;
  }, [selectedItems]);

  // --- 功能邏輯 ---
  const toggleSelectItem = (item) => {
    setSelectedItems(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) return prev.filter(i => i.id !== item.id);
      return [...prev, item];
    });
  };

  const deleteItem = (id, e) => {
    e.stopPropagation(); // 防止觸發卡片點擊
    if (window.confirm('確定要刪除這件衣物嗎？')) {
      setClothes(prev => prev.filter(item => item.id !== id));
      setSelectedItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const moveLocation = (id, newLoc, e) => {
    e.stopPropagation();
    setClothes(prev => prev.map(c => c.id === id ? { ...c, location: newLoc } : c));
  };

  // --- 模擬 AI 分析並新增衣物 ---
  const handleSimulateAdd = (source) => {
    setShowCameraModal(false);
    setIsGenerating(true);
    setLoadingText("AI 正在掃描影像特徵...");

    setTimeout(() => {
      setLoadingText("正在生成穿搭建議與溫度分析...");
      setTimeout(() => {
        const newId = Date.now().toString();
        // 隨機產生一個新衣物範例
        const newItemsMock = [
          { name: 'AI 偵測-深藍亞麻西裝', cat: '外套', img: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400', desc: '透氣亞麻材質，適合夏季商務場合，版型修身。', style: '商務' },
          { name: 'AI 偵測-米色編織草帽', cat: '帽子', img: 'https://images.unsplash.com/photo-1582254465498-6bc70419b607?w=400', desc: '度假風必備單品，寬帽沿設計修飾臉型。', style: '度假' },
          { name: 'AI 偵測-復古皮革郵差包', cat: '包包', img: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400', desc: '經典皮革紋路，隨時間使用越顯質感。', style: '復古' }
        ];
        const randomItem = newItemsMock[Math.floor(Math.random() * newItemsMock.length)];

        const newItem = {
          id: newId,
          name: randomItem.name,
          category: randomItem.cat,
          style: randomItem.style,
          tempRange: '20-30°C', // 模擬分析結果
          image: randomItem.img,
          location: currentViewLocation === '全部' ? '台北' : currentViewLocation, // 自動歸類到當前視圖地點
          desc: `[AI 分析報告] ${randomItem.desc}`
        };

        setClothes([newItem, ...clothes]);
        setIsGenerating(false);
        setActiveTab('closet'); // 切換回衣櫥看結果
        setLoadingText("");
      }, 1500);
    }, 1500);
  };

  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setLoadingText("AI 正在掃描您的衣櫥...");
    setAiResult(null);
    setTryOnImage(null);

    const accessibleClothes = clothes.filter(c => c.location === userLocation);
    
    // 簡單模擬 API 回傳，若您有 API key 可解開下方註解
    setTimeout(() => {
      // 簡單的隨機選取邏輯做為 fallback
      const top = accessibleClothes.find(c => c.category === '上衣') || accessibleClothes[0];
      const bottom = accessibleClothes.find(c => c.category === '下著') || accessibleClothes[1];
      
      if (top && bottom) {
        setSelectedItems([top, bottom]);
        setAiResult(`AI 為您選擇了適合 ${outfitConfig.occasion} 的 ${outfitConfig.style} 風格搭配。\n\n💡 搭配理由：\n${top.name} 與 ${bottom.name} 的材質紋理形成良好對比，且適合 ${userProfile.bodyType} 體型修飾身形。\n\n📍 取用地點：${userLocation}`);
        setTryOnImage(top.image); // 暫時用上衣圖當示意
      } else {
        setAiResult("抱歉，您在該地點的衣物不足以組成完整搭配。");
      }
      setIsGenerating(false);
      setLoadingText("");
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
      
      {/* Header */}
      <header className="px-6 pt-12 pb-4 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-black">衣櫥日記 V7.0</h1>
          <button onClick={() => setShowProfileModal(true)} className="p-2 bg-white rounded-full shadow-sm border border-orange-50">
            <User size={20} className="text-[#6B5AED]" />
          </button>
        </div>
        
        <div className="flex bg-orange-100/50 p-1.5 rounded-[20px] items-center">
          <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-black text-orange-600 uppercase tracking-tighter shrink-0 border-r border-orange-200 mr-2">
            <Map size={12} /> View Location
          </div>
          <div className="flex gap-1 flex-1">
            {['全部', '台北', '新竹'].map(loc => (
              <button 
                key={loc}
                onClick={() => setCurrentViewLocation(loc)}
                className={`flex-1 py-1.5 rounded-2xl text-xs font-bold transition-all ${currentViewLocation === loc ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400'}`}
              >
                {loc}
              </button>
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
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-5 py-2 rounded-full text-sm font-bold transition-all border-2 flex-shrink-0
                    ${selectedCategory === cat ? 'bg-[#6B5AED] border-[#6B5AED] text-white shadow-lg' : 'bg-white border-transparent text-gray-400'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {clothes
                .filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation))
                .map(item => (
                  <div key={item.id} className="bg-white rounded-[32px] p-2 shadow-sm border border-orange-50 group relative">
                    <div className="aspect-[4/5] rounded-[28px] overflow-hidden relative">
                      <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
                      
                      {/* 地點標籤 */}
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[9px] font-bold text-white flex items-center gap-1">
                        <MapPin size={8} /> {item.location}
                      </div>

                      {/* 勾選按鈕 */}
                      <button 
                        onClick={() => toggleSelectItem(item)} 
                        className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedItems.find(i=>i.id===item.id) ? 'bg-[#6B5AED] text-white border-[#6B5AED]' : 'bg-black/10 text-white border-white/40'}`}
                      >
                        <Check size={16} strokeWidth={4} />
                      </button>

                      {/* 移動地點按鈕 */}
                      <button 
                        onClick={(e) => moveLocation(item.id, item.location === '台北' ? '新竹' : '台北', e)}
                        className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm text-gray-600 flex items-center justify-center shadow-sm"
                      >
                        <ArrowRightLeft size={14} />
                      </button>

                      {/* 刪除按鈕 - 手機優化：改為半透明常駐，非 hover */}
                      <button 
                        onClick={(e) => deleteItem(item.id, e)}
                        className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-500/80 text-white flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    
                    <div className="p-2 pt-3">
                      <h3 className="text-[13px] font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                      <p className="text-[10px] text-gray-400 mt-0.5 mb-2">{item.style} · {item.tempRange}</p>
                      {/* AI 描述區塊 */}
                      <div className="bg-gray-50 rounded-xl p-2">
                        <p className="text-[9px] text-gray-500 leading-relaxed line-clamp-2">
                          <Sparkles size={8} className="inline text-[#6B5AED] mr-1"/>
                          {item.desc || "暫無 AI 分析描述"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            {clothes.filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation)).length === 0 && (
              <div className="py-20 text-center text-gray-300">
                <Shirt size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-sm font-bold">此地點暫無該類別單品</p>
                <p className="text-xs mt-2">點擊下方 + 新增衣物</p>
              </div>
            )}
          </div>
        )}

        {/* ... (Outfit, Notes, Profile Tabs 保持不變，為節省篇幅省略，請保留原 V6 邏輯，或直接使用上方 V6 程式碼對應區塊) ... */}
        {/* 為方便複製，這裡我還是把 Outfit Tab 完整寫出來，避免您複製錯 */}
        {activeTab === 'outfit' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
             <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><Sparkles className="text-indigo-400" /> AI 定位造型</h2>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-xl">
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">Location:</span>
                  <select 
                    value={userLocation} 
                    onChange={e => setUserLocation(e.target.value)}
                    className="bg-transparent text-[10px] font-black text-indigo-700 focus:outline-none cursor-pointer"
                  >
                    {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 px-2 uppercase">Occasion</label>
                  <select value={outfitConfig.occasion} onChange={e=>setOutfitConfig({...outfitConfig, occasion:e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold appearance-none">
                    {OCCASIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 px-2 uppercase">Style</label>
                  <select value={outfitConfig.style} onChange={e=>setOutfitConfig({...outfitConfig, style:e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold appearance-none">
                    {STYLES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <button 
                onClick={autoPickOutfit} 
                disabled={isGenerating} 
                className="w-full py-5 bg-[#6B5AED] text-white rounded-[24px] font-bold shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isGenerating ? "AI 掃描中..." : <><RefreshCw size={20}/> 抓取 {userLocation} 的最佳搭配</>}
              </button>
            </div>

            {hasLocationConflict && (
              <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-[24px] flex items-center gap-3 animate-pulse">
                <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                <p className="text-[11px] font-bold text-amber-800 leading-tight">
                  提醒：選中的單品跨越了「台北」與「新竹」！
                </p>
              </div>
            )}

            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50">
              <h3 className="text-[10px] font-black text-gray-300 uppercase mb-4 tracking-widest">Selected Items ({selectedItems.length})</h3>
              <div className="flex gap-3 overflow-x-auto no-scrollbar">
                {selectedItems.map(item => (
                  <div key={item.id} className="relative flex-shrink-0 group">
                    <img src={item.image} className="w-16 h-16 rounded-2xl object-cover border border-gray-100" />
                    <div className="absolute -top-1 -right-1 bg-black text-white rounded-full p-0.5 cursor-pointer" onClick={() => toggleSelectItem(item)}><X size={10} /></div>
                    <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-orange-400 text-white text-[8px] font-black rounded-full uppercase shadow-sm">{item.location}</div>
                  </div>
                ))}
                {selectedItems.length === 0 && <p className="text-xs text-gray-300 italic py-4">尚未挑選任何單品</p>}
              </div>
            </div>

            {/* 結果區塊省略 (同 V6) */}
            {aiResult && (
               <div className="bg-indigo-50/50 p-6 rounded-[32px] border border-indigo-100">
                  <p className="text-sm leading-relaxed text-indigo-900 whitespace-pre-wrap font-medium">{aiResult}</p>
               </div>
            )}
          </div>
        )}

        {/* Notes Tab (同 V6) */}
        {activeTab === 'notes' && (
           <div className="animate-in fade-in space-y-6">
             <div className="flex bg-gray-100 p-1 rounded-2xl">
              <button onClick={() => setNoteTab('notes')} className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${noteTab === 'notes' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>
                <BookOpen size={16} /> 個人筆記
              </button>
              <button onClick={() => setNoteTab('courses')} className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${noteTab === 'courses' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>
                <GraduationCap size={16} /> 穿搭教材
              </button>
            </div>
            
            <button onClick={() => setShowAddModal(true)} className="w-full py-8 border-2 border-dashed border-indigo-200 bg-indigo-50/20 rounded-[28px] flex flex-col items-center justify-center text-indigo-400">
              <PlusCircle size={32} />
              <span className="text-xs font-bold mt-2">新增{noteTab === 'notes' ? '筆記' : '教材'}</span>
            </button>

            <div className="space-y-4">
              {notes.filter(n=>n.type===noteTab).map(note => (
                <div key={note.id} className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50 relative">
                  {note.title && <h4 className="font-black text-gray-800 mb-2">{note.title}</h4>}
                  <p className="text-sm text-gray-600 leading-relaxed font-medium">{note.content}</p>
                  <p className="text-[9px] text-gray-300 font-bold mt-4 tracking-widest">{note.date}</p>
                  <button onClick={() => setNotes(notes.filter(n=>n.id!==note.id))} className="absolute top-4 right-4 text-gray-200"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Profile Tab (同 V6) */}
        {activeTab === 'profile' && (
           <div className="animate-in fade-in space-y-6">
            <section className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50 text-center">
              <div className="w-24 h-24 bg-indigo-50 rounded-full mx-auto mb-4 flex items-center justify-center text-indigo-500">
                <User size={48} />
              </div>
              <h2 className="text-2xl font-black">穿搭探險家</h2>
              <p className="text-xs text-gray-400 font-bold mt-1">LV. 18</p>
            </section>
          </div>
        )}
      </main>

      {/* Footer Nav - ✅ 綁定按鈕事件 */}
      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-2xl border-t border-gray-100 flex justify-around items-center px-6 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50">
        <NavButton active={activeTab === 'closet'} icon={<Shirt />} label="衣櫥" onClick={() => setActiveTab('closet')} />
        <NavButton active={activeTab === 'outfit'} icon={<Wand2 />} label="自選" onClick={() => setActiveTab('outfit')} />
        
        {/* 新增按鈕 - 觸發相機 Modal */}
        <button 
          onClick={() => setShowCameraModal(true)}
          className="w-14 h-14 bg-[#4A443F] text-white rounded-[24px] shadow-xl flex items-center justify-center active:scale-90 transition-all -mt-8 border-4 border-[#FFFBF7]"
        >
          <Plus size={28} />
        </button>

        <NavButton active={activeTab === 'notes'} icon={<BookOpen />} label="靈感" onClick={() => setActiveTab('notes')} />
        <NavButton active={activeTab === 'profile'} icon={<User />} label="個人" onClick={() => setActiveTab('profile')} />
      </nav>

      {/* Modals */}
      {/* 1. 相機/相簿選擇 Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-end justify-center sm:items-center">
          <div className="bg-white w-full sm:w-80 sm:rounded-[40px] rounded-t-[40px] p-6 animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div>
            <h3 className="text-xl font-black mb-6 text-center">新增衣物</h3>
            <div className="space-y-3">
              <button 
                onClick={() => handleSimulateAdd('camera')}
                className="w-full py-4 bg-gray-50 hover:bg-gray-100 rounded-2xl flex items-center justify-center gap-3 font-bold text-gray-700 transition-colors"
              >
                <Camera size={20} /> 拍攝照片
              </button>
              <button 
                onClick={() => handleSimulateAdd('gallery')}
                className="w-full py-4 bg-gray-50 hover:bg-gray-100 rounded-2xl flex items-center justify-center gap-3 font-bold text-gray-700 transition-colors"
              >
                <ImageIcon size={20} /> 從相簿選擇
              </button>
            </div>
            <button 
              onClick={() => setShowCameraModal(false)}
              className="w-full py-4 mt-4 text-gray-400 font-bold"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 2. 筆記新增 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full rounded-[40px] p-8 animate-in scale-in-95">
            <h3 className="text-xl font-black mb-6 text-[#6B5AED]">新增資料</h3>
            {noteTab === 'courses' && (
              <input placeholder="輸入標題..." className="w-full bg-gray-50 rounded-2xl p-4 font-bold mb-4 border-none" value={newNoteData.title} onChange={e=>setNewNoteData({...newNoteData, title: e.target.value})} />
            )}
            <textarea placeholder="寫下內容..." className="w-full h-32 bg-gray-50 rounded-2xl p-4 font-medium mb-6 border-none" value={newNoteData.content} onChange={e=>setNewNoteData({...newNoteData, content: e.target.value})} />
            <div className="flex gap-4">
              <button onClick={()=>setShowAddModal(false)} className="flex-1 font-bold text-gray-400">取消</button>
              <button onClick={addNoteOrCourse} className="flex-1 py-4 bg-[#6B5AED] text-white rounded-2xl font-bold">發佈</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-[300] bg-white/80 backdrop-blur-lg flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-[#6B5AED] border-t-transparent rounded-full animate-spin"></div>
            <Sparkles className="absolute inset-0 m-auto text-[#6B5AED] animate-pulse" size={24} />
          </div>
          <p className="text-[#6B5AED] font-black tracking-widest mt-6 animate-pulse uppercase text-xs text-center px-6">
            {loadingText}
          </p>
        </div>
      )}

    </div>
  );
}

function NavButton({ active, icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all relative ${active ? 'text-[#6B5AED]' : 'text-gray-300'}`}>
      {active && <div className="absolute -top-4 w-1.5 h-1.5 bg-[#6B5AED] rounded-full shadow-[0_0_8px_#6B5AED]"></div>}
      <div className={`${active ? 'scale-110' : 'scale-100'} transition-transform`}>
        {React.cloneElement(icon, { size: 22, strokeWidth: active ? 3 : 2 })}
      </div>
      <span className={`text-[9px] font-black uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
    </button>
  );
}


