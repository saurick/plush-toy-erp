#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";

import {
  createMigrationTerminalReceipt,
  redactMigrationDiagnostic,
} from "./local-migration.mjs";
import { createDevDatabaseMigrationService } from "../web/dev-server/devDatabaseMigrationPlugin.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 250;
const PREPARE_COMPLETE_STATUSES = new Set([
  "ready",
  "passed",
  "failed",
  "blocked",
  "not_proven",
]);
const EXECUTE_COMPLETE_STATUSES = new Set([
  "passed",
  "failed",
  "blocked",
  "not_proven",
]);

class LocalMigrationWorkflowError extends Error {
  constructor(message, receipt = {}) {
    super(message);
    this.receipt = receipt;
  }
}

class LocalMigrationActionRequired extends LocalMigrationWorkflowError {
  constructor(message, receipt = {}) {
    super(message, {
      phase: "entry",
      result: "action_required",
      writes: "0",
      apply: "not_started",
      errorCode: "operator_confirmation_required",
      nextAction: "run_make_migrate_prepare",
      ...receipt,
    });
  }
}

const WORKFLOW_MODES = new Set(["run", "prepare", "resume", "execute"]);

export function migrationWorkflowExitCode(error) {
  return error instanceof LocalMigrationActionRequired ? 2 : 1;
}

function nonInteractiveRunError() {
  return new LocalMigrationActionRequired(
    "非交互环境不会代替操作者确认共享开发库写入；请先运行 make migrate_prepare，再按 ready 输出运行 make migrate_execute",
  );
}

