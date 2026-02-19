import React, { useEffect, useMemo, useRef, useState } from "react";
import { aiStylist, aiVision } from "./lib/ai";
import { compressImageToDataUrl } from "./lib/image";
import { addItem, addNote, addOutfit, loadDb, moveItem, removeItem, removeNote, removeOutfit, resetDb, saveDb, uid } from "./lib/storage";

const APP_VERSION = "v16.0";
const LOCATIONS = ["全部", "台北", "新竹"];
const CATEGORIES = ["全部","上衣","下著","鞋子","外套","包包","配件","內著","運動","正式"];
const STYLES = ["極簡","日系","韓系","街頭","商務","復古","戶外","運動","正式"];
const OCCASIONS = ["日常","上班","約會","旅行","運動","正式場合"];

export default function App(){
  const [tab, setTab] = useState("衣櫥");
  const [db, setDb] = useState(loadDb());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [versionInfo, setVersionInfo] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const fileRef = useRef(null);

  const filters = db.settings || {location:"全部", category:"全部"};

  const filteredItems = useMemo(()=>{
    return db.items.filter(it=>{
      const locOk = filters.location==="全部" || it.location===filters.location;
      const catOk = filters.category==="全部" || it.category===filters.category;
      return locOk && catOk;
    });
  }, [db.items, filters]);

  useEffect(()=>{ refreshVersion(false); }, []);

  function setSettings(patch){
    const next = {...db, settings:{...db.settings, ...patch}};
    setDb(saveDb(next));
  }

  async function refreshVersion(hard){
    try{
      const res = await fetch(`/api/version?ts=${Date.now()}`, { cache:"no-store" });
      const info = await res.json();
      setVersionInfo(info);
      if(hard){
        if("caches" in window){
          const keys = await caches.keys();
          await Promise.all(keys.map(k=>caches.delete(k)));
        }
        window.location.reload();
      }
    }catch(e){
      setVersionInfo({ error: String(e.message||e) });
    }
  }

  function notify(msg){
    setToast(msg);
    setTimeout(()=>setToast(null), 2200);
  }

  async function onAddByPhoto(file){
    setBusy(true);
    try{
      const imageDataUrl = await compressImageToDataUrl(file, { maxW: 1280, quality: 0.72 });
      const vision = await aiVision({ imageDataUrl });

      if(!vision?.ok) throw new Error(vision?.error || "AI 回傳格式錯誤");

      const r = vision.result || {};
      const item = {
        id: uid("it"),
        name: r.name || "未命名衣物",
        category: r.category || "上衣",
        style: r.style || "極簡",
        material: r.material || "不確定",
        fit: r.fit || "不確定",
        thickness: r.thickness || 3,
        tempMin: r.temp?.min ?? 18,
        tempMax: r.temp?.max ?? 30,
        colors: r.colors || null,
        location: filters.location === "全部" ? "台北" : filters.location,
        imageDataUrl,
        createdAt: Date.now()
      };

      const next = addItem(structuredClone(db), item);
      next.lastAi = {...next.lastAi, vision: vision};
      setDb(next);
      notify("已新增並完成 AI 視覺分析");
      setTab("衣櫥");
    }catch(e){
      notify(`AI 分析失敗：${e.message}`);
    }finally{
      setBusy(false);
    }
  }

  async function onAiStylist(){
    setBusy(true);
    try{
      const location = filters.location === "全部" ? "台北" : filters.location;
      const closet = db.items
        .filter(it => location==="全部" ? true : it.location===location)
        .map(it => ({
          id: it.id,
          name: it.name,
          category: it.category,
          style: it.style,
          temp: { min: it.tempMin, max: it.tempMax }
        }));

      const payload = {
        occasion: db.lastAi?.stylist?.occasion || "日常",
        style: db.lastAi?.stylist?.style || "極簡",
        location,
        profile: db.profile,
        closet
      };

      const out = await aiStylist(payload);
      if(!out?.ok) throw new Error(out?.error || "AI 回傳格式錯誤");

      const r = out.result || {};
      const ids = [r.outfit?.topId, r.outfit?.bottomId, r.outfit?.shoeId, r.outfit?.outerId, ...(r.outfit?.accessoryIds||[])]
        .filter(Boolean);

      const outfit = {
        id: uid("of"),
        name: `${payload.occasion}｜${payload.style}`,
        occasion: payload.occasion,
        style: payload.style,
        location,
        itemIds: ids,
        why: r.why || [],
        tips: r.tips || [],
        createdAt: Date.now()
      };

      const next = addOutfit(structuredClone(db), outfit);
      next.lastAi = {...next.lastAi, stylist: { ...payload, raw: out }};
      setDb(next);
      notify("已產生穿搭並收藏");
      setTab("造型");
    }catch(e){
      notify(`AI 搭配失敗：${e.message}`);
    }finally{
      setBusy(false);
    }
  }

  function toggleSelect(id){
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  }

  function onMoveSelected(to){
    const nextDb = structuredClone(db);
    selectedIds.forEach(id=>moveItem(nextDb, id, to));
    setDb(saveDb(nextDb));
    notify(`已搬移 ${selectedIds.length} 件到 ${to}`);
    setSelectedIds([]);
  }

  function onDeleteSelected(){
    const nextDb = structuredClone(db);
    selectedIds.forEach(id=>removeItem(nextDb, id));
    setDb(saveDb(nextDb));
    notify(`已刪除 ${selectedIds.length} 件`);
    setSelectedIds([]);
  }

  function exportText(){
    const blob = new Blob([JSON.stringify(db, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wardrobe-clean-v16-db-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importDb(e){
    const f = e.target.files?.[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{
      try{
        const obj = JSON.parse(String(r.result));
        if(!obj || !obj.schema) throw new Error("格式錯誤");
        setDb(saveDb(obj));
        notify("已匯入 DB");
      }catch(err){
        notify(`匯入失敗：${err.message}`);
      }
    };
    r.readAsText(f);
    e.target.value = "";
  }

  return (
    <div className="container">
      <div className="header">
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div className="title">Wardrobe Clean</div>
          <span className="badge">{APP_VERSION}</span>
        </div>
        <div className="small">
          {versionInfo?.commit ? <>commit: {String(versionInfo.commit).slice(0,7)}</> : <>version endpoint: {versionInfo?.error ? "ERR" : "OK"}</>}
        </div>
      </div>

      <div className="card" style={{padding:12, marginBottom:12}}>
        <div className="row" style={{alignItems:"center", justifyContent:"space-between"}}>
          <div className="chips">
            {LOCATIONS.map(loc=>(
              <button key={loc} className={"chip "+(filters.location===loc?"on":"")} onClick={()=>setSettings({location:loc})}>
                {loc}
              </button>
            ))}
          </div>
          <div className="chips">
            {CATEGORIES.slice(0,9).map(cat=>(
              <button key={cat} className={"chip "+(filters.category===cat?"on":"")} onClick={()=>setSettings({category:cat})}>
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="small" style={{marginTop:10}}>
          目前視圖：{filters.location}　分類：{filters.category}　已選：{selectedIds.length}
        </div>
      </div>

      {tab==="衣櫥" && (
        <div className="card">
          <h3>衣櫥管理</h3>
          <div className="row" style={{marginBottom:10}}>
            <button className="btn" onClick={()=>fileRef.current?.click()} disabled={busy}>上傳衣物照 + AI 分析</button>
            <button className="btn" onClick={()=>setSelectedIds([])} disabled={selectedIds.length===0}>清除勾選</button>
            <button className="btn" onClick={()=>onMoveSelected("台北")} disabled={selectedIds.length===0}>搬到台北</button>
            <button className="btn" onClick={()=>onMoveSelected("新竹")} disabled={selectedIds.length===0}>搬到新竹</button>
            <button className="btn danger" onClick={onDeleteSelected} disabled={selectedIds.length===0}>刪除選取</button>
          </div>

          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
                 onChange={(e)=>{ const f=e.target.files?.[0]; if(f) onAddByPhoto(f); e.target.value=""; }} />

          {filteredItems.length===0 ? (
            <p>目前分類沒有單品。按下「上傳衣物照」開始建立衣櫥。</p>
          ) : (
            <div className="grid">
              {filteredItems.map(it=>(
                <div key={it.id} className="item" onClick={()=>toggleSelect(it.id)} role="button" style={{cursor:"pointer"}}>
                  <img alt={it.name} src={it.imageDataUrl}/>
                  <div className="meta">
                    <div className="name">{selectedIds.includes(it.id) ? "✅ " : ""}{it.name}</div>
                    <div className="sub">
                      <span className="pill loc">{it.location}</span>
                      <span className="pill cat">{it.category}</span>
                      <span className="pill temp">{it.tempMin}~{it.tempMax}°C</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab==="造型" && (
        <div className="card">
          <h3>AI 造型建議</h3>
          <div className="row" style={{alignItems:"center"}}>
            <select value={db.lastAi?.stylist?.occasion || "日常"}
              onChange={(e)=>{ const next={...db, lastAi:{...db.lastAi, stylist:{...(db.lastAi?.stylist||{}), occasion:e.target.value}}}; setDb(saveDb(next)); }}>
              {OCCASIONS.map(x=><option key={x} value={x}>{x}</option>)}
            </select>
            <select value={db.lastAi?.stylist?.style || "極簡"}
              onChange={(e)=>{ const next={...db, lastAi:{...db.lastAi, stylist:{...(db.lastAi?.stylist||{}), style:e.target.value}}}; setDb(saveDb(next)); }}>
              {STYLES.map(x=><option key={x} value={x}>{x}</option>)}
            </select>
            <button className="btn primary" onClick={onAiStylist} disabled={busy}>開始自動搭配</button>
          </div>

          <hr/>

          {db.outfits.length===0 ? <p>尚無收藏。點「開始自動搭配」會自動挑選並收藏。</p> : (
            <div className="row">
              {db.outfits.map(of=>(
                <div key={of.id} className="card" style={{width:"100%", borderRadius:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                    <div>
                      <div style={{fontWeight:900}}>{of.name}</div>
                      <div className="small">{of.location} · {new Date(of.createdAt).toLocaleString()}</div>
                    </div>
                    <button className="btn danger" onClick={()=>{ const next = removeOutfit(structuredClone(db), of.id); setDb(next); }}>刪除</button>
                  </div>
                  <div className="small" style={{marginTop:10}}>選中單品：{of.itemIds.length} 件</div>
                  {of.why?.length>0 && (<p><b>理由：</b>{of.why.join(" / ")}</p>)}
                  {of.tips?.length>0 && (<p><b>小撇步：</b>{of.tips.join(" / ")}</p>)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab==="靈感" && (
        <NotesCard db={db} setDb={setDb} notify={notify}/>
      )}

      {tab==="個人" && (
        <ProfileCard db={db} setDb={setDb} versionInfo={versionInfo} refreshVersion={refreshVersion} exportText={exportText} importDb={importDb} />
      )}

      <div className="footerbar">
        <div className="inner">
          <div className="tabs">
            {["衣櫥","造型","靈感","個人"].map(t=>(
              <button key={t} className={"tab "+(tab===t?"on":"")} onClick={()=>setTab(t)}>{t}</button>
            ))}
          </div>
          <button className="fab" onClick={()=>fileRef.current?.click()} title="新增">+</button>
        </div>
      </div>

      {toast && (
        <div style={{position:"fixed",left:12,right:12,bottom:84,display:"flex",justifyContent:"center",pointerEvents:"none"}}>
          <div style={{background:"#111",color:"#fff",padding:"12px 14px",borderRadius:14,fontWeight:900,maxWidth:680,opacity:.95}}>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function NotesCard({db,setDb,notify}){
  const [mode,setMode] = useState("inspiration");
  const list = db.notes?.[mode] || [];
  const [title,setTitle] = useState("");
  const [content,setContent] = useState("");

  function add(){
    if(!title.trim() && !content.trim()) return;
    const note = { id: uid("nt"), title: title.trim()||"未命名", content: content.trim(), createdAt: Date.now() };
    const next = addNote(structuredClone(db), mode, note);
    setDb(next);
    setTitle(""); setContent("");
    notify("已新增筆記");
  }

  function del(id){
    const next = removeNote(structuredClone(db), mode, id);
    setDb(next);
  }

  return (
    <div className="card">
      <h3>筆記</h3>
      <div className="row" style={{alignItems:"center"}}>
        <button className={"chip "+(mode==="inspiration"?"on":"")} onClick={()=>setMode("inspiration")}>靈感筆記</button>
        <button className={"chip "+(mode==="lessons"?"on":"")} onClick={()=>setMode("lessons")}>教材</button>
      </div>
      <div className="row" style={{marginTop:10}}>
        <input className="input" placeholder="標題" value={title} onChange={(e)=>setTitle(e.target.value)} />
        <input className="input" placeholder="內容（可簡短）" style={{flex:1,minWidth:220}} value={content} onChange={(e)=>setContent(e.target.value)} />
        <button className="btn primary" onClick={add}>新增</button>
      </div>
      <hr/>
      {list.length===0 ? <p>目前沒有筆記。</p> : (
        <div className="row">
          {list.map(n=>(
            <div key={n.id} className="card" style={{width:"100%", borderRadius:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                <div>
                  <div style={{fontWeight:900}}>{n.title}</div>
                  <div className="small">{new Date(n.createdAt).toLocaleString()}</div>
                </div>
                <button className="btn danger" onClick={()=>del(n.id)}>刪除</button>
              </div>
              <p style={{whiteSpace:"pre-wrap"}}>{n.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileCard({db,setDb,versionInfo,refreshVersion,exportText,importDb}){
  const p = db.profile || {height:175, weight:70, shape:"H型"};
  const shapes = ["H型","倒三角形","梨形","沙漏型","圓形(O型)"];

  function setProfile(patch){
    const next = {...db, profile:{...db.profile, ...patch}};
    setDb(saveDb(next));
  }

  return (
    <div className="card">
      <h3>個人與版本</h3>

      <div className="row">
        <div>
          <div className="small">身高 (cm)</div>
          <input className="input" value={p.height} onChange={(e)=>setProfile({height: Number(e.target.value||0)})} />
        </div>
        <div>
          <div className="small">體重 (kg)</div>
          <input className="input" value={p.weight} onChange={(e)=>setProfile({weight: Number(e.target.value||0)})} />
        </div>
      </div>

      <div style={{marginTop:10}}>
        <div className="small">身型</div>
        <div className="chips" style={{marginTop:6}}>
          {shapes.map(s=>(
            <button key={s} className={"chip "+(p.shape===s?"on":"")} onClick={()=>setProfile({shape:s})}>{s}</button>
          ))}
        </div>
      </div>

      <hr/>
      <h3 style={{marginTop:0}}>版本 / 更新驗證（B 方案）</h3>
      <div className="row">
        <button className="btn" onClick={()=>refreshVersion(false)}>重新讀取版本（不重整）</button>
        <button className="btn danger" onClick={()=>refreshVersion(true)}>強制更新到最新（重整）</button>
        <button className="btn" onClick={()=>window.open("/api/version","_blank")}>直接開 /api/version</button>
      </div>

      <div style={{marginTop:10}}>
        {versionInfo ? <pre>{JSON.stringify(versionInfo, null, 2)}</pre> : <p>尚未讀取。</p>}
      </div>

      <hr/>
      <h3 style={{marginTop:0}}>Outfit DB</h3>
      <div className="row">
        <button className="btn" onClick={exportText}>匯出 DB</button>
        <label className="btn" style={{cursor:"pointer"}}>
          匯入 DB
          <input type="file" accept="application/json" onChange={importDb} style={{display:"none"}}/>
        </label>
        <button className="btn danger" onClick={()=>{ const next = resetDb(); setDb(next); }}>重置 DB</button>
      </div>

      <p className="small" style={{marginTop:10}}>
        「是最新」判斷：重新部署後，只要 commit 或 deploymentId 有變，就是新版本。
      </p>
    </div>
  );
}
