function safeJsonParse(s) {
  try {
    const t = (s || '').trim();
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    return JSON.parse(first >= 0 && last > first ? t.slice(first, last + 1) : t);
  } catch {
    return { error: '解析失敗', raw: s };
  }
}

function supportsGenerateContent(m) {
  return Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent');
}

function pickModelCandidates(models = []) {
  const candidates = models.filter(supportsGenerateContent);
  const preferred = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro', 'flash', 'pro'];
  const out = [];
  const seen = new Set();
  for (const kw of preferred) {
    for (const m of candidates) {
      if (m.name?.toLowerCase().includes(kw) && !seen.has(m.name)) {
        out.push(m.name);
        seen.add(m.name);
      }
    }
  }
  for (const m of candidates) if (!seen.has(m.name)) out.push(m.name);
  return out.filter((n) => !/models\/gemini-2\.0-flash$/i.test(n));
}

async function callGenerateContent({ modelName, key, parts }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${key}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] })
  });
  const rawData = await response.json();
  return { response, rawData };
}

function profilePrompt(profile = {}) {
  return [
    `穿搭視角: ${profile.genderView || '中性'}`,
    `身高/體重: ${profile.height || '?'}cm / ${profile.weight || '?'}kg`,
    `體型: ${profile.bodyType || '未知'}`,
    `尺寸: 上衣${profile.topSize || '?'} / 褲子${profile.bottomSize || '?'} / 鞋${profile.shoeSize || '?'}`,
    `版型偏好: ${profile.fitPreference || '混合'}`,
    `偏好風格: ${(profile.stylePreferences || []).join('、') || '無'}`,
    `偏好顏色: ${(profile.colorPreferences || []).join('、') || '無'}`,
    `避免元素: ${(profile.avoidElements || []).join('、') || '無'}`,
    `穿搭目標: ${(profile.goals || []).join('、') || '無'}`
  ].join('\n');
}

export default async function handler(req, res) {
  try {
    const KEY = String(req.body?.userApiKey || process.env.GEMINI_API_KEY || '').trim();
    if (!KEY) return res.status(400).json({ error: '請先設定 Gemini API Key' });

    const { task, imageDataUrl, selectedItems, profile, styleMemory, tempC, occasion, closet, style, location, text } = req.body || {};

    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${KEY}`);
    const listData = await listRes.json();
    if (!listRes.ok) return res.status(500).json({ error: listData?.error?.message || '無法取得模型清單', raw: listData });

    const modelCandidates = pickModelCandidates(listData.models || []);
    if (!modelCandidates.length) return res.status(500).json({ error: '此金鑰找不到任何可用模型' });

    let parts = [];
    if (task === 'vision') {
      const base64 = imageDataUrl?.split(',')[1];
      if (!base64) return res.status(400).json({ error: '請提供圖片資料' });
      const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9+.-]+);base64,/)?.[1] || 'image/jpeg';
      parts = [{
        text: `你是衣物辨識專家。請分析圖片並只輸出 JSON：
{
  "name":"單品名稱",
  "category":"上衣/下著/鞋子/外套/包包/配件/內著/帽子/飾品",
  "style":"風格",
  "material":"材質猜測",
  "colors":{"dominant":"#HEX","secondary":"#HEX"},
  "thickness":1,
  "temp":{"min":15,"max":28},
  "notes":"一句穿搭備註"
}`
      }, { inlineData: { mimeType, data: base64 } }];
    } else if (task === 'mixExplain') {
      parts = [{
        text: `你是穿搭顧問。根據下列資訊分析使用者自選搭配，並只輸出 JSON。
【使用者 Profile】\n${profilePrompt(profile)}
【AI 記憶】\n${styleMemory || '無'}
【場合】${occasion || '日常'}
【體感溫度】${tempC || '未知'}°C
【已選單品】${JSON.stringify((selectedItems || []).map(i => ({ name: i.name, category: i.category, style: i.style, material: i.material, temp: i.temp })))}

輸出格式：
{
  "summary":"一句話總結",
  "goodPoints":["優點1","優點2"],
  "risks":["風險1"],
  "tips":["建議1","建議2"],
  "styleName":"風格名",
  "compatibility":0.88
}`
      }];
    } else if (task === 'stylist') {
      parts = [{
        text: `你是穿搭造型師。請依照使用者 profile 與審美偏好，在衣櫥中挑選一套最合適穿搭。
【使用者 Profile】\n${profilePrompt(profile)}
【AI 記憶】\n${styleMemory || '無'}
【需求】場合:${occasion || '日常'} / 風格:${style || '極簡'} / 地點:${location || '未知'} / 體感溫度:${tempC || '未知'}°C
【衣櫥清單】${JSON.stringify((closet || []).map(i => ({ id: i.id, name: i.name, category: i.category, style: i.style, material: i.material, thickness: i.thickness, temp: i.temp, location: i.location })))}

規則：
1. 優先符合穿搭視角、版型偏好、穿搭目標與避免元素。
2. 若衣櫥不足，仍要盡量組出可穿方案，並在 tips 說明缺少項目。
3. 只能使用衣櫥清單中的 id。
4. 只輸出 JSON。

輸出格式：
{
  "outfit":{"topId":null,"bottomId":null,"outerId":null,"shoeId":null,"accessoryIds":[]},
  "why":["理由1","理由2"],
  "tips":["建議1","建議2"],
  "styleName":"風格名",
  "confidence":0.82
}`
      }];
    } else if (task === 'noteSummarize') {
      parts = [{ text: `請摘要以下穿搭教材/筆記，只輸出 JSON：{"tags":["標籤"],"do":["建議"],"dont":["避免"]}` }];
      if (text) parts.push({ text: `筆記內容：${text}` });
      if (imageDataUrl) {
        const base64 = imageDataUrl.split(',')[1];
        const mimeType = imageDataUrl.match(/data:(image\/[a-zA-Z0-9+.-]+);base64,/)?.[1] || 'image/jpeg';
        if (base64) parts.push({ inlineData: { mimeType, data: base64 } });
      }
    } else if (task === 'ping') {
      parts = [{ text: 'Reply JSON only: {"ok":true}' }];
    } else {
      return res.status(400).json({ error: '未知的任務類型' });
    }

    let lastError = null;
    for (const modelName of modelCandidates) {
      const { response, rawData } = await callGenerateContent({ modelName, key: KEY, parts });
      if (!response.ok || rawData?.error) {
        const msg = rawData?.error?.message || 'Gemini API 錯誤';
        lastError = { modelName, msg, rawData };
        const m = msg.toLowerCase();
        if (m.includes('no longer available') || m.includes('deprecated') || m.includes('not available to new users') || m.includes('unsupported')) continue;
        return res.status(500).json({ error: msg, modelTried: modelName, raw: rawData });
      }
      const txt = rawData?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      const parsed = safeJsonParse(txt);
      return res.status(200).json({ ...parsed, _model: modelName });
    }

    return res.status(500).json({ error: lastError?.msg || '沒有可用模型', modelTried: lastError?.modelName, raw: lastError?.rawData });
  } catch (e) {
    return res.status(500).json({ error: e.message || '伺服器錯誤' });
  }
}
