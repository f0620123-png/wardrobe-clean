export const config = {
  runtime: "nodejs",
  api: { bodyParser: { sizeLimit: "10mb" } }
};

function safeJsonParse(text){
  if(!text) return null;
  const cleaned = String(text).replace(/```json|```/g,"").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if(s>=0 && e>s){
    const mid = cleaned.slice(s, e+1);
    try{ return JSON.parse(mid); }catch{}
  }
  try{ return JSON.parse(cleaned); }catch{}
  return null;
}

async function fetchJson(url, options){
  const r = await fetch(url, options);
  const text = await r.text();
  let j = null;
  try{ j = JSON.parse(text); }catch{ j = { raw:text }; }
  if(!r.ok || j?.error){
    const msg = j?.error?.message || j?.error || `HTTP ${r.status}`;
    const e = new Error(msg);
    e.status = r.status;
    e.data = j;
    throw e;
  }
  return j;
}

async function listModels(apiKey){
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson(url, { method:"GET" });
  const models = Array.isArray(data?.models) ? data.models : [];
  return models.map(m=>({
    name: m?.name || "",
    supportedGenerationMethods: Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : []
  }));
}

function pickFallbackChain(models){
  const usable = models.filter(m=>m.name && m.supportedGenerationMethods.includes("generateContent")).map(m=>m.name);
  const prefer = [
    "models/gemini-1.5-flash",
    "models/gemini-1.5-pro",
    "models/gemini-1.0-pro"
  ];
  const chain = [];
  for(const p of prefer){
    const found = usable.find(n=>n===p);
    if(found) chain.push(found);
  }
  for(const n of usable){
    if(!chain.includes(n)) chain.push(n);
  }
  return chain;
}

async function generateContent({apiKey, modelName, parts, temperature=0.2}){
  const modelPath = modelName.startsWith("models/") ? modelName : `models/${modelName}`;
  const url = `https://generativelanguage.googleapis.com/v1/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role:"user", parts }],
    generationConfig: { temperature }
  };
  const data = await fetchJson(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("") || "";
  return { data, text };
}

function visionPrompt(){
  return `你是服裝與穿搭領域的視覺分析助手。你必須只輸出 JSON（不得有任何多餘文字）。
請從「單一衣物照片」推斷並輸出下列欄位：
{
  "name": string,
  "category": "上衣"|"下著"|"鞋子"|"外套"|"包包"|"配件"|"內著"|"運動"|"正式",
  "style": "極簡"|"日系"|"韓系"|"街頭"|"商務"|"復古"|"戶外"|"運動"|"正式",
  "material": string,
  "fit": "寬鬆"|"合身"|"修身"|"短版"|"長版"|"直筒"|"窄版"|"不確定",
  "thickness": 1|2|3|4|5,
  "temp": { "min": number, "max": number },
  "colors": {
    "dominant": { "name": string, "hex": string },
    "secondary": { "name": string, "hex": string },
    "tone": "冷"|"暖"|"中性",
    "saturation": "低"|"中"|"高",
    "brightness": "低"|"中"|"高"
  },
  "notes": string,
  "confidence": number
}
規則：
- 必須是合法 JSON
- hex 必須 "#RRGGBB"
- temp.min < temp.max，且範圍 -5 到 40`.trim();
}

function stylistPrompt({ occasion, style, location, profile, closet }){
  return `你是「AI 造型師」。請只輸出 JSON（不得有多餘文字）。
任務：根據場合與風格，從衣櫥中挑出最適合的一套穿搭（至少：上衣 + 下著 + 鞋子；必要時可加外套/配件）。
限制：只能從 closet 清單挑選（使用 id）。
請參考 profile（身高/體重/身型）與單品溫度範圍（若有 temp）。

輸入：
occasion: ${occasion}
style: ${style}
location: ${location}
profile: ${JSON.stringify(profile)}
closet: ${JSON.stringify(closet)}

輸出 JSON：
{
  "outfit": {
    "topId": string|null,
    "bottomId": string|null,
    "shoeId": string|null,
    "outerId": string|null,
    "accessoryIds": string[]
  },
  "why": string[],
  "tips": string[],
  "confidence": number
}`.trim();
}

export default async function handler(req, res){
  try{
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if(req.method==="OPTIONS") return res.status(200).end();
    if(req.method!=="POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

    const apiKey = process.env.GEMINI_API_KEY;
    if(!apiKey) return res.status(500).json({ ok:false, error:"Missing GEMINI_API_KEY" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const task = body?.task || "vision";

    const models = await listModels(apiKey);
    const chain = pickFallbackChain(models);
    if(chain.length===0) return res.status(500).json({ ok:false, error:"No model supports generateContent for this API key." });

    const attempt = async (parts, temperature) => {
      let last = null;
      for(const m of chain){
        try{
          const out = await generateContent({ apiKey, modelName:m, parts, temperature });
          return { ok:true, model:m, text: out.text, raw: out.data };
        }catch(e){
          last = e;
        }
      }
      throw last || new Error("All models failed");
    };

    if(task==="vision"){
      const imageDataUrl = body?.imageDataUrl;
      if(!imageDataUrl || typeof imageDataUrl!=="string" || !imageDataUrl.startsWith("data:image/")){
        return res.status(400).json({ ok:false, error:"task=vision requires imageDataUrl (data:image/...)" });
      }
      const comma = imageDataUrl.indexOf(",");
      const meta = imageDataUrl.slice(0, comma);
      const base64 = imageDataUrl.slice(comma+1);
      const mime = (meta.match(/^data:(image\/[^;]+);base64$/)||[])[1] || "image/jpeg";

      const parts = [
        { text: visionPrompt() },
        { inlineData: { mimeType: mime, data: base64 } }
      ];

      const out = await attempt(parts, 0.2);
      const parsed = safeJsonParse(out.text);
      if(!parsed){
        return res.status(200).json({ ok:false, task, model: out.model, error:"JSON_PARSE_FAILED", rawText: out.text });
      }
      return res.status(200).json({ ok:true, task, model: out.model, result: parsed });
    }

    if(task==="stylist"){
      const occasion = body?.occasion || "日常";
      const style = body?.style || "極簡";
      const location = body?.location || "台北";
      const profile = body?.profile || { height:175, weight:70, shape:"H型" };
      const closet = Array.isArray(body?.closet) ? body.closet : [];

      const parts = [{ text: stylistPrompt({ occasion, style, location, profile, closet }) }];
      const out = await attempt(parts, 0.3);
      const parsed = safeJsonParse(out.text);
      if(!parsed){
        return res.status(200).json({ ok:false, task, model: out.model, error:"JSON_PARSE_FAILED", rawText: out.text });
      }
      return res.status(200).json({ ok:true, task, model: out.model, result: parsed });
    }

    const prompt = body?.prompt;
    if(!prompt) return res.status(400).json({ ok:false, error:"Missing prompt" });
    const out = await attempt([{ text: String(prompt) }], 0.4);
    return res.status(200).json({ ok:true, task:"text", model: out.model, text: out.text });
  }catch(e){
    return res.status(500).json({ ok:false, error: String(e.message||e) });
  }
}
