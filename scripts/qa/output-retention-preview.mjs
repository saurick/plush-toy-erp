#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const OUTPUT_RETENTION_PREVIEW_CONTRACT =
  "plush.output-retention-preview/v1";
export const OUTPUT_RETENTION_MANAGED_BUDGET_BYTES = 5 * 1024 ** 3;

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const MAX_METADATA_BYTES = 512 * 1024;
const MANAGED_GROUPS = Object.freeze([
  Object.freeze({
    key: "local-acceptance-lifecycle",
    relativeRoot: "output/qa/local-acceptance-lifecycle",
    keepNewest: 3,
    receipt: "receipt.json",
  }),
  Object.freeze({
    key: "release-builds",
    relativeRoot: "output/releases",
    keepNewest: 2,
    receipt: "release-manifest.json",
  }),
  Object.freeze({
    key: "release-evidence",
    relativeRoot: "output/release",
    keepNewest: 2,
    receipt: "release-manifest.json",
  }),
  Object.freeze({
    key: "version-center-releases",
    relativeRoot: "output/dev-workbench/releases",
    keepNewest: 2,
    receipt: "release-manifest.json",
  }),
]);

function readBoundedJson(file) {
  const stat = lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size <= 0 ||
    stat.size > MAX_METADATA_BYTES
  ) {
    throw new Error("retention metadata is not a bounded plain file");
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function directorySize(directory) {
  let bytes = 0;
  let files = 0;
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error("managed output contains a symbolic link");
      }
      if (stat.isDirectory()) {
        pending.push(absolute);
      } else if (stat.isFile()) {
        bytes += stat.size;
        files += 1;
      } else {
        throw new Error("managed output contains an unsupported entry");
      }
    }
  }
  return { bytes, files };
}

function normalizeStatus(value) {
  return ["passed", "failed", "blocked", "not_proven"].includes(value)
    ? value
    : "unknown";
}

function discoverIdentity(entry, receiptName) {
  const receiptPath = path.join(entry.absolute, receiptName);
  let receipt = null;
  if (existsSync(receiptPath)) {
    try {
      receipt = readBoundedJson(receiptPath);
    } catch {
      return {
        status: "unknown",
        gitSha: "",
        metadataStatus: "invalid",
      };
    }
  }
  const candidates = [
    receipt?.gitSha,
    receipt?.git?.commit,
    receipt?.git?.sha,
    receipt?.release?.gitSha,
    SHA_PATTERN.test(entry.name) ? entry.name : "",
  ];
  const gitSha =
    candidates.map((value) => String(value || "")).find((value) =>
      SHA_PATTERN.test(value),
    ) || "";
  return {
    status: normalizeStatus(receipt?.status),
    gitSha,
    metadataStatus: receipt ? "read" : "missing",
  };
}

function listOperationProtectedShas(root) {
  const operationsRoot = path.join(
    root,
    "output",
    "dev-workbench",
    "delivery-operations",
    "operations",
  );
  if (!existsSync(operationsRoot)) return [];
  const protectedShas = new Set();
  for (const name of readdirSync(operationsRoot)) {
    if (!/^[0-9a-f-]{36}\.json$/u.test(name)) continue;
    try {
      const operation = readBoundedJson(path.join(operationsRoot, name));
      if (
        SHA_PATTERN.test(String(operation?.gitSha || "")) &&
        !["failed", "blocked"].includes(operation?.status)
      ) {
        protectedShas.add(operation.gitSha);
      }
    } catch {
      // Invalid operation metadata must not be treated as deletion authority.
    }
  }
  return [...protectedShas];
}

function chooseProtectedEntries(entries, keepNewest, protectedShas) {
  const keep = new Map();
  const sorted = [...entries].sort(
    (left, right) =>
      right.modifiedAtMs - left.modifiedAtMs ||
      right.relativePath.localeCompare(left.relativePath),
  );
  sorted.slice(0, keepNewest).forEach((entry) => {
    keep.set(entry.relativePath, "newest");
  });
  for (const status of ["passed", "failed", "not_proven"]) {
    const latest = sorted.find((entry) => entry.status === status);
    if (latest) keep.set(latest.relativePath, `latest-${status}`);
  }
  for (const entry of sorted) {
    if (
      entry.gitSha &&
      protectedShas.some(
        (sha) =>
          sha === entry.gitSha ||
          entry.name.startsWith(sha.slice(0, 8)) ||
          entry.name.includes(sha),
      )
    ) {
      keep.set(entry.relativePath, "referenced-sha");
    }
    if (entry.metadataStatus === "invalid" || entry.hasSymbolicLink) {
      keep.set(entry.relativePath, "manual-review-required");
    }
  }
  return keep;
}

