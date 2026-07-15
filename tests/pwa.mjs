import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizePushUrl } from "../server/push.js";

const variants = [
  ["dist", "İHP Mobil"],
  ["dist-dk", "İHP Disiplin Kurulu"],
  ["dist-finance", "İHP Finans"],
  ["dist-mail", "İHP Mail"]
];

for (const [directory, expectedName] of variants) {
  const manifest = JSON.parse(await readFile(new URL(`../${directory}/manifest.webmanifest`, import.meta.url), "utf8"));
  const html = await readFile(new URL(`../${directory}/index.html`, import.meta.url), "utf8");
  const serviceWorker = await readFile(new URL(`../${directory}/service-worker.js`, import.meta.url), "utf8");
  assert.equal(manifest.name, expectedName);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some((item) => item.sizes === "192x192"));
  assert.ok(manifest.icons.some((item) => item.sizes === "512x512"));
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /pwa\.css/);
  assert.doesNotMatch(serviceWorker, /\/api\/.*cache\.put/s);
  assert.match(serviceWorker, /notificationclick/);
}

const mainApp = await readFile(new URL("../dist/src/app.js", import.meta.url), "utf8");
assert.match(mainApp, /İHP Mobil/);
assert.match(mainApp, /pwa-enable-push/);
assert.match(mainApp, /pwa-register-passkey/);
assert.match(mainApp, /\/mail\/#\/portal\/mail/);
assert.match(mainApp, /\/finans\/#\/portal\/overview/);
assert.match(mainApp, /\/dk\/#\/portal\/overview/);

assert.equal(
  normalizePushUrl("https://dk.ihp.org.tr/#/portal/investigations"),
  "https://ihp.org.tr/dk/#/portal/investigations"
);
assert.equal(
  normalizePushUrl("https://mail.ihp.org.tr/#/portal/mail"),
  "https://ihp.org.tr/mail/#/portal/mail"
);

console.log("PWA manifests, mobile center and push routing verified.");
