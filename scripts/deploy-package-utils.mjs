import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const PART_SIZE = 1_800_000;

async function filesBelow(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function portable(path) {
  return path.replaceAll("\\", "/");
}

export async function prepareLargeDeployFiles(packageDir) {
  const manifest = [];
  for (const filePath of await filesBelow(join(packageDir, "public"))) {
    const fileStat = await stat(filePath);
    if (fileStat.size <= PART_SIZE) continue;
    const data = await readFile(filePath);
    const parts = [];
    for (let offset = 0, index = 0; offset < data.length; offset += PART_SIZE, index += 1) {
      const partPath = `${filePath}.ihp-part-${String(index).padStart(3, "0")}`;
      await writeFile(partPath, data.subarray(offset, Math.min(offset + PART_SIZE, data.length)));
      parts.push(portable(relative(packageDir, partPath)));
    }
    await rm(filePath);
    manifest.push({ target: portable(relative(packageDir, filePath)), parts });
  }

  await writeFile(join(packageDir, "large-files.json"), JSON.stringify(manifest), "utf8");
  await writeFile(join(packageDir, "reconstruct-deploy-files.mjs"), `
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(await readFile(new URL("./large-files.json", import.meta.url), "utf8"));
for (const item of manifest) {
  const chunks = await Promise.all(item.parts.map((path) => readFile(new URL(path, import.meta.url))));
  const target = new URL(item.target, import.meta.url);
  await mkdir(dirname(fileURLToPath(target)), { recursive: true });
  await writeFile(target, Buffer.concat(chunks));
  await Promise.all(item.parts.map((path) => rm(new URL(path, import.meta.url))));
}
`, "utf8");
}
