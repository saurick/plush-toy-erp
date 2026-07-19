import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
export const DEFAULT_MAX_UNTRACKED_FILE_BYTES = 16 * 1024 * 1024;
export const DEFAULT_MAX_UNTRACKED_TOTAL_BYTES = 64 * 1024 * 1024;

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const REPOSITORY_IDENTITY_KEYS = ["commit", "dirty", "fingerprint"];

export function normalizeRepositoryIdentity(identity) {
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    throw new Error("repository identity is invalid");
  }
  const keys = Object.keys(identity).sort();
  if (
    keys.length !== REPOSITORY_IDENTITY_KEYS.length ||
    keys.some((key, index) => key !== REPOSITORY_IDENTITY_KEYS[index])
  ) {
    throw new Error("repository identity is invalid");
  }
  if (
    typeof identity.commit !== "string" ||
    !/^[a-f0-9]{40,64}$/u.test(identity.commit) ||
    typeof identity.dirty !== "boolean" ||
    typeof identity.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/u.test(identity.fingerprint)
  ) {
    throw new Error("repository identity is invalid");
  }
  return {
    commit: identity.commit,
    dirty: identity.dirty,
    fingerprint: identity.fingerprint,
  };
}

export function repositoryIdentitiesEqual(left, right) {
  try {
    const normalizedLeft = normalizeRepositoryIdentity(left);
    const normalizedRight = normalizeRepositoryIdentity(right);
    return (
      normalizedLeft.commit === normalizedRight.commit &&
      normalizedLeft.dirty === normalizedRight.dirty &&
      normalizedLeft.fingerprint === normalizedRight.fingerprint
    );
  } catch {
    return false;
  }
}

export function assertRepositoryIdentityEqual(expected, actual) {
  const normalizedExpected = normalizeRepositoryIdentity(expected);
  if (!repositoryIdentitiesEqual(normalizedExpected, actual)) {
    throw new Error("repository identity changed during evidence collection");
  }
  return normalizedExpected;
}

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value || "");
}

function updateFrame(hash, label, value) {
  const bytes = asBuffer(value);
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  hash.update(Buffer.from(label, "utf8"));
  hash.update(Buffer.from([0]));
  hash.update(length);
  hash.update(bytes);
}

function normalizeUntrackedEntry(entry) {
  const pathBytes = asBuffer(entry?.pathBytes ?? entry?.path);
  const type = String(entry?.type || "");
  const content = asBuffer(entry?.content);
  if (pathBytes.length === 0 || type !== "file") {
    throw new Error("repository identity has an unsupported untracked entry");
  }
  return { pathBytes, type, content };
}

export function buildRepositoryFingerprint({
  commit,
  porcelainBytes = Buffer.alloc(0),
  trackedDiffBytes = Buffer.alloc(0),
  untrackedEntries = [],
}) {
  const normalizedCommit = String(commit || "").trim();
  if (!/^[a-f0-9]{40,64}$/u.test(normalizedCommit)) {
    throw new Error("repository commit must be a full Git object id");
  }
  const entries = untrackedEntries
    .map(normalizeUntrackedEntry)
    .sort((left, right) => Buffer.compare(left.pathBytes, right.pathBytes));
  const hash = createHash("sha256");
  updateFrame(hash, "algorithm", "plush-repository-identity/v2");
  updateFrame(hash, "commit", normalizedCommit);
  updateFrame(hash, "porcelain", porcelainBytes);
  updateFrame(hash, "tracked-head-diff", trackedDiffBytes);
  for (const entry of entries) {
    updateFrame(hash, "untracked-path", entry.pathBytes);
    updateFrame(hash, "untracked-type", entry.type);
    updateFrame(hash, "untracked-content", entry.content);
  }
  return hash.digest("hex");
}

async function gitBytes(projectRoot, args, maxBuffer) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: projectRoot,
    encoding: null,
    maxBuffer,
  });
  return asBuffer(stdout);
}

async function readGitSnapshot(projectRoot, maxBuffer) {
  const commitBytes = await gitBytes(
    projectRoot,
    ["rev-parse", "HEAD"],
    maxBuffer,
  );
  const commit = commitBytes.toString("utf8").trim();
  if (!/^[a-f0-9]{40,64}$/u.test(commit)) {
    throw new Error("repository commit is unavailable");
  }
  const porcelainBytes = await gitBytes(
    projectRoot,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    maxBuffer,
  );
  const trackedDiffBytes = await gitBytes(
    projectRoot,
    ["diff", "--binary", "--no-ext-diff", "HEAD", "--"],
    maxBuffer,
  );
  const untrackedListBytes = await gitBytes(
    projectRoot,
    ["ls-files", "--others", "--exclude-standard", "-z"],
    maxBuffer,
  );
  return { commit, porcelainBytes, trackedDiffBytes, untrackedListBytes };
}

