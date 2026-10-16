import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { verifyBusinessPDF } from "./pdf-runtime-pdfs.mjs";
import {
  observePDFDownloads,
  readPDFDownloadEvidence,
  assertPDFDownloadResponse,
} from "./transaction-pdf-download-observer.mjs";
import { createTransactionClient } from "./transaction-real-backend-fixture.mjs";
import {
  login,
  navigate,
  closePage,
  pageAction,
} from "./transaction-browser-ui.mjs";
import {
  FLOW_FIELD_AUDIT_PAGES,
  captureFlowFieldPage,
} from "./transaction-flow-fields-browser.mjs";
import { printTemplateCatalog } from "../../web/src/erp/config/printTemplates.mjs";
import { OutsourcingOrderStatus } from "../../web/src/common/consts/statuses.generated.mjs";

const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium, expect } = require("playwright/test");
const run = promisify(execFile);
const templateKeys = printTemplateCatalog
  .filter((template) => template.runtime?.workspace)
  .map((template) => template.key);

export function assertSharedSurfaceReport(report) {
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(
    report.filters.map((entry) => entry.key),
    ["incoming-quality", "customer-receipts", "supplier-payments"],
  );
  for (const entry of report.filters) {
    assert.ok(entry.rows > 0);
    assert.equal(entry.databaseMatches, true);
    assert.equal(entry.restored, true);
    assert.equal(entry.documentOverflow, false);
  }
  assert.deepEqual(
    report.prints.map((entry) => entry.key),
    [
      "purchase-business",
      "outsourcing-business",
      "outsourcing-instruction-business",
      "bom-material-business",
      "bom-color-business",
      "bom-instruction-business",
      ...templateKeys,
    ],
  );
  for (const entry of report.prints) {
    assert.ok(entry.bytes > 2000);
    assert.equal(entry.responseStatus, 200);
    assert.equal(entry.editorExcluded, true);
    assert.equal(entry.downloadMatchesResponse, true);
    assert.equal(entry.paperVisible, true);
    assert.ok(entry.pages >= 1 && entry.pages <= 8);
    assert.equal(entry.pageCharacters.length, entry.pages);
    assert.ok(entry.pageCharacters.every((count) => count > 0));
    assert.ok(entry.embeddedFontFaces > 0);
    assert.match(entry.requestID || "", /^[A-Za-z0-9._:-]{1,128}$/u);
    assert.match(entry.sha256 || "", /^[a-f0-9]{64}$/u);
  }
  assert.equal(
    new Set(report.prints.map(({ requestID }) => requestID)).size,
    report.prints.length,
  );
  for (const entry of report.prints.filter(({ key }) =>
    key.endsWith("-business"),
  )) {
    assert.ok(entry.sourceNo);
    assert.ok(Number.isSafeInteger(entry.sourceID) && entry.sourceID > 0);
  }
  assert.equal(report.freshTemplatesClearedBusinessSources, true);
  assert.equal(report.materialOnlyInstructionBlocked, true);
  assert.equal(report.printFixtureCreatedThroughAPI, true);
  assert.equal(report.fixtureDidNotPostFacts, true);
  assert.ok(report.factTablesChecked >= 20);
  assert.equal(report.factsUnchanged, true);
  assert.equal(report.ownedPrintWindowsClosed, true);
}

