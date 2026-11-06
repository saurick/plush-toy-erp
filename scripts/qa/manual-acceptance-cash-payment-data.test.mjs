import test from "node:test";
import assert from "node:assert/strict";
import {
  MANUAL_ACCEPTANCE_CASH_PAYMENT_SCENARIOS,
  ensureManualAcceptanceCashPayments,
  selectManualAcceptanceCashSources,
} from "./manual-acceptance-cash-payment-data.mjs";
import { listAllFinancePageRecords } from "./manual-acceptance-fact-data.mjs";

function fixture({ size = 9, foreignSource = false } = {}) {
  const sourceReport = {
    referenceRecords: Object.fromEntries(
      ["salesOrders", "purchaseOrders", "outsourcingOrders"].map(
        (key, group) => [
          key,
          Array.from({ length: size }, (_, index) => ({
            id: (group + 1) * 1000 + index,
            orderNo: `SOURCE-${String(index).padStart(3, "0")}`,
            customerId: 8,
            supplierId: 9,
          })),
        ],
      ),
    ),
  };
  const payments = [];
  let writes = 0;
  const balances = () =>
    payments.map((payment) => {
      const refunded = payments.filter(
        (row) =>
          row.refund_of_payment_id === payment.id && row.status === "POSTED",
      ).length;
      return structuredClone({
        ...payment,
        refunded_amount: String(refunded),
        available_amount: String(Number(payment.amount) - refunded),
      });
    });
  const rpc = async ({ actor, domain, method, params }) => {
    assert.equal(actor, "finance");
    if (
      [
        "get_sales_order",
        "get_purchase_order",
        "get_outsourcing_order",
      ].includes(method)
    ) {
      const key = {
        sales_order: "salesOrders",
        purchase_order: "purchaseOrders",
        outsourcing_order: "outsourcingOrders",
      }[domain];
      const order = sourceReport.referenceRecords[key].find(
        (row) => row.id === params.id,
      );
      return {
        [domain]: {
          id: order.id,
          lifecycle_status: {
            sales_order: "active",
            purchase_order: "approved",
            outsourcing_order: "confirmed",
          }[domain],
          customer_id: order.customerId,
          supplier_id: order.supplierId,
          currency: "CNY",
          source_wip_batch_id: foreignSource ? 99 : null,
        },
      };
    }
    if (method === "create_finance_payment") {
      writes++;
      assert.ok(!payments.some((row) => row.payment_no === params.payment_no));
      const payment = {
        ...params,
        id: payments.length + 1,
        status: "DRAFT",
        version: 1,
        allocations: [],
        reversed_at: null,
        reversed_by: null,
      };
      payments.push(payment);
      return { payment: structuredClone(payment) };
    }
    if (method === "reverse_finance_payment") {
      writes++;
      const payment = payments.find((row) => row.id === params.id);
      assert.equal(payment.status, "POSTED");
      assert.equal(params.expected_version, payment.version);
      payment.status = "REVERSED";
      payment.version++;
      payment.reversed_at = 123;
      payment.reversed_by = 456;
      return { payment: structuredClone(payment) };
    }
    assert.fail(
      `cash seed must not post inventory, finance facts or allocations: ${method}`,
    );
  };
  const transitionPayment = async (original, desired) => {
    const payment = payments.find((row) => row.id === original.id);
    if (payment.status === "DRAFT" && desired !== "DRAFT") {
      writes++;
      payment.status = desired === "REVERSED" ? "POSTED" : desired;
      payment.version++;
    }
    return structuredClone(payment);
  };
  return {
    rpc,
    sourceReport,
    payments,
    readPayments: async () => balances(),
    transitionPayment,
    writes: () => writes,
    plan: { dataVersion: "2026.11.07-v9" },
  };
}

