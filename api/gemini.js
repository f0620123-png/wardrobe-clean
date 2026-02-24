// BYOK Gemini API route (supports per-user API key)
function safeJsonParse(s) {
  try {
    const trimmed = (s || "").trim();
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.substring(first, last + 1));
    return JSON.parse(trimmed);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return { error: "解析失敗", raw: s };
  }
}

function supportsGenerateContent(m) {
  return Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent");
}

function pickModelCandidates(models = []) {
  const candidates = models.filter(supportsGenerateContent);
  if (!candidates.length) return [];

  // Prefer newer, stable/usable text+vision-capable models first.
  // NOTE: gemini-2.0-flash may be unavailable to new users.
  const preferredKeywords = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "flash",
    "pro"
  ];

  const ranked = [];
  const lower = (s) => (s || "").toLowerCase();
  const seen = new Set();

  for (const kw of preferredKeywords) {
    for (const m of candidates) {
      const n = lower(m.name);
      if (n.includes(kw) && !seen.has(m.name)) {
        ranked.push(m.name);
        seen.add(m.name);
      }
    }
  }

  // Add any remaining generateContent models as fallback
  for (const m of candidates) {
    if (!seen.has(m.name)) {
      ranked.push(m.name);
      seen.add(m.name);
    }
  }

  // Filter out obviously deprecated/legacy aliases if newer choices exist
  const hasModern = ranked.some((n) => /gemini-2\.5|gemini-1\.5/.test(n));
  if (hasModern) {
    return ranked.filter((n) => !/gemini-2\.0-flash$/.test(n));
  }

  return ranked;
}

