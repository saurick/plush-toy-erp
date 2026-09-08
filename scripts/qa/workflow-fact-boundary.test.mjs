import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const workflowSourceFiles = [
  ...readdirSync(path.join(repoRoot, "server/internal/biz"))
    .filter(
      (fileName) => fileName.startsWith("workflow") && fileName.endsWith(".go"),
    )
    .map((fileName) => `server/internal/biz/${fileName}`),
  ...readdirSync(path.join(repoRoot, "server/internal/data"))
    .filter(
      (fileName) => fileName.startsWith("workflow") && fileName.endsWith(".go"),
    )
    .map((fileName) => `server/internal/data/${fileName}`),
  ...readdirSync(path.join(repoRoot, "server/internal/service"))
    .filter(
      (fileName) =>
        fileName.startsWith("jsonrpc_workflow") && fileName.endsWith(".go"),
    )
    .map((fileName) => `server/internal/service/${fileName}`),
];

const forbiddenRuntimeFactReferences = [
  "OperationalFactUsecase",
  "OperationalFactRepo",
  "CreateProductionFactDraft",
  "CreateOutsourcingFactDraft",
  "CreateFinanceFactDraft",
  "PostProductionFact",
  "PostOutsourcingFact",
  "PostFinanceFact",
  "ShipShipment",
  "inventory_txns",
  "inventory_balances",
  "inventory_lots",
  "production_facts",
  "outsourcing_facts",
  "finance_facts",
  "shipment_items",
];

// Identity search joins only fields needed to recognize an already authorized
// task. It cannot use domain writes or turn task completion into fact posting.
const identityReadFiles = [
  "server/internal/data/workflow_task_display_context.go",
  "server/internal/data/workflow_task_identity_search.go",
];
const identitySearchTables = new Set(["production_facts", "shipment_items"]);

test("workflow fact boundary: workflow runtime does not post domain facts", () => {
  assert(workflowSourceFiles.length > 0, "expected workflow runtime files");
  for (const relativePath of workflowSourceFiles) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    for (const forbidden of forbiddenRuntimeFactReferences) {
      if (
        relativePath === "server/internal/data/workflow_task_identity_search.go" &&
        identitySearchTables.has(forbidden)
      ) continue;
      assert(
        !source.includes(forbidden),
        `${relativePath} must not reference ${forbidden}; call domain usecases from explicit domain entries instead`,
      );
    }
  }
});

test("workflow fact boundary: task identity projections only read source data", () => {
  for (const relativePath of identityReadFiles) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.doesNotMatch(
      source,
      /\.\s*(?:Create(?:Bulk)?|Update(?:One|OneID)?|Delete(?:One|OneID)?|Insert|SaveX?|Exec(?:Context)?|Begin(?:Tx)?|Commit|Rollback|Post\w*)\s*\(/u,
      `${relativePath} must remain a read-only projection`,
    );
    assert.doesNotMatch(
      source,
      /\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\w+\s+SET|TRUNCATE\s|ALTER\s+TABLE|DROP\s+TABLE)\b/iu,
      `${relativePath} must not execute raw mutation SQL`,
    );
  }
});

test("workflow fact boundary: workflow explain exposes guarded domain command entry", () => {
  const source = readFileSync(
    path.join(repoRoot, "server/internal/service/jsonrpc_workflow_task.go"),
    "utf8",
  );
  for (const expected of [
    "domain_command_entry",
    "action_domain_command_entries",
    "guarded_no_domain_command_contract",
    "domain_command_contract_not_configured",
    "workflow_payload_command_key_ignored",
    "will_write_fact",
  ]) {
    assert(
      source.includes(expected),
      `jsonrpc_workflow_task.go should expose guarded domain command entry token ${expected}`,
    );
  }
});
