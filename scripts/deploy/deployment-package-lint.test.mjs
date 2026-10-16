import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  findForbiddenFiles,
  validateDeploymentPackage,
} from "./deployment-package-lint.mjs";

function copyDeploymentFixture(root, targetPackage) {
  fs.cpSync(path.join(process.cwd(), "deployments/yoyoosun"), targetPackage, {
    recursive: true,
  });
  for (const relativePath of [
    "server/deploy/compose/prod/compose.yml",
    ...[
      "collect-evidence.sh",
      "collect-evidence.mjs",
      "run-smoke.sh",
      "run-smoke-support.mjs",
      "run-backup-restore-rehearsal.sh",
      "verify-backup-restore.sh",
    ].map((name) => `scripts/deploy/${name}`),
  ]) {
    const destination = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(process.cwd(), relativePath), destination);
  }
}

test("yoyoosun deployment package passes lint", () => {
  const result = validateDeploymentPackage({ customer: "yoyoosun" });

  assert.equal(result.customer, "yoyoosun");
  assert(result.checkedFiles >= result.requiredFiles);
});

test("deployment package lint requires shared Compose and execution sources", async (t) => {
  for (const relativePath of [
    "server/deploy/compose/prod/compose.yml",
    "scripts/deploy/run-smoke-support.mjs",
    "scripts/deploy/collect-evidence.mjs",
    "scripts/deploy/run-backup-restore-rehearsal.sh",
  ]) {
    await t.test(relativePath, (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-shared-source-"));
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      copyDeploymentFixture(root, path.join(root, "deployments/yoyoosun"));
      fs.unlinkSync(path.join(root, relativePath));
      assert.throws(
        () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
        { message: `deployment package lint failed:\n- Missing shared deployment source: ${relativePath}` },
      );
    });
  }
});

test("deployment package lint rejects duplicated configuration and execution sources", async (t) => {
  for (const relativePath of [
    "compose/docker-compose.example.yml",
    "compose/docker-compose.override.example.yml",
    "env/server.config.example.yaml",
    "env/web.config.example.json",
    "scripts/run-smoke.sh",
    "scripts/collect-evidence.sh",
    "scripts/run-backup-restore-rehearsal.sh",
  ]) {
    await t.test(relativePath, (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-duplicate-source-"));
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const targetPackage = path.join(root, "deployments/yoyoosun");
      copyDeploymentFixture(root, targetPackage);
      const duplicate = path.join(targetPackage, relativePath);
      fs.mkdirSync(path.dirname(duplicate), { recursive: true });
      fs.writeFileSync(duplicate, "# duplicate deployment source\n");
      assert.throws(
        () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
        /must not duplicate shared deployment sources/,
      );
    });
  }
});

test("deployment package lint retains rollback decisions, execution and data recovery coverage", async (t) => {
  for (const heading of ["## 回滚检查", "## 代码回滚", "## 数据库与附件恢复"]) {
    await t.test(heading, (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-rollback-coverage-"));
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const targetPackage = path.join(root, "deployments/yoyoosun");
      copyDeploymentFixture(root, targetPackage);
      const runbook = path.join(targetPackage, "runbooks/03-rollback.md");
      fs.writeFileSync(runbook, fs.readFileSync(runbook, "utf8").replace(heading, "## 检查"));
      assert.throws(
        () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
        { message: `deployment package lint failed:\n- runbooks/03-rollback.md missing ${heading}` },
      );
    });
  }
});

test("deployment package lint retains inspection coverage after checklist consolidation", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-inspection-lint-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);
  const runbook = path.join(targetPackage, "runbooks/08-daily-ops.md");
  fs.writeFileSync(runbook, fs.readFileSync(runbook, "utf8").replace("## 每周", "## 检查"));
  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /runbooks\/08-daily-ops\.md missing ## 每周/,
  );
});

test("deployment package lint keeps the 100 MiB attachment upload envelope", (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-attachment-limit-lint-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const configPath = path.join(targetPackage, "compose/nginx.example.conf");
  const config = fs
    .readFileSync(configPath, "utf8")
    .replace("client_max_body_size 150m;", "client_max_body_size 20m;");
  fs.writeFileSync(configPath, config);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /must allow the 100 MiB attachment upload envelope/,
  );
});

test("deployment package lint keeps the temporary root redirect", (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-domain-lint-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const configPath = path.join(targetPackage, "compose/nginx.example.conf");
  const config = fs
    .readFileSync(configPath, "utf8")
    .replace(
      "return 302 https://erp.yoyoosun.net$request_uri;",
      "return 301 https://erp.yoyoosun.net$request_uri;",
    );
  fs.writeFileSync(configPath, config);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /root domain must temporarily redirect to erp with 302/,
  );
});

test("deployment package lint rejects restoring the retired admin route", (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-admin-lint-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const configPath = path.join(targetPackage, "compose/nginx.example.conf");
  fs.appendFileSync(
    configPath,
    "\nserver { listen 80; server_name admin.yoyoosun.net; }\n",
  );

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /must not restore the retired admin route/,
  );
});

test("deployment package lint rejects enabled business data clear", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-debug-clear-lint-"),
  );
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const envPath = path.join(targetPackage, "env/.env.example");
  const env = fs
    .readFileSync(envPath, "utf8")
    .replace(
      "ERP_DEBUG_BUSINESS_CLEAR_ENABLED=false",
      "ERP_DEBUG_BUSINESS_CLEAR_ENABLED=true",
    );
  fs.writeFileSync(envPath, env);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /env\/.env\.example must disable ERP_DEBUG_BUSINESS_CLEAR_ENABLED/,
  );
});

