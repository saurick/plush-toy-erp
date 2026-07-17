import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ATTACHMENT_NOTE,
  SOURCE_DRIVEN_FACT_REPORT_CONTRACT,
  assertAttachmentFixtureIntegrity,
  buildAttachmentFixtures,
  buildAttachmentTargets,
  normalizeLocalBackendURL,
  resolveAttachmentCredentials,
  selectAttachmentWorkflowTask,
  validateAttachmentReportBatch,
} from "./manual-acceptance-attachment-data.mjs";
import {
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
  CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_REVISION,
  CUSTOMER_TRIAL_133_DATABASE,
  CUSTOMER_TRIAL_133_TARGET,
  manualAcceptanceTargetConfirmation,
} from "./manual-acceptance-target-policy.mjs";

const LOCAL_BACKEND_URL = "http://127.0.0.1:8310";
const LOCAL_DATABASE_NAME = "plush_erp_acceptance_20260716_v5_dev";

test("attachment copy stays short, ordinary, and clearly sample-only", () => {
  const fixtures = buildAttachmentFixtures();
  assert.deepEqual(
    fixtures.map((item) => item.file_name),
    [
      "订单要求.pdf",
      "产品正面图.png",
      "包装唛头.jpg",
      "数量交期表.xlsx",
      "补充说明-云朵小熊大号礼盒装数量与交期.xlsx",
    ],
  );
  assert.equal(ATTACHMENT_NOTE, "样例附件，只用于查看和下载。");
  assert.equal(
    [...fixtures.map((item) => item.file_name), ATTACHMENT_NOTE].some((text) =>
      /【试用】|甲方|手工验收|名称较长用于检查/u.test(text),
    ),
    false,
  );
});

test("attachment actors use an independent role password", () => {
  assert.deepEqual(
    resolveAttachmentCredentials({
      adminPassword: "admin-secret",
      rolePassword: "role-secret",
      env: {},
    }),
    { adminPassword: "admin-secret", rolePassword: "role-secret" },
  );
  assert.deepEqual(
    resolveAttachmentCredentials({
      attestation: { source: "out-of-band" },
      adminPassword: "admin-secret",
      rolePassword: "role-secret",
      env: {},
    }),
    { adminPassword: "admin-secret", rolePassword: "role-secret" },
  );
  assert.throws(
    () =>
      resolveAttachmentCredentials({
        adminPassword: "same-secret",
        rolePassword: "same-secret",
        env: {},
      }),
    /must be independent/u,
  );
  assert.throws(
    () => resolveAttachmentCredentials({ adminPassword: "admin", env: {} }),
    /MANUAL_ACCEPTANCE_PASSWORD/u,
  );
});

