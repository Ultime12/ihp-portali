import assert from "node:assert/strict";
import { rankDocuments, regulationDocuments } from "../server/assistant-api.js";

const articles = Array.from(
  { length: 70 },
  (_, index) => `Madde ${index + 1} - Test hükmü\n${"Bu madde portal yönetmeliği için örnek içerik taşır. ".repeat(14)}`
).join("\n");
const documents = regulationDocuments([{
  title: "İHP Disiplin Puan Sistemi ve Disiplin Yönetmeliği",
  content: articles
}]);

assert.ok(documents.length > 1, "long regulations should be split into searchable chunks");
const [bestMatch] = rankDocuments(documents, "Disiplin yönetmeliği Madde 55 nedir?", 8);
assert.match(bestMatch.text, /Madde 55\b/, "an explicitly requested article should rank first");
assert.ok(
  bestMatch.text.length <= 4800,
  "retrieval chunks should stay inside the configured context size"
);

console.log("Assistant regulation retrieval tests passed.");
