import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, join, relative } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import { build, transform } from "esbuild";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const sourceDir = join(rootPath, "src");
const buildVariant = process.argv.includes("--variant=dk")
  ? "dk"
  : process.argv.includes("--variant=finance")
    ? "finance"
    : process.argv.includes("--variant=mail")
      ? "mail"
    : "main";
const isDisciplinePortal = buildVariant === "dk";
const isFinancePortal = buildVariant === "finance";
const isMailPortal = buildVariant === "mail";
const outputDir = join(
  rootPath,
  isDisciplinePortal ? "dist-dk" : isFinancePortal ? "dist-finance" : isMailPortal ? "dist-mail" : "dist"
);
const featureDir = join(sourceDir, "features");
const featureFiles = isMailPortal
  ? [
      "portal-core.js",
      "premium-ui.js",
      "member-identity.js",
      "mail-center.js",
      "assistant.js",
      "mail-portal.js",
      "pwa-mobile.js"
    ]
  : isFinancePortal
  ? [
      "pdf-builder.js",
      "credit-system.js",
      "finance-system.js",
      "premium-ui.js",
      "member-identity.js",
      "finance-portal.js",
      "pwa-mobile.js"
    ]
  : [
      "portal-core.js",
      "logo-report.js",
      "admin-role.js",
      "investigation-transfer.js",
      "governance.js",
      "regulation-pdf.js",
      "agreements-ui.js",
      "agreements-runtime.js",
      "flappy-engine.js",
      "flappy-game.js",
      "snake-engine.js",
      "game-center.js",
      "credit-system.js",
      "finance-system.js",
      "premium-ui.js",
      "member-identity.js",
      "assistant.js",
      ...(isDisciplinePortal ? ["dk-portal.js"] : ["main-portal-split.js"]),
      "pwa-mobile.js"
    ];

const pwaDefinitions = {
  main: {
    name: "İHP Mobil",
    shortName: "İHP",
    description: "İHP öğrenci topluluğu mobil çalışma alanı.",
    themeColor: "#071528",
    backgroundColor: "#071528",
    startUrl: "/#/portal/overview",
    iconRoot: "/assets/pwa"
  },
  dk: {
    name: "İHP Disiplin Kurulu",
    shortName: "İHP DK",
    description: "İHP Disiplin Kurulu güvenli çalışma alanı.",
    themeColor: "#21070d",
    backgroundColor: "#140408",
    startUrl: "/#/portal/overview",
    iconRoot: "/assets/pwa/dk"
  },
  finance: {
    name: "İHP Finans",
    shortName: "İHP Finans",
    description: "İHP kredi ve sanal portföy çalışma alanı.",
    themeColor: "#030b08",
    backgroundColor: "#030b08",
    startUrl: "/#/portal/overview",
    iconRoot: "/assets/pwa/finance"
  },
  mail: {
    name: "İHP Mail",
    shortName: "İHP Mail",
    description: "İHP kurumsal posta çalışma alanı.",
    themeColor: "#071528",
    backgroundColor: "#071528",
    startUrl: "/#/portal/mail",
    iconRoot: "/assets/pwa"
  }
};

