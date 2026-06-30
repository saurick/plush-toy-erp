import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const erpSourceRoot = path.join(repoRoot, "web/src/erp");

const sourceExtensions = new Set([".js", ".jsx", ".mjs"]);
const skippedRelativePaths = new Set(["web/src/erp/api/workflowApi.mjs"]);
const skippedSuffixes = [".test.js", ".test.jsx", ".test.mjs"];

const forbiddenWorkflowUiContracts = [
  {
    token: "createWorkflowTask",
    reason:
      "普通 UI 不应直接创建协同任务；任务派生应由后端 WorkflowUsecase 或受控修复入口处理",
  },
  {
    token: "updateWorkflowTaskStatus",
    reason:
      "正式任务动作应走 complete/block/reject action 合同，旧 update_task_status 只保留兼容",
  },
  {
    token: "upsertWorkflowBusinessState",
    reason:
      "普通 UI 不应直接写协同业务状态；业务状态投影应由后端 WorkflowUsecase 维护",
  },
  {
    token: "'create_task'",
    reason: "普通 UI 不应绕过 workflow API wrapper 直接调用 create_task",
  },
  {
    token: '"create_task"',
    reason: "普通 UI 不应绕过 workflow API wrapper 直接调用 create_task",
  },
  {
    token: "'update_task_status'",
    reason: "普通 UI 不应绕过 action 合同直接调用 update_task_status",
  },
  {
    token: '"update_task_status"',
    reason: "普通 UI 不应绕过 action 合同直接调用 update_task_status",
  },
  {
    token: "'upsert_business_state'",
    reason: "普通 UI 不应绕过后端规则直接调用 upsert_business_state",
  },
  {
    token: '"upsert_business_state"',
    reason: "普通 UI 不应绕过后端规则直接调用 upsert_business_state",
  },
];

function toRelative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function shouldCheck(filePath) {
  const relativePath = toRelative(filePath);
  if (skippedRelativePaths.has(relativePath)) return false;
  if (skippedSuffixes.some((suffix) => relativePath.endsWith(suffix))) {
    return false;
  }
  return sourceExtensions.has(path.extname(filePath));
}

function collectSourceFiles(dirPath) {
  const entries = readdirSync(dirPath);
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }
    if (stat.isFile() && shouldCheck(entryPath)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

test("workflow UI action boundary: runtime UI uses action contracts only", () => {
  const sourceFiles = collectSourceFiles(erpSourceRoot);
  assert(sourceFiles.length > 0, "expected ERP runtime source files");

  for (const filePath of sourceFiles) {
    const relativePath = toRelative(filePath);
    const source = readFileSync(filePath, "utf8");
    for (const forbidden of forbiddenWorkflowUiContracts) {
      assert(
        !source.includes(forbidden.token),
        `${relativePath} must not contain ${forbidden.token}: ${forbidden.reason}`,
      );
    }
  }
});