test("cash recipes cover all three source kinds, two cash types and six lifecycle states independently", () => {
  const recipes = MANUAL_ACCEPTANCE_CASH_PAYMENT_SCENARIOS;
  assert.equal(recipes.length, 108);
  assert.equal(new Set(recipes.map((item) => item.key)).size, 108);
  assert.equal(
    new Set(
      recipes.map((item) => `${item.number.code}-${item.number.sequence}`),
    ).size,
    108,
  );
  for (const kind of ["ADVANCE", "REFUND"])
    for (const source of ["sales_order", "purchase_order", "outsourcing_order"])
      for (const status of [
        "DRAFT",
        "APPROVED",
        "REJECTED",
        "POSTED",
        "REVERSED",
        "CANCELLED",
      ]) {
        assert.equal(
          recipes.filter(
            (item) =>
              item.kind === kind &&
              item.sourceType === source &&
              item.status === status,
          ).length,
          3,
        );
      }
});

test("cash sources remain bounded and deterministic for both data scales", () => {
  for (const size of [9, 90]) {
    const f = fixture({ size });
    const selected = selectManualAcceptanceCashSources(f.sourceReport);
    assert.equal(selected.sales_order.length, Math.min(size, 18));
    f.sourceReport.referenceRecords.salesOrders.reverse();
    assert.deepEqual(
      selectManualAcceptanceCashSources(f.sourceReport),
      selected,
    );
  }
});

test("cash apply and no-write replay preserve refunds, remaining balances and reversal links", async () => {
  const f = fixture();
  const first = await ensureManualAcceptanceCashPayments({ ...f, apply: true });
  assert.equal(first.length, 108);
  assert.equal(
    first.filter(
      (payment) => payment.kind === "ADVANCE" && payment.status === "POSTED",
    ).length,
    9,
  );
  for (const refund of first.filter((payment) => payment.kind === "REFUND")) {
    const parent = first.find(
      (payment) => payment.id === refund.refund_of_payment_id,
    );
    assert.equal(parent.kind, "ADVANCE");
    assert.notEqual(parent.direction, refund.direction);
    assert.equal(parent.counterparty_id, refund.counterparty_id);
    assert.equal(parent.currency, refund.currency);
  }
  const writes = f.writes();
  assert.deepEqual(
    await ensureManualAcceptanceCashPayments({ ...f, apply: false }),
    first,
  );
  assert.equal(f.writes(), writes);
  f.payments.find((row) => row.kind === "REFUND").refund_of_payment_id = 9999;
  await assert.rejects(
    () => ensureManualAcceptanceCashPayments({ ...f, apply: true }),
    /refund_of_payment_id/u,
  );
  assert.equal(f.writes(), writes);
});

test("cash preparation refuses a processing WIP source before creating any payment", async () => {
  const f = fixture({ foreignSource: true });
  await assert.rejects(
    () => ensureManualAcceptanceCashPayments({ ...f, apply: true }),
    /independent source contract/u,
  );
  assert.equal(f.writes(), 0);
});

test("cash replay requires explicit allocation evidence instead of treating a missing field as empty", async () => {
  const f = fixture();
  await ensureManualAcceptanceCashPayments({ ...f, apply: true });
  const writes = f.writes();
  f.payments[0].allocations = undefined;
  await assert.rejects(
    () => ensureManualAcceptanceCashPayments({ ...f, apply: false }),
    /allocation readback is missing/u,
  );
  assert.equal(f.writes(), writes);
});

test("finance page readback traverses every page and refuses duplicate or truncated results", async () => {
  const records = Array.from({ length: 251 }, (_, index) => ({
    id: index + 1,
  }));
  const offsets = [];
  const rpc = async ({ params }) => {
    offsets.push(params.offset);
    return {
      payments: records.slice(params.offset, params.offset + params.limit),
      total: records.length,
    };
  };
  assert.deepEqual(
    await listAllFinancePageRecords(rpc, "list_finance_payments", "payments"),
    records,
  );
  assert.deepEqual(offsets, [0, 200]);
  await assert.rejects(
    () =>
      listAllFinancePageRecords(
        async ({ params }) => ({
          payments: params.offset ? [] : records.slice(0, 200),
          total: 251,
        }),
        "list_finance_payments",
        "payments",
      ),
    /truncated/u,
  );
  await assert.rejects(
    () =>
      listAllFinancePageRecords(
        async ({ params }) => ({
          payments: params.offset ? [{ id: 1 }] : records.slice(0, 200),
          total: 201,
        }),
        "list_finance_payments",
        "payments",
      ),
    /duplicate/u,
  );
});
