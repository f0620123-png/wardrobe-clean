// 輔助函式：從 AI 回傳的雜亂文字中提取 JSON
function safeJsonParse(s) {
  try {
    const trimmed = (s || "").trim();
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
    return JSON.parse(trimmed);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return { error: "解析失敗", raw: s };
  }
}

export default async function handler(req, res) {
  const KEY = process.env.GEMINI_API_KEY;

  try {
    // 1. 先確認任務類型
    const { task, imageDataUrl } = req.body;
    if (task !== "vision" || !imageDataUrl) {
      return res.status(400).json({ error: "請提供圖片資料 (vision task)" });
    }

    // 2. 自動獲取目前這把金鑰「真正能用」的模型名稱
    // 這樣可以徹底解決 models/xxx not found 的問題
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${KEY}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();
    
    // 優先找 flash，沒有的話隨便找一個能 generateContent 的
    const allModels = listData.models || [];
    const bestModel = allModels.find(m => m.name.includes("gemini-1.5-flash"))?.name 
                   || allModels.find(m => m.supportedGenerationMethods.includes("generateContent"))?.name;

    if (!bestModel) throw new Error("此金鑰找不到任何可用模型");

    // 3. 準備圖片資料
    const base64 = imageDataUrl.split(",")[1];
    const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";

    // 4. 設定 AI 的辨識邏輯 (包含自動判斷類型)
    const prompt = `你是一個專業的衣物辨識專家。請分析這張圖片，並嚴格以 JSON 格式回傳以下資訊：
    {
      "name": "單品名稱",
      "category": "自動判斷類別 (請只從中選一：上衣、下著、鞋子、外套、包包、配件)",
      "style": "風格 (如：丹寧、運動、正式)",
      "material": "材質猜測",
      "colors": { "dominant": "主色系HEX碼", "secondary": "輔助色HEX碼" },
      "notes": "穿搭建議簡短一句"
    }
    注意：請只輸出 JSON，不要有任何額外文字。`;

    const visionUrl = `https://generativelanguage.googleapis.com/v1beta/${bestModel}:generateContent?key=${KEY}`;
    
    const response = await fetch(visionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } }
          ]
        }]
      })
    });

    const result = await response.json();

    if (!response.ok) throw new Error(JSON.stringify(result));

    const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsedData = safeJsonParse(aiText);

    // 5. 回傳最終結果
    return res.status(200).json({
      ...parsedData,
      _meta: { modelUsed: bestModel }
    });

  } catch (e) {
    return res.status(500).json({ error: "辨識失敗", details: e.message });
  }
}
