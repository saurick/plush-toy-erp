package service

import (
	"context"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"
)

type exactShipmentReadOperationalFactRepo struct {
	stubBusinessDashboardOperationalFactRepo
	getShipmentIDs []int
}

func (r *exactShipmentReadOperationalFactRepo) GetShipment(_ context.Context, shipmentID int) (*biz.Shipment, error) {
	r.getShipmentIDs = append(r.getShipmentIDs, shipmentID)
	now := time.Unix(1_752_787_200, 0)
	return &biz.Shipment{
		ID:             shipmentID,
		ShipmentNo:     "SHIP-EXACT-READ",
		Status:         biz.ShipmentStatusDraft,
		IdempotencyKey: "SHIP-EXACT-READ",
		CreatedAt:      now,
		UpdatedAt:      now,
	}, nil
}

func TestJsonrpcDispatcher_GetShipmentRequiresReadPermissionAndProjectsExactRecord(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	repo := &exactShipmentReadOperationalFactRepo{}

	denied := newOperationalFactJSONRPCTestDataWithRepo(
		t,
		workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}),
		repo,
	)
	_, deniedResult, err := denied.handleOperationalFact(
		ctx,
		"get_shipment",
		"denied",
		mustJSONRPCStruct(t, map[string]any{"id": float64(91)}),
	)
	if err != nil {
		t.Fatalf("get_shipment denied err = %v", err)
	}
	if deniedResult == nil || deniedResult.Code != errcode.PermissionDenied.Code {
		t.Fatalf("get_shipment without shipment.read = %#v, want permission denied", deniedResult)
	}
	if len(repo.getShipmentIDs) != 0 {
		t.Fatalf("permission denial must not read shipment, calls = %#v", repo.getShipmentIDs)
	}

	allowed := newOperationalFactJSONRPCTestDataWithRepo(
		t,
		workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionShipmentRead),
		repo,
	)
	_, result, err := allowed.handleOperationalFact(
		ctx,
		"get_shipment",
		"allowed",
		mustJSONRPCStruct(t, map[string]any{"id": float64(91)}),
	)
	if err != nil {
		t.Fatalf("get_shipment allowed err = %v", err)
	}
	if result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("get_shipment with shipment.read = %#v, want OK", result)
	}
	shipment, ok := result.Data.AsMap()["shipment"].(map[string]any)
	if !ok {
		t.Fatalf("get_shipment payload = %#v, want shipment projection", result.Data.AsMap())
	}
	if shipment["id"] != float64(91) || shipment["shipment_no"] != "SHIP-EXACT-READ" {
		t.Fatalf("get_shipment payload = %#v, want exact shipment 91", shipment)
	}
	if len(repo.getShipmentIDs) != 1 || repo.getShipmentIDs[0] != 91 {
		t.Fatalf("get_shipment repo calls = %#v, want [91]", repo.getShipmentIDs)
	}
}

func TestJsonrpcDispatcher_GetShipmentRejectsNonExactParams(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	repo := &exactShipmentReadOperationalFactRepo{}
	dispatcher := newOperationalFactJSONRPCTestDataWithRepo(
		t,
		workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionShipmentRead),
		repo,
	)

	for name, params := range map[string]map[string]any{
		"missing id": {},
		"zero id":    {"id": float64(0)},
		"extra field": {
			"id":      float64(91),
			"keyword": "91",
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, result, err := dispatcher.handleOperationalFact(
				ctx,
				"get_shipment",
				name,
				mustJSONRPCStruct(t, params),
			)
			if err != nil {
				t.Fatalf("get_shipment invalid params err = %v", err)
			}
			if result == nil || result.Code != errcode.InvalidParam.Code {
				t.Fatalf("get_shipment params %#v = %#v, want invalid params", params, result)
			}
		})
	}
	if len(repo.getShipmentIDs) != 0 {
		t.Fatalf("invalid get_shipment params must not read shipment, calls = %#v", repo.getShipmentIDs)
	}
}
