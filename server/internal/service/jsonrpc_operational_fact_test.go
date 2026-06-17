package service

import (
	"io"
	"reflect"
	"testing"
	"time"

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

func TestShipmentItemParamsPreserveProductSKUTraceability(t *testing.T) {
	in, ok := shipmentItemCreateFromParams(map[string]any{
		"shipment_id":         float64(9),
		"sales_order_item_id": float64(31),
		"product_id":          float64(7),
		"product_sku_id":      float64(11),
		"warehouse_id":        float64(3),
		"unit_id":             float64(2),
		"quantity":            "5",
	})
	if !ok {
		t.Fatal("expected shipment item params to parse")
	}
	if in.ProductSkuID == nil || *in.ProductSkuID != 11 {
		t.Fatalf("expected product sku id 11, got %#v", in.ProductSkuID)
	}

	out := shipmentItemToAny(&biz.ShipmentItem{
		ID:               1,
		ShipmentID:       9,
		SalesOrderItemID: in.SalesOrderItemID,
		ProductID:        in.ProductID,
		ProductSkuID:     in.ProductSkuID,
		WarehouseID:      in.WarehouseID,
		UnitID:           in.UnitID,
		Quantity:         in.Quantity,
	})
	if !reflect.DeepEqual(out["product_sku_id"], 11) {
		t.Fatalf("expected product_sku_id in response, got %#v", out)
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

	withItemsParams := mustJSONRPCStruct(t, map[string]any{
		"shipment_no":     "SHP-JSONRPC-WITH-ITEMS-001",
		"idempotency_key": "SHP-JSONRPC-WITH-ITEMS-001",
		"items": []any{
			map[string]any{
				"product_id":   1,
				"warehouse_id": 1,
				"unit_id":      1,
				"quantity":     "1",
			},
		},
	})
	j = newOperationalFactJSONRPCTestData(oldOutboundAdmin)
	_, createWithItemsRes, err := j.handleOperationalFact(ctx, "create_shipment_with_items", "4a", withItemsParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createWithItemsRes == nil || createWithItemsRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected shipment create-with-items permission denied, got %#v", createWithItemsRes)
	}
	j = newOperationalFactJSONRPCTestData(createAdmin)
	_, createWithItemsRes, err = j.handleOperationalFact(ctx, "create_shipment_with_items", "4b", withItemsParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createWithItemsRes == nil || createWithItemsRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected usecase to run after shipment create-with-items permission, got %#v", createWithItemsRes)
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

func TestOperationalFactShipmentFilterFromParamsParsesDateRange(t *testing.T) {
	filter, ok := operationalFactShipmentFilterFromParams(mustJSONRPCStruct(t, map[string]any{
		"status":     "shipped",
		"date_field": "shipped_at",
		"date_from":  "2026-06-01",
		"date_to":    "2026-06-30",
		"limit":      float64(20),
	}).AsMap())
	if !ok {
		t.Fatal("expected shipment filter params to parse")
	}
	if filter.Status != "shipped" || filter.DateField != "shipped_at" || filter.Limit != 20 {
		t.Fatalf("unexpected filter %#v", filter)
	}
	expectedFrom := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	expectedTo := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	if filter.DateFrom == nil || !filter.DateFrom.Equal(expectedFrom) {
		t.Fatalf("unexpected date_from %#v", filter.DateFrom)
	}
	if filter.DateTo == nil || !filter.DateTo.Equal(expectedTo) {
		t.Fatalf("unexpected date_to %#v", filter.DateTo)
	}

	if _, ok := operationalFactShipmentFilterFromParams(mustJSONRPCStruct(t, map[string]any{
		"date_from": "not-a-date",
	}).AsMap()); ok {
		t.Fatal("expected invalid shipment date filter to be rejected")
	}
}

func TestOperationalFactFilterFromParamsParsesFactType(t *testing.T) {
	filter := operationalFactFilterFromParams(mustJSONRPCStruct(t, map[string]any{
		"status":    "posted",
		"fact_type": "receivable",
		"limit":     float64(20),
		"offset":    float64(5),
	}).AsMap())
	if filter.Status != "posted" || filter.FactType != "receivable" || filter.Limit != 20 || filter.Offset != 5 {
		t.Fatalf("unexpected filter %#v", filter)
	}
}
