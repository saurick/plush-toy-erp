import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runMvpClosure } from "./mvp-closure.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("mvp closure writes plan-only evidence without runtime effects", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "mvp-closure-plan-"));
  const result = runMvpClosure({ out });

  assert.equal(result.report.scenario, "erp-mvp-closure");
  assert.equal(result.report.mode, "plan-only");
  assert.equal(result.report.simulatedOnly, true);
  assert.equal(result.report.writesDatabase, false);
  assert.equal(result.report.callsBackend, false);
  assert.equal(result.report.realCustomerImport, false);
  assert.equal(result.report.finalDecision.canExecuteRealImport, false);
  assert.equal(result.report.finalDecision.canReplaceDomainTests, false);
  assert(result.report.phases.some((phase) => phase.key === "fact-foundation"));
  assert(result.report.phases.some((phase) => phase.key === "mobile-workflow"));
  const rolePhase = result.report.phases.find((phase) => phase.key === "roles-and-seed");
  assert(rolePhase);
  assert(
    rolePhase.commands.some((command) =>
      command.includes("ERP_ROLE_DEMO_PASSWORD='replace-with-local-demo-password'"),
    ),
  );
  assert.doesNotMatch(JSON.stringify(rolePhase.commands), /12345678/u);
  const frontendPhase = result.report.phases.find(
    (phase) => phase.key === "frontend-regression",
  );
  assert(frontendPhase);
  assert.doesNotMatch(JSON.stringify(frontendPhase.commands), /12345678/u);
  assert(fs.existsSync(result.jsonPath));
  assert(fs.existsSync(result.mdPath));

  const persisted = JSON.parse(fs.readFileSync(result.jsonPath, "utf8"));
  assert.equal(persisted.mode, "plan-only");
  assert.equal(persisted.noWriteToolRuns.length, 0);
});

test("mvp closure report tools stay no-write and print the retired operational apply contract", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "mvp-closure-tools-"));
  const result = runMvpClosure({ out, runReportTools: true });

  assert.equal(result.report.mode, "report-with-no-write-tools");
  assert.equal(result.report.writesDatabase, false);
  assert.equal(result.report.callsBackend, false);
  assert(
    result.report.noWriteToolRuns.some(
      (run) => run.key === "trial-simulated-data" && run.status === "PASS",
    ),
  );
  assert(
    result.report.noWriteToolRuns.some(
      (run) =>
        run.key === "operational-fact-simulated-closure-input-template" &&
        run.status === "PASS",
    ),
  );
  assert(
    result.report.noWriteToolRuns.some(
      (run) => run.key === "mobile-workflow-simulated-closure" && run.status === "PASS",
    ),
  );
});

test("mvp closure CLI rejects apply mode", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/qa/mvp-closure.mjs", "--apply"],
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not supported by mvp-closure/);
});
