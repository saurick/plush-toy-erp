import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
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
    "user.name=Hook Test",
    "-c",
    "user.email=hook@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    message,
  ]);
}

function installHookFixture(root) {
  const executables = new Set(PROFILE_REQUIRED_EXECUTABLES.fast);
  for (const file of PROFILE_REQUIRED_FILES.fast) {
    const target = path.join(root, file);
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
    if (executables.has(file)) chmodSync(target, 0o755);
  }
  mkdirSync(path.join(root, "scripts/git-hooks"), { recursive: true });
  mkdirSync(path.join(root, "scripts/qa"), { recursive: true });
  for (const file of [
    "scripts/git-hooks/pre-commit.sh",
    "scripts/qa/gate-profiles.mjs",
  ]) {
    copyFileSync(path.join(ROOT, file), path.join(root, file));
  }
  chmodSync(path.join(root, "scripts/git-hooks/pre-commit.sh"), 0o755);
  for (const name of ["error-code-sync.sh", "error-codes.sh"]) {
    const target = path.join(root, "scripts/qa", name);
    writeFileSync(target, "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n", "utf8");
    chmodSync(target, 0o755);
  }
  const secrets = path.join(root, "scripts/qa/secrets.sh");
  writeFileSync(
    secrets,
    "#!/usr/bin/env bash\nset -euo pipefail\nif git show :payload.txt 2>/dev/null | grep -q FORBIDDEN_TEST_SECRET; then\n  echo '[fixture] staged secret detected'\n  exit 1\nfi\n",
    "utf8",
  );
  chmodSync(secrets, 0o755);
  for (const name of ["shfmt.sh", "go-vet.sh", "golangci-lint.sh", "yamllint.sh"]) {
    const target = path.join(root, "scripts/qa", name);
    writeFileSync(target, "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n", "utf8");
    chmodSync(target, 0o755);
  }
  const shellcheck = path.join(root, "scripts/qa/shellcheck.sh");
  writeFileSync(
    shellcheck,
    "#!/usr/bin/env bash\nset -euo pipefail\nfor file in \"$@\"; do bash -n \"$file\"; done\n",
    "utf8",
  );
  chmodSync(shellcheck, 0o755);
}

function installDbModelFixture(root) {
  const schema = path.join(root, "server/internal/data/model/schema/item.go");
  const migration = path.join(
    root,
    "server/internal/data/model/migrate/20260101000000_migrate.sql",
  );
  const atlasSum = path.join(
    root,
    "server/internal/data/model/migrate/atlas.sum",
  );
  mkdirSync(path.dirname(schema), { recursive: true });
  mkdirSync(path.dirname(migration), { recursive: true });
  writeFileSync(
    schema,
    "package schema\n\nfunc (Item) Fields() []ent.Field { return nil }\n",
    "utf8",
  );
  writeFileSync(migration, "CREATE TABLE items (id bigint);\n", "utf8");
  writeFileSync(atlasSum, "h1:base\n", "utf8");
}

function installDbGuardFixture(root) {
  for (const file of [
    "scripts/qa/db-guard.sh",
    "scripts/qa/db-guard.mjs",
    "scripts/qa/lib/git-range.mjs",
  ]) {
    copyFileSync(path.join(ROOT, file), path.join(root, file));
  }
  chmodSync(path.join(root, "scripts/qa/db-guard.sh"), 0o755);
  installDbModelFixture(root);
}

