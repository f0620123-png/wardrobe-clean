// 輔助函式：從 AI 回傳的雜亂文字中提取 JSON
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
  const KEY = process.env.GEMINI_API_KEY;

  try {
    // 取得所有前端傳來的參數
    const { 
      task, imageDataUrl, selectedItems, profile, 
      styleMemory, tempC, occasion, closet, style, location, text 
    } = req.body;

    // 1. 自動獲取目前這把金鑰「真正能用」的模型名稱
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${KEY}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();
    
    // 優先找 flash，沒有的話找能 generateContent 的
    const allModels = listData.models || [];
    const bestModel = allModels.find(m => m.name.includes("flash"))?.name || allModels.find(m => m.name.includes("generateContent"))?.name;

    if (!bestModel) throw new Error("此金鑰找不到任何可用模型");

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${bestModel}:generateContent?key=${KEY}`;

    let prompt = "";
    let parts = [];

    // 2. 根據不同的 task (任務) 給予不同的指令與檢查邏輯
    if (task === "vision") {
      // 【新增衣服】需要圖片
      if (!imageDataUrl) return res.status(400).json({ error: "請提供圖片資料" });
      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";
      
      prompt = `你是一個專業的衣物辨識專家。請分析這張圖片，並嚴格以 JSON 格式回傳以下資訊：
      {
        "name": "單品名稱",
        "category": "自動判斷類別 (請只從中選一：上衣、下著、鞋子、外套、包包、配件、內著、帽子、飾品)",
        "style": "風格 (如：極簡、街頭、休閒、正式)",
        "material": "材質猜測",
        "colors": { "dominant": "#主色系HEX碼", "secondary": "#輔助色HEX碼" },
        "thickness": 1到5的數字(1最薄5最厚),
        "temp": { "min": 適合最低溫, "max": 適合最高溫 },
        "notes": "穿搭建議簡短一句"
      }
      注意：請只輸出 JSON，不要有任何額外文字。`;

      parts = [
        { text: prompt },
        { inlineData: { mimeType, data: base64 } }
      ];

    } else if (task === "mixExplain") {
      // 【自選搭配分析】只需要純文字
      if (!selectedItems) return res.status(400).json({ error: "缺少勾選的衣物" });
      
      prompt = `你是一位專業的穿搭顧問。使用者選了以下衣服想進行「${occasion}」場合的穿搭。
      使用者資料：身高 ${profile?.height}cm, 體重 ${profile?.weight}kg, 體型 ${profile?.bodyType}。
      目前溫度：${tempC ? tempC + "度" : "未知"}。
      AI記憶(偏好)：${styleMemory || "無"}
      已選衣物：${JSON.stringify(selectedItems.map(i => ({ name: i.name, category: i.category, style: i.style })))}

      請評估這套搭配，嚴格以 JSON 格式回傳：
      {
        "summary": "一句話總結這套搭配的感覺",
        "goodPoints": ["優點1", "優點2"],
        "risks": ["需要注意的缺點或氣候風險1", "風險2"],
        "tips": ["改善或配件建議1", "建議2"],
        "styleName": "這套穿搭的風格名稱",
        "compatibility": 0.1到1.0的適合度評分
      }`;
      parts = [{ text: prompt }];

    } else if (task === "stylist") {
      // 【智能造型師】只需要純文字
      if (!closet) return res.status(400).json({ error: "缺少衣櫥清單" });

      prompt = `你是一位專業的穿搭顧問。請從使用者的衣櫥中，挑選出最適合的穿搭。
      場合：${occasion}，風格偏好：${style}，目前溫度：${tempC ? tempC + "度" : "未知"}，地點：${location}。
      使用者資料：身高 ${profile?.height}cm, 體重 ${profile?.weight}kg, 體型 ${profile?.bodyType}。
      AI記憶(偏好)：${styleMemory || "無"}
      衣櫥清單：${JSON.stringify(closet.map(i => ({ id: i.id, name: i.name, category: i.category, location: i.location })))}

      請嚴格以 JSON 格式回傳：
      {
        "outfit": {
          "topId": "上衣的id(沒有可為null)",
          "bottomId": "下著的id(沒有可為null)",
          "outerId": "外套的id(沒有可為null)",
          "shoeId": "鞋子的id(沒有可為null)",
          "accessoryIds": ["配件id1"]
        },
        "why": ["挑選這件的原因1", "整體搭配原因2"],
        "tips": ["穿搭小技巧1", "小技巧2"],
        "styleName": "這套穿搭的風格名稱",
        "confidence": 0.1到1.0的信心指數
      }
      注意：挑選的 id 必須完全來自上方的衣櫥清單，且盡量符合要求。`;
      parts = [{ text: prompt }];

    } else if (task === "noteSummarize") {
      // 【學習筆記】可能有文字，也可能有圖片
      prompt = `請摘要以下穿搭筆記或圖片，嚴格以 JSON 格式回傳：
      {
        "tags": ["標籤1", "標籤2"],
        "do": ["建議作法1", "建議作法2"],
        "dont": ["避免作法1"]
      }`;
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

    // 3. 呼叫 Gemini API
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    const rawData = await response.json();
    
    // 判斷 Gemini 是否報錯
    if (rawData.error) throw new Error(rawData.error.message || "API 發生錯誤");

    const aiText = rawData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // 4. 解析結果回傳前端
    const resultJson = safeJsonParse(aiText);
    res.status(200).json(resultJson);

  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message });
  }
}
