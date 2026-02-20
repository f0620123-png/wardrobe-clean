// 使用最新的模型清單
const CHAIN_FLASH = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b"
];

const CHAIN_PRO = [
  "gemini-2.0-pro",
  "gemini-2.0-flash",
  "gemini-1.5-pro"
];


// ✨ 終極暴力測試：直接把金鑰寫死在這裡！
function getCleanKey() {
  // 👇👇👇 請把下面引號裡面的中文字，替換成你真正的 API Key 👇👇👇
  // ⚠️ 注意：一定要保留前後的雙引號 " " 喔！
  return "AIzaSyD_QoMOBsFdWuIsidPzEiq6keSXbZTcSTQ"; 
}

function isTempError(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

async function callGenerate(model, body) {
  const KEY = getCleanKey(); // 每次呼叫時都拿這把寫死的金鑰
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* ignore */ }

  if (!r.ok) {
    const msg = j?.error?.message || text || `HTTP ${r.status}`;
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }

  const out = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  if (!out) {
    throw new Error("API 回傳成功，但沒有內容 (可能被 Google 安全過濾器阻擋)");
  }
  return out;
}

async function callWithFallback(models, body) {
  const errorLogs = []; 

  let lastErr = null;
  for (const m of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return { model: m, text: await callGenerate(m, body) };
      } catch (e) {
        const status = e.status || "Unknown";
        const errMsg = e.message || "無錯誤訊息";
        
        errorLogs.push(`[${m}] 錯誤代碼 ${status}: ${errMsg}`);
        lastErr = e;

        if (status === 404 || status === 400 || status === 403) {
          break; 
        }
        
        if (isTempError(status)) {
          await new Promise(r => setTimeout(r, 350 * attempt));
          continue; 
        }

        break;
      }
    }
  }
  
  throw new Error("AI 分析失敗。詳細日誌: " + errorLogs.join(" | "));
}

function safeJsonParse(s) {
  try {
    const trimmed = (s || "").trim();
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const candidate = trimmed.slice(first, last + 1);
      return JSON.parse(candidate);
    }
    return JSON.parse(trimmed);
  } catch (e) {
    return {}; 
  }
}

