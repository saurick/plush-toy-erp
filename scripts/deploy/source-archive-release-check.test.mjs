import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
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
  assert.deepEqual(parseCliArgs(["--execute", "--docker", "--ref", "main"]), {
    customer: "yoyoosun",
    ref: "main",
    mode: "release",
    docker: true,
    json: false,
    help: false,
  });
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
    assert.match(report.archiveSha256, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(report.formalEvidenceEligible, false);
    assert.equal(report.repositoryBoundary.passed, true);
    assert.match(report.overlay.configPath, /customer-config\.js$/u);
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

test("release mode runs source scan Web Go overlay and optional Docker checks", async () => {
  const root = createFixtureRepo();
  const labels = [];
  const commandSpecs = [];
  try {
    const report = await runSourceArchiveReleaseCheck(
      { mode: "release", docker: true },
      {
        repoRoot: root,
        resolveProjectPnpm: () => "/fixture/project-pnpm",
        runBuildCommand: async (spec) => {
          labels.push(spec.label);
          commandSpecs.push(spec);
          if (spec.label === "build production Web assets") {
            mkdirSync(path.join(spec.cwd, "build"), { recursive: true });
          }
          if (spec.label === "build Go server binary") {
            const outIndex = spec.args.indexOf("-o") + 1;
            writeFileSync(spec.args[outIndex], "server\n");
          }
          return { status: 0 };
        },
      },
    );
    assert.equal(report.releaseCheckPassed, true);
    assert.equal(report.formalEvidenceEligible, true);
    assert.equal(report.serverBinaryBuilt, true);
    assert.equal(report.dockerBuilt, true);
    assert.equal(report.dockerImages.length, 2);
    assert.deepEqual(labels, [
      "strict source archive secret scan",
      "install locked Web dependencies",
      "build production Web assets",
      "build Go server binary",
      "build Web Docker image",
      "build server Docker image",
    ]);
    const pnpmSpecs = commandSpecs.filter((spec) =>
      [
        "install locked Web dependencies",
        "build production Web assets",
      ].includes(spec.label),
    );
    assert.equal(pnpmSpecs.length, 2);
    assert(pnpmSpecs.every((spec) => spec.command === "/fixture/project-pnpm"));
    assert(!commandSpecs.some((spec) => spec.command === "pnpm"));
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
