#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { assertDisposableDatabaseTarget } from "./database-target.mjs";

export const CAPACITY_DATASET_SCHEMA = "plush-capacity-dataset/v1";
export const CAPACITY_DATASET_VERSION = "capacity-read-model-v1";
export const CAPACITY_DATABASE_URL_ENV = "CAPACITY_DATABASE_URL";
export const CAPACITY_DATASET_TARGETS = Object.freeze({
  workflowTasks: 5000,
  productionFacts: 2000,
  financeFacts: 2000,
  attachments: 1000,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function redact(value) {
  return String(value || "")
    .replace(
      /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      "postgres://<redacted>@",
    )
    .replace(/password=[^\s&]+/giu, "password=<redacted>");
}

function psql(databaseURL, sql) {
  const result = spawnSync(
    "/opt/homebrew/opt/libpq/bin/psql",
    [
      databaseURL,
      "-X",
      "--no-psqlrc",
      "-Atq",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0) {
    const detail = redact(
      result.stderr || result.stdout || result.error?.message || "",
    )
      .trim()
      .split("\n")[0];
    throw new Error(`capacity dataset SQL failed${detail ? `: ${detail}` : ""}`);
  }
  return String(result.stdout || "").trim();
}

export function capacityDatasetConfirmation(databaseName) {
  if (!/^plush_erp_capacity_[a-z0-9_]+$/u.test(databaseName)) {
    throw new Error("capacity dataset confirmation requires an exact capacity database");
  }
  return `LOAD_SIMULATED_CAPACITY_DATASET:${databaseName}:${CAPACITY_DATASET_VERSION}`;
}

export function buildCapacityDatasetSQL({
  taskSourceID,
  taskSourceType = "capacity_fixture",
} = {}) {
  const sourceID = Number(taskSourceID);
  if (!Number.isSafeInteger(sourceID) || sourceID <= 0) {
    throw new Error("capacity task source id must be a positive integer");
  }
  if (!/^[a-z][a-z0-9_]{2,31}$/u.test(taskSourceType)) {
    throw new Error("capacity task source type is invalid");
  }
  const targets = CAPACITY_DATASET_TARGETS;
  return `
BEGIN;

DO $capacity_guard$
DECLARE
  existing_fixture bigint;
  actor_id bigint;
  production_product_id bigint;
  production_unit_id bigint;
  production_warehouse_id bigint;
BEGIN
  SELECT count(*) INTO existing_fixture
  FROM workflow_tasks
  WHERE task_code LIKE 'SIM-CAP-V1-%';
  IF existing_fixture <> 0 THEN
    RAISE EXCEPTION 'capacity dataset already exists';
  END IF;

  SELECT id INTO actor_id
  FROM admin_users
  WHERE username = 'demo_pmc' AND disabled = false AND revoked_at IS NULL
  ORDER BY id
  LIMIT 1;
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'capacity dataset requires enabled demo_pmc';
  END IF;

  SELECT id, default_unit_id
  INTO production_product_id, production_unit_id
  FROM products
  WHERE is_active = true
  ORDER BY id
  LIMIT 1;
  IF production_product_id IS NULL OR production_unit_id IS NULL THEN
    RAISE EXCEPTION 'capacity dataset requires an active simulated product and unit';
  END IF;

  SELECT id INTO production_warehouse_id
  FROM warehouses
  WHERE is_active = true
  ORDER BY id
  LIMIT 1;
  IF production_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'capacity dataset requires an active simulated warehouse';
  END IF;

  INSERT INTO workflow_tasks (
    task_code,
    task_group,
    task_name,
    source_type,
    source_id,
    source_no,
    business_status_key,
    task_status_key,
    owner_role_key,
    owner_pool_key,
    required_capability_key,
    priority,
    critical_path,
    urge_count,
    payload,
    version,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  SELECT
    'SIM-CAP-V1-' || lpad(series.value::text, 6, '0'),
    'trial_pmc_work',
    '模拟容量任务 ' || series.value,
    '${taskSourceType}',
    ${sourceID},
    'SIM-CAPACITY-${sourceID}',
    'production_ready',
    'ready',
    'pmc',
    'pmc',
    'workflow.task.urge',
    0,
    false,
    0,
    jsonb_build_object(
      'simulated_only', true,
      'real_customer_data', false,
      'trial_task', true,
      'capacity_fixture', '${CAPACITY_DATASET_VERSION}',
      'sequence', series.value
    ),
    1,
    actor_id,
    actor_id,
    clock_timestamp(),
    clock_timestamp()
  FROM generate_series(
    1,
    GREATEST(0, ${targets.workflowTasks} - (SELECT count(*) FROM workflow_tasks))
  ) AS series(value);

  INSERT INTO production_facts (
    fact_no,
    fact_type,
    status,
    version,
    subject_type,
    subject_id,
    product_sku_id,
    warehouse_id,
    unit_id,
    lot_id,
    quantity,
    source_type,
    source_id,
    source_line_id,
    idempotency_key,
    occurred_at,
    occurred_at_specified,
    posted_at,
    posted_by,
    cancelled_at,
    cancelled_by,
    cancel_reason,
    note,
    created_at,
    updated_at
  )
  SELECT
    'SIM-CAP-PF-' || lpad(series.value::text, 6, '0'),
    'FINISHED_GOODS_RECEIPT',
    'DRAFT',
    1,
    'PRODUCT',
    production_product_id,
    NULL,
    production_warehouse_id,
    production_unit_id,
    NULL,
    1,
    NULL,
    NULL,
    NULL,
    'sim-cap-pf-' || series.value,
    clock_timestamp(),
    true,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'simulated capacity read-model fixture',
    clock_timestamp(),
    clock_timestamp()
  FROM generate_series(
    1,
    GREATEST(0, ${targets.productionFacts} - (SELECT count(*) FROM production_facts))
  ) AS series(value);

  INSERT INTO finance_facts (
    fact_no,
    fact_type,
    status,
    version,
    counterparty_type,
    counterparty_id,
    amount,
    fee_amount,
    currency,
    collection_type,
    payment_term,
    payment_term_days,
    invoice_category,
    source_type,
    source_id,
    source_line_id,
    idempotency_key,
    occurred_at,
    occurred_at_specified,
    posted_at,
    posted_by,
    settled_at,
    settled_by,
    cancelled_at,
    cancelled_by,
    cancel_reason,
    note,
    created_at,
    updated_at
  )
  SELECT
    'SIM-CAP-FF-' || lpad(series.value::text, 6, '0'),
    'RECEIVABLE',
    'DRAFT',
    1,
    'OTHER',
    NULL,
    1,
    0,
    'CNY',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'sim-cap-ff-' || series.value,
    clock_timestamp(),
    true,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'simulated capacity read-model fixture',
    clock_timestamp(),
    clock_timestamp()
  FROM generate_series(
    1,
    GREATEST(0, ${targets.financeFacts} - (SELECT count(*) FROM finance_facts))
  ) AS series(value);

  INSERT INTO business_attachments (
    owner_type,
    owner_id,
    attachment_type,
    slot_key,
    file_name,
    mime_type,
    file_size,
    sha256,
    content,
    uploaded_by,
    note,
    created_at
  )
  SELECT
    'workflow_task',
    (
      SELECT id
      FROM workflow_tasks
      WHERE task_code LIKE 'SIM-CAP-V1-%'
        AND source_type = '${taskSourceType}'
        AND source_id = ${sourceID}
      ORDER BY id
      LIMIT 1
    ),
    'evidence',
    NULL,
    'sim-capacity-' || lpad(series.value::text, 6, '0') || '.txt',
    'text/plain',
    1,
    md5('sim-capacity-' || series.value) || md5('v1-' || series.value),
    decode('30', 'hex'),
    actor_id,
    'simulated capacity attachment fixture',
    clock_timestamp()
  FROM generate_series(
    1,
    GREATEST(0, ${targets.attachments} - (SELECT count(*) FROM business_attachments))
  ) AS series(value);
END
$capacity_guard$;

COMMIT;
`;
}

function datasetCounts(databaseURL) {
  return JSON.parse(
    psql(
      databaseURL,
      `SELECT json_build_object(
        'workflowTasks', (SELECT count(*) FROM workflow_tasks),
        'productionFacts', (SELECT count(*) FROM production_facts),
        'financeFacts', (SELECT count(*) FROM finance_facts),
        'attachments', (SELECT count(*) FROM business_attachments),
        'capacityAttachmentOwnerID', (
          SELECT min(owner_id)
          FROM business_attachments
          WHERE owner_type = 'workflow_task'
            AND note = 'simulated capacity attachment fixture'
        ),
        'capacityTasks', (
          SELECT count(*)
          FROM workflow_tasks
          WHERE task_code LIKE 'SIM-CAP-V1-%'
            AND payload->>'capacity_fixture' = '${CAPACITY_DATASET_VERSION}'
        ),
        'postedCapacityProductionFacts', (
          SELECT count(*)
          FROM production_facts
          WHERE fact_no LIKE 'SIM-CAP-PF-%' AND status <> 'DRAFT'
        ),
        'postedCapacityFinanceFacts', (
          SELECT count(*)
          FROM finance_facts
          WHERE fact_no LIKE 'SIM-CAP-FF-%' AND status <> 'DRAFT'
        )
      );`,
    ),
  );
}

export function runCapacityDataset({
  confirmation,
  databaseName,
  databaseURL,
  generatedAt = new Date(),
  runtime = {},
  taskSourceID = 1,
  taskSourceType = "capacity_fixture",
}) {
  const target = assertDisposableDatabaseTarget({
    databaseName,
    databaseURL,
    profile: "capacity",
  });
  if (confirmation !== capacityDatasetConfirmation(databaseName)) {
    throw new Error("capacity dataset confirmation does not match the exact database");
  }
  const sql = buildCapacityDatasetSQL({ taskSourceID, taskSourceType });
  const execute = runtime.execute || ((statement) => psql(databaseURL, statement));
  const readCounts = runtime.counts || (() => datasetCounts(databaseURL));
  const before = readCounts();
  execute(sql);
  const after = readCounts();
  for (const [key, minimum] of Object.entries(CAPACITY_DATASET_TARGETS)) {
    if (!Number.isSafeInteger(Number(after[key])) || Number(after[key]) < minimum) {
      throw new Error(`capacity dataset did not reach ${key}=${minimum}`);
    }
  }
  if (
    Number(after.capacityTasks) <= 0 ||
    !Number.isSafeInteger(Number(after.capacityAttachmentOwnerID)) ||
    Number(after.capacityAttachmentOwnerID) <= 0 ||
    Number(after.postedCapacityProductionFacts) !== 0 ||
    Number(after.postedCapacityFinanceFacts) !== 0
  ) {
    throw new Error("capacity dataset violated simulated-only Fact boundaries");
  }
  return Object.freeze({
    schemaVersion: CAPACITY_DATASET_SCHEMA,
    status: "passed",
    generatedAt: new Date(generatedAt).toISOString(),
    datasetVersion: CAPACITY_DATASET_VERSION,
    datasetHash: sha256(sql),
    databaseName,
    databaseRunIdentity: target.databaseRunIdentity,
    databaseTargetFingerprint: target.targetFingerprint,
    taskSourceType,
    taskSourceID: Number(taskSourceID),
    before,
    after,
    simulatedOnly: true,
    directFixture: true,
    factBoundary: Object.freeze({
      capacityFactsRemainDraft: true,
      postsInventoryOrLedger: false,
    }),
    containsSecrets: false,
    notProven: Object.freeze([
      "domain posting throughput",
      "production capacity",
      "customer UAT",
    ]),
  });
}

function writeReport(outPath, report) {
  const absolutePath = path.resolve(outPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, absolutePath);
  chmodSync(absolutePath, 0o600);
  return absolutePath;
}

function parseArgs(argv) {
  const options = {
    confirmation: "",
    databaseName: "",
    out: "output/dev-workbench/stability/capacity-dataset.json",
    taskSourceID: 1,
    taskSourceType: "capacity_fixture",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    const key = {
      "--confirm": "confirmation",
      "--database-name": "databaseName",
      "--out": "out",
      "--task-source-id": "taskSourceID",
      "--task-source-type": "taskSourceType",
    }[arg];
    if (!key) throw new Error(`unknown argument: ${arg}`);
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    options[key] = value;
    index += 1;
  }
  if (!options.databaseName) throw new Error("--database-name is required");
  if (!options.confirmation) throw new Error("--confirm is required");
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const databaseURL = String(process.env[CAPACITY_DATABASE_URL_ENV] || "");
    if (!databaseURL) throw new Error(`${CAPACITY_DATABASE_URL_ENV} is required`);
    const report = runCapacityDataset({
      confirmation: options.confirmation,
      databaseName: options.databaseName,
      databaseURL,
      taskSourceID: options.taskSourceID,
      taskSourceType: options.taskSourceType,
    });
    const outPath = writeReport(options.out, report);
    process.stdout.write(
      `[capacity-dataset] status=passed database=${report.databaseName} dataset=${report.datasetVersion} report=${path.relative(process.cwd(), outPath)}\n`,
    );
  } catch (error) {
    process.stderr.write(`[capacity-dataset] ${redact(error.message)}\n`);
    process.exitCode = 1;
  }
}
