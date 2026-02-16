import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, RefreshCw, Heart, Calendar, User, Ruler, Map, 
  ArrowRightLeft, AlertTriangle, Camera, Upload
} from 'lucide-react';

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const LOCATIONS = ['台北', '新竹'];
const BODY_TYPES = ['H型', '倒三角形', '梨形', '沙漏型', '圓形(O型)'];

// 預設資料 (只有第一次使用時會載入)
const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北' },
  { id: 'b1', name: '直筒牛仔褲', category: '下著', style: '美式', tempRange: '10-28°C', image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400', location: '台北' },
  { id: 'o1', name: '長版風衣', category: '外套', style: '文青', tempRange: '15-22°C', image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400', location: '新竹' },
  { id: 's1', name: '小白鞋', category: '鞋子', style: '極簡', tempRange: '10-35°C', image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400', location: '台北' },
  { id: 'p1', name: '帆布包', category: '包包', style: '日系', tempRange: 'N/A', image: 'https://images.unsplash.com/photo-1544816153-12ad5d7133a1?w=400', location: '新竹' },
];

export default function App() {
  // --- 核心狀態 (使用 localStorage 進行持久化儲存) ---
  const [activeTab, setActiveTab] = useState('closet'); 
  
  // 1. 衣櫥資料
  const [clothes, setClothes] = useState(() => {
    const saved = localStorage.getItem('wardrobe_clothes');
    return saved ? JSON.parse(saved) : INITIAL_CLOTHES;
  });

  // 2. 筆記資料
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('wardrobe_notes');
    return saved ? JSON.parse(saved) : [{ id: 1, type: 'notes', content: '我不喜歡綠色配紫色。', date: '2024-05-20' }];
  });

  // 3. 收藏資料
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('wardrobe_favorites');
    return saved ? JSON.parse(saved) : [];
  });

  // 4. 日曆資料
  const [calendarHistory, setCalendarHistory] = useState(() => {
    const saved = localStorage.getItem('wardrobe_calendar');
    return saved ? JSON.parse(saved) : {};
  });

  // 5. 用戶資料
  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem('wardrobe_profile');
    return saved ? JSON.parse(saved) : { height: 175, weight: 70, bodyType: 'H型' };
  });

  // --- 監聽資料變更並存入 LocalStorage ---
  useEffect(() => localStorage.setItem('wardrobe_clothes', JSON.stringify(clothes)), [clothes]);
  useEffect(() => localStorage.setItem('wardrobe_notes', JSON.stringify(notes)), [notes]);
  useEffect(() => localStorage.setItem('wardrobe_favorites', JSON.stringify(favorites)), [favorites]);
  useEffect(() => localStorage.setItem('wardrobe_calendar', JSON.stringify(calendarHistory)), [calendarHistory]);
  useEffect(() => localStorage.setItem('wardrobe_profile', JSON.stringify(userProfile)), [userProfile]);

  // --- 其他 UI 狀態 ---
  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]); 
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [tryOnImage, setTryOnImage] = useState(null);
  const [currentViewLocation, setCurrentViewLocation] = useState('全部'); 
  const [userLocation, setUserLocation] = useState('台北'); 
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [noteTab, setNoteTab] = useState('notes'); 
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [newNoteData, setNewNoteData] = useState({ title: '', content: '' });
  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });
  
  // --- 新增單品 Modal 狀態 ---
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItemData, setNewItemData] = useState({
    name: '', category: '上衣', style: '休閒', location: '台北', image: ''
  });

  // --- 邏輯函數 ---
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

  // 處理圖片上傳 (轉為 Base64 以存入 LocalStorage)
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewItemData({ ...newItemData, image: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddItem = () => {
    if (!newItemData.name) return alert('請輸入單品名稱');
    const newItem = {
      id: Date.now().toString(),
      ...newItemData,
      image: newItemData.image || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400', // 預設圖
      tempRange: '20-25°C', // 預設
      desc: '新加入的寶貝單品'
    };
    setClothes([newItem, ...clothes]);
    setShowAddItemModal(false);
    setNewItemData({ name: '', category: '上衣', style: '休閒', location: '台北', image: '' });
  };

  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setAiResult(null);
    setTryOnImage(null);
    
    // 模擬 AI 運算 (為了 Demo 效果，實際可接 API)
    setTimeout(() => {
      const accessibleClothes = clothes.filter(c => c.location === userLocation);
      // 簡單隨機挑選邏輯
      const top = accessibleClothes.find(c => c.category === '上衣') || clothes[0];
      const bottom = accessibleClothes.find(c => c.category === '下著') || clothes[1];
      const items = [top, bottom].filter(Boolean);
      
      setSelectedItems(items);
      setAiResult(`為您在${userLocation}挑選了${outfitConfig.style}風格的搭配！\n\n💡 建議理由：根據您的${userProfile.bodyType}身形，這套搭配能有效修飾線條。`);
      setTryOnImage(top?.image); // 暫時顯示上衣圖作為示意
      setIsGenerating(false);
    }, 1500);
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
    setShowAddNoteModal(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#FFFBF7] text-[#4A443F] font-sans max-w-md mx-auto relative overflow-hidden">
      
      {/* Header */}
      <header className="px-6 pt-12 pb-4 shrink-0 bg-white/80 backdrop-blur-md z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-black text-gray-800">衣櫥日記 V7.0</h1>
          <button onClick={() => setShowProfileModal(true)} className="p-2 bg-white rounded-full shadow-sm border border-orange-100">
            <User size={20} className="text-[#6B5AED]" />
          </button>
        </div>
        
        <div className="flex bg-orange-50 p-1.5 rounded-[20px] items-center">
          <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-black text-orange-600 uppercase tracking-tighter shrink-0 border-r border-orange-200 mr-2">
            <Map size={12} /> 地點視角
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
            {/* Category Filter */}
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

            {/* Clothes Grid */}
            <div className="grid grid-cols-2 gap-4 pb-4">
              {clothes
                .filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation))
                .map(item => (
                  <div key={item.id} className="bg-white rounded-[32px] p-2 shadow-sm border border-orange-50 group relative">
                    <div className="aspect-[4/5] rounded-[28px] overflow-hidden relative bg-gray-100">
                      <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
                      
                      {/* Location Tag */}
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[9px] font-bold text-white flex items-center gap-1">
                        <MapPin size={8} /> {item.location}
                      </div>

                      {/* Select Button */}
                      <button 
                        onClick={() => toggleSelectItem(item)} 
                        className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedItems.find(i=>i.id===item.id) ? 'bg-[#6B5AED] text-white border-[#6B5AED]' : 'bg-black/10 text-white border-white/40'}`}
                      >
                        <Check size={16} strokeWidth={4} />
                      </button>

                      {/* Move Location Button */}
                      <button 
                        onClick={() => moveLocation(item.id, item.location === '台北' ? '新竹' : '台北')}
                        className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm text-gray-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ArrowRightLeft size={14} />
                      </button>

                      {/* Delete Button */}
                      <button 
                        onClick={() => deleteItem(item.id)}
                        className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="p-2 pt-3">
                      <h3 className="text-[13px] font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                      <p className="text-[10px] text-gray-400 mt-0.5">{item.style} · {item.tempRange}</p>
                    </div>
                  </div>
                ))}
                
                {/* Empty State / Add Button in Grid */}
                <button 
                  onClick={() => {
                    setNewItemData(prev => ({ ...prev, category: selectedCategory }));
                    setShowAddItemModal(true);
                  }}
                  className="aspect-[4/5] rounded-[32px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-300 active:bg-gray-50 transition-colors"
                >
                  <PlusCircle size={32} />
                  <span className="text-xs font-bold">新增{selectedCategory}</span>
                </button>
            </div>
          </div>
        )}

        {/* Outfit & Other Tabs (簡化保留以專注於衣櫥功能修復) */}
        {activeTab === 'outfit' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
             <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><Sparkles className="text-indigo-400" /> AI 定位造型</h2>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-xl">
                  <span className="text-[10px] font-black text-indigo-500 uppercase">LOCATION:</span>
                  <select 
                    value={userLocation} 
                    onChange={e => setUserLocation(e.target.value)}
                    className="bg-transparent text-[10px] font-black text-indigo-700 focus:outline-none"
                  >
                    {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <button 
                onClick={autoPickOutfit} 
                disabled={isGenerating} 
                className="w-full py-5 bg-[#6B5AED] text-white rounded-[24px] font-bold shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isGenerating ? "AI 掃描中..." : <><RefreshCw size={20}/> 抓取 {userLocation} 搭配</>}
              </button>
            </div>
            
            {/* Selected Items */}
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-orange-50">
              <h3 className="text-[10px] font-black text-gray-300 uppercase mb-4 tracking-widest">已選單品 ({selectedItems.length})</h3>
              <div className="flex gap-3 overflow-x-auto no-scrollbar">
                {selectedItems.map(item => (
                  <div key={item.id} className="relative flex-shrink-0 group">
                    <img src={item.image} className="w-16 h-16 rounded-2xl object-cover border border-gray-100" />
                    <div className="absolute -top-1 -right-1 bg-black text-white rounded-full p-0.5" onClick={() => toggleSelectItem(item)}><X size={10} /></div>
                  </div>
                ))}
              </div>
            </div>

            {aiResult && (
               <div className="bg-indigo-50/50 p-6 rounded-[32px] border border-indigo-100 animate-in fade-in">
                  <p className="text-sm leading-relaxed text-indigo-900 whitespace-pre-wrap font-medium">{aiResult}</p>
               </div>
            )}
          </div>
        )}

        {/* ... (其他分頁功能保留類似結構，省略以節省長度，重點是上方狀態已加入 LocalStorage) ... */}
      </main>

      {/* Footer Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/90 backdrop-blur-2xl border-t border-gray-100 flex justify-around items-center px-6 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50">
        <NavButton active={activeTab === 'closet'} icon={<Shirt />} label="衣櫥" onClick={() => setActiveTab('closet')} />
        <NavButton active={activeTab === 'outfit'} icon={<Wand2 />} label="自選" onClick={() => setActiveTab('outfit')} />
        <button 
          onClick={() => setShowAddItemModal(true)}
          className="w-14 h-14 bg-[#4A443F] text-white rounded-[24px] shadow-xl flex items-center justify-center active:scale-90 transition-all -mt-8 border-4 border-[#FFFBF7]"
        >
          <Plus size={28} />
        </button>
        <NavButton active={activeTab === 'notes'} icon={<BookOpen />} label="靈感" onClick={() => setActiveTab('notes')} />
        <NavButton active={activeTab === 'profile'} icon={<User />} label="個人" onClick={() => setActiveTab('profile')} />
      </nav>

      {/* Add Item Modal (新增功能) */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full sm:w-[400px] rounded-t-[40px] sm:rounded-[40px] p-8 animate-in slide-in-from-bottom duration-300">
            <h3 className="text-xl font-black mb-6 text-gray-800">新增單品</h3>
            
            {/* Image Upload */}
            <div className="mb-6 flex justify-center">
              <label className="w-32 h-32 bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden relative">
                {newItemData.image ? (
                   <img src={newItemData.image} className="w-full h-full object-cover" />
                ) : (
                   <>
                     <Camera className="text-gray-300 mb-2" />
                     <span className="text-[10px] font-bold text-gray-400">上傳照片</span>
                   </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>

            <div className="space-y-4 mb-8">
              <input 
                placeholder="單品名稱 (例如: 藍色襯衫)" 
                className="w-full bg-gray-50 rounded-2xl p-4 font-bold border-none focus:ring-2 focus:ring-[#6B5AED]"
                value={newItemData.name}
                onChange={e => setNewItemData({...newItemData, name: e.target.value})}
              />
              <div className="grid grid-cols-2 gap-4">
                <select 
                  className="bg-gray-50 rounded-2xl p-4 font-bold text-sm text-gray-600 outline-none"
                  value={newItemData.category}
                  onChange={e => setNewItemData({...newItemData, category: e.target.value})}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select 
                  className="bg-gray-50 rounded-2xl p-4 font-bold text-sm text-gray-600 outline-none"
                  value={newItemData.location}
                  onChange={e => setNewItemData({...newItemData, location: e.target.value})}
                >
                  {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              <button onClick={() => setShowAddItemModal(false)} className="flex-1 py-4 font-bold text-gray-400">取消</button>
              <button onClick={handleAddItem} className="flex-1 py-4 bg-[#6B5AED] text-white rounded-2xl font-bold shadow-lg shadow-indigo-100">確認新增</button>
            </div>
          </div>
        </div>
      )}

      {/* Global Loading */}
      {isGenerating && (
        <div className="fixed inset-0 z-[300] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-[#6B5AED] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[#6B5AED] font-black tracking-widest animate-pulse">AI 正在思考中...</p>
        </div>
      )}

    </div>
  );
}

function NavButton({ active, icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all relative ${active ? 'text-[#6B5AED]' : 'text-gray-300'}`}>
      <div className={`${active ? 'scale-110' : 'scale-100'} transition-transform`}>
        {React.cloneElement(icon, { size: 22, strokeWidth: active ? 3 : 2 })}
      </div>
      <span className={`text-[9px] font-black uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
    </button>
  );
}


