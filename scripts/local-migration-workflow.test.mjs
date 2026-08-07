import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  migrationWorkflowExitCode,
  runLocalMigrationWorkflow,
  shellSingleQuote,
} from "./local-migration-workflow.mjs";

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const CONFIRMATION =
  "升级共享开发库:20260731124000:11111111-1111-4111-8111-111111111111";
const cliPath = fileURLToPath(
  new URL("./local-migration-workflow.mjs", import.meta.url),
);

function outputBuffer() {
  let value = "";
  return {
    output: { write: (chunk) => (value += String(chunk)) },
    read: () => value,
  };
}

function target(pendingFiles = 2) {
  return {
    key: "shared-dev",
    safeTarget: "host=192.168.0.106 port=5432 database=plush_erp",
    currentVersion: pendingFiles === 0 ? "20260731124000" : "20260729043852",
    latestVersion: "20260731124000",
    appliedFiles: pendingFiles === 0 ? 107 : 105,
    availableFiles: 107,
    pendingFiles,
  };
}

function readyOperation() {
  return {
    id: OPERATION_ID,
    status: "ready",
    message: "升级计划、真实备份和隔离恢复验证已完成",
    target: target(),
    backup: { id: "br-yoyoosun-test", restoreVerified: true },
    confirmationPrompt: CONFIRMATION,
    issues: [],
    readback: null,
  };
}

function passedOperation() {
  return {
    ...readyOperation(),
    status: "passed",
    message: "数据库升级、读回和本地后端重启均已完成",
    confirmationPrompt: null,
    readback: {
      currentVersion: "20260731124000",
      latestVersion: "20260731124000",
      pendingFiles: 0,
      runtime: {
        health: { status: "passed" },
        ready: { status: "passed" },
      },
    },
  };
}

function createService({
  pendingFiles = 2,
  blocked = false,
  executeStatus = "passed",
  startingOperation = null,
  readyOperations = [],
} = {}) {
  const calls = [];
  let operation = startingOperation;
  return {
    calls,
    async summary() {
      calls.push("summary");
      return {
        status: "success",
        target: target(pendingFiles),
        runtime: {
          available: true,
          health: { status: "passed" },
          ready: { status: "passed" },
        },
        operations: readyOperations,
        issues: [],
      };
    },
    async act(action) {
      calls.push(action.action);
      if (action.action === "prepare") {
        if (blocked) {
          operation = {
            ...readyOperation(),
            status: "blocked",
            message: "操作被安全停止",
            issues: [
              {
                code: "database_clients_active",
                severity: "blocked",
                message: "共享开发库仍有其它连接",
              },
            ],
          };
        } else {
          operation = readyOperation();
        }
        return {
          accepted: true,
          operation: { ...operation, status: "preparing" },
        };
      }
      assert.equal(action.operationId, OPERATION_ID);
      assert.equal(action.confirmation, CONFIRMATION);
      operation =
        executeStatus === "passed"
          ? passedOperation()
          : {
              ...readyOperation(),
              status: executeStatus,
              message:
                executeStatus === "not_proven"
                  ? "操作结果尚未证明，已停止自动处理"
                  : "操作被安全停止",
              confirmationPrompt: null,
              issues: [
                {
                  code:
                    executeStatus === "not_proven"
                      ? "migration_outcome_unknown"
                      : "database_state_changed",
                  severity: "blocked",
                  message:
                    executeStatus === "not_proven"
                      ? "数据库提交结果无法证明"
                      : "数据库状态在执行前发生变化",
                },
              ],
            };
      return {
        accepted: true,
        operation: { ...operation, status: "applying", issues: [] },
      };
    },
    readOperation(operationId) {
      calls.push("read");
      assert.equal(operationId, OPERATION_ID);
      return operation || readyOperation();
    },
  };
}

const waitOptions = Object.freeze({ wait: async () => {}, pollIntervalMs: 0 });

function receiptLines(output) {
  const lines = String(output)
    .split("\n")
    .filter((line) => line.startsWith("[migration-summary]"));
  assert.equal(lines.length, 7, `incomplete migration receipt:\n${output}`);
  return lines.join("\n");
}

test("local migration workflow: bare non-interactive run requires an explicit phase without side effects", async () => {
  const service = createService();
  const buffer = outputBuffer();
  let actualError;
  await assert.rejects(
    runLocalMigrationWorkflow({
      service,
      environment: {},
      interactive: false,
      output: buffer.output,
      waitOptions,
    }),
    (error) => {
      actualError = error;
      return /make migrate_prepare/u.test(error.message);
    },
  );
  assert.equal(migrationWorkflowExitCode(actualError), 2);
  assert.deepEqual(service.calls, []);
  const receipt = receiptLines(buffer.read());
  assert.match(receipt, /command=migrate mode=run phase=entry/u);
  assert.match(receipt, /target=unavailable/u);
  assert.match(
    receipt,
    /result=action_required writes=0 apply=not_started auto_retry=false/u,
  );
  assert.match(receipt, /next_action=run_make_migrate_prepare/u);
});

