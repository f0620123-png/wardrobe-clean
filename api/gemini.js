// api/gemini.js
export const config = { runtime: "nodejs" };

const MODELS = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"];

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse(text) {
  if (!text) return null;

  // remove code fences
  const cleaned = String(text).replace(/```json|```/g, "").trim();

  // try to extract object
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const mid = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(mid);
    } catch (_) {}
  }

  try {
    return JSON.parse(cleaned);
  } catch (_) {}
  return null;
}

function clamp(n, a, b) {
  const x = Number(n);
  if (Number.isNaN(x)) return a;
  return Math.max(a, Math.min(b, x));
}

async function callGeminiOnce({ apiKey, model, parts, temperature = 0.2 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || data?.error) {
      const msg = data?.error?.message || `HTTP ${r.status}`;
      const err = new Error(msg);
      err.status = r.status;
      err.data = data;
      throw err;
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";

    return { text, raw: data };
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiWithFallback({ apiKey, parts, temperature }) {
  let lastErr = null;

  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const out = await callGeminiOnce({ apiKey, model, parts, temperature });
        return { ...out, model, attempt, fallbackIndex: i };
      } catch (e) {
        lastErr = e;
        const status = e?.status || 0;
        const transient = status === 429 || status === 500 || status === 503 || status === 0;
        if (attempt === 1 && transient) {
          await sleep(500 + Math.floor(Math.random() * 400));
          continue;
        }
        break;
      }
    }
  }

  throw lastErr || new Error("All models failed");
}

function visionPrompt() {
  return `
你是服裝與穿搭領域的視覺分析助手。你必須只輸出 JSON（不得有任何多餘文字）。
請從「單一衣物照片」推斷並輸出下列欄位：
{
  "name": string,
  "category": "上衣"|"下著"|"鞋子"|"外套"|"包包"|"配件"|"內著"|"運動"|"正式",
  "style": "極簡"|"日系"|"韓系"|"街頭"|"商務"|"復古"|"戶外"|"運動"|"正式",
  "material": string,
  "fit": "寬鬆"|"合身"|"修身"|"短版"|"長版"|"直筒"|"窄版"|"不確定",
  "thickness": 1|2|3|4|5,
  "temp": { "min": number, "max": number },
  "colors": {
    "dominant": { "name": string, "hex": string },
    "secondary": { "name": string, "hex": string },
    "tone": "冷"|"暖"|"中性",
    "saturation": "低"|"中"|"高",
    "brightness": "低"|"中"|"高"
  },
  "notes": string,
  "confidence": number
}
規則：
- 必須是合法 JSON
- hex 必須 "#RRGGBB"
- temp.min < temp.max，且範圍 -5 到 40
`.trim();
}

function stylistPrompt({ occasion, style, location, profile, closet }) {
  return `
你是「AI 造型師」。請只輸出 JSON（不得有多餘文字）。
任務：根據場合與風格，從衣櫥中挑出最適合的一套穿搭（至少：上衣 + 下著 + 鞋子；必要時可加外套/配件）。
考量：
- 只從 closet 清單挑選
- 參考 profile（身高/體重/身型）
- 盡量讓溫度區間合理（若有 temp）

輸入：
occasion: ${occasion}
style: ${style}
location: ${location}
profile: ${JSON.stringify(profile)}
closet: ${JSON.stringify(closet)}

輸出 JSON：
{
  "outfit": {
    "topId": string|null,
    "bottomId": string|null,
    "shoeId": string|null,
    "outerId": string|null,
    "accessoryIds": string[]
  },
  "why": string[],
  "tips": string[],
  "confidence": number
}
規則：
- id 必須存在於 closet
- 若缺件，填 null，並在 why 說明缺什麼
`.trim();
}

export default async function handler(req, res) {
  try {
    // CORS (保險)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing GEMINI_API_KEY" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const task = body?.task || "vision"; // vision | stylist | text

    if (task === "vision") {
      const imageDataUrl = body?.imageDataUrl;
      if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
        return json(res, 400, { error: "task=vision requires imageDataUrl (data:image/...)" });
      }

      const comma = imageDataUrl.indexOf(",");
      const meta = imageDataUrl.slice(0, comma);
      const base64 = imageDataUrl.slice(comma + 1);
      const mime = meta.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/)?.[1] || "image/jpeg";

      const parts = [
        { text: visionPrompt() },
        { inlineData: { mimeType: mime, data: base64 } },
      ];

      const out = await callGeminiWithFallback({ apiKey, parts, temperature: 0.2 });
      const parsed = safeJsonParse(out.text);

      if (!parsed) {
        return json(res, 200, { ok: false, task, model: out.model, error: "JSON_PARSE_FAILED", rawText: out.text });
      }

      // lightweight sanitize
      if (parsed?.temp) {
        const min = clamp(parsed.temp.min, -5, 40);
        const max = clamp(parsed.temp.max, -5, 40);
        parsed.temp = min < max ? { min, max } : { min: 18, max: 30 };
      }
      if (parsed?.colors?.dominant?.hex && !/^#[0-9A-Fa-f]{6}$/.test(parsed.colors.dominant.hex)) {
        parsed.colors.dominant.hex = "#000000";
      }
      if (parsed?.colors?.secondary?.hex && !/^#[0-9A-Fa-f]{6}$/.test(parsed.colors.secondary.hex)) {
        parsed.colors.secondary.hex = "#FFFFFF";
      }

      return json(res, 200, { ok: true, task, model: out.model, result: parsed });
    }

    if (task === "stylist") {
      const occasion = body?.occasion || "日常";
      const style = body?.style || "極簡";
      const location = body?.location || "台北";
      const profile = body?.profile || { height: 175, weight: 70, shape: "H型" };
      const closet = Array.isArray(body?.closet) ? body.closet : [];

      const parts = [{ text: stylistPrompt({ occasion, style, location, profile, closet }) }];

      const out = await callGeminiWithFallback({ apiKey, parts, temperature: 0.3 });
      const parsed = safeJsonParse(out.text);

      if (!parsed) {
        return json(res, 200, { ok: false, task, model: out.model, error: "JSON_PARSE_FAILED", rawText: out.text });
      }

      return json(res, 200, { ok: true, task, model: out.model, result: parsed });
    }

    // task=text (用來做「驗證」按鈕、或簡單對話)
    const prompt = body?.prompt;
    if (!prompt) return json(res, 400, { error: "Missing prompt" });

    const parts = [{ text: String(prompt) }];
    const out = await callGeminiWithFallback({ apiKey, parts, temperature: 0.4 });

    return json(res, 200, { ok: true, task: "text", model: out.model, text: out.text });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
}