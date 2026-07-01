import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

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

test("sales order print boundary stays explicit until a mapper is implemented", () => {
  const printBehaviorDoc = read("docs/打印模板字段与编辑行为清单.md");
  const printImplementationDoc = read("docs/打印模板实现原理.md");

  assertIncludes(
    printBehaviorDoc,
    "当前正式模板只有 `采购合同`、`加工合同` 两套",
    "print field behavior doc"
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
