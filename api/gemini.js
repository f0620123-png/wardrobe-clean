export default async function handler(req, res) {
  try {
    // CORS（同網域通常不需要，但保險）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing GEMINI_API_KEY in server env.' });

    const { prompt, imageBase64 } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing prompt.' });
    }

    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            ...(imageBase64
              ? [{ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }]
              : [])
          ]
        }
      ]
    };

    let lastErr = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await r.json();

        if (!r.ok || data?.error) {
          const msg = data?.error?.message || `HTTP ${r.status}`;
          throw new Error(msg);
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty response from Gemini.');

        return res.status(200).json({ text, model });
      } catch (e) {
        lastErr = e;
      }
    }

    return res.status(500).json({ error: lastErr?.message || 'Gemini request failed.' });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Server error.' });
  }
}