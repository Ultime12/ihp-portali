import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { brotliDecompressSync } from "node:zlib";

const root = process.cwd();
const packageDir = join(root, "package");

function normalizeSnapshotFiles(files) {
  const normalizePath = (filePath) => {
    const normalizedPath = filePath.replaceAll("\\", "/");
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

async function readPackageEntry(name) {
  const raw = await readFile(join(packageDir, name));
  return name.endsWith(".b64") ? Buffer.from(raw.toString("utf8").trim(), "base64") : raw;
}

async function readSnapshotBuffer() {
  try {
    return await readPackageEntry("runtime.br.b64");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const runtimeEntries = (await readdir(packageDir))
    .filter((name) => /^runtime-\d+\.br(\.b64)?$/.test(name))
    .sort();
  if (runtimeEntries.length) {
    const chunks = await Promise.all(runtimeEntries.map(readPackageEntry));
    return Buffer.concat(chunks);
  }

  const bundleEntries = (await readdir(packageDir))
    .filter((name) => /^bundle-\d+\.br(\.b64)?$/.test(name))
    .sort();
  if (bundleEntries.length) {
    const chunks = await Promise.all(bundleEntries.map(readPackageEntry));
    return Buffer.concat(chunks);
  }

  throw new Error("Yayin paketi bulunamadi.");
}

async function patchInvestigationTargets() {
  const appPath = join(root, "dist", "src", "app.js");
  let source = await readFile(appPath, "utf8");

  if (!source.includes("function isProtectedInvestigationTarget(profile)")) {
    const disciplineProtection = `function isProtectedDisciplineTarget(profile) {
  return rolesOf(profile).some((role) => ["super_admin", "president", "vice_president"].includes(role));
}
`;
    source = source.replace(
      disciplineProtection,
      `${disciplineProtection}
function isProtectedInvestigationTarget(profile) {
  return rolesOf(profile).some((role) => ["president", "vice_president"].includes(role));
}
`
    );
  }

  if (!source.includes("function investigationTargetMembers()")) {
    source = source.replace(
      `function disciplineTargetMembers() {
  return (state.cache.disciplineMembers || state.cache.members || []).filter(canDisciplineTarget);
}
`,
      `function disciplineTargetMembers() {
  return (state.cache.disciplineMembers || state.cache.members || []).filter(canDisciplineTarget);
}

function canInvestigateTarget(member) {
  if (!member || member.id === state.profile?.id) return false;
  if (isTechnicalSuperAdmin(member)) return false;
  if (hasRole("super_admin")) return true;
  if (!hasRole("discipline_chair", "discipline_vice_chair", "discipline_member")) return false;
  if (isProtectedInvestigationTarget(member)) return false;
  const actorRank = disciplineRank(state.profile);
  const targetRank = disciplineRank(member);
  return targetRank === 0 || targetRank < actorRank;
}

function investigationTargetMembers() {
  return (state.cache.disciplineMembers || state.cache.members || []).filter(canInvestigateTarget);
}
`
    );
  }

  source = source.replace(
    `function openInvestigation() {
  const openInvestigations = (state.cache.investigations || []).filter((item) => ["open", "reviewing"].includes(item.status));
  const members = disciplineTargetMembers();`,
    `function openInvestigation() {
  const openInvestigations = (state.cache.investigations || []).filter((item) => ["open", "reviewing"].includes(item.status));
  const members = investigationTargetMembers();`
  );
  source = source.replace(
    `function openInvestigation() {
  if (!permissions.disciplineManage()) return;
  const members = disciplineTargetMembers();`,
    `function openInvestigation() {
  if (!permissions.disciplineManage()) return;
  const members = investigationTargetMembers();`
  );

  await writeFile(appPath, source);
}

async function injectPortalPatch(scriptName, marker) {
  const appPath = join(root, "dist", "src", "app.js");
  let source = await readFile(appPath, "utf8");
  const listenerAnchor = 'document.addEventListener("click", handleClick);';
  if (source.includes(marker)) return;
  if (!source.includes(listenerAnchor)) {
    throw new Error("Portal dinleyici noktasi bulunamadi.");
  }

  const patchSource = await readFile(join(root, "scripts", scriptName), "utf8");
  source = source.replace(listenerAnchor, `${patchSource}\n\n${listenerAnchor}`);
  await writeFile(appPath, source);
}

async function patchPortalFeatureBundle() {
  await injectPortalPatch("portal-feature-patch.js", "IHP_ACCESS_FEATURE_PATCH_V1");
  const appPath = join(root, "dist", "src", "app.js");
  const sourceAfterFeature = await readFile(appPath, "utf8");
  if (!sourceAfterFeature.includes("IHP_ACCESS_FEATURE_PATCH_V2")) {
    await injectPortalPatch("portal-access-lock-patch.js", "IHP_ACCESS_LOCK_PATCH_V3");
  }
  await injectPortalPatch("portal-logo-report-patch.js", "IHP_LOGO_REPORT_PATCH_V1");
  await injectPortalPatch("public-polish-patch.js", "IHP_PUBLIC_POLISH_PATCH_V1");
  await injectPortalPatch("google-auth-patch.js", "IHP_GOOGLE_AUTH_PATCH_V1");
  await injectPortalPatch("agreements-feature-patch-a.js", "IHP_AGREEMENTS_FEATURE_PATCH_V1");
  await injectPortalPatch("agreements-feature-patch-b.js", "IHP_AGREEMENTS_RUNTIME_PATCH_V1");
  await injectPortalPatch("whatsapp-notifications-patch.js", "IHP_WHATSAPP_NOTIFICATIONS_PATCH_V1");
}

const files = normalizeSnapshotFiles(
  JSON.parse(brotliDecompressSync(await readSnapshotBuffer()).toString("utf8"))
);

await rm(join(root, "dist"), { recursive: true, force: true });
for (const file of files) {
  const destination = join(root, file.path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(file.content, "base64"));
}

await patchInvestigationTargets();
await patchPortalFeatureBundle();

console.log("Vercel ciktilari yayin paketinden olusturuldu.");
