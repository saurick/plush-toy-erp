import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ReplicaError, requireValue, plainDirectory } from "./config.mjs";
import { command } from "./process.mjs";

export const now = () => new Date().toISOString();
export function privateDirectory(directory) {
  for (let cursor = directory; ; cursor = path.dirname(cursor)) {
    try {
      requireValue(!fs.lstatSync(cursor).isSymbolicLink(), "unsafe_directory");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (cursor === path.dirname(cursor)) break;
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  plainDirectory(directory);
  requireValue(
    fs.statSync(directory).uid === process.getuid(),
    "foreign_directory_owner",
  );
  fs.chmodSync(directory, 0o700);
  return directory;
}
export function atomicBytes(file, content) {
  try {
    requireValue(!fs.lstatSync(file).isSymbolicLink(), "unsafe_output_file");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomUUID()}`,
  );
  try {
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, content);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
export const atomicJSON = (file, value) =>
  atomicBytes(file, JSON.stringify(value, null, 2) + "\n");
export async function digest(file, signal) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file, { signal }))
    hash.update(chunk);
  return hash.digest("hex");
}
export async function checkDestinationAccess(
  c,
  mount,
  { signal, run = command } = {},
) {
  const marker = path.join(
    mount,
    c.destination.relativeDirectory,
    ".plush-backup-replica.json",
  );
  // macOS can suspend open() while awaiting removable-volume consent. Keep
  // that first read in a disposable process without the worker's signal handler.
  try {
    await run(
      [
        process.execPath,
        "--input-type=module",
        "-e",
        'import fs from "node:fs";fs.closeSync(fs.openSync(process.argv[1],"r"));',
        marker,
      ],
      { signal, timeout: 15_000 },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ReplicaError("destination_access_unavailable");
  }
}
export function destination(c, mount, initialize = false) {
  const root = path.join(mount, c.destination.relativeDirectory);
  requireValue(root.startsWith(mount + path.sep), "destination_escapes_volume");
  for (let cursor = root; cursor !== mount; cursor = path.dirname(cursor)) {
    if (fs.existsSync(cursor))
      requireValue(!fs.lstatSync(cursor).isSymbolicLink(), "unsafe_directory");
  }
  const marker = path.join(root, ".plush-backup-replica.json");
  const expected = {
    schemaVersion: "plush.backup-replica-target/v1",
    destinationId: c.destination.id,
    sourceId: c.source.id,
  };
  if (initialize && !fs.existsSync(marker)) {
    requireValue(
      !fs.existsSync(root) || fs.readdirSync(root).length === 0,
      "unowned_destination_not_empty",
    );
    privateDirectory(root);
    atomicJSON(marker, expected);
  }
  plainDirectory(root);
  const stat = fs.lstatSync(marker);
  requireValue(
    stat.isFile() && stat.uid === process.getuid(),
    "destination_marker_missing",
  );
  requireValue(
    JSON.stringify(JSON.parse(fs.readFileSync(marker))) ===
      JSON.stringify(expected),
    "destination_marker_mismatch",
  );
  requireValue(
    (fs.statSync(root).mode & 0o777) === 0o700,
    "destination_permissions_mismatch",
  );
  return root;
}
