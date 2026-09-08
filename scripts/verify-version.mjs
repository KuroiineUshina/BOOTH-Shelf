import { readFile } from "node:fs/promises";

const tag = process.argv[2];

if (tag && !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error("Release tag must use the vX.Y.Z format.");
  process.exit(1);
}

const [manifestText, packageText] = await Promise.all([
  readFile(new URL("../manifest.json", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

const manifest = JSON.parse(manifestText);
const packageJson = JSON.parse(packageText);
const expectedVersion = tag ? tag.slice(1) : manifest.version;
const versions = {
  manifest: manifest.version,
  manifestVersionName: manifest.version_name,
  package: packageJson.version,
};

for (const [source, version] of Object.entries(versions)) {
  if (version !== expectedVersion) {
    console.error(`${source} version ${version} does not match tag ${tag}.`);
    process.exit(1);
  }
}

if (!/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
  throw new Error("Project version must use X.Y.Z format.");
}
for (const name of ["RELEASE_NOTES", "TWITTER_POST"]) {
  const file = new URL(`../store-assets/${name}_${expectedVersion}.md`, import.meta.url);
  const content = await readFile(file, "utf8");
  if (!content.trim() || !content.includes(expectedVersion)) {
    throw new Error(`${name} does not describe project version ${expectedVersion}.`);
  }
}

console.log(tag
  ? `Release version verified: ${tag}`
  : `Project versions match: ${expectedVersion}`);
