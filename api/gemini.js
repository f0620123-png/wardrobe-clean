// 根據你剛才偵錯得到的正確名稱（注意：有些環境需要 models/ 前綴）
const CHAIN_FLASH = ["models/gemini-1.5-flash", "gemini-1.5-flash"];
const CHAIN_PRO = ["models/gemini-1.5-pro", "gemini-1.5-pro"];

function getCleanKey() {
  return process.env.GEMINI_API_KEY; 
}

async function callGenerate(model, body) {
  const KEY = getCleanKey();
  // 偵錯顯示 v1beta 是通的，我們繼續沿用
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${KEY}`;
  
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { }

  if (!r.ok) {
    throw new Error(`[${model}] ${j?.error?.message || text}`);
  }

  // 取得 AI 回傳的文字
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
    // 處理 Markdown 的 ```json ... ``` 包裹
    const cleanJson = trimmed.replace(/```json/g, "").replace(/```/g, "").trim();
    const first = cleanJson.indexOf("{");
    const last = cleanJson.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(cleanJson.slice(first, last + 1));
    return JSON.parse(cleanJson);
  } catch (e) { 
    console.error("JSON 解析失敗:", e, s);
    return {}; 
  }
}

export default async function handler(req, res) {
  try {
    const { task, imageDataUrl } = req.body;

    if (task === "vision") {
      if (!imageDataUrl) return res.status(400).json({ error: "Missing image" });
      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";

      // 這裡就是告訴 AI 要怎麼分類的指令（Prompt）
      const prompt = `你是專業穿搭顧問。請分析這張衣物圖片，並嚴格只輸出 JSON 格式。
內容包含：
- name: 單品名稱
- category: 只能從 "上衣", "下著", "鞋子", "外套", "包包", "配件" 中選一個
- style: 風格描述
- material: 材質
- fit: 版型
- thickness: 1(薄) 到 5(厚)
- temp: 建議穿著溫度範圍 { "min": 數字, "max": 數字 }
- colors: { "dominant": "#16進位", "secondary": "#16進位" }
- notes: 給使用者的穿搭建議`;

      const body = {
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } }
          ]
        }]
      };

      const result = await callWithFallback(CHAIN_FLASH, body);
      const parsedData = safeJsonParse(result.text);

      return res.status(200).json({ 
        ...parsedData, 
        _meta: { model: result.model } 
      });
    }

    return res.status(400).json({ error: "Unknown task" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
