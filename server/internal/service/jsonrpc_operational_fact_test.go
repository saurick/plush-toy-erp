package service

import (
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func newOperationalFactJSONRPCTestData(admin *biz.AdminUser) *jsonrpcDispatcher {
	logger := log.NewStdLogger(io.Discard)
	return &jsonrpcDispatcher{
		log:               log.NewHelper(log.With(logger, "module", "service.jsonrpc.operational_fact.test")),
		adminReader:       stubAdminAccountReader{admin: admin},
		operationalFactUC: biz.NewOperationalFactUsecase(&stubBusinessDashboardOperationalFactRepo{}),
	}
}

func TestJsonrpcDispatcher_ShipmentAPIRequiresDedicatedShipmentPermissions(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()

	oldOutboundAdmin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWarehouseOutboundRead, biz.PermissionWarehouseOutboundConfirm)
	j := newOperationalFactJSONRPCTestData(oldOutboundAdmin)
	_, listRes, err := j.handleOperationalFact(ctx, "list_shipments", "1", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected shipment read permission denied, got %#v", listRes)
	}

	readAdmin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionShipmentRead)
	j = newOperationalFactJSONRPCTestData(readAdmin)
	_, listRes, err = j.handleOperationalFact(ctx, "list_shipments", "2", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected shipment read OK, got %#v", listRes)
	}

	createParams := mustJSONRPCStruct(t, map[string]any{
		"shipment_no":     "SHP-JSONRPC-001",
		"idempotency_key": "SHP-JSONRPC-001",
	})
	_, createRes, err := j.handleOperationalFact(ctx, "create_shipment", "3", createParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected shipment create permission denied, got %#v", createRes)
	}

	createAdmin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionShipmentCreate)
	j = newOperationalFactJSONRPCTestData(createAdmin)
	_, createRes, err = j.handleOperationalFact(ctx, "create_shipment", "4", createParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected usecase to run after shipment create permission, got %#v", createRes)
	}

	shipAdmin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionShipmentShip)
	j = newOperationalFactJSONRPCTestData(shipAdmin)
	_, shipRes, err := j.handleOperationalFact(ctx, "ship_shipment", "5", mustJSONRPCStruct(t, map[string]any{"id": 99}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if shipRes == nil || shipRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected usecase to run after shipment ship permission, got %#v", shipRes)
	}

	cancelAdmin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionShipmentCancel)
	j = newOperationalFactJSONRPCTestData(cancelAdmin)
	_, cancelRes, err := j.handleOperationalFact(ctx, "cancel_shipment", "6", mustJSONRPCStruct(t, map[string]any{"id": 99}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelRes == nil || cancelRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected usecase to run after shipment cancel permission, got %#v", cancelRes)
	}
}
