import assert from "node:assert/strict";
import { manualAcceptanceBusinessNo } from "./manual-acceptance-source-driven-facts.mjs";
import { numeric20Scale6Units } from "../../web/src/erp/utils/numeric20Scale6.mjs";

const SOURCE_DEFINITIONS = Object.freeze({
  sales_order: {
    referenceKey: "salesOrders",
    status: "active",
    partyField: "customer_id",
    referenceParty: "customerId",
    partyType: "CUSTOMER",
    direction: "RECEIPT",
  },
  purchase_order: {
    referenceKey: "purchaseOrders",
    status: "approved",
    partyField: "supplier_id",
    referenceParty: "supplierId",
    partyType: "SUPPLIER",
    direction: "DISBURSEMENT",
  },
  outsourcing_order: {
    referenceKey: "outsourcingOrders",
    status: "confirmed",
    partyField: "supplier_id",
    referenceParty: "supplierId",
    partyType: "SUPPLIER",
    direction: "DISBURSEMENT",
  },
});
const STATUSES = [
  "DRAFT",
  "APPROVED",
  "REJECTED",
  "POSTED",
  "REVERSED",
  "CANCELLED",
];

export const MANUAL_ACCEPTANCE_CASH_PAYMENT_SCENARIOS = Object.freeze(
  ["ADVANCE", "REFUND"].flatMap((kind, kindIndex) =>
    Object.keys(SOURCE_DEFINITIONS).flatMap((sourceType, sourceIndex) =>
      STATUSES.flatMap((status, statusIndex) =>
        Array.from({ length: 3 }, (_, copy) => {
          const advanceDirection = SOURCE_DEFINITIONS[sourceType].direction;
          const direction =
            kind === "ADVANCE"
              ? advanceDirection
              : advanceDirection === "RECEIPT"
                ? "DISBURSEMENT"
                : "RECEIPT";
          return Object.freeze({
            key: `${kind}-${sourceType}-${status}-${copy + 1}`,
            kind,
            sourceType,
            status,
            copy,
            sourceOffset: statusIndex * 3 + copy,
            parentKey: `ADVANCE-${sourceType}-POSTED-${copy + 1}`,
            number: Object.freeze({
              code: direction === "RECEIPT" ? "SK" : "FK",
              sequence:
                2001 +
                kindIndex * 100 +
                sourceIndex * 20 +
                statusIndex * 3 +
                copy,
            }),
            direction,
          });
        }),
      ),
    ),
  ),
);

function positiveID(value, label) {
  assert.ok(
    Number.isSafeInteger(value) && value > 0,
    `${label} must have a persisted ID`,
  );
  return value;
}

export function selectManualAcceptanceCashSources(sourceReport) {
  return Object.fromEntries(
    Object.entries(SOURCE_DEFINITIONS).map(([type, definition]) => {
      const records = (
        sourceReport.referenceRecords[definition.referenceKey] || []
      )
        .slice()
        .sort((a, b) => a.orderNo.localeCompare(b.orderNo))
        .slice(-18);
      assert.ok(
        records.length >= 3,
        `${type} requires three independent source orders`,
      );
      assert.equal(
        new Set(records.map((record) => positiveID(record.id, type))).size,
        records.length,
      );
      return [type, records];
    }),
  );
}

function assertPayment(payment, expected, number) {
  positiveID(payment?.id, number);
  assert.equal(payment.payment_no, number);
  for (const [key, value] of Object.entries(expected))
    assert.equal(
      payment[key] ?? null,
      value ?? null,
      `${number}.${key} source or amount drifted`,
    );
  assert.ok(
    Array.isArray(payment.allocations),
    `${number} allocation readback is missing`,
  );
  assert.equal(
    payment.allocations.length,
    0,
    `${number} cash sample must not post an allocation or settle a finance fact`,
  );
}

