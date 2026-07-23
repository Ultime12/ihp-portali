import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, portalCore, investigationUi, decisionHandler, appealHandler, migration, amountMigration, workflowMigration, defenseGateMigration, recipientMigration] = await Promise.all([
  readFile(new URL("../src/app.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/features/portal-core.js", import.meta.url), "utf8"),
  readFile(new URL("../src/features/investigation-transfer.js", import.meta.url), "utf8"),
  readFile(new URL("../serverless-handlers/apply-discipline.js", import.meta.url), "utf8"),
  readFile(new URL("../serverless-handlers/discipline-appeal.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260719141415_align_discipline_regulation_20260719.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260719204129_freeform_discipline_compensation.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260721215815_simplify_external_investigation_workflow.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260721223500_remove_portal_defense_gate.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260722103753_allow_active_dk_financial_recipients.sql", import.meta.url), "utf8")
]);

assert.match(decisionHandler, /rpc\("apply_20260719_discipline_decision_amount"/);
assert.match(decisionHandler, /select=id,subject_profile_id,opened_by,status/);
assert.match(decisionHandler, /investigation\.opened_by !== actor\.authUser\.id/);
assert.doesNotMatch(decisionHandler, /create_discipline_credit_fine/);
assert.match(app, /name="tariff_code"/);
assert.match(app, /DISCIPLINE_CREDIT_TARIFFS/);
assert.match(app, /financial_installments/);
assert.match(app, /name="compensation_amount"/);
assert.doesNotMatch(app + portalCore + decisionHandler, /independentHeavyOutcomes|independent_heavy_outcomes|Bağımsız ağır zarar sonucu/);
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
assert.match(amountMigration, /create or replace function public\.apply_20260719_discipline_decision_amount/);
assert.match(amountMigration, /p_payload ->> 'compensationAmount'/);
assert.match(amountMigration, /grant execute on function public\.apply_20260719_discipline_decision_amount\(uuid, jsonb\)\s+to service_role/);
assert.match(workflowMigration, /v_investigation\.opened_by is distinct from p_actor_profile_id/);
assert.match(workflowMigration, /create or replace function private\.enforce_discipline_decision_opener/);
assert.match(workflowMigration, /create trigger enforce_discipline_decision_opener/);
assert.match(defenseGateMigration, /create or replace function private\.enforce_investigation_defense_before_penalty/);
assert.doesNotMatch(defenseGateMigration, /defense_state|Savunma hakki tamamlanmadan/);

const recipientFilter = app.slice(
  app.indexOf("function disciplineFinancialRecipients"),
  app.indexOf("function disciplineTier", app.indexOf("function disciplineFinancialRecipients"))
);
assert.match(recipientFilter, /profile\.id !== state\.profile\?\.id/);
assert.match(recipientFilter, /profile\.status === "active"/);
assert.doesNotMatch(recipientFilter, /disciplineRoles|discipline_chair|discipline_vice_chair|discipline_member/);
const recipientValidation = recipientMigration.slice(
  recipientMigration.indexOf("if position($new_validation$"),
  recipientMigration.indexOf("$new_validation$ in decision_definition")
);
assert.match(recipientValidation, /status = 'active'/);
assert.match(recipientValidation, /v_recipient_profile_id = p_actor_profile_id/);
assert.doesNotMatch(recipientValidation, /v_recipient_profile_id = v_investigation\.assigned_to/);
assert.doesNotMatch(recipientValidation, /v_recipient_roles && array\['discipline_chair'/);

const investigationActions = investigationUi.slice(
  investigationUi.indexOf("investigationActions = function patchedInvestigationActions"),
  investigationUi.indexOf("openInvestigationReview = function patchedOpenInvestigationReview")
);
assert.match(investigationActions, />Kapat<\/button>/);
assert.doesNotMatch(investigationActions, /Savunmamı sun|Sorumluluğu al|Devret|Süreyi uzat|Duruşma|İptal et/);

console.log("19.07.2026 disiplin ve kredi yönetmeliği karar akışı doğrulandı.");