function reports(overrides = {}) {
  const backendURL = overrides.backendURL || LOCAL_BACKEND_URL;
  const target = overrides.target || "local-dev";
  const databaseName =
    overrides.databaseName ||
    (target === CUSTOMER_TRIAL_133_TARGET
      ? CUSTOMER_TRIAL_133_DATABASE
      : LOCAL_DATABASE_NAME);
  const runtime =
    overrides.runtime || {
      environment: "local",
      customerKey: "yoyoosun",
      configRevision: "cfg-local-1",
      source: "active_customer_config_revision",
    };
  const identity = {
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
    target,
    backendURL,
    databaseName,
  };
  const sourceReport = {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    semanticDigest: "source-semantic-v1",
    ...identity,
    referenceRecords: {
      salesOrders: [{ id: 11, items: Array(25).fill({}) }],
    },
    steps: [
      { target: "purchase_order", id: 12 },
      { target: "outsourcing_order", id: 13 },
      { target: "bom_version", id: 14 },
    ],
  };
  const factReport = {
    reportContract: SOURCE_DRIVEN_FACT_REPORT_CONTRACT,
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    semanticDigest: "fact-semantic-v1",
    runtime,
    ...identity,
    referenceRecords: {
      productionOrders: [
        { id: 101, orderNo: "SIM-SDF-PO-001", status: "RELEASED" },
      ],
      productionFacts: [
        {
          id: 15,
          factNo: "SIM-SDF-PROD-001",
          factType: "MATERIAL_ISSUE",
          status: "POSTED",
          sourceType: "PRODUCTION_ORDER",
          sourceID: 101,
        },
      ],
      purchaseReceipts: [
        { id: 201, receiptNo: "SIM-SDF-PR-001", status: "POSTED" },
      ],
      purchaseReturns: [
        { id: 202, returnNo: "SIM-SDF-RET-001", status: "POSTED" },
      ],
      purchaseReceiptAdjustments: [
        {
          id: 203,
          adjustmentNo: "SIM-SDF-ADJ-001",
          status: "POSTED",
          adjustType: "INCREASE",
        },
      ],
      qualityInspections: [
        {
          id: 204,
          inspectionNo: "SIM-SDF-QI-001",
          status: "PASSED",
          sourceType: "PURCHASE_RECEIPT",
          sourceID: 201,
        },
      ],
      inventoryLots: [
        {
          id: 205,
          lotNo: "SIM-SDF-LOT-001",
          status: "ACTIVE",
          subjectType: "MATERIAL",
          subjectID: 301,
        },
      ],
      inventoryBalances: [
        {
          id: 206,
          subjectType: "MATERIAL",
          subjectID: 301,
          warehouseID: 401,
          lotID: 205,
          unitID: 501,
          quantity: "1",
        },
      ],
      inventoryTxns: [
        {
          id: 207,
          txnType: "IN",
          sourceType: "PURCHASE_RECEIPT",
          sourceID: 201,
        },
      ],
      stockReservations: [
        {
          id: 208,
          reservationNo: "SIM-SDF-RES-001",
          status: "ACTIVE",
          sourceType: "SALES_ORDER",
          sourceID: 11,
        },
      ],
      shipments: [
        { id: 209, shipmentNo: "SIM-SDF-SHIP-001", status: "SHIPPED" },
      ],
      financeFacts: [
        {
          id: 16,
          factNo: "SIM-SDF-AR-001",
          factType: "RECEIVABLE",
          status: "POSTED",
          sourceType: "SHIPMENT",
          sourceID: 209,
        },
      ],
      attachmentOwners: { productionFactId: 15, financeFactId: 16 },
    },
  };
  const taskReport = {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    writesFacts: false,
    ...identity,
    sourceType: "simulated-manual-acceptance-task-batch",
    sourceID: 123456,
  };
  return { sourceReport, factReport, taskReport, backendURL };
}

test("attachment apply URL fails closed outside loopback", () => {
  assert.equal(
    normalizeLocalBackendURL("http://localhost:8300"),
    "http://localhost:8300",
  );
  for (const value of [
    "https://example.com",
    "http://192.168.0.133:8300",
    "http://user:pass@localhost:8300",
  ])
    assert.throws(() => normalizeLocalBackendURL(value));
});

test("attachment fixtures include multiple formats and one near-limit sample", () => {
  const fixtures = buildAttachmentFixtures();
  assert.equal(fixtures.length, 5);
  assert(new Set(fixtures.map((item) => item.mime_type)).size >= 4);
  assert(
    fixtures.some(
      (item) =>
        item.sizeClass === "near-limit" && item.content.length > 4_000_000,
    ),
  );
});