export function buildOutputRetentionPreview(
  repoRoot,
  {
    protectedShas = [],
    generatedAt = new Date().toISOString(),
  } = {},
) {
  const root = realpathSync(repoRoot);
  const explicitShas = protectedShas.map(String);
  if (explicitShas.some((sha) => !SHA_PATTERN.test(sha))) {
    throw new Error("protected SHA must be a full 40-character SHA");
  }
  const allProtectedShas = [
    ...new Set([...explicitShas, ...listOperationProtectedShas(root)]),
  ].sort();
  const groups = [];
  let keepBytes = 0;
  let reviewDeleteBytes = 0;

  for (const group of MANAGED_GROUPS) {
    const absoluteRoot = path.join(root, group.relativeRoot);
    if (!existsSync(absoluteRoot)) {
      groups.push({
        key: group.key,
        relativeRoot: group.relativeRoot,
        status: "missing",
        entries: [],
      });
      continue;
    }
    const rootStat = lstatSync(absoluteRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error(`managed output root is invalid: ${group.relativeRoot}`);
    }
    const entries = readdirSync(absoluteRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => {
        const absolute = path.join(absoluteRoot, entry.name);
        const stat = statSync(absolute);
        let size = { bytes: 0, files: 0 };
        let hasSymbolicLink = false;
        try {
          size = directorySize(absolute);
        } catch {
          hasSymbolicLink = true;
        }
        const identity = discoverIdentity(
          { absolute, name: entry.name },
          group.receipt,
        );
        return {
          name: entry.name,
          relativePath: path.posix.join(group.relativeRoot, entry.name),
          modifiedAt: stat.mtime.toISOString(),
          modifiedAtMs: stat.mtimeMs,
          bytes: size.bytes,
          files: size.files,
          hasSymbolicLink,
          ...identity,
        };
      });
    const protectedEntries = chooseProtectedEntries(
      entries,
      group.keepNewest,
      allProtectedShas,
    );
    const decisions = entries
      .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs)
      .map(({ modifiedAtMs: _modifiedAtMs, ...entry }) => {
        const reason = protectedEntries.get(entry.relativePath);
        const decision = reason ? "keep" : "review_delete";
        if (decision === "keep") keepBytes += entry.bytes;
        else reviewDeleteBytes += entry.bytes;
        return {
          ...entry,
          decision,
          reason: reason || "outside-retention-window",
        };
      });
    groups.push({
      key: group.key,
      relativeRoot: group.relativeRoot,
      status: "scanned",
      keepNewest: group.keepNewest,
      entries: decisions,
    });
  }

  const managedBytes = keepBytes + reviewDeleteBytes;
  return {
    schemaVersion: OUTPUT_RETENTION_PREVIEW_CONTRACT,
    generatedAt,
    mode: "preview_only",
    protectedShas: allProtectedShas,
    policy: {
      deletesFiles: false,
      keepsNewestPerManagedGroup: true,
      keepsLatestPassedFailedAndUnknown: true,
      keepsReferencedOperationVersions: true,
      symbolicLinksRequireManualReview: true,
      unmanagedOutputIsNeverProposedForDeletion: true,
      managedBudgetBytes: OUTPUT_RETENTION_MANAGED_BUDGET_BYTES,
    },
    summary: {
      managedBytes,
      keepBytes,
      reviewDeleteBytes,
      overBudgetBytes: Math.max(
        0,
        managedBytes - OUTPUT_RETENTION_MANAGED_BUDGET_BYTES,
      ),
      budgetStatus:
        managedBytes > OUTPUT_RETENTION_MANAGED_BUDGET_BYTES
          ? "review_required"
          : "within_budget",
      reviewDeleteEntries: groups
        .flatMap((group) => group.entries)
        .filter((entry) => entry.decision === "review_delete").length,
    },
    groups,
    redaction: {
      containsAbsolutePaths: false,
      containsSecrets: false,
      containsCredentials: false,
    },
    nextAction:
      "review every review_delete entry; this command intentionally has no apply mode",
  };
}

function currentHead(repoRoot) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const sha = String(result.stdout || "").trim();
  if (result.status !== 0 || !SHA_PATTERN.test(sha)) {
    throw new Error("current HEAD is unavailable");
  }
  return sha;
}

function parseArgs(argv) {
  const options = { out: "", protectedShas: [], json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (["--out", "--protect-sha"].includes(token)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${token} requires a value`);
      }
      if (token === "--out") options.out = value;
      else options.protectedShas.push(value);
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }
  return options;
}

function writePreview(repoRoot, requested, preview) {
  const allowedRoot = path.join(
    repoRoot,
    "output",
    "dev-workbench",
    "retention",
    "previews",
  );
  const destination = path.resolve(repoRoot, requested);
  if (
    !destination.startsWith(`${allowedRoot}${path.sep}`) ||
    !destination.endsWith(".json")
  ) {
    throw new Error("preview output must remain in the fixed retention root");
  }
  mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  writeFileSync(destination, `${JSON.stringify(preview, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  return path.relative(repoRoot, destination).replaceAll(path.sep, "/");
}

function isMainModule() {
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(`Usage:
  node scripts/qa/output-retention-preview.mjs \\
    [--protect-sha <40-sha>] [--out output/dev-workbench/retention/previews/<name>.json] [--json]

This command only produces a bounded review preview. It never deletes files
and deliberately provides no --apply mode.`);
      process.exit(0);
    }
    const repoRoot = process.cwd();
    const preview = buildOutputRetentionPreview(repoRoot, {
      protectedShas: [currentHead(repoRoot), ...options.protectedShas],
    });
    let outputPath = "";
    if (options.out) outputPath = writePreview(repoRoot, options.out, preview);
    console.log(
      options.json
        ? JSON.stringify({ ...preview, outputPath }, null, 2)
        : `output retention preview: review_delete=${preview.summary.reviewDeleteEntries} bytes=${preview.summary.reviewDeleteBytes} output=${outputPath || "stdout-only"}`,
    );
  } catch (error) {
    console.error(`[output-retention-preview] ${error.message}`);
    process.exit(1);
  }
}
