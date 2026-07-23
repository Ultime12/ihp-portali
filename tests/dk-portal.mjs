import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, css] = await Promise.all([
  readFile(new URL("../dist-dk/index.html", import.meta.url), "utf8"),
  readFile(new URL("../dist-dk/src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../dist-dk/dk.css", import.meta.url), "utf8")
]);

assert.match(html, /İHP DK \| Disiplin Kurulu/);
assert.match(html, /dk\.css/);
assert.match(app, /dk_logo_url/);
assert.match(app, /discipline_analysis/);
assert.match(app, /Kurumsal Kırmızı/);
assert.match(app, /İHP \/ Disiplin Kurulu/);
assert.match(app, /Bu hesap DK sistemine yetkili değil/);
assert.match(app, /Gelen Şikayetler/);
assert.match(app, /DK Başvuruları/);
assert.match(app, /Bildirimler/);
assert.doesNotMatch(app, /E-posta veya Admin/);
assert.doesNotMatch(app, /Sistem hazır/);
assert.doesNotMatch(app, /Tek, kapalı merkez/);
assert.doesNotMatch(app, /Bağımsız inceleme ve savunma hakkı/);
assert.match(css, /data-portal="discipline"/);
assert.match(css, /\.dk-command-hero/);
assert.match(css, /\.discipline-ai-panel/);

console.log("İHP DK ayrı site build sözleşmesi doğrulandı.");
