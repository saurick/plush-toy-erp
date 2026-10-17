import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const workflowSourceFiles = [
  ...readdirSync(path.join(repoRoot, "server/internal/biz"))
    .filter(
      (fileName) => fileName.startsWith("workflow") && fileName.endsWith(".go") && !fileName.endsWith("_test.go"),
    )
    .map((fileName) => `server/internal/biz/${fileName}`),
  ...readdirSync(path.join(repoRoot, "server/internal/data"))
    .filter(
      (fileName) => fileName.startsWith("workflow") && fileName.endsWith(".go") && !fileName.endsWith("_test.go"),
    )
    .map((fileName) => `server/internal/data/${fileName}`),
  ...readdirSync(path.join(repoRoot, "server/internal/service"))
    .filter(
      (fileName) =>
        fileName.startsWith("jsonrpc_workflow") && fileName.endsWith(".go") && !fileName.endsWith("_test.go"),
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

// Task discovery and tracking can read facts visible through an authorized task.
// Each explicit projection remains subject to the mutation guards below.
const factReadProjections = new Map([
  ["server/internal/data/workflow_task_display_context.go", []],
  ["server/internal/data/workflow_task_identity_search.go", ["production_facts", "shipment_items"]],
  ["server/internal/data/workflow_task_source_links.go", ["production_facts", "outsourcing_facts", "finance_facts"]],
  ["server/internal/data/workflow_task_discovery.go", ["production_facts", "outsourcing_facts"]],
  ["server/internal/data/workflow_handling_chain.go", ["production_facts", "outsourcing_facts"]],
  ["server/internal/data/workflow_exceptions.go", ["outsourcing_facts", "inventory_txns"]],
]);
const backfillLock = '"LOCK TABLE production_orders, production_facts, production_wip_batches, shipments, workflow_tasks IN SHARE ROW EXCLUSIVE MODE"';

test("workflow fact boundary: workflow runtime does not post domain facts", () => {
  assert(workflowSourceFiles.length > 0, "expected workflow runtime files");
  for (const relativePath of workflowSourceFiles) {
    const original = readFileSync(path.join(repoRoot, relativePath), "utf8");
    // The one-off repair locks source rows while writing only task projections.
    const source = relativePath === "server/internal/data/workflow_source_task_backfill.go"
      ? original.replace(backfillLock, '"source projection lock"')
      : original;
    if (!relativePath.endsWith("_test.go")) {
      assert.doesNotMatch(source, /\.(?:ProductionFact|OutsourcingFact|FinanceFact|InventoryTxn|InventoryBalance|InventoryLot|Shipment|ShipmentItem)\.(?:Create|Update|Delete)\w*\(/u);
    }
    for (const forbidden of forbiddenRuntimeFactReferences) {
      if (
        factReadProjections.get(relativePath)?.includes(forbidden)
      ) continue;
      assert(
        !source.includes(forbidden),
        `${relativePath} must not reference ${forbidden}; call domain usecases from explicit domain entries instead`,
      );
    }
  }
});

test("workflow fact boundary: task discovery and tracking projections only read source data", () => {
  for (const relativePath of factReadProjections.keys()) {
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
    path.join(repoRoot, "server/internal/service/jsonrpc_workflow_task_access.go"),
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
      `workflow task access should expose guarded domain command entry token ${expected}`,
    );
  }
});
