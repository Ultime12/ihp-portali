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

async function patchPersistentAuthSession() {
  const supabasePath = join(root, "dist", "src", "lib", "supabase.js");
  let source = await readFile(supabasePath, "utf8");
  if (source.includes("function sessionStore()")) return;

  const sessionBlockPattern =
    /function readSession\(\)\s+\{[\s\S]*?\n\}\n\nfunction writeSession\(nextSession\s*\)\s+\{[\s\S]*?\n\}\n\nfunction isExpired/;
  if (!sessionBlockPattern.test(source)) {
    throw new Error("Supabase oturum saklama bolumu bulunamadi.");
  }

  const persistentSessionBlock = `function sessionStore() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function legacySessionStore() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function readSession()                     {
  try {
    const store = sessionStore();
    const legacyStore = legacySessionStore();
    const raw = store?.getItem(SESSION_KEY) || legacyStore?.getItem(SESSION_KEY);
    session = raw ? JSON.parse(raw) : null;
    if (session && store && legacyStore?.getItem(SESSION_KEY)) {
      store.setItem(SESSION_KEY, JSON.stringify(session));
      legacyStore.removeItem(SESSION_KEY);
    }
  } catch {
    session = null;
  }
  return session;
}

function writeSession(nextSession                    ) {
  session = nextSession;
  const store = sessionStore();
  const legacyStore = legacySessionStore();
  try {
    if (nextSession) {
      store?.setItem(SESSION_KEY, JSON.stringify(nextSession));
    } else {
      store?.removeItem(SESSION_KEY);
    }
    legacyStore?.removeItem(SESSION_KEY);
  } catch {
    // Some browsers can block persistent storage in private or hardened modes.
  }
}

function isExpired`;

  source = source.replace(sessionBlockPattern, persistentSessionBlock);
  await writeFile(supabasePath, source);
}

async function patchPortalFeatureBundle() {
  await injectPortalPatch("portal-feature-patch.js", "IHP_ACCESS_FEATURE_PATCH_V1");
  const appPath = join(root, "dist", "src", "app.js");
  const sourceAfterFeature = await readFile(appPath, "utf8");
  if (!sourceAfterFeature.includes("IHP_ACCESS_FEATURE_PATCH_V2")) {
    await injectPortalPatch("portal-access-lock-patch.js", "IHP_ACCESS_LOCK_PATCH_V3");
  }
  await injectPortalPatch("portal-logo-report-patch.js", "IHP_LOGO_REPORT_PATCH_V1");
  await injectPortalPatch("liquid-glass-patch.js", "IHP_LIQUID_GLASS_PATCH_V1");
  await injectPortalPatch("agreements-feature-patch-a.js", "IHP_AGREEMENTS_FEATURE_PATCH_V1");
  await injectPortalPatch("agreements-feature-patch-b.js", "IHP_AGREEMENTS_RUNTIME_PATCH_V1");
}

async function patchLiquidLoginOutput() {
  const appPath = join(root, "dist", "src", "app.js");
  let source = await readFile(appPath, "utf8");

  source = source.replace(
    `body:has(.liquid-public), body:has(.liquid-login) { background:#071426; }`,
    `body:has(.liquid-public), body:has(.liquid-login) {
      margin:0;
      overflow-x:hidden;
      background:
        radial-gradient(circle at 14% 10%,rgba(112,167,255,.22),transparent 34rem),
        radial-gradient(circle at 86% 18%,rgba(18,72,136,.3),transparent 34rem),
        linear-gradient(135deg,#050d19 0%,#0a1a31 52%,#06111f 100%);
    }`
  );

  source = source.replace(
    `.liquid-login { display:grid; grid-template-columns:minmax(0,1fr) minmax(390px,480px); gap:clamp(2rem,6vw,4.6rem); align-items:center; width:min(1160px,calc(100vw - 3rem)); margin:0 auto; padding:2rem 0; }`,
    `.liquid-login {
      display:grid;
      grid-template-columns:minmax(0,.95fr) minmax(390px,520px);
      gap:clamp(2.2rem,6vw,5.6rem);
      align-items:center;
      box-sizing:border-box;
      width:100%;
      max-width:none;
      min-height:100dvh;
      margin:0;
      padding:clamp(2rem,5vw,4.4rem) max(1.5rem,calc((100vw - 1320px) / 2));
    }`
  );
  source = source.replace(
    `.liquid-login-copy h1 { margin:1rem 0; font-family:"Manrope",sans-serif; font-size:clamp(3.9rem,7.6vw,7rem); letter-spacing:-.09em; line-height:.95; } .liquid-login-copy h1 span { display:block; color:var(--liquid-blue); }`,
    `.liquid-login-copy h1 { margin:1rem 0; font-family:"Manrope",sans-serif; font-size:clamp(4rem,8vw,7.6rem); letter-spacing:-.09em; line-height:.95; } .liquid-login-copy h1 span { display:block; color:var(--liquid-blue); }`
  );
  source = source.replace(
    `.liquid-login-card { border-radius:36px; padding:1px; border:1px solid rgba(255,255,255,.13); background:linear-gradient(145deg,rgba(255,255,255,.36),rgba(141,187,255,.16),rgba(255,255,255,.06)); box-shadow:0 44px 120px rgba(0,8,20,.46); backdrop-filter:blur(34px) saturate(150%); }`,
    `.liquid-login-card { width:100%; max-width:520px; justify-self:end; border-radius:36px; padding:1px; border:1px solid rgba(255,255,255,.13); background:linear-gradient(145deg,rgba(255,255,255,.36),rgba(141,187,255,.16),rgba(255,255,255,.06)); box-shadow:0 44px 120px rgba(0,8,20,.46); backdrop-filter:blur(34px) saturate(150%); }`
  );
  source = source.replace(
    `@media (max-width:980px){ .liquid-hero-grid,.liquid-login{grid-template-columns:1fr; gap:2.4rem}.liquid-device{transform:none; animation:none}.liquid-feature-grid{grid-template-columns:1fr}.liquid-public .nav-links a{display:none} }
    @media (max-width:640px){ .liquid-title{font-size:clamp(3.4rem,20vw,5.3rem)}.liquid-dashboard-strip{grid-template-columns:1fr}.liquid-device-screen{min-height:auto}.liquid-login{width:min(100% - 2rem,480px)}.liquid-banner{align-items:flex-start; flex-direction:column} }`,
    `@media (max-width:980px){ .liquid-hero-grid,.liquid-login{grid-template-columns:1fr; gap:2.4rem}.liquid-login{padding:2rem 1rem}.liquid-login-card{justify-self:stretch; max-width:none}.liquid-device{transform:none; animation:none}.liquid-feature-grid{grid-template-columns:1fr}.liquid-public .nav-links a{display:none} }
    @media (max-width:640px){ .liquid-title{font-size:clamp(3.4rem,20vw,5.3rem)}.liquid-dashboard-strip{grid-template-columns:1fr}.liquid-device-screen{min-height:auto}.liquid-login{width:100%; padding:1.25rem}.liquid-banner{align-items:flex-start; flex-direction:column} }`
  );
  source = source.replace(
    `İHP çalışma alanına hesabınızla giriş yapın. Yetkileriniz otomatik uygulanır, gereksiz açıklamalar değil doğrudan kullanacağınız panel görünür.`,
    `Hesabınızla giriş yapın; portal sizi yetkinize göre doğrudan kendi çalışma alanınıza alır.`
  );

  await writeFile(appPath, source);
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
await patchPersistentAuthSession();
await patchPortalFeatureBundle();
await patchLiquidLoginOutput();

console.log("Vercel ciktilari yayin paketinden olusturuldu.");
