import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { brotliDecompressSync } from "node:zlib";

const root = process.cwd();
const packageDir = join(root, "package");

function replaceAll(source, from, to) {
  return source.split(from).join(to);
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
    .filter((name) => name.startsWith("runtime-") && (name.endsWith(".br") || name.endsWith(".br.b64")))
    .sort();
  if (runtimeEntries.length) {
    const chunks = await Promise.all(runtimeEntries.map(readPackageEntry));
    return Buffer.concat(chunks);
  }

  const bundleEntries = (await readdir(packageDir))
    .filter((name) => name.startsWith("bundle-") && (name.endsWith(".br") || name.endsWith(".br.b64")))
    .sort();
  if (bundleEntries.length) {
    const chunks = await Promise.all(bundleEntries.map(readPackageEntry));
    return Buffer.concat(chunks);
  }

  throw new Error("Yayin paketi bulunamadi.");
}

async function patchClientBundle() {
  const appPath = join(root, "dist", "src", "app.js");
  let app;
  try {
    app = await readFile(appPath, "utf8");
  } catch {
    return;
  }

  const replacements = [
    ["Yönetim Kurulu", "Yürütme Kurulu"],
    ["Gençlik Kurulu", "Gençlik Kolları"],
    ["Gençlik kurulu", "Gençlik kolları"],
    ["Duyuru ve İletişim Birimi", "Sosyal Medya Başkanlığı"],
    ["Duyuru ve iletişim birimi", "Sosyal medya başkanlığı"]
  ];

  let next = app;
  for (const [from, to] of replacements) {
    next = replaceAll(next, from, to);
  }

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

  let next = service;
  for (const [from, to] of replacements) {
    next = replaceAll(next, from, to);
  }

  if (next !== service) await writeFile(servicePath, next);
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

await patchClientBundle();
await patchPortalServiceBundle();

console.log("Vercel ciktilari yayin paketinden olusturuldu.");
