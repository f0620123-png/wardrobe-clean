export async function postJson(url, body){
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try{ data = JSON.parse(text); }catch{ data = { raw:text }; }
  if(!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    const e = new Error(msg);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

export async function aiVision({ imageDataUrl }){
  return postJson("/api/gemini", { task:"vision", imageDataUrl });
}

export async function aiStylist({ occasion, style, location, profile, closet }){
  return postJson("/api/gemini", { task:"stylist", occasion, style, location, profile, closet });
}