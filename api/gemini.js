// 這次只保留最基本、官方預設的名稱，避開所有預覽版編號
const CHAIN_FLASH = ["gemini-1.5-flash"];
const CHAIN_PRO = ["gemini-1.5-pro"];

function getCleanKey() {
  return process.env.GEMINI_API_KEY; 
}

async function callGenerate(model, body) {
  const KEY = getCleanKey();
  if (!KEY) throw new Error("缺少 API Key");

  // ✨ 關鍵修正：切換到 v1 正式版路徑
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${KEY}`;
  
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { }

  if (!r.ok) {
    // 如果報錯，我們要看看到底是哪裡出問題
    throw new Error(`[${model}] ${j?.error?.message || text}`);
  }

  return j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callWithFallback(models, body) {
  let errs = [];
  for (const m of models) {
    try {
      return { model: m, text: await callGenerate(m, body) };
    } catch (e) {
      errs.push(e.message);
    }
  }
  throw new Error(errs.join(" | "));
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

export default async function handler(req, res) {
  try {
    const { task, imageDataUrl } = req.body;
    if (task === "vision") {
      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";
      
      const body = {
        contents: [{
          parts: [
            { text: "你是穿搭助手，請分析圖片並以 JSON 格式回傳單品資訊 (name, category, style, material, colors)" },
            { inlineData: { mimeType, data: base64 } }
          ]
        }]
      };
      
      const result = await callWithFallback(CHAIN_FLASH, body);
      return res.status(200).json({ ...safeJsonParse(result.text), _meta: { model: result.model } });
    }
    return res.status(400).json({ error: "Unknown task" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
