import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [mainApp, dkApp, splitSource, portalCore] = await Promise.all([
  readFile(new URL("../dist/src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../dist-dk/src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/features/main-portal-split.js", import.meta.url), "utf8"),
  readFile(new URL("../src/features/portal-core.js", import.meta.url), "utf8")
]);

assert.match(mainApp, /Şikayetlerim/);
assert.match(dkApp, /Şikayetlerim/);
assert.match(dkApp, /Bildirim ve takip/);
assert.match(splitSource, /Şikayetlerim/);
assert.match(splitSource, /MAIN_DISCIPLINE_PAGES/);
assert.match(splitSource, /targetCommitteeName\(item\) === "Disiplin Kurulu"/);
assert.doesNotMatch(splitSource, /delete-complaint/);
assert.doesNotMatch(splitSource, /mail-external/);
assert.doesNotMatch(mainApp, /ihp-mail[.]vercel[.]app/);
assert.match(portalCore, /function isCoreExecutiveMember/);
assert.match(portalCore, /isCoreExecutiveMember\(member\) \|\| executiveExtraIds\(\)\.has\(member\.id\)/);

console.log("Ana portal ve DK işlev ayrımı doğrulandı.");
