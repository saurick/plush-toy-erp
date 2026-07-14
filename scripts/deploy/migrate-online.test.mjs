import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const migrateScript = path.join(
  repoRoot,
  "server/deploy/compose/prod/migrate_online.sh",
);
const systemFlock = findCommand("flock");
const perl = findCommand("perl");

function findCommand(command) {
  const result = spawnSync("sh", ["-c", `command -v ${command}`], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, "utf8");
  fs.chmodSync(filePath, 0o755);
}

function createFixture({ useSystemFlock = false } = {}) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "migrate-online-")),
  );
  const binDir = path.join(root, "bin");
  const migrateDir = path.join(root, "migrations");
  const composeFile = path.join(root, "compose.yml");
  const atlasLog = path.join(root, "atlas.log");
  const eventLog = path.join(root, "events.log");
  const flockLog = path.join(root, "flock.log");
  const lockDir = path.join(root, "private-lock");
  const lockFile = path.join(lockDir, "migration.lock");
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(migrateDir, { recursive: true });
  fs.writeFileSync(
    composeFile,
    "services:\n  postgres:\n    image: postgres:18.1\n",
    "utf8",
  );

  writeExecutable(
    path.join(binDir, "docker"),
    `#!/bin/sh
if [ "$1" = "compose" ] && [ "$2" = "version" ]; then
  exit 0
fi
case " $* " in
  *" ps -q app-server "*)
    if [ -n "\${APP_SERVER_CID:-}" ]; then
      printf '%s\n' "$APP_SERVER_CID"
    fi
    exit 0
    ;;
  *" ps -q "*)
    printf '%s\n' 'postgres-test-cid'
    exit 0
    ;;
esac
exit 1
`,
  );

  const atlasBin = path.join(binDir, "atlas");
  writeExecutable(
    atlasBin,
    `#!/bin/sh
case "$*" in
  "migrate status "*) phase='status' ;;
  "migrate apply --dry-run "*) phase='dry-run' ;;
  "migrate apply "*) phase='apply' ;;
  *) phase='unknown' ;;
esac
printf '%s\n' "$*" >> "$ATLAS_LOG"
printf '%s start %s\n' "\${RUN_LABEL:-run}" "$phase" >> "$EVENT_LOG"
if [ "\${ATLAS_SLEEP_PHASE:-}" = "$phase" ]; then
  sleep "\${ATLAS_SLEEP_SECONDS:-1}"
fi
if [ "\${ATLAS_FAIL_PHASE:-}" = "$phase" ]; then
  exit "\${ATLAS_FAIL_CODE:-42}"
fi
printf '%s end %s\n' "\${RUN_LABEL:-run}" "$phase" >> "$EVENT_LOG"
`,
  );

  if (!useSystemFlock) {
    writeExecutable(
      path.join(binDir, "flock"),
      `#!/bin/sh
printf '%s\n' "$*" >> "$FLOCK_LOG"
exit 0
`,
    );
  } else if (!systemFlock) {
    assert(
      perl,
      "the portable flock fixture requires Perl when flock is unavailable",
    );
    writeExecutable(
      path.join(binDir, "flock"),
      `#!${perl}
use strict;
use warnings;
use Fcntl qw(LOCK_EX);
my $fd = shift @ARGV;
die "missing file descriptor\\n" unless defined $fd && $fd =~ /^\\d+$/;
open(my $lock_handle, ">&=$fd") or die "dup fd $fd failed: $!\\n";
flock($lock_handle, LOCK_EX) or die "flock fd $fd failed: $!\\n";
`,
    );
  }

  return {
    root,
    lockDir,
    lockFile,
    atlasLog,
    eventLog,
    flockLog,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
      COMPOSE_FILE: composeFile,
      MIG_DIR: migrateDir,
      ATLAS_BIN: atlasBin,
      DB_URL: "postgres://test:test@127.0.0.1:5435/test?sslmode=disable",
      MIGRATION_LOCK_FILE: lockFile,
      ATLAS_LOG: atlasLog,
      EVENT_LOG: eventLog,
      FLOCK_LOG: flockLog,
    },
  };
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function atlasPhases(filePath) {
  return readLines(filePath).map((line) => {
    if (line.startsWith("migrate status ")) return "status";
    if (line.startsWith("migrate apply --dry-run ")) return "dry-run";
    if (line.startsWith("migrate apply ")) return "apply";
    return "unknown";
  });
}

function runMigration(fixture, args = [], extraEnv = {}) {
  return spawnSync("sh", [migrateScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...fixture.env,
      ...(args.includes("--apply")
        ? { MIGRATION_MAINTENANCE_CONFIRMED: "1" }
        : {}),
      ...extraEnv,
    },
  });
}

