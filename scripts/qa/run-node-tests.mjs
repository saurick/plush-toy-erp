#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  EXPLICIT_ONLY_NODE_TESTS,
  NODE_TEST_GROUP_ORDER,
  NODE_TEST_GROUPS,
} from "./node-test-groups.mjs";
import { verifyNodeTestSummary } from "./verify-node-test-summary.mjs";

const DEFAULT_REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_TEST_ROOT = path.resolve(import.meta.dirname, "..");
const NODE_TEST_SUFFIXES = Object.freeze([
  ".test.cjs",
  ".test.js",
  ".test.mjs",
]);
const NODE_TEST_PROFILES = Object.freeze([...NODE_TEST_GROUP_ORDER, "full"]);

export async function discoverNodeTests(rootDir = DEFAULT_TEST_ROOT) {
  const resolvedRoot = path.resolve(rootDir);
  const tests = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "output") {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (
        entry.isFile() &&
        NODE_TEST_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
      ) {
        tests.push(entryPath);
      }
    }
  }

  await walk(resolvedRoot);
  return tests.sort((left, right) => left.localeCompare(right));
}

export function catalogNodeTests(profile = "full") {
  if (!NODE_TEST_PROFILES.includes(profile)) {
    throw new Error(
      `unknown profile: ${profile}; expected ${NODE_TEST_PROFILES.join("|")}`,
    );
  }
  const groups = profile === "full" ? NODE_TEST_GROUP_ORDER : [profile];
  const groupedTests = groups.flatMap((group) => NODE_TEST_GROUPS[group]);
  return profile === "full"
    ? [...groupedTests, ...EXPLICIT_ONLY_NODE_TESTS]
    : groupedTests;
}

export function validateNodeTestCatalog(groups = NODE_TEST_GROUPS) {
  const invalid = [];
  const unsorted = [];
  const duplicates = [];
  const seen = new Set();

  for (const group of NODE_TEST_GROUP_ORDER) {
    const tests = groups[group];
    if (!Array.isArray(tests) || tests.length === 0) {
      invalid.push(`${group}:empty`);
      continue;
    }
    if (
      tests.some(
        (file) =>
          typeof file !== "string" ||
          !file.startsWith("scripts/") ||
          file.includes("..") ||
          !NODE_TEST_SUFFIXES.some((suffix) => file.endsWith(suffix)),
      )
    ) {
      invalid.push(`${group}:path`);
    }
    if (
      tests.some(
        (file, index) => index > 0 && tests[index - 1].localeCompare(file) >= 0,
      )
    ) {
      unsorted.push(group);
    }
    for (const file of tests) {
      if (seen.has(file)) duplicates.push(file);
      seen.add(file);
    }
  }

  return {
    ok:
      invalid.length === 0 && unsorted.length === 0 && duplicates.length === 0,
    invalid,
    unsorted,
    duplicates: [...new Set(duplicates)].sort(),
    tests: [...seen].sort(),
  };
}

