// 這裡放剛才偵錯代碼確認可用的模型路徑（API 回傳通常帶有 models/ 前綴）
const CHAIN_FLASH = [
  "models/gemini-1.5-flash",
  "models/gemini-1.5-flash-latest",
  "models/gemini-2.0-flash-exp"
];

const CHAIN_PRO = [
  "models/gemini-1.5-pro",
  "models/gemini-3.1-pro-preview"
];

async function callGenerate(modelPath, body) {
  const KEY = process.env.GEMINI_API_KEY;
  // ✨ 使用測通的 URL 結構：直接把從 API 拿到的 modelPath 塞進去
  // modelPath 本身已經包含 "models/..."
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${KEY}`;
  
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "API Error");
  
  return j.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export default async function handler(req, res) {
  // 讓網頁直接瀏覽時可以顯示目前狀態
  if (req.method === 'GET') {
    return res.status(200).json({ status: "API is running", mode: "Vision ready" });
  }

  try {
    const { task, imageDataUrl } = req.body;

    if (task === "vision") {
      if (!imageDataUrl) return res.status(400).json({ error: "No image provided" });
      
      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";

      // ✨ AI 核心指令：要求它精準分類並回傳 JSON
      const prompt = `你是專業穿搭 AI。請分析這張圖片中的衣物，並**只回傳 JSON 格式**（不要有 Markdown 標記或文字說明）。
      格式如下：
      {
        "name": "單品名稱",
        "category": "上衣" | "下著" | "鞋子" | "外套" | "配件",
        "style": "風格描述",
        "material": "材質",
        "colors": {"dominant": "主色HEX"},
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

      // 嘗試使用 Flash 模型進行快速辨識
      const resultText = await callGenerate(CHAIN_FLASH[0], body);
      
      // 清理 AI 可能多給的 Markdown 符號
      const cleanJson = resultText.replace(/```json|```/g, "").trim();
      const analysis = JSON.parse(cleanJson);

      return res.status(200).json(analysis);
    }

    return res.status(400).json({ error: "Unknown task" });
  } catch (e) {
    return res.status(500).json({ error: "AI 分析失敗", details: e.message });
  }
}
