// 1. 使用 AI Studio 最穩定的模型別名
const CHAIN_FLASH = ["gemini-1.5-flash"];
const CHAIN_PRO = ["gemini-1.5-pro"];

function getCleanKey() {
  // 👇 貼上你從 AI Studio 拿到的 AIzaSy... 金鑰
  return "AIzaSyD_QoMOBsFdWuIsidPzEiq6keSXbZTcSTQ"; 
}

async function callGenerate(model, body) {
  const KEY = getCleanKey();
  
  // ✨ 關鍵修正：這是 AI Studio 專用的標準 URL 格式
  // 注意：model 名稱前面不應該手動加 models/，除非變數裡沒含
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
    // 如果報 404，這裡會印出 Google 真正想要的名稱
    throw new Error(`Google 報錯 (${r.status}): ${j?.error?.message || text}`);
  }

  const out = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!out) throw new Error("API 回傳成功但無內容，可能是安全過濾機制觸發");
  return out;
}

// 簡化後的 fallback，確保不被複雜的 loop 搞混
async function callWithFallback(models, body) {
  let lastError = "";
  for (const m of models) {
    try {
      const result = await callGenerate(m, body);
      return { model: m, text: result };
    } catch (e) {
      lastError = e.message;
      continue; // 失敗就換下一個模型
    }
  }
  throw new Error("所有模型均失效。最後一個錯誤: " + lastError);
}

// --- 以下為解析與處理邏輯 (保持不變) ---
function safeJsonParse(s) {
  try {
    const trimmed = (s || "").trim();
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    return JSON.parse(trimmed);
  } catch (e) { return {}; }
}

export default async function handler(req, res) {
  try {
    const KEY = getCleanKey();
    if (!KEY || KEY.includes("貼在這裡")) return res.status(400).json({ error: "未貼上金鑰" });

    const { task, imageDataUrl } = req.body;

    if (task === "vision") {
      if (!imageDataUrl) return res.status(400).json({ error: "缺少圖片" });
      const base64 = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9]+);base64,/)?.[1] || "image/jpeg";

      const body = {
        contents: [{
          parts: [
            { text: "你是穿搭助手，請分析這件衣服並只輸出 JSON 格式 (name, category, style, material, fit, thickness(1-5), temp{min,max}, colors{dominant,secondary}, notes, confidence)" },
            { inlineData: { mimeType, data: base64 } }
          ]
        }]
      };

      const result = await callWithFallback(CHAIN_FLASH, body);
      return res.status(200).json({ ...safeJsonParse(result.text), _meta: { model: result.model } });
    }

    return res.status(400).json({ error: "未知任務" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
