import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
    next = next.replace(from, to);
  }

  if (next !== app) await writeFile(appPath, next);
}

async function unpackSnapshot() {
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

  console.log("Vercel ciktilari yayin paketinden olusturuldu.");
  return true;
}

try {
  if (!(await unpackSnapshot())) await import("./build.mjs");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  await import("./build.mjs");
}
