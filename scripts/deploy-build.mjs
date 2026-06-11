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

const files = normalizeSnapshotFiles(
  JSON.parse(brotliDecompressSync(await readSnapshotBuffer()).toString("utf8"))
);

await rm(join(root, "dist"), { recursive: true, force: true });
for (const file of files) {
  const destination = join(root, file.path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(file.content, "base64"));
}

console.log("Vercel ciktilari yayin paketinden olusturuldu.");
