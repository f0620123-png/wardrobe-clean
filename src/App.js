import React, { useState, useMemo } from 'react';
import { 
  Plus, X, Check, Trash2, Shirt, Sparkles, BookOpen, Wand2, 
  MapPin, PlusCircle, RefreshCw, Heart, Calendar,
  User, Ruler, Map, ArrowRightLeft, AlertTriangle
} from 'lucide-react';

const apiKey = ""; // 請在 Vercel 環境變數設定或填入

// --- 常數定義 ---
const CATEGORIES = ['上衣', '下著', '內搭', '外套', '背心', '鞋子', '帽子', '飾品', '包包'];
const OCCASIONS = ['日常', '上班', '約會', '運動', '度假', '正式場合', '派對'];
const STYLES = ['極簡', '韓系', '日系', '美式', '街頭', '復古', '文青', '休閒', '商務', '運動', '戶外'];
const BODY_TYPES = ['H型', '倒三角形', '梨形', '沙漏型', '圓形(O型)'];
const LOCATIONS = ['台北', '新竹'];

// --- 初始單品數據庫 ---
const INITIAL_CLOTHES = [
  { id: 't1', name: '白牛津襯衫', category: '上衣', style: '商務', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c717678?w=400', location: '台北' },
  { id: 't2', name: '灰色衛衣', category: '上衣', style: '休閒', tempRange: '10-20°C', image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400', location: '新竹' },
  { id: 't3', name: '黑絲絨襯衫', category: '上衣', style: '復古', tempRange: '15-22°C', image: 'https://images.unsplash.com/photo-1603252109303-2751441dd15e?w=400', location: '台北' },
  { id: 't4', name: '亞麻條紋衫', category: '上衣', style: '日系', tempRange: '22-30°C', image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400', location: '新竹' },
  { id: 't5', name: '街頭印花T', category: '上衣', style: '街頭', tempRange: '20-30°C', image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400', location: '台北' },
  { id: 'b1', name: '直筒牛仔褲', category: '下著', style: '美式', tempRange: '10-28°C', image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400', location: '台北' },
  { id: 'b2', name: '黑色西裝褲', category: '下著', style: '商務', tempRange: '10-25°C', image: 'https://images.unsplash.com/photo-1594932224030-940955d21022?w=400', location: '新竹' },
  { id: 'b3', name: '軍綠工裝褲', category: '下著', style: '戶外', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400', location: '台北' },
  { id: 'b4', name: '百褶長裙', category: '下著', style: '韓系', tempRange: '15-25°C', image: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400', location: '新竹' },
  { id: 'b5', name: '卡其短褲', category: '下著', style: '休閒', tempRange: '25-35°C', image: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=400', location: '台北' },
  { id: 'i1', name: '白色背心', category: '內搭', style: '極簡', tempRange: '25-35°C', image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=200', location: '新竹' },
  { id: 'i2', name: '發熱高領', category: '內搭', style: '極簡', tempRange: '5-15°C', image: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200', location: '台北' },
  { id: 'o1', name: '長版風衣', category: '外套', style: '文青', tempRange: '15-22°C', image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400', location: '台北' },
  { id: 's1', name: '小白鞋', category: '鞋子', style: '極簡', tempRange: '10-35°C', image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400', location: '台北' },
  { id: 'p1', name: '帆布包', category: '包包', style: '日系', tempRange: 'N/A', image: 'https://images.unsplash.com/photo-1544816153-12ad5d7133a1?w=400', location: '新竹' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('closet'); 
  const [clothes, setClothes] = useState(INITIAL_CLOTHES);
  const [selectedCategory, setSelectedCategory] = useState('上衣');
  const [selectedItems, setSelectedItems] = useState([]); 
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [tryOnImage, setTryOnImage] = useState(null);

  // --- 地點系統狀態 ---
  const [currentViewLocation, setCurrentViewLocation] = useState('全部'); 
  const [userLocation, setUserLocation] = useState('台北'); 

  // --- 狀態 ---
  const [favorites, setFavorites] = useState([]);
  const [calendarHistory, setCalendarHistory] = useState({});
  const [userProfile, setUserProfile] = useState({ height: 175, weight: 70, bodyType: 'H型' });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [noteTab, setNoteTab] = useState('notes'); 
  const [notes, setNotes] = useState([
    { id: 1, type: 'notes', content: '我不喜歡綠色配紫色。', date: '2024-05-20' },
  ]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNoteData, setNewNoteData] = useState({ title: '', content: '' });
  const [outfitConfig, setOutfitConfig] = useState({ occasion: '日常', style: '極簡' });

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

  const moveLocation = (id, newLoc) => {
    setClothes(prev => prev.map(c => c.id === id ? { ...c, location: newLoc } : c));
  };

  const autoPickOutfit = async () => {
    setIsGenerating(true);
    setAiResult(null);
    setTryOnImage(null);

    const accessibleClothes = clothes.filter(c => c.location === userLocation);
    
    const prompt = `身為專業造型師，用戶目前在：${userLocation}。
    身材資料：${userProfile.height}cm/${userProfile.weight}kg/${userProfile.bodyType}。
    場合：${outfitConfig.occasion}，風格：${outfitConfig.style}。
    從衣櫃清單中挑選組合（僅限${userLocation}）：${JSON.stringify(accessibleClothes.map(c => ({id:c.id, name:c.name, cat:c.category, style:c.style})))}。
    請回傳 JSON: {"selectedIds": [], "reason": "針對地點與體型修飾的建議", "tips": "造型小撇步"}`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
      const data = await res.json();
      const result = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
      const picked = clothes.filter(c => result.selectedIds.includes(c.id));
      setSelectedItems(picked);
      setAiResult(`${result.reason}\n\n📍 目前地點：${userLocation}\n💡 小撇步：${result.tips}`);
      
      const imgPrompt = `Full body fashion model wearing ${picked.map(p=>p.name).join(', ')}. High resolution fashion photography.`;
      const imgRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: { prompt: imgPrompt }, parameters: { sampleCount: 1 } })
      });
      const imgData = await imgRes.json();
      if (imgData.predictions?.[0]?.bytesBase64Encoded) {
        setTryOnImage(`data:image/png;base64,${imgData.predictions[0].bytesBase64Encoded}`);
      }
    } catch (e) {
      setAiResult("自動搭配失敗，請檢查網路。");
    } finally {
      setIsGenerating(false);
    }
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
      
      <header className="px-6 pt-12 pb-4 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-black">衣櫥日記 V6.0</h1>
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
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[9px] font-bold text-white flex items-center gap-1">
                        <MapPin size={8} /> {item.location}
                      </div>
                      <button 
                        onClick={() => toggleSelectItem(item)} 
                        className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedItems.find(i=>i.id===item.id) ? 'bg-[#6B5AED] text-white border-[#6B5AED]' : 'bg-black/10 text-white border-white/40'}`}
                      >
                        <Check size={16} strokeWidth={4} />
                      </button>
                      <button 
                        onClick={() => moveLocation(item.id, item.location === '台北' ? '新竹' : '台北')}
                        className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm text-gray-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ArrowRightLeft size={14} />
                      </button>
                    </div>
                    <div className="p-2 pt-3">
                      <h3 className="text-[13px] font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                      <p className="text-[10px] text-gray-400 mt-0.5">{item.style} · {item.location}</p>
                    </div>
                  </div>
                ))}
            </div>
            {clothes.filter(c => c.category === selectedCategory && (currentViewLocation === '全部' || c.location === currentViewLocation)).length === 0 && (
              <div className="py-20 text-center text-gray-300">
                <Shirt size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-sm font-bold">此地點暫無該類別單品</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'outfit' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><Sparkles className="text-indigo-400" /> AI 定位造型</h2>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-xl">
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">My Location:</span>
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
                {isGenerating ? "AI 定位掃描中..." : <><RefreshCw size={20}/> 抓取 {userLocation} 的最佳搭配</>}
              </button>
            </div>

            {hasLocationConflict && (
              <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-[24px] flex items-center gap-3 animate-pulse">
                <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                <p className="text-[11px] font-bold text-amber-800 leading-tight">
                  提醒：選中的單品跨越了「台北」與「新竹」，出門前請確認單品位置！
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

            {(tryOnImage || aiResult) && (
              <div className="space-y-4">
                {tryOnImage && (
                  <div className="bg-white p-2 rounded-[32px] shadow-sm relative overflow-hidden">
                    <img src={tryOnImage} className="w-full h-auto rounded-[28px]" alt="Virtual Try-On" />
                    <div className="absolute bottom-6 right-6 flex gap-2">
                      <button onClick={() => setFavorites([{id: Date.now(), image: tryOnImage, style: outfitConfig.style, occasion: outfitConfig.occasion}, ...favorites])} className="bg-white/90 backdrop-blur-md p-3 rounded-2xl text-red-500 shadow-xl"><Heart size={20} /></button>
                      <button onClick={() => setCalendarHistory({...calendarHistory, [new Date().toISOString().split('T')[0]]: {items: [...selectedItems], image: tryOnImage}})} className="bg-[#6B5AED] p-3 rounded-2xl text-white shadow-xl"><Calendar size={20} /></button>
                    </div>
                  </div>
                )}
                {aiResult && (
                  <div className="bg-indigo-50/50 p-6 rounded-[32px] border border-indigo-100">
                    <p className="text-sm leading-relaxed text-indigo-900 whitespace-pre-wrap font-medium">{aiResult}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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

        {activeTab === 'profile' && (
          <div className="animate-in fade-in space-y-6">
            <section className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50 text-center">
              <div className="w-24 h-24 bg-indigo-50 rounded-full mx-auto mb-4 flex items-center justify-center text-indigo-500">
                <User size={48} />
              </div>
              <h2 className="text-2xl font-black">穿搭探險家</h2>
              <p className="text-xs text-gray-400 font-bold mt-1">LV. 18 · 已紀錄 {Object.keys(calendarHistory).length} 次穿搭</p>
            </section>

            <section className="bg-white rounded-[32px] p-6 shadow-sm border border-orange-50">
              <h3 className="text-sm font-black text-gray-400 mb-4 flex items-center gap-2"><Calendar size={16}/> 穿搭日曆紀錄</h3>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({length: 31}).map((_, i) => {
                  const day = `2024-05-${String(i+1).padStart(2, '0')}`;
                  const hasRecord = calendarHistory[day];
                  return (
                    <div key={i} className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-bold ${hasRecord ? 'bg-[#6B5AED] text-white shadow-md' : 'bg-gray-50 text-gray-300'}`}>
                      {i+1}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-2xl border-t border-gray-100 flex justify-around items-center px-6 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50">
        <NavButton active={activeTab === 'closet'} icon={<Shirt />} label="衣櫥" onClick={() => setActiveTab('closet')} />
        <NavButton active={activeTab === 'outfit'} icon={<Wand2 />} label="自選" onClick={() => setActiveTab('outfit')} />
        <div className="w-14 h-14 bg-[#4A443F] text-white rounded-[24px] shadow-xl flex items-center justify-center active:scale-90 transition-all -mt-8 border-4 border-[#FFFBF7]">
          <Plus size={28} />
        </div>
        <NavButton active={activeTab === 'notes'} icon={<BookOpen />} label="靈感" onClick={() => setActiveTab('notes')} />
        <NavButton active={activeTab === 'profile'} icon={<User />} label="個人" onClick={() => setActiveTab('profile')} />
      </nav>

      {showProfileModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full rounded-[40px] p-8 animate-in scale-in-95">
            <h3 className="text-xl font-black mb-6 flex items-center gap-2 text-[#6B5AED]"><Ruler className="text-indigo-500" /> 用戶資料設定</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 px-2 uppercase tracking-widest">Height (cm)</label>
                  <input type="number" value={userProfile.height} onChange={e=>setUserProfile({...userProfile, height:e.target.value})} className="w-full bg-gray-50 rounded-2xl p-4 font-bold border-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 px-2 uppercase tracking-widest">Weight (kg)</label>
                  <input type="number" value={userProfile.weight} onChange={e=>setUserProfile({...userProfile, weight:e.target.value})} className="w-full bg-gray-50 rounded-2xl p-4 font-bold border-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 px-2 uppercase tracking-widest">Body Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {BODY_TYPES.map(bt => (
                    <button key={bt} onClick={()=>setUserProfile({...userProfile, bodyType:bt})} className={`py-3 rounded-xl text-[10px] font-bold border-2 transition-all ${userProfile.bodyType===bt ? 'bg-[#6B5AED] text-white border-[#6B5AED] shadow-lg shadow-indigo-100' : 'bg-gray-50 border-transparent text-gray-400'}`}>
                      {bt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={()=>setShowProfileModal(false)} className="w-full mt-8 py-5 bg-[#4A443F] text-white rounded-2xl font-bold shadow-xl shadow-gray-200 active:scale-95 transition-all">儲存並返回</button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full rounded-[40px] p-8 animate-in scale-in-95">
            <h3 className="text-xl font-black mb-6 text-[#6B5AED]">新增{noteTab === 'notes' ? '穿搭筆記' : '推薦教材'}</h3>
            {noteTab === 'courses' && (
              <input placeholder="輸入標題..." className="w-full bg-gray-50 rounded-2xl p-4 font-bold mb-4 border-none" value={newNoteData.title} onChange={e=>setNewNoteData({...newNoteData, title: e.target.value})} />
            )}
            <textarea placeholder="寫下內容..." className="w-full h-32 bg-gray-50 rounded-2xl p-4 font-medium mb-6 border-none" value={newNoteData.content} onChange={e=>setNewNoteData({...newNoteData, content: e.target.value})} />
            <div className="flex gap-4">
              <button onClick={()=>setShowAddModal(false)} className="flex-1 font-bold text-gray-400">取消</button>
              <button onClick={addNoteOrCourse} className="flex-1 py-4 bg-[#6B5AED] text-white rounded-2xl font-bold shadow-lg shadow-indigo-100">立即發佈</button>
            </div>
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="fixed inset-0 z-[300] bg-white/70 backdrop-blur-lg flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-[#6B5AED] border-t-transparent rounded-full animate-spin"></div>
            <MapPin className="absolute inset-0 m-auto text-[#6B5AED] animate-bounce" size={24} />
          </div>
          <p className="text-[#6B5AED] font-black tracking-[0.2em] mt-6 animate-pulse uppercase text-xs">AI Detecting Clothes in {userLocation}...</p>
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