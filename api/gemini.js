// 1. 定義模型順序 (這裡使用最穩定的名稱，API 會自動補全路徑)
const CHAIN_FLASH = ["gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-2.0-flash-exp"];

async function callGenerate(model, body) {
  const KEY = process.env.GEMINI_API_KEY;
  // ✨ 關鍵：使用與你偵錯成功時一致的 v1beta 網址格式
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
    throw new Error(`[${model}] ${j?.error?.message || "請求失敗"}`);
  }

  // 取得 AI 回傳的文字內容
  const out = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!out) throw new Error("AI 回傳內容為空");
  return out;
}

// 輔助函式：確保 JSON 解析正確
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
  // 只允許 POST 請求
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { task, imageDataUrl } = req.body;

    if (task === "vision") {
      if (!imageDataUrl) return res.status(400).json({ error: "未接收到圖片數據" });

      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";

      // ✨ AI 辨識提示詞：強制 AI 判斷類型與細節
      const prompt = `你是專業穿搭 AI。請分析這張圖片中的衣物，並精確判斷其類型。
請直接輸出 JSON 格式，不要包含任何額外文字：
{
  "name": "單品名稱",
  "category": "上衣" | "下著" | "鞋子" | "外套" | "包包" | "配件",
  "style": "風格描述",
  "material": "材質描述",
  "colors": { "dominant": "#16進制色碼" },
  "notes": "穿搭建議"
}`;

      const body = {
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } }
          ]
        }]
      };

      // 嘗試呼叫模型
      let lastError = "";
      for (const modelName of CHAIN_FLASH) {
        try {
          const resultText = await callGenerate(modelName, body);
          const parsedData = safeJsonParse(resultText);
          return res.status(200).json({ ...parsedData, _meta: { model: modelName } });
        } catch (e) {
          lastError = e.message;
          continue; // 失敗則嘗試下一個模型
        }
      }
      throw new Error("所有 AI 模型呼叫失敗: " + lastError);
    }

    return res.status(400).json({ error: "未知任務類型" });
  } catch (e) {
    console.error("API Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
