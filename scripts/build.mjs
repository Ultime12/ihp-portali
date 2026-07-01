import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const sourceDir = join(rootPath, "src");
const outputDir = join(rootPath, "dist");
const featureDir = join(sourceDir, "features");
const featureFiles = [
  "portal-core.js",
  "logo-report.js",
  "admin-role.js",
  "investigation-transfer.js",
  "governance.js",
  "agreements-ui.js",
  "agreements-runtime.js",
  "flappy-engine.js",
  "flappy-game.js",
  "snake-engine.js",
  "game-center.js",
  "credit-system.js",
  "premium-ui.js",
  "member-identity.js"
];

async function copyFile(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, await readFile(source));
}

async function copyDirectory(sourceDirectory, destinationDirectory) {
  const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const source = join(sourceDirectory, entry.name);
    const destination = join(destinationDirectory, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(source, destination);
    } else {
      await copyFile(source, destination);
    }
  }
}

async function compileDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (source === featureDir) continue;
      await compileDirectory(source);
      continue;
    }
    if (extname(entry.name) !== ".ts") continue;

    const relativePath = relative(sourceDir, source).replace(/\.ts$/, ".js");
    const destination = join(outputDir, "src", relativePath);
    const typescript = await readFile(source, "utf8");
    const javascript = stripTypeScriptTypes(typescript, { mode: "strip" });
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, javascript, "utf8");
  }
}

async function composeApplication() {
  const appPath = join(outputDir, "src", "app.js");
  const listenerAnchor = 'document.addEventListener("click", handleClick);';
  let application = await readFile(appPath, "utf8");

  if (!application.includes(listenerAnchor)) {
    throw new Error("Uygulama dinleyici noktası bulunamadı.");
  }

  for (const featureName of featureFiles) {
    const feature = await readFile(join(featureDir, featureName), "utf8");
    application = application.replace(listenerAnchor, `${feature}\n\n${listenerAnchor}`);
  }

  const optimized = await transform(application, {
    charset: "utf8",
    format: "esm",
    legalComments: "none",
    minify: true,
    target: "es2022"
  });
  await writeFile(appPath, optimized.code, "utf8");
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await copyFile(join(rootPath, "index.html"), join(outputDir, "index.html"));
await copyFile(join(rootPath, "styles.css"), join(outputDir, "styles.css"));
await copyFile(join(rootPath, "premium.css"), join(outputDir, "premium.css"));
await copyDirectory(join(rootPath, "assets"), join(outputDir, "assets"));
await compileDirectory(sourceDir);
await composeApplication();

console.log("Vercel çıktısı dist klasöründe oluşturuldu.");
