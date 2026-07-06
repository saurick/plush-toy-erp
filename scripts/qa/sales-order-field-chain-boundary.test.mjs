import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { demoCustomerPackage } from "../../config/customers/demo/customerPackage.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { buildRuntimeManifest } from "./customer-config-runtime-manifest.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(source, token, context) {
  assert(source.includes(token), `${context} must include ${token}`);
}

function assertNotIncludes(source, token, context) {
  assert(!source.includes(token), `${context} must not include ${token}`);
}

test("sales order field policy controls both visible columns and CSV export", () => {
  const salesOrderPage = read("web/src/erp/pages/V1SalesOrdersPage.jsx");
  const columns = read("web/src/erp/components/sales-orders/salesOrderColumns.jsx");
  const printDoc = read("docs/打印模板字段与编辑行为清单.md");

  assertIncludes(
    salesOrderPage,
    "filterColumnsByEffectiveFieldPolicy(",
    "V1SalesOrdersPage"
  );
  assertIncludes(
    salesOrderPage,
    "'sales_orders.default'",
    "V1SalesOrdersPage"
  );
  assertIncludes(
    salesOrderPage,
    "columns: visibleOrderDataColumns",
    "V1SalesOrdersPage CSV export"
  );
  assertNotIncludes(
    salesOrderPage,
    "导出订单行",
    "V1SalesOrdersPage must not restore selected line-item export"
  );
  assertNotIncludes(
    salesOrderPage,
    "buildSalesOrderItemColumns",
    "V1SalesOrdersPage main CSV export must stay on order columns"
  );

  assertIncludes(columns, "effectiveFieldKey: 'source_no'", "sales order columns");
  assertIncludes(
    columns,
    "effectiveFieldKey: 'expected_ship_date'",
    "sales order columns"
  );
  assertIncludes(printDoc, "销售订单受理字段链路", "print field behavior doc");
  assertIncludes(
    printDoc,
    "字段被策略隐藏时列表和导出同时隐藏",
    "print field behavior doc"
  );
});

test("sales order line numeric display keeps explicit zero values", () => {
  const columns = read("web/src/erp/components/sales-orders/salesOrderColumns.jsx");
  const salesOrderForm = read(
    "web/src/erp/components/sales-orders/SalesOrderForm.jsx"
  );

  assertIncludes(
    columns,
    "function displayOptionalValue(value, fallback = '-')",
    "sales order item columns"
  );
  assertIncludes(
    columns,
    "displaySalesOrderItemAmount(record, '')",
    "sales order item CSV export"
  );
  assertNotIncludes(
    columns,
    "deriveSalesOrderItemAmount(record) || '-'",
    "sales order item visible amount"
  );
  assertNotIncludes(
    columns,
    "deriveSalesOrderItemAmount(record) || ''",
    "sales order item exported amount"
  );
  assertIncludes(
    salesOrderForm,
    "function optionalFormValue(value)",
    "sales order line form normalization"
  );
  assertIncludes(
    salesOrderForm,
    "ordered_quantity: optionalFormValue(item.ordered_quantity)",
    "sales order line quantity normalization"
  );
  assertIncludes(
    salesOrderForm,
    "unit_price: optionalFormValue(item.unit_price)",
    "sales order line unit price normalization"
  );
  assertIncludes(
    salesOrderForm,
    "amount: optionalFormValue(item.amount)",
    "sales order line amount normalization"
  );
  assertNotIncludes(
    salesOrderForm,
    "unit_price: item.unit_price || ''",
    "sales order line unit price normalization"
  );
  assertNotIncludes(
    salesOrderForm,
    "amount: item.amount || ''",
    "sales order line amount normalization"
  );
});

