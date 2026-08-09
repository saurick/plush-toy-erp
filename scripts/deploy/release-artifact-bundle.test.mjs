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
  buildReleaseArtifact,
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
      "ARG NODE_BUILDER_IMAGE=node:24.14.0\nARG GO_BUILDER_IMAGE=golang:1.26.5\nARG RUNTIME_BASE_IMAGE=debian:bookworm-slim\n",
    "web/Dockerfile": "ARG UNUSED_DEVELOPMENT_IMAGE=example.invalid/unused:1\n",
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
  assert.equal(
    sbom.components.some((item) => item.name === "example.invalid/unused:1"),
    false,
  );
});

test("release image builders consume the committed generated projection without a Go toolchain", () => {
  const webDockerfile = readFileSync(
    path.join(repoRoot, "web", "Dockerfile"),
    "utf8",
  );
  const serverDockerfile = readFileSync(
    path.join(repoRoot, "server", "Dockerfile"),
    "utf8",
  );
  const packageJson = JSON.parse(
    readFileSync(path.join(repoRoot, "web", "package.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts["build:committed"],
    "vite build --config vite.config.mjs",
  );
  assert.match(webDockerfile, /RUN pnpm build:committed/u);
  assert.match(serverDockerfile, /RUN pnpm run build:committed/u);
  assert.match(serverDockerfile, /COPY web\/\*\.mjs \.\//u);
  assert.doesNotMatch(serverDockerfile, /COPY web\/dev-server/u);
  assert.doesNotMatch(serverDockerfile, /COPY scripts \/scripts/u);
  assert.match(
    serverDockerfile,
    /COPY scripts\/dev-ports\.mjs scripts\/local-runtime-preflight-core\.mjs \/scripts\//u,
  );
  assert.match(
    serverDockerfile,
    /COPY scripts\/build\/apply-customer-web-config\.mjs \/scripts\/build\/apply-customer-web-config\.mjs/u,
  );
  for (const dockerfile of [webDockerfile, serverDockerfile]) {
    assert.doesNotMatch(
      dockerfile,
      /pnpm build:all|pnpm run build(?:\s|&&)|gen-error-codes/u,
    );
    assert.doesNotMatch(dockerfile, /COPY server\/internal\/errcode/u);
  }
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
    performance: {
      build: {
        schemaVersion: "plush.release-build-performance/v1",
        durationMs: 123_000,
        cacheMode: "gha",
        completedVertexCount: 10,
        cacheHitCount: 8,
        cacheMissCount: 2,
        cacheHitRateBasisPoints: 8_000,
      },
    },
    images: [image("server"), image("web")],
  };
  assert.equal(assertReleaseArtifactManifest(manifest), manifest);
  assert.equal(
    assertReleaseArtifactManifest({
      ...manifest,
      images: manifest.images.map((entry) => ({
        ...entry,
        archive: {
          ...entry.archive,
          compression: "zstd",
          compressionLevel: 3,
          compressionDurationMs: 12,
          uncompressedSizeBytes: 2,
        },
      })),
    }).images[0].archive.compression,
    "zstd",
  );
  assert.throws(
    () =>
      assertReleaseArtifactManifest({
        ...manifest,
        images: [image("server"), { ...image("web"), gitSha: "0".repeat(40) }],
      }),
    /image entry is invalid/u,
  );
  assert.throws(
    () =>
      assertReleaseArtifactManifest({
        ...manifest,
        performance: {
          build: {
            ...manifest.performance.build,
            cacheHitCount: 9,
          },
        },
      }),
    /manifest is invalid/u,
  );
  assert.throws(
    () =>
      assertReleaseArtifactManifest({
        ...manifest,
        images: [
          {
            ...image("server"),
            archive: {
              ...image("server").archive,
              compression: "zstd",
              compressionLevel: 9,
              compressionDurationMs: 1,
              uncompressedSizeBytes: 1,
            },
          },
          image("web"),
        ],
      }),
    /image entry is invalid/u,
  );
});

test("release artifact builder normalizes the source hash and writes complete checksums", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "release-bundle-"));
  const migrationPath =
    "server/internal/data/model/migrate/20260202020202_release.sql";
  const files = {
    [migrationPath]: "CREATE TABLE release_fixture(id int);\n",
    "config/customers/yoyoosun/customerPackage.mjs":
      'export const value = { packageKey: "yoyoosun-customer-package-v9", status: "active", runtimeEnabled: true };\n',
    "config/customers/yoyoosun/roleFlowMatrix.mjs":
      "export const roles = [];\n",
    "server/go.sum": "example.com/module v1.2.3 h1:one\n",
    "server/go.mod": "module example.com/release\n\ntoolchain go1.26.5\n",
    "web/pnpm-lock.yaml":
      "lockfileVersion: '9.0'\npackages:\n\n  plain@1.0.0:\n    resolution: {}\n\nsnapshots:\n",
    "server/Dockerfile":
      "ARG GO_BUILDER_IMAGE=golang:1.26.5\nARG RUNTIME_BASE_IMAGE=debian:bookworm-slim\n",
    "web/Dockerfile":
      "ARG NODE_BUILDER_IMAGE=node:24.14.0\nARG RUNTIME_BASE_IMAGE=node:24.14.0-slim\n",
    "web/package.json":
      '{"packageManager":"pnpm@10.13.1","name":"fixture","version":"1.0.0"}\n',
  };
  const sourceImages = {
    server: `plush-source-archive-server:${commit.slice(0, 12)}`,
    web: `plush-source-archive-web:${commit.slice(0, 12)}`,
  };
  const runCommand = ({ command, args }) => {
    if (command === "git") {
      if (args[0] === "ls-tree") return `${migrationPath}\n`;
      if (args[0] === "show") {
        const key = String(args[1]).slice(commit.length + 1);
        if (!(key in files)) throw new Error(`missing fixture ${key}`);
        return files[key];
      }
    }
    if (command === "docker") {
      if (args[0] === "image" && args[1] === "tag") return "";
      if (args[0] === "image" && args[1] === "inspect") {
        const kind = String(args[2]).includes("-server:") ? "server" : "web";
        const idDigit = kind === "server" ? "2" : "3";
        return JSON.stringify([
          {
            Id: `sha256:${idDigit.repeat(64)}`,
            Os: "linux",
            Architecture: "amd64",
            Size: 128,
            Config: { Env: [`GIT_SHA=${commit}`], Labels: {} },
          },
        ]);
      }
      if (args[0] === "image" && args[1] === "save") {
        const outputIndex = args.indexOf("--output");
        const target = args[outputIndex + 1];
        const kind = String(args.at(-1)).includes("-server:")
          ? "server"
          : "web";
        writeFileSync(target, `${kind}-archive\n`);
        return "";
      }
      if (args[0] === "version") return "27.5.1\n";
      if (args[0] === "buildx") return "github.com/docker/buildx v0.30.1\n";
    }
    if (command === "zstd") {
      if (args[0] === "--version") return "*** Zstandard CLI (64-bit) v1.5.7\n";
      const outputIndex = args.indexOf("--output");
      const target = args[outputIndex + 1];
      const source = args.at(-1);
      writeFileSync(target, `zstd:${readFileSync(source, "utf8")}`);
      return "";
    }
    throw new Error(`unexpected command ${command} ${args.join(" ")}`);
  };

  try {
    const report = await buildReleaseArtifact(
      {
        ref: "HEAD",
        customer: "yoyoosun",
        out: "output/releases/fixture",
      },
      {
        repoRoot: root,
        runSourceArchiveReleaseCheck: async () => ({
          commit,
          head: commit,
          ref: "HEAD",
          refIsHead: true,
          worktreeClean: true,
          archiveSha256: `sha256:${"9".repeat(64)}`,
          inventory: { fileCount: 9 },
          repositoryBoundary: { passed: true },
          releaseCheckPassed: true,
          formalEvidenceEligible: true,
          dockerBuilt: true,
          dockerImages: [sourceImages.web, sourceImages.server],
          buildPerformance: {
            schemaVersion: "plush.release-build-performance/v1",
            durationMs: 45_000,
            cacheMode: "gha",
            completedVertexCount: 20,
            cacheHitCount: 15,
            cacheMissCount: 5,
            cacheHitRateBasisPoints: 7_500,
          },
        }),
        runCommand,
      },
    );
    const output = path.join(root, report.outputDirectory);
    const manifest = JSON.parse(
      readFileSync(path.join(output, "release-artifact.json"), "utf8"),
    );
    const checksums = readFileSync(
      path.join(output, "checksums.sha256"),
      "utf8",
    );

    assert.equal(manifest.sourceArchive.sha256, "9".repeat(64));
    assert.equal(manifest.performance.build.cacheHitRateBasisPoints, 7_500);
    assert.equal(manifest.images.length, 2);
    assert(
      manifest.images.every((image) =>
        Number.isSafeInteger(image.archive.saveDurationMs),
      ),
    );
    assert(
      manifest.images.every(
        (image) =>
          image.archive.compression === "zstd" &&
          image.archive.compressionLevel === 3 &&
          Number.isSafeInteger(image.archive.compressionDurationMs) &&
          Number.isSafeInteger(image.archive.uncompressedSizeBytes),
      ),
    );
    assert.match(manifest.toolchain.zstd, /Zstandard CLI/u);
    assert.equal(checksums.trim().split("\n").length, 4);
    assert.match(checksums, /^[a-f0-9]{64}  release-artifact\.json$/mu);
    assert.match(checksums, /^[a-f0-9]{64}  sbom\.cdx\.json$/mu);
    assert.match(checksums, /^[a-f0-9]{64}  server-image\.tar$/mu);
    assert.match(checksums, /^[a-f0-9]{64}  web-image\.tar$/mu);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
