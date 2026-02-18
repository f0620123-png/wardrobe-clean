// api/gemini.js
export const config = { runtime: "nodejs" };

/**
 * 這支 API 會：
 * 1) 先 ListModels 找出「你這支 GEMINI_API_KEY 真的可用的 models」
 * 2) 自動挑選最佳模型（flash -> pro -> 其他支援 generateContent 的）
 * 3) 支援 task=vision / task=stylist / task=text
 */

const LIST_MODELS_CACHE_MS = 10 * 60 * 1000; // 10分鐘快取
let cached = {
  at: 0,
  models: [] // [{ name, displayName, supportedGenerationMethods }]
};

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
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const mid = cleaned.slice(start, end + 1);
    try { return JSON.parse(mid); } catch {}
  }
  try { return JSON.parse(cleaned); } catch {}
  return null;
}

function clamp(n, a, b) {
  const x = Number(n);
  if (Number.isNaN(x)) return a;
  return Math.max(a, Math.min(b, x));
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data?.error) {
      const msg = data?.error?.message || `HTTP ${r.status}`;
      const err = new Error(msg);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/** 取得此 API key 可用的模型清單（並快取） */
async function listModels(apiKey) {
  const now = Date.now();
  if (cached.models.length && now - cached.at < LIST_MODELS_CACHE_MS) {
    return cached.models;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson(url, { method: "GET" });

  const models = Array.isArray(data?.models) ? data.models : [];
  // 只留 name / supportedGenerationMethods
  const normalized = models.map((m) => ({
    name: m?.name || "",
    displayName: m?.displayName || "",
    supportedGenerationMethods: Array.isArray(m?.supportedGenerationMethods)
      ? m.supportedGenerationMethods
      : []
  }));

  cached = { at: now, models: normalized };
  return normalized;
}

/**
 * 挑出最適合的「可 generateContent」模型
 * - 不猜固定名稱
 * - 以你這支 key 真正存在的模型為主
 */
function pickBestModel(models) {
  // 只挑支援 generateContent 的
  const usable = models.filter((m) =>
    m?.name &&
    m.supportedGenerationMethods?.includes("generateContent")
  );

  // 優先排序：flash > pro > 其他（包含 newer/exp）
  const prefer = [
    // 你之前想要的
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    // 常見 alias/變體（避免不同帳號命名差異）
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
    // 如果 key 只給到較新系列
    "gemini-2.0-flash",
    "gemini-2.0-pro",
    "gemini-2.0-flash-latest",
    "gemini-2.0-pro-latest",
    // 最後兜底（任何 gemini）
    "gemini"
  ];

  const nameOnly = usable.map((m) => m.name); // e.g. "models/gemini-1.5-flash"
  const contains = (needle) => nameOnly.find((n) => n.includes(needle));

  for (const p of prefer) {
    const found = contains(p);
    if (found) return found;
  }

  // 如果都沒有命中 prefer，就拿第一個可用的
  return usable[0]?.name || null;
}

async function callGenerateContent({ apiKey, modelName, parts, temperature = 0.2 }) {
  // modelName 會是 "models/xxxx"
  const url = `https://generativelanguage.googleapis.com/v1beta/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature }
  };

  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

/** 有些狀況會 429/5xx，做一點 retry */
async function generateWithRetry({ apiKey, modelName, parts, temperature }) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const data = await callGenerateContent({ apiKey, modelName, parts, temperature });
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
      return { text, raw: data, modelName, attempt };
    } catch (e) {
      lastErr = e;
      const status = e?.status || 0;
      const transient = status === 429 || status === 500 || status === 503 || status === 0;
      if (attempt === 1 && transient) {
        await sleep(600 + Math.floor(Math.random() * 500));
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("generate failed");
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
`.trim();
}

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing GEMINI_API_KEY" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const task = body?.task || "vision";

    // 1) 取得可用模型清單
    const models = await listModels(apiKey);

    // 2) 挑最佳可用模型（注意：回傳會是 "models/xxx"）
    const modelName = pickBestModel(models);
    if (!modelName) {
      return json(res, 500, {
        error: "No available model supports generateContent for this API key.",
        hint: "Check your API key / project settings and call /api/version to confirm deploy.",
        modelsCount: models.length
      });
    }

    // vision
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
        { inlineData: { mimeType: mime, data: base64 } }
      ];

      const out = await generateWithRetry({ apiKey, modelName, parts, temperature: 0.2 });
      const parsed = safeJsonParse(out.text);

      if (!parsed) {
        return json(res, 200, {
          ok: false,
          task,
          model: out.modelName,
          error: "JSON_PARSE_FAILED",
          rawText: out.text
        });
      }

      if (parsed?.temp) {
        const min = clamp(parsed.temp.min, -5, 40);
        const max = clamp(parsed.temp.max, -5, 40);
        parsed.temp = min < max ? { min, max } : { min: 18, max: 30 };
      }

      return json(res, 200, { ok: true, task, model: out.modelName, result: parsed });
    }

    // stylist
    if (task === "stylist") {
      const occasion = body?.occasion || "日常";
      const style = body?.style || "極簡";
      const location = body?.location || "台北";
      const profile = body?.profile || { height: 175, weight: 70, shape: "H型" };
      const closet = Array.isArray(body?.closet) ? body.closet : [];

      const parts = [{ text: stylistPrompt({ occasion, style, location, profile, closet }) }];
      const out = await generateWithRetry({ apiKey, modelName, parts, temperature: 0.3 });
      const parsed = safeJsonParse(out.text);

      if (!parsed) {
        return json(res, 200, {
          ok: false,
          task,
          model: out.modelName,
          error: "JSON_PARSE_FAILED",
          rawText: out.text
        });
      }

      return json(res, 200, { ok: true, task, model: out.modelName, result: parsed });
    }

    // text
    const prompt = body?.prompt;
    if (!prompt) return json(res, 400, { error: "Missing prompt" });

    const parts = [{ text: String(prompt) }];
    const out = await generateWithRetry({ apiKey, modelName, parts, temperature: 0.4 });

    return json(res, 200, { ok: true, task: "text", model: out.modelName, text: out.text });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
}