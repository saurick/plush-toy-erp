package service

import (
	"testing"
	"time"

	"server/internal/biz"

	"github.com/shopspring/decimal"
)

func TestProductionExceptionMutationParamsStrictNumericContract(t *testing.T) {
	mutation, ok := productionExceptionMutationFromParams(map[string]any{"customer_key": biz.DefaultCustomerKey, "id": float64(3), "expected_version": float64(1), "reason": "批准", "approved_quantity": "2.500000"}, 9, true)
	if !ok || mutation.ID != 3 || mutation.ActorID != 9 || mutation.ApprovedQuantity == nil || !mutation.ApprovedQuantity.Equal(decimal.RequireFromString("2.5")) {
		t.Fatalf("mutation=%#v ok=%v", mutation, ok)
	}
	if _, ok := productionExceptionMutationFromParams(map[string]any{"id": float64(3), "expected_version": float64(1), "reason": "批准", "approved_quantity": float64(2.5)}, 9, true); ok {
		t.Fatal("binary float approved_quantity must be rejected")
	}
	if _, ok := productionExceptionMutationFromParams(map[string]any{"id": float64(3), "expected_version": float64(1), "reason": "批准", "forged_status": "APPROVED"}, 9, false); ok {
		t.Fatal("caller-controlled status must be rejected")
	}
}

func TestExceptionResponseKeepsAuditAndSourceFields(t *testing.T) {
	now := time.Unix(123, 0)
	batchID, actor := 4, 8
	quantity := decimal.RequireFromString("3.25")
	got := productionExceptionToAny(&biz.ProductionExceptionDecision{ID: 1, DecisionNo: "EX-1", DecisionType: biz.ProductionExceptionWIPConcession, Status: biz.ProductionExceptionApproved, ProductionOrderID: 2, ProductionOrderItemID: 3, ProductionWIPBatchID: &batchID, RequestedQuantity: quantity, ApprovedQuantity: &quantity, Version: 2, RequestedBy: actor, RequestedAt: now, DecidedBy: &actor, DecidedAt: &now})
	if got["production_wip_batch_id"] != batchID || got["approved_quantity"] != "3.25" || got["decided_by"] != actor || got["decided_at"] != int64(123) {
		t.Fatalf("response=%#v", got)
	}
}
