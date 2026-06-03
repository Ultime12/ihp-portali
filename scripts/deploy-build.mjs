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
      '  vice_president: "BaÅŸkan YardÄ±mcÄ±sÄ±",\n  spokesperson: "Parti SÃ¶zcÃ¼sÃ¼",',
      '  vice_president: "BaÅŸkan YardÄ±mcÄ±sÄ±",\n  presidential_aide: "BaÅŸkan Yaveri",\n  spokesperson: "Parti SÃ¶zcÃ¼sÃ¼",'
    ],
    [
      '  discipline_chair: "Disiplin Kurulu BaÅŸkanÄ±",\n  discipline_member: "Disiplin Kurulu Ãœyesi",',
      '  discipline_chair: "Disiplin Kurulu BaÅŸkanÄ±",\n  discipline_vice_chair: "Disiplin Kurulu BaÅŸkan YardÄ±mcÄ±sÄ±",\n  discipline_admission_officer: "Disiplin BaÅŸkanÄ± + Ãœye AlÄ±m Sorumlusu",\n  discipline_member: "Disiplin Kurulu Ãœyesi",'
    ],
    [
      '  admission_officer: "Ãœye AlÄ±m Sorumlusu",\n  member: "Ãœye",',
      '  admission_officer: "Ãœye AlÄ±m Sorumlusu",\n  representative: "Temsilci",\n  chief_representative: "BaÅŸ Temsilci",\n  member: "Ãœye",'
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
      '<label for="invite-name">Anonim gÃ¶rÃ¼nen ad</label>',
      '<label for="invite-name">GÃ¶rÃ¼nen ad</label>'
    ],
    [
      'placeholder="Ãœye 1"',
      'placeholder="Ad Soyad"'
    ],
    [
      'title="Ãœye 1 gibi anonim bir etiket veya rol adÄ± kullanÄ±n."',
      'title="Ad soyad veya gÃ¼venli gÃ¶rÃ¼nen ad kullanÄ±n."'
    ],
    [
      'pattern="Ãœye [0-9]+|Yeni Ãœye|Yetkili Ãœye|Disiplin Yetkilisi|SÃ¼per Admin|BaÅŸkan|BaÅŸkan YardÄ±mcÄ±sÄ±|Parti SÃ¶zcÃ¼sÃ¼|Disiplin Kurulu BaÅŸkanÄ±|Disiplin Kurulu Ãœyesi|GenÃ§lik Kurulu BaÅŸkanÄ±|GenÃ§lik Kurulu Ãœyesi|Ãœye AlÄ±m Sorumlusu|Misafir Ãœye"',
      'pattern="[A-Za-zÃ‡ÄÄ°Ã–ÅÃœÃ§ÄŸÄ±Ã¶ÅŸÃ¼ .\'-]{2,48}"'
    ]
  ];

  for (const [from, to] of replacements) {
    next = next.replace(from, to);
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
    ]
  ];

  for (const [from, to] of replacements) {
    next = next.replace(from, to);
  }

  if (next !== service) await writeFile(servicePath, next);
}

function normalizeSnapshotFiles(files) {
  if (Array.isArray(files)) return files;
  if (files && typeof files === "object") {
    return Object.entries(files).map(([path, content]) => ({ path, content }));
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
  } else if (!(await unpackSnapshot())) {
    await import("./build.mjs");
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  await import("./build.mjs");
}