test("local migration workflow: direct bare non-interactive CLI exits 2 before service construction", () => {
  const environment = {
    ...process.env,
    LOCAL_MIGRATION_WORKFLOW_MODE: "run",
  };
  delete environment.LOCAL_MIGRATION_OPERATION_ID;
  delete environment.LOCAL_MIGRATION_OPERATION_CONFIRM;
  const result = spawnSync(process.execPath, [cliPath], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(result.status, 2);
  const receipt = receiptLines(result.stdout);
  assert.match(receipt, /command=migrate mode=run phase=entry/u);
  assert.match(receipt, /target=unavailable/u);
  assert.match(receipt, /result=action_required writes=0 apply=not_started/u);
  assert.match(result.stderr, /ACTION_REQUIRED:.*make migrate_prepare/u);
});

test("local migration workflow: bare non-interactive compatibility apply exits 2 before service construction", () => {
  const environment = {
    ...process.env,
    LOCAL_MIGRATION_WORKFLOW_MODE: "resume",
  };
  delete environment.LOCAL_MIGRATION_OPERATION_ID;
  delete environment.LOCAL_MIGRATION_OPERATION_CONFIRM;
  const result = spawnSync(process.execPath, [cliPath], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(result.status, 2);
  const receipt = receiptLines(result.stdout);
  assert.match(receipt, /command=migrate_apply mode=resume phase=entry/u);
  assert.match(receipt, /target=unavailable/u);
  assert.match(receipt, /result=action_required writes=0 apply=not_started/u);
  assert.match(result.stderr, /ACTION_REQUIRED:.*make migrate_prepare/u);
});

test("local migration workflow: explicit non-interactive prepare exits ready without an expected error", async () => {
  const service = createService();
  const buffer = outputBuffer();
  const result = await runLocalMigrationWorkflow({
    service,
    mode: "prepare",
    environment: {},
    interactive: false,
    output: buffer.output,
    waitOptions,
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(
    service.calls.filter((call) => call === "execute"),
    [],
  );
  assert.match(buffer.read(), /state=ready action_required=confirmation/u);
  assert.match(buffer.read(), /准备阶段已完成且 writes=0/u);
  assert.match(buffer.read(), /MIGRATE_OPERATION_ID=.*make migrate_execute/su);
  assert.doesNotMatch(buffer.read(), /ERROR/u);
  const receipt = receiptLines(buffer.read());
  assert.match(receipt, /command=migrate_prepare mode=prepare phase=ready/u);
  assert.match(
    receipt,
    /target=shared-dev host=192\.168\.0\.106 port=5432 database=plush_erp/u,
  );
  assert.match(
    receipt,
    /current=20260729043852 latest=20260731124000 applied=105\/107 pending=2/u,
  );
  assert.match(receipt, /result=ready writes=0 apply=not_started/u);
  assert.match(receipt, new RegExp(`operation=${OPERATION_ID}`, "u"));
  assert.match(receipt, /next_action=run_make_migrate_execute/u);
  assert.doesNotMatch(receipt, /升级共享开发库|MIGRATE_OPERATION_CONFIRM/u);
});

test("local migration workflow: interactive confirmation applies once and reports readback", async () => {
  const service = createService();
  const buffer = outputBuffer();
  const result = await runLocalMigrationWorkflow({
    service,
    environment: {},
    interactive: true,
    askConfirmation: async () => CONFIRMATION,
    output: buffer.output,
    waitOptions,
  });
  assert.equal(result.status, "passed");
  assert.equal(service.calls.filter((call) => call === "execute").length, 1);
  assert.match(
    buffer.read(),
    /applied_verified current=20260731124000 pending=0/u,
  );
  assert.match(buffer.read(), /runtime health=passed ready=passed/u);
  const receipt = receiptLines(buffer.read());
  assert.match(receipt, /command=migrate mode=run phase=runtime_readback/u);
  assert.match(
    receipt,
    /current=20260731124000 latest=20260731124000 applied=107\/107 pending=0/u,
  );
  assert.match(
    receipt,
    /result=passed writes=committed apply=executed_once auto_retry=false/u,
  );
  assert.match(receipt, /runtime health=passed ready=passed/u);
});

test("local migration workflow: compatibility apply resumes the unique ready operation", async () => {
  const service = createService({ readyOperations: [readyOperation()] });
  const buffer = outputBuffer();
  const result = await runLocalMigrationWorkflow({
    service,
    mode: "resume",
    environment: {},
    interactive: true,
    askConfirmation: async () => CONFIRMATION,
    output: buffer.output,
    waitOptions,
  });
  assert.equal(result.status, "passed");
  assert.equal(service.calls.filter((call) => call === "prepare").length, 0);
  assert.equal(service.calls.filter((call) => call === "execute").length, 1);
  assert.match(buffer.read(), /resuming_ready operation=/u);
  assert.match(buffer.read(), /applied_verified .* pending=0/u);
  assert.match(
    receiptLines(buffer.read()),
    /command=migrate_apply mode=resume phase=runtime_readback/u,
  );
});

test("local migration workflow: compatibility apply prepares safely when no ready operation exists", async () => {
  const service = createService();
  const result = await runLocalMigrationWorkflow({
    service,
    mode: "resume",
    environment: {},
    interactive: true,
    askConfirmation: async () => CONFIRMATION,
    output: outputBuffer().output,
    waitOptions,
  });
  assert.equal(result.status, "passed");
  assert.equal(service.calls.filter((call) => call === "prepare").length, 1);
  assert.equal(service.calls.filter((call) => call === "execute").length, 1);
});

test("local migration workflow: mismatched interactive confirmation exits action-required without apply", async () => {
  const service = createService();
  const buffer = outputBuffer();
  let actualError;
  await assert.rejects(
    runLocalMigrationWorkflow({
      service,
      environment: {},
      interactive: true,
      askConfirmation: async () => "取消",
      output: buffer.output,
      waitOptions,
    }),
    (error) => {
      actualError = error;
      return /操作仍停在 ready/u.test(error.message);
    },
  );
  assert.equal(migrationWorkflowExitCode(actualError), 2);
  assert.equal(service.calls.filter((call) => call === "execute").length, 0);
  assert.match(buffer.read(), /确认未匹配，已取消；未执行 apply/u);
  const receipt = receiptLines(buffer.read());
  assert.match(receipt, /phase=confirmation/u);
  assert.match(receipt, /result=action_required writes=0 apply=not_started/u);
  assert.match(receipt, /error_code=confirmation_mismatch/u);
  assert.match(receipt, /next_action=enter_exact_confirmation/u);
});

test("local migration workflow: non-interactive continuation executes an existing ready operation", async () => {
  const service = createService();
  const buffer = outputBuffer();
  const result = await runLocalMigrationWorkflow({
    service,
    mode: "execute",
    environment: {
      LOCAL_MIGRATION_OPERATION_ID: OPERATION_ID,
      LOCAL_MIGRATION_OPERATION_CONFIRM: CONFIRMATION,
    },
    output: buffer.output,
    waitOptions,
  });
  assert.equal(result.status, "passed");
  assert.equal(service.calls.includes("summary"), false);
  assert.equal(service.calls.includes("prepare"), false);
  assert.equal(service.calls.filter((call) => call === "execute").length, 1);
  const receipt = receiptLines(buffer.read());
  assert.match(receipt, /command=migrate_execute mode=execute/u);
  assert.match(receipt, /result=passed writes=committed apply=executed_once/u);
});

test("local migration workflow: partial continuation input fails before any action", async () => {
  const service = createService();
  const buffer = outputBuffer();
  await assert.rejects(
    runLocalMigrationWorkflow({
      service,
      mode: "execute",
      environment: { LOCAL_MIGRATION_OPERATION_ID: OPERATION_ID },
      output: buffer.output,
      waitOptions,
    }),
    /必须来自同一次 ready 输出并同时提供/u,
  );
  assert.deepEqual(service.calls, []);
  const receipt = receiptLines(buffer.read());
  assert.match(receipt, /result=action_required writes=0 apply=not_started/u);
  assert.match(receipt, /error_code=operation_identity_incomplete/u);
});

test("local migration workflow: an up-to-date database is a verified no-op", async () => {
  const service = createService({ pendingFiles: 0 });
  const buffer = outputBuffer();
  const result = await runLocalMigrationWorkflow({
    service,
    mode: "prepare",
    environment: {},
    output: buffer.output,
    waitOptions,
  });
  assert.equal(result.status, "passed");
  assert.deepEqual(service.calls, ["summary"]);
  assert.match(buffer.read(), /verified .* pending=0/u);
  const receipt = receiptLines(buffer.read());
  assert.match(
    receipt,
    /current=20260731124000 latest=20260731124000 applied=107\/107 pending=0/u,
  );
  assert.match(receipt, /result=up_to_date writes=0 apply=skipped/u);
  assert.match(receipt, /runtime health=passed ready=passed/u);
});

test("local migration workflow: real prepare blockers remain errors", async () => {
  const service = createService({ blocked: true });
  const buffer = outputBuffer();
  await assert.rejects(
    runLocalMigrationWorkflow({
      service,
      mode: "prepare",
      environment: {},
      output: buffer.output,
      waitOptions,
    }),
    /共享开发库仍有其它连接/u,
  );
  const receipt = receiptLines(buffer.read());
  assert.match(receipt, /phase=preflight/u);
  assert.match(receipt, /result=blocked writes=0 apply=not_started/u);
  assert.match(receipt, /error_code=database_clients_active/u);
  assert.match(receipt, /next_action=close_database_clients_and_retry/u);
  assert.equal(service.calls.filter((call) => call === "execute").length, 0);
});

test("local migration workflow: execute without the ready identity exits action-required", async () => {
  const service = createService();
  const buffer = outputBuffer();
  let actualError;
  await assert.rejects(
    runLocalMigrationWorkflow({
      service,
      mode: "execute",
      environment: {},
      output: buffer.output,
      waitOptions,
    }),
    (error) => {
      actualError = error;
      return /需要同一次 make migrate_prepare 输出/u.test(error.message);
    },
  );
  assert.equal(migrationWorkflowExitCode(actualError), 2);
  assert.deepEqual(service.calls, []);
  assert.match(
    receiptLines(buffer.read()),
    /result=action_required writes=0 apply=not_started/u,
  );
});

test("local migration workflow: an uncertain apply is reported as not-proven and never retried", async () => {
  const service = createService({ executeStatus: "not_proven" });
  const buffer = outputBuffer();
  await assert.rejects(
    runLocalMigrationWorkflow({
      service,
      mode: "execute",
      environment: {
        LOCAL_MIGRATION_OPERATION_ID: OPERATION_ID,
        LOCAL_MIGRATION_OPERATION_CONFIRM: CONFIRMATION,
      },
      output: buffer.output,
      waitOptions,
    }),
    /结果尚未证明|提交结果无法证明/u,
  );
  assert.equal(service.calls.filter((call) => call === "execute").length, 1);
  const receipt = receiptLines(buffer.read());
  assert.match(receipt, /phase=apply/u);
  assert.match(
    receipt,
    /result=not_proven writes=unknown apply=attempted_once auto_retry=false/u,
  );
  assert.match(receipt, /error_code=migration_outcome_unknown/u);
  assert.match(receipt, /next_action=run_status_no_auto_retry/u);
});

test("local migration workflow: replaying a passed operation reports already-applied without another apply", async () => {
  const service = createService({ startingOperation: passedOperation() });
  const buffer = outputBuffer();
  const result = await runLocalMigrationWorkflow({
    service,
    mode: "execute",
    environment: {
      LOCAL_MIGRATION_OPERATION_ID: OPERATION_ID,
      LOCAL_MIGRATION_OPERATION_CONFIRM: CONFIRMATION,
    },
    output: buffer.output,
    waitOptions,
  });
  assert.equal(result.status, "passed");
  assert.equal(service.calls.filter((call) => call === "execute").length, 0);
  const receipt = receiptLines(buffer.read());
  assert.match(
    receipt,
    /result=already_applied writes=0 apply=already_executed/u,
  );
  assert.match(
    receipt,
    /current=20260731124000 latest=20260731124000 applied=107\/107 pending=0/u,
  );
});

test("local migration workflow: status failure still prints an unavailable-target receipt", async () => {
  const buffer = outputBuffer();
  const service = {
    calls: [],
    async summary() {
      this.calls.push("summary");
      return {
        status: "blocked",
        target: null,
        runtime: {
          available: false,
          health: { status: "unavailable" },
          ready: { status: "unavailable" },
        },
        operations: [],
        issues: [
          {
            code: "migration_status_unavailable",
            severity: "blocked",
            message: "共享开发库状态不可用",
          },
        ],
      };
    },
  };
  await assert.rejects(
    runLocalMigrationWorkflow({
      service,
      mode: "prepare",
      environment: {},
      output: buffer.output,
      waitOptions,
    }),
    /状态不可用/u,
  );
  const receipt = receiptLines(buffer.read());
  assert.match(receipt, /phase=status/u);
  assert.match(receipt, /target=unavailable/u);
  assert.match(
    receipt,
    /current=unknown latest=unknown applied=unknown\/unknown pending=unknown/u,
  );
  assert.match(receipt, /result=blocked writes=0 apply=not_started/u);
  assert.match(receipt, /error_code=migration_status_unavailable/u);
});

test("local migration workflow: generated continuation values are shell-safe", () => {
  assert.equal(shellSingleQuote("plain"), "'plain'");
  assert.equal(shellSingleQuote("a'b"), "'a'\"'\"'b'");
});
