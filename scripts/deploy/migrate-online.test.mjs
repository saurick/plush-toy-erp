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
const populatedUpgradePreflight = path.join(
  repoRoot,
  "scripts/qa/populated-upgrade-preflight.sh",
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
  const psqlLog = path.join(root, "psql.log");
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

  const psqlBin = path.join(binDir, "psql");
  writeExecutable(
    psqlBin,
    `#!/bin/sh
printf '%s\n' "$*" >> "$PSQL_LOG"
payload=$(cat)
case "$payload" in
  *plush_populated_upgrade*) audit='populated-upgrade' ;;
  *plush_customer_config_cutover*) audit='customer-config-cutover' ;;
  *) audit='unknown-audit' ;;
esac
printf '%s start %s\n' "\${RUN_LABEL:-run}" "$audit" >> "$EVENT_LOG"
if [ -n "\${PREFLIGHT_FAIL_CODE:-}" ] && { [ -z "\${PREFLIGHT_FAIL_AUDIT:-}" ] || [ "$PREFLIGHT_FAIL_AUDIT" = "$audit" ]; }; then
  printf '%s fail %s\n' "\${RUN_LABEL:-run}" "$audit" >> "$EVENT_LOG"
  exit "$PREFLIGHT_FAIL_CODE"
fi
printf '%s end %s\n' "\${RUN_LABEL:-run}" "$audit" >> "$EVENT_LOG"
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
    psqlLog,
    eventLog,
    flockLog,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
      COMPOSE_FILE: composeFile,
      MIG_DIR: migrateDir,
      ATLAS_BIN: atlasBin,
      PSQL_BIN: psqlBin,
      POPULATED_UPGRADE_PREFLIGHT: populatedUpgradePreflight,
      DB_URL: "postgres://test:test@127.0.0.1:5435/test?sslmode=disable",
      MIGRATION_LOCK_FILE: lockFile,
      ATLAS_LOG: atlasLog,
      PSQL_LOG: psqlLog,
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

function expectedEvents(phases, label = "run") {
  return phases.flatMap((phase) => [
    `${label} start ${phase}`,
    `${label} end ${phase}`,
  ]);
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

async function waitForLine(filePath, expected, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (readLines(filePath).includes(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${expected}`);
}

test("migrate_online 在一次锁内按 status、两项只读审计、dry-run、apply 顺序执行", async (t) => {
  const cases = [
    {
      name: "status-only 不运行审计",
      args: ["--status-only"],
      atlas: ["status"],
      sequence: ["status"],
      preflightRuns: 0,
    },
    {
      name: "dry-run",
      args: [],
      atlas: ["status", "dry-run"],
      sequence: [
        "status",
        "populated-upgrade",
        "customer-config-cutover",
        "dry-run",
      ],
      preflightRuns: 2,
    },
    {
      name: "apply",
      args: ["--apply"],
      atlas: ["status", "dry-run", "apply"],
      sequence: [
        "status",
        "populated-upgrade",
        "customer-config-cutover",
        "dry-run",
        "apply",
      ],
      preflightRuns: 2,
    },
  ];

  for (const item of cases) {
    await t.test(item.name, () => {
      const fixture = createFixture();
      try {
        const result = runMigration(fixture, item.args);
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.deepEqual(atlasPhases(fixture.atlasLog), item.atlas);
        assert.deepEqual(
          readLines(fixture.eventLog),
          expectedEvents(item.sequence),
        );
        assert.equal(readLines(fixture.psqlLog).length, item.preflightRuns);
        assert.deepEqual(readLines(fixture.flockLog), ["9"]);
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("migrate_online populated upgrade 审计失败时不执行后续审计、dry-run 或 apply", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--apply"], {
      PREFLIGHT_FAIL_CODE: "43",
      PREFLIGHT_FAIL_AUDIT: "populated-upgrade",
    });
    assert.equal(result.status, 43, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(atlasPhases(fixture.atlasLog), ["status"]);
    assert.equal(readLines(fixture.psqlLog).length, 1);
    assert.deepEqual(readLines(fixture.eventLog), [
      ...expectedEvents(["status"]),
      "run start populated-upgrade",
      "run fail populated-upgrade",
    ]);
    assert.doesNotMatch(result.stdout, /\[3\/5\]|\[4\/5\]|\[5\/5\]/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online customer config cutover 审计失败时不执行 dry-run 或 apply", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--apply"], {
      PREFLIGHT_FAIL_CODE: "44",
      PREFLIGHT_FAIL_AUDIT: "customer-config-cutover",
    });
    assert.equal(result.status, 44, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(atlasPhases(fixture.atlasLog), ["status"]);
    assert.equal(readLines(fixture.psqlLog).length, 2);
    assert.deepEqual(readLines(fixture.eventLog), [
      ...expectedEvents(["status", "populated-upgrade"]),
      "run start customer-config-cutover",
      "run fail customer-config-cutover",
    ]);
    assert.doesNotMatch(result.stdout, /\[4\/5\]|\[5\/5\]/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
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