async function prepareProductInstructionContract(client, options) {
  const material = client.query(`SELECT row_to_json(o) FROM
    (SELECT id,outsourcing_order_no FROM outsourcing_orders h
     WHERE EXISTS (SELECT 1 FROM outsourcing_order_items i WHERE i.outsourcing_order_id=h.id AND i.subject_type='MATERIAL')
       AND NOT EXISTS (SELECT 1 FROM outsourcing_order_items i WHERE i.outsourcing_order_id=h.id AND i.subject_type='PRODUCT')
     ORDER BY id LIMIT 1) o`);
  assert.ok(material?.id);
  await client.login("purchase");
  const { outsourcing_order: source } = await client.rpc(
    "purchase",
    "outsourcing_order",
    "get_outsourcing_order",
    { id: material.id },
  );
  const { outsourcing_order_items: items } = await client.rpc(
    "purchase",
    "outsourcing_order",
    "list_outsourcing_order_items",
    { outsourcing_order_id: material.id, limit: 100 },
  );
  assert.ok(
    items.length > 0 && items.every((item) => item.subject_type === "MATERIAL"),
  );
  const product = client.query(`SELECT row_to_json(p) FROM
    (SELECT id,default_unit_id FROM products WHERE is_active AND default_unit_id IS NOT NULL ORDER BY id LIMIT 1) p`);
  assert.ok(product?.id && product.default_unit_id);
  const { outsourcing_order: instruction } = await client.rpc(
    "purchase",
    "outsourcing_order",
    "save_outsourcing_order_with_items",
    {
      outsourcing_order_no: `SIM-E2E-${options.runID.toUpperCase()}-PRINT-PRODUCT`,
      supplier_id: source.supplier_id,
      currency: source.currency,
      order_date: new Date().toISOString().slice(0, 10),
      supplier_snapshot: source.supplier_snapshot,
      contract_party_snapshot: source.contract_party_snapshot,
      note: "模拟产品作业指导书打印来源",
      items: [
        {
          line_no: 1,
          subject_type: "PRODUCT",
          product_id: product.id,
          process_id: items[0].process_id,
          unit_id: product.default_unit_id,
          outsourcing_quantity: "1",
          processing_item: "模拟产品加工",
          unit_price: "1",
          amount: "1",
        },
      ],
    },
  );
  assert.ok(Number.isSafeInteger(instruction.id) && instruction.id > 0);
  assert.equal(instruction.lifecycle_status, OutsourcingOrderStatus.DRAFT);
  return { material, instruction };
}

async function verifyMaterialInstructionBlocked(
  page,
  context,
  options,
  material,
  report,
) {
  await navigate(
    page,
    `${options.baseURL}${FLOW_FIELD_AUDIT_PAGES.find(({ key }) => key === "outsourcing").route}`,
  );
  const row = page.locator(
    `.ant-table-row[data-row-key="${material.id}"]:visible`,
  );
  await row.getByRole("radio").check();
  await expect(row.getByRole("radio")).toBeChecked();
  const pages = context.pages();
  const pdfRequests = [];
  const recordPDF = (request) => {
    if (new URL(request.url()).pathname === "/templates/render-pdf")
      pdfRequests.push(request.url());
  };
  context.on("request", recordPDF);
  try {
    await pageAction(page, "作业指导书打印");
    await expect(
      page.locator(".ant-message-notice-content").filter({
        hasText: "当前加工合同没有可带入作业指导书的产品 / 半成品明细",
      }),
    ).toBeVisible();
    assert.deepEqual(context.pages(), pages);
    assert.deepEqual(pdfRequests, []);
    await page.screenshot({
      path: path.join(
        options.outputDir,
        "outsourcing-material-instruction-blocked.png",
      ),
      fullPage: false,
    });
    report.materialOnlyInstructionBlocked = true;
  } finally {
    context.off("request", recordPDF);
  }
}

