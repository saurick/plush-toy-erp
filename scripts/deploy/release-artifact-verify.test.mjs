import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyReleaseArtifact } from "./release-artifact-verify.mjs";

const commit = "a".repeat(40);
const releaseVersion = "yoyoosun-20260810.1";

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "release-verify-"));
  const sbom = `${JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    components: [{ type: "library", name: "one", version: "1" }],
  })}\n`;
  writeFileSync(path.join(root, "sbom.cdx.json"), sbom);
  const images = ["server", "web"].map((kind) => {
    const content = `${kind}-image`;
    writeFileSync(path.join(root, `${kind}.tar`), content);
    return {
      kind,
      ref: `example/${kind}:${commit}`,
      contentId: `sha256:${kind === "server" ? "b" : "c"}`.padEnd(
        71,
        kind === "server" ? "b" : "c",
      ),
      platform: "linux/amd64",
      gitSha: commit,
      releaseVersion,
      archive: {
        file: `${kind}.tar`,
        sizeBytes: Buffer.byteLength(content),
        sha256: sha(content),
      },
      metadataSecretScan: { passed: true },
    };
  });
  const manifest = {
    schemaVersion: "plush-release-artifact/v1",
    passed: true,
    customer: "yoyoosun",
    releaseVersion,
    git: { commit, head: commit, worktreeClean: true },
    sourceArchive: {
      secretScan: "passed",
      sha256: "d".repeat(64),
    },
    migration: {
      latest: "20260202020202",
      sequenceSha256: "e".repeat(64),
    },
    customerConfig: { sourceSha256: "f".repeat(64) },
    sbom: {
      file: "sbom.cdx.json",
      specVersion: "1.5",
      componentCount: 1,
      sizeBytes: Buffer.byteLength(sbom),
      sha256: sha(sbom),
    },
    images,
  };
  const manifestPath = path.join(root, "release-artifact.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifest, manifestPath };
}

test("release artifact verifier checks SBOM and image archive checksums", () => {
  const fixture = writeFixture();
  try {
    const report = verifyReleaseArtifact(fixture.manifestPath);
    assert.equal(report.passed, true);
    assert.equal(report.commit, commit);
    assert.equal(report.checks.loadedImageIdentity, "not-executed");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("release artifact verifier fails closed on archive drift", () => {
  const fixture = writeFixture();
  try {
    writeFileSync(path.join(fixture.root, "server.tar"), "changed");
    assert.throws(
      () => verifyReleaseArtifact(fixture.manifestPath),
      /checksum or size does not match/u,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("release artifact verifier validates loaded image identity", () => {
  const fixture = writeFixture();
  try {
    const archiveConfigByKind = new Map(
      fixture.manifest.images.map((item) => {
        const archiveConfig = JSON.stringify({
          architecture: "amd64",
          kind: item.kind,
          os: "linux",
        });
        item.contentId = `sha256:${sha(archiveConfig)}`;
        return [item.kind, archiveConfig];
      }),
    );
    writeFileSync(
      fixture.manifestPath,
      `${JSON.stringify(fixture.manifest, null, 2)}\n`,
    );
    const archiveIdentityByKind = new Map(
      fixture.manifest.images.map((item) => {
        const ociManifest = JSON.stringify({
          schemaVersion: 2,
          config: { digest: item.contentId },
        });
        return [
          item.kind,
          {
            manifestDigest: `sha256:${sha(ociManifest)}`,
            ociManifest,
          },
        ];
      }),
    );
    const byRef = new Map(
      fixture.manifest.images.map((item, index) => {
        const archiveIdentity = archiveIdentityByKind.get(item.kind);
        return [
          item.ref,
          {
            Id: index === 0 ? archiveIdentity.manifestDigest : item.contentId,
            Os: "linux",
            Architecture: "amd64",
            Config: {
              Env: [`GIT_SHA=${commit}`, `RELEASE_VERSION=${releaseVersion}`],
            },
          },
        ];
      }),
    );
    const report = verifyReleaseArtifact(
      fixture.manifestPath,
      { load: true },
      {
        repoRoot: fixture.root,
        runCommand: ({ args }) => {
          if (args[0] === "-xOf") {
            const archivePath = args[1];
            const member = args[2];
            const kind = path.basename(archivePath, ".tar");
            const image = fixture.manifest.images.find(
              (item) => item.kind === kind,
            );
            const archiveIdentity = archiveIdentityByKind.get(kind);
            if (member === "manifest.json") {
              return JSON.stringify([
                {
                  Config: `blobs/sha256/${image.contentId.slice("sha256:".length)}`,
                  RepoTags: [image.ref],
                },
              ]);
            }
            if (member === "index.json") {
              return JSON.stringify({
                schemaVersion: 2,
                manifests: [{ digest: archiveIdentity.manifestDigest }],
              });
            }
            if (
              member ===
              `blobs/sha256/${image.contentId.slice("sha256:".length)}`
            ) {
              return archiveConfigByKind.get(kind);
            }
            if (
              member ===
              `blobs/sha256/${archiveIdentity.manifestDigest.slice("sha256:".length)}`
            ) {
              return archiveIdentity.ociManifest;
            }
          }
          if (args[0] === "image" && args[1] === "load") return "";
          if (args[0] === "image" && args[1] === "inspect") {
            return JSON.stringify([byRef.get(args[2])]);
          }
          throw new Error(`unexpected command ${args.join(" ")}`);
        },
      },
    );
    assert.equal(report.checks.loadedImageIdentity, "passed");
    assert.equal(report.images.length, 2);
    assert.equal(report.releaseVersion, releaseVersion);
    assert(
      report.images.every((image) => image.releaseVersion === releaseVersion),
    );
    assert.equal(
      report.images[0].loadedImageId,
      archiveIdentityByKind.get("server").manifestDigest,
    );
    assert.equal(
      report.images[1].loadedImageId,
      fixture.manifest.images.find((item) => item.kind === "web").contentId,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