async function callGenerateContent({ modelName, key, parts }) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${key}`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] })
  });
  const rawData = await response.json();
  return { response, rawData, apiUrl };
}



function asList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function normalizeByTask(task, resultJson, aiText) {
  const src = resultJson || {};
  if (task === "mixExplain") {
    const compatibilityRaw = src.compatibility ?? src.score ?? src.matchScore ?? src.confidence ?? 0.7;
    let compatibility = Number(compatibilityRaw);
    if (!Number.isFinite(compatibility)) compatibility = 0.7;
    if (compatibility > 1) compatibility = compatibility / 100;
    compatibility = Math.min(1, Math.max(0.1, compatibility));

    const goodPoints = asList(src.goodPoints || src.reasons || src.good || src.strengths);
    const risks = asList(src.risks || src.warnings || src.cautions || src.cons);
    const tips = asList(src.tips || src.fixes || src.suggestions || src.adjustments || src.stylistTips);

    return {
      ...src,
      summary: String(src.summary || src.verdict || src.judgement || "").trim() || (goodPoints[0] ? `整體方向可行，${goodPoints[0]}` : "AI 已完成自選搭配評估"),
      goodPoints,
      risks,
      tips,
      styleName: String(src.styleName || src.style || "自選搭配").trim(),
      compatibility,
      _normalized: true,
      _rawText: aiText
    };
  }

  if (task === "stylist") {
    const confidenceRaw = src.confidence ?? src.compatibility ?? src.score ?? 0.75;
    let confidence = Number(confidenceRaw);
    if (!Number.isFinite(confidence)) confidence = 0.75;
    if (confidence > 1) confidence = confidence / 100;
    confidence = Math.min(1, Math.max(0.1, confidence));

    const outfit = src.outfit || {};
    return {
      ...src,
      outfit: {
        topId: outfit.topId ?? null,
        bottomId: outfit.bottomId ?? null,
        outerId: outfit.outerId ?? null,
        shoeId: outfit.shoeId ?? null,
        accessoryIds: Array.isArray(outfit.accessoryIds) ? outfit.accessoryIds : []
      },
      why: asList(src.why || src.reasons || src.goodPoints || src.summary),
      tips: asList(src.tips || src.stylistTips || src.fixes || src.suggestions),
      styleName: String(src.styleName || src.style || "AI 搭配").trim(),
      confidence,
      _normalized: true,
      _rawText: aiText
    };
  }

  return src;
}


function profilePromptBlock(profile = {}) {
  const genderMap = { male: "男性視角", female: "女性視角", other: "中性/其他視角" };
  const body = [
    `性別/視角：${genderMap[profile.gender] || "未指定"}`,
    `身高：${profile.height ?? "未知"}cm`,
    `體重：${profile.weight ?? "未知"}kg`,
    `身形：${profile.bodyType || "未指定"}`,
    `版型偏好：${profile.fitPreference || "未指定"}`,
    `審美重點：${profile.aestheticFocus || "未指定"}`
  ];
  if (profile.shoulder) body.push(`肩寬：${profile.shoulder}cm`);
  if (profile.chest) body.push(`胸圍：${profile.chest}cm`);
  if (profile.waist) body.push(`腰圍：${profile.waist}cm`);
  if (profile.hip) body.push(`臀圍：${profile.hip}cm`);
  return body.join("，");
}

export default async function handler(req, res) {
  try {
    const KEY = (req.body?.userApiKey || process.env.GEMINI_API_KEY || "").trim();
    if (!KEY) return res.status(400).json({ error: "請先設定 Gemini API Key" });

    const {
      task, imageDataUrl, selectedItems, profile,
      styleMemory, tempC, occasion, closet, style, location, text, weather
    } = req.body || {};

    // 1) Discover available models for THIS user's key
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${KEY}`);
    const listData = await listRes.json();

    if (!listRes.ok) {
      return res.status(500).json({
        error: listData?.error?.message || "無法取得模型清單（請檢查 API Key）",
        raw: listData
      });
    }

    const modelCandidates = pickModelCandidates(listData.models || []);
    if (task === "ping") {
      if (!modelCandidates.length) {
        return res.status(500).json({ error: "此金鑰找不到任何可用模型（generateContent）" });
      }
      return res.status(200).json({ ok: true, _model: modelCandidates[0], modelCandidates: modelCandidates.slice(0, 5) });
    }
    if (!modelCandidates.length) {
      return res.status(500).json({
        error: "此金鑰找不到任何可用模型（generateContent）",
        modelsPreview: (listData.models || []).map((m) => ({
          name: m.name,
          methods: m.supportedGenerationMethods || []
        }))
      });
    }

    // 2) Build prompt parts by task
    let parts = [];

    if (task === "vision") {
      if (!imageDataUrl) return res.status(400).json({ error: "請提供圖片資料" });
      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9+.-]+);base64,/)?.[1] || "image/jpeg";
      const prompt = `你是一個專業的衣物辨識專家。請分析這張圖片，並嚴格以 JSON 格式回傳以下資訊：
{
  "name": "單品名稱",
  "category": "自動判斷類別 (請只從中選一：上衣、下著、鞋子、外套、包包、配件、內著、帽子、飾品)",
  "style": "風格 (如：極簡、街頭、休閒、正式)",
  "material": "材質猜測",
  "colors": { "dominant": "#主色系HEX碼", "secondary": "#輔助色HEX碼" },
  "thickness": 1到5的數字(1最薄5最厚),
  "temp": { "min": 適合最低溫, "max": 適合最高溫 },
  "notes": "穿搭建議簡短一句",
  "season": "請只填：四季 / 春夏 / 秋冬 其中一種",
  "formality": "請只填：休閒 / 半正式 / 正式 其中一種",
  "subcategory": "依 category 給一個子類別（例如 T恤/襯衫/牛仔褲/運動褲/西裝褲）"
}
注意：請只輸出 JSON，不要有任何額外文字。`;
      parts = [{ text: prompt }, { inlineData: { mimeType, data: base64 } }];
    } else if (task === "mixExplain") {
      if (!selectedItems) return res.status(400).json({ error: "缺少勾選的衣物" });
      const prompt = `你是一位資深造型師，請用「實際能修正」的角度評估使用者自選搭配是否合適（不是只稱讚）。
場合：${occasion || "日常"}
使用者資料：${profilePromptBlock(profile)}。請注意不同性別/視角的版型重點與審美差異（例如肩線、腰臀比例、整體比例感），但避免刻板印象。
天氣：${JSON.stringify(weather || { tempC })}
AI記憶(偏好)：${styleMemory || "無"}
已選衣物：${JSON.stringify((selectedItems || []).map(i => ({ name: i.name, category: i.category, subcategory: i.subcategory, style: i.style, season: i.season, formality: i.formality, colors: i.colors, notes: i.notes })))}

評估要求：
1) 先判斷是否合適（合適 / 可行但需修正 / 不建議）
2) 說明優點與衝突（色彩、比例、場合、天氣、正式度）
3) 提供「立即可修正」的建議（例如把外套打開、捲袖、換鞋款方向、補配件）
4) 提供「可替換方向」（如果衣櫥裡有同類型更適合可描述方向）
5) 語氣專業直接，但不要羞辱

請嚴格以 JSON 格式回傳：
{
  "fitVerdict": "合適 / 可行但需修正 / 不建議",
  "summary": "一句話總結這套搭配的感覺與是否適合",
  "goodPoints": ["優點1", "優點2"],
  "risks": ["需要注意的問題1", "問題2"],
  "fixNow": ["立即可修正的做法1", "做法2"],
  "replaceSuggestions": ["可替換方向1", "可替換方向2"],
  "tips": ["加分技巧1", "加分技巧2"],
  "styleName": "這套穿搭的風格名稱",
  "compatibility": 0.1到1.0的適合度評分,
  "warnings": ["可選，若有也可填這裡"],
  "fixes": ["可選，若有也可填這裡"]
}`;
      parts = [{ text: prompt }];
    } else if (task === "stylist") {
      if (!closet) return res.status(400).json({ error: "缺少衣櫥清單" });
      const prompt = `你是一位專業的穿搭顧問。請從使用者的衣櫥中，挑選出最適合的穿搭。
場合：${occasion}，風格偏好：${style}，目前溫度：${tempC ? tempC + "度" : "未知"}，地點：${location}。
使用者資料：${profilePromptBlock(profile)}。請注意不同性別/視角的版型重點與審美差異（例如肩線、腰臀比例、整體比例感），但避免刻板印象。
AI記憶(偏好)：${styleMemory || "無"}
衣櫥清單：${JSON.stringify((closet || []).map(i => ({ id: i.id, name: i.name, category: i.category, location: i.location })))}

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
  "reasons": ["可選，與 why 類似"],
  "tips": ["穿搭小技巧1", "小技巧2"],
  "styleName": "這套穿搭的風格名稱",
  "confidence": 0.1到1.0的信心指數
}
注意：挑選的 id 必須完全來自上方的衣櫥清單，且盡量符合要求。`;
      parts = [{ text: prompt }];
    } else if (task === "closetGap") {
      if (!closet) return res.status(400).json({ error: "缺少衣櫥清單" });
      const prompt = `你是一位衣櫥管理顧問（不是只做穿搭），請根據使用者現有衣櫥與偏好，判斷風格傾向與缺少單品。優先分析「類別覆蓋、子類別完整性、色彩平衡、正式度、季節性」。
地點：${location || "未知"}；常用場景：${occasion || "日常"}。
使用者資料：${profilePromptBlock(profile)}。
AI記憶(偏好)：${styleMemory || "無"}
天氣參考：${JSON.stringify(weather || null)}
衣櫥清單：${JSON.stringify((closet || []).map(i => ({ id: i.id, name: i.name, category: i.category, subcategory: i.subcategory, season: i.season, formality: i.formality, style: i.style, colors: i.colors, location: i.location })))}

請嚴格以 JSON 格式回傳：
{
  "summary": "一句話描述衣櫥風格傾向，例如偏極簡、深色系、休閒導向",
  "styleObservation": "風格觀察一句",
  "paletteObservation": "色彩觀察一句",
  "missing": ["缺少單品1", "缺少單品2", "缺少單品3"],
  "priorities": [
    { "item": "建議補的單品名稱", "reason": "為什麼優先補" }
  ],
  "alternatives": ["在還沒購入前可用現有單品怎麼替代1", "替代策略2"]
}
注意：請具體、可執行，避免空泛形容。`;
      parts = [{ text: prompt }];
    } else if (task === "noteSummarize") {
      const prompt = `請摘要以下穿搭筆記或圖片，嚴格以 JSON 格式回傳：
{
  "tags": ["標籤1", "標籤2"],
  "do": ["建議作法1", "建議作法2"],
  "dont": ["避免作法1"]
}`;
      parts = [{ text: prompt }];
      if (text) parts.push({ text: "筆記內容：" + text });
      if (imageDataUrl) {
        const base64 = imageDataUrl.split(",")[1];
        const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9+.-]+);base64,/)?.[1] || "image/jpeg";
        parts.push({ inlineData: { mimeType, data: base64 } });
      }
    } else {
      return res.status(400).json({ error: "未知的任務類型" });
    }

    // 3) Try model candidates in order; auto-fallback if one is deprecated/unavailable
    let lastError = null;
    for (const modelName of modelCandidates) {
      const { response, rawData } = await callGenerateContent({ modelName, key: KEY, parts });
      if (!response.ok || rawData.error) {
        const msg = rawData?.error?.message || "Gemini API 發生錯誤";
        lastError = { modelName, msg, rawData };

        // Auto-skip unavailable/deprecated models and continue
        const m = String(msg).toLowerCase();
        const shouldRetry =
          m.includes("no longer available") ||
          m.includes("deprecated") ||
          m.includes("not found") ||
          m.includes("unsupported") ||
          m.includes("not available to new users");

        if (shouldRetry) continue;

        return res.status(500).json({ error: msg, raw: rawData, modelTried: modelName });
      }

      const aiText = rawData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const resultJson = safeJsonParse(aiText);
      const normalized = normalizeByTask(task, resultJson, aiText);
      return res.status(200).json({ ...normalized, _model: modelName });
    }

    return res.status(500).json({
      error: lastError?.msg || "沒有可用模型可完成請求",
      modelTried: lastError?.modelName,
      raw: lastError?.rawData,
      modelCandidates
    });
  } catch (error) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({ error: error.message || "伺服器錯誤" });
  }
}
