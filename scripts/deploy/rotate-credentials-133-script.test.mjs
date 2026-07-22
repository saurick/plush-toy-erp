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
const release = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
const migration = "20260722000505";
const operationId = "123e4567-e89b-42d3-a456-426614174000";
const backupSha = "a".repeat(64);

function writeExecutable(file, source) {
  fs.writeFileSync(file, source, { mode: 0o700 });
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rotate-credentials-133-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const sshLog = path.join(root, "ssh.log");
  writeExecutable(
    path.join(bin, "security"),
    `#!/usr/bin/env bash
set -euo pipefail
args="$*"
case "$args" in
  *plush-toy-erp-yoyoosun-admin*) printf '%s\\n' "\${FAKE_ADMIN_PASSWORD:-AdminSafe9x}" ;;
  *plush-toy-erp-yoyoosun-demo*) printf '%s\\n' "\${FAKE_DEMO_PASSWORD:-DemoSafe8y}" ;;
  *plush-toy-erp-yoyoosun-sms-phone*) printf '%s\\n' "\${FAKE_SMS_PHONE:-13800138000}" ;;
  *) exit 1 ;;
esac
`,
  );
  writeExecutable(
    path.join(bin, "ssh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >"$FAKE_SSH_LOG"
IFS= read -r admin_secret
IFS= read -r demo_secret
IFS= read -r phone_secret
cat >/dev/null
[[ "$admin_secret" == "\${FAKE_ADMIN_PASSWORD:-AdminSafe9x}" ]]
[[ "$demo_secret" == "\${FAKE_DEMO_PASSWORD:-DemoSafe8y}" ]]
[[ "$phone_secret" == "\${FAKE_SMS_PHONE:-13800138000}" ]]
cat <<'JSON'
{"generatedAt":"2026-07-22T08:00:00Z","target":"customer-trial-133","datasetVersion":"2026.07.16-v5","migrationVersion":"${migration}","customerRevision":"yoyoosun-customer-trial-133-package-v5.runtime-manifest-v1","release":"${release}","operationId":"${operationId}","adminAccounts":1,"demoAccounts":10,"revokedSessions":3,"authVersionIncremented":true,"auditSource":"manual_acceptance_password_rotation","phoneBound":true,"replayed":false,"accounts":[{"username":"admin","authVersion":2,"revokedSessions":1,"phoneBound":true},{"username":"demo_admin","authVersion":2,"revokedSessions":1,"phoneBound":false},{"username":"demo_boss","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"demo_engineering","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"demo_finance","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"demo_pmc","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"demo_production","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"demo_purchase","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"demo_quality","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"demo_sales","authVersion":2,"revokedSessions":0,"phoneBound":false},{"username":"demo_warehouse","authVersion":2,"revokedSessions":1,"phoneBound":false}]}
JSON
`,
  );
  return {
    root,
    bin,
    sshLog,
    report: path.join(root, "receipt.json"),
  };
}

function run(f, env = {}) {
  return spawnSync(
    "bash",
    [
      script,
      "--ssh-target",
      "simon@192.168.0.133",
      "--expected-release",
      release,
      "--expected-migration",
      migration,
      "--operation-id",
      operationId,
      "--backup-file",
      "/home/simon/plush-toy-erp-v5/backups/pre-rotation.dump",
      "--backup-sha256",
      backupSha,
      "--report",
      f.report,
      "--confirm",
      `ROTATE_YOYOOSUN_CREDENTIALS_133:${release}:${migration}:${operationId}`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        PATH: `${f.bin}:${process.env.PATH}`,
        FAKE_SSH_LOG: f.sshLog,
        ...env,
      },
    },
  );
}

test("133 credential rotation wrapper streams Keychain values and writes only a redacted receipt", (t) => {
  const f = fixture(t);
  const result = run(f);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(f.report, "utf8"));
  assert.equal(receipt.adminAccounts, 1);
  assert.equal(receipt.demoAccounts, 10);
  assert.equal(receipt.phoneBound, true);
  const observable = [
    result.stdout,
    result.stderr,
    fs.readFileSync(f.report, "utf8"),
    fs.readFileSync(f.sshLog, "utf8"),
  ].join("\n");
  assert.doesNotMatch(observable, /AdminSafe9x|DemoSafe8y|13800138000/u);
  assert.match(fs.readFileSync(f.sshLog, "utf8"), new RegExp(operationId, "u"));
});

test("133 credential rotation wrapper rejects the local public password before ssh", (t) => {
  const f = fixture(t);
  const result = run(f, { FAKE_DEMO_PASSWORD: "12345678" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /本地公开密码/u);
  assert.equal(fs.existsSync(f.sshLog), false);
  assert.equal(fs.existsSync(f.report), false);
});
