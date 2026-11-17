import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DIAGRAMS_DIR = path.join(process.cwd(), "public", "diagrams");
const MANIFEST = path.join(DIAGRAMS_DIR, "diagrams.json");
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);

function toTitle(file: string) {
  return path
    .parse(file)
    .name.replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function POST() {
  const entries = await readdir(DIAGRAMS_DIR, { withFileTypes: true });

  const diagrams = await Promise.all(
    entries
      .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
      .map(async (e) => {
        const info = await stat(path.join(DIAGRAMS_DIR, e.name));
        return {
          id: path.parse(e.name).name,
          title: toTitle(e.name),
          file: e.name,
          src: `/diagrams/${encodeURIComponent(e.name)}`,
          size: info.size,
          updatedAt: info.mtime.toISOString(),
        };
      }),
  );

  diagrams.sort((a, b) => a.title.localeCompare(b.title));

  const manifest = { generatedAt: new Date().toISOString(), count: diagrams.length, diagrams };
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  return Response.json(manifest);
}