test("pre-commit is check-only and preserves partial staging", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-commit-"));
  try {
    git(root, ["init", "-q"]);
    installHookFixture(root);
    writeFileSync(path.join(root, "partial.txt"), "base\n", "utf8");
    commit(root, "base");

    writeFileSync(path.join(root, "partial.txt"), "staged\n", "utf8");
    git(root, ["add", "partial.txt"]);
    writeFileSync(path.join(root, "partial.txt"), "staged\nunstaged\n", "utf8");
    const indexBefore = git(root, ["show", ":partial.txt"]);

    const result = spawnSync("bash", ["scripts/git-hooks/pre-commit.sh"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(git(root, ["show", ":partial.txt"]), indexBefore);
    assert.equal(readFileSync(path.join(root, "partial.txt"), "utf8"), "staged\nunstaged\n");
    assert.match(git(root, ["diff", "--name-only"]), /partial\.txt/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-commit keeps a relative commit index bound after entering its snapshot", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-commit-index-env-"));
  try {
    git(root, ["init", "-q"]);
    installHookFixture(root);
    writeFileSync(path.join(root, "base.txt"), "base\n", "utf8");
    commit(root, "base");

    writeFileSync(path.join(root, "payload.txt"), "staged\n", "utf8");
    git(root, ["add", "payload.txt"]);
    const result = spawnSync("bash", ["scripts/git-hooks/pre-commit.sh"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_INDEX_FILE: ".git/index" },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(git(root, ["show", ":payload.txt"]), "staged");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-commit requires staged schema, migration, and atlas.sum as one change", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "plush-pre-commit-db-guard-"),
  );
  try {
    git(root, ["init", "-q"]);
    installHookFixture(root);
    installDbGuardFixture(root);
    commit(root, "base");

    const schema = path.join(root, "server/internal/data/model/schema/item.go");
    writeFileSync(
      schema,
      'package schema\n\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String("name")} }\n',
      "utf8",
    );
    git(root, ["add", "server/internal/data/model/schema/item.go"]);

    const result = spawnSync("bash", ["scripts/git-hooks/pre-commit.sh"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /schema\/ent 结构变更但没有新增 migration/u);
    assert.match(
      git(root, ["diff", "--cached", "--name-only"]),
      /schema\/item\.go/u,
    );

    writeFileSync(
      path.join(
        root,
        "server/internal/data/model/migrate/20260102000000_migrate.sql",
      ),
      "ALTER TABLE items ADD COLUMN name text;\n",
      "utf8",
    );
    writeFileSync(
      path.join(root, "server/internal/data/model/migrate/atlas.sum"),
      "h1:next\n",
      "utf8",
    );
    git(root, ["add", "server/internal/data/model"]);

    const completeResult = spawnSync(
      "bash",
      ["scripts/git-hooks/pre-commit.sh"],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    assert.equal(
      completeResult.status,
      0,
      completeResult.stderr || completeResult.stdout,
    );
    assert.match(completeResult.stdout, /\[qa:db-guard\] 通过/u);
    assert.match(
      git(root, ["diff", "--cached", "--name-only"]),
      /20260102000000_migrate\.sql/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-commit checks staged script content instead of an unstaged fixup", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-commit-content-"));
  try {
    git(root, ["init", "-q"]);
    installHookFixture(root);
    mkdirSync(path.join(root, "scripts"), { recursive: true });
    const target = path.join(root, "scripts/example.sh");
    writeFileSync(target, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    commit(root, "base");

    writeFileSync(target, "#!/usr/bin/env bash\nif then\n", "utf8");
    git(root, ["add", "scripts/example.sh"]);
    writeFileSync(target, "#!/usr/bin/env bash\nexit 0\n", "utf8");

    const result = spawnSync("bash", ["scripts/git-hooks/pre-commit.sh"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, /同时含暂存与未暂存改动/u);
    assert.equal(git(root, ["show", ":scripts/example.sh"]), "#!/usr/bin/env bash\nif then");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-commit rejects a required hook deleted only from the index", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-commit-required-"));
  try {
    git(root, ["init", "-q"]);
    installHookFixture(root);
    const target = path.join(root, ".githooks/pre-push");
    commit(root, "base");

    git(root, ["rm", "--cached", ".githooks/pre-push"]);
    const profileResult = spawnSync(
      "node",
      [
        "scripts/qa/gate-profiles.mjs",
        "--profile",
        "fast",
        "--source",
        "index-transition",
        "--baseline",
        "HEAD",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(profileResult.status, 1, profileResult.stderr || profileResult.stdout);
    assert.match(profileResult.stderr, /缺少 required 文件/u);
    const result = spawnSync("bash", ["scripts/git-hooks/pre-commit.sh"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /缺少 required 文件/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-commit uses the indexed checker when its worktree copy is weakened", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-commit-checker-"));
  try {
    git(root, ["init", "-q"]);
    installHookFixture(root);
    writeFileSync(path.join(root, "base.txt"), "base\n", "utf8");
    commit(root, "base");

    writeFileSync(path.join(root, "payload.txt"), "FORBIDDEN_TEST_SECRET\n", "utf8");
    git(root, ["add", "payload.txt"]);
    writeFileSync(
      path.join(root, "scripts/qa/secrets.sh"),
      "#!/usr/bin/env bash\nexit 0\n",
      "utf8",
    );

    const result = spawnSync("bash", ["scripts/git-hooks/pre-commit.sh"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /staged secret detected/u);
    assert.match(git(root, ["diff", "--name-only"]), /scripts\/qa\/secrets\.sh/u);
    assert.equal(git(root, ["show", ":payload.txt"]), "FORBIDDEN_TEST_SECRET");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-commit source contains no mutating formatter or git add", () => {
  const source = readFileSync(path.join(ROOT, "scripts/git-hooks/pre-commit.sh"), "utf8");
  assert.doesNotMatch(source, /\bgit add\b/u);
  assert.doesNotMatch(source, /--write|--fix|shfmt -w/u);
  assert.doesNotMatch(
    source,
    /\bnode[^\n]*gen-error-codes\.mjs(?![^\n]*--check)/u,
  );
  assert.match(source, /git diff --cached --check/u);
  assert.match(source, /git checkout-index --all/u);
  assert.match(source, /GIT_WORK_TREE="\$INDEX_ROOT"/u);
  assert.match(source, /SHFMT_CHECK=1/u);
  assert.match(source, /SKIP_DB_GUARD=0 QA_BASE_RANGE=HEAD\.\.\.HEAD/u);
  assert.match(source, /scripts\/qa\/db-guard\.sh/u);
  assert.doesNotMatch(source, /\bmake data\b|\bmigrate_apply\b/u);
});
