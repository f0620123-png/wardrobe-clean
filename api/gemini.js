function safeJsonParse(s) {
  try {
    const trimmed = (s || "").trim();
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.substring(first, last + 1));
    }
    return JSON.parse(trimmed);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return { error: "解析失敗", raw: s };
  }
}

export default async function handler(req, res) {
  try {
    // ✨ [v15.5] 取得所有參數，包含前端傳來的 apiKey
    const { 
      task, imageDataUrl, selectedItems, profile, 
      styleMemory, tempC, occasion, closet, style, location, text,
      apiKey 
    } = req.body;

    // 優先使用使用者輸入的 Key，沒有才吃 Vercel 的環境變數
    const KEY = apiKey || process.env.GEMINI_API_KEY;
    if (!KEY) {
      return res.status(400).json({ error: "請先在「Hub > 設定」輸入您的 Gemini API Key" });
    }

    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${KEY}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();
    
    if (listData.error) {
      return res.status(400).json({ error: "API Key 無效或遭封鎖: " + listData.error.message });
    }

    const allModels = listData.models || [];
    const bestModel = allModels.find(m => m.name.includes("flash"))?.name || allModels.find(m => m.name.includes("generateContent"))?.name;

    if (!bestModel) throw new Error("此金鑰找不到任何可用模型");

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${bestModel}:generateContent?key=${KEY}`;

    let prompt = "";
    let parts = [];

    if (task === "vision") {
      if (!imageDataUrl) return res.status(400).json({ error: "請提供圖片資料" });
      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";
      prompt = `你是一個專業的衣物辨識專家。請嚴格以 JSON 格式回傳以下資訊：
      {
        "name": "單品名稱", "category": "上衣|下著|鞋子|外套|包包|配件|內著|帽子|飾品",
        "style": "風格", "material": "材質", "colors": { "dominant": "#HEX", "secondary": "#HEX" },
        "thickness": 1到5的數字, "temp": { "min": 最低溫, "max": 最高溫 }, "notes": "一句建議"
      }`;
      parts = [{ text: prompt }, { inlineData: { mimeType, data: base64 } }];
    } else if (task === "mixExplain") {
      if (!selectedItems) return res.status(400).json({ error: "缺少勾選的衣物" });
      prompt = `請評估這套搭配(場合:${occasion} 氣溫:${tempC}度)，回傳 JSON：
      {"summary": "總結", "goodPoints": ["優點"], "risks": ["風險"], "tips": ["建議"], "styleName": "風格名", "compatibility": 0.1~1.0}
      已選衣物：${JSON.stringify(selectedItems.map(i => ({ name: i.name, category: i.category })))}`;
      parts = [{ text: prompt }];
    } else if (task === "stylist") {
      if (!closet) return res.status(400).json({ error: "缺少衣櫥清單" });
      prompt = `請從衣櫥挑選一套穿搭(場合:${occasion} 氣溫:${tempC}度 地點:${location} 風格:${style})，回傳 JSON：
      {"outfit": {"topId": "id", "bottomId": "id", "outerId": "id", "shoeId": "id", "accessoryIds": ["id"]}, "why": ["原因"], "tips": ["技巧"], "styleName": "風格名", "confidence": 0.1~1.0}
      衣櫥清單：${JSON.stringify(closet.map(i => ({ id: i.id, category: i.category, location: i.location })))}`;
      parts = [{ text: prompt }];
    } else if (task === "noteSummarize") {
      prompt = `摘要穿搭筆記，回傳 JSON：{"tags": ["標籤"], "do": ["建議"], "dont": ["避免"]}`;
      parts = [{ text: prompt }];
      if (text) parts.push({ text: "筆記內容：" + text });
      if (imageDataUrl) {
        const base64 = imageDataUrl.split(",")[1];
        const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";
        parts.push({ inlineData: { mimeType, data: base64 } });
      }
    } else {
      return res.status(400).json({ error: "未知的任務類型" });
    }

    const response = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts }] }) });
    const rawData = await response.json();
    if (rawData.error) throw new Error(rawData.error.message || "API 發生錯誤");
    const aiText = rawData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    res.status(200).json(safeJsonParse(aiText));

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
