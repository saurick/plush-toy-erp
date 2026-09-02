import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  CUSTOMER_WEB_OVERLAY_ARCHIVE_INPUTS,
  REQUIRED_ARCHIVE_PATHS,
  parseCliArgs,
  resolveProjectPnpm,
  runCommand,
  runSourceArchiveReleaseCheck,
  summarizeBuildxRawJson,
} from "./source-archive-release-check.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const fixtureSourcePaths = new Set([
  ...CUSTOMER_WEB_OVERLAY_ARCHIVE_INPUTS,
  "scripts/lib/pnpm.sh",
]);

function runGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function writeFixtureFile(root, relativePath, content = "fixture\n") {
  const targetPath = path.join(root, relativePath);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content);
}

function removeFixtureRepo(root) {
  rmSync(root, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
}

function createFixtureRepo({
  exportIgnore = true,
  includePrivateSources = false,
} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "source-archive-check-"));
  for (const relativePath of REQUIRED_ARCHIVE_PATHS) {
    if (relativePath === ".gitattributes" || relativePath === ".dockerignore") {
      continue;
    }
    if (fixtureSourcePaths.has(relativePath)) {
      const targetPath = path.join(root, relativePath);
      mkdirSync(path.dirname(targetPath), { recursive: true });
      copyFileSync(path.join(repoRoot, relativePath), targetPath);
      continue;
    }
    writeFixtureFile(root, relativePath);
  }

  writeFixtureFile(
    root,
    "web/package.json",
    `${JSON.stringify(
      {
        engines: { node: process.versions.node },
        packageManager: "pnpm@10.13.1",
      },
      null,
      2,
    )}\n`,
  );

  writeFixtureFile(
    root,
    ".gitattributes",
    exportIgnore
      ? "docs/customers/** export-ignore\nconfig/customers/*/assets/** export-ignore\n"
      : "",
  );
  writeFixtureFile(
    root,
    ".dockerignore",
    "docs\ndeployments\nconfig/customers/**/assets\n",
  );
  writeFixtureFile(
    root,
    "config/customers/yoyoosun/customer-config.example.js",
    'window.__CONFIG__ = { customerKey: "yoyoosun" };\n',
  );
  writeFixtureFile(
    root,
    "config/customers/yoyoosun/public-assets/favicon-yoyoosun.svg",
    "<svg />\n",
  );
  writeFixtureFile(
    root,
    "docs/customers/yoyoosun/README.md",
    "# Customer docs\n",
  );
  writeFixtureFile(root, "README.md", "[Guide](docs/product/guide.md)\n");
  writeFixtureFile(root, "docs/product/guide.md", "# Guide\n");
  if (includePrivateSources) {
    writeFixtureFile(
      root,
      "config/customers/yoyoosun/private-evidence/customer.xlsx",
      "private\n",
    );
    writeFixtureFile(
      root,
      "docs/customers/yoyoosun/raw-source-files/customer.xlsx",
      "raw\n",
    );
    writeFixtureFile(
      root,
      "docs/customers/yoyoosun/manifest/private-data.json",
      "{}\n",
    );
    writeFixtureFile(
      root,
      "deployments/yoyoosun/private-evidence/customer.xlsx",
      "private\n",
    );
  }
  writeFixtureFile(
    root,
    "scripts/qa/secrets.sh",
    "#!/usr/bin/env bash\nset -euo pipefail\n",
  );

  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.name", "Archive Test"]);
  runGit(root, ["config", "user.email", "archive-test@example.invalid"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-qm", "fixture"]);
  return root;
}

test("parseCliArgs keeps plan light and release modes explicit", () => {
  assert.deepEqual(parseCliArgs([]), {
    customer: "yoyoosun",
    ref: "HEAD",
    mode: "plan",
    docker: false,
    json: false,
    help: false,
  });
  assert.equal(parseCliArgs(["--light"]).mode, "light");
  assert.deepEqual(
    parseCliArgs([
      "--execute",
      "--docker",
      "--ref",
      "main",
      "--version",
      "release-20260810",
    ]),
    {
      customer: "yoyoosun",
      ref: "main",
      version: "release-20260810",
      mode: "release",
      docker: true,
      json: false,
      help: false,
    },
  );
  assert.throws(() => parseCliArgs(["--docker"]), /requires --execute/);
  assert.throws(
    () => parseCliArgs(["--light", "--execute"]),
    /cannot be combined/,
  );
});

test("required archive inputs cover the customer overlay static import closure", () => {
  assert.deepEqual(CUSTOMER_WEB_OVERLAY_ARCHIVE_INPUTS, [
    "scripts/build/apply-customer-web-config.mjs",
    "config/customers/index.mjs",
    "config/customers/demo/customerPackage.mjs",
    "config/customers/reference-customer/customerPackage.mjs",
    "config/customers/yoyoosun/customerPackage.mjs",
    "config/customers/yoyoosun/releasePackage.mjs",
    "config/customers/yoyoosun/roleFlowMatrix.mjs",
  ]);
  for (const relativePath of CUSTOMER_WEB_OVERLAY_ARCHIVE_INPUTS) {
    assert(REQUIRED_ARCHIVE_PATHS.includes(relativePath), relativePath);
  }
  assert(REQUIRED_ARCHIVE_PATHS.includes("scripts/lib/pnpm.sh"));
});

test("runCommand reports bounded sanitized stderr on failure", () => {
  assert.throws(
    () =>
      runCommand({
        command: process.execPath,
        args: [
          "-e",
          'process.stderr.write("\\u001b[31mBEGIN\\u0000" + "x".repeat(8000) + "TAIL"); process.exit(7)',
        ],
        cwd: repoRoot,
        label: "fixture command",
      }),
    (error) => {
      assert.match(error.message, /fixture command failed with exit 7/u);
      assert.match(error.message, /stderr:\nBEGIN�/u);
      assert.match(error.message, /\[stderr truncated\]/u);
      assert.match(error.message, /TAIL$/u);
      assert(!error.message.includes("\u001b"));
      assert(error.message.length < 5000);
      return true;
    },
  );
});

test("Buildx raw JSON summary counts completed build vertices and cache hits once", () => {
  const output = [
    JSON.stringify({
      vertexes: [
        {
          digest: "sha256:load",
          name: "[release-web internal] load build definition from Dockerfile",
          completed: "2026-08-08T01:00:00Z",
          cached: true,
        },
      ],
    }),
    JSON.stringify({
      vertexes: [
        {
          digest: "sha256:web-deps",
          name: "[release-web web-builder 2/6] RUN pnpm install",
          started: "2026-08-08T01:00:00Z",
        },
      ],
    }),
    JSON.stringify({
      vertexes: [
        {
          digest: "sha256:web-deps",
          name: "[release-web web-builder 2/6] RUN pnpm install",
          completed: "2026-08-08T01:00:01Z",
          cached: true,
        },
      ],
    }),
    JSON.stringify({
      statuses: [
        {
          id: "compiling",
          vertex: "sha256:web-deps",
          current: 100,
        },
      ],
    }),
    JSON.stringify({
      vertexes: [
        {
          digest: "sha256:server-build",
          name: "[release-server server-builder 8/8] RUN go build",
          completed: "2026-08-08T01:00:02Z",
          cached: false,
        },
      ],
    }),
    "not-json",
  ].join("\n");
  assert.deepEqual(summarizeBuildxRawJson(output), {
    completedVertexCount: 2,
    cacheHitCount: 1,
    cacheMissCount: 1,
    cacheHitRateBasisPoints: 5_000,
  });
  assert.deepEqual(
    summarizeBuildxRawJson(
      JSON.stringify({
        id: "legacy-direct-entry",
        name: "[release-web web-builder 2/6] RUN pnpm install",
        completed: "2026-08-08T01:00:01Z",
        cached: true,
      }),
    ),
    {
      completedVertexCount: 1,
      cacheHitCount: 1,
      cacheMissCount: 0,
      cacheHitRateBasisPoints: 10_000,
    },
  );
});

test("plan reports a dirty worktree without claiming formal evidence", async () => {
  const root = createFixtureRepo();
  try {
    writeFixtureFile(root, "untracked.txt", "dirty\n");
    const report = await runSourceArchiveReleaseCheck(
      { mode: "plan" },
      { repoRoot: root },
    );
    assert.equal(report.source, "git archive committed tree");
    assert.equal(report.worktreeClean, false);
    assert.equal(report.dirtyEntryCount, 1);
    assert.equal(report.formalEvidenceEligible, false);
    assert(report.notProven.includes("current dirty worktree contents"));
  } finally {
    removeFixtureRepo(root);
  }
});

test("light check extracts the committed tree and excludes private customer sources", async () => {
  const root = createFixtureRepo();
  try {
    const report = await runSourceArchiveReleaseCheck(
      { mode: "light" },
      { repoRoot: root },
    );
    assert.equal(report.lightCheckPassed, true);
    assert.equal(report.inventory.missingPaths.length, 0);
    assert.equal(report.inventory.forbiddenPaths.length, 0);
    assert.equal(report.inventory.symlinks.length, 0);
    assert.equal(report.inventory.brokenMarkdownLinks.length, 0);
    assert(report.inventory.markdownFileCount >= 2);
    assert.match(report.archiveSha256, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(report.formalEvidenceEligible, false);
    assert.equal(report.repositoryBoundary.passed, true);
    assert.match(report.overlay.configPath, /customer-config\.js$/u);
  } finally {
    removeFixtureRepo(root);
  }
});

test("light check rejects archive Markdown links to export-ignored customer docs", async () => {
  const root = createFixtureRepo();
  try {
    writeFixtureFile(
      root,
      "README.md",
      "[Customer delivery](docs/customers/yoyoosun/README.md)\n",
    );
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-qm", "link ignored customer docs"]);

    await assert.rejects(
      () => runSourceArchiveReleaseCheck({ mode: "light" }, { repoRoot: root }),
      (error) => {
        assert.match(error.message, /inventory check failed/u);
        assert.deepEqual(error.details.brokenMarkdownLinks, [
          "README.md -> docs/customers/yoyoosun/README.md",
        ]);
        return true;
      },
    );
  } finally {
    removeFixtureRepo(root);
  }
});

test("export-ignore cannot hide a committed Product Core customer-source boundary violation", async () => {
  const root = createFixtureRepo({ includePrivateSources: true });
  try {
    await assert.rejects(
      () => runSourceArchiveReleaseCheck({ mode: "light" }, { repoRoot: root }),
      (error) => {
        assert.match(
          error.message,
          /committed Product Core customer-source boundary failed/,
        );
        assert.deepEqual(error.details.repositoryBoundary.counts, {
          rawSources: 1,
          privateManifests: 1,
          customerDocumentBinaries: 0,
          privateConfigAssets: 1,
          deploymentSourceBinaries: 1,
        });
        return true;
      },
    );
  } finally {
    removeFixtureRepo(root);
  }
});

test("light check rejects customer documentation that leaks into the archive", async () => {
  const root = createFixtureRepo({ exportIgnore: false });
  try {
    await assert.rejects(
      () => runSourceArchiveReleaseCheck({ mode: "light" }, { repoRoot: root }),
      (error) => {
        assert.match(error.message, /inventory check failed/);
        assert(
          error.details.forbiddenPaths.some((item) =>
            item.includes("docs/customers/yoyoosun/README.md"),
          ),
        );
        return true;
      },
    );
  } finally {
    removeFixtureRepo(root);
  }
});

test("light check rejects committed delete-me and GitHub write-test markers", async () => {
  const root = createFixtureRepo();
  try {
    writeFixtureFile(root, "notes/fixture_DELETE_ME.md", "temporary\n");
    writeFixtureFile(root, "CHATGPT_GITHUB_WRITE_TEST.md", "temporary\n");
    runGit(root, ["add", "."]);
    runGit(root, ["commit", "-qm", "add temporary markers"]);
    await assert.rejects(
      () => runSourceArchiveReleaseCheck({ mode: "light" }, { repoRoot: root }),
      (error) => {
        assert.match(error.message, /inventory check failed/u);
        assert.deepEqual(error.details.forbiddenPaths, [
          "CHATGPT_GITHUB_WRITE_TEST.md",
          "notes/fixture_DELETE_ME.md",
        ]);
        return true;
      },
    );
  } finally {
    removeFixtureRepo(root);
  }
});

test("light check rejects symbolic links in the committed archive", async () => {
  const root = createFixtureRepo();
  try {
    symlinkSync("/etc/passwd", path.join(root, "linked-secret"));
    runGit(root, ["add", "linked-secret"]);
    runGit(root, ["commit", "-qm", "add symlink"]);
    await assert.rejects(
      () => runSourceArchiveReleaseCheck({ mode: "light" }, { repoRoot: root }),
      (error) => {
        assert.deepEqual(error.details.symlinks, ["linked-secret"]);
        return true;
      },
    );
  } finally {
    removeFixtureRepo(root);
  }
});

test("release mode fails closed on a dirty worktree", async () => {
  const root = createFixtureRepo();
  try {
    writeFixtureFile(root, "untracked.txt", "dirty\n");
    await assert.rejects(
      () =>
        runSourceArchiveReleaseCheck({ mode: "release" }, { repoRoot: root }),
      /requires a clean worktree/,
    );
  } finally {
    removeFixtureRepo(root);
  }
});

test("release mode only accepts the current HEAD commit", async () => {
  const root = createFixtureRepo();
  try {
    const oldCommit = runGit(root, ["rev-parse", "HEAD"]);
    writeFixtureFile(root, "new-commit.txt", "new head\n");
    runGit(root, ["add", "new-commit.txt"]);
    runGit(root, ["commit", "-qm", "new head"]);

    await assert.rejects(
      () =>
        runSourceArchiveReleaseCheck(
          { mode: "release", ref: oldCommit },
          { repoRoot: root },
        ),
      /requires --ref to resolve to the current HEAD/,
    );
  } finally {
    removeFixtureRepo(root);
  }
});

test("release mode resolves pnpm through the repository-locked toolchain helper", () => {
  const root = createFixtureRepo();
  try {
    const fakePnpm = path.join(root, "project-pnpm");
    writeFileSync(fakePnpm, "#!/usr/bin/env bash\nprintf '10.13.1\\n'\n");
    chmodSync(fakePnpm, 0o755);
    const resolved = resolveProjectPnpm({
      archiveRoot: root,
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(
          path.delimiter,
        ),
        PNPM_BIN: fakePnpm,
      },
    });
    assert.equal(resolved, fakePnpm);

    writeFixtureFile(
      root,
      "web/package.json",
      `${JSON.stringify({
        engines: { node: process.versions.node },
        packageManager: "pnpm@99.0.0",
      })}\n`,
    );
    assert.throws(
      () =>
        resolveProjectPnpm({
          archiveRoot: root,
          env: {
            ...process.env,
            PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(
              path.delimiter,
            ),
            PNPM_BIN: fakePnpm,
          },
        }),
      /未找到匹配 web\/package\.json 的 pnpm 99\.0\.0/u,
    );
  } finally {
    removeFixtureRepo(root);
  }
});

test("Docker release mode compiles Web and Go once through one shared graph", async () => {
  const root = createFixtureRepo();
  const labels = [];
  const commandSpecs = [];
  let bakeDefinition;
  try {
    const report = await runSourceArchiveReleaseCheck(
      { mode: "release", docker: true },
      {
        repoRoot: root,
        resolveProjectPnpm: () => {
          throw new Error("Docker release must not resolve host pnpm");
        },
        runBuildCommand: async (spec) => {
          labels.push(spec.label);
          commandSpecs.push(spec);
          if (
            spec.label === "build Web and Server runtime targets in parallel"
          ) {
            const file = spec.args[spec.args.indexOf("--file") + 1];
            bakeDefinition = JSON.parse(readFileSync(file, "utf8"));
            return {
              status: 0,
              stdout: [
                JSON.stringify({
                  vertexes: [
                    {
                      digest: "sha256:web-deps",
                      name: "[release-web web-builder 2/6] RUN pnpm install",
                      completed: "2026-08-08T01:00:01Z",
                      cached: true,
                    },
                  ],
                }),
                JSON.stringify({
                  vertexes: [
                    {
                      digest: "sha256:server-build",
                      name: "[release-server server-builder 8/8] RUN go build",
                      completed: "2026-08-08T01:00:02Z",
                      cached: false,
                    },
                  ],
                }),
              ].join("\n"),
              stderr: "",
            };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
        environment: { RELEASE_BUILDKIT_CACHE_MODE: "gha" },
      },
    );
    assert.equal(report.releaseCheckPassed, true);
    assert.equal(report.formalEvidenceEligible, true);
    assert.equal(report.serverBinaryBuilt, true);
    assert.equal(report.dockerBuilt, true);
    assert.equal(report.dockerImages.length, 2);
    assert.deepEqual(report.buildReuse, {
      graph: "server/Dockerfile",
      webCompileCount: 1,
      goCompileCount: 1,
      targetsBuiltInParallel: true,
    });
    assert.deepEqual(report.buildPerformance, {
      schemaVersion: "plush.release-build-performance/v1",
      durationMs: report.buildPerformance.durationMs,
      cacheMode: "gha",
      completedVertexCount: 2,
      cacheHitCount: 1,
      cacheMissCount: 1,
      cacheHitRateBasisPoints: 5_000,
    });
    assert.deepEqual(labels, [
      "strict source archive secret scan",
      "build Web and Server runtime targets in parallel",
    ]);
    assert(!commandSpecs.some((spec) => spec.command === "go"));
    const bakeSpec = commandSpecs.find(
      (spec) =>
        spec.label === "build Web and Server runtime targets in parallel",
    );
    assert.deepEqual(bakeSpec.args.slice(0, 2), ["buildx", "bake"]);
    assert(bakeSpec.args.includes("rawjson"));
    assert(bakeSpec.args.includes("--provenance=false"));
    assert(bakeSpec.args.includes("--sbom=false"));
    assert.deepEqual(bakeDefinition.group.default.targets, [
      "release-web",
      "release-server",
    ]);
    assert.equal(bakeDefinition.target["release-web"].target, "web-runtime");
    assert.equal(
      bakeDefinition.target["release-server"].target,
      "server-runtime",
    );
    for (const target of Object.values(bakeDefinition.target)) {
      assert.deepEqual(target.platforms, ["linux/amd64"]);
      assert.equal(target.args.ERP_CUSTOMER_PACKAGE, report.customer);
      assert.equal(target.args.GIT_SHA, report.commit);
      assert.equal(target.args.RELEASE_VERSION, report.releaseVersion);
      assert.equal(target.dockerfile, "server/Dockerfile");
      assert.deepEqual(target["cache-from"], [
        `type=gha,scope=plush-release-${target.target === "web-runtime" ? "web" : "server"}-v1`,
      ]);
      assert.deepEqual(target["cache-to"], [
        `type=gha,mode=max,scope=plush-release-${target.target === "web-runtime" ? "web" : "server"}-v1`,
      ]);
    }
  } finally {
    removeFixtureRepo(root);
  }
});

test("source archive release check help is runnable", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(import.meta.dirname, "source-archive-release-check.mjs"),
      "--help",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /--execute/);
  assert.match(result.stdout, /dirty worktree/);
});