async function filterAndRestore(page, options, client, report, config) {
  const entry = FLOW_FIELD_AUDIT_PAGES.find(({ key }) => key === config.page);
  await navigate(page, `${options.baseURL}${entry.route}`);
  await expect(page.locator(".ant-table-row:visible").first()).toBeVisible();
  await page
    .locator(".erp-business-operation-panel")
    .getByRole("button", { name: /^(filter )?筛选( · 已应用)?$/u })
    .click();
  const dialog = page.getByRole("dialog", { name: "筛选条件", exact: true });
  await expect(dialog).toBeVisible();
  const group = dialog.getByRole("group", { name: config.label, exact: true });
  await expect(group).toBeVisible();
  assert.equal(await group.locator("input").count(), 0);
  const responseFor = (value) =>
    page.waitForResponse((response) => {
      if (!response.url().includes("/rpc/")) return false;
      const body = response.request().postDataJSON();
      return (
        body?.method === config.method &&
        String(body.params?.[config.field] || "") === value
      );
    });
  const selectedResponse = responseFor(config.value);
  await group.getByRole("button", { name: config.choice, exact: true }).click();
  const response = await selectedResponse;
  assert.equal(response.status(), 200);
  const { result } = await response.json();
  assert.equal(result.code, 0);
  const rows = result.data[config.collection];
  assert.ok(
    rows.length > 0,
    `${config.key}: filter must exercise existing facts`,
  );
  assert.ok(rows.every((row) => row[config.field] === config.value));
  const ids = rows.map(({ id }) => id);
  assert.ok(ids.every(Number.isSafeInteger));
  const databaseIDs =
    client.query(`SELECT json_agg(id ORDER BY id) FROM ${config.table}
    WHERE id IN (${ids.join(",")}) AND ${config.field}='${config.value}'`);
  assert.deepEqual(
    databaseIDs,
    [...ids].sort((a, b) => a - b),
  );
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  await expect
    .poll(async () =>
      page
        .locator(".ant-table-row:visible")
        .evaluateAll((nodes) =>
          nodes.map((node) => Number(node.dataset.rowKey)),
        ),
    )
    .toEqual(ids);
  const captured = await captureFlowFieldPage(
    page,
    options.outputDir,
    config.key,
  );
  await page
    .locator(".erp-business-operation-panel")
    .getByRole("button", { name: /^(filter )?筛选( · 已应用)?$/u })
    .click();
  const restoredResponse = responseFor("");
  await group.getByRole("button", { name: config.clear, exact: true }).click();
  const restored = await (await restoredResponse).json();
  assert.equal(restored.result.code, 0);
  assert.ok(restored.result.data.total >= result.data.total);
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  await expect
    .poll(async () =>
      page
        .locator(".ant-table-row:visible")
        .evaluateAll((nodes) =>
          nodes.map((node) => Number(node.dataset.rowKey)),
        ),
    )
    .toEqual(restored.result.data[config.collection].map(({ id }) => id));
  report.filters.push({
    key: config.key,
    rows: rows.length,
    databaseMatches: true,
    restored: true,
    documentOverflow:
      captured.metrics.documentWidth > captured.metrics.viewport.width,
  });
}

async function downloadRealPDF(
  page,
  options,
  report,
  key,
  templateKey,
  sourceNo = "",
  sourceID = null,
) {
  await page.locator(".erp-print-shell--ready").waitFor();
  await page.locator('[data-print-draft-save-status="saved"]').waitFor();
  const paper = page.locator(".erp-print-shell__stage-wrap > *").first();
  await expect(paper).toBeVisible();
  if (sourceNo) assert.ok((await paper.innerText()).includes(sourceNo));
  const downloadPromise = page.waitForEvent("download", { timeout: 45000 });
  void downloadPromise.catch(() => {});
  await page.getByRole("button", { name: "下载 PDF", exact: true }).click();
  const download = await downloadPromise;
  const destination = path.join(options.outputDir, `${key}.pdf`);
  await download.saveAs(destination);
  const pdf = await fs.readFile(destination);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const response = await readPDFDownloadEvidence(page, download);
  assertPDFDownloadResponse(response, {
    templateKey,
    bytes: pdf.length,
    sha256,
  });
  const { payload } = response;
  const editorExcluded = await page.evaluate((html) => {
    const printed = new DOMParser().parseFromString(html, "text/html");
    const editor = printed.querySelector(
      "[data-print-editor-only], .erp-print-shell__panel, [data-print-blank-notice]",
    );
    const emptyImageHints = Array.from(
      printed.querySelectorAll(
        ".erp-engineering-print-image-slot--empty .erp-engineering-print-image-slot__viewport",
      ),
    ).some((node) => node.textContent.trim() !== "");
    return !editor && !emptyImageHints;
  }, payload.html);
  assert.equal(editorExcluded, true);
  await fs.writeFile(path.join(options.outputDir, `${key}.html`), payload.html);
  await page.screenshot({
    path: path.join(options.outputDir, `${key}.png`),
    fullPage: false,
  });
  const [info, fonts, text] = await Promise.all([
    run("pdfinfo", [destination], { timeout: 10000 }),
    run("pdffonts", [destination], { timeout: 10000 }),
    run("pdftotext", ["-layout", destination, "-"], { timeout: 10000 }),
  ]);
  const pagination = verifyBusinessPDF(info.stdout, fonts.stdout, text.stdout);
  report.prints.push({
    key,
    templateKey,
    sourceNo,
    sourceID,
    responseStatus: response.status,
    requestID: response.requestID,
    sha256,
    bytes: pdf.length,
    editorExcluded,
    downloadMatchesResponse: true,
    paperVisible: true,
    ...pagination,
  });
}

