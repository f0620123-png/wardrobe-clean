export const config = { runtime: "nodejs" };

async function fetchJson(url){
  const r = await fetch(url);
  const j = await r.json().catch(()=> ({}));
  if(!r.ok || j?.error) {
    const msg = j?.error?.message || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return j;
}

export default async function handler(req, res){
  res.setHeader("Cache-Control", "no-store");
  const apiKey = process.env.GEMINI_API_KEY;
  if(!apiKey) return res.status(500).json({ ok:false, error:"Missing GEMINI_API_KEY" });

  try{
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`;
    const data = await fetchJson(url);
    const models = (data?.models||[]).map(m=>({
      name: m?.name,
      displayName: m?.displayName,
      supportedGenerationMethods: m?.supportedGenerationMethods
    }));
    res.status(200).json({ ok:true, count: models.length, models });
  }catch(e){
    res.status(500).json({ ok:false, error: String(e.message||e) });
  }
}