test("sales order form fields are saved through the shared mapper", () => {
  const salesOrderPage = read("web/src/erp/pages/V1SalesOrdersPage.jsx");
  const salesOrderForm = read(
    "web/src/erp/components/sales-orders/SalesOrderForm.jsx"
  );
  const orderView = read("web/src/erp/utils/masterDataOrderView.mjs");
  const salesOrderService = read(
    "server/internal/service/jsonrpc_sales_order_shared.go"
  );
  const salesOrderRepo = read("server/internal/data/sales_order_repo.go");

  for (const fieldName of [
    "customer_order_no",
    "sales_owner",
    "contact_name",
    "contact_phone",
    "contact_email",
    "price_condition_note",
    "order_date",
    "planned_delivery_date",
  ]) {
    assertIncludes(
      salesOrderForm,
      `name="${fieldName}"`,
      "sales order form field collection"
    );
  }
  assertIncludes(
    salesOrderPage,
    "buildSalesOrderCustomerSourceValues(customer)",
    "V1SalesOrdersPage save mapper"
  );
  assertIncludes(
    salesOrderPage,
    "contact_snapshot: buildOrderContactSnapshot(values)",
    "V1SalesOrdersPage save mapper"
  );
  assertIncludes(
    salesOrderPage,
    "buildSalesOrderParams(",
    "V1SalesOrdersPage save mapper"
  );
  assertIncludes(
    salesOrderPage,
    "order_no: buildSequentialDraftCode(orders,",
    "V1SalesOrdersPage order no draft"
  );
  assertIncludes(
    salesOrderPage,
    "field: 'order_no'",
    "V1SalesOrdersPage order no draft"
  );
  assertIncludes(
    orderView,
    "export function buildSalesOrderCustomerSourceValues(customer = {})",
    "shared sales order customer source helper"
  );
  assertIncludes(
    orderView,
    "customer_snapshot: buildCustomerSnapshot(customer)",
    "shared sales order customer source helper"
  );
  assertIncludes(
    salesOrderForm,
    'name="customer_id"',
    "sales order customer field"
  );
  assertIncludes(
    salesOrderForm,
    "allowClear",
    "sales order customer source select"
  );
  assertIncludes(
    orderView,
    "order_no: trimOptional(values.order_no)",
    "shared sales order mapper"
  );
  assertIncludes(
    orderView,
    "customer_order_no: trimOptional(values.customer_order_no)",
    "shared sales order mapper"
  );
  assertIncludes(
    salesOrderService,
    'CustomerOrderNo:     getWorkflowStringPtr(pm, "customer_order_no")',
    "sales order JSON-RPC mapper"
  );
  assertIncludes(
    salesOrderRepo,
    "update.ClearCustomerOrderNo()",
    "sales order repo source no clear path"
  );
  assertIncludes(
    orderView,
    "contact_snapshot:",
    "shared sales order mapper"
  );
  assertIncludes(
    orderView,
    "price_condition_note: trimOptional(values.price_condition_note)",
    "shared sales order mapper"
  );
});

test("sales order line source switching clears stale SKU snapshots", () => {
  const salesOrderForm = read(
    "web/src/erp/components/sales-orders/SalesOrderForm.jsx"
  );
  const orderView = read("web/src/erp/utils/masterDataOrderView.mjs");

  assertIncludes(
    salesOrderForm,
    "buildSalesOrderItemSourceValuesFromSKU",
    "sales order form shared line source helper"
  );
  assertNotIncludes(
    salesOrderForm,
    "function buildOrderLineSourceValues(sku = {})",
    "sales order form must not restore page-private line source helper"
  );
  assertIncludes(
    orderView,
    "export function buildSalesOrderItemSourceValuesFromSKU(sku = {})",
    "shared sales order line source helper"
  );
  assertIncludes(
    orderView,
    "product_sku_id: undefined",
    "shared sales order line source helper empty branch"
  );
  assertIncludes(
    orderView,
    "product_id: undefined",
    "shared sales order line source helper empty branch"
  );
  assertIncludes(
    orderView,
    "unit_id: undefined",
    "shared sales order line source helper empty branch"
  );
  assertIncludes(
    orderView,
    "product_code_snapshot: ''",
    "shared sales order line source helper empty branch"
  );
  assertIncludes(
    orderView,
    "product_name_snapshot: ''",
    "shared sales order line source helper empty branch"
  );
  assertIncludes(
    orderView,
    "color_snapshot: ''",
    "shared sales order line source helper empty branch"
  );
  assertIncludes(
    salesOrderForm,
    "allowClear",
    "sales order line source select"
  );
  assertIncludes(
    salesOrderForm,
    "setOrderLineSourceFromSKU(form, field.name, sku)",
    "sales order line source select"
  );
  assertIncludes(
    orderView,
    "product_code_snapshot: trimOptional(values.product_code_snapshot)",
    "shared sales order line mapper"
  );
  assertIncludes(
    orderView,
    "product_name_snapshot: trimOptional(values.product_name_snapshot)",
    "shared sales order line mapper"
  );
  assertIncludes(
    orderView,
    "color_snapshot: trimOptional(values.color_snapshot)",
    "shared sales order line mapper"
  );
});

