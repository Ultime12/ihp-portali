import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareLargeDeployFiles } from "./deploy-package-utils.mjs";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const packageDir = join(rootPath, ".vercel", "finance-deploy");
const coreOrigin = "https://ihp.org.tr";

function proxyFunction(targetPath) {
  return `const CORE_ORIGIN = "${coreOrigin}";
const TARGET_PATH = "${targetPath}";

async function outboundBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  if (typeof request.body === "string") return request.body;
  if (request.body && typeof request.body === "object" && !request.body.pipe && !request.body.on) {
    return JSON.stringify(request.body);
  }
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8") || "{}";
}

export default async function handler(request, response) {
  try {
    const upstream = await fetch(\`\${CORE_ORIGIN}\${TARGET_PATH}\`, {
      method: request.method,
      headers: {
        "Content-Type": request.headers["content-type"] || "application/json",
        ...(request.headers.authorization ? { Authorization: request.headers.authorization } : {})
      },
      body: await outboundBody(request)
    });
    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
    const text = await upstream.text();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", contentType);
    return response.status(upstream.status).send(text);
  } catch {
    response.setHeader("Cache-Control", "no-store");
    return response.status(502).json({ error: "Finans sunucusuna şu anda ulaşılamıyor. Kısa süre sonra yeniden deneyin." });
  }
}
`;
}

await rm(packageDir, { recursive: true, force: true });
await mkdir(join(packageDir, ".vercel"), { recursive: true });
await cp(join(rootPath, "dist-finance"), join(packageDir, "public"), { recursive: true });
await prepareLargeDeployFiles(packageDir);

await writeFile(
  join(packageDir, ".vercel", "project.json"),
  JSON.stringify({
    projectId: "prj_4KhbBvdnmkmdvnafqhNLJ5Rjbn4D",
    orgId: "team_ltN2Wt7hR2bkCTZbAawhdnMR"
  }),
  "utf8"
);

await writeFile(
  join(packageDir, "package.json"),
  JSON.stringify(
    {
      name: "ihp-finans-deployment",
      private: true,
      type: "module",
      engines: { node: "22.x" }
    },
    null,
    2
  ),
  "utf8"
);

await writeFile(
  join(packageDir, "vercel.json"),
  JSON.stringify(
    {
      buildCommand: "node reconstruct-deploy-files.mjs",
      outputDirectory: "public",
      cleanUrls: true,
      headers: [
        {
          source: "/service-worker.js",
          headers: [
            { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
            { key: "Service-Worker-Allowed", value: "/" }
          ]
        },
        {
          source: "/manifest.webmanifest",
          headers: [
            { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
            { key: "Cache-Control", value: "public, max-age=300, must-revalidate" }
          ]
        },
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "DENY" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
          ]
        }
      ],
      rewrites: [
        { source: "/api/config", destination: "https://ihp.org.tr/api/config" },
        { source: "/api/push", destination: "https://ihp.org.tr/api/push" },
        { source: "/api/manage-member", destination: "https://ihp.org.tr/api/manage-member" },
        { source: "/api/client-error", destination: "https://ihp.org.tr/api/client-error" },
        { source: "/auth/:path*", destination: "/index.html" },
        { source: "/portal/:path*", destination: "/index.html" },
        { source: "/giris", destination: "/index.html" }
      ]
    },
    null,
    2
  ),
  "utf8"
);

console.log("İHP Finans deployment paketi .vercel/finance-deploy içinde hazırlandı.");
