import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { brotliDecompressSync } from "node:zlib";

const root = process.cwd();
const packageDir = join(root, "package");

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

  const replacements = [
    [
      '  vice_president: "Başkan Yardımcısı",\n  spokesperson: "Parti Sözcüsü",',
      '  vice_president: "Başkan Yardımcısı",\n  presidential_aide: "Başkan Yaveri",\n  spokesperson: "Parti Sözcüsü",'
    ],
    [
      '  discipline_chair: "Disiplin Kurulu Başkanı",\n  discipline_member: "Disiplin Kurulu Üyesi",',
      '  discipline_chair: "Disiplin Kurulu Başkanı",\n  discipline_vice_chair: "Disiplin Kurulu Başkan Yardımcısı",\n  discipline_admission_officer: "Disiplin Başkanı + Üye Alım Sorumlusu",\n  discipline_member: "Disiplin Kurulu Üyesi",'
    ],
    [
      '  admission_officer: "Üye Alım Sorumlusu",\n  member: "Üye",',
      '  admission_officer: "Üye Alım Sorumlusu",\n  representative: "Temsilci",\n  chief_representative: "Baş Temsilci",\n  member: "Üye",'
    ],
    [
      '["super_admin", "president", "vice_president", "admission_officer"].includes(',
      '["super_admin", "president", "vice_president", "presidential_aide", "admission_officer", "discipline_admission_officer", "chief_representative"].includes('
    ],
    [
      '["super_admin", "president", "vice_president", "spokesperson", "youth_chair"].includes(',
      '["super_admin", "president", "vice_president", "presidential_aide", "spokesperson", "youth_chair"].includes('
    ],
    [
      '      "discipline_chair",\n      "discipline_member"',
      '      "discipline_chair",\n      "discipline_vice_chair",\n      "discipline_admission_officer",\n      "discipline_member"'
    ],
    [
      '["super_admin", "discipline_chair"].includes(state.profile?.role)',
      '["super_admin", "discipline_chair", "discipline_vice_chair", "discipline_admission_officer"].includes(state.profile?.role)'
    ],
    [
      '["super_admin", "president", "vice_president", "admission_officer"].includes(\n      state.profile?.role\n    )',
      '["super_admin", "president", "vice_president", "admission_officer", "discipline_admission_officer"].includes(\n      state.profile?.role\n    )'
    ],
    [
      '<label for="invite-name">Anonim görünen ad</label>',
      '<label for="invite-name">Görünen ad</label>'
    ],
    [
      'placeholder="Üye 1"',
      'placeholder="Ad Soyad"'
    ],
    [
      'title="Üye 1 gibi anonim bir etiket veya rol adı kullanın."',
      'title="Ad soyad veya güvenli görünen ad kullanın."'
    ],
    [
      'pattern="Üye [0-9]+|Yeni Üye|Yetkili Üye|Disiplin Yetkilisi|Süper Admin|Başkan|Başkan Yardımcısı|Parti Sözcüsü|Disiplin Kurulu Başkanı|Disiplin Kurulu Üyesi|Gençlik Kurulu Başkanı|Gençlik Kurulu Üyesi|Üye Alım Sorumlusu|Misafir Üye"',
      'pattern="[A-Za-zÇĞİÖŞÜçğıöşü .\'-]{2,48}"'
    ]
  ];

  for (const [from, to] of replacements) {
    next = next.replaceAll(from, to);
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

  let next = service;
  const replacements = [
    [
      "select=*,committees(name)&limit=1",
      "select=*,committees!profiles_committee_id_fkey(name)&limit=1"
    ],
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
    next = next.replaceAll(from, to);
  }

  if (next !== service) await writeFile(servicePath, next);
}

function normalizeSnapshotFiles(files) {
  const normalizePath = (path) => {
    const normalizedPath = path.replaceAll("\\", "/");
    return normalizedPath.startsWith("dist/") ? normalizedPath : `dist/${normalizedPath}`;
  };

  if (Array.isArray(files)) {
    return files.map((file) => ({
      ...file,
      path: normalizePath(file.path)
    }));
  }
  if (files && typeof files === "object") {
    return Object.entries(files).map(([path, content]) => {
      return {
        path: normalizePath(path),
        content
      };
    });
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
  if (await sourceBuildAvailable()) {
    await import("./build.mjs");
    await patchPortalServiceBundle();
  } else if (!(await unpackSnapshot())) {
    await import("./build.mjs");
    await patchPortalServiceBundle();
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  await import("./build.mjs");
  await patchPortalServiceBundle();
}
