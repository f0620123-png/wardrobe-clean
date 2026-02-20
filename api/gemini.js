export default async function handler(req, res) {
  const KEY = process.env.GEMINI_API_KEY;
  
  try {
    // 直接請求模型清單，看看到底有哪些可以用
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${KEY}`;
    const r = await fetch(url);
    const j = await r.json();

    if (!r.ok) throw new Error(JSON.stringify(j));

    // 過濾出支援 generateContent 的模型名稱
    const availableModels = j.models
      .filter(m => m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name);

    return res.status(200).json({ 
      message: "找到可用模型了！請複製以下名稱替換到 CHAIN_FLASH 中",
      models: availableModels 
    });
  } catch (e) {
    return res.status(500).json({ error: "偵錯失敗", details: e.message });
  }
}
