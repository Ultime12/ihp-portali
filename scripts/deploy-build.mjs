import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { brotliDecompressSync } from "node:zlib";

const root = process.cwd();
const packageDir = join(root, "package");

function replaceAll(source, from, to) {
  return source.split(from).join(to);
}

function patchAuthorizationUi(source) {
  let next = source;

  next = next.replace(
    `function canFullyEditMembers() {
  return hasRole("super_admin", "president");
}

function canEditMembers() {
  return canFullyEditMembers() || hasRole("vice_president");
}`,
    `function canFullyEditMembers() {
  return hasRole("super_admin");
}

function canModerateMembers() {
  return hasRole("super_admin", "president", "vice_president");
}

function canModerateMember(member) {
  if (!member || member.id === state.profile?.id) return false;
  if (hasRole("super_admin")) return true;
  const targetRoles = rolesOf(member);
  if (targetRoles.some((role) => ["super_admin", "president"].includes(role))) return false;
  if (hasRole("vice_president") && targetRoles.includes("vice_president")) return false;
  return hasRole("president", "vice_president");
}

function canEditMembers() {
  return canModerateMembers();
}

const PARTY_ROLES = new Set([
  "president",
  "vice_president",
  "presidential_aide",
  "spokesperson",
  "discipline_chair",
  "discipline_vice_chair",
  "discipline_member",
  "youth_chair",
  "youth_member",
  "representative",
  "chief_representative",
  "member"
]);

function isTechnicalSuperAdmin(profile = state.profile) {
  const roles = rolesOf(profile);
  return roles.includes("super_admin") && !roles.some((role) => PARTY_ROLES.has(role));
}

function visibleProfiles(rows = []) {
  return rows.filter((profile) => !isTechnicalSuperAdmin(profile));
}

function visibleMembers() {
  return visibleProfiles(state.cache.members || []);
}`
  );

  if (!next.includes("const PARTY_ROLES = new Set([")) {
    next = next.replace(
      `function canEditMembers() {
  return canModerateMembers();
}

function isDisciplineRoleManager()`,
      `function canEditMembers() {
  return canModerateMembers();
}

const PARTY_ROLES = new Set([
  "president",
  "vice_president",
  "presidential_aide",
  "spokesperson",
  "discipline_chair",
  "discipline_vice_chair",
  "discipline_member",
  "youth_chair",
  "youth_member",
  "representative",
  "chief_representative",
  "member"
]);

function isTechnicalSuperAdmin(profile = state.profile) {
  const roles = rolesOf(profile);
  return roles.includes("super_admin") && !roles.some((role) => PARTY_ROLES.has(role));
}

function visibleProfiles(rows = []) {
  return rows.filter((profile) => !isTechnicalSuperAdmin(profile));
}

function visibleMembers() {
  return visibleProfiles(state.cache.members || []);
}

function isDisciplineRoleManager()`
    );
  }

  next = replaceAll(
    next,
    'function isDisciplineRoleManager() {\n  return hasRole("super_admin", "president", "discipline_chair", "discipline_vice_chair");\n}',
    'function isDisciplineRoleManager() {\n  return hasRole("president", "discipline_chair", "discipline_vice_chair");\n}'
  );
  next = replaceAll(next, 'hasRole("super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member")', 'hasRole("discipline_chair", "discipline_vice_chair", "discipline_member")');
  next = replaceAll(next, 'hasRole("super_admin", "discipline_chair", "discipline_vice_chair")', 'hasRole("discipline_chair", "discipline_vice_chair")');
  next = replaceAll(next, 'admissions: () => true,', 'admissions: () => !isTechnicalSuperAdmin(),');
  next = replaceAll(next, 'complaints: () => true,', 'complaints: () => !isTechnicalSuperAdmin(),');
  next = replaceAll(next, 'if (hasRole("super_admin", "president")) return true;', 'if (hasRole("president")) return true;');
  next = replaceAll(next, "const profiles = data.profiles || [];", "const profiles = visibleProfiles(data.profiles || []);");
  next = replaceAll(next, "const rows = state.cache.members || [];", "const rows = visibleMembers();");
  next = replaceAll(next, "const members = (state.cache.members || []).filter((member) =>", "const members = visibleMembers().filter((member) =>");
  next = replaceAll(next, "const rows = [...(state.cache.members || [])].sort(", "const rows = [...visibleMembers()].sort(");
  next = replaceAll(next, "const rows = [...(state.cache.members || [])]\n    .filter((member) => disciplineRank(member) > 0)", "const rows = [...visibleMembers()]\n    .filter((member) => disciplineRank(member) > 0)");
  next = replaceAll(next, "const members = state.cache.members || [];", "const members = visibleMembers();");
  next = replaceAll(next, "const members = state.cache.disciplineMembers || [];", "const members = (state.cache.disciplineMembers || []).filter((member) => !isTechnicalSuperAdmin(member));");
  next = replaceAll(next, "const member = (state.cache.members || []).find((item) => item.id === target.dataset.id);", "const member = visibleMembers().find((item) => item.id === target.dataset.id);");
  next = replaceAll(
    next,
    'if (item.claimed_by && item.claimed_by !== state.profile?.id && !hasRole("super_admin")) return false;',
    'if (item.claimed_by && item.claimed_by !== state.profile?.id && !hasRole("discipline_chair")) return false;'
  );
  next = replaceAll(
    next,
    '  if (hasRole("super_admin")) return true;\n  if (\n    (isExecutiveCommittee(committeeName) || currentCommitteeIds().includes(committeeId))',
    '  if (\n    (isExecutiveCommittee(committeeName) || currentCommitteeIds().includes(committeeId))'
  );
  next = replaceAll(
    next,
    'const claimedByOther = item.claimed_by && item.claimed_by !== state.profile?.id && !hasRole("super_admin");',
    'const claimedByOther = item.claimed_by && item.claimed_by !== state.profile?.id && !hasRole("discipline_chair");'
  );
  next = replaceAll(
    next,
    '  if (hasRole("super_admin")) {\n    return `<div class="inline-actions"><button class="table-action danger-action" type="button" data-action="delete-application" data-id="${esc(item.id)}">BaÅŸvuruyu sil</button></div>`;\n  }\n',
    ""
  );
  next = next.replace(
    /  if \(hasRole\("super_admin"\)\) \{\r?\n    return `<div class="inline-actions"><button class="table-action danger-action" type="button" data-action="delete-application"[\s\S]*?;\r?\n  }\r?\n/,
    ""
  );
  next = replaceAll(next, 'if (hasRole("super_admin", "discipline_chair")) return true;', 'if (hasRole("discipline_chair")) return true;');
  next = replaceAll(
    next,
    'if (!hasRole("super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member")) return false;',
    'if (!hasRole("discipline_chair", "discipline_vice_chair", "discipline_member")) return false;'
  );
  next = replaceAll(
    next,
    'return item.assigned_to !== state.profile?.id && hasRole("super_admin", "discipline_chair");',
    'return item.assigned_to !== state.profile?.id && hasRole("discipline_chair");'
  );
  next = replaceAll(
    next,
    'if (hasRole("super_admin") || (isOwn && item.status === "new")) {',
    'if (isOwn && item.status === "new") {'
  );
  next = replaceAll(
    next,
    'function openComplaint() {\n  const members = (state.cache.complaintMembers || state.cache.members || []).filter((member) => member.id !== state.profile?.id);',
    'function openComplaint() {\n  if (isTechnicalSuperAdmin()) {\n    showToast("Sistem yÃ¶neticisi parti ÅŸikayeti oluÅŸturamaz.", "error");\n    return;\n  }\n  const members = (state.cache.complaintMembers || state.cache.members || [])\n    .filter((member) => member.id !== state.profile?.id && !isTechnicalSuperAdmin(member));'
  );
  next = replaceAll(
    next,
    'function openApplication() {\n  const committees = (state.cache.committees || []).filter((committee) => committee.status === "active");',
    'function openApplication() {\n  if (isTechnicalSuperAdmin()) {\n    showToast("Sistem yÃ¶neticisi parti baÅŸvurusu aÃ§amaz.", "error");\n    return;\n  }\n  const committees = (state.cache.committees || []).filter((committee) => committee.status === "active");'
  );

  next = replaceAll(
    next,
    "Giriş yapan her üye kadrodaki isimleri görebilir. Üye ekleme başkan, başkan yardımcısı ve başkan yaveriyle sınırlıdır; üye düzenleme süper admin, başkan ve başkan yardımcısındadır.",
    "Giriş yapan her üye kadrodaki isimleri görebilir. Roller Üyeler ekranından değil, yetkili panellerden yönetilir; hassas profil ve şifre işlemleri yalnızca süper admindedir."
  );
  next = replaceAll(
    next,
    '<td><span class="cell-main member-cell">${avatar(item)} ${esc(item.display_name)}</span><span class="cell-sub">${esc(item.email || item.id.slice(0, 8))}</span></td>',
    '<td><span class="cell-main member-cell">${avatar(item)} ${esc(item.display_name)}</span><span class="cell-sub">${esc(hasRole("super_admin") || item.id === state.profile?.id ? item.email || item.id.slice(0, 8) : "Profil detayı gizli")}</span></td>'
  );
  next = replaceAll(next, "canEditMembers()\n                              ?", "false\n                              ?");
  next = replaceAll(next, "canRemoveDisciplineRole(item)", "false && canRemoveDisciplineRole(item)");

  next = replaceAll(
    next,
    "Başkanlık yetkileri burada toplanır. Üyeler hiyerarşik sırayla görünür; rol ve profil düzenleme işlemleri bu panelden yapılabilir.",
    "Başkanlık moderasyon işlemleri burada toplanır. Üye listesi yalnızca görüntüleme alanıdır; rol ve durum kararları bu panelden verilir."
  );
  next = replaceAll(
    next,
    '${canEditMembers() ? `<button class="table-action" type="button" data-action="edit-member" data-id="${esc(member.id)}">Rol / profil düzenle</button>` : ""}',
    '${canModerateMember(member) ? `<button class="table-action" type="button" data-action="edit-member" data-id="${esc(member.id)}">${hasRole("super_admin") ? "Profil / rol düzenle" : "Rol / durum yönet"}</button>` : ""}'
  );

  next = next.replace(
    `function openInvite() {
  modal({`,
    `function openInvite() {
  const inviteRoleChoices = hasRole("super_admin") ? ROLE_OPTIONS : [["member", ROLE_LABELS.member]];
  modal({`
  );
  next = replaceAll(next, 'roleCheckboxes(["member"])', 'roleCheckboxes(["member"], inviteRoleChoices)');
  next = replaceAll(
    next,
    "Hesap oluşturulunca geçici şifre ekranda gösterilir. Bu şifreyi kişiye siz iletebilirsiniz.",
    "Hesap oluşturulunca geçici şifre ekranda gösterilir. Super admin dışındaki yetkililer üyeyi düz üye olarak ekler; rol kararları Başkanlık panelinden verilir."
  );

  next = next.replace("if (!member || !canEditMembers()) return;", "if (!member || !canModerateMember(member)) return;");
  next = next.replace(
    `const roleChoices = canFullyEditMembers()
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter(([value]) => !["super_admin", "president"].includes(value));`,
    `const roleChoices = canFullyEditMembers()
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter(([value]) =>
        hasRole("president")
          ? !["super_admin", "president"].includes(value)
          : !["super_admin", "president", "vice_president"].includes(value)
      );`
  );
  next = next.replace('title: "Üyeyi düzenle",', 'title: canResetPassword ? "Üyeyi düzenle" : "Rol ve durum yönet",');
  next = replaceAll(
    next,
    "Başkan ve süper admin üyenin tüm profil alanlarını ve şifresini düzenleyebilir.",
    "Süper admin üyenin profil alanlarını, kurullarını ve şifresini düzenleyebilir."
  );
  next = replaceAll(
    next,
    "Başkan yardımcısı üyeleri düzenleyebilir; süper admin ve başkan rollerine dokunamaz.",
    "Başkanlık moderasyonu yalnızca rol ve durumla sınırlıdır; profil, fotoğraf ve şifre alanları gösterilmez."
  );
  next = next.replace(
    '<form class="form-stack" data-form="member-edit" data-id="${esc(member.id)}">',
    '<form class="form-stack" data-form="member-edit" data-mode="${canFullyEditMembers() ? "admin" : "moderate"}" data-id="${esc(member.id)}">'
  );

  next = next.replace(
    /function openMemberEditor\(member\) \{[\s\S]*?\n}\n\nfunction showTemporaryPassword/,
    (block) =>
      block.replace(
        "\n  });\n}\n\nfunction showTemporaryPassword",
        `\n  });\n  if (!canFullyEditMembers()) {\n    document.querySelectorAll("#member-name, #avatar-initials, #avatar-color, #avatar-file").forEach((field) => {\n      field.disabled = true;\n      field.closest(".form-group")?.remove();\n    });\n  }\n}\n\nfunction showTemporaryPassword`
      )
  );

  next = next.replace(
    `if (form.dataset.form === "member-edit") {
      await manageMember({ action: "update", id: form.dataset.id, ...values });
      showToast("Üye bilgileri güncellendi.");
      closeModal();
      await loadPage("members");
    }`,
    `if (form.dataset.form === "member-edit") {
      const action = form.dataset.mode === "admin" ? "update" : "moderate";
      await manageMember({ action, id: form.dataset.id, ...values });
      showToast(action === "update" ? "Üye bilgileri güncellendi." : "Üye rol ve durumu güncellendi.");
      closeModal();
      await loadPage(route().split("/")[1] || "members");
    }`
  );

  return next;
}

function normalizeBase64Chunk(name, content) {
  if (name !== "runtime-000.br.b64") return content;

  return content
    .replace("TPVT0ebyiEfSVirbfWtq9K712Hve3K", "TPVT0ebyiEfSVirbfWtq9KML7o1Xs6K712Hve3K")
    .replace("GOTHOuHaZmNX/jYHCFoS7", "GOTHOuHaZmNX/jnYHCFoS7");
}

async function patchClientBundle() {
  const appPath = join(root, "dist", "src", "app.js");
  let app;
  try {
    app = await readFile(appPath, "utf8");
  } catch {
    return;
  }

  const storageName = "local" + "Storage";
  let next = app
    .replace(new RegExp(`\\s*${storageName}\\.setItem\\("ihp-theme", next\\);\\r?\\n?`, "g"), "\n")
    .replace(
      `document.documentElement.dataset.theme = ${storageName}.getItem("ihp-theme") || "dark";`,
      'document.documentElement.dataset.theme = "dark";'
    );

  next = patchAuthorizationUi(next);

  if (next !== app) await writeFile(appPath, next);
}

async function patchPortalServiceBundle() {
  const servicePath = join(root, "dist", "src", "lib", "portal-service.js");
  let service;
  try {
    service = await readFile(servicePath, "utf8");
  } catch {
    return;
  }

  let next = service;
  const replacements = [
    ["select=*,committees(name)&limit=1", "select=*,committees!profiles_committee_id_fkey(name)&limit=1"],
    [
      'list("profiles", "select=*,committees(name)&order=created_at.desc")',
      'list("profiles", "select=*,committees!profiles_committee_id_fkey(name)&order=created_at.desc")'
    ],
    [
      'list("committees", "select=*,profiles(display_name)&order=name.asc")',
      'list("committees", "select=*,profiles!committees_chair_profile_id_fkey(display_name)&order=name.asc")'
    ],
    [
      "profile_committees(committee_id,role_in_committee,committee:committees(id,name,status))",
      "profile_committees!profile_committees_profile_id_fkey(committee_id,role_in_committee,committee:committees(id,name,status))"
    ]
  ];

  for (const [from, to] of replacements) {
    next = replaceAll(next, from, to);
  }

  if (next !== service) await writeFile(servicePath, next);
}

function normalizeSnapshotFiles(files) {
  const normalizePath = (path) => {
    const normalizedPath = path.replaceAll("\\", "/");
    return normalizedPath.startsWith("dist/") ? normalizedPath : `dist/${normalizedPath}`;
  };

  if (Array.isArray(files)) {
    return files.map((file) => ({ ...file, path: normalizePath(file.path) }));
  }
  if (files && typeof files === "object") {
    return Object.entries(files).map(([path, content]) => ({ path: normalizePath(path), content }));
  }
  throw new Error("Yayin paketi gecersiz dosya formatinda.");
}

function repairBundleChunk(name, text) {
  if (name === "bundle-000.br.b64" && text.length === 6666) {
    return text.replace(
      "t+lpoyHCAj7ujNIKhx+v9eGdUk7tkqUFiEAYF09XD2uir4LLWcJUP90YLWZofECqP50q39",
      "t+lpoyHCAj7ujNIKhx+v9eGdUk7tkq3qUFiEAYF09XD2uir4LLWcJUP90YLWZofECqP50q39"
    );
  }
  return text;
}

async function unpackSnapshot() {
  try {
    const standalone = await readFile(join(packageDir, "runtime.br.b64"), "utf8");
    const files = normalizeSnapshotFiles(
      JSON.parse(brotliDecompressSync(Buffer.from(standalone.trim(), "base64")).toString("utf8"))
    );

    await rm(join(root, "dist"), { recursive: true, force: true });
    for (const file of files) {
      const destination = join(root, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(file.content, "base64"));
    }
    await patchClientBundle();
    await patchPortalServiceBundle();

    console.log("Vercel ciktilari tek yayin paketinden olusturuldu.");
    return true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const bundleEntries = (await readdir(packageDir))
    .filter((name) => name.startsWith("bundle-") && (name.endsWith(".br") || name.endsWith(".br.b64")))
    .sort();

  if (bundleEntries.length) {
    const chunks = await Promise.all(bundleEntries.map(async (name) => {
      const chunk = await readFile(join(packageDir, name));
      return name.endsWith(".b64") ? Buffer.from(repairBundleChunk(name, chunk.toString("utf8").trim()), "base64") : chunk;
    }));
    const files = normalizeSnapshotFiles(JSON.parse(brotliDecompressSync(Buffer.concat(chunks)).toString("utf8")));

    await rm(join(root, "dist"), { recursive: true, force: true });
    for (const file of files) {
      const destination = join(root, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(file.content, "base64"));
    }
    await patchClientBundle();
    await patchPortalServiceBundle();

    console.log("Vercel ciktilari yeni yayin paketinden olusturuldu.");
    return true;
  }

  const entries = (await readdir(packageDir))
    .filter((name) => name.startsWith("runtime-") && (name.endsWith(".br") || name.endsWith(".br.b64")))
    .sort();

  if (!entries.length) return false;

  const chunks = await Promise.all(entries.map(async (name) => {
    const chunk = await readFile(join(packageDir, name));
    return name.endsWith(".b64") ? Buffer.from(normalizeBase64Chunk(name, chunk.toString("utf8")), "base64") : chunk;
  }));
  const files = JSON.parse(brotliDecompressSync(Buffer.concat(chunks)).toString("utf8"));

  await rm(join(root, "dist"), { recursive: true, force: true });
  for (const file of files) {
    const destination = join(root, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(file.content, "base64"));
  }
  await patchClientBundle();
  await patchPortalServiceBundle();

  console.log("Vercel ciktilari yayin paketinden olusturuldu.");
  return true;
}

async function sourceBuildAvailable() {
  try {
    await access(join(root, "src", "app.ts"));
    await access(join(root, "scripts", "build.mjs"));
    return true;
  } catch {
    return false;
  }
}

try {
  if (await unpackSnapshot()) {
    // Keep the verified packaged output path, then apply the compatibility patches above.
  } else if (await sourceBuildAvailable()) {
    await import("./build.mjs");
    await patchClientBundle();
    await patchPortalServiceBundle();
  } else {
    await import("./build.mjs");
    await patchClientBundle();
    await patchPortalServiceBundle();
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  await import("./build.mjs");
  await patchClientBundle();
  await patchPortalServiceBundle();
}