export async function resolveNodeTests({
  profile = "full",
  rootDir = DEFAULT_TEST_ROOT,
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  if (resolvedRoot !== DEFAULT_TEST_ROOT) {
    if (profile !== "full") {
      throw new Error(
        "--profile is only supported for the repository scripts root",
      );
    }
    return discoverNodeTests(resolvedRoot);
  }

  const validation = validateNodeTestCatalog();
  if (!validation.ok) {
    throw new Error(
      `invalid Node test catalog: invalid=${validation.invalid.join(",") || "none"} unsorted=${validation.unsorted.join(",") || "none"} duplicates=${validation.duplicates.join(",") || "none"}`,
    );
  }
  const explicitOnly = new Set(EXPLICIT_ONLY_NODE_TESTS);
  const discovered = (await discoverNodeTests(DEFAULT_TEST_ROOT))
    .map((file) =>
      path.relative(DEFAULT_REPO_ROOT, file).replaceAll(path.sep, "/"),
    )
    .filter((file) => !explicitOnly.has(file));
  const cataloged = [...validation.tests].sort();
  const discoveredSet = new Set(discovered);
  const catalogedSet = new Set(cataloged);
  const uncataloged = discovered.filter((file) => !catalogedSet.has(file));
  const undiscovered = cataloged.filter((file) => !discoveredSet.has(file));
  if (uncataloged.length > 0 || undiscovered.length > 0) {
    throw new Error(
      `Node test catalog is incomplete: uncataloged=${uncataloged.join(",") || "none"} undiscovered=${undiscovered.join(",") || "none"}`,
    );
  }
  const tests = catalogNodeTests(profile)
    .filter((file) => !explicitOnly.has(file))
    .map((file) => path.resolve(DEFAULT_REPO_ROOT, file));
  const missing = [];
  for (const file of tests) {
    try {
      const stat = await lstat(file);
      if (!stat.isFile()) missing.push(file);
    } catch {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `cataloged Node tests are missing: ${missing
        .map((file) => path.relative(DEFAULT_REPO_ROOT, file))
        .join(", ")}`,
    );
  }
  return tests;
}

export function parseArgs(argv) {
  const options = {
    list: false,
    profile: "full",
    rootDir: DEFAULT_TEST_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") {
      options.list = true;
      continue;
    }
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--root requires a directory");
      }
      options.rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--profile requires a value");
      }
      if (!NODE_TEST_PROFILES.includes(value)) {
        throw new Error(
          `unknown profile: ${value}; expected ${NODE_TEST_PROFILES.join("|")}`,
        );
      }
      options.profile = value;
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }

  return options;
}

export function classifyNodeTestResult(result) {
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    return { exitCode: result.status ?? 1, summary: null };
  }
  const summary = verifyNodeTestSummary(
    `${result.stdout || ""}\n${result.stderr || ""}`,
  );
  return { exitCode: summary.ok ? 0 : 1, summary };
}

export function buildNodeTestArgs(tests) {
  return ["--test", "--test-reporter=tap", "--test-concurrency=1", ...tests];
}

function printHelp() {
  console.log(`Repository scripts Node test runner

Usage:
  node scripts/qa/run-node-tests.mjs [--profile fast|database|browser|release|full] [--list]

Options:
  --profile <name>  Run one explicit group; full runs every group once.
  --list            List selected tests without running them.
  --root <dir>      Override the discovery root (used by self-tests).
  -h, --help        Show this help.

The repository scripts root uses scripts/qa/node-test-groups.mjs. Every test
present in the current tree must be assigned to exactly one group. A custom --root keeps recursive
discovery for isolated runner self-tests. No Git metadata is required to run.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const tests = await resolveNodeTests(options);
  if (tests.length === 0) {
    throw new Error(`no Node tests found under ${options.rootDir}`);
  }

  const displayRoot = path.resolve(options.rootDir, "..");
  const displayPaths = tests.map((file) => path.relative(displayRoot, file));
  if (options.list) {
    for (const file of displayPaths) {
      console.log(file);
    }
    console.log(
      `[qa:node-tests] profile=${options.profile} selected=${tests.length}`,
    );
    return;
  }

  console.log(
    `[qa:node-tests] profile=${options.profile} running=${tests.length}`,
  );
  const result = spawnSync(process.execPath, buildNodeTestArgs(tests), {
    cwd: path.resolve(options.rootDir, ".."),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  const outcome = classifyNodeTestResult(result);
  if (!outcome.summary?.ok) {
    console.error(
      `[qa:node-tests] status=incomplete tests=${outcome.summary?.tests ?? "missing"} pass=${outcome.summary?.pass ?? "missing"} fail=${outcome.summary?.fail ?? "missing"} skipped=${outcome.summary?.skipped ?? "missing"}`,
    );
  }
  process.exitCode = outcome.exitCode;
}

const entryPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === entryPath) {
  main().catch((error) => {
    console.error(`[qa:node-tests] ${error.message}`);
    process.exitCode = 1;
  });
}
