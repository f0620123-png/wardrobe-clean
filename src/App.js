import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, Heart, Calendar, User, Map, ArrowRightLeft, 
  AlertTriangle, Camera, PlusCircle
} from 'lucide-react';

const apiKey = ""; 

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];

// --- 初始單品數據庫 ---
const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北', desc: '挺括修身，職場必備。' },
  { id: 't2', name: '灰色衛衣', category: '上衣', style: '休閒', tempRange: '10-20°C', image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400', location: '新竹', desc: '舒適親膚，居家外出皆宜。' },
  { id: 'b1', name: '直筒牛仔褲', category: '下著', style: '美式', tempRange: '10-28°C', image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400', location: '台北', desc: '經典丹寧，修飾腿型。' },
  { id: 'o1', name: '長版風衣', category: '外套', style: '文青', tempRange: '15-22°C', image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400', location: '台北', desc: '防風防潑水，春秋首選。' },
  { id: 's1', name: '小白鞋', category: '鞋子', style: '極簡', tempRange: '10-35°C', image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400', location: '台北', desc: '百搭神鞋，好走耐穿。' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('closet'); 
  
  // 初始化衣櫥：從 LocalStorage 讀取
  const [clothes, setClothes] = useState(() => {
    const saved = localStorage.getItem('my_clothes_v7');
    return saved ? JSON.parse(saved) : INITIAL_CLOTHES;
  });

  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]); 
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [tryOnImage, setTryOnImage] = useState(null);

  // 地點與用戶狀態
  const [currentViewLocation, setCurrentViewLocation] = useState('全部'); 
  const [userLocation, setUserLocation] = useState('台北'); 
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('my_favorites_v7');
    return saved ? JSON.parse(saved) : [];
  });
  const [calendarHistory, setCalendarHistory] = useState(() => {
    const saved = localStorage.getItem('my_calendar_v7');
    return saved ? JSON.parse(saved) : {};
  });
  const [userProfile, setUserProfile] = useState({ height: 175, weight: 70, bodyType: 'H型' });
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // 筆記狀態
  const [noteTab, setNoteTab] = useState('notes'); 
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('my_notes_v7');
    return saved ? JSON.parse(saved) : [{ id: 1, type: 'notes', content: '我不喜歡綠色配紫色。', date: '2024-05-20' }];
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNoteData, setNewNoteData] = useState({ title: '', content: '' });
  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });

  // 監聽儲存
  useEffect(() => { localStorage.setItem('my_clothes_v7', JSON.stringify(clothes)); }, [clothes]);
  useEffect(() => { localStorage.setItem('my_favorites_v7', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('my_notes_v7', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('my_calendar_v7', JSON.stringify(calendarHistory)); }, [calendarHistory]);

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
    if (window.confirm('確定要刪除這件單品嗎？')) {
      setClothes(prev => prev.filter(item => item.id !== id));
      setSelectedItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const moveLocation = (id, newLoc) => {
    setClothes(prev => prev.map(c => c.id === id ? { ...c, location: newLoc } : c));
  };

  // AI 新增單品邏輯
  const handleAddWithAI = () => {
    setIsGenerating(true);
    setLoadingText('AI 正在識別圖像內容...');
    setTimeout(() => {
      setLoadingText('分析完成！生成描述中...');
      setTimeout(() => {
        const newItem = {
          id: Date.now().toString(),
          name: `AI 智能分析新衣 ${clothes.length + 1}`,
          category: selectedCategory,
          style: '休閒',
          tempRange: '20-25°C',
          image: `https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=400&auto=format&fit=crop&q=60`,
          location: userLocation,
          desc: '由 AI 自動生成的單品敘述：這件單品材質柔軟，色澤飽滿，適合春季日常穿搭。'
        };
        setClothes([newItem, ...clothes]);
        setIsGenerating(false);
        alert(`已成功新增：${newItem.name}`);
      }, 1500);
    }, 1500);
  };

  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setLoadingText(`AI 正在掃描 ${userLocation} 的衣櫃...`);
    setAiResult(null);
    setTryOnImage(null);

    const accessibleClothes = clothes.filter(c => c.location === userLocation);
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
      
      <header className="px-6 pt-12 pb-4 shrink-0 bg-[#FFFBF7] z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-black text-indigo-900">衣櫥日記 <span className="text-sm text-red-500 font-bold bg-red-100 px-2 rounded-full">V7.1</span></h1>
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
                  <div key={item.id} className="bg-white rounded-[32px] p-2 shadow-sm border border-orange-50 group relative animate-in zoom-in-95 duration-300">
                    <div className="aspect-[4/5] rounded-[28px] overflow-hidden relative">
                      <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[9px] font-bold text-white flex items-center gap-1">
                        <MapPin size={8} /> {item.location}
                      </div>
                      
                      {/* 修復：強制顯示刪除按鈕，點擊不會誤觸圖片 */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                        className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg z-30 active:scale-90"
                      >
                        <Trash2 size={14} />
                      </button>

                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleSelectItem(item); }}
                        className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all z-20 active:scale-90
                          ${selectedItems.find(i=>i.id===item.id) ? 'bg-[#6B5AED] text-white border-[#6B5AED]' : 'bg-black/20 text-white border-white/60'}`}
                      >
                        <Check size={16} strokeWidth={4} />
                      </button>

                      <button 
                        onClick={(e) => { e.stopPropagation(); moveLocation(item.id, item.location === '台北' ? '新竹' : '台北'); }}
                        className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm text-gray-600 flex items-center justify-center shadow-sm z-20 active:scale-90"
                      >
                        <ArrowRightLeft size={14} />
                      </button>
                    </div>
                    <div className="p-3 pt-3">
                      <h3 className="text-[13px] font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                      <p className="text-[10px] text-gray-400 mt-0.5 mb-1">{item.style} · {item.tempRange}</p>
                      {item.desc && (
                        <div className="bg-gray-50 rounded-xl p-2 mt-1">
                          <p className="text-[9px] text-gray-500 leading-relaxed line-clamp-2">{item.desc}</p>
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
                <button onClick={handleAddWithAI} className="mt-4 text-[#6B5AED] text-xs font-bold flex items-center gap-1 border border-[#6B5AED] px-4 py-2 rounded-full">
                   <PlusCircle size={14}/> 點我 AI 新增
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- 其他分頁保持簡潔邏輯 --- */}
        {activeTab === 'outfit' && (
           <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
             <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
               <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Sparkles className="text-indigo-400" /> AI 定位造型</h2>
               <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-xl mb-4">
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">My Location:</span>
                  <select value={userLocation} onChange={e => setUserLocation(e.target.value)} className="bg-transparent text-[10px] font-black text-indigo-700 focus:outline-none">
                    {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                  </select>
               </div>
               <button 
                 onClick={autoPickOutfit} 
                 disabled={isGenerating} 
                 className="w-full py-5 bg-[#6B5AED] text-white rounded-[24px] font-bold shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2"
               >
                 {isGenerating ? "AI 運算中..." : "AI 自動抓取搭配"}
               </button>
             </div>
             {aiResult && <div className="bg-indigo-50/50 p-6 rounded-[32px]"><p className="text-sm text-indigo-900 whitespace-pre-wrap">{aiResult}</p></div>}
             {tryOnImage && <img src={tryOnImage} className="w-full h-auto rounded-[32px] shadow-lg" alt="AI result" />}
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
                   {note.title && <h4 className="font-bold mb-2">{note.title}</h4>}
                   <p className="text-sm text-gray-600">{note.content}</p>
                   <button onClick={() => setNotes(notes.filter(n=>n.id!==note.id))} className="absolute top-4 right-4 text-gray-300"><Trash2 size={16}/></button>
                 </div>
               ))}
             </div>
           </div>
        )}

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
        <button onClick={handleAddWithAI} className="w-14 h-14 bg-[#4A443F] text-white rounded-[24px] shadow-xl flex items-center justify-center active:scale-90 transition-all -mt-8 border-4 border-[#FFFBF7]">
          <Plus size={28} />
        </button>
        <NavButton active={activeTab === 'notes'} icon={<BookOpen />} label="靈感" onClick={() => setActiveTab('notes')} />
        <NavButton active={activeTab === 'profile'} icon={<User />} label="個人" onClick={() => setActiveTab('profile')} />
      </nav>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full rounded-[40px] p-8">
             <h3 className="text-xl font-bold mb-4">新增內容</h3>
             {noteTab === 'courses' && <input className="w-full bg-gray-50 p-4 rounded-xl mb-4" value={newNoteData.title} onChange={e=>setNewNoteData({...newNoteData, title:e.target.value})} placeholder="標題" />}
             <textarea className="w-full bg-gray-50 p-4 rounded-xl mb-4" value={newNoteData.content} onChange={e=>setNewNoteData({...newNoteData, content:e.target.value})} placeholder="內容..." />
             <div className="flex gap-4">
               <button onClick={()=>setShowAddModal(false)} className="flex-1 py-3 text-gray-400">取消</button>
               <button onClick={addNoteOrCourse} className="flex-1 py-3 bg-indigo-500 text-white rounded-xl">儲存</button>
             </div>
          </div>
        </div>
      )}

      {/* AI Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-[300] bg-white/80 backdrop-blur-lg flex flex-col items-center justify-center">
          <div className="relative mb-6">
            <div className="w-24 h-24 border-4 border-[#6B5AED] border-t-transparent rounded-full animate-spin"></div>
            <Camera className="absolute inset-0 m-auto text-[#6B5AED] animate-pulse" size={32} />
          </div>
          <h3 className="text-xl font-black text-[#4A443F] mb-2">AI 智能分析中</h3>
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


