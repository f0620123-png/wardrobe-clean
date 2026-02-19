export async function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function compressImageToDataUrl(file, opts={}){
  const maxW = opts.maxW ?? 1280;
  const quality = opts.quality ?? 0.72;

  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  const ratio = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(src){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
