import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROFILE_REQUIRED_EXECUTABLES,
  PROFILE_REQUIRED_FILES,
} from "../qa/gate-profiles.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commit(root, message) {
  git(root, ["add", "-A"]);
  git(root, [
    "-c",
    "user.name=Push Hook Test",
    "-c",
    "user.email=push-hook@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    message,
  ]);
  return git(root, ["rev-parse", "HEAD"]);
}

function materializeFullProfile(root) {
  const executables = new Set(PROFILE_REQUIRED_EXECUTABLES.full);
  for (const file of PROFILE_REQUIRED_FILES.full) {
    const target = path.join(root, file);
    if (!existsSync(target)) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(
        target,
        file === "web/package.json"
          ? '{"scripts":{"test":"node --test"}}\n'
          : executables.has(file)
            ? "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n"
            : "fixture\n",
        "utf8",
      );
    }
    if (executables.has(file)) chmodSync(target, 0o755);
  }
}

function installPrePushFixture(root, rangesPath, fullRangesPath) {
  mkdirSync(path.join(root, "scripts/git-hooks"), { recursive: true });
  mkdirSync(path.join(root, "scripts/qa"), { recursive: true });
  copyFileSync(
    path.join(ROOT, "scripts/git-hooks/pre-push.sh"),
    path.join(root, "scripts/git-hooks/pre-push.sh"),
  );
  copyFileSync(
    path.join(ROOT, "scripts/qa/gate-profiles.mjs"),
    path.join(root, "scripts/qa/gate-profiles.mjs"),
  );
  writeFileSync(
    path.join(root, "scripts/qa/secrets.sh"),
    `#!/usr/bin/env bash\nset -euo pipefail\nrange="\${QA_BASE_RANGE:-default}"\nprintf '%s\\n' "$range" >> ${JSON.stringify(rangesPath)}\nif [[ "\${FAIL_RANGE:-}" == "$range" ]]; then exit 9; fi\n`,
    "utf8",
  );
  writeFileSync(
    path.join(root, "scripts/qa/full.sh"),
    `#!/usr/bin/env bash\nset -euo pipefail\nrange="\${QA_BASE_RANGE:-default}"\nprintf '%s\\n' "$range" >> ${JSON.stringify(fullRangesPath)}\ngit diff --name-only "$range" > ${JSON.stringify(`${fullRangesPath}.changed`)}\nSECRETS_STRICT=1 QA_BASE_RANGE="$range" bash scripts/qa/secrets.sh\n`,
    "utf8",
  );
  for (const file of [
    "scripts/git-hooks/pre-push.sh",
    "scripts/qa/secrets.sh",
    "scripts/qa/full.sh",
  ]) {
    chmodSync(path.join(root, file), 0o755);
  }
}

function hookEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const key of ["QA_BASE_RANGE", "SKIP_PRE_PUSH", "FAIL_RANGE"]) {
    if (!(key in overrides)) delete env[key];
  }
  return env;
}

