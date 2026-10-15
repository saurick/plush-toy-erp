package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"
)

type shipmentDraftSaveJSONRPCRepo struct {
	stubBusinessDashboardOperationalFactRepo
	calls int
	saved *biz.ShipmentDraftSave
	err   error
}

func (r *shipmentDraftSaveJSONRPCRepo) WarehouseIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentDraftSaveJSONRPCRepo) ProductIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentDraftSaveJSONRPCRepo) ProductSKUIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentDraftSaveJSONRPCRepo) UnitIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentDraftSaveJSONRPCRepo) CustomerIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentDraftSaveJSONRPCRepo) SaveShipmentDraftWithItems(_ context.Context, in *biz.ShipmentDraftSave) (*biz.Shipment, error) {
	r.calls++
	r.saved = in
	if r.err != nil {
		return nil, r.err
	}
	now := time.Date(2026, 8, 9, 0, 0, 0, 0, time.UTC)
	return &biz.Shipment{
		ID:             in.ID,
		ShipmentNo:     in.ShipmentNo,
		Status:         biz.ShipmentStatusDraft,
		Version:        in.ExpectedVersion + 1,
		IdempotencyKey: "unchanged-create-key",
		Items:          []*biz.ShipmentItem{},
		CreatedAt:      now,
		UpdatedAt:      now,
	}, nil
}

func shipmentDraftSaveJSONRPCParams(sourceBound bool) map[string]any {
	params := map[string]any{
		"id":                 41,
		"expected_version":   3,
		"shipment_no":        "SHIP-EDIT-041",
		"planned_ship_at":    "2026-08-10",
		"total_net_weight_g": "18.500000",
		"note":               "调整批次和数量",
		"items": []any{map[string]any{
			"product_id":   21,
			"warehouse_id": 22,
			"unit_id":      23,
			"quantity":     "2.500000",
			"note":         "更新行",
		}},
	}
	if sourceBound {
		params["sales_order_id"] = 11
		params["customer_id"] = 12
		params["customer_snapshot"] = "前端旧快照"
		params["items"].([]any)[0].(map[string]any)["sales_order_item_id"] = 13
	}
	return params
}

func TestJSONRPCSaveShipmentDraftUsesUpdatePermissionStrictParamsAndVersionProjection(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	repo := &shipmentDraftSaveJSONRPCRepo{}
	dispatcher := newOperationalFactJSONRPCTestDataWithRepo(
		t,
		shipmentSourceCandidateAdmin(
			biz.PermissionShipmentUpdate,
			biz.PermissionSalesOrderRead,
			biz.PermissionSalesOrderItemRead,
		),
		repo,
	)
	_, result, err := dispatcher.handleOperationalFact(
		ctx,
		"save_shipment_draft",
		"save",
		mustJSONRPCStruct(t, shipmentDraftSaveJSONRPCParams(true)),
	)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("save shipment draft result=%#v err=%v", result, err)
	}
	if repo.calls != 1 || repo.saved == nil || repo.saved.ID != 41 || repo.saved.ExpectedVersion != 3 {
		t.Fatalf("save input=%#v calls=%d", repo.saved, repo.calls)
	}
	shipment, ok := result.Data.AsMap()["shipment"].(map[string]any)
	if !ok || shipment["version"] != float64(4) || shipment["idempotency_key"] != "unchanged-create-key" {
		t.Fatalf("shipment projection=%#v", result.Data.AsMap()["shipment"])
	}

	invalid := shipmentDraftSaveJSONRPCParams(true)
	invalid["idempotency_key"] = "client-must-not-replace-create-key"
	_, invalidResult, err := dispatcher.handleOperationalFact(ctx, "save_shipment_draft", "invalid", mustJSONRPCStruct(t, invalid))
	if err != nil || invalidResult == nil || invalidResult.Code != errcode.InvalidParam.Code {
		t.Fatalf("unknown field result=%#v err=%v", invalidResult, err)
	}
	if repo.calls != 1 {
		t.Fatalf("strict-param rejection reached repository, calls=%d", repo.calls)
	}
}

func TestJSONRPCSaveShipmentDraftRequiresUpdateAndConditionalSourceReadPermissions(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	required := []string{
		biz.PermissionShipmentUpdate,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	}
	for missingIndex, missing := range required {
		t.Run("missing "+missing, func(t *testing.T) {
			permissions := append([]string(nil), required[:missingIndex]...)
			permissions = append(permissions, required[missingIndex+1:]...)
			repo := &shipmentDraftSaveJSONRPCRepo{}
			dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, shipmentSourceCandidateAdmin(permissions...), repo)
			_, result, err := dispatcher.handleOperationalFact(ctx, "save_shipment_draft", "denied", mustJSONRPCStruct(t, shipmentDraftSaveJSONRPCParams(true)))
			if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("missing %s result=%#v err=%v", missing, result, err)
			}
			if repo.calls != 0 {
				t.Fatalf("missing %s reached repository", missing)
			}
		})
	}

	t.Run("source-less sales delivery draft only needs update permission", func(t *testing.T) {
		repo := &shipmentDraftSaveJSONRPCRepo{}
		dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, shipmentSourceCandidateAdmin(biz.PermissionShipmentUpdate), repo)
		_, result, err := dispatcher.handleOperationalFact(ctx, "save_shipment_draft", "manual", mustJSONRPCStruct(t, shipmentDraftSaveJSONRPCParams(false)))
		if err != nil || result == nil || result.Code != errcode.OK.Code || repo.calls != 1 {
			t.Fatalf("manual draft result=%#v calls=%d err=%v", result, repo.calls, err)
		}
	})
}

func TestJSONRPCSaveShipmentDraftMapsFrozenDependencyToReadableBusinessError(t *testing.T) {
	repo := &shipmentDraftSaveJSONRPCRepo{err: biz.ErrShipmentDraftDependency}
	dispatcher := newOperationalFactJSONRPCTestDataWithRepo(
		t,
		shipmentSourceCandidateAdmin(biz.PermissionShipmentUpdate),
		repo,
	)
	_, result, err := dispatcher.handleOperationalFact(
		workflowJSONRPCAdminContext(),
		"save_shipment_draft",
		"frozen",
		mustJSONRPCStruct(t, shipmentDraftSaveJSONRPCParams(false)),
	)
	if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
		t.Fatalf("frozen draft result=%#v err=%v", result, err)
	}
	if !strings.Contains(result.Message, "内容已冻结") {
		t.Fatalf("frozen draft message=%q", result.Message)
	}
	if !errors.Is(repo.err, biz.ErrShipmentDraftDependency) || repo.calls != 1 {
		t.Fatalf("repository error/calls=%v/%d", repo.err, repo.calls)
	}
}
