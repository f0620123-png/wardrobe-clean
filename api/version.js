export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  res.status(200).json({
    appVersion: "v15.2",
    appSemver: "15.2.0",
    vercelEnv: process.env.VERCEL_ENV || "local",
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || "local",
    git: {
      branch: process.env.VERCEL_GIT_COMMIT_REF || "main",
      commit: process.env.VERCEL_GIT_COMMIT_SHA || "local"
    },
    serverTime: new Date().toISOString()
  });
}