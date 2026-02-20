// 根據你的截圖，對準 Gemini 3 系列最新預覽版模型
const CHAIN_FLASH = [
  "gemini-3.0-flash-preview", // 優先嘗試最新的 Flash
  "gemini-3.1-pro-preview",
  "gemini-1.5-flash"          // 保底
];

const CHAIN_PRO = [
  "gemini-3.1-pro-preview",   // 你截圖中的第一個
  "gemini-3.0-pro-preview",   // 你截圖中的第二個
  "gemini-1.5-pro"
];

// ✨ 金鑰輸入區
function getCleanKey() {
  // 👇 請在下方第 18 行的雙引號內，貼上你的 AIzaSy... 金鑰
  return "AIzaSyD_QoMOBsFdWuIsidPzEiq6keSXbZTcSTQ"; 
}

// --- 以下為 API 核心邏輯 ---

async function callGenerate(model, body) {
  const KEY = getCleanKey();
  // 使用 v1beta 通道，這是預覽版模型最穩定的對接方式
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

  const out = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!out) throw new Error("API 成功但無內容，可能觸發了安全過濾器");
  return out;
}

async function callWithFallback(models, body) {
  const errorLogs = [];
  for (const m of models) {
    try {
      return { model: m, text: await callGenerate(m, body) };
    } catch (e) {
      errorLogs.push(`[${m}]: ${e.message}`);
      if (e.status === 400 || e.status === 404) continue; 
      break; 
    }
  }
  throw new Error("AI 分析失敗。日誌: " + errorLogs.join(" | "));
}

function safeJsonParse(s) {
  try {
    const trimmed = (s || "").trim();
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    return JSON.parse(trimmed);
  } catch (e) { return {}; }
}

// --- Vercel Serverless Function 入口 ---

export default async function handler(req, res) {
  try {
    const KEY = getCleanKey();
    if (!KEY || KEY.includes("貼在這裡")) {
      return res.status(400).json({ error: "請先在程式碼第 18 行填入金鑰" });
    }

    const { task, imageDataUrl } = req.body;

    // 視覺辨識任務
    if (task === "vision") {
      if (!imageDataUrl) return res.status(400).json({ error: "Missing image" });
      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";

      const prompt = `你是衣物辨識助手。請只輸出 JSON:
{
 "name": string, "category": "上衣"|"下著"|"鞋子"|"外套"|"包包"|"配件",
 "style": string, "material": string, "fit": string, "thickness": 1..5,
 "temp": {"min": 10, "max": 25}, "colors": {"dominant": "#hex", "secondary":"#hex"},
 "notes": string, "confidence": 0..1
}`;

      const body = {
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } }
          ]
        }]
      };

      const result = await callWithFallback(CHAIN_FLASH, body);
      return res.status(200).json({ ...safeJsonParse(result.text), _meta: { model: result.model } });
    }

    // 其他任務 (Stylist) 
    if (task === "stylist") {
      const { closet, profile, tempC } = req.body;
      const prompt = `你是穿搭師。請根據 ${tempC}度 推薦穿搭。只輸出 JSON。`;
      const body = { contents: [{ parts: [{ text: prompt }] }] };
      const out = await callWithFallback(CHAIN_FLASH, body);
      return res.status(200).json({ ...safeJsonParse(out.text), _meta: { model: out.model } });
    }

    return res.status(400).json({ error: "Unknown task" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