test("sales order print boundary stays explicit until a mapper is implemented", () => {
  const printBehaviorDoc = read("docs/打印模板字段与编辑行为清单.md");
  const printImplementationDoc = read("docs/打印模板实现原理.md");
  const printTemplates = read("web/src/erp/config/printTemplates.mjs");
  const printPreviewPage = read("web/src/erp/pages/PrintTemplatePreviewPage.jsx");

  assertIncludes(
    printBehaviorDoc,
    "当前正式模板包括 `采购合同`、`加工合同`、`物料分析明细表`、`色卡`、`作业指导书`",
    "print field behavior doc"
  );
  assertIncludes(
    printImplementationDoc,
    "当前正式模板包括 `采购合同`、`加工合同`、`物料分析明细表`、`色卡`、`作业指导书`",
    "print implementation doc"
  );
  assertIncludes(
    printBehaviorDoc,
    "它不是当前正式打印模板",
    "sales order print boundary"
  );
  assertIncludes(
    printImplementationDoc,
    "必须由对应领域模型显式生成打印草稿输入",
    "print implementation doc"
  );
  assertNotIncludes(
    printTemplates,
    "sales-order",
    "print template catalog must not register a sales order template"
  );
  assertNotIncludes(
    printTemplates,
    "sales_order",
    "print template catalog must not register sales order internals"
  );
  assertNotIncludes(
    printTemplates,
    "销售订单",
    "print template catalog must not expose a sales order print template"
  );
  assertIncludes(
    printPreviewPage,
    "printTemplateCatalog.find((item) => item.key === templateKey)",
    "print template preview must resolve templates only from the catalog"
  );
  assertIncludes(
    printPreviewPage,
    'return <Navigate to="/erp/print-center" replace />',
    "print template preview must redirect unknown template keys"
  );
});

test("sales order item field policy remains unpublished until detail and print chain are complete", () => {
  const runtimeManifestTest = read("scripts/qa/customer-config-runtime-manifest.test.mjs");
  const customerConfigBiz = read("server/internal/biz/customer_config.go");
  const printDoc = read("docs/打印模板字段与编辑行为清单.md");

  assertIncludes(
    runtimeManifestTest,
    'assert.equal(fieldPolicies["sales_order_items.default"], undefined)',
    "customer config runtime manifest test"
  );
  assertIncludes(
    customerConfigBiz,
    "runtimeFieldPolicySurfaceKeys",
    "customer config backend validator"
  );
  assertIncludes(
    customerConfigBiz,
    '"sales_orders.default"',
    "customer config backend validator"
  );
  assertNotIncludes(
    customerConfigBiz,
    '"sales_order_items.default"',
    "customer config backend validator"
  );
  assertIncludes(
    printDoc,
    "`sales_order_items.default` 尚未发布为 active field policy",
    "print field behavior doc"
  );
});

test("compiled customer packages expose only the sales order runtime surface", () => {
  for (const customerPackage of [yoyoosunCustomerPackage, demoCustomerPackage]) {
    const manifest = buildRuntimeManifest(customerPackage);
    const fieldPolicies = manifest.compiled_snapshot.fieldPolicies;

    assert.deepEqual(
      Object.keys(fieldPolicies).sort(),
      ["customers.default", "sales_orders.default", "suppliers.default"],
      `${customerPackage.customerKey} runtime manifest field policy surfaces`
    );
    assert.deepEqual(
      Object.keys(fieldPolicies["sales_orders.default"]).sort(),
      ["expected_ship_date", "order_no", "source_no"],
      `${customerPackage.customerKey} sales order field policy keys`
    );
    assert.equal(
      fieldPolicies["sales_order_items.default"],
      undefined,
      `${customerPackage.customerKey} must not publish sales order item field policy`
    );
    assert.equal(
      Object.values(fieldPolicies).some((surface) => surface.style_no),
      false,
      `${customerPackage.customerKey} must not publish draft style fields`
    );
    assert.equal(
      Object.values(fieldPolicies).some((surface) => surface.color_size),
      false,
      `${customerPackage.customerKey} must not publish draft color or size fields`
    );
  }
});
