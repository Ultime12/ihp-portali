import assert from "node:assert/strict";
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

console.log("Çoklu dosya eki sınırları doğrulandı.");
