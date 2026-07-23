import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizePushUrl } from "../server/push.js";

const variants = [
  ["dist", "İHP Mobil", "/assets/pwa"],
  ["dist-dk", "İHP Disiplin Kurulu", "/assets/pwa/dk"],
  ["dist-finance", "İHP Finans", "/assets/pwa/finance"],
  ["dist-mail", "İHP Mail", "/assets/pwa"]
];

for (const [directory, expectedName, expectedIconRoot] of variants) {
  const manifest = JSON.parse(await readFile(new URL(`../${directory}/manifest.webmanifest`, import.meta.url), "utf8"));
  const html = await readFile(new URL(`../${directory}/index.html`, import.meta.url), "utf8");
  const serviceWorker = await readFile(new URL(`../${directory}/service-worker.js`, import.meta.url), "utf8");
  assert.equal(manifest.name, expectedName);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some((item) => item.sizes === "192x192"));
  assert.ok(manifest.icons.some((item) => item.sizes === "512x512"));
  assert.ok(manifest.icons.every((item) => item.src.startsWith(`${expectedIconRoot}/`)));
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /pwa\.css/);
  assert.doesNotMatch(serviceWorker, /\/api\/.*cache\.put/s);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(serviceWorker, new RegExp(`${expectedIconRoot.replaceAll("/", "\\/")}\\/icon-192\\.png`));
}

const mainApp = await readFile(new URL("../dist/src/app.js", import.meta.url), "utf8");
const mainPortalService = await readFile(new URL("../dist/src/lib/portal-service.js", import.meta.url), "utf8");
assert.match(mainApp, /İHP Mobil/);
assert.match(mainApp, /\.\/lib\/portal-service\.js\?v=[a-f0-9]{12}/);
assert.match(mainApp, /\.\/pwa-passkeys\.js\?v=[a-f0-9]{12}/);
assert.match(mainPortalService, /\.\/supabase\.js\?v=[a-f0-9]{12}/);
assert.match(mainApp, /pwa-enable-push/);
assert.match(mainApp, /pwa-register-passkey/);
assert.match(mainApp, /\/mail\/#\/portal\/mail/);
assert.match(mainApp, /\/finans\/#\/portal\/overview/);
assert.match(mainApp, /\/dk\/#\/portal\/overview/);

const dkApp = await readFile(new URL("../dist-dk/src/app.js", import.meta.url), "utf8");
const financeApp = await readFile(new URL("../dist-finance/src/app.js", import.meta.url), "utf8");
assert.match(dkApp, /İHP Disiplin Kurulu/);
assert.match(financeApp, /İHP Finans/);
assert.match(dkApp, /Telefonuma kur/);
assert.match(financeApp, /Telefonuma kur/);

assert.equal(
  normalizePushUrl("https://dk.ihp.org.tr/#/portal/investigations"),
  "https://ihp.org.tr/dk/#/portal/investigations"
);
assert.equal(
  normalizePushUrl("https://mail.ihp.org.tr/#/portal/mail"),
  "https://ihp.org.tr/mail/#/portal/mail"
);

console.log("PWA manifests, mobile center and push routing verified.");
