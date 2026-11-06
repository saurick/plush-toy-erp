// 收款、付款各保留三组完整生命周期样本，编号与幂等身份固定。
export const MANUAL_ACCEPTANCE_PAYMENT_SCENARIOS = Object.freeze(
  ["PAYABLE", "RECEIVABLE"].flatMap((factType) =>
    ["DRAFT", "APPROVED", "REJECTED", "POSTED", "REVERSED", "CANCELLED"].flatMap((status, stateIndex) =>
      Array.from({ length: 3 }, (_, index) => Object.freeze({
        key: `${factType}-${status}-${index + 1}`,
        factType,
        status,
        number: Object.freeze({ code: factType === "PAYABLE" ? "FK" : "SK", sequence: 1001 + stateIndex * 3 + index }),
        sourceOffset: stateIndex * 3 + index,
      })),
    ),
  ),
);
