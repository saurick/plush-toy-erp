import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { openBusinessTableTool } from "../../web/scripts/style-l1/businessTableTools.mjs";
import { BUSINESS_ROUTE_PATHS as routes } from "../../web/src/erp/utils/masterDataOrderView.mjs";
import {
  login,
  navigate,
  closePage,
  pageAction,
  clickRPC,
  selectRow,
  modal,
} from "./transaction-browser-ui.mjs";
import { RpcMethod } from "../../web/src/common/consts/rpcMethods.generated.mjs";

const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { expect } = require("playwright/test");

// One page may serve several confirmed stages; the stage catalogue remains the
// business truth, while this list only selects real pages to inspect.
export const FLOW_FIELD_AUDIT_PAGES = Object.freeze([
  { key: "sales", route: routes.salesOrders, form: "新建订单" },
  { key: "bom", route: "/erp/purchase/material-bom" },
  { key: "purchase", route: routes.purchaseOrders, form: "新建采购订单" },
  {
    key: "outsourcing",
    route: routes.processingContracts,
    form: "新建加工合同",
  },
  { key: "inbound", route: routes.purchaseReceipts },
  { key: "quality", route: routes.qualityInspections },
  { key: "production", route: routes.productionOrders, form: "新建生产订单" },
  { key: "production-facts", route: routes.productionProgress },
  { key: "inventory", route: routes.inventory },
  { key: "shipments", route: routes.shipments, form: "新建出货单" },
  { key: "payments", route: routes.financePayments, form: "登记收付款" },
  { key: "receivables", route: routes.receivables },
  { key: "payables", route: routes.payables },
  { key: "reconciliation", route: routes.reconciliation },
]);