test("pre-push wrapper clears repository-local Git environment before QA", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-push-wrapper-"));
  try {
    git(root, ["init", "-q"]);
    git(root, ["config", "user.name", "Sentinel Owner"]);
    git(root, ["config", "user.email", "sentinel@example.invalid"]);
    git(root, ["config", "core.bare", "false"]);

    mkdirSync(path.join(root, ".githooks"), { recursive: true });
    mkdirSync(path.join(root, "scripts/git-hooks"), { recursive: true });
    copyFileSync(
      path.join(ROOT, ".githooks/pre-push"),
      path.join(root, ".githooks/pre-push"),
    );
    writeFileSync(
      path.join(root, "scripts/git-hooks/pre-push.sh"),
      `#!/usr/bin/env bash
set -euo pipefail
if env | grep -Eq '^(GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_INDEX_FILE)='; then
  echo "repository-local Git environment leaked into QA" >&2
  exit 3
fi
mkdir fixture
git -C fixture init -q
git -C fixture config user.name "Fixture Owner"
git -C fixture config user.email "fixture@example.invalid"
git -C fixture config core.bare true
`,
      "utf8",
    );
    chmodSync(path.join(root, ".githooks/pre-push"), 0o755);
    chmodSync(path.join(root, "scripts/git-hooks/pre-push.sh"), 0o755);

    const result = spawnSync("bash", [".githooks/pre-push", "origin"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_DIR: path.join(root, ".git"),
        GIT_WORK_TREE: root,
        GIT_COMMON_DIR: path.join(root, ".git"),
        GIT_INDEX_FILE: path.join(root, ".git/index"),
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(git(root, ["config", "--local", "core.bare"]), "false");
    assert.equal(git(root, ["config", "--local", "user.name"]), "Sentinel Owner");
    assert.equal(
      git(root, ["config", "--local", "user.email"]),
      "sentinel@example.invalid",
    );
    assert.equal(git(path.join(root, "fixture"), ["config", "core.bare"]), "true");
    assert.equal(
      git(path.join(root, "fixture"), ["config", "user.name"]),
      "Fixture Owner",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-push scans the exact remote..local ref range", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-push-"));
  try {
    git(root, ["init", "-q"]);
    materializeFullProfile(root);
    const rangesPath = path.join(root, "ranges.txt");
    const fullRangesPath = path.join(root, "full-ranges.txt");
    installPrePushFixture(root, rangesPath, fullRangesPath);
    writeFileSync(path.join(root, "file.txt"), "base\n", "utf8");
    const remoteSha = commit(root, "base");
    writeFileSync(path.join(root, "file.txt"), "next\n", "utf8");
    const localSha = commit(root, "next");

    const input = `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`;
    const result = spawnSync("bash", ["scripts/git-hooks/pre-push.sh", "origin"], {
      cwd: root,
      input,
      encoding: "utf8",
      env: hookEnv(),
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(readFileSync(rangesPath, "utf8").trim().split("\n"), [
      `${remoteSha}..${localSha}`,
      `${remoteSha}..${localSha}`,
    ]);
    assert.equal(
      readFileSync(fullRangesPath, "utf8").trim(),
      `${remoteSha}..${localSha}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-push source consumes stdin instead of trusting only upstream", () => {
  const source = readFileSync(path.join(ROOT, "scripts/git-hooks/pre-push.sh"), "utf8");
  assert.match(source, /while read -r local_ref local_sha remote_ref remote_sha/u);
  assert.match(source, /QA_BASE_RANGE="\$range" SECRETS_STRICT=1/u);
});

test("a first push scans complete history despite a misleading local remote main", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-push-new-ref-"));
  try {
    git(root, ["init", "-q"]);
    materializeFullProfile(root);
    const rangesPath = path.join(root, "ranges.txt");
    const fullRangesPath = path.join(root, "full-ranges.txt");
    installPrePushFixture(root, rangesPath, fullRangesPath);
    writeFileSync(path.join(root, "file.txt"), "base\n", "utf8");
    commit(root, "base");
    git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    writeFileSync(path.join(root, "file.txt"), "secret existed\n", "utf8");
    commit(root, "add secret");
    writeFileSync(path.join(root, "file.txt"), "secret removed\n", "utf8");
    mkdirSync(path.join(root, "server/internal/data/model/schema"), { recursive: true });
    mkdirSync(path.join(root, "server/internal/data"), { recursive: true });
    writeFileSync(
      path.join(root, "server/internal/data/model/schema/new_item.go"),
      "package schema\n",
      "utf8",
    );
    writeFileSync(
      path.join(root, "server/internal/data/workflow_repo.go"),
      "package data\n",
      "utf8",
    );
    const localSha = commit(root, "remove secret");

    const zeroSha = "0".repeat(40);
    const input = `refs/heads/feature ${localSha} refs/heads/feature ${zeroSha}\n`;
    const result = spawnSync("bash", ["scripts/git-hooks/pre-push.sh", "origin"], {
      cwd: root,
      input,
      encoding: "utf8",
      env: hookEnv(),
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const emptyTree = git(root, ["hash-object", "-t", "tree", "/dev/null"]);
    const aggregateRange = `${emptyTree}..${localSha}`;
    assert.deepEqual(readFileSync(rangesPath, "utf8").trim().split("\n"), [
      localSha,
      aggregateRange,
    ]);
    assert.equal(readFileSync(fullRangesPath, "utf8").trim(), aggregateRange);
    const changed = new Set(
      readFileSync(`${fullRangesPath}.changed`, "utf8").trim().split("\n"),
    );
    assert(changed.has("file.txt"));
    assert(changed.has("server/internal/data/model/schema/new_item.go"));
    assert(changed.has("server/internal/data/workflow_repo.go"));
    assert.equal(git(root, ["rev-list", "--count", localSha]), "3");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-push stops before full when the prior ref secrets gate fails", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-push-prior-fail-"));
  try {
    git(root, ["init", "-q"]);
    materializeFullProfile(root);
    const rangesPath = path.join(root, "ranges.txt");
    const fullRangesPath = path.join(root, "full-ranges.txt");
    installPrePushFixture(root, rangesPath, fullRangesPath);
    writeFileSync(path.join(root, "file.txt"), "base\n", "utf8");
    const remoteSha = commit(root, "base");
    writeFileSync(path.join(root, "file.txt"), "next\n", "utf8");
    const localSha = commit(root, "next");
    const exactRange = `${remoteSha}..${localSha}`;

    const result = spawnSync("bash", ["scripts/git-hooks/pre-push.sh", "origin"], {
      cwd: root,
      input: `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`,
      encoding: "utf8",
      env: hookEnv({ FAIL_RANGE: exactRange }),
    });
    assert.equal(result.status, 9, result.stderr || result.stdout);
    assert.equal(readFileSync(rangesPath, "utf8").trim(), exactRange);
    assert.equal(existsSync(fullRangesPath), false);
    assert.doesNotMatch(result.stdout, /status=complete/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-push rejects inherited ranges and cannot relabel them as coverage", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-push-env-"));
  try {
    git(root, ["init", "-q"]);
    materializeFullProfile(root);
    const rangesPath = path.join(root, "ranges.txt");
    const fullRangesPath = path.join(root, "full-ranges.txt");
    installPrePushFixture(root, rangesPath, fullRangesPath);
    writeFileSync(path.join(root, "file.txt"), "base\n", "utf8");
    const localSha = commit(root, "base");
    const zeroSha = "0".repeat(40);
    const result = spawnSync(
      "bash",
      ["scripts/git-hooks/pre-push.sh", "origin"],
      {
        cwd: root,
        input: `refs/heads/main ${localSha} refs/heads/main ${zeroSha}\n`,
        encoding: "utf8",
        env: hookEnv({ QA_BASE_RANGE: "HEAD~1..HEAD" }),
      },
    );
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stdout, /reason=inherited_range_forbidden/u);
    assert.equal(existsSync(rangesPath), false);
    assert.equal(existsSync(fullRangesPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-push rejects a multi-ref push when any local ref is not current HEAD", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-push-head-"));
  try {
    git(root, ["init", "-q"]);
    materializeFullProfile(root);
    const rangesPath = path.join(root, "ranges.txt");
    const fullRangesPath = path.join(root, "full-ranges.txt");
    installPrePushFixture(root, rangesPath, fullRangesPath);
    writeFileSync(path.join(root, "file.txt"), "base\n", "utf8");
    const priorSha = commit(root, "base");
    writeFileSync(path.join(root, "file.txt"), "head\n", "utf8");
    const headSha = commit(root, "head");
    const zeroSha = "0".repeat(40);
    const input = [
      `refs/heads/prior ${priorSha} refs/heads/prior ${zeroSha}`,
      `refs/heads/main ${headSha} refs/heads/main ${zeroSha}`,
      "",
    ].join("\n");
    const result = spawnSync("bash", ["scripts/git-hooks/pre-push.sh", "origin"], {
      cwd: root,
      input,
      encoding: "utf8",
      env: hookEnv(),
    });
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stdout, /reason=non_head_ref/u);
    assert.equal(existsSync(rangesPath), false);
    assert.equal(existsSync(fullRangesPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-push rejects dirty tracked and untracked fixups before full", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-push-dirty-"));
  try {
    git(root, ["init", "-q"]);
    materializeFullProfile(root);
    const rangesPath = path.join(root, "ranges.txt");
    const fullRangesPath = path.join(root, "full-ranges.txt");
    installPrePushFixture(root, rangesPath, fullRangesPath);
    writeFileSync(path.join(root, "file.txt"), "base\n", "utf8");
    const remoteSha = commit(root, "base");
    writeFileSync(path.join(root, "file.txt"), "committed\n", "utf8");
    const localSha = commit(root, "head");
    writeFileSync(path.join(root, "file.txt"), "unstaged fixup\n", "utf8");
    writeFileSync(path.join(root, "untracked-fixup.txt"), "fixup\n", "utf8");
    const result = spawnSync("bash", ["scripts/git-hooks/pre-push.sh", "origin"], {
      cwd: root,
      input: `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`,
      encoding: "utf8",
      env: hookEnv(),
    });
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stdout, /reason=dirty_worktree/u);
    assert.match(result.stdout, /untracked-fixup\.txt/u);
    assert.equal(existsSync(rangesPath), false);
    assert.equal(existsSync(fullRangesPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
