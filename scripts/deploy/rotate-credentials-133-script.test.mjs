import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const script = path.join(
  repoRoot,
  "deployments/yoyoosun/scripts/rotate-credentials-133.sh",
);
const supportScript = path.join(
  repoRoot,
  "deployments/yoyoosun/scripts/rotate-credentials-133-support.mjs",
);
const contractPath = path.join(
  repoRoot,
  "deployments/yoyoosun/env/credential.contract.json",
);
const contract = JSON.parse(
  fs.readFileSync(contractPath, "utf8"),
);
const release = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
const migration = "20260722000505";
const operationId = "123e4567-e89b-42d3-a456-426614174000";
const backupSha = "a".repeat(64);
const backupAlias = `pre-credential-rotation-${release.slice(0, 12)}-${operationId}`;
const receiptSchema =
  "plush.manual-acceptance-credential-rotation-receipt/v1";

const targetFixtures = Object.freeze({
  "demo-133": Object.freeze({
    root: "/home/simon/plush-toy-erp-demo-v1",
  }),
  "customer-test-133": Object.freeze({
    root: "/home/simon/plush-toy-erp-test-v1",
  }),
});

function writeExecutable(file, source) {
  fs.writeFileSync(file, source, { mode: 0o700 });
}

function fixture(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "rotate-credentials-133-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const sshLog = path.join(root, "ssh.log");
  const stdinLog = path.join(root, "ssh.stdin");
  const securityLog = path.join(root, "security.log");
  writeExecutable(
    path.join(bin, "security"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_SECURITY_LOG"
[[ "\${FAKE_SMS_MISSING:-0}" == 1 ]] || printf '%s\n' "\${FAKE_SMS_PHONE:-13800138000}"
`,
  );
  writeExecutable(
    path.join(bin, "ssh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >"$FAKE_SSH_LOG"
cat >"$FAKE_STDIN_LOG"
case "$FAKE_DEPLOYMENT_TARGET" in
  demo-133)
    printf '%s\n' '{"schemaVersion":"${receiptSchema}","generatedAt":"2026-07-22T08:00:00Z","operationId":"${operationId}","deploymentTarget":"demo-133","target":"customer-trial-133","targetIdentity":"customer-trial-133:2026.08.15-v6","database":"plush_erp_demo_v1","datasetVersion":"2026.08.15-v6","migrationVersion":"${migration}","customerRevision":"yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1","release":"${release}","rollbackPoint":{"backupAlias":"${backupAlias}","backupSha256":"${backupSha}","backupSizeBytes":1024,"restoreChecked":true},"adminAccounts":1,"accountKind":"customer-uat","roleAccounts":10,"nonAdminPolicy":"rotate","nonAdminAccounts":10,"revokedSessions":3,"authVersionIncremented":true,"auditSource":"manual_acceptance_password_rotation","phoneBound":true,"replayed":false,"accounts":[{"username":"admin","authVersion":2,"revokedSessions":1,"phoneBound":true},{"username":"uat_admin","authVersion":2,"revokedSessions":1,"phoneBound":false},{"username":"uat_boss","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"uat_engineering","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"uat_finance","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"uat_pmc","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"uat_production","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"uat_purchase","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"uat_quality","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"uat_sales","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"uat_warehouse","authVersion":2,"revokedSessions":1,"phoneBound":false}]}'
    ;;
  customer-test-133)
    printf '%s\n' '{"schemaVersion":"${receiptSchema}","generatedAt":"2026-07-22T08:00:00Z","operationId":"${operationId}","deploymentTarget":"customer-test-133","target":"customer-test-133","targetIdentity":"deployment-target:customer-test-133:clean-acceptance","database":"plush_erp_customer_test_v1","migrationVersion":"${migration}","release":"${release}","rollbackPoint":{"backupAlias":"${backupAlias}","backupSha256":"${backupSha}","backupSizeBytes":1024,"restoreChecked":true},"adminAccounts":1,"accountKind":"customer-test-admin-only","roleAccounts":0,"nonAdminPolicy":"preserve","nonAdminAccounts":4,"nonAdminAccountsPreserved":true,"revokedSessions":1,"authVersionIncremented":true,"auditSource":"manual_acceptance_password_rotation","phoneBound":false,"replayed":false,"accounts":[{"username":"admin","authVersion":2,"revokedSessions":1,"phoneBound":false}]}'
    ;;
  *) exit 1 ;;
esac
`,
  );
  return {
    root,
    bin,
    sshLog,
    stdinLog,
    securityLog,
    report: path.join(root, "receipt.json"),
  };
}

function argsFor(target, f, overrides = {}) {
  return [
    script,
    "--deployment-target",
    target,
    "--ssh-target",
    "simon@192.168.0.133",
    "--expected-release",
    release,
    "--expected-migration",
    migration,
    "--operation-id",
    operationId,
    "--report",
    f.report,
    "--confirm",
    overrides.confirm ??
      `ROTATE_YOYOOSUN_CREDENTIALS_133:${target}:${release}:${migration}:${operationId}`,
  ];
}

function run(target, f, { args, env = {} } = {}) {
  return spawnSync("bash", args ?? argsFor(target, f), {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      PATH: `${f.bin}:${process.env.PATH}`,
      FAKE_SSH_LOG: f.sshLog,
      FAKE_STDIN_LOG: f.stdinLog,
      FAKE_SECURITY_LOG: f.securityLog,
      FAKE_DEPLOYMENT_TARGET: target,
      ...env,
    },
  });
}

