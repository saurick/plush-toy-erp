package service

import (
	"context"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/shopspring/decimal"
)

type productionReworkRPCRepo struct {
	*productionModuleGateOperationalFactRepo
	input *biz.ProductionReworkFromCompletionCreate
}

func (r *productionReworkRPCRepo) CreateProductionReworkFromCompletion(_ context.Context, in *biz.ProductionReworkFromCompletionCreate) (*biz.ProductionFact, error) {
	r.input = in
	now := time.Now().UTC()
	sourceType := biz.ProductionFactSourceType
	sourceID := in.SourceCompletionFactID
	return &biz.ProductionFact{
		ID: 701, FactNo: in.FactNo, FactType: biz.ProductionFactRework,
		Status: biz.OperationalFactStatusDraft, SubjectType: biz.InventorySubjectProduct,
		SubjectID: 11, WarehouseID: 12, UnitID: 13, Quantity: in.Quantity,
		SourceType: &sourceType, SourceID: &sourceID, IdempotencyKey: in.IdempotencyKey,
		OccurredAt: in.OccurredAt, Note: &in.Reason, CreatedAt: now, UpdatedAt: now,
	}, nil
}

func TestProductionReworkSourceParamsAndExactPermission(t *testing.T) {
	base := map[string]any{
		"fact_no":                   "PF-REWORK-RPC-001",
		"source_completion_fact_id": float64(600),
		"quantity":                  "2",
		"reason":                    "成品抽检不合格",
		"idempotency_key":           "pf-rework-rpc-001",
	}
	parsed, ok := productionReworkFromCompletionCreateFromParams(base)
	if !ok || parsed.SourceCompletionFactID != 600 || !parsed.Quantity.Equal(decimal.NewFromInt(2)) || parsed.Reason != "成品抽检不合格" {
		t.Fatalf("source rework params = %#v, ok=%v", parsed, ok)
	}
	for _, forbidden := range []string{
		"fact_type", "subject_type", "subject_id", "product_sku_id", "warehouse_id", "unit_id", "lot_id", "source_type", "source_id", "source_line_id", "note",
	} {
		t.Run("reject_"+forbidden, func(t *testing.T) {
			params := make(map[string]any, len(base)+1)
			for key, value := range base {
				params[key] = value
			}
			params[forbidden] = "forged"
			if _, accepted := productionReworkFromCompletionCreateFromParams(params); accepted {
				t.Fatalf("derived field %s must be rejected", forbidden)
			}
		})
	}

	ctx := workflowJSONRPCAdminContext()
	repo := &productionReworkRPCRepo{productionModuleGateOperationalFactRepo: &productionModuleGateOperationalFactRepo{}}
	denied := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin(
		[]string{biz.ProductionRoleKey}, biz.PermissionProductionFactPost, biz.PermissionProductionFactCancel,
	), repo)
	activateOperationalFactTestCustomerConfig(t, denied, customerConfigPublishParamsWithRevisionAndModuleState(
		t, customerConfigPublishParams(t), "2026.07.14.production-rework-source-denied", "production", "enabled",
	))
	_, deniedResult, err := denied.handleOperationalFact(ctx, "create_production_rework_from_completion", "denied", mustJSONRPCStruct(t, base))
	if err != nil {
		t.Fatalf("denied transport error: %v", err)
	}
	if deniedResult == nil || deniedResult.Code != errcode.PermissionDenied.Code || repo.input != nil {
		t.Fatalf("broad production permissions must not create rework: result=%#v input=%#v", deniedResult, repo.input)
	}

	allowed := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin(
		[]string{biz.ProductionRoleKey},
		biz.PermissionProductionReworkCreate,
		biz.PermissionProductionFactRead,
		biz.PermissionPMCPlanRead,
	), repo)
	activateOperationalFactTestCustomerConfig(t, allowed, customerConfigPublishParamsWithRevisionAndModuleState(
		t, customerConfigPublishParams(t), "2026.07.14.production-rework-source-allowed", "production", "enabled",
	))
	_, result, err := allowed.handleOperationalFact(ctx, "create_production_rework_from_completion", "allowed", mustJSONRPCStruct(t, base))
	if err != nil {
		t.Fatalf("allowed transport error: %v", err)
	}
	if result == nil || result.Code != errcode.OK.Code || repo.input == nil || repo.input.SourceCompletionFactID != 600 {
		t.Fatalf("exact rework permission result=%#v input=%#v", result, repo.input)
	}
}
