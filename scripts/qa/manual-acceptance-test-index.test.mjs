import test from "node:test";
import assert from "node:assert/strict";
import {
  selectManualAcceptanceSamples,
  renderManualAcceptanceTestIndex,
} from "./manual-acceptance-test-index.mjs";
import { MANUAL_ACCEPTANCE_PAYMENT_SCENARIOS } from "./manual-acceptance-finance-scenarios.mjs";

test("payment recipes cover both directions and every legal lifecycle state three times", () => {
  assert.equal(MANUAL_ACCEPTANCE_PAYMENT_SCENARIOS.length, 36);
  assert.equal(
    new Set(MANUAL_ACCEPTANCE_PAYMENT_SCENARIOS.map(({ key }) => key)).size,
    36,
  );
  assert.equal(
    new Set(
      MANUAL_ACCEPTANCE_PAYMENT_SCENARIOS.map(
        ({ number }) => `${number.code}:${number.sequence}`,
      ),
    ).size,
    36,
  );
  for (const type of ["PAYABLE", "RECEIVABLE"])
    for (const state of [
      "DRAFT",
      "APPROVED",
      "REJECTED",
      "POSTED",
      "REVERSED",
      "CANCELLED",
    ]) {
      assert.equal(
        MANUAL_ACCEPTANCE_PAYMENT_SCENARIOS.filter(
          (sample) => sample.factType === type && sample.status === state,
        ).length,
        3,
      );
    }
});

test("sample index preserves state/type representatives with only locating fields", () => {
  const rows = Array.from({ length: 24 }, (_, index) => ({
    id: index + 1,
    payment_no: `SK-${index + 1}`,
    status: index < 12 ? "DRAFT" : "POSTED",
    direction: index % 2 ? "RECEIPT" : "DISBURSEMENT",
    payload: { secret: "do not copy" },
    token: "do not copy",
  }));
  const samples = selectManualAcceptanceSamples(
    { statusField: "status" },
    rows,
  );
  assert.equal(samples.length, 12);
  assert.equal(
    new Set(samples.map(({ state, kind }) => `${state}/${kind}`)).size,
    4,
  );
  assert.equal(JSON.stringify(samples).includes("do not copy"), false);
  const text = renderManualAcceptanceTestIndex({
    mode: "verify",
    target: "scenario-demo",
    dataVersion: "2026.11.07-v9",
    runId: "20261107-V9",
    generatedAt: "2026-11-07T01:00:00.000Z",
    targets: [
      {
        key: "finance-payments",
        title: "收付款",
        route: "/erp/finance/payments",
        probeIds: ["payments"],
        dataStatus: "pass",
        actual: 24,
      },
    ],
    probes: [{ id: "payments", roleKey: "finance", samples }],
  });
  assert.match(text, /SK-1/u);
  assert.match(text, /finance/u);
  assert.match(text, /财务 \/ demo_finance/u);
  assert.match(text, /2026.11.07-v9/u);
  assert.match(text, /收款.*付款/u);
  assert.equal(text.includes("do not copy"), false);
});

test("sample index refuses a plan without live readback", () => {
  assert.throws(
    () => renderManualAcceptanceTestIndex({ mode: "plan" }),
    /live readiness/u,
  );
});

test("index keeps product and SKU quantities separate and names the current-account entry", () => {
  const text = renderManualAcceptanceTestIndex({
    mode: "verify", target: "scenario-demo", dataVersion: "2026.11.07-v9", runId: "20261107-V9",
    generatedAt: "2026-11-07T01:00:00.000Z",
    targets: [{ key: "products", title: "产品档案", route: "/erp/base/products", probeIds: ["products", "product-skus"], dataStatus: "pass", actual: 24 }],
    probes: [{ id: "products", actual: 8 }, { id: "product-skus", actual: 24 }],
  });
  assert.match(text, /8 产品 \/ 24 SKU/u);
  assert.match(text, /当前登录账号/u);
});