async function withPrintPage(page, options, report, run) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  page.on("pageerror", (error) =>
    report.pageErrors.push({ surface: "print", message: error.message }),
  );
  try {
    await run(page);
  } catch (error) {
    await page
      .screenshot({ path: path.join(options.outputDir, "print-failure.png") })
      .catch(() => {});
    report.visibleText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    throw error;
  } finally {
    await page.close();
    assert.equal(page.isClosed(), true);
  }
}

export async function runSharedSurfacesBrowser(input) {
  const options = {
    ...input,
    outputDir: path.join(input.outputDir, "shared-surfaces"),
  };
  await fs.mkdir(options.outputDir, { recursive: true });
  const transaction = JSON.parse(
    await fs.readFile(path.join(input.outputDir, "report.json"), "utf8"),
  );
  assert.equal(transaction.status, "passed");
  const tables = [
    ...new Set(transaction.fieldAudit.stages.flatMap(({ tables }) => tables)),
  ].sort();
  assert.ok(tables.every((table) => /^[a-z_]+$/u.test(table)));
  const client = createTransactionClient(input);
  const report = {
    status: "running",
    flows: [],
    filters: [],
    prints: [],
    pageErrors: [],
    browserRPC: [],
  };
  let browser;
  try {
    report.identity = await client.verify();
    const fingerprint = () =>
      client.query(
        `SELECT json_object_agg(name, signature) FROM (${tables
          .map(
            (table) =>
              `SELECT '${table}' AS name, md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) AS signature FROM ${table} t`,
          )
          .join(" UNION ALL ")}) facts`,
      );
    const beforeFixture = fingerprint();
    const printSources = await prepareProductInstructionContract(
      client,
      options,
    );
    report.printFixtureCreatedThroughAPI = true;
    const before = fingerprint();
    for (const table of tables.filter(
      (table) =>
        !["outsourcing_orders", "outsourcing_order_items"].includes(table),
    )) {
      assert.equal(
        before[table],
        beforeFixture[table],
        `${table}: preparing a draft print source must not post facts`,
      );
    }
    report.fixtureDidNotPostFacts = true;
    browser = await chromium.launch({ headless: true });
    const { page, context } = await login(
      browser,
      { ...options, fourK: true },
      "admin",
      report,
    );
    await observePDFDownloads(context);
    try {
      for (const config of [
        {
          key: "incoming-quality",
          page: "quality",
          label: "检验类型",
          choice: "采购来料",
          clear: "全部检验类型",
          method: "list_quality_inspections",
          field: "inspection_type",
          value: "INCOMING",
          collection: "quality_inspections",
          table: "quality_inspections",
        },
        {
          key: "customer-receipts",
          page: "payments",
          label: "收付款方向",
          choice: "收款",
          clear: "全部方向",
          method: "list_finance_payments",
          field: "direction",
          value: "RECEIPT",
          collection: "payments",
          table: "finance_payments",
        },
        {
          key: "supplier-payments",
          page: "payments",
          label: "收付款方向",
          choice: "付款",
          clear: "全部方向",
          method: "list_finance_payments",
          field: "direction",
          value: "DISBURSEMENT",
          collection: "payments",
          table: "finance_payments",
        },
      ])
        await filterAndRestore(page, options, client, report, config);
      const purchase = client.query(`SELECT row_to_json(p) FROM
        (SELECT id,purchase_order_no FROM purchase_orders ORDER BY id LIMIT 1) p`);
      const outsourcing = printSources.material;
      const instruction = printSources.instruction;
      const bom = client.query(`SELECT row_to_json(b) FROM
        (SELECT h.id,COALESCE(NULLIF(p.style_no,''),NULLIF(p.customer_style_no,''),p.code) AS source_no
         FROM bom_headers h JOIN products p ON p.id=h.product_id
         WHERE h.status <> 'ARCHIVED' ORDER BY h.id LIMIT 1) b`);
      assert.ok(purchase?.id && outsourcing?.id && instruction?.id && bom?.id);
      await verifyMaterialInstructionBlocked(
        page,
        context,
        options,
        outsourcing,
        report,
      );
      const businessPrints = [
        {
          key: "purchase-business",
          page: "purchase",
          role: "checkbox",
          action: "打印合同",
          template: "material-purchase-contract",
          id: purchase.id,
          no: purchase.purchase_order_no,
        },
        {
          key: "outsourcing-business",
          page: "outsourcing",
          role: "radio",
          action: "加工合同打印",
          template: "processing-contract",
          id: outsourcing.id,
          no: outsourcing.outsourcing_order_no,
        },
        {
          key: "outsourcing-instruction-business",
          page: "outsourcing",
          role: "radio",
          action: "作业指导书打印",
          template: "engineering-work-instruction",
          id: instruction.id,
          no: instruction.outsourcing_order_no,
        },
        {
          key: "bom-material-business",
          page: "bom",
          role: "checkbox",
          action: "打印物料明细",
          template: "engineering-material-detail",
          id: bom.id,
          no: bom.source_no,
        },
        {
          key: "bom-color-business",
          page: "bom",
          role: "checkbox",
          action: "打印色卡",
          template: "engineering-color-card",
          id: bom.id,
          no: bom.source_no,
        },
        {
          key: "bom-instruction-business",
          page: "bom",
          role: "checkbox",
          action: "打印作业指导书",
          template: "engineering-work-instruction",
          id: bom.id,
          no: bom.source_no,
        },
      ];
      for (const entry of businessPrints) {
        await navigate(
          page,
          `${options.baseURL}${FLOW_FIELD_AUDIT_PAGES.find(({ key }) => key === entry.page).route}`,
        );
        const selected = page.locator(
          `.ant-table-row[data-row-key="${entry.id}"]:visible`,
        );
        await expect(selected).toHaveCount(1);
        await selected.getByRole(entry.role).check();
        await expect(selected.getByRole(entry.role)).toBeChecked();
        const opened = context.waitForEvent("page");
        void opened.catch(() => {});
        await pageAction(page, entry.action);
        await withPrintPage(await opened, options, report, (printPage) =>
          downloadRealPDF(
            printPage,
            options,
            report,
            entry.key,
            entry.template,
            entry.no,
            entry.id,
          ),
        );
      }
      await withPrintPage(
        await context.newPage(),
        options,
        report,
        async (printPage) => {
          for (const key of templateKeys) {
            await printPage.goto(
              `${options.baseURL}/erp/print-workspace/${key}?draft=fresh&state=shared-${options.runID}-${key}`,
            );
            await printPage.locator(".erp-print-shell--ready").waitFor();
            const content = await printPage
              .locator(".erp-print-shell__stage-wrap")
              .innerText();
            for (const { no } of businessPrints)
              assert.ok(
                !content.includes(no),
                `${key}: fresh sample retained ${no}`,
              );
            await downloadRealPDF(printPage, options, report, key, key);
          }
        },
      );
      assert.deepEqual(context.pages(), [page]);
      report.freshTemplatesClearedBusinessSources = true;
      report.ownedPrintWindowsClosed = true;
    } catch (error) {
      await page
        .screenshot({ path: path.join(options.outputDir, "list-failure.png") })
        .catch(() => {});
      report.listVisibleText = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      throw error;
    } finally {
      await closePage(page, context);
    }
    assert.deepEqual(
      fingerprint(),
      before,
      "list filters and print must not modify business facts",
    );
    report.factTablesChecked = tables.length;
    report.factsUnchanged = true;
    assertSharedSurfaceReport(report);
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.stack;
    if (browser)
      for (const context of browser.contexts())
        for (const page of context.pages()) {
          await page
            .screenshot({ path: path.join(options.outputDir, "failure.png") })
            .catch(() => {});
          report.visibleText = await page
            .locator("body")
            .innerText()
            .catch(() => "");
        }
    throw error;
  } finally {
    await browser?.close();
    report.fixtureRPC = client.calls;
    await fs.writeFile(
      path.join(options.outputDir, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  return report;
}

if (
  process.argv[1] &&
  pathToFileURL(await fs.realpath(process.argv[1])).href === import.meta.url
) {
  assert.deepEqual(process.argv.slice(2, 3), ["--environment"]);
  assert.equal(process.argv.length, 4);
  const options = JSON.parse(await fs.readFile(process.argv[3], "utf8"));
  const report = await runSharedSurfacesBrowser(options);
  process.stdout.write(
    `shared surfaces: ${report.status}, ${report.filters.length} filters, ${report.prints.length} PDFs\n`,
  );
}
