import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runtimeBundleDirectory } from "../../local-runtime-bundle.mjs";

export function fixtureBundle(root, id = randomUUID()) {
  const directory = runtimeBundleDirectory(root, id);
  const content = {
    "runtime/server": "native executable fixture",
    "runtime/attachment-storage": "attachment fixture",
    "runtime/environment.json": "{}",
    "runtime/web/index.html": "<html>fixed business page</html>",
  };
  const files = Object.keys(content).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.writeFileSync(path.join(directory, file), content[file]);
    hash.update(file).update("\0").update(content[file]).update("\0");
  }
  const manifest = {
    schemaVersion: "plush.local-runtime-bundle/v1",
    id,
    platform: process.platform,
    arch: process.arch,
    sourceFingerprint: "a".repeat(64),
    backendSourceFingerprint: "b".repeat(64),
    artifactHash: hash.digest("hex"),
    files,
    migrationVersion: "20260927072615",
  };
  fs.writeFileSync(
    path.join(directory, "manifest.json"),
    JSON.stringify(manifest),
  );
  return { ...manifest, directory };
}