function splitNullTerminated(buffer) {
  const entries = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index > start) entries.push(buffer.subarray(start, index));
    start = index + 1;
  }
  if (start < buffer.length) entries.push(buffer.subarray(start));
  return entries.sort(Buffer.compare);
}

function decodeRepositoryPath(pathBytes) {
  let relativePath;
  try {
    relativePath = utf8Decoder.decode(pathBytes);
  } catch {
    throw new Error("repository identity found a non-UTF-8 untracked path");
  }
  const segments = relativePath.split("/");
  if (
    !relativePath ||
    path.posix.isAbsolute(relativePath) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("repository identity found an unsafe untracked path");
  }
  return relativePath;
}

function statIdentity(stats) {
  return {
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
    size: stats.size,
    mtimeNs: stats.mtimeNs,
  };
}

function sameStat(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs
  );
}

async function readUntrackedFile(projectRoot, pathBytes, maxFileBytes) {
  const relativePath = decodeRepositoryPath(pathBytes);
  const absolutePath = path.join(projectRoot, ...relativePath.split("/"));
  const before = await lstat(absolutePath, { bigint: true });
  if (before.isSymbolicLink()) {
    throw new Error("repository identity refuses untracked symbolic links");
  }
  if (!before.isFile()) {
    throw new Error(
      "repository identity refuses non-regular untracked entries",
    );
  }
  if (before.size > BigInt(maxFileBytes)) {
    throw new Error("repository identity refuses an oversized untracked file");
  }

  const noFollow = constants.O_NOFOLLOW || 0;
  const handle = await open(absolutePath, constants.O_RDONLY | noFollow);
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      !sameStat(statIdentity(before), statIdentity(opened))
    ) {
      throw new Error("repository changed while identity was collected");
    }
    const content = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (!sameStat(statIdentity(opened), statIdentity(after))) {
      throw new Error("repository changed while identity was collected");
    }
    return {
      pathBytes: Buffer.from(pathBytes),
      type: "file",
      content,
      absolutePath,
      stat: statIdentity(after),
    };
  } finally {
    await handle.close();
  }
}

function sameGitSnapshot(left, right) {
  return (
    left.commit === right.commit &&
    left.porcelainBytes.equals(right.porcelainBytes) &&
    left.trackedDiffBytes.equals(right.trackedDiffBytes) &&
    left.untrackedListBytes.equals(right.untrackedListBytes)
  );
}

export async function readRepositoryIdentity(
  projectRoot,
  {
    maxGitOutputBytes = DEFAULT_MAX_GIT_OUTPUT_BYTES,
    maxUntrackedFileBytes = DEFAULT_MAX_UNTRACKED_FILE_BYTES,
    maxUntrackedTotalBytes = DEFAULT_MAX_UNTRACKED_TOTAL_BYTES,
  } = {},
) {
  const root = path.resolve(projectRoot);
  const first = await readGitSnapshot(root, maxGitOutputBytes);
  const untrackedEntries = [];
  let untrackedTotalBytes = 0;
  for (const pathBytes of splitNullTerminated(first.untrackedListBytes)) {
    const entry = await readUntrackedFile(
      root,
      pathBytes,
      maxUntrackedFileBytes,
    );
    untrackedTotalBytes += entry.pathBytes.length + entry.content.length;
    if (untrackedTotalBytes > maxUntrackedTotalBytes) {
      throw new Error(
        "repository identity refuses oversized untracked content",
      );
    }
    untrackedEntries.push(entry);
  }

  const second = await readGitSnapshot(root, maxGitOutputBytes);
  if (!sameGitSnapshot(first, second)) {
    throw new Error("repository changed while identity was collected");
  }
  for (const entry of untrackedEntries) {
    const after = await lstat(entry.absolutePath, { bigint: true });
    if (!after.isFile() || !sameStat(entry.stat, statIdentity(after))) {
      throw new Error("repository changed while identity was collected");
    }
  }

  return {
    commit: first.commit,
    dirty: first.porcelainBytes.length > 0,
    fingerprint: buildRepositoryFingerprint({
      commit: first.commit,
      porcelainBytes: first.porcelainBytes,
      trackedDiffBytes: first.trackedDiffBytes,
      untrackedEntries,
    }),
  };
}