function nonInteractiveResumeError() {
  return new LocalMigrationActionRequired(
    "非交互环境不能裸执行 make migrate_apply；请先运行 make migrate_prepare，再按 ready 输出运行 make migrate_execute",
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function writeLine(output, value) {
  output.write(`${value}\n`);
}

function operationIssueMessage(operation) {
  const issues = Array.isArray(operation?.issues)
    ? operation.issues.map((issue) => issue?.message).filter(Boolean)
    : [];
  return [operation?.message, ...issues].filter(Boolean).join("；");
}

function operationIssueCode(operation) {
  return (
    (Array.isArray(operation?.issues) && operation.issues[0]?.code) ||
    `operation_${operation?.status || "failed"}`
  );
}

function nextActionForIssue(code, fallback = "review_error_and_retry") {
  if (code === "database_clients_active") {
    return "close_database_clients_and_retry";
  }
  if (
    [
      "backup_restore_failed",
      "database_state_changed",
      "migration_source_changed",
    ].includes(code)
  ) {
    return "run_make_migrate_prepare";
  }
  if (code === "migration_tool_unavailable") {
    return "install_required_migration_tools";
  }
  if (code === "migration_status_unavailable") {
    return "check_database_connection";
  }
  if (
    ["migration_outcome_unknown", "migration_readback_failed"].includes(code)
  ) {
    return "run_status_no_auto_retry";
  }
  return fallback;
}

function operationFailureReceipt(operation, stage) {
  const code = operationIssueCode(operation);
  if (operation?.status === "not_proven") {
    return {
      phase: "apply",
      result: "not_proven",
      writes: "unknown",
      apply: "attempted_once",
      errorCode: code,
      nextAction: "run_status_no_auto_retry",
    };
  }
  if (stage === "execute") {
    if (operation?.readback?.migrationVerified === true) {
      return {
        phase: "runtime_restart",
        result: "failed",
        writes: "committed",
        apply: "executed_once",
        errorCode: code,
        nextAction: "run_make_dev_restart",
      };
    }
    const stoppedBeforeApply = [
      "backup_restore_failed",
      "database_clients_active",
      "database_state_changed",
      "migration_source_changed",
      "migration_tool_unavailable",
    ].includes(code);
    return {
      phase: stoppedBeforeApply ? "preflight" : "apply",
      result: operation?.status === "blocked" ? "blocked" : "failed",
      writes: stoppedBeforeApply ? "0" : "unknown",
      apply: stoppedBeforeApply ? "not_started" : "attempted_once",
      errorCode: code,
      nextAction: nextActionForIssue(code),
    };
  }
  return {
    phase: "preflight",
    result: operation?.status === "blocked" ? "blocked" : "failed",
    writes: "0",
    apply: "not_started",
    errorCode: code,
    nextAction: nextActionForIssue(code),
  };
}

function assertSuccessfulOperation(operation, stage) {
  if (operation?.status === "passed") return operation;
  throw new LocalMigrationWorkflowError(
    operationIssueMessage(operation) || "数据库迁移操作未完成",
    operationFailureReceipt(operation, stage),
  );
}

function assertSharedDevelopmentSummary(summary) {
  if (summary?.status !== "success") {
    const code =
      (Array.isArray(summary?.issues) && summary.issues[0]?.code) ||
      "migration_status_unavailable";
    throw new LocalMigrationWorkflowError(
      Array.isArray(summary?.issues) && summary.issues.length > 0
        ? summary.issues.map((issue) => issue.message).join("；")
        : "共享开发库 migration 状态不可用",
      {
        phase: "status",
        result: "blocked",
        writes: "0",
        apply: "not_started",
        errorCode: code,
        nextAction: nextActionForIssue(code),
      },
    );
  }
  if (
    summary?.target?.key !== "shared-dev" ||
    !Number.isSafeInteger(summary.target.pendingFiles)
  ) {
    throw new LocalMigrationWorkflowError(
      "make migrate 只允许项目登记的共享开发库；隔离库与目标环境继续使用各自专项入口",
      {
        phase: "target_identity",
        result: "blocked",
        writes: "0",
        apply: "not_started",
        errorCode: "untrusted_database_target",
        nextAction: "use_target_specific_migration_flow",
      },
    );
  }
  return summary;
}

export function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export async function waitForMigrationOperation(
  service,
  operationId,
  {
    completeStatuses,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = POLL_INTERVAL_MS,
    wait = sleep,
  } = {},
) {
  const statuses =
    completeStatuses instanceof Set
      ? completeStatuses
      : EXECUTE_COMPLETE_STATUSES;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const operation = service.readOperation(operationId);
    if (statuses.has(operation.status)) return operation;
    await wait(pollIntervalMs);
  }
  throw new LocalMigrationWorkflowError(
    `数据库迁移操作等待超时（operation=${operationId}）`,
  );
}

function printReadyOperation(output, operation) {
  writeLine(
    output,
    `[migration-workflow] state=ready action_required=confirmation operation=${operation.id}`,
  );
  writeLine(
    output,
    `[migration-workflow] target=${operation.target?.safeTarget || "unavailable"}`,
  );
  writeLine(
    output,
    `[migration-workflow] current=${operation.target?.currentVersion || "none"} latest=${operation.target?.latestVersion || "none"} pending=${operation.target?.pendingFiles ?? "unknown"}`,
  );
  writeLine(
    output,
    `[migration-workflow] backup=${operation.backup?.id || "unavailable"} restore_verified=${operation.backup?.restoreVerified === true}`,
  );
  writeLine(
    output,
    "[migration-workflow] 准备阶段已完成且 writes=0；尚未执行 apply。",
  );
}

function printNonInteractiveContinuation(output, operation) {
  writeLine(
    output,
    "[migration-workflow] 显式准备已正常停在确认点；执行下列命令才会写入共享开发库：",
  );
  writeLine(
    output,
    [
      `MIGRATE_OPERATION_ID=${shellSingleQuote(operation.id)} \\`,
      `MIGRATE_OPERATION_CONFIRM=${shellSingleQuote(operation.confirmationPrompt)} \\`,
      "make migrate_execute",
    ].join("\n"),
  );
}

function operationMatchesTarget(operation, target) {
  return (
    operation?.status === "ready" &&
    operation?.target?.key === target.key &&
    operation.target.currentVersion === target.currentVersion &&
    operation.target.latestVersion === target.latestVersion &&
    operation.target.pendingFiles === target.pendingFiles
  );
}

function receiptStatusForOperation(operation) {
  const target = operation?.target || {};
  const readback = operation?.readback || {};
  const availableFiles = readback.availableFiles ?? target.availableFiles;
  const pendingFiles = readback.pendingFiles ?? target.pendingFiles;
  return {
    currentVersion: readback.currentVersion ?? target.currentVersion,
    latestVersion: readback.latestVersion ?? target.latestVersion,
    availableFiles,
    appliedFiles:
      readback.appliedFiles ??
      (pendingFiles === 0 && Number.isSafeInteger(availableFiles)
        ? availableFiles
        : target.appliedFiles),
    pendingFiles,
  };
}

function updateReceiptFromOperation(receipt, operation, phase) {
  receipt.update({
    phase,
    target: operation?.target,
    status: receiptStatusForOperation(operation),
    operation: operation?.id,
    runtime: operation?.readback?.runtime,
  });
}

function workflowFailureReceipt(error, receipt) {
  if (error?.receipt && Object.keys(error.receipt).length > 0) {
    return error.receipt;
  }
  const defaults = {
    entry: ["failed", "migration_workflow_failed", "review_error_and_retry"],
    status: [
      "blocked",
      "migration_status_unavailable",
      "check_database_connection",
    ],
    confirmation: [
      "action_required",
      "confirmation_required",
      "enter_exact_confirmation",
    ],
    prepare: [
      "blocked",
      "migration_prepare_failed",
      "run_make_migrate_prepare",
    ],
    preflight: [
      "blocked",
      "migration_preflight_failed",
      "resolve_preflight_blockers",
    ],
    apply: [
      "not_proven",
      "migration_outcome_unknown",
      "run_status_no_auto_retry",
    ],
    runtime_restart: [
      "failed",
      "runtime_restart_failed",
      "run_make_dev_restart",
    ],
  };
  const [result, errorCode, nextAction] =
    defaults[receipt.phase] || defaults.entry;
  return { result, errorCode, nextAction };
}

function resumableReadyOperation(summary) {
  const matches = Array.isArray(summary?.operations)
    ? summary.operations.filter((operation) =>
        operationMatchesTarget(operation, summary.target),
      )
    : [];
  return matches.length === 1 ? matches[0] : null;
}

async function executeReadyOperation({
  service,
  operation,
  confirmation,
  output,
  receipt,
  waitOptions,
}) {
  updateReceiptFromOperation(receipt, operation, "confirmation");
  const accepted = await service.act({
    action: "execute",
    operationId: operation.id,
    confirmation,
  });
  writeLine(
    output,
    `[migration-workflow] state=${accepted.operation.status} operation=${operation.id}`,
  );
  receipt.update({
    phase: "apply",
    writes: "unknown",
    apply: "attempted_once",
  });
  const completed = await waitForMigrationOperation(service, operation.id, {
    completeStatuses: EXECUTE_COMPLETE_STATUSES,
    ...waitOptions,
  });
  updateReceiptFromOperation(receipt, completed, "runtime_readback");
  assertSuccessfulOperation(completed, "execute");
  writeLine(
    output,
    `[migration-workflow] applied_verified current=${completed.readback?.currentVersion || "unknown"} pending=${completed.readback?.pendingFiles ?? "unknown"}`,
  );
  writeLine(
    output,
    `[migration-workflow] runtime health=${completed.readback?.runtime?.health?.status || "unknown"} ready=${completed.readback?.runtime?.ready?.status || "unknown"}`,
  );
  receipt.finish({
    phase: "runtime_readback",
    result: "passed",
    writes: "committed",
    apply: "executed_once",
    nextAction: "none",
  });
  return completed;
}

export async function runLocalMigrationWorkflow({
  service,
  mode = "run",
  environment = process.env,
  interactive = false,
  askConfirmation,
  output = process.stdout,
  terminalReceipt,
  waitOptions,
} = {}) {
  const commandByMode = {
    run: "migrate",
    prepare: "migrate_prepare",
    resume: "migrate_apply",
    execute: "migrate_execute",
  };
  const receipt =
    terminalReceipt ||
    createMigrationTerminalReceipt({
      command: commandByMode[mode] || "migration_workflow",
      mode,
      output,
    });
  try {
    if (!WORKFLOW_MODES.has(mode)) {
      throw new LocalMigrationWorkflowError(
        `unsupported local migration workflow mode: ${mode}`,
      );
    }
    if (mode === "run" && !interactive) {
      throw nonInteractiveRunError();
    }
    if (mode === "resume" && !interactive) {
      throw nonInteractiveResumeError();
    }
    if (!service) {
      throw new LocalMigrationWorkflowError(
        "database migration service is required",
      );
    }
    const operationId = String(
      environment.LOCAL_MIGRATION_OPERATION_ID || "",
    ).trim();
    const operationConfirmation = String(
      environment.LOCAL_MIGRATION_OPERATION_CONFIRM || "",
    ).trim();
    if (Boolean(operationId) !== Boolean(operationConfirmation)) {
      throw new LocalMigrationActionRequired(
        "MIGRATE_OPERATION_ID 与 MIGRATE_OPERATION_CONFIRM 必须来自同一次 ready 输出并同时提供",
        {
          errorCode: "operation_identity_incomplete",
          nextAction: "run_make_migrate_prepare",
        },
      );
    }

    if (mode === "execute" && !operationId) {
      throw new LocalMigrationActionRequired(
        "make migrate_execute 需要同一次 make migrate_prepare 输出的 MIGRATE_OPERATION_ID 与 MIGRATE_OPERATION_CONFIRM",
      );
    }
    if (mode !== "execute" && operationId) {
      throw new LocalMigrationWorkflowError(
        "只有 make migrate_execute 接受 MIGRATE_OPERATION_ID 与 MIGRATE_OPERATION_CONFIRM",
      );
    }

    if (mode === "execute") {
      const operation = service.readOperation(operationId);
      updateReceiptFromOperation(receipt, operation, "confirmation");
      if (operation.status !== "ready") {
        if (operation.status === "passed") {
          writeLine(
            output,
            `[migration-workflow] already_applied operation=${operation.id} pending=${operation.readback?.pendingFiles ?? "unknown"}`,
          );
          receipt.finish({
            phase: "runtime_readback",
            result: "already_applied",
            writes: "0",
            apply: "already_executed",
            nextAction: "none",
          });
          return operation;
        }
        assertSuccessfulOperation(operation, "execute");
      }
      const completed = await executeReadyOperation({
        service,
        operation,
        confirmation: operationConfirmation,
        output,
        receipt,
        waitOptions,
      });
      return completed;
    }

    receipt.update({ phase: "status" });
    const summary = await service.summary();
    receipt.update({
      target: summary?.target,
      status: summary?.target,
      runtime: summary?.runtime,
    });
    assertSharedDevelopmentSummary(summary);
    if (summary.target.pendingFiles === 0) {
      writeLine(
        output,
        `[migration-workflow] verified current=${summary.target.currentVersion || "none"} latest=${summary.target.latestVersion || "none"} pending=0`,
      );
      if (summary.runtime?.available !== true) {
        writeLine(
          output,
          "[migration-workflow] 数据库已是最新版本；本地后端未 ready 时请运行 make dev_restart。",
        );
      }
      receipt.finish({
        phase: "status_readback",
        result: "up_to_date",
        writes: "0",
        apply: "skipped",
        nextAction:
          summary.runtime?.available === true ? "none" : "run_make_dev_restart",
      });
      return { status: "passed", readback: { pendingFiles: 0 } };
    }

    receipt.update({ phase: "prepare" });
    let prepared = mode === "resume" ? resumableReadyOperation(summary) : null;
    if (prepared) {
      writeLine(
        output,
        `[migration-workflow] resuming_ready operation=${prepared.id}`,
      );
    } else {
      writeLine(
        output,
        `[migration-workflow] preparing current=${summary.target.currentVersion || "none"} latest=${summary.target.latestVersion || "none"} pending=${summary.target.pendingFiles}`,
      );
      const preparedResult = await service.act({
        action: "prepare",
        idempotencyKey: `database-migration:prepare:${randomUUID()}`,
      });
      receipt.update({ operation: preparedResult.operation.id });
      prepared = await waitForMigrationOperation(
        service,
        preparedResult.operation.id,
        {
          completeStatuses: PREPARE_COMPLETE_STATUSES,
          ...waitOptions,
        },
      );
      if (prepared.status !== "ready") {
        updateReceiptFromOperation(receipt, prepared, "preflight");
        assertSuccessfulOperation(prepared, "prepare");
      }
    }
    updateReceiptFromOperation(receipt, prepared, "ready");
    printReadyOperation(output, prepared);

    if (mode === "prepare") {
      printNonInteractiveContinuation(output, prepared);
      receipt.finish({
        phase: "ready",
        result: "ready",
        writes: "0",
        apply: "not_started",
        nextAction: "run_make_migrate_execute",
      });
      return prepared;
    }
    if (typeof askConfirmation !== "function") {
      throw new LocalMigrationWorkflowError(
        "交互模式缺少确认输入器；未执行 apply",
        {
          phase: "confirmation",
          result: "blocked",
          writes: "0",
          apply: "not_started",
          errorCode: "confirmation_reader_unavailable",
          nextAction: "use_interactive_terminal",
        },
      );
    }
    receipt.update({ phase: "confirmation" });
    writeLine(output, "[migration-workflow] 请完整输入以下确认文本：");
    writeLine(output, prepared.confirmationPrompt);
    const supplied = String(await askConfirmation()).trim();
    if (supplied !== prepared.confirmationPrompt) {
      writeLine(
        output,
        `[migration-workflow] state=ready action_required=confirmation operation=${prepared.id}`,
      );
      writeLine(
        output,
        "[migration-workflow] 确认未匹配，已取消；未执行 apply。",
      );
      throw new LocalMigrationActionRequired(
        "确认未匹配；操作仍停在 ready，未执行共享开发库写入",
        {
          phase: "confirmation",
          errorCode: "confirmation_mismatch",
          nextAction: "enter_exact_confirmation",
        },
      );
    }
    const completed = await executeReadyOperation({
      service,
      operation: prepared,
      confirmation: supplied,
      output,
      receipt,
      waitOptions,
    });
    return completed;
  } catch (error) {
    receipt.finish(workflowFailureReceipt(error, receipt));
    throw error;
  }
}

async function main() {
  const mode = process.env.LOCAL_MIGRATION_WORKFLOW_MODE || "run";
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const commandByMode = {
    run: "migrate",
    prepare: "migrate_prepare",
    resume: "migrate_apply",
    execute: "migrate_execute",
  };
  const receipt = createMigrationTerminalReceipt({
    command: commandByMode[mode] || "migration_workflow",
    mode,
  });
  let terminal;
  try {
    if (mode === "run" && !interactive) throw nonInteractiveRunError();
    if (mode === "resume" && !interactive) throw nonInteractiveResumeError();
    const service = createDevDatabaseMigrationService({
      projectRoot: repoRoot,
    });
    await runLocalMigrationWorkflow({
      service,
      mode,
      environment: process.env,
      interactive,
      askConfirmation: interactive
        ? async () => {
            terminal ||= readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            return terminal.question("确认文本> ");
          }
        : undefined,
      terminalReceipt: receipt,
    });
  } catch (error) {
    receipt.finish(workflowFailureReceipt(error, receipt));
    throw error;
  } finally {
    terminal?.close();
  }
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  main().catch((error) => {
    const exitCode = migrationWorkflowExitCode(error);
    const label = exitCode === 2 ? "ACTION_REQUIRED" : "ERROR";
    process.stderr.write(
      `[migration-workflow] ${label}: ${redactMigrationDiagnostic(error.message)}\n`,
    );
    process.exitCode = exitCode;
  });
}
