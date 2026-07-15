import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareLargeDeployFiles } from "./deploy-package-utils.mjs";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const packageDir = join(rootPath, ".vercel", "main-deploy");

await rm(packageDir, { recursive: true, force: true });
await mkdir(join(packageDir, ".vercel"), { recursive: true });
await mkdir(join(packageDir, "api"), { recursive: true });
await mkdir(join(packageDir, "serverless-handlers"), { recursive: true });
await mkdir(join(packageDir, "src", "features"), { recursive: true });
await cp(join(rootPath, "dist"), join(packageDir, "public"), { recursive: true });
await cp(join(rootPath, "server"), join(packageDir, "server"), { recursive: true });
await cp(join(rootPath, "src", "features", "flappy-engine.js"), join(packageDir, "src", "features", "flappy-engine.js"));
await cp(join(rootPath, "src", "features", "snake-engine.js"), join(packageDir, "src", "features", "snake-engine.js"));

const apiFiles = (await readdir(join(rootPath, "api"), { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => entry.name)
  .sort();

for (const apiFile of apiFiles) {
  await cp(
    join(rootPath, "api", apiFile),
    join(packageDir, "serverless-handlers", apiFile)
  );
}

const handlerImports = apiFiles
  .map((apiFile, index) => `import handler${index} from "../serverless-handlers/${apiFile}";`)
  .join("\n");
const handlerRoutes = apiFiles
  .map((apiFile, index) => `  ${JSON.stringify(apiFile.replace(/\.js$/, ""))}: handler${index}`)
  .join(",\n");

await writeFile(
  join(packageDir, "api", "[...routePath].js"),
  `${handlerImports}

const handlers = Object.freeze({
${handlerRoutes}
});

function resolveRoute(request) {
  const routeParam = request?.query?.routePath;
  if (Array.isArray(routeParam)) return routeParam.join("/");
  if (typeof routeParam === "string" && routeParam.trim()) return routeParam.trim();

  try {
    return new URL(request?.url || "/", "https://ihp.org.tr")
      .pathname
      .replace(/^\\/api\\/?/, "")
      .replace(/\\/+$/, "");
  } catch {
    return "";
  }
}

export default async function apiRouter(request, response) {
  const route = resolveRoute(request);
  const routeHandler = handlers[route];

  if (!routeHandler) {
    response.status(404).json({ error: "API endpoint not found." });
    return;
  }

  return routeHandler(request, response);
}
`,
  "utf8"
);
await prepareLargeDeployFiles(packageDir);

await writeFile(
  join(packageDir, ".vercel", "project.json"),
  JSON.stringify({
    projectId: "prj_zgp4HaDPAKCWRFqlm89PtVlxy69D",
    orgId: "team_ltN2Wt7hR2bkCTZbAawhdnMR"
  }),
  "utf8"
);

await writeFile(
  join(packageDir, "package.json"),
  JSON.stringify({
    name: "ihp-portali-deployment",
    private: true,
    type: "module",
    engines: { node: "24.x" },
    dependencies: { "web-push": "3.6.7" }
  }, null, 2),
  "utf8"
);

const vercelConfig = JSON.parse(await readFile(join(rootPath, "vercel.json"), "utf8"));
vercelConfig.buildCommand = "node reconstruct-deploy-files.mjs";
vercelConfig.outputDirectory = "public";
await writeFile(join(packageDir, "vercel.json"), JSON.stringify(vercelConfig, null, 2), "utf8");

console.log("İHP Portal production paketi .vercel/main-deploy içinde hazırlandı.");
