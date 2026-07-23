import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareLargeDeployFiles } from "./deploy-package-utils.mjs";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const packageDir = join(rootPath, ".vercel", "mail-deploy");

await rm(packageDir, { recursive: true, force: true });
await mkdir(join(packageDir, ".vercel"), { recursive: true });
await cp(join(rootPath, "dist-mail"), join(packageDir, "public"), { recursive: true });
await prepareLargeDeployFiles(packageDir);

await writeFile(
  join(packageDir, ".vercel", "project.json"),
  JSON.stringify({
    projectId: "prj_arIyV9xcIiCPTGEdug7W8Udgw6uJ",
    orgId: "team_ltN2Wt7hR2bkCTZbAawhdnMR"
  }),
  "utf8"
);

await writeFile(
  join(packageDir, "package.json"),
  JSON.stringify({
    name: "ihp-mail-deployment",
    private: true,
    type: "module",
    engines: { node: "22.x" }
  }, null, 2),
  "utf8"
);

await writeFile(
  join(packageDir, "vercel.json"),
  JSON.stringify({
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
      { source: "/api/mailbox", destination: "https://ihp.org.tr/api/mailbox" },
      { source: "/api/manage-member", destination: "https://ihp.org.tr/api/manage-member" },
      { source: "/api/client-error", destination: "https://ihp.org.tr/api/client-error" },
      { source: "/auth/:path*", destination: "/index.html" },
      { source: "/portal/:path*", destination: "/index.html" },
      { source: "/giris", destination: "/index.html" }
    ]
  }, null, 2),
  "utf8"
);

console.log("İHP Mail deployment paketi .vercel/mail-deploy içinde hazırlandı.");
