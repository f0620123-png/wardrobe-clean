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

  for (const m of candidates) {
    if (!seen.has(m.name)) {
      ranked.push(m.name);
      seen.add(m.name);
    }
  }

  const hasModern = ranked.some((n) => /gemini-2\.5|gemini-1\.5/.test(n));
  if (hasModern) return ranked.filter((n) => !/gemini-2\.0-flash$/.test(n));
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
  return { response, rawData };
}

function toArrayText(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function normalizeMixExplainPayload(parsed, aiText) {
  const src = parsed?.feedback || parsed?.result || parsed || {};
  let compatibility = Number(src.compatibility ?? src.score ?? src.matchScore ?? src.confidence);
  if (!Number.isFinite(compatibility)) compatibility = 0.72;
  if (compatibility > 1) compatibility = compatibility / 100;
  compatibility = Math.max(0.05, Math.min(1, compatibility));
  return {
    summary: String(src.summary || src.brief || src.verdict || src.judgement || "").trim(),
    goodPoints: toArrayText(src.goodPoints || src.good || src.reasons || src.strengths),
    risks: toArrayText(src.risks || src.warnings || src.cautions || src.cons),
    tips: toArrayText(src.tips || src.fixes || src.suggestions || src.adjustments || src.stylistTips),
    alternatives: toArrayText(src.alternatives || src.replacements),
    styleName: src.styleName || src.style || "自選搭配",
    compatibility,
    raw: aiText
  };
}

function normalizeStylistPayload(parsed, aiText) {
  const src = parsed?.result || parsed || {};
  let confidence = Number(src.confidence ?? src.score ?? src.matchScore);
  if (!Number.isFinite(confidence)) confidence = 0.75;
  if (confidence > 1) confidence = confidence / 100;
  confidence = Math.max(0.05, Math.min(1, confidence));
  const outfit = src.outfit || {};
  return {
    outfit: {
      topId: outfit.topId ?? null,
      bottomId: outfit.bottomId ?? null,
      outerId: outfit.outerId ?? null,
      shoeId: outfit.shoeId ?? null,
      accessoryIds: Array.isArray(outfit.accessoryIds) ? outfit.accessoryIds : []
    },
    why: toArrayText(src.why || src.reasons || src.goodPoints || src.explanations),
    tips: toArrayText(src.tips || src.stylistTips || src.suggestions),
    styleName: src.styleName || src.style || "AI 搭配",
    confidence,
    raw: aiText
  };
}

function normalizeGapPayload(parsed, aiText) {
  const src = parsed?.result || parsed || {};
  const missingItems = Array.isArray(src.missingItems) ? src.missingItems : [];
  return {
    summary: String(src.summary || src.wardrobeSummary || src.brief || "").trim(),
    wardrobeSummary: String(src.wardrobeSummary || src.summary || "").trim(),
    missingItems: missingItems.map((x) => ({
      name: x?.name || x?.item || "建議補齊單品",
      reason: x?.reason || x?.why || "補上後能提升整體穿搭完整度",
      priority: x?.priority || "中",
      alternatives: Array.isArray(x?.alternatives) ? x.alternatives.map(String) : toArrayText(x?.alternatives)
    })),
    quickWins: toArrayText(src.quickWins || src.quickWin || src.nextSteps),
    raw: aiText
  };
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
      styleMemory, tempC, occasion, closet, style, location, text, weather, favorites
    } = req.body || {};

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
  "notes": "穿搭建議簡短一句"
}
注意：請只輸出 JSON，不要有任何額外文字。`;
      parts = [{ text: prompt }, { inlineData: { mimeType, data: base64 } }];
    } else if (task === "mixExplain") {
      if (!selectedItems) return res.status(400).json({ error: "缺少勾選的衣物" });
      const prompt = `你是一位專業的穿搭顧問。使用者選了以下衣服想進行「${occasion}」場合的穿搭。
