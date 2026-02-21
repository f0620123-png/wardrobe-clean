import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")).render(<App />);

// ==========================================
// 📱 新增：註冊 Service Worker 實現 PWA
// ==========================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(registration => {
      console.log("PWA Service Worker 註冊成功:", registration.scope);
    }).catch(error => {
      console.log("PWA Service Worker 註冊失敗:", error);
    });
  });
}