test("same-name attachment reuse requires exact metadata and downloaded content", () => {
  const item = buildAttachmentFixtures({ includeNearLimit: false })[0];
  const sha256 = createHash("sha256").update(item.content).digest("hex");
  const metadata = {
    file_name: item.file_name,
    mime_type: item.mime_type,
    file_size: item.content.length,
    sha256,
    note: ATTACHMENT_NOTE,
  };
  const downloadedAttachment = {
    ...metadata,
    content_base64: item.content.toString("base64"),
  };

  assert.deepEqual(
    assertAttachmentFixtureIntegrity({
      fixture: item,
      attachment: metadata,
      downloadedAttachment,
    }),
    { sha256, fileSize: item.content.length },
  );

  const conflicts = {
    file_name: `${item.file_name}.old`,
    mime_type: "application/octet-stream",
    file_size: item.content.length + 1,
    sha256: "0".repeat(64),
    note: "旧样例",
  };
  for (const location of ["attachment", "downloadedAttachment"]) {
    for (const [field, value] of Object.entries(conflicts)) {
      const options = {
        fixture: item,
        attachment: { ...metadata },
        downloadedAttachment: { ...downloadedAttachment },
      };
      options[location][field] = value;
      assert.throws(
        () => assertAttachmentFixtureIntegrity(options),
        /conflicts with the current fixture/u,
        `${location}.${field}`,
      );
    }
  }

  assert.throws(
    () =>
      assertAttachmentFixtureIntegrity({
        fixture: item,
        attachment: metadata,
        downloadedAttachment: {
          ...downloadedAttachment,
          content_base64: "",
        },
      }),
    /downloaded content is empty/u,
  );
  assert.throws(
    () =>
      assertAttachmentFixtureIntegrity({
        fixture: item,
        attachment: metadata,
        downloadedAttachment: {
          ...downloadedAttachment,
          content_base64: Buffer.from("wrong content").toString("base64"),
        },
      }),
    /downloaded content conflicts with the current fixture/u,
  );
});

test("attachment targets require seven business owners and workflow version", () => {
  const { sourceReport, factReport } = reports();
  const targets = buildAttachmentTargets({
    sourceReport,
    factReport,
    workflowTask: { id: 17, version: 3 },
  });
  assert.equal(targets.length, 7);
  assert.equal(
    targets.reduce((sum, item) => sum + item.files, 0),
    27,
  );
  assert.equal(
    targets.find((item) => item.owner_type === "workflow_task")
      ?.expected_version,
    3,
  );
});

test("attachment owners must be exact posted references from this fact report", () => {
  const { sourceReport, factReport } = reports();
  factReport.referenceRecords.attachmentOwners.productionFactId = 999;
  assert.throws(
    () =>
      buildAttachmentTargets({
        sourceReport,
        factReport,
        workflowTask: { id: 17, version: 3 },
      }),
    /attachmentOwners\.productionFactId/u,
  );
  factReport.referenceRecords.attachmentOwners.productionFactId = 15;
  factReport.referenceRecords.financeFacts[0].status = "DRAFT";
  assert.throws(
    () =>
      buildAttachmentTargets({
        sourceReport,
        factReport,
        workflowTask: { id: 17, version: 3 },
      }),
    /attachmentOwners\.financeFactId/u,
  );
});

test("attachment report batch binds exact dataset identity and registered target policy", () => {
  const local = reports();
  const resolvedLocal = validateAttachmentReportBatch({
    ...local,
    targetConfirmation: manualAcceptanceTargetConfirmation(
      local.factReport,
    ),
    targetAttestation: undefined,
  });
  assert.equal(resolvedLocal.policy.target, "local-dev");

  const target = CUSTOMER_TRIAL_133_TARGET;
  const backendURL = "http://127.0.0.1:18375";
  const remoteRuntime = {
    environment: "remote",
    customerKey: "yoyoosun",
    configRevision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
    configProductVersion: CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
    configApplyPurpose: CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
    configDatasetVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    configTarget: CUSTOMER_TRIAL_133_TARGET,
    source: "active_customer_config_revision",
    targetAttestation: {
      source: "out-of-band",
      release: "929ec0b3a563bec0796274d033a97277519bcb51",
      migration: "20260715120000",
    },
  };
  const remote = reports({ target, backendURL, runtime: remoteRuntime });
  assert.throws(
    () => validateAttachmentReportBatch(remote),
    /MANUAL_ACCEPTANCE_TARGET_CONFIRM/u,
  );
  const targetConfirmation =
    `APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:${CUSTOMER_TRIAL_133_TARGET}:${CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION}:${CURRENT_MANUAL_ACCEPTANCE_RUN_ID}`;
  assert.throws(
    () => validateAttachmentReportBatch({ ...remote, targetConfirmation }),
    /attestation is required/u,
  );
  const targetAttestation = {
    target,
    origin: backendURL,
    customerKey: "yoyoosun",
    environment: "prod",
    release: "929ec0b3a563bec0796274d033a97277519bcb51",
    migration: "20260715120000",
    debug: {
      seedEnabled: false,
      seedAllowed: false,
      cleanupEnabled: false,
      cleanupAllowed: false,
      businessDataClearEnabled: false,
      businessDataClearAllowed: false,
    },
  };
  const resolvedRemote = validateAttachmentReportBatch({
    ...remote,
    targetConfirmation,
    targetAttestation,
  });
  assert.equal(resolvedRemote.policy.target, target);
  assert.equal(
    resolvedRemote.attestation.release,
    "929ec0b3a563bec0796274d033a97277519bcb51",
  );

  const wrongBatch = reports();
  wrongBatch.taskReport.runId = "OTHER-RUN";
  assert.throws(
    () => validateAttachmentReportBatch(wrongBatch),
    /same dataset batch/u,
  );
});