function clamp(n, a, b) {
  const x = Number(n);
  if (Number.isNaN(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function mergeVision(a, b) {
  const aThick = typeof a.thickness === 'number' ? a.thickness : 3;
  const bThick = typeof b.thickness === 'number' ? b.thickness : 3;
  const thickness = Math.round((clamp(aThick, 1, 5) + clamp(bThick, 1, 5)) / 2);
  
  const aMin = typeof a.temp?.min === 'number' ? a.temp.min : 10;
  const bMin = typeof b.temp?.min === 'number' ? b.temp.min : 10;
  const aMax = typeof a.temp?.max === 'number' ? a.temp.max : 25;
  const bMax = typeof b.temp?.max === 'number' ? b.temp.max : 25;
  const tmin = Math.round((clamp(aMin, -5, 40) + clamp(bMin, -5, 40)) / 2);
  const tmax = Math.round((clamp(aMax, -5, 40) + clamp(bMax, -5, 40)) / 2);

  const conf = clamp(((Number(a.confidence) || 0.6) + (Number(b.confidence) || 0.6)) / 2 + 0.08, 0, 1);

  return {
    name: a.name || b.name || "未命名單品",
    category: a.category || b.category || "上衣",
    style: a.style || b.style || "極簡",
    material: a.material || b.material || "未知",
    fit: a.fit || b.fit || "一般",
    thickness,
    temp: { min: Math.min(tmin, tmax), max: Math.max(tmin, tmax) },
    colors: a.colors || b.colors || { dominant: "#888888", secondary: "#CCCCCC" },
    notes: a.notes || b.notes || "",
    confidence: conf
  };
}

export default async function handler(req, res) {
  try {
    const KEY = getCleanKey();
    if (!KEY || KEY === "請在這裡貼上你的完整金鑰") {
      return res.status(400).json({ error: "你忘記把金鑰貼進程式碼裡囉！" });
    }

    const { task } = req.body || {};

    if (task === "vision") {
      const { imageDataUrl } = req.body;
      if (!imageDataUrl || !imageDataUrl.includes(",")) {
        return res.status(400).json({ error: "Missing imageDataUrl" });
      }

      const mimeMatch = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const base64 = imageDataUrl.split(",")[1];

      const prompt = `
你是衣物視覺辨識助手。請只輸出 JSON（不要加任何說明文字）。
欄位格式固定如下：
{
 "name": string,
 "category": "上衣"|"下著"|"鞋子"|"外套"|"包包"|"配件"|"內著"|"運動"|"正式",
 "style": string,
 "material": string,
 "fit": string,
 "thickness": 1..5,
 "temp": {"min": -5..40, "max": -5..40},
 "colors": {"dominant": "#RRGGBB", "secondary":"#RRGGBB"},
 "notes": string,
 "confidence": 0..1
}
要求：
- thickness 1=很薄 5=很厚
- temp 為建議穿著溫度區間
- colors 請用最接近的 hex
`;

      const body = {
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType, data: base64 } }
            ]
          }
        ]
      };

      const flash = await callWithFallback(CHAIN_FLASH, body);
      const pro = await callWithFallback(CHAIN_PRO, body);

      const a = safeJsonParse(flash.text);
      const b = safeJsonParse(pro.text);

      const merged = mergeVision(a, b);

      return res.status(200).json({
        ...merged,
        _meta: { models: [flash.model, pro.model], mode: "dual_consensus" }
      });
    }

    if (task === "stylist") {
      const { closet, profile, location, occasion, style, styleMemory, tempC } = req.body;
      const prompt = `你是 AI 穿搭造型師。請只輸出 JSON。
輸入資料: ${JSON.stringify({ closet, profile, location, occasion, style, styleMemory, tempC })}
輸出格式: {"outfit":{"topId":string|null,"bottomId":string|null,"outerId":string|null,"shoeId":string|null,"accessoryIds":string[]},"why":string[],"tips":string[],"confidence":0..1,"styleName":string}
優先使用符合 location 的衣物，配合溫度。`;

      const body = { contents: [{ parts: [{ text: prompt }] }] };
      const out = await callWithFallback(CHAIN_FLASH, body);
      return res.status(200).json({ ...safeJsonParse(out.text), _meta: { model: out.model } });
    }

    if (task === "mixExplain") {
      const { selectedItems, profile, styleMemory, tempC, occasion } = req.body;
      const prompt = `你是穿搭顧問。請只輸出 JSON。
輸入資料: ${JSON.stringify({ selectedItems, profile, styleMemory, tempC, occasion })}
輸出格式: {"summary":string,"compatibility":0..1,"goodPoints":string[],"risks":string[],"suggestedAdds":[{"slot":"上衣|下著|外套|鞋子|配件","hint":string}],"styleName":string,"tips":string[]}`;

      const body = { contents: [{ parts: [{ text: prompt }] }] };
      const out = await callWithFallback(CHAIN_PRO, body);
      return res.status(200).json({ ...safeJsonParse(out.text), _meta: { model: out.model } });
    }

    if (task === "noteSummarize") {
      const { text, imageDataUrl } = req.body;
      const parts = [{ text: "你是教學整理助手。請只輸出 JSON: {\"title\":string,\"bullets\":string[],\"do\":string[],\"dont\":string[],\"tags\":string[]}" }];
      if (text) parts.push({ text: `TEXT:\n${text}` });
      if (imageDataUrl && imageDataUrl.includes(",")) {
         const mimeMatch = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/);
         parts.push({ inlineData: { mimeType: mimeMatch ? mimeMatch[1] : "image/jpeg", data: imageDataUrl.split(",")[1] } });
      }
      const body = { contents: [{ parts }] };
      const out = await callWithFallback(CHAIN_FLASH, body);
      return res.status(200).json({ ...safeJsonParse(out.text), _meta: { model: out.model } });
    }

    return res.status(400).json({ error: "Unknown task" });
  } catch (e) {
    const status = e?.status || 500;
    return res.status(status).json({ error: e?.message || "AI error", status });
  }
}
