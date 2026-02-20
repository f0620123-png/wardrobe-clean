// 根據偵錯結果，這裡直接填入你網頁上看到的完整名稱 (包含 models/ 前綴最保險)
const CHAIN_FLASH = [
  "models/gemini-1.5-flash",
  "models/gemini-1.5-flash-latest",
  "models/gemini-2.0-flash-exp"
];

async function callGenerate(modelPath, body) {
  const KEY = process.env.GEMINI_API_KEY;
  // 注意：因為偵錯結果顯示模型名包含 "models/"，所以 URL 中不需要再額外加 /models/
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${KEY}`;
  
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "API Error");
  
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  try {
    const { task, imageDataUrl } = req.body;

    if (task === "vision") {
      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";

      // ✨ AI 自動判斷的核心 Prompt
      const prompt = `你是一位專業的服裝分析師。請精確辨識圖片中的單品。
請「只」輸出 JSON 格式，不要有任何多餘文字。
格式規範：
{
  "name": "單品的具體名稱 (如: 復古水洗直筒牛仔褲)",
  "category": "必須從中挑選一項: [上衣, 下著, 鞋子, 外套, 包包, 配件, 運動, 正式]",
  "style": "風格描述 (如: 街頭美式, 韓系簡約)",
  "material": "材質猜測",
  "colors": { "dominant": "主要顏色的十六進位碼", "secondary": "次要顏色的十六進位碼" },
  "fit": "剪裁 (如: 寬鬆, 修身)",
  "thickness": 1到5的數字 (1最薄, 5最厚),
  "temp": { "min": 建議最低穿著溫度, "max": 建議最高穿著溫度 },
  "notes": "穿搭建議小筆記"
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
      let aiResponse = "";
      let usedModel = "";
      
      for (const m of CHAIN_FLASH) {
        try {
          aiResponse = await callGenerate(m, body);
          usedModel = m;
          break; // 成功就跳出循環
        } catch (e) {
          console.error(`Model ${m} failed, trying next...`);
        }
      }

      if (!aiResponse) throw new Error("所有模型呼叫均失敗");

      // 清理並解析 JSON
      const jsonStart = aiResponse.indexOf('{');
      const jsonEnd = aiResponse.lastIndexOf('}');
      const cleanJson = aiResponse.slice(jsonStart, jsonEnd + 1);
      const result = JSON.parse(cleanJson);

      return res.status(200).json({ ...result, _meta: { model: usedModel } });
    }

    return res.status(400).json({ error: "Unknown task" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
