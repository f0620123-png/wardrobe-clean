import React, { useState, useEffect } from "react"

/*
資料結構
closet = [
 { id,name,category,color,image }
]

timeline = [
 { date,outfit:[ids],satisfaction }
]
*/

const STORAGE_CLOSET = "wardrobe_closet"
const STORAGE_TIMELINE = "wardrobe_timeline"

export default function App() {

  const [closet,setCloset] = useState([])
  const [timeline,setTimeline] = useState([])

  const [selected,setSelected] = useState([])
  const [sortMode,setSortMode] = useState("recommend")

  const [quickMode,setQuickMode] = useState(true)

  const [draft,setDraft] = useState({
    name:"",
    category:"",
    color:"",
    image:""
  })

  const today = new Date().toISOString().slice(0,10)

  /* ---------------- load data ---------------- */

  useEffect(()=>{
    const c = JSON.parse(localStorage.getItem(STORAGE_CLOSET)||"[]")
    const t = JSON.parse(localStorage.getItem(STORAGE_TIMELINE)||"[]")
    setCloset(c)
    setTimeline(t)
  },[])

  const saveCloset=(data)=>{
    setCloset(data)
    localStorage.setItem(STORAGE_CLOSET,JSON.stringify(data))
  }

  const saveTimeline=(data)=>{
    setTimeline(data)
    localStorage.setItem(STORAGE_TIMELINE,JSON.stringify(data))
  }

  /* ---------------- 最近穿過 ---------------- */

  const recentWornIds = ()=>{
    const last3 = timeline.slice(-3)
    const ids = new Set()

    last3.forEach(t=>{
      t.outfit.forEach(i=>ids.add(i))
    })

    return ids
  }

  /* ---------------- 智能排序 ---------------- */

  const sortedCandidates = ()=>{
    const recent = recentWornIds()

    const base = [...closet]

    if(sortMode==="safe"){
      return base.sort((a,b)=>a.category.localeCompare(b.category))
    }

    if(sortMode==="style"){
      return base.sort(()=>Math.random()-0.5)
    }

    return base.sort((a,b)=>{
      const aRecent = recent.has(a.id)
      const bRecent = recent.has(b.id)
      if(aRecent && !bRecent) return 1
      if(!aRecent && bRecent) return -1
      return 0
    })
  }

  /* ---------------- 新增衣物 ---------------- */

  const addItem=()=>{
    if(!draft.name) return

    const item={
      ...draft,
      id:Date.now().toString()
    }

    saveCloset([...closet,item])

    setDraft({
      name:"",
      category:"",
      color:"",
      image:""
    })
  }

  /* ---------------- 選擇搭配 ---------------- */

  const toggleSelect=(id)=>{
    if(selected.includes(id)){
      setSelected(selected.filter(i=>i!==id))
    }else{
      setSelected([...selected,id])
    }
  }

  /* ---------------- 今天穿這套 ---------------- */

  const wearToday=()=>{
    if(selected.length===0) return

    const record={
      date:today,
      outfit:selected,
      satisfaction:null
    }

    const newTimeline=[...timeline,record]

    saveTimeline(newTimeline)

    setSelected([])
  }

  /* ---------------- 滿意度 ---------------- */

  const rateSatisfaction=(index,value)=>{
    const copy=[...timeline]
    copy[index].satisfaction=value
    saveTimeline(copy)
  }

  /* ---------------- 今日卡片 ---------------- */

  const todayRecord = timeline.find(t=>t.date===today)

  return (
    <div style={{padding:20,fontFamily:"Arial"}}>

      <h1>電子衣櫥</h1>

      {/* 今日穿搭首頁卡 */}
      <div style={{
        border:"1px solid #ccc",
        padding:15,
        marginBottom:20,
        borderRadius:8
      }}>

        <h2>今日穿搭</h2>

        {todayRecord?(
          <div>
            <p>今天已紀錄穿搭</p>

            <div>
              {todayRecord.outfit.map(id=>{
                const item=closet.find(c=>c.id===id)
                if(!item) return null
                return <span key={id} style={{marginRight:10}}>{item.name}</span>
              })}
            </div>

          </div>
        ):(
          <p>今天還沒有穿搭紀錄</p>
        )}

      </div>


      {/* 新增衣物 */}

      <div style={{border:"1px solid #ddd",padding:15,marginBottom:20}}>

        <h2>新增衣物</h2>

        <button onClick={()=>setQuickMode(!quickMode)}>
          模式：{quickMode?"快速":"完整"}
        </button>

        <div>

          <input
            placeholder="名稱"
            value={draft.name}
            onChange={e=>setDraft({...draft,name:e.target.value})}
          />

          <input
            placeholder="類別"
            value={draft.category}
            onChange={e=>setDraft({...draft,category:e.target.value})}
          />

          <input
            placeholder="顏色"
            value={draft.color}
            onChange={e=>setDraft({...draft,color:e.target.value})}
          />

          {!quickMode && (
            <input
              placeholder="圖片URL"
              value={draft.image}
              onChange={e=>setDraft({...draft,image:e.target.value})}
            />
          )}

        </div>

        <button onClick={addItem}>新增</button>

      </div>

      {/* 候選排序 */}

      <div>

        <h2>衣櫥</h2>

        <div style={{marginBottom:10}}>
          排序：

          <button onClick={()=>setSortMode("recommend")}>最推薦</button>
          <button onClick={()=>setSortMode("safe")}>最安全</button>
          <button onClick={()=>setSortMode("style")}>最有造型</button>
        </div>

        {sortedCandidates().map(item=>{

          const recent = recentWornIds().has(item.id)

          return(
            <div
              key={item.id}
              style={{
                border:"1px solid #eee",
                padding:10,
                marginBottom:5
              }}
            >

              <label>

                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={()=>toggleSelect(item.id)}
                />

                {item.name} ({item.category})

                {recent && (
                  <span style={{color:"red",marginLeft:10}}>
                    最近穿過
                  </span>
                )}

              </label>

            </div>
          )
        })}

        <button onClick={wearToday}>
          今天穿這套
        </button>

      </div>


      {/* 時間軸 */}

      <div style={{marginTop:30}}>

        <h2>穿搭紀錄</h2>

        {timeline.map((t,i)=>(
          <div key={i} style={{border:"1px solid #ccc",padding:10,marginBottom:10}}>

            <div>{t.date}</div>

            <div>
              {t.outfit.map(id=>{
                const item=closet.find(c=>c.id===id)
                if(!item) return null
                return <span key={id} style={{marginRight:10}}>{item.name}</span>
              })}
            </div>

            <div>

              滿意度：

              <button onClick={()=>rateSatisfaction(i,"good")}>滿意</button>
              <button onClick={()=>rateSatisfaction(i,"ok")}>普通</button>
              <button onClick={()=>rateSatisfaction(i,"bad")}>不滿意</button>

            </div>

          </div>
        ))}

      </div>

    </div>
  )
}