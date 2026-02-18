// api/version.js
export const config = { runtime: "nodejs" };

export default function handler(req, res) {
  // 你可以在 Vercel 環境變數自己設定 APP_VERSION，例如 v15.0
  const appVersion = process.env.APP_VERSION || "v15.0";

  // Vercel 通常會提供以下環境變數（若沒提供就顯示 unknown）
  const vercelEnv = process.env.VERCEL_ENV || "unknown";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || "unknown";
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "unknown";
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || "unknown";

  // serverTime：每次呼叫都會變（用來確認你打到的不是舊回應）
  const serverTime = new Date().toISOString();

  res.status(200).json({
    appVersion,
    vercelEnv,
    branch,
    commit,
    deploymentId,
    serverTime
  });
}