const DISCIPLINE_ROLES = ["discipline_chair", "discipline_vice_chair", "discipline_member"];
const REPRESENTATION_ROLES = ["chief_representative", "representative"];

function normalizedRoles(roles, primaryRole) {
  return [...new Set([...(Array.isArray(roles) ? roles : []), primaryRole].filter(Boolean))];
}

function removeSubordinateInstitutionRoles(roles) {
  const result = new Set(roles);

  if (result.has("discipline_chair")) {
    result.delete("discipline_vice_chair");
    result.delete("discipline_member");
  } else if (result.has("discipline_vice_chair")) {
    result.delete("discipline_member");
  }

  if (result.has("youth_chair")) result.delete("youth_member");
  return [...result];
}

function additionalContribution(amount, basisPoints) {
  return Math.round((amount * basisPoints) / 10_000);
}

export function calculateWeeklyRoleAllowance(
  roles,
  primaryRole,
  roleAllowances = {},
  additionalRoleAllowanceBasisPoints = 3000
) {
  const basisPoints = Math.min(10_000, Math.max(0, Number(additionalRoleAllowanceBasisPoints) || 0));
  const paidRoles = removeSubordinateInstitutionRoles(normalizedRoles(roles, primaryRole))
    .map((role) => ({ role, amount: Math.max(0, Number(roleAllowances?.[role]) || 0) }))
    .filter(({ amount }) => amount > 0);

  const hasPaidOffice = paidRoles.some(({ role }) => role !== "member");
  const eligibleRoles = paidRoles
    .filter(({ role }) => role !== "member" || !hasPaidOffice)
    .sort((left, right) => right.amount - left.amount || left.role.localeCompare(right.role));

  return eligibleRoles.reduce((total, item, index) => (
    total + (index === 0 ? item.amount : additionalContribution(item.amount, basisPoints))
  ), 0);
}

export const SALARY_HIERARCHY = Object.freeze({
  discipline: DISCIPLINE_ROLES,
  representation: REPRESENTATION_ROLES
});