function pwaManifest() {
  const definition = pwaDefinitions[buildVariant];
  const shortcuts = buildVariant === "main"
    ? [
        { name: "Portal", short_name: "Portal", url: "/#/portal/overview", icons: [{ src: "/assets/pwa/icon-192.png", sizes: "192x192", type: "image/png" }] },
        { name: "İHP Mail", short_name: "Mail", url: "/mail/#/portal/mail", icons: [{ src: "/assets/pwa/icon-192.png", sizes: "192x192", type: "image/png" }] },
        { name: "İHP Finans", short_name: "Finans", url: "/finans/#/portal/overview", icons: [{ src: "/assets/pwa/finance/icon-192.png", sizes: "192x192", type: "image/png" }] }
      ]
    : [];
  return {
    id: "/",
    name: definition.name,
    short_name: definition.shortName,
    description: definition.description,
    lang: "tr",
    dir: "ltr",
    start_url: definition.startUrl,
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: definition.backgroundColor,
    theme_color: definition.themeColor,
    prefer_related_applications: false,
    icons: [
      { src: `${definition.iconRoot}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${definition.iconRoot}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${definition.iconRoot}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ],
    shortcuts
  };
}

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

async function createStaticAssetVersion() {
  const assetPaths = [
    "src/app.js",
    "styles.css",
    "premium.css",
    "pwa.css",
    ...(isDisciplinePortal ? ["dk.css"] : []),
    ...(isMailPortal ? ["mail.css"] : [])
  ];
  const hash = createHash("sha256");

  for (const assetPath of assetPaths) {
    hash.update(assetPath);
    hash.update(await readFile(join(outputDir, assetPath)));
  }

  return hash.digest("hex").slice(0, 12);
}

function versionStaticAssets(html, version) {
  return html.replace(
    /(href|src)="(\.\/(?:styles|premium|pwa|dk|mail)\.css|\.\/src\/app\.js)"/g,
    `$1="$2?v=${version}"`
  );
}

async function versionJavaScriptImports(directory, version) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await versionJavaScriptImports(path, version);
      continue;
    }
    if (extname(entry.name) !== ".js") continue;

    const source = await readFile(path, "utf8");
    const versioned = source
      .replace(
        /(\bfrom\s*["'])(\.{1,2}\/[^"'?#]+\.js)(["'])/g,
        `$1$2?v=${version}$3`
      )
      .replace(
        /(\bimport\s*\(\s*["'])(\.{1,2}\/[^"'?#]+\.js)(["']\s*\))/g,
        `$1$2?v=${version}$3`
      );
    await writeFile(path, versioned, "utf8");
  }
}

async function bundlePasskeyClient() {
  await build({
    entryPoints: [join(sourceDir, "pwa-passkeys.ts")],
    outfile: join(outputDir, "src", "pwa-passkeys.js"),
    bundle: true,
    charset: "utf8",
    format: "esm",
    legalComments: "none",
    minify: true,
    platform: "browser",
    target: "es2022"
  });
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const sourceHtml = await readFile(join(rootPath, "index.html"), "utf8");
const outputHtml = isDisciplinePortal
  ? sourceHtml
      .replace(
        '<meta\n      name="description"\n      content="İHP öğrenci topluluğu için gizlilik odaklı modern portal."\n    />',
        '<meta\n      name="description"\n      content="İHP Disiplin Kurulu için güvenli soruşturma ve karar yönetim sistemi."\n    />'
      )
      .replace("<title>İHP | Öğrenci Topluluğu Portalı</title>", "<title>İHP DK | Disiplin Kurulu</title>")
      .replace('<link rel="stylesheet" href="./premium.css" />', '<link rel="stylesheet" href="./premium.css" />\n    <link rel="stylesheet" href="./dk.css" />')
  : isFinancePortal
    ? sourceHtml
        .replace(
          '<meta\n      name="description"\n      content="İHP öğrenci topluluğu için gizlilik odaklı modern portal."\n    />',
          '<meta\n      name="description"\n      content="İHP Finans ve Kredi Sistemi için ayrı, güvenli portal."\n    />'
        )
        .replace("<title>İHP | Öğrenci Topluluğu Portalı</title>", "<title>İHP Finans | Kredi ve Portföy</title>")
    : isMailPortal
      ? sourceHtml
          .replace(
            '<meta\n      name="description"\n      content="İHP öğrenci topluluğu için gizlilik odaklı modern portal."\n    />',
            '<meta\n      name="description"\n      content="İHP kurumsal üye posta ve yazışma sistemi."\n    />'
          )
          .replace("<title>İHP | Öğrenci Topluluğu Portalı</title>", "<title>İHP Mail | Kurumsal Posta</title>")
          .replace('<link rel="stylesheet" href="./premium.css" />', '<link rel="stylesheet" href="./premium.css" />\n    <link rel="stylesheet" href="./mail.css" />')
      : sourceHtml;
const pwaDefinition = pwaDefinitions[buildVariant];
const finalizedHtml = outputHtml
  .replace('name="ihp-app-variant" content="main"', `name="ihp-app-variant" content="${buildVariant}"`)
  .replace('name="theme-color" content="#071528"', `name="theme-color" content="${pwaDefinition.themeColor}"`)
  .replace('name="application-name" content="İHP Mobil"', `name="application-name" content="${pwaDefinition.name}"`)
  .replace('name="apple-mobile-web-app-title" content="İHP Mobil"', `name="apple-mobile-web-app-title" content="${pwaDefinition.shortName}"`)
  .replace('href="./assets/pwa/icon-192.png"', `href=".${pwaDefinition.iconRoot}/icon-192.png"`)
  .replace(
    '<link rel="icon" href="./assets/ihp-logo.svg" type="image/svg+xml" />',
    pwaDefinition.iconRoot === "/assets/pwa"
      ? '<link rel="icon" href="./assets/ihp-logo.svg" type="image/svg+xml" />'
      : `<link rel="icon" href=".${pwaDefinition.iconRoot}/icon-192.png" type="image/png" />`
  );
await copyFile(join(rootPath, "styles.css"), join(outputDir, "styles.css"));
await copyFile(join(rootPath, "premium.css"), join(outputDir, "premium.css"));
await copyFile(join(rootPath, "pwa.css"), join(outputDir, "pwa.css"));
const serviceWorker = (await readFile(join(rootPath, "service-worker.js"), "utf8"))
  .replaceAll("/assets/pwa/icon-192.png", `${pwaDefinition.iconRoot}/icon-192.png`)
  .replaceAll("/assets/pwa/icon-512.png", `${pwaDefinition.iconRoot}/icon-512.png`);
await writeFile(join(outputDir, "service-worker.js"), serviceWorker, "utf8");
await writeFile(join(outputDir, "manifest.webmanifest"), JSON.stringify(pwaManifest(), null, 2), "utf8");
if (isDisciplinePortal) {
  await copyFile(join(rootPath, "dk.css"), join(outputDir, "dk.css"));
}
if (isMailPortal) {
  await copyFile(join(rootPath, "mail.css"), join(outputDir, "mail.css"));
}
await copyDirectory(join(rootPath, "assets"), join(outputDir, "assets"));
await compileDirectory(sourceDir);
await bundlePasskeyClient();
await composeApplication();
const staticAssetVersion = await createStaticAssetVersion();
await versionJavaScriptImports(join(outputDir, "src"), staticAssetVersion);
await writeFile(
  join(outputDir, "index.html"),
  versionStaticAssets(finalizedHtml, staticAssetVersion),
  "utf8"
);

console.log(
  isDisciplinePortal
    ? "İHP DK Vercel çıktısı dist-dk klasöründe oluşturuldu."
    : isFinancePortal
      ? "İHP Finans Vercel çıktısı dist-finance klasöründe oluşturuldu."
      : isMailPortal
        ? "İHP Mail Vercel çıktısı dist-mail klasöründe oluşturuldu."
        : "Vercel çıktısı dist klasöründe oluşturuldu."
);
