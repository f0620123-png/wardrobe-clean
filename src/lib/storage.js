function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}


function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}


// 優化：LocalStorage 防爆機制
function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    if (e && (e.name === "QuotaExceededError" || e.code === 22)) {
      console.error("LocalStorage 已滿：", key);
      return false;
    }
    console.error("saveJson 失敗：", key, e);
    return false;
  }
}


function fmtDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * ===========
 * Image compression (優化版：保護 LocalStorage)
 * ===========
 */
// 圖片壓縮工具：將圖片縮小以產生輕量縮圖或傳給 AI 用的高畫質圖

export { uid, loadJson, saveJson, fmtDate };
