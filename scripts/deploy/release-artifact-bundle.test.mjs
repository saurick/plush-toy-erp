import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertReleaseArtifactManifest,
  buildCustomerConfigEvidence,
  buildDependencySbom,
  buildMigrationEvidence,
  parseReleaseArtifactArgs,
  resolveReleaseOutput,
} from "./release-artifact-bundle.mjs";

const commit = "a".repeat(40);
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

function fixtureCommand(files, paths = []) {
  return ({ args }) => {
    if (args[0] === "ls-tree") {
      return `${paths.join("\n")}\n`;
    }
    if (args[0] === "show") {
      const key = String(args[1]).slice(commit.length + 1);
      if (!(key in files)) throw new Error(`missing fixture ${key}`);
      return files[key];
    }
    throw new Error(`unexpected command ${args.join(" ")}`);
  };
}

test("release artifact CLI requires explicit execution and validates values", () => {
  assert.deepEqual(
    parseReleaseArtifactArgs([
      "--execute",
      "--ref",
      commit,
      "--customer",
      "yoyoosun",
      "--out",
      "output/releases/example",
      "--json",
    ]),
    {
      execute: true,
      ref: commit,
      customer: "yoyoosun",
      out: "output/releases/example",
      json: true,
      help: false,
    },
  );
  assert.throws(() => parseReleaseArtifactArgs(["--out"]), /missing value/u);
});

test("release artifact output is confined to output and never reuses a symlink", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "release-output-"));
  try {
    mkdirSync(path.join(root, "output"), { recursive: true });
    assert.equal(
      resolveReleaseOutput(root, "output/releases/a", commit),
      path.join(realpathSync(root), "output/releases/a"),
    );
    assert.throws(
      () => resolveReleaseOutput(root, "../outside", commit),
      /inside repository output/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release artifact derives migration sequence and customer source identity from committed files", () => {
  const migrationPaths = [
    "server/internal/data/model/migrate/20260101010101_first.sql",
    "server/internal/data/model/migrate/20260202020202_second.sql",
  ];
  const files = {
    [migrationPaths[0]]: "CREATE TABLE one(id int);\n",
    [migrationPaths[1]]: "CREATE TABLE two(id int);\n",
    "config/customers/yoyoosun/customerPackage.mjs":
      'export const value = { customerKey: "yoyoosun", packageKey: "yoyoosun-customer-package-v9", status: "draft", runtimeEnabled: false };\n',
    "config/customers/yoyoosun/roleFlowMatrix.mjs":
      "export const roles = [];\n",
  };
  const runCommand = fixtureCommand(files, migrationPaths);
  const migration = buildMigrationEvidence({
    repoRoot: "/fixture",
    commit,
    runCommand,
  });
  assert.equal(migration.latest, "20260202020202");
  assert.equal(migration.fileCount, 2);
  assert.match(migration.sequenceSha256, /^[a-f0-9]{64}$/u);
  const config = buildCustomerConfigEvidence({
    repoRoot: "/fixture",
    commit,
    runCommand,
  });
  assert.equal(config.packageKey, "yoyoosun-customer-package-v9");
  assert.equal(
    config.expectedRuntimeRevision,
    "yoyoosun-customer-package-v9.runtime-manifest-v1",
  );
  assert.equal(config.sourceRuntimeEnabled, false);
  assert.match(config.sourceSha256, /^[a-f0-9]{64}$/u);
});

test("release artifact builds a non-empty CycloneDX dependency inventory", () => {
  const files = {
    "server/go.sum":
      "example.com/module v1.2.3 h1:one\nexample.com/module v1.2.3/go.mod h1:two\n",
    "web/pnpm-lock.yaml":
      "lockfileVersion: '9.0'\npackages:\n\n  '@scope/pkg@2.0.0':\n    resolution: {}\n\n  plain@1.0.0:\n    resolution: {}\n\nsnapshots:\n",
    "server/Dockerfile":
      "ARG GO_BUILDER_IMAGE=golang:1.26.5\nARG RUNTIME_BASE_IMAGE=debian:bookworm-slim\n",
    "web/Dockerfile":
      "ARG NODE_BUILDER_IMAGE=node:24.14.0\nARG RUNTIME_BASE_IMAGE=node:24.14.0-slim\n",
  };
  const sbom = buildDependencySbom({
    repoRoot: "/fixture",
    commit,
    customer: "yoyoosun",
    migrationLatest: "20260202020202",
    createdAt: "2026-07-28T00:00:00.000Z",
    runCommand: fixtureCommand(files),
  });
  assert.equal(sbom.bomFormat, "CycloneDX");
  assert.equal(sbom.specVersion, "1.5");
  assert(sbom.components.length >= 6);
  assert(
    sbom.components.some(
      (item) => item.name === "@scope/pkg" && item.version === "2.0.0",
    ),
  );
  assert(sbom.components.some((item) => item.name === "example.com/module"));
});

test("Web release image consumes the committed generated projection without a Go toolchain", () => {
  const dockerfile = readFileSync(
    path.join(repoRoot, "web", "Dockerfile"),
    "utf8",
  );
  const packageJson = JSON.parse(
    readFileSync(path.join(repoRoot, "web", "package.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts["build:committed"],
    "vite build --config vite.config.mjs",
  );
  assert.match(dockerfile, /RUN pnpm build:committed/u);
  assert.doesNotMatch(dockerfile, /pnpm build:all|gen-error-codes/u);
  assert.doesNotMatch(dockerfile, /COPY server\/internal\/errcode/u);
});

test("release artifact manifest rejects mismatched or incomplete image evidence", () => {
  const image = (kind) => ({
    kind,
    ref: `example/${kind}:${commit}`,
    contentId: `sha256:${"b".repeat(64)}`,
    platform: "linux/amd64",
    gitSha: commit,
    archive: {
      file: `${kind}.tar`,
      sha256: "c".repeat(64),
      sizeBytes: 1,
    },
    metadataSecretScan: { passed: true },
  });
  const manifest = {
    schemaVersion: "plush-release-artifact/v1",
    passed: true,
    git: {
      commit,
      head: commit,
      worktreeClean: true,
    },
    sourceArchive: {
      secretScan: "passed",
      sha256: "d".repeat(64),
    },
    migration: {
      latest: "20260202020202",
      sequenceSha256: "e".repeat(64),
    },
    customerConfig: {
      sourceSha256: "f".repeat(64),
    },
    sbom: {
      sha256: "1".repeat(64),
    },
    images: [image("server"), image("web")],
  };
  assert.equal(assertReleaseArtifactManifest(manifest), manifest);
  assert.throws(
    () =>
      assertReleaseArtifactManifest({
        ...manifest,
        images: [image("server"), { ...image("web"), gitSha: "0".repeat(40) }],
      }),
    /image entry is invalid/u,
  );
});

test("release artifact help is runnable without building", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, "release-artifact-bundle.mjs"), "--help"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /linux\/amd64/u);
  assert.match(result.stdout, /CycloneDX/u);
});