test("deployment package lint rejects runtime env files and raw customer files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-lint-"));
  fs.mkdirSync(path.join(root, "deployments/yoyoosun"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "deployments/yoyoosun/.env"),
    "APP_JWT_SECRET=real-secret\n",
  );
  fs.writeFileSync(path.join(root, "deployments/yoyoosun/customer.xlsx"), "");

  const forbidden = findForbiddenFiles(
    path.join(root, "deployments/yoyoosun"),
  ).sort();

  assert.deepEqual(forbidden, [".env", "customer.xlsx"]);
});

test("deployment package lint rejects release evidence template missing backup id", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-template-lint-"),
  );
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const templatePath = path.join(
    targetPackage,
    "evidence/releases/release-evidence-template.md",
  );
  const template = fs
    .readFileSync(templatePath, "utf8")
    .replace("| backupId |  |\n", "");
  fs.writeFileSync(templatePath, template);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /release evidence template basic info missing backupId/,
  );
});

test("deployment package lint rejects backup evidence template missing hash", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-backup-template-lint-"),
  );
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const templatePath = path.join(
    targetPackage,
    "evidence/backups/backup-evidence-template.md",
  );
  const template = fs
    .readFileSync(templatePath, "utf8")
    .replace("| databaseBackupHash |  |\n", "");
  fs.writeFileSync(templatePath, template);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /backup evidence template missing databaseBackupHash/,
  );
});

test("deployment package lint rejects migration evidence template missing pending files", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-migration-template-lint-"),
  );
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const templatePath = path.join(
    targetPackage,
    "evidence/migrations/migration-evidence-template.md",
  );
  const template = fs
    .readFileSync(templatePath, "utf8")
    .replace("| pendingFiles |  |\n", "")
    .replace("Pending Files: 待填写，发布后必须为 0\n", "");
  fs.writeFileSync(templatePath, template);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /migration evidence template missing pendingFiles/,
  );
});

test("deployment package lint rejects release signoff template missing conclusion", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-signoff-template-lint-"),
  );
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const templatePath = path.join(
    targetPackage,
    "evidence/releases/release-signoff-checklist-template.md",
  );
  const template = fs
    .readFileSync(templatePath, "utf8")
    .replace(
      "| releaseConclusion | 待填写，可选 `customer-trial-approved` / `internal-only` / `rollback-or-forward-fix` |\n",
      "",
    );
  fs.writeFileSync(templatePath, template);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /release signoff template missing releaseConclusion/,
  );
});

test("deployment package lint rejects rollback forward-fix template missing runbook", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-rollback-template-lint-"),
  );
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const templatePath = path.join(
    targetPackage,
    "evidence/releases/rollback-forward-fix-plan-template.md",
  );
  const template = fs
    .readFileSync(templatePath, "utf8")
    .replace(
      "| rollbackRunbook | `deployments/yoyoosun/runbooks/03-rollback.md` |\n",
      "",
    );
  fs.writeFileSync(templatePath, template);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /rollback forward-fix template missing rollbackRunbook/,
  );
});

test("deployment package lint rejects smoke report example summary mismatch", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-smoke-example-lint-"),
  );
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const examplePath = path.join(
    targetPackage,
    "evidence/smoke/smoke-test-report.example.json",
  );
  const report = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  report.summary.total = report.checks.length + 1;
  fs.writeFileSync(examplePath, `${JSON.stringify(report, null, 2)}\n`);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /smoke test report example summary\.total must match checks length/,
  );
});

test("deployment package lint rejects smoke report example URL target without httpCode", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-smoke-example-http-code-lint-"),
  );
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const examplePath = path.join(
    targetPackage,
    "evidence/smoke/smoke-test-report.example.json",
  );
  const report = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  delete report.checks[0].httpCode;
  fs.writeFileSync(examplePath, `${JSON.stringify(report, null, 2)}\n`);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /smoke test report example checks\[0\]\.httpCode must be a 100-599 HTTP status for URL targets/,
  );
});

test("deployment package lint rejects smoke report example without endpoint alias", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-smoke-example-endpoint-lint-"),
  );
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const examplePath = path.join(
    targetPackage,
    "evidence/smoke/smoke-test-report.example.json",
  );
  const report = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  delete report.endpointAlias;
  fs.writeFileSync(examplePath, `${JSON.stringify(report, null, 2)}\n`);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /smoke test report example missing endpointAlias/,
  );
});

test("deployment package lint rejects smoke report example credentialed URL", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "deploy-package-smoke-example-credential-lint-"),
  );
  const targetPackage = path.join(root, "deployments/yoyoosun");
  copyDeploymentFixture(root, targetPackage);

  const examplePath = path.join(
    targetPackage,
    "evidence/smoke/smoke-test-report.example.json",
  );
  const report = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  report.endpointAlias = "https://deploy:secret@erp.example.invalid";
  report.checks[0].target = "https://deploy:secret@erp.example.invalid/healthz";
  fs.writeFileSync(examplePath, `${JSON.stringify(report, null, 2)}\n`);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /smoke test report example endpointAlias must not contain URL credentials|smoke test report example checks\[0\]\.target must not contain URL credentials/,
  );
});
