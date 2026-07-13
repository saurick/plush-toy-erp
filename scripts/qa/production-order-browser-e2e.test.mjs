import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./production-order-browser-e2e.mjs", import.meta.url),
  "utf8",
);

test("production order browser E2E is localhost-only and routes requests to a real backend", () => {
  assert.match(source, /127\.0\.0\.1.*localhost.*::1/u);
  assert.match(source, /route\.continue/u);
  assert.doesNotMatch(source, /route\.fulfill|setupJsonRpcMockServer/u);
  assert.match(source, /path\.resolve\(process\.argv\[1\]/u);
  assert.match(source, /context\.addInitScript/u);
  assert.match(source, /PRODUCTION_ORDER_E2E_CUSTOMER_KEY/u);
  assert.doesNotMatch(source, /dispatchEvent\("click"\)|click\(\{ trial: true \}\)/u);
});

test("production order browser E2E covers lifecycle, stale recovery and role boundaries", () => {
  for (const text of [
    "create_production_order",
    "save_production_order",
    "记录已被其他操作更新，请刷新后重试",
    "确认发布",
    "短关闭原因",
    "确认取消",
    "demo_pmc",
    "demo_production",
    "demo_boss",
    "demo_sales",
    "superAdminUsername",
  ]) {
    assert.equal(
      source.includes(text),
      true,
      `missing browser evidence anchor: ${text}`,
    );
  }
});