export async function ensureManualAcceptanceCashPayments({
  rpc,
  plan,
  sourceReport,
  apply,
  readPayments,
  transitionPayment,
}) {
  const sources = selectManualAcceptanceCashSources(sourceReport);
  const cache = new Map(
    (await readPayments()).map((payment) => [payment.payment_no, payment]),
  );
  const byKey = new Map();
  const numberFor = (scenario) =>
    manualAcceptanceBusinessNo({
      dataVersion: plan.dataVersion,
      ...scenario.number,
    });
  for (const scenario of MANUAL_ACCEPTANCE_CASH_PAYMENT_SCENARIOS) {
    const definition = SOURCE_DEFINITIONS[scenario.sourceType];
    const number = numberFor(scenario);
    let expected;
    if (scenario.kind === "ADVANCE") {
      const pool = sources[scenario.sourceType];
      const reference = pool[scenario.sourceOffset % pool.length];
      const order = (
        await rpc({
          actor: "finance",
          domain: scenario.sourceType,
          method: `get_${scenario.sourceType}`,
          params: { id: reference.id },
        })
      )[scenario.sourceType];
      assert.equal(order?.id, reference.id, `${number} source order drifted`);
      assert.equal(
        order.lifecycle_status,
        definition.status,
        `${number} source order is not open for advance payment`,
      );
      assert.equal(
        positiveID(order[definition.partyField], number),
        reference[definition.referenceParty],
      );
      assert.ok(
        !order.source_wip_batch_id,
        `${number} must use an independent source contract`,
      );
      expected = {
        kind: "ADVANCE",
        direction: scenario.direction,
        counterparty_type: definition.partyType,
        counterparty_id: order[definition.partyField],
        currency: order.currency,
        amount: "100",
        source_type: scenario.sourceType,
        source_id: order.id,
        refund_of_payment_id: null,
      };
    } else {
      const parent = byKey.get(scenario.parentKey);
      positiveID(parent?.id, `${number} original advance`);
      assert.equal(parent.status, "POSTED");
      expected = {
        kind: "REFUND",
        direction: scenario.direction,
        counterparty_type: parent.counterparty_type,
        counterparty_id: parent.counterparty_id,
        currency: parent.currency,
        amount: "1",
        source_type: null,
        source_id: null,
        refund_of_payment_id: parent.id,
      };
    }
    let payment = cache.get(number);
    if (!payment && apply) {
      const fields = Object.fromEntries(
        Object.entries(expected).filter(([, value]) => value != null),
      );
      payment = (
        await rpc({
          actor: "finance",
          domain: "operational_fact",
          method: "create_finance_payment",
          params: {
            ...fields,
            payment_no: number,
            account_ref: "银行账户",
            evidence_ref: "银行回单",
            purpose_note:
              scenario.kind === "ADVANCE"
                ? "按订单约定支付首款"
                : "退还尚未使用的首款余额",
            idempotency_key: `manual-acceptance:${plan.dataVersion}:cash:${scenario.key}`,
          },
        })
      ).payment;
    }
    assertPayment(payment, expected, number);
    if (apply) payment = await transitionPayment(payment, scenario.status);
    if (scenario.status === "REVERSED" && payment.status === "POSTED" && apply)
      payment = (
        await rpc({
          actor: "finance",
          domain: "operational_fact",
          method: "reverse_finance_payment",
          params: {
            id: payment.id,
            expected_version: payment.version,
            reason: "收付凭证登记有误，冲销后重做",
          },
        })
      ).payment;
    assertPayment(payment, expected, number);
    assert.equal(
      payment.status,
      scenario.status,
      `${number} lifecycle state drifted`,
    );
    byKey.set(scenario.key, payment);
  }
  const final = new Map(
    (await readPayments()).map((payment) => [payment.payment_no, payment]),
  );
  const records = MANUAL_ACCEPTANCE_CASH_PAYMENT_SCENARIOS.map((scenario) => {
    const payment = final.get(numberFor(scenario));
    assert.equal(payment?.id, byKey.get(scenario.key).id);
    assert.equal(payment.status, scenario.status);
    if (scenario.kind === "ADVANCE" && scenario.status === "POSTED") {
      assert.equal(
        BigInt(numeric20Scale6Units(payment.refunded_amount)),
        1_000_000n,
        "posted refund balance must equal one",
      );
      assert.equal(
        BigInt(numeric20Scale6Units(payment.available_amount)),
        99_000_000n,
        "unused advance balance must survive refund and reversal",
      );
    }
    if (scenario.status === "REVERSED")
      assert.ok(
        payment.reversed_at > 0 && payment.reversed_by > 0,
        `${payment.payment_no} reversal audit is missing`,
      );
    return payment;
  });
  assert.equal(new Set(records.map((payment) => payment.id)).size, 108);
  return records;
}
