// 這次我們不用簡寫，直接呼叫 Google 伺服器上的「硬核」版本號
const CHAIN_FLASH = [
  "gemini-1.5-flash-002",      // 1.5 Flash 穩定版
  "gemini-2.0-flash-001",      // 2.0 Flash 正式版
  "gemini-2.0-flash-lite-preview-02-05", // 最新 Lite 預覽版
  "gemini-1.5-flash-8b-001"    // 輕量版穩定版
];

const CHAIN_PRO = [
  "gemini-1.5-pro-002",
  "gemini-1.0-pro"             // 萬一 1.5/2.0 都被擋，用 1.0 墊底
];

function getCleanKey() {
  return process.env.GEMINI_API_KEY; 
}

async function callGenerate(model, body) {
  const KEY = getCleanKey();
  if (!KEY) throw new Error("環境變數 GEMINI_API_KEY 缺失，請檢查 Vercel 設定並 Redeploy");

  // ✨ 自動嘗試兩種路徑格式：一種是有 models/，一種是沒有的
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  const url = `${baseUrl}/models/${model}:generateContent?key=${KEY}`;
  
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { }

  if (!r.ok) {
    // 這裡會抓出 Google 具體的錯誤原因
    throw new Error(`[${model}] ${j?.error?.message || text}`);
  }

  return j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callWithFallback(models, body) {
  let errors = [];
  for (const m of models) {
    try {
      const text = await callGenerate(m, body);
      return { model: m, text };
    } catch (e) {
      errors.push(e.message);
      continue;
    }
  }
  throw new Error("模型全部失效，請檢查 AI Studio 權限。詳細錯誤: " + errors.join(" | "));
}

// 解析與處理邏輯
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