test("attachment batch rejects local and 133 database drift before report acceptance", () => {
  const local = reports();
  const localDrift = structuredClone(local);
  localDrift.sourceReport.databaseName =
    "plush_erp_acceptance_20260716_other_dev";
  assert.throws(
    () =>
      validateAttachmentReportBatch({
        ...localDrift,
        targetConfirmation: manualAcceptanceTargetConfirmation(
          local.factReport,
        ),
      }),
    /same dataset batch/u,
  );

  const remote = reports({
    target: CUSTOMER_TRIAL_133_TARGET,
    backendURL: "http://127.0.0.1:18375",
  });
  remote.factReport.databaseName = "plush_erp_uat_wrong";
  assert.throws(
    () => validateAttachmentReportBatch(remote),
    /same dataset batch|databaseName/u,
  );
});

test("attachment targets reject legacy generic-method fact reports", () => {
  const sourceReport = {
    referenceRecords: { salesOrders: [{ id: 11, items: Array(25).fill({}) }] },
    steps: [
      { target: "purchase_order", id: 12 },
      { target: "outsourcing_order", id: 13 },
      { target: "bom_version", id: 14 },
    ],
  };
  assert.throws(
    () =>
      buildAttachmentTargets({
        sourceReport,
        factReport: {
          operationalSteps: [
            {
              steps: [
                { method: "create_production_fact", id: 15 },
                { method: "create_finance_fact", id: 16 },
              ],
            },
          ],
        },
        workflowTask: { id: 17, version: 3 },
      }),
    /source-driven-operational-facts-v1/u,
  );
});

test("attachment workflow target uses only the same-batch ready trial PMC task", () => {
  const batch = {
    sourceType: "simulated-manual-acceptance-task-batch",
    sourceID: 123456,
  };
  const payload = {
    simulated_only: true,
    real_customer_data: false,
    trial_task: true,
  };
  const tasks = [
    ...[
      "production_scheduling",
      "production_exception",
      "shipment_release",
    ].map((task_group, index) => ({
      id: index + 1,
      task_group,
      task_status_key: "ready",
      owner_role_key: "pmc",
      source_type: batch.sourceType,
      source_id: batch.sourceID,
      payload,
    })),
    {
      id: 4,
      task_group: "trial_pmc_work",
      task_status_key: "blocked",
      owner_role_key: "pmc",
      source_type: batch.sourceType,
      source_id: batch.sourceID,
      payload,
    },
    {
      id: 5,
      task_group: "trial_pmc_work",
      task_status_key: "ready",
      owner_role_key: "pmc",
      source_type: batch.sourceType,
      source_id: 999999,
      payload,
    },
    {
      id: 6,
      task_group: "trial_pmc_work",
      task_status_key: "ready",
      owner_role_key: "pmc",
      source_type: batch.sourceType,
      source_id: batch.sourceID,
      payload,
    },
  ];
  assert.equal(selectAttachmentWorkflowTask(tasks, batch)?.id, 6);
  assert.equal(
    selectAttachmentWorkflowTask(tasks.slice(0, 5), batch),
    undefined,
  );
  assert.equal(
    selectAttachmentWorkflowTask(
      [{ ...tasks.at(-1), payload: { ...payload, trial_task: false } }],
      batch,
    ),
    undefined,
  );
});
