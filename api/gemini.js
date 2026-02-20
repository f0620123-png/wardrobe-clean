// 這次我們換成「保證存在」的最新名稱格式
const CHAIN_FLASH = [
  "gemini-1.5-flash-latest", // 這是目前最通用的名稱
  "gemini-1.5-flash",
  "gemini-1.5-flash-002"     // 強制指向穩定版
];

const CHAIN_PRO = [
  "gemini-1.5-pro-latest",
  "gemini-1.5-pro",
  "gemini-1.5-pro-002"
];


function getCleanKey() {
  // 讓它自動抓取 Vercel 的環境變數
  return process.env.GEMINI_API_KEY; 
}

async function callGenerate(model, body) {
  const KEY = getCleanKey();
  if (!KEY) throw new Error("Vercel 環境變數未讀取到，請執行 Redeploy");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { }

  if (!r.ok) {
    throw new Error(j?.error?.message || `HTTP ${r.status}`);
  }

  const out = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return out;
}

async function callWithFallback(models, body) {
  let lastErr = "";
  for (const m of models) {
    try {
      return { model: m, text: await callGenerate(m, body) };
    } catch (e) {
      lastErr = e.message;
      continue;
    }
  }
  throw new Error(lastErr);
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
            { text: "分析這件衣服並輸出 JSON (name, category, style, material, colors)" },
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
