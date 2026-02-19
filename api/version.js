export const config = { runtime: "nodejs" };

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const appVersion = process.env.APP_VERSION || "v16.0";
  const vercelEnv = process.env.VERCEL_ENV || "unknown";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || "unknown";
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "unknown";
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || "unknown";
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
