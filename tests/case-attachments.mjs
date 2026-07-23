import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCaseAttachmentFiles } from "../dist/src/lib/portal-service.js";

const file = (name, type, size) => ({ name, type, size });
const validFiles = Array.from(
  { length: 10 },
  (_, index) => file(`kanit-${index + 1}.jpg`, "image/jpeg", 1024)
);

assert.doesNotThrow(() => validateCaseAttachmentFiles(validFiles, 0));
assert.doesNotThrow(() => validateCaseAttachmentFiles([file("tutanak.docx", "", 2048)], 0));
assert.throws(
  () => validateCaseAttachmentFiles([...validFiles, file("fazla.pdf", "application/pdf", 1024)], 0),
  /en fazla 10/i
);
assert.throws(
  () => validateCaseAttachmentFiles([file("buyuk.pdf", "application/pdf", 6 * 1024 * 1024 + 1)], 0),
  /6 MB/i
);
assert.throws(
  () => validateCaseAttachmentFiles([file("calistir.exe", "application/x-msdownload", 1024)], 0),
  /desteklenmiyor/i
);
assert.throws(
  () => validateCaseAttachmentFiles([file("ek.pdf", "application/pdf", 1024)], 10),
  /en fazla 10/i
);

const policySql = await readFile(
  new URL("../supabase/migrations/20260721211229_repair_case_attachment_authorization.sql", import.meta.url),
  "utf8"
);
const visibilitySql = await readFile(
  new URL("../supabase/migrations/20260721212800_repair_case_attachment_opener_visibility.sql", import.meta.url),
  "utf8"
);
assert.match(policySql, /i\.opened_by\s*=\s*v_uid\s+and\s+i\.assigned_to\s+is\s+null/i);
assert.match(policySql, /d\.created_by\s*=\s*v_uid/i);
assert.match(policySql, /i\.assigned_to\s*=\s*v_uid/i);
assert.match(visibilitySql, /i\.opened_by\s*=\s*auth\.uid\(\)/i);
assert.match(visibilitySql, /i\.assigned_to\s+is\s+null/i);
assert.match(visibilitySql, /create policy investigations_select_authorized/i);

const serviceSource = await readFile(new URL("../src/lib/portal-service.ts", import.meta.url), "utf8");
assert.match(serviceSource, /JSON\.stringify\(pendingRows\)/);
assert.match(serviceSource, /Promise\.allSettled\([\s\S]*removeStorageObject/);

console.log("Çoklu dosya eki sınırları, toplu kayıt ve RLS yetkileri doğrulandı.");
