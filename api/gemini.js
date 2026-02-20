// ✨ 關鍵：使用你剛才偵測到的「完整路徑名稱」
const CHAIN_FLASH = ["models/gemini-1.5-flash"]; 
const CHAIN_PRO = ["models/gemini-1.5-pro", "models/gemini-1.5-flash"];

function getCleanKey() {
  return process.env.GEMINI_API_KEY; 
}

// 統一解析 JSON 的工具，確保 AI 亂說話時不會崩潰
function safeJsonParse(s) {
  try {
    const trimmed = (s || "").trim();
    // 處理 AI 可能會加的 ```json ... ``` 標籤
    const cleanJson = trimmed.replace(/^```json/, "").replace(/```$/, "").trim();
    const first = cleanJson.indexOf("{");
    const last = cleanJson.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(cleanJson.slice(first, last + 1));
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("JSON 解析失敗:", e);
    return { name: "解析失敗單品", category: "其他" };
  }
}

async function callGenerate(model, body) {
  const KEY = getCleanKey();
  // ✨ 使用 v1beta 搭配「完整模型路徑」
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${KEY}`;
  
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { }

  if (!r.ok) throw new Error(`[${model}] ${j?.error?.message || text}`);

  const out = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return out;
}

export default async function handler(req, res) {
  try {
    const { task, imageDataUrl } = req.body;

    if (task === "vision") {
      if (!imageDataUrl) return res.status(400).json({ error: "沒收到圖片" });
      
      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";

      // ✨ 強制 AI 必須分類的「嚴格指令」
      const prompt = `你是一個專業的衣物辨識專家。請分析這張圖片，並嚴格按照以下 JSON 格式回傳，不要有任何額外文字：
{
  "name": "單品名稱(例如：深藍色直筒牛仔褲)",
  "category": "分類(只能從以下選一：上衣、下著、鞋子、外套、包包、配件)",
  "style": "風格(例如：休閒、街頭)",
  "material": "材質(例如：丹寧、棉質)",
  "fit": "剪裁(例如：合身、寬鬆)",
  "colors": { "dominant": "主色系HEX碼", "secondary": "輔助色HEX碼" },
  "notes": "一句話的穿搭建議"
}`;

      const body = {
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } }
          ]
        }]
      };

      // 執行辨識
      const result = await callGenerate(CHAIN_FLASH[0], body);
      const parsed = safeJsonParse(result);

      return res.status(200).json(parsed);
    }

    return res.status(400).json({ error: "未知任務" });
  } catch (e) {
    console.error("API 錯誤:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
