const KEY = process.env.GEMINI_API_KEY;

function isTempError(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

async function callGenerate(model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* ignore */ }

  if (!r.ok) {
    const msg = j?.error?.message || text || `HTTP ${r.status}`;
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }

  const out = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  return out;
}

async function callWithFallback(models, body) {
  let lastErr = null;
  for (const m of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return { model: m, text: await callGenerate(m, body) };
      } catch (e) {
        lastErr = e;
        if (!isTempError(e.status)) break;
        // 短暫等候再試一次
        await new Promise(r => setTimeout(r, 350 * attempt));
      }
    }
  }
  throw lastErr || new Error("Unknown AI error");
}

function safeJsonParse(s) {
  // 盡量從輸出中擷取 JSON
  const trimmed = (s || "").trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const candidate = trimmed.slice(first, last + 1);
    return JSON.parse(candidate);
  }
  return JSON.parse(trimmed);
}

function clamp(n, a, b) {
  const x = Number(n);
  if (Number.isNaN(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function mergeVision(a, b) {
  // 共識合成：厚度/溫度做平均，顏色取共同或以 a 為主
  const thickness = Math.round((clamp(a.thickness, 1, 5) + clamp(b.thickness, 1, 5)) / 2);
  const tmin = Math.round((clamp(a.temp?.min ?? 10, -5, 40) + clamp(b.temp?.min ?? 10, -5, 40)) / 2);
  const tmax = Math.round((clamp(a.temp?.max ?? 25, -5, 40) + clamp(b.temp?.max ?? 25, -5, 40)) / 2);

  const conf = clamp(((Number(a.confidence) || 0.6) + (Number(b.confidence) || 0.6)) / 2 + 0.08, 0, 1);

  return {
    name: a.name || b.name || "未命名單品",
    category: a.category || b.category || "上衣",
    style: a.style || b.style || "極簡",
    material: a.material || b.material || "未知",
    fit: a.fit || b.fit || "一般",
    thickness,
    temp: { min: Math.min(tmin, tmax), max: Math.max(tmin, tmax) },
    colors: a.colors || b.colors || { dominant: "#888888", secondary: "#CCCCCC" },
    notes: a.notes || b.notes || "",
    confidence: conf
  };
}

export default async function handler(req, res) {
  try {
    if (!KEY) {
      return res.status(400).json({ error: "Missing GEMINI_API_KEY in Vercel Environment Variables" });
    }

    const { task } = req.body || {};

    // ---- Vision (衣物照片辨識) : 雙輪共識 ----
    if (task === "vision") {
      const { imageDataUrl } = req.body;
      if (!imageDataUrl || !imageDataUrl.includes(",")) {
        return res.status(400).json({ error: "Missing imageDataUrl" });
      }

      const base64 = imageDataUrl.split(",")[1];

      const prompt = `
你是衣物視覺辨識助手。請只輸出 JSON（不要加任何說明文字）。
欄位格式固定如下：
{
 "name": string,
 "category": "上衣"|"下著"|"鞋子"|"外套"|"包包"|"配件"|"內著"|"運動"|"正式",
 "style": string,
 "material": string,
 "fit": string,
 "thickness": 1..5,
 "temp": {"min": -5..40, "max": -5..40},
 "colors": {"dominant": "#RRGGBB", "secondary":"#RRGGBB"},
 "notes": string,
 "confidence": 0..1
}
要求：
- thickness 1=很薄 5=很厚
- temp 為建議穿著溫度區間
- colors 請用最接近的 hex
`;

      const body = {
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: base64 } }
            ]
          }
        ]
      };

      // flash + pro 各做一次（加入 -latest 避免找不到模型）
      const flash = await callWithFallback(["gemini-1.5-flash-latest", "gemini-1.5-pro-latest"], body);
      const pro = await callWithFallback(["gemini-1.5-pro-latest", "gemini-1.5-flash-latest"], body);

      const a = safeJsonParse(flash.text);
      const b = safeJsonParse(pro.text);

      const merged = mergeVision(a, b);

      return res.status(200).json({
        ...merged,
        _meta: {
          models: [flash.model, pro.model],
          mode: "dual_consensus"
        }
      });
    }

    // ---- Stylist (自動搭配) ----
    if (task === "stylist") {
      const { closet, profile, location, occasion, style, styleMemory, tempC } = req.body;

      const prompt = `
你是 AI 穿搭造型師。請只輸出 JSON（不要任何額外說明）。
你會收到：
- closet：衣櫥清單（包含 category/style/material/thickness/temp/colors/location）
- profile：身型資料（height/weight/bodyType）
- styleMemory：使用者偏好記憶（由收藏與教材筆記萃取）
- location：台北/新竹/全部（衣物存放地點）
- occasion：場合
- style：風格
- tempC：當前溫度（可為 null）

輸出格式：
{
 "outfit": {
   "topId": string|null,
   "bottomId": string|null,
   "outerId": string|null,
   "shoeId": string|null,
   "accessoryIds": string[]
 },
 "why": string[],
 "tips": string[],
 "confidence": 0..1,
 "styleName": string
}

規則：
- 優先使用符合 location 的衣物（若 location=全部則不限制）
- 若 tempC 有值，請避免不合理厚度（例如 30 度仍給厚外套）
- 參考 profile 與 styleMemory 提高貼合度
- 若衣櫥不足，允許輸出 null，但要在 why/tips 說明缺什麼
`;

      const body = {
        contents: [
          {
            parts: [
              { text: prompt },
              { text: JSON.stringify({ closet, profile, location, occasion, style, styleMemory, tempC }) }
            ]
          }
        ]
      };

      const out = await callWithFallback(["gemini-1.5-flash-latest", "gemini-1.5-pro-latest"], body);
      const j = safeJsonParse(out.text);

      return res.status(200).json({
        ...j,
        _meta: { model: out.model }
      });
    }

    // ---- 多選搭配解釋（你勾選多件衣物 → AI 合理化/建議補位）----
    if (task === "mixExplain") {
      const { selectedItems, profile, styleMemory, tempC, occasion } = req.body;

      const prompt = `
你是穿搭顧問。請只輸出 JSON。
輸入會包含多件衣物（selectedItems）。請判斷它們是否能成為一套：
輸出格式：
{
 "summary": string,
 "compatibility": 0..1,
 "goodPoints": string[],
 "risks": string[],
 "suggestedAdds": [{"slot":"上衣|下著|外套|鞋子|配件","hint":string}],
 "styleName": string,
 "tips": string[]
}
請參考 profile / styleMemory / tempC / occasion。
`;

      const body = {
        contents: [
          {
            parts: [
              { text: prompt },
              { text: JSON.stringify({ selectedItems, profile, styleMemory, tempC, occasion }) }
            ]
          }
        ]
      };

      const out = await callWithFallback(["gemini-1.5-pro-latest", "gemini-1.5-flash-latest"], body);
      const j = safeJsonParse(out.text);

      return res.status(200).json({
        ...j,
        _meta: { model: out.model }
      });
    }

    // ---- 筆記教材 AI 摘要（圖片/文字 → 教學摘要與要點）----
    if (task === "noteSummarize") {
      const { text, imageDataUrl } = req.body;

      const prompt = `
你是穿搭教學整理助手。請只輸出 JSON。
輸入可能含文字與圖片。請產出：
{
 "title": string,
 "bullets": string[],
 "do": string[],
 "dont": string[],
 "tags": string[]
}
要求：簡短可用、以教學角度整理。
`;

      const parts = [{ text: prompt }];
      if (text) parts.push({ text: `TEXT:\n${text}` });

      if (imageDataUrl && imageDataUrl.includes(",")) {
        parts.push({
          inlineData: { mimeType: "image/jpeg", data: imageDataUrl.split(",")[1] }
        });
      }

      const body = { contents: [{ parts }] };

      const out = await callWithFallback(["gemini-1.5-flash-latest", "gemini-1.5-pro-latest"], body);
      const j = safeJsonParse(out.text);

      return res.status(200).json({ ...j, _meta: { model: out.model } });
    }

    return res.status(400).json({ error: "Unknown task" });
  } catch (e) {
    const status = e?.status || 500;
    return res.status(status).json({
      error: e?.message || "AI error",
      status
    });
  }
}
