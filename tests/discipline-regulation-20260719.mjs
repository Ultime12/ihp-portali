import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, portalCore, decisionHandler, appealHandler, migration] = await Promise.all([
  readFile(new URL("../src/app.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/features/portal-core.js", import.meta.url), "utf8"),
  readFile(new URL("../serverless-handlers/apply-discipline.js", import.meta.url), "utf8"),
  readFile(new URL("../serverless-handlers/discipline-appeal.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260719141415_align_discipline_regulation_20260719.sql", import.meta.url), "utf8")
]);

assert.match(decisionHandler, /rpc\("apply_20260719_discipline_decision"/);
assert.doesNotMatch(decisionHandler, /create_discipline_credit_fine/);
assert.match(app, /name="tariff_code"/);
assert.match(app, /DISCIPLINE_CREDIT_TARIFFS/);
assert.match(app, /financial_installments/);
assert.doesNotMatch(app + portalCore, /id="discipline-credit-fine"/);
assert.doesNotMatch(app + portalCore, /data-discipline-repeat/);
assert.match(app, /submitDisciplineDecision/);
assert.match(app, /Yeniden incelemeye gönder/);
assert.match(appealHandler, /"remand"/);

assert.match(migration, /create table if not exists public\.discipline_credit_tariffs/);
assert.match(migration, /create unique index discipline_records_one_effective_per_investigation_idx/);
assert.match(migration, /v_due_days := 3/);
assert.match(migration, /v_installment_count < 1 or v_installment_count > 3/);
assert.match(migration, /cardinality\(v_aggravating_factors\) >= 2/);
assert.match(migration, /private\.can_access_20260719_discipline_case/);
assert.match(migration, /reverse_20260719_discipline_decision/);

console.log("19.07.2026 disiplin ve kredi yönetmeliği karar akışı doğrulandı.");
