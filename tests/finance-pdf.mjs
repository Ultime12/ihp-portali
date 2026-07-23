import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/features/pdf-builder.js", import.meta.url), "utf8");
const context = vm.createContext({ Blob, Map, TextEncoder, Uint8Array, atob });
vm.runInContext(source, context, { filename: "pdf-builder.js" });

assert.equal(typeof context.createPdfBuilder, "function");
const builder = context.createPdfBuilder("IHP Finans Test Belgesi", "", {
  subtitle: "PDF motoru dogrulama",
  footer: "IHP Finans test"
});
builder.section("Rapor Ozeti");
builder.keyValueRows([
  ["Olusturulma", "22.07.2026 12:00"],
  ["Islem sayisi", "2"]
]);
builder.section("Hesap Hareketleri");
builder.paragraph("1. Transfer", "Ornek hesap hareketi ve bakiye bilgisi.");

const pdf = builder.finish();
assert.equal(pdf.type, "application/pdf");
const bytes = Buffer.from(await pdf.arrayBuffer());
assert.equal(bytes.subarray(0, 8).toString("ascii"), "%PDF-1.4");
assert.ok(bytes.length > 800, "PDF cikisi beklenenden kucuk");

console.log("Finance PDF builder produced a valid PDF document.");