function runSupport(args) {
  return spawnSync(process.execPath, [supportScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validateReport(file, target, phoneExpected) {
  return runSupport([
    "validate-report",
    file,
    contractPath,
    target,
    release,
    migration,
    operationId,
    String(phoneExpected),
  ]);
}

function injectedPreamble(f) {
  const stdin = fs.readFileSync(f.stdinLog, "utf8");
  return stdin.slice(0, stdin.indexOf("set -euo pipefail"));
}

function assertRedacted(result, f) {
  const observable = [
    result.stdout,
    result.stderr,
    fs.readFileSync(f.report, "utf8"),
    fs.readFileSync(f.sshLog, "utf8"),
  ].join("\n");
  assert.doesNotMatch(observable, /13800138000/u);
  assert.equal(
    observable.includes(contract.credentials.admin.fixedTestPassword),
    false,
  );
  assert.equal(
    observable.includes(contract.credentials.uat.fixedTestPassword),
    false,
  );
}

test("demo rotation binds registry paths and injects admin role and optional SMS inputs", (t) => {
  const f = fixture(t);
  const result = run("demo-133", f);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(f.report, "utf8"));
  assert.equal(receipt.deploymentTarget, "demo-133");
  assert.equal(receipt.roleAccounts, 10);
  assert.equal(receipt.nonAdminPolicy, "rotate");
  assert.equal(receipt.phoneBound, true);
  const preamble = injectedPreamble(f);
  assert.match(preamble, /MANUAL_ACCEPTANCE_ADMIN_PASSWORD=/u);
  assert.match(preamble, /MANUAL_ACCEPTANCE_UAT_PASSWORD=/u);
  assert.match(preamble, /MANUAL_ACCEPTANCE_SMS_PHONE=/u);
  const sshArgs = fs.readFileSync(f.sshLog, "utf8");
  assert.match(sshArgs, /-o StrictHostKeyChecking=yes/u);
  assert.match(sshArgs, /demo-133 customer-trial-133/u);
  assert.match(sshArgs, new RegExp(targetFixtures["demo-133"].root, "u"));
  assert.doesNotMatch(sshArgs, /\/backups\//u);
  assert.equal(sshArgs.includes(backupSha), false);
  assertRedacted(result, f);
});

test("customer test rotation injects only admin and reports non-admin preservation", (t) => {
  const f = fixture(t);
  const result = run("customer-test-133", f);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(f.report, "utf8"));
  assert.equal(receipt.deploymentTarget, "customer-test-133");
  assert.equal(receipt.roleAccounts, 0);
  assert.equal(receipt.nonAdminPolicy, "preserve");
  assert.equal(receipt.nonAdminAccountsPreserved, true);
  const preamble = injectedPreamble(f);
  assert.match(preamble, /MANUAL_ACCEPTANCE_ADMIN_PASSWORD=/u);
  assert.doesNotMatch(
    preamble,
    /MANUAL_ACCEPTANCE_(?:UAT_PASSWORD|PASSWORD|SMS_PHONE)=/u,
  );
  assert.equal(fs.existsSync(f.securityLog), false);
  const sshArgs = fs.readFileSync(f.sshLog, "utf8");
  assert.match(sshArgs, /-o StrictHostKeyChecking=yes/u);
  assert.match(sshArgs, /customer-test-133 customer-test-133/u);
  assert.match(
    sshArgs,
    new RegExp(targetFixtures["customer-test-133"].root, "u"),
  );
  assertRedacted(result, f);
});

test("wrapper rejects caller-supplied backup metadata and wrong confirmation before SSH", (t) => {
  const f = fixture(t);
  const legacyBackupArgs = argsFor("customer-test-133", f);
  legacyBackupArgs.splice(legacyBackupArgs.indexOf("--report"), 0,
    "--backup-file",
    "/tmp/caller-selected.dump",
    "--backup-sha256",
    backupSha,
  );
  const callerBackup = run("customer-test-133", f, {
    args: legacyBackupArgs,
  });
  assert.equal(callerBackup.status, 2);
  assert.match(callerBackup.stderr, /不支持的参数/u);
  assert.equal(fs.existsSync(f.sshLog), false);

  const wrongConfirmation = run("demo-133", f, {
    args: argsFor("demo-133", f, {
      confirm: `ROTATE_YOYOOSUN_CREDENTIALS_133:customer-test-133:${release}:${migration}:${operationId}`,
    }),
  });
  assert.equal(wrongConfirmation.status, 2);
  assert.match(wrongConfirmation.stderr, /deployment target/u);
  assert.equal(fs.existsSync(f.sshLog), false);
});

test("support rejects drift from the registered fixed credential contract", (t) => {
  const f = fixture(t);
  const mutations = [
    (drifted) => {
      drifted.credentials.admin.fixedTestPassword += "-drift";
    },
    (drifted) => {
      drifted.credentials.uat.fixedTestPassword += "-drift";
    },
  ];

  for (const [index, mutate] of mutations.entries()) {
    const drifted = structuredClone(contract);
    mutate(drifted);
    const file = path.join(f.root, `credential-contract-drift-${index}.json`);
    fs.writeFileSync(file, JSON.stringify(drifted));

    const result = runSupport(["target-config", file, "demo-133"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid yoyoosun credential contract/u);
    assert.equal(
      result.stderr.includes(
        index === 0
          ? drifted.credentials.admin.fixedTestPassword
          : drifted.credentials.uat.fixedTestPassword,
      ),
      false,
    );
  }
});

test("support enforces exact target-specific receipt shapes and summaries", (t) => {
  const mutations = [
    (receipt) => {
      receipt.unexpected = true;
    },
    (receipt) => {
      receipt.accounts[0].unexpected = true;
    },
    (receipt) => {
      receipt.generatedAt = "invalid";
    },
    (receipt) => {
      receipt.replayed = "false";
    },
    (receipt) => {
      receipt.revokedSessions += 1;
    },
    (receipt) => {
      receipt.database = "cross_target_database";
    },
    (receipt) => {
      receipt.schemaVersion = "wrong-schema";
    },
    (receipt) => {
      receipt.rollbackPoint.unexpected = true;
    },
    (receipt) => {
      receipt.rollbackPoint.backupAlias = "wrong-alias";
    },
    (receipt) => {
      receipt.rollbackPoint.backupSha256 = "not-a-sha";
    },
    (receipt) => {
      receipt.rollbackPoint.backupSizeBytes = 0;
    },
    (receipt) => {
      receipt.rollbackPoint.restoreChecked = false;
    },
    (receipt) => {
      receipt.customerRevision = "stale-runtime-manifest";
    },
  ];

  for (const target of Object.keys(targetFixtures)) {
    const f = fixture(t);
    const result = run(target, f);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const phoneExpected = target === "demo-133";
    const validResult = validateReport(f.report, target, phoneExpected);
    assert.equal(
      validResult.status,
      0,
      `${validResult.stdout}\n${validResult.stderr}`,
    );
    const validReceipt = JSON.parse(fs.readFileSync(f.report, "utf8"));

    for (const [index, mutate] of mutations.entries()) {
      const invalidReceipt = structuredClone(validReceipt);
      mutate(invalidReceipt);
      const file = path.join(f.root, `invalid-receipt-${index}.json`);
      fs.writeFileSync(file, JSON.stringify(invalidReceipt));

      const invalidResult = validateReport(file, target, phoneExpected);
      assert.notEqual(
        invalidResult.status,
        0,
        `${target} mutation ${index} unexpectedly passed`,
      );
      assert.match(
        invalidResult.stderr,
        /credential rotation receipt is incomplete/u,
      );
    }
  }
});

test("remote closure creates one operation-bound restore-checked backup before rotation", () => {
  const wrapperSource = fs.readFileSync(script, "utf8");
  const remoteSource = fs.readFileSync(
    path.join(
      repoRoot,
      "deployments/yoyoosun/scripts/rotate-credentials-133-remote.sh",
    ),
    "utf8",
  );
  assert.doesNotMatch(wrapperSource, /--backup-(?:file|sha256)/u);
  assert.match(remoteSource, /pre-credential-rotation-\$\{expected_release:0:12\}-\$\{operation_id\}/u);
  assert.match(remoteSource, /promotion_lock="\$run_root\/promotion\.lock"/u);
  assert.match(remoteSource, /exec 9>>"\$promotion_lock"/u);
  assert.match(remoteSource, /pg_dump -Fc --no-owner --no-privileges/u);
  assert.match(remoteSource, /pg_restore --list/u);
  assert.match(remoteSource, /pg_restore --exit-on-error --no-owner --no-privileges/u);
  assert.match(
    remoteSource,
    /rotation_marker_key="manual-acceptance-password-rotation:\$\{operation_id\}"/u,
  );
  assert.match(
    remoteSource,
    /SELECT COUNT\(\*\) FROM runtime_markers WHERE marker_key/u,
  );
  assert.match(
    remoteSource,
    /printf "%s\\n" "SELECT COUNT\(\*\) FROM runtime_markers WHERE marker_key = :/u,
  );
  assert.match(
    remoteSource,
    /\| psql -At -U "\$POSTGRES_USER" -d "\$POSTGRES_DB" -v ON_ERROR_STOP=1 -v marker_key="\$1"/u,
  );
  assert.doesNotMatch(
    remoteSource,
    /psql[^\n]+-c "SELECT COUNT\(\*\) FROM runtime_markers WHERE marker_key/u,
  );
  assert.equal(
    remoteSource.match(
      /printf "%s\\n" "SELECT COUNT\(\*\) FROM pg_database WHERE datname = :/gu,
    )?.length,
    2,
  );
  assert.equal(
    remoteSource.match(
      /\| psql -At -U "\$POSTGRES_USER" -d "\$POSTGRES_DB" -v ON_ERROR_STOP=1 -v candidate="\$1"/gu,
    )?.length,
    2,
  );
  assert.doesNotMatch(
    remoteSource,
    /psql[^\n]+-c "SELECT COUNT\(\*\) FROM pg_database WHERE datname/u,
  );
  assert.match(
    remoteSource,
    /existing credential backup has no durable receipt/u,
  );
  assert.match(
    remoteSource,
    /durable rotation receipt is missing its exact backup/u,
  );
  assert.match(remoteSource, /trap cleanup_resources EXIT/u);
  assert.match(remoteSource, /trap 'exit 130' HUP INT TERM/u);
  assert.match(
    remoteSource,
    /cleanup_resources\(\) \{[\s\S]+?trap - EXIT[\s\S]+?trap '' HUP INT TERM[\s\S]+?cleanup_restore_database/u,
  );
  assert.match(
    remoteSource,
    /dropdb --if-exists --force[\s\S]+?\|\| return 1[\s\S]+?SELECT COUNT\(\*\) FROM pg_database[\s\S]+?\|\| return 1[\s\S]+?restore_database_cleanup_required=0/u,
  );
  assert.match(
    remoteSource,
    /cleanup_restore_database \|\| \{[\s\S]+?credential restore database cleanup failed[\s\S]+?exit 1[\s\S]+?\}/u,
  );
  assert.doesNotMatch(
    remoteSource,
    /dropdb[^\n]+\|\| true/u,
  );
  assert.match(remoteSource, /mv "\$backup_temp" "\$backup_final"/u);
  assert.match(remoteSource, /--backup-restore-checked/u);
  assert(
    remoteSource.indexOf("pg_dump -Fc") <
      remoteSource.lastIndexOf('"${compose_command[@]}"'),
  );
  assert(
    remoteSource.indexOf("pg_restore --exit-on-error") <
      remoteSource.lastIndexOf('"${compose_command[@]}"'),
  );
  const preabsenceIndex = remoteSource.indexOf(
    "credential restore database identity is not preabsent",
  );
  const exitTrapIndex = remoteSource.indexOf("trap cleanup_resources EXIT");
  const signalTrapIndex = remoteSource.indexOf("trap 'exit 130' HUP INT TERM");
  const backupTempRequiredIndex = remoteSource.lastIndexOf(
    "backup_temp_created=1",
  );
  const staleBackupTempIndex = remoteSource.indexOf(
    "stale credential backup temporary exists",
  );
  const markerStateIndex = remoteSource.indexOf(
    "credential rotation marker state is unreadable",
  );
  const existingBackupIndex = remoteSource.indexOf(
    "existing credential backup is unsafe",
  );
  const backupWriteIndex = remoteSource.indexOf('>"$backup_temp"');
  const cleanupRequiredIndex = remoteSource.lastIndexOf(
    "restore_database_cleanup_required=1",
  );
  const createDatabaseIndex = remoteSource.indexOf(
    `'createdb -U "$POSTGRES_USER" "$1"'`,
  );
  const explicitCleanupIndex = remoteSource.lastIndexOf(
    "cleanup_restore_database || {",
  );
  const publishIndex = remoteSource.indexOf(
    'mv "$backup_temp" "$backup_final"',
  );
  const rotationIndex = remoteSource.lastIndexOf('"${compose_command[@]}"');
  assert(exitTrapIndex >= 0 && exitTrapIndex < backupTempRequiredIndex);
  assert(signalTrapIndex >= 0 && signalTrapIndex < backupTempRequiredIndex);
  assert(
    staleBackupTempIndex >= 0 &&
      staleBackupTempIndex < backupTempRequiredIndex,
  );
  assert(
    markerStateIndex >= 0 &&
      markerStateIndex < staleBackupTempIndex &&
      markerStateIndex < existingBackupIndex,
  );
  assert(
    backupTempRequiredIndex >= 0 && backupTempRequiredIndex < backupWriteIndex,
  );
  assert(signalTrapIndex < cleanupRequiredIndex);
  assert(preabsenceIndex >= 0 && preabsenceIndex < cleanupRequiredIndex);
  assert(
    cleanupRequiredIndex >= 0 && cleanupRequiredIndex < createDatabaseIndex,
  );
  assert(
    createDatabaseIndex >= 0 && createDatabaseIndex < explicitCleanupIndex,
  );
  assert(explicitCleanupIndex >= 0 && explicitCleanupIndex < publishIndex);
  assert(publishIndex >= 0 && publishIndex < rotationIndex);
  assert.match(
    remoteSource,
    /if \[\[ "\$backup_temp_created" -eq 1 \]\]; then[\s\S]+?if rm -f -- "\$backup_temp" && \[\[ ! -e "\$backup_temp" && ! -L "\$backup_temp" \]\]; then[\s\S]+?cleanup_failed=1[\s\S]+?if \[\[ "\$cleanup_failed" -eq 1 \]\]; then[\s\S]+?exit 1/u,
  );
  assert.doesNotMatch(
    remoteSource,
    /rm[^\n]*\$(?:root|backups_root|backup_final)\b/u,
  );
});
