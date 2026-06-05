import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const appPath = join(process.cwd(), "dist", "src", "app.js");
let app;
try {
  app = await readFile(appPath, "utf8");
} catch {
  process.exit(0);
}

let next = app;
const replaceAll = (from, to) => {
  next = next.split(from).join(to);
};

replaceAll(
  'function canFullyEditMembers() {\n  return hasRole("super_admin");\n}',
  'function canFullyEditMembers() {\n  return isTechnicalSuperAdmin();\n}'
);
replaceAll(
  'if (hasRole("super_admin")) return true;\n  const targetRoles = rolesOf(member);',
  'if (isTechnicalSuperAdmin()) return true;\n  const targetRoles = rolesOf(member);'
);
replaceAll(
  'function canEditRegulations() {\n  return hasRole("super_admin");\n}',
  'function canEditRegulations() {\n  return isTechnicalSuperAdmin();\n}'
);
replaceAll(
  'hasRole("super_admin") || item.id === state.profile?.id ? item.email',
  'isTechnicalSuperAdmin() || item.id === state.profile?.id ? item.email'
);
replaceAll('${hasRole("super_admin") ?', '${isTechnicalSuperAdmin() ?');
replaceAll(
  'hasRole("super_admin") && member.id !== state.profile?.id',
  'isTechnicalSuperAdmin() && member.id !== state.profile?.id'
);
replaceAll(
  'hasRole("super_admin") ? ROLE_OPTIONS : [["member", ROLE_LABELS.member]]',
  'isTechnicalSuperAdmin() ? ROLE_OPTIONS : [["member", ROLE_LABELS.member]]'
);
replaceAll('const permanent = hasRole("super_admin");', 'const permanent = isTechnicalSuperAdmin();');
replaceAll('if (!hasRole("super_admin")) return;', 'if (!isTechnicalSuperAdmin()) return;');

if (next !== app) await writeFile(appPath, next);
