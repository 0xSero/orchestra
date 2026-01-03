import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "dist");

const expected = {
  "index.html":
    "002ac0a3ca4aec40e726f95999268a62ab218eac6e3bff75f0f95f9369c1fd4b",
  "styles.css":
    "719dc6484aa52179eede2320c49745850a3e46b9a61fca2bb707d301394a0713",
  "app.js": "6a8c44fe7835f45004815333d6fefc14b30a4e4055132f0fcd75599f3ca270b4",
};

const files = Object.keys(expected);

const hashFile = async (name) => {
  const content = await readFile(join(distDir, name));
  return createHash("sha256").update(content).digest("hex");
};

const results = await Promise.all(
  files.map(async (name) => ({ name, hash: await hashFile(name) })),
);

const failures = results.filter(({ name, hash }) => expected[name] !== hash);

if (failures.length > 0) {
  const lines = failures.map(
    (item) => `${item.name}: expected ${expected[item.name]} got ${item.hash}`,
  );
  throw new Error(`Fixture output mismatch:\n${lines.join("\n")}`);
}

const markers = await Promise.all(
  files.map(async (name) => ({
    name,
    content: await readFile(join(distDir, name), "utf8"),
  })),
);

const index = markers.find((item) => item.name === "index.html");
if (!index || !index.content.includes("Orbit Build Report")) {
  throw new Error("Missing expected title in index.html");
}
