export const config = { runtime: "nodejs" };

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const appVersion = process.env.APP_VERSION || "v15.0";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || "local";
  const serverTime = new Date().toISOString();

  res.status(200).json({
    appVersion,
    commit,
    serverTime,
    status: "online"
  });
}

