export const config = { runtime: "nodejs" };

const API_KEY = process.env.GEMINI_API_KEY;

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function safeJsonParse(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  try { return JSON.parse(cleaned); } catch {}
  return null;
}

export default async function handler(req, res) {
  if (!API_KEY) {
    return json(res, 500, { error: "Vercel 環境變數 GEMINI_API_KEY 未設定" });
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "僅支援 POST 請求" });
  }

  const { task, body } = req.body;

  try {
    // 1. 取得模型列表並選擇最佳模型
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    const listData = await listRes.json();
    const models = listData.models || [];
    const bestModel = models.find(m => m.name.includes("gemini-1.5-flash"))?.name || "models/gemini-1.5-flash";

    let prompt = "";
    let parts = [];

    if (task === "vision") {
      prompt = `你是一名時尚設計師。請分析這張衣物圖片，回傳純 JSON：
      {
        "name": "品名",
        "category": "分類",
        "style": "風格",
        "tempRange": "適合溫度",
        "desc": "分析內容"
      }`;
      parts = [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data: body.image.split(",")[1] } }
      ];
    } else if (task === "stylist") {
      prompt = `你是一名專業造型師。場合：${body.occasion}，風格：${body.style}。
      衣櫃：${JSON.stringify(body.closet)}。
      請挑選一套，回傳 JSON: {"selectedIds": [], "reason": "...", "tips": "..."}`;
      parts = [{ text: prompt }];
    }

    const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${bestModel}:generateContent?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    const genData = await genRes.json();
    const resultText = genData.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = safeJsonParse(resultText);

    return json(res, 200, { ok: true, result: parsed });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}

