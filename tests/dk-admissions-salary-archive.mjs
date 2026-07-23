import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateWeeklyRoleAllowance } from "../server/salary-policy.js";

const [app, portalService, applicationHandler, disciplineHandler, creditUi, creditServer, migration, rateMigration, refinedSalaryMigration] = await Promise.all([
  readFile(new URL("../src/app.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/portal-service.ts", import.meta.url), "utf8"),
  readFile(new URL("../serverless-handlers/review-application.js", import.meta.url), "utf8"),
  readFile(new URL("../serverless-handlers/apply-discipline.js", import.meta.url), "utf8"),
  readFile(new URL("../src/features/credit-system.js", import.meta.url), "utf8"),
  readFile(new URL("../server/credit-system.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260722135701_enforce_dk_admissions_salary_and_archive.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260722151908_expose_additional_role_allowance_rate.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260723091835_refine_multi_role_weekly_allowance.sql", import.meta.url), "utf8")
]);

const approvalGuard = app.slice(
  app.indexOf("function canApproveApplication"),
  app.indexOf("function canClaimApplication")
);
assert.match(approvalGuard, /discipline_chair/);
assert.match(approvalGuard, /discipline_vice_chair/);
assert.doesNotMatch(approvalGuard, /discipline_member/);
assert.match(app, /canApproveApplication\(item\) \? `<button[^`]+data-status="accepted"/);
assert.match(app, /status === "accepted" && !canApproveApplication\(item\)/);

const serverApprovalGuard = applicationHandler.slice(
  applicationHandler.indexOf("function canAcceptRequestedRole"),
  applicationHandler.indexOf("async function addCommitteeMembership")
);
assert.match(serverApprovalGuard, /discipline_vice_chair/);
assert.match(serverApprovalGuard, /discipline_chair/);
assert.doesNotMatch(serverApprovalGuard, /actorRoles\.includes\("discipline_member"\)/);

const recipientFilter = app.slice(
  app.indexOf("function disciplineFinancialRecipients"),
  app.indexOf("function disciplineTier", app.indexOf("function disciplineFinancialRecipients"))
);
assert.match(recipientFilter, /state\.cache\.disciplineMembers/);
assert.match(recipientFilter, /profile\.id !== state\.profile\?\.id/);
assert.match(recipientFilter, /profile\.status === "active"/);
assert.doesNotMatch(recipientFilter, /discipline_chair|discipline_vice_chair|discipline_member/);

assert.match(portalService, /function manageDisciplineRecord/);
assert.match(app, /manageDisciplineRecord\(\{\s*action: "archive"/);
assert.match(disciplineHandler, /\["archive", "update_legacy", "delete_legacy"\]/);
assert.match(disciplineHandler, /method: "PATCH"/);
assert.match(disciplineHandler, /actor\.roles\.includes\("super_admin"\)/);

assert.match(migration, /private\.calculate_weekly_role_allowance/);
assert.match(migration, /salary_rank = 1 then amount/);
assert.match(migration, /amount::numeric \* 0\.30/);
assert.match(migration, /role_name <> 'member'/);
assert.match(migration, /public\.process_credit_schedules/);
assert.match(rateMigration, /additional_role_allowance_basis_points/);
assert.match(rateMigration, /p_additional_role_allowance_basis_points/);
assert.match(rateMigration, /v_settings\.additional_role_allowance_basis_points/);
assert.match(refinedSalaryMigration, /hierarchy_filtered_roles/);
assert.match(refinedSalaryMigration, /chief_representative/);
assert.match(refinedSalaryMigration, /discipline_member/);
assert.match(creditUi, /data-credit-additional-role-rate/);
assert.match(creditUi, /additionalRoleAllowanceBasisPoints/);
assert.match(creditServer, /additional_role_allowance_basis_points: additionalRoleAllowance/);

const allowances = {
  vice_president: 350_000,
  spokesperson: 250_000,
  discipline_chair: 250_000,
  discipline_vice_chair: 170_000,
  discipline_member: 120_000,
  credit_officer: 150_000,
  chief_representative: 180_000,
  representative: 100_000,
  member: 0
};
assert.equal(
  calculateWeeklyRoleAllowance(["vice_president", "discipline_member", "chief_representative", "member"], "vice_president", allowances, 3000),
  444_000,
  "vice president + chief representative + DK member should total 444K"
);
assert.equal(
  calculateWeeklyRoleAllowance(["spokesperson", "credit_officer", "discipline_member", "member"], "spokesperson", allowances, 3000),
  340_000,
  "spokesperson + credit officer + DK member should total 340K"
);
assert.equal(
  calculateWeeklyRoleAllowance(["discipline_chair", "discipline_vice_chair", "discipline_member"], "discipline_chair", allowances, 3000),
  250_000,
  "subordinate DK ranks must not stack"
);
assert.equal(
  calculateWeeklyRoleAllowance(["chief_representative", "representative"], "chief_representative", allowances, 3000),
  210_000,
  "chief representative and representative remain separate paid roles"
);

console.log("DK admissions, recipient, archive, and multi-role salary checks passed.");
