const IHP_ADMIN_ROLE_PATCH_V1 = true;

function ensureAdminRoleStylesV1() {
  if (document.getElementById("ihp-admin-role-styles-v1")) return;
  const style = document.createElement("style");
  style.id = "ihp-admin-role-styles-v1";
  style.textContent = `
    .badge-red {
      background: rgba(239,68,68,.16);
      border-color: rgba(239,68,68,.34);
      color: #ff8d8d;
      box-shadow: 0 0 0 1px rgba(239,68,68,.08), 0 10px 28px rgba(239,68,68,.12);
    }
    .role-badge-list { display: inline-flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
    .choice-card.role-admin { border-color: rgba(239,68,68,.34); background: rgba(239,68,68,.08); }
    .choice-card.role-admin span { color: #ff9a9a; font-weight: 900; }
  `;
  document.head.append(style);
}

ensureAdminRoleStylesV1();

ROLE_LABELS.super_admin = "Admin";
const ihpAdminRoleOptionV1 = ROLE_OPTIONS.find(([value]) => value === "super_admin");
if (ihpAdminRoleOptionV1) ihpAdminRoleOptionV1[1] = "Admin";

const ihpAdminBaseBadgeV1 = badge;
badge = function patchedAdminBadge(label, tone = "blue") {
  const text = String(label || "");
  const adminVisible =
    text === "Admin" ||
    text.startsWith("Admin,") ||
    text.includes(", Admin") ||
    text.includes("Admin ·") ||
    text.includes("Admin ");
  return ihpAdminBaseBadgeV1(label, adminVisible ? "red" : tone);
};

function ihpAdminRoleBadgesV1(profile = state.profile) {
  if (typeof isSystemProfile === "function" && isSystemProfile(profile)) {
    return ihpAdminBaseBadgeV1("Geçiş hesabı", "blue");
  }
  const roles = visibleRolesOf(profile);
  if (!roles.length) return ihpAdminBaseBadgeV1("Belirtilmedi", "blue");
  return `<span class="role-badge-list">${roles
    .map((role) => ihpAdminBaseBadgeV1(roleLabel(role), role === "super_admin" ? "red" : "blue"))
    .join("")}</span>`;
}

const ihpAdminBaseRoleCheckboxesV1 = roleCheckboxes;
roleCheckboxes = function patchedAdminRoleCheckboxes(selected = ["member"], options = ROLE_OPTIONS) {
  return options
    .map(
      ([value, label]) => `
        <label class="choice-card ${value === "super_admin" ? "role-admin" : ""}">
          <input type="checkbox" name="roles" value="${esc(value)}" ${selected.includes(value) ? "checked" : ""} />
          <span>${esc(label)}</span>
        </label>
      `
    )
    .join("");
};