function spawnMigration(fixture, args = [], extraEnv = {}) {
  const child = spawn("sh", [migrateScript, ...args], {
    cwd: repoRoot,
    env: {
      ...fixture.env,
      ...(args.includes("--apply")
        ? { MIGRATION_MAINTENANCE_CONFIRMED: "1" }
        : {}),
      ...extraEnv,
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function waitForLine(filePath, expected, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (readLines(filePath).includes(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${expected}`);
}

test("migrate_online 在一次锁内按模式执行 Atlas 命令", async (t) => {
  const cases = [
    { name: "status-only", args: ["--status-only"], phases: ["status"] },
    { name: "dry-run", args: [], phases: ["status", "dry-run"] },
    {
      name: "apply",
      args: ["--apply"],
      phases: ["status", "dry-run", "apply"],
    },
  ];

  for (const item of cases) {
    await t.test(item.name, () => {
      const fixture = createFixture();
      try {
        const result = runMigration(fixture, item.args);
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.deepEqual(atlasPhases(fixture.atlasLog), item.phases);
        assert.deepEqual(readLines(fixture.flockLog), ["9"]);
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("migrate_online dry-run 失败时不执行 apply", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--apply"], {
      ATLAS_FAIL_PHASE: "dry-run",
      ATLAS_FAIL_CODE: "42",
    });
    assert.equal(result.status, 42, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(atlasPhases(fixture.atlasLog), ["status", "dry-run"]);
    assert.deepEqual(readLines(fixture.flockLog), ["9"]);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 正式 apply 必须显式确认停写维护窗口", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--apply"], {
      MIGRATION_MAINTENANCE_CONFIRMED: "",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MIGRATION_MAINTENANCE_CONFIRMED=1/);
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 正式 apply 在 app-server 运行时 fail closed", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--apply"], {
      APP_SERVER_CID: "running-app-server",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /后端服务仍在运行/);
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 不截断已有锁文件并收紧文件权限", () => {
  const fixture = createFixture();
  try {
    fs.mkdirSync(fixture.lockDir, { mode: 0o700 });
    fs.writeFileSync(fixture.lockFile, "lock-evidence\n", { mode: 0o644 });

    const result = runMigration(fixture, ["--status-only"]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(fs.readFileSync(fixture.lockFile, "utf8"), "lock-evidence\n");
    assert.equal(fs.statSync(fixture.lockDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(fixture.lockFile).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 创建 0700 私有锁目录和 0600 锁文件", () => {
  const fixture = createFixture();
  try {
    assert.equal(fs.existsSync(fixture.lockDir), false);

    const result = runMigration(fixture, ["--status-only"]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(fs.statSync(fixture.lockDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(fixture.lockFile).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 拒绝使用非私有的已有锁目录", () => {
  const fixture = createFixture();
  try {
    fs.mkdirSync(fixture.lockDir, { mode: 0o755 });

    const result = runMigration(fixture, ["--status-only"]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /migration lock 目录权限必须是 0700/);
    assert.equal(fs.statSync(fixture.lockDir).mode & 0o777, 0o755);
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 拒绝相对锁路径", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--status-only"], {
      MIGRATION_LOCK_FILE: "relative/migration.lock",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MIGRATION_LOCK_FILE 必须是绝对路径/);
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 拒绝符号链接锁文件", () => {
  const fixture = createFixture();
  try {
    fs.mkdirSync(fixture.lockDir, { mode: 0o700 });
    const symlinkTarget = path.join(fixture.root, "outside.lock");
    fs.writeFileSync(symlinkTarget, "outside\n", "utf8");
    fs.symlinkSync(symlinkTarget, fixture.lockFile);

    const result = runMigration(fixture, ["--status-only"]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MIGRATION_LOCK_FILE 不得是符号链接/);
    assert.equal(fs.readFileSync(symlinkTarget, "utf8"), "outside\n");
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 拒绝符号链接锁目录", () => {
  const fixture = createFixture();
  try {
    const outsideDir = path.join(fixture.root, "outside-lock-dir");
    const symlinkDir = path.join(fixture.root, "linked-lock-dir");
    fs.mkdirSync(outsideDir, { mode: 0o700 });
    fs.symlinkSync(outsideDir, symlinkDir);

    const result = runMigration(fixture, ["--status-only"], {
      MIGRATION_LOCK_FILE: path.join(symlinkDir, "migration.lock"),
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /migration lock 路径不得包含符号链接/);
    assert.equal(fs.existsSync(path.join(outsideDir, "migration.lock")), false);
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 并发运行时串行化整段 migration", async () => {
  const fixture = createFixture({ useSystemFlock: true });
  try {
    const first = spawnMigration(fixture, ["--apply"], {
      RUN_LABEL: "first",
      ATLAS_SLEEP_PHASE: "status",
      ATLAS_SLEEP_SECONDS: "1",
    });
    await waitForLine(fixture.eventLog, "first start status");
    const second = spawnMigration(fixture, ["--status-only"], {
      RUN_LABEL: "second",
    });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(
      firstResult.status,
      0,
      `${firstResult.stdout}\n${firstResult.stderr}`,
    );
    assert.equal(
      secondResult.status,
      0,
      `${secondResult.stdout}\n${secondResult.stderr}`,
    );

    const events = readLines(fixture.eventLog);
    const firstApplyEnd = events.indexOf("first end apply");
    const secondStatusStart = events.indexOf("second start status");
    assert.notEqual(firstApplyEnd, -1, events.join("\n"));
    assert.notEqual(secondStatusStart, -1, events.join("\n"));
    assert.ok(
      secondStatusStart > firstApplyEnd,
      `second run entered Atlas before first sequence completed:\n${events.join("\n")}`,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
