import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findForbiddenFiles, validateDeploymentPackage } from "./deployment-package-lint.mjs";

test("yoyoosun deployment package passes lint", () => {
  const result = validateDeploymentPackage({ customer: "yoyoosun" });

  assert.equal(result.customer, "yoyoosun");
  assert(result.requiredFiles > 30);
  assert(result.checkedFiles >= result.requiredFiles);
});

test("deployment package lint rejects runtime env files and raw customer files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-lint-"));
  fs.mkdirSync(path.join(root, "deployments/yoyoosun"), { recursive: true });
  fs.writeFileSync(path.join(root, "deployments/yoyoosun/.env"), "APP_JWT_SECRET=real-secret\n");
  fs.writeFileSync(path.join(root, "deployments/yoyoosun/customer.xlsx"), "");

  const forbidden = findForbiddenFiles(path.join(root, "deployments/yoyoosun")).sort();

  assert.deepEqual(forbidden, [".env", "customer.xlsx"]);
});

test("deployment package lint rejects release evidence template missing backup id", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-template-lint-"));
  const sourcePackage = path.join(process.cwd(), "deployments/yoyoosun");
  const targetPackage = path.join(root, "deployments/yoyoosun");
  fs.cpSync(sourcePackage, targetPackage, { recursive: true });

  const templatePath = path.join(targetPackage, "evidence/releases/release-evidence-template.md");
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-backup-template-lint-"));
  const sourcePackage = path.join(process.cwd(), "deployments/yoyoosun");
  const targetPackage = path.join(root, "deployments/yoyoosun");
  fs.cpSync(sourcePackage, targetPackage, { recursive: true });

  const templatePath = path.join(targetPackage, "evidence/backups/backup-evidence-template.md");
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-migration-template-lint-"));
  const sourcePackage = path.join(process.cwd(), "deployments/yoyoosun");
  const targetPackage = path.join(root, "deployments/yoyoosun");
  fs.cpSync(sourcePackage, targetPackage, { recursive: true });

  const templatePath = path.join(targetPackage, "evidence/migrations/migration-evidence-template.md");
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-signoff-template-lint-"));
  const sourcePackage = path.join(process.cwd(), "deployments/yoyoosun");
  const targetPackage = path.join(root, "deployments/yoyoosun");
  fs.cpSync(sourcePackage, targetPackage, { recursive: true });

  const templatePath = path.join(targetPackage, "evidence/releases/release-signoff-checklist-template.md");
  const template = fs
    .readFileSync(templatePath, "utf8")
    .replace("| releaseConclusion | 待填写，可选 `customer-trial-approved` / `internal-only` / `rollback-or-forward-fix` |\n", "");
  fs.writeFileSync(templatePath, template);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /release signoff template missing releaseConclusion/,
  );
});

test("deployment package lint rejects rollback forward-fix template missing runbook", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-rollback-template-lint-"));
  const sourcePackage = path.join(process.cwd(), "deployments/yoyoosun");
  const targetPackage = path.join(root, "deployments/yoyoosun");
  fs.cpSync(sourcePackage, targetPackage, { recursive: true });

  const templatePath = path.join(targetPackage, "evidence/releases/rollback-forward-fix-plan-template.md");
  const template = fs
    .readFileSync(templatePath, "utf8")
    .replace("| rollbackRunbook | `deployments/yoyoosun/runbooks/03-rollback.md` |\n", "");
  fs.writeFileSync(templatePath, template);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /rollback forward-fix template missing rollbackRunbook/,
  );
});

test("deployment package lint rejects smoke report example summary mismatch", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-smoke-example-lint-"));
  const sourcePackage = path.join(process.cwd(), "deployments/yoyoosun");
  const targetPackage = path.join(root, "deployments/yoyoosun");
  fs.cpSync(sourcePackage, targetPackage, { recursive: true });

  const examplePath = path.join(targetPackage, "evidence/smoke/smoke-test-report.example.json");
  const report = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  report.summary.total = report.checks.length + 1;
  fs.writeFileSync(examplePath, `${JSON.stringify(report, null, 2)}\n`);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /smoke test report example summary\.total must match checks length/,
  );
});

test("deployment package lint rejects smoke report example URL target without httpCode", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-smoke-example-http-code-lint-"));
  const sourcePackage = path.join(process.cwd(), "deployments/yoyoosun");
  const targetPackage = path.join(root, "deployments/yoyoosun");
  fs.cpSync(sourcePackage, targetPackage, { recursive: true });

  const examplePath = path.join(targetPackage, "evidence/smoke/smoke-test-report.example.json");
  const report = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  delete report.checks[0].httpCode;
  fs.writeFileSync(examplePath, `${JSON.stringify(report, null, 2)}\n`);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /smoke test report example checks\[0\]\.httpCode must be a 100-599 HTTP status for URL targets/,
  );
});

test("deployment package lint rejects smoke report example without endpoint alias", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-smoke-example-endpoint-lint-"));
  const sourcePackage = path.join(process.cwd(), "deployments/yoyoosun");
  const targetPackage = path.join(root, "deployments/yoyoosun");
  fs.cpSync(sourcePackage, targetPackage, { recursive: true });

  const examplePath = path.join(targetPackage, "evidence/smoke/smoke-test-report.example.json");
  const report = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  delete report.endpointAlias;
  fs.writeFileSync(examplePath, `${JSON.stringify(report, null, 2)}\n`);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /smoke test report example missing endpointAlias/,
  );
});

test("deployment package lint rejects smoke report example credentialed URL", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-smoke-example-credential-lint-"));
  const sourcePackage = path.join(process.cwd(), "deployments/yoyoosun");
  const targetPackage = path.join(root, "deployments/yoyoosun");
  fs.cpSync(sourcePackage, targetPackage, { recursive: true });

  const examplePath = path.join(targetPackage, "evidence/smoke/smoke-test-report.example.json");
  const report = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  report.endpointAlias = "https://deploy:secret@erp.example.invalid";
  report.checks[0].target = "https://deploy:secret@erp.example.invalid/healthz";
  fs.writeFileSync(examplePath, `${JSON.stringify(report, null, 2)}\n`);

  assert.throws(
    () => validateDeploymentPackage({ repoRoot: root, customer: "yoyoosun" }),
    /smoke test report example endpointAlias must not contain URL credentials|smoke test report example checks\[0\]\.target must not contain URL credentials/,
  );
});
