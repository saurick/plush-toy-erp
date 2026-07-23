package service

import (
	"context"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/shopspring/decimal"
)

type productionExceptionReadOperationalFactRepo struct {
	stubBusinessDashboardOperationalFactRepo
}

func (productionExceptionReadOperationalFactRepo) ListProductionExceptions(
	_ context.Context,
	_ biz.ProductionExceptionFilter,
) ([]*biz.ProductionExceptionDecision, int, error) {
	return []*biz.ProductionExceptionDecision{}, 0, nil
}

func TestProductionExceptionReadsMatchPageAnyPermissionContract(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	for _, testCase := range []struct {
		roleKey    string
		permission string
	}{
		{roleKey: biz.PMCRoleKey, permission: biz.PermissionPMCRiskRead},
		{roleKey: biz.ProductionRoleKey, permission: biz.PermissionProductionFactRead},
		{roleKey: biz.QualityRoleKey, permission: biz.PermissionQualityExceptionHandle},
	} {
		t.Run(testCase.permission, func(t *testing.T) {
			dispatcher := newOperationalFactJSONRPCTestDataWithRepo(
				t,
				workflowJSONRPCAdmin([]string{testCase.roleKey}, testCase.permission),
				&productionExceptionReadOperationalFactRepo{},
			)
			activateOperationalFactTestCustomerConfig(
				t,
				dispatcher,
				customerConfigPublishParamsWithRevisionAndModuleState(
					t,
					customerConfigPublishParams(t),
					"2026.07.23.production-exception-read-"+testCase.roleKey,
					"production",
					"enabled",
				),
			)
			_, result, err := dispatcher.handleOperationalFact(
				ctx,
				"list_production_exceptions",
				testCase.permission,
				mustJSONRPCStruct(t, map[string]any{"limit": 20}),
			)
			if err != nil {
				t.Fatalf("list production exceptions err = %v", err)
			}
			if result == nil || result.Code != errcode.OK.Code {
				t.Fatalf("list production exceptions with %s = %#v, want OK", testCase.permission, result)
			}
		})
	}

	dispatcher := newOperationalFactJSONRPCTestData(
		t,
		workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionQualityInspectionRead),
	)
	_, result, err := dispatcher.handleOperationalFact(
		ctx,
		"list_production_exceptions",
		"denied",
		mustJSONRPCStruct(t, map[string]any{"limit": 20}),
	)
	if err != nil {
		t.Fatalf("list production exceptions denied err = %v", err)
	}
	if result == nil || result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("list production exceptions without page read permission = %#v, want permission denied", result)
	}
}

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