使用者資料：${profilePromptBlock(profile)}。請注意不同性別/視角的版型重點與審美差異（例如肩線、腰臀比例、整體比例感），但避免刻板印象。
目前溫度：${tempC ? tempC + "度" : "未知"}。
AI記憶(偏好)：${styleMemory || "無"}
已選衣物：${JSON.stringify((selectedItems || []).map(i => ({ name: i.name, category: i.category, style: i.style })))}

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
      if (!closet) return res.status(400).json({ error: "缺少衣櫥清單" });
      const prompt = `你是一位專業的穿搭顧問。請從使用者的衣櫥中，挑選出最適合的穿搭。
場合：${occasion}，風格偏好：${style}，目前溫度：${tempC ? tempC + "度" : "未知"}，地點：${location}。
天氣資訊：${weather ? JSON.stringify(weather) : "無"}。
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
  "tips": ["穿搭小技巧1", "小技巧2"],
  "styleName": "這套穿搭的風格名稱",
  "confidence": 0.1到1.0的信心指數
}
注意：挑選的 id 必須完全來自上方的衣櫥清單，且盡量符合要求。`;
      parts = [{ text: prompt }];
    } else if (task === "closetGap") {
      if (!closet) return res.status(400).json({ error: "缺少衣櫥清單" });
      const prompt = `你是一位專業造型顧問與衣櫥管理顧問。請根據使用者的衣櫥、收藏偏好、天氣與個人條件，分析「目前衣櫥缺少哪些關鍵單品」。
位置/天氣：${location || "未指定"}，天氣資訊：${weather ? JSON.stringify(weather) : "無"}。
使用者資料：${profilePromptBlock(profile)}。
AI記憶(偏好)：${styleMemory || "無"}
近期收藏：${JSON.stringify((favorites || []).slice(0, 8).map((f) => ({ title: f.title, styleName: f.styleName, why: Array.isArray(f.why) ? f.why.slice(0, 2) : [] })))}
衣櫥清單：${JSON.stringify((closet || []).map(i => ({ name: i.name, category: i.category, subcategory: i.subcategory, formality: i.formality, season: i.season, color: i.colors?.dominant || null, style: i.style })))}

請嚴格以 JSON 格式回傳：
{
  "summary": "用一句話總結目前衣櫥傾向，例如偏極簡、深色、休閒導向",
  "wardrobeSummary": "稍微詳細一點的說明，描述目前優勢與缺口",
  "missingItems": [
    {
      "name": "建議補齊的單品名稱，例如白色乾淨鞋款",
      "reason": "為什麼缺這件，補上後有什麼效果",
      "priority": "高/中/低",
      "alternatives": ["若先不買，可用什麼方向暫代"]
    }
  ],
  "quickWins": ["短期就能改善的做法1", "短期就能改善的做法2"]
}
請優先提出 3 到 5 個最有價值的缺口，並按重要性排序。`;
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
    } else if (task === "closetGap") {
      if (!closet) return res.status(400).json({ error: "缺少衣櫥清單" });
      const prompt = `你是一位衣櫥顧問，請根據使用者現有衣櫥、收藏偏好、最近穿著與今天天氣，分析目前缺少哪些關鍵單品。
使用者資料：${profilePromptBlock(profile)}
目前城市：${location || "未知"}
今日天氣：${JSON.stringify(weather || {})}
風格記憶：${styleMemory || "無"}
收藏摘要：${JSON.stringify((favorites || []).slice(0, 10).map(f => ({ title: f.title, styleName: f.styleName, confidence: f.confidence })))}
最近穿著摘要：${JSON.stringify((timeline || []).slice(0, 8).map(t => ({ title: t.title, satisfaction: t.satisfaction || "", styleName: t.styleName || "" })))}
衣櫥摘要：${JSON.stringify((closet || []).map(i => ({ name: i.name, category: i.category, style: i.style, material: i.material, formality: i.formality, subcategory: i.subcategory, colors: i.colors })))}

請嚴格只輸出 JSON：
{
  "summary": "一句總結，目前衣櫥偏向什麼風格/缺口在哪",
  "profileTone": "例如：極簡、深色、休閒導向",
  "missingItems": ["缺少：白色鞋款", "缺少：淺色外套"],
  "priorityOrder": ["優先1：白色鞋款", "優先2：淺色外套", "優先3：正式下著"],
  "substitutes": ["現階段可先用深色休閒鞋替代", "沒有外套時可用襯衫做輕層次"]
}`;
      parts = [{ text: prompt }];
    } else {
      return res.status(400).json({ error: "未知的任務類型" });
    }

    let lastError = null;
    for (const modelName of modelCandidates) {
      const { response, rawData } = await callGenerateContent({ modelName, key: KEY, parts });
      if (!response.ok || rawData.error) {
        const msg = rawData?.error?.message || "Gemini API 發生錯誤";
        lastError = { modelName, msg, rawData };
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
      if (task === "mixExplain") {
        return res.status(200).json({ ...normalizeMixExplainPayload(resultJson, aiText), _model: modelName });
      }
      if (task === "stylist") {
        return res.status(200).json({ ...normalizeStylistPayload(resultJson, aiText), _model: modelName });
      }
      if (task === "closetGap") {
        return res.status(200).json({ ...normalizeGapPayload(resultJson, aiText), _model: modelName });
      }
      return res.status(200).json({ ...resultJson, _model: modelName });
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
