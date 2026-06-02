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

  console.log("Vercel ciktilari yayin paketinden olusturuldu.");
  return true;
}

try {
  if (!(await unpackSnapshot())) await import("./build.mjs");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  await import("./build.mjs");
}