const tableCatalog = JSON.parse(
  readFileSync(
    new URL("../../server/docs/database/table-catalog.json", import.meta.url),
    "utf8",
  ),
);
const workflowCatalog = JSON.parse(
  readFileSync(
    new URL(
      "../../server/internal/biz/workflow_task_catalog.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export const FLOW_FIELD_AUDIT_TABLES = Object.freeze(
  tableCatalog.tables.map(({ name }) => name),
);

const STAGE_TABLES = {
  sales_order: [
    "sales_orders",
    "sales_order_items",
    "bom_headers",
    "bom_items",
    "engineering_material_requests",
    "engineering_material_request_items",
  ],
  customer_advance: ["sales_orders", "finance_payments"],
  purchasing: ["purchase_orders", "purchase_order_items"],
  supplier_advance: [
    "purchase_orders",
    "outsourcing_orders",
    "finance_payments",
  ],
  purchase_count: [
    "purchase_receipts",
    "purchase_receipt_items",
    "inventory_lots",
  ],
  incoming_quality: [
    "quality_inspections",
    "purchase_receipts",
    "inventory_txns",
    "inventory_balances",
  ],
  cutting_issue: [
    "production_orders",
    "production_order_material_requirements",
    "outsourcing_orders",
    "outsourcing_order_items",
    "outsourcing_facts",
    "production_wip_outsourcing_allocations",
    "inventory_txns",
  ],
  cutting_return: [
    "production_wip_batches",
    "production_wip_events",
    "outsourcing_facts",
  ],
  cutting_quality: ["quality_inspections", "production_wip_batches"],
  sewing_execute: [
    "production_order_operations",
    "production_wip_batches",
    "production_wip_events",
    "outsourcing_orders",
    "outsourcing_facts",
  ],
  shell_quality: ["quality_inspections", "production_wip_batches"],
  handwork_execute: [
    "production_order_operations",
    "production_wip_batches",
    "production_wip_events",
    "outsourcing_orders",
    "outsourcing_facts",
  ],
  finished_inbound: [
    "production_facts",
    "inventory_txns",
    "inventory_balances",
    "inventory_lots",
  ],
  finished_quality: [
    "quality_inspections",
    "production_order_operations",
    "production_wip_batches",
  ],
  packaging: [
    "production_packaging_confirmations",
    "production_wip_batches",
    "production_facts",
  ],
  shipment: [
    "shipments",
    "shipment_items",
    "inventory_txns",
    "stock_reservations",
  ],
  financial_settlement: [
    "finance_facts",
    "finance_payments",
    "finance_allocations",
    "finance_credit_notes",
  ],
};

export const OPTIONAL_PAYMENT_COLUMNS = Object.freeze([
  "原收付款单",
  "已抵扣",
  "已退款",
  "款项说明",
  "核销明细",
  "账户摘要",
  "业务凭据",
]);

export function readExpectedPostgresColumns() {
  const columns = [];
  for (const { file } of tableCatalog.domains) {
    const source = readFileSync(
      new URL(`../../server/docs/database/${file}`, import.meta.url),
      "utf8",
    );
    let table,
      inFields = false;
    for (const line of source.split("\n")) {
      const heading = /^## `([^`]+)`/u.exec(line);
      if (heading) {
        table = heading[1];
        inFields = false;
      }
      if (line.startsWith("### ")) inFields = line === "### 字段";
      if (!inFields || !line.startsWith("| <code>")) continue;
      const parts = line
        .split("|")
        .map((part) => part.replace(/<[^>]+>/gu, "").trim());
      columns.push({
        table,
        column: parts[1],
        type: parts[2],
        nullable: parts[4] === "可空",
      });
    }
  }
  assert.ok(columns.length > 0, "generated field inventory is empty");
  assert.deepEqual(
    [...new Set(columns.map(({ table }) => table))].sort(),
    [...FLOW_FIELD_AUDIT_TABLES].sort(),
  );
  return columns;
}

export function assertPostgresColumnMetadata(columns, expected) {
  assert.ok(columns.length > 0 && expected.length > 0);
  const key = (table, column) => `${table}.${column}`;
  const expectedByKey = new Map(
    expected.map((column) => [key(column.table, column.column), column]),
  );
  const actualByKey = new Map(
    columns.map((column) => [
      key(column.table_name, column.column_name),
      column,
    ]),
  );
  assert.equal(
    expectedByKey.size,
    expected.length,
    "duplicate expected columns",
  );
  assert.equal(
    actualByKey.size,
    columns.length,
    "duplicate PostgreSQL columns",
  );
  assert.deepEqual(
    [...expectedByKey.keys()].filter((name) => !actualByKey.has(name)),
    [],
    "missing PostgreSQL columns",
  );
  assert.deepEqual(
    [...actualByKey.keys()].filter((name) => !expectedByKey.has(name)),
    [],
    "unexpected PostgreSQL columns",
  );
  for (const [name, actual] of actualByKey) {
    let type = actual.data_type;
    if (type === "character varying")
      type =
        actual.character_maximum_length == null
          ? "varchar"
          : `varchar(${actual.character_maximum_length})`;
    if (type === "numeric")
      type = `numeric(${actual.numeric_precision},${actual.numeric_scale})`;
    assert.equal(
      type,
      expectedByKey.get(name).type,
      `${name}: PostgreSQL type differs from generated dictionary`,
    );
    assert.equal(
      actual.is_nullable === "YES",
      expectedByKey.get(name).nullable,
      `${name}: PostgreSQL nullability differs from generated dictionary`,
    );
  }
  return {
    columns: columns.length,
    columnNamesMatched: true,
    postgresTypesMatched: true,
    nullabilityMatched: true,
  };
}

export function assertFlowFieldAuditEvidence(audit) {
  assert.equal(audit.tables, FLOW_FIELD_AUDIT_TABLES.length);
  assert.ok(audit.columns > audit.tables);
  assert.ok(audit.constraints > 0);
  assert.ok(audit.indexes > 0);
  assert.equal(audit.structure.columns, audit.columns);
  for (const property of [
    "columnNamesMatched",
    "postgresTypesMatched",
    "nullabilityMatched",
  ])
    assert.equal(audit.structure[property], true);
  assert.deepEqual(
    audit.stages.map(({ stage }) => stage),
    workflowCatalog.fulfillment_flow.map(({ stage }) => stage),
  );
  assert.deepEqual(
    audit.pages.map(({ key }) => key),
    FLOW_FIELD_AUDIT_PAGES.flatMap(({ key, form }) => [
      `${key}-list`,
      ...(form ? [`${key}-form`] : []),
    ]),
  );
  for (const page of audit.pages) {
    assert.deepEqual(page.metrics.viewport, {
      width: 1920,
      height: 1080,
      dpr: 2,
    });
    assert.ok(page.screenshot.endsWith(".png"));
    if (page.key.endsWith("-list"))
      assert.ok(page.headers.filter(Boolean).length > 0);
    else assert.ok(page.fields.length > 0);
  }
}

export async function captureFlowFieldPage(page, directory, key) {
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.pendingRPC.size).toBe(0);
  const headers = await page
    .locator(".ant-table-thead:visible th")
    .allTextContents();
  const fields = await page
    .locator(".ant-form-item-label:visible label")
    .evaluateAll((labels) =>
      labels.map((label) => ({
        label: label.textContent.trim(),
        required: label.classList.contains("ant-form-item-required"),
        control: label.htmlFor,
      })),
    );
  const metrics = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    documentWidth: document.documentElement.scrollWidth,
    tables: [
      ...document.querySelectorAll(".ant-table-content, .ant-table-body"),
    ]
      .filter((element) => element.getClientRects().length)
      .map((element) => ({
        width: element.clientWidth,
        contentWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
      })),
  }));
  assert.deepEqual(metrics.viewport, { width: 1920, height: 1080, dpr: 2 });
  assert.ok(metrics.documentWidth <= 1920, `${key}: whole page overflow`);
  const screenshot = path.join(directory, `${key}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  const png = await fs.readFile(screenshot);
  assert.equal(png.readUInt32BE(16), 3840);
  assert.equal(png.readUInt32BE(20), 2160);
  return {
    key,
    url: page.url(),
    headers: headers.map((text) => text.trim()),
    fields,
    metrics,
    screenshot,
  };
}

export async function captureTransactionFlowFields(
  browser,
  options,
  client,
  report,
) {
  const directory = path.join(options.outputDir, "field-audit");
  await fs.mkdir(directory, { recursive: true });
  const publicTables = client.query(
    "SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public'",
  );
  const names = FLOW_FIELD_AUDIT_TABLES.map((name) => `'${name}'`).join(",");
  const columns =
    client.query(`SELECT json_agg(row_to_json(c) ORDER BY table_name, ordinal_position)
    FROM (SELECT table_name, column_name, ordinal_position, data_type, is_nullable,
      column_default, numeric_precision, numeric_scale, character_maximum_length
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (${names})) c`);
  assert.deepEqual(
    [...new Set(columns.map(({ table_name }) => table_name))].sort(),
    [...FLOW_FIELD_AUDIT_TABLES].sort(),
  );
  const constraints =
    client.query(`SELECT json_agg(row_to_json(c) ORDER BY table_name, name)
    FROM (SELECT t.relname AS table_name, c.conname AS name, c.contype AS type,
      pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname IN (${names})) c`);
  const indexes =
    client.query(`SELECT json_agg(row_to_json(i) ORDER BY tablename, indexname)
    FROM (SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN (${names})) i`);
  const stages = workflowCatalog.fulfillment_flow.map(
    ({ stage, label, role_keys, result }, index) => {
      assert.ok(
        STAGE_TABLES[stage]?.length > 0,
        `${stage}: missing field audit mapping`,
      );
      return {
        step: index + 1,
        stage,
        label,
        roles: role_keys,
        result,
        tables: STAGE_TABLES[stage],
      };
    },
  );
  await fs.writeFile(
    path.join(directory, "database.json"),
    JSON.stringify(
      {
        columns,
        constraints,
        indexes,
        publicTables,
        semantics: tableCatalog.tables,
        stages,
      },
      null,
      2,
    ) + "\n",
  );
  assert.deepEqual(
    publicTables,
    [...FLOW_FIELD_AUDIT_TABLES].sort(),
    "unexpected or missing application tables after formal migrations",
  );
  const structure = assertPostgresColumnMetadata(
    columns,
    readExpectedPostgresColumns(),
  );
  const { page, context } = await login(
    browser,
    { ...options, fourK: true },
    "admin",
    report,
  );
  const pages = [];
  try {
    for (const entry of FLOW_FIELD_AUDIT_PAGES) {
      await navigate(page, `${options.baseURL}${entry.route}`);
      await expect(page.locator(".ant-table:visible").first()).toBeVisible();
      pages.push(
        await captureFlowFieldPage(page, directory, `${entry.key}-list`),
      );
      if (entry.form) {
        await pageAction(page, entry.form);
        await expect(
          page.locator(".ant-form-item-label:visible").first(),
        ).toBeVisible();
        pages.push(
          await captureFlowFieldPage(page, directory, `${entry.key}-form`),
        );
      }
      await fs.writeFile(
        path.join(directory, "pages.json"),
        JSON.stringify(pages, null, 2) + "\n",
      );
    }
  } finally {
    await closePage(page, context);
  }
  report.fieldAudit = {
    pages,
    stages,
    tables: FLOW_FIELD_AUDIT_TABLES.length,
    columns: columns.length,
    constraints: constraints.length,
    indexes: indexes.length,
    structure,
  };
  assertFlowFieldAuditEvidence(report.fieldAudit);
  return report.fieldAudit;
}

export async function captureTransactionFieldResults(
  browser,
  options,
  client,
  report,
) {
  const directory = path.join(options.outputDir, "field-results");
  await fs.mkdir(directory, { recursive: true });
  const { page, context } = await login(
    browser,
    { ...options, fourK: true },
    "admin",
    report,
  );
  const pages = [];
  const exports = [];
  try {
    for (const key of ["quality", "payments", "inventory"]) {
      const entry = FLOW_FIELD_AUDIT_PAGES.find((entry) => entry.key === key);
      await navigate(page, `${options.baseURL}${entry.route}`);
      await expect(
        page.locator(".ant-table-row:visible").first(),
      ).toBeVisible();
      const captured = await captureFlowFieldPage(
        page,
        directory,
        `${key}-populated`,
      );
      pages.push(captured);
      if (key === "inventory") continue;
      const expectedHeaders =
        key === "quality"
          ? ["状态 / 判定"]
          : [
              "收付款单号",
              "状态",
              "往来方",
              "方向",
              "金额",
              "币种",
              "款项用途",
              "关联来源",
              "待抵扣 / 可退余额",
              "发生时间",
            ];
      for (const header of expectedHeaders)
        assert.ok(
          captured.headers.includes(header),
          `${key}: missing ${header}`,
        );
      const hidden = key === "quality" ? ["判定"] : OPTIONAL_PAYMENT_COLUMNS;
      for (const header of hidden)
        assert.ok(
          !captured.headers.includes(header),
          `${key}: ${header} must be optional`,
        );
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        openBusinessTableTool(page, '导出筛选结果'),
      ]);
      const csvPath = path.join(directory, `${key}.csv`);
      await download.saveAs(csvPath);
      const csv = await fs.readFile(csvPath, "utf8");
      const header = csv.split(/\r?\n/u)[0];
      for (const title of key === "quality" ? ["状态", "判定"] : hidden)
        assert.ok(header.includes(title), `${key}: export lost ${title}`);
      assert.ok(
        csv.split(/\r?\n/u).filter(Boolean).length > 1,
        `${key}: zero exported records`,
      );
      exports.push({
        key,
        path: csvPath,
        retainedFields: key === "quality" ? ["状态", "判定"] : hidden,
      });
      await openBusinessTableTool(page, "列设置");
      let settings = await modal(page, "列设置");
      for (const title of hidden)
        await expect(
          settings.getByRole("checkbox", { name: title, exact: true }),
        ).not.toBeChecked();
      await settings
        .getByRole("button", { name: "全部显示", exact: true })
        .click();
      await clickRPC(page, RpcMethod.admin.SET_ERP_COLUMN_ORDER, () =>
        settings.getByRole("button", { name: "完成", exact: true }).click(),
      );
      await expect(settings).toBeHidden();
      const expanded = await captureFlowFieldPage(
        page,
        directory,
        `${key}-all-columns`,
      );
      for (const title of hidden) assert.ok(expanded.headers.includes(title));
      pages.push(expanded);
      // Re-read the saved account preference, then restore its default so later
      // checks exercise the same default view as a new business user.
      await navigate(page, `${options.baseURL}${entry.route}`);
      for (const title of hidden)
        await expect(page.locator(".ant-table-thead:visible")).toContainText(
          title,
        );
      await openBusinessTableTool(page, "列设置");
      settings = await modal(page, "列设置");
      await settings
        .getByRole("button", { name: "恢复默认", exact: true })
        .click();
      await clickRPC(page, RpcMethod.admin.SET_ERP_COLUMN_ORDER, () =>
        settings.getByRole("button", { name: "完成", exact: true }).click(),
      );
      await expect(settings).toBeHidden();
      await navigate(page, `${options.baseURL}${entry.route}`);
      const restored = await captureFlowFieldPage(
        page,
        directory,
        `${key}-restored`,
      );
      assert.deepEqual(restored.headers, captured.headers);
      pages.push(restored);
      if (key === "payments") {
        const settlementRows = page
          .locator(".ant-table-row")
          .filter({ hasText: "结算款" });
        assert.ok(
          (await settlementRows.count()) > 0,
          "settlement source summaries must be exercised",
        );
        const headers = (
          await page.locator(".ant-table-thead:visible th").allTextContents()
        ).map((text) => text.trim());
        for (const row of await settlementRows.all()) {
          const id = Number(await row.getAttribute("data-row-key"));
          const { payment } = await client.rpc(
            "admin",
            "operational_fact",
            "get_finance_payment",
            { id },
          );
          assert.equal(payment.kind, "SETTLEMENT");
          assert.ok(
            payment.allocations.length > 0,
            "settlement fixture must retain its accounting history",
          );
          const cells = await row.locator("td").allTextContents();
          assert.equal(
            cells[headers.indexOf("关联来源")].trim(),
            `${payment.allocations.length} 笔核销记录`,
          );
        }
        const firstRow = page.locator(".ant-table-row:visible").first();
        const id = Number(await firstRow.getAttribute("data-row-key"));
        await selectRow(page, id);
        await pageAction(page, "查看详情");
        const detail = await modal(page, "收付款详情");
        const { payment } = await client.rpc(
          "admin",
          "operational_fact",
          "get_finance_payment",
          { id },
        );
        assert.ok(payment.account_ref && payment.evidence_ref);
        if (payment.kind === "REFUND") {
          assert.ok(payment.refund_of_payment_no);
          const headers = (
            await page.locator(".ant-table-thead:visible th").allTextContents()
          ).map((text) => text.trim());
          const cells = await firstRow.locator("td").allTextContents();
          assert.equal(
            cells[headers.indexOf("关联来源")].trim(),
            payment.refund_of_payment_no,
          );
        }
        await expect(detail).toContainText(payment.account_ref);
        await expect(detail).toContainText(payment.evidence_ref);
        pages.push(
          await captureFlowFieldPage(page, directory, "payment-details"),
        );
      }
    }
  } finally {
    await closePage(page, context);
  }
  report.fieldResults = {
    pages,
    exports,
    optionalColumnsRestored: true,
    detailsPreserved: true,
  };
  await fs.writeFile(
    path.join(directory, "report.json"),
    JSON.stringify(report.fieldResults, null, 2) + "\n",
  );
}
