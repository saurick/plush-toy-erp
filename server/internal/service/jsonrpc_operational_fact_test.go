package service

import (
	"context"
	"io"
	"reflect"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"google.golang.org/protobuf/types/known/structpb"
)

func newOperationalFactJSONRPCTestData(t *testing.T, admin *biz.AdminUser) *jsonrpcDispatcher {
	t.Helper()
	return newOperationalFactJSONRPCTestDataWithRepo(t, admin, &stubBusinessDashboardOperationalFactRepo{})
}

func newOperationalFactJSONRPCTestDataWithRepo(t *testing.T, admin *biz.AdminUser, repo biz.OperationalFactRepo) *jsonrpcDispatcher {
	t.Helper()
	logger := log.NewStdLogger(io.Discard)
	customerConfigUC := biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo())
	dispatcher := &jsonrpcDispatcher{
		log:               log.NewHelper(log.With(logger, "module", "service.jsonrpc.operational_fact.test")),
		adminReader:       stubAdminAccountReader{admin: admin},
		operationalFactUC: biz.NewOperationalFactUsecase(repo),
		customerConfigUC:  customerConfigUC,
	}
	activateOperationalFactTestCustomerConfig(t, dispatcher, customerConfigPublishParams(t))
	return dispatcher
}

func activateOperationalFactTestCustomerConfig(t *testing.T, dispatcher *jsonrpcDispatcher, params *structpb.Struct) {
	t.Helper()
	if dispatcher == nil || dispatcher.customerConfigUC == nil {
		t.Fatalf("customerConfigUC missing")
	}
	in, ok := customerConfigPublishInputFromParams(params.AsMap())
	if !ok {
		t.Fatalf("invalid customer config params: %#v", params.AsMap())
	}
	if _, err := dispatcher.customerConfigUC.PublishCustomerConfig(context.Background(), in, 1); err != nil {
		t.Fatalf("publish customer config %s err = %v", in.Revision, err)
	}
	if _, err := dispatcher.customerConfigUC.ActivateCustomerConfig(context.Background(), in.CustomerKey, in.Revision, 1); err != nil {
		t.Fatalf("activate customer config %s err = %v", in.Revision, err)
	}
}

func TestMapOperationalFactError_IdempotencyConflict(t *testing.T) {
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{log: log.NewHelper(logger)}
	result := dispatcher.mapOperationalFactError(context.Background(), biz.ErrIdempotencyConflict)
	if result.Code != errcode.IdempotencyConflict.Code || result.Message != errcode.IdempotencyConflict.Message {
		t.Fatalf("unexpected idempotency conflict result: %#v", result)
	}
}

func TestMapOperationalFactError_ShipmentAndReservationGuards(t *testing.T) {
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{log: log.NewHelper(logger)}
	tests := []struct {
		name    string
		err     error
		message string
	}{
		{name: "shipment source", err: biz.ErrShipmentSourceMismatch, message: "出货来源与销售订单、客户或订单行不一致，请刷新来源后重试"},
		{name: "order inactive", err: biz.ErrShipmentOrderNotActive, message: "销售订单尚未生效或已关闭，不能确认出货"},
		{name: "shipment quantity", err: biz.ErrShipmentQuantityExceeded, message: "本次出货将超过销售订单行剩余可出货数量"},
		{name: "reservation split", err: biz.ErrShipmentReservationSplit, message: "本次出货小于对应的原子预留数量，请先释放并按本次出货数量重建预留"},
		{name: "reservation source", err: biz.ErrStockReservationSourceMismatch, message: "库存预留与销售订单或订单行不一致，请刷新来源后重试"},
		{name: "reservation quantity", err: biz.ErrStockReservationQuantityExceeded, message: "预留数量与已出货数量合计超过销售订单行数量"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := dispatcher.mapOperationalFactError(context.Background(), tt.err)
			if result.Code != errcode.InvalidParam.Code || result.Message != tt.message {
				t.Fatalf("unexpected result: %#v", result)
			}
		})
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

func TestStockReservationParamsPreserveProductSKUTraceability(t *testing.T) {
	in, ok := stockReservationCreateFromParams(map[string]any{
		"reservation_no":      "RSV-SKU-TRACE",
		"sales_order_id":      float64(8),
		"sales_order_item_id": float64(31),
		"product_id":          float64(7),
		"product_sku_id":      float64(11),
		"warehouse_id":        float64(3),
		"unit_id":             float64(2),
		"quantity":            "5",
		"idempotency_key":     "RSV-SKU-TRACE",
	})
	if !ok {
		t.Fatal("expected stock reservation params to parse")
	}
	if in.ProductSkuID == nil || *in.ProductSkuID != 11 {
		t.Fatalf("expected reservation product sku id 11, got %#v", in.ProductSkuID)
	}
	out := stockReservationToAny(&biz.StockReservation{
		ID:               1,
		ReservationNo:    in.ReservationNo,
		Status:           biz.StockReservationStatusActive,
		SalesOrderID:     in.SalesOrderID,
		SalesOrderItemID: in.SalesOrderItemID,
		ProductID:        in.ProductID,
		ProductSkuID:     in.ProductSkuID,
		WarehouseID:      in.WarehouseID,
		UnitID:           in.UnitID,
		Quantity:         in.Quantity,
		IdempotencyKey:   in.IdempotencyKey,
		ReservedAt:       time.Now(),
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	})
	if out["product_sku_id"] != 11 {
		t.Fatalf("expected reservation response product_sku_id 11, got %#v", out["product_sku_id"])
	}
}

func TestJsonrpcDispatcher_ShipmentAPIRequiresDedicatedShipmentPermissions(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()

	oldOutboundAdmin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWarehouseOutboundRead, biz.PermissionWarehouseOutboundConfirm)
	j := newOperationalFactJSONRPCTestData(t, oldOutboundAdmin)
	_, listRes, err := j.handleOperationalFact(ctx, "list_shipments", "1", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected shipment read permission denied, got %#v", listRes)
	}

	readAdmin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionShipmentRead)
	j = newOperationalFactJSONRPCTestData(t, readAdmin)
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
	j = newOperationalFactJSONRPCTestData(t, createAdmin)
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
	j = newOperationalFactJSONRPCTestData(t, oldOutboundAdmin)
	_, createWithItemsRes, err := j.handleOperationalFact(ctx, "create_shipment_with_items", "4a", withItemsParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createWithItemsRes == nil || createWithItemsRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected shipment create-with-items permission denied, got %#v", createWithItemsRes)
	}
	j = newOperationalFactJSONRPCTestData(t, createAdmin)
	_, createWithItemsRes, err = j.handleOperationalFact(ctx, "create_shipment_with_items", "4b", withItemsParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createWithItemsRes == nil || createWithItemsRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected usecase to run after shipment create-with-items permission, got %#v", createWithItemsRes)
	}

	shipAdmin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionShipmentShip)
	j = newOperationalFactJSONRPCTestData(t, shipAdmin)
	_, shipRes, err := j.handleOperationalFact(ctx, "ship_shipment", "5", mustJSONRPCStruct(t, map[string]any{"id": 99}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if shipRes == nil || shipRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected usecase to run after shipment ship permission, got %#v", shipRes)
	}

	cancelAdmin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionShipmentCancel)
	j = newOperationalFactJSONRPCTestData(t, cancelAdmin)
	_, cancelRes, err := j.handleOperationalFact(ctx, "cancel_shipment", "6", mustJSONRPCStruct(t, map[string]any{"id": 99}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelRes == nil || cancelRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected usecase to run after shipment cancel permission, got %#v", cancelRes)
	}
}

func TestJsonrpcDispatcher_ShipmentAPIRequiresEnabledModules(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey, biz.WarehouseRoleKey},
		biz.PermissionShipmentCreate,
		biz.PermissionShipmentRead,
		biz.PermissionShipmentShip,
		biz.PermissionShipmentCancel,
	)
	repo := &shipmentModuleGateOperationalFactRepo{}
	j := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)

	readOnlyShipmentConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.shipments-read-only",
		"shipments",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyShipmentConfig)

	_, createRes, err := j.handleOperationalFact(ctx, "create_shipment", "read-only-create", mustJSONRPCStruct(t, map[string]any{
		"shipment_no":     "SHIP-MODULE-READONLY",
		"idempotency_key": "SHIP-MODULE-READONLY",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only shipments create rejected, got %#v", createRes)
	}
	if repo.createShipmentCalls != 0 {
		t.Fatalf("read_only shipments must not create shipment, got %d calls", repo.createShipmentCalls)
	}
	_, listRes, err := j.handleOperationalFact(ctx, "list_shipments", "read-after-read-only", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err listing historical shipments, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_shipments to remain available for historical read, got %#v", listRes)
	}

	enabledConfig := customerConfigPublishParamsForRevision(t, "2026.06.28.shipments-enabled")
	activateOperationalFactTestCustomerConfig(t, j, enabledConfig)
	_, createEnabledRes, err := j.handleOperationalFact(ctx, "create_shipment", "enabled-create", mustJSONRPCStruct(t, map[string]any{
		"shipment_no":     "SHIP-MODULE-ENABLED",
		"idempotency_key": "SHIP-MODULE-ENABLED",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createEnabledRes == nil || createEnabledRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled create OK, got %#v", createEnabledRes)
	}
	_, createWithItemsRes, err := j.handleOperationalFact(ctx, "create_shipment_with_items", "enabled-create-with-items", mustJSONRPCStruct(t, map[string]any{
		"shipment_no":     "SHIP-MODULE-WITH-ITEMS",
		"idempotency_key": "SHIP-MODULE-WITH-ITEMS",
		"items": []any{
			map[string]any{
				"product_id":   1,
				"warehouse_id": 1,
				"unit_id":      1,
				"quantity":     "1",
			},
		},
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createWithItemsRes == nil || createWithItemsRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled create-with-items OK, got %#v", createWithItemsRes)
	}
	_, addItemRes, err := j.handleOperationalFact(ctx, "add_shipment_item", "enabled-add-item", mustJSONRPCStruct(t, map[string]any{
		"shipment_id":  100,
		"product_id":   1,
		"warehouse_id": 1,
		"unit_id":      1,
		"quantity":     "1",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if addItemRes == nil || addItemRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled add item OK, got %#v", addItemRes)
	}
	_, shipRes, err := j.handleOperationalFact(ctx, "ship_shipment", "enabled-ship", mustJSONRPCStruct(t, map[string]any{"id": 100}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if shipRes == nil || shipRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled ship OK, got %#v", shipRes)
	}
	_, cancelRes, err := j.handleOperationalFact(ctx, "cancel_shipment", "enabled-cancel", mustJSONRPCStruct(t, map[string]any{"id": 100}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelRes == nil || cancelRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled cancel OK, got %#v", cancelRes)
	}
	if repo.cancelShipmentActorID != 7 {
		t.Fatalf("expected authenticated shipment cancellation actor 7, got %d", repo.cancelShipmentActorID)
	}

	readOnlyInventoryConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.shipment-inventory-read-only",
		"inventory",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyInventoryConfig)

	_, shipReadOnlyRes, err := j.handleOperationalFact(ctx, "ship_shipment", "inventory-read-only-ship", mustJSONRPCStruct(t, map[string]any{"id": 100}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if shipReadOnlyRes == nil || shipReadOnlyRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected inventory read_only ship rejected, got %#v", shipReadOnlyRes)
	}
	_, cancelReadOnlyRes, err := j.handleOperationalFact(ctx, "cancel_shipment", "inventory-read-only-cancel", mustJSONRPCStruct(t, map[string]any{"id": 100}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelReadOnlyRes == nil || cancelReadOnlyRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected inventory read_only cancel rejected, got %#v", cancelReadOnlyRes)
	}
	if repo.shipShipmentCalls != 1 || repo.cancelShipmentCalls != 1 {
		t.Fatalf("inventory read_only must not call ship/cancel again, ship=%d cancel=%d", repo.shipShipmentCalls, repo.cancelShipmentCalls)
	}
}

func TestJsonrpcDispatcher_FinanceFactAPIRequiresEnabledModule(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := workflowJSONRPCAdmin(
		[]string{biz.FinanceRoleKey},
		biz.PermissionFinanceReceivableConfirm,
		biz.PermissionFinanceReceivableRead,
	)
	repo := &financeModuleGateOperationalFactRepo{}
	j := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)

	readOnlyFinanceConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.finance-read-only",
		"finance",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyFinanceConfig)

	_, createRes, err := j.handleOperationalFact(ctx, "create_finance_fact", "read-only-create", financeFactModuleGateParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only finance create rejected, got %#v", createRes)
	}
	if repo.createFinanceFactCalls != 0 {
		t.Fatalf("read_only finance must not create finance fact, got %d calls", repo.createFinanceFactCalls)
	}
	_, listRes, err := j.handleOperationalFact(ctx, "list_finance_facts", "read-after-read-only", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err listing historical finance facts, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_finance_facts to remain available for historical read, got %#v", listRes)
	}

	enabledConfig := customerConfigPublishParamsForRevision(t, "2026.06.28.finance-enabled")
	activateOperationalFactTestCustomerConfig(t, j, enabledConfig)
	_, createEnabledRes, err := j.handleOperationalFact(ctx, "create_finance_fact", "enabled-create", financeFactModuleGateParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createEnabledRes == nil || createEnabledRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled create finance OK, got %#v", createEnabledRes)
	}
	for _, tc := range []struct {
		method string
		id     string
	}{
		{method: "post_finance_fact", id: "enabled-post"},
		{method: "settle_finance_fact", id: "enabled-settle"},
		{method: "cancel_finance_fact", id: "enabled-cancel"},
	} {
		_, res, err := j.handleOperationalFact(ctx, tc.method, tc.id, mustJSONRPCStruct(t, map[string]any{"id": 300}))
		if err != nil {
			t.Fatalf("%s expected nil err, got %v", tc.method, err)
		}
		if res == nil || res.Code != errcode.OK.Code {
			t.Fatalf("%s expected enabled OK, got %#v", tc.method, res)
		}
	}

	disabledFinanceConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.finance-disabled",
		"finance",
		"disabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, disabledFinanceConfig)
	for _, tc := range []struct {
		method string
		id     string
	}{
		{method: "post_finance_fact", id: "disabled-post"},
		{method: "settle_finance_fact", id: "disabled-settle"},
		{method: "cancel_finance_fact", id: "disabled-cancel"},
	} {
		_, res, err := j.handleOperationalFact(ctx, tc.method, tc.id, mustJSONRPCStruct(t, map[string]any{"id": 300}))
		if err != nil {
			t.Fatalf("%s expected nil err, got %v", tc.method, err)
		}
		if res == nil || res.Code != errcode.InvalidParam.Code {
			t.Fatalf("%s expected disabled finance rejected, got %#v", tc.method, res)
		}
	}
	if repo.postFinanceFactCalls != 1 || repo.settleFinanceFactCalls != 1 || repo.cancelFinanceFactCalls != 1 {
		t.Fatalf("disabled finance must not call post/settle/cancel again, post=%d settle=%d cancel=%d", repo.postFinanceFactCalls, repo.settleFinanceFactCalls, repo.cancelFinanceFactCalls)
	}
	if repo.cancelFinanceFactActorID != 7 {
		t.Fatalf("expected authenticated finance cancellation actor 7, got %d", repo.cancelFinanceFactActorID)
	}
}

func TestJsonrpcDispatcher_ProductionFactAPIRequiresEnabledModule(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := workflowJSONRPCAdmin(
		[]string{biz.PMCRoleKey, biz.WarehouseRoleKey},
		biz.PermissionPMCPlanCreate,
		biz.PermissionPMCPlanUpdate,
		biz.PermissionPMCPlanRead,
		biz.PermissionWarehouseAdjustmentCreate,
		biz.PermissionWarehouseInventoryRead,
	)
	repo := &productionModuleGateOperationalFactRepo{}
	j := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)

	missingProductionConfig := customerConfigPublishParamsForRevision(t, "2026.06.28.production-missing")
	activateOperationalFactTestCustomerConfig(t, j, missingProductionConfig)
	_, missingCreateRes, err := j.handleOperationalFact(ctx, "create_production_fact", "missing-create", productionFactModuleGateParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if missingCreateRes == nil || missingCreateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected missing production module create rejected, got %#v", missingCreateRes)
	}
	if repo.createProductionFactCalls != 0 {
		t.Fatalf("missing production module must not create production fact, got %d calls", repo.createProductionFactCalls)
	}
	_, listRes, err := j.handleOperationalFact(ctx, "list_production_facts", "read-after-missing", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err listing historical production facts, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_production_facts to remain available for historical read, got %#v", listRes)
	}

	readOnlyProductionConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.production-read-only",
		"production",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyProductionConfig)
	_, readOnlyCreateRes, err := j.handleOperationalFact(ctx, "create_production_fact", "read-only-create", productionFactModuleGateParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if readOnlyCreateRes == nil || readOnlyCreateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only production create rejected, got %#v", readOnlyCreateRes)
	}

	enabledProductionConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.production-enabled",
		"production",
		"enabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, enabledProductionConfig)
	_, createEnabledRes, err := j.handleOperationalFact(ctx, "create_production_fact", "enabled-create", productionFactModuleGateParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createEnabledRes == nil || createEnabledRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled create production OK, got %#v", createEnabledRes)
	}
	_, postRes, err := j.handleOperationalFact(ctx, "post_production_fact", "enabled-post", mustJSONRPCStruct(t, map[string]any{"id": 500}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if postRes == nil || postRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled post production OK, got %#v", postRes)
	}
	_, cancelRes, err := j.handleOperationalFact(ctx, "cancel_production_fact", "enabled-cancel", mustJSONRPCStruct(t, map[string]any{"id": 500}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelRes == nil || cancelRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled cancel production OK, got %#v", cancelRes)
	}

	disabledProductionConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.production-disabled",
		"production",
		"disabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, disabledProductionConfig)
	for _, tc := range []struct {
		method string
		id     string
	}{
		{method: "post_production_fact", id: "disabled-post"},
		{method: "cancel_production_fact", id: "disabled-cancel"},
	} {
		_, res, err := j.handleOperationalFact(ctx, tc.method, tc.id, mustJSONRPCStruct(t, map[string]any{"id": 500}))
		if err != nil {
			t.Fatalf("%s expected nil err, got %v", tc.method, err)
		}
		if res == nil || res.Code != errcode.InvalidParam.Code {
			t.Fatalf("%s expected disabled production rejected, got %#v", tc.method, res)
		}
	}
	if repo.postProductionFactCalls != 1 || repo.cancelProductionFactCalls != 1 {
		t.Fatalf("disabled production must not call post/cancel again, post=%d cancel=%d", repo.postProductionFactCalls, repo.cancelProductionFactCalls)
	}
}

func TestJsonrpcDispatcher_OutsourcingFactAPIRequiresEnabledModule(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey, biz.WarehouseRoleKey},
		biz.PermissionPurchaseOrderCreate,
		biz.PermissionPurchaseOrderUpdate,
		biz.PermissionPurchaseOrderRead,
		biz.PermissionWarehouseAdjustmentCreate,
		biz.PermissionWarehouseInventoryRead,
	)
	repo := &outsourcingModuleGateOperationalFactRepo{}
	j := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)

	missingOutsourcingConfig := customerConfigPublishParamsForRevision(t, "2026.06.28.outsourcing-missing")
	activateOperationalFactTestCustomerConfig(t, j, missingOutsourcingConfig)
	_, missingCreateRes, err := j.handleOperationalFact(ctx, "create_outsourcing_fact", "missing-create", outsourcingFactModuleGateParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if missingCreateRes == nil || missingCreateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected missing outsourcing module create rejected, got %#v", missingCreateRes)
	}
	if repo.createOutsourcingFactCalls != 0 {
		t.Fatalf("missing outsourcing module must not create outsourcing fact, got %d calls", repo.createOutsourcingFactCalls)
	}
	_, listRes, err := j.handleOperationalFact(ctx, "list_outsourcing_facts", "read-after-missing", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err listing historical outsourcing facts, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_outsourcing_facts to remain available for historical read, got %#v", listRes)
	}

	readOnlyOutsourcingConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.outsourcing-read-only",
		"outsourcing_orders",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyOutsourcingConfig)
	_, readOnlyCreateRes, err := j.handleOperationalFact(ctx, "create_outsourcing_fact", "read-only-create", outsourcingFactModuleGateParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if readOnlyCreateRes == nil || readOnlyCreateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only outsourcing create rejected, got %#v", readOnlyCreateRes)
	}

	enabledOutsourcingConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.outsourcing-enabled",
		"outsourcing_orders",
		"enabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, enabledOutsourcingConfig)
	_, createEnabledRes, err := j.handleOperationalFact(ctx, "create_outsourcing_fact", "enabled-create", outsourcingFactModuleGateParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createEnabledRes == nil || createEnabledRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled create outsourcing OK, got %#v", createEnabledRes)
	}
	_, postRes, err := j.handleOperationalFact(ctx, "post_outsourcing_fact", "enabled-post", mustJSONRPCStruct(t, map[string]any{"id": 600}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if postRes == nil || postRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled post outsourcing OK, got %#v", postRes)
	}
	_, cancelRes, err := j.handleOperationalFact(ctx, "cancel_outsourcing_fact", "enabled-cancel", mustJSONRPCStruct(t, map[string]any{"id": 600}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelRes == nil || cancelRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled cancel outsourcing OK, got %#v", cancelRes)
	}

	disabledOutsourcingConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.outsourcing-disabled",
		"outsourcing_orders",
		"disabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, disabledOutsourcingConfig)
	for _, tc := range []struct {
		method string
		id     string
	}{
		{method: "post_outsourcing_fact", id: "disabled-post"},
		{method: "cancel_outsourcing_fact", id: "disabled-cancel"},
	} {
		_, res, err := j.handleOperationalFact(ctx, tc.method, tc.id, mustJSONRPCStruct(t, map[string]any{"id": 600}))
		if err != nil {
			t.Fatalf("%s expected nil err, got %v", tc.method, err)
		}
		if res == nil || res.Code != errcode.InvalidParam.Code {
			t.Fatalf("%s expected disabled outsourcing rejected, got %#v", tc.method, res)
		}
	}
	if repo.postOutsourcingFactCalls != 1 || repo.cancelOutsourcingFactCalls != 1 {
		t.Fatalf("disabled outsourcing must not call post/cancel again, post=%d cancel=%d", repo.postOutsourcingFactCalls, repo.cancelOutsourcingFactCalls)
	}
}

func TestJsonrpcDispatcher_StockReservationAPIRequiresEnabledInventoryModule(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey, biz.WarehouseRoleKey},
		biz.PermissionSalesOrderUpdate,
		biz.PermissionWarehouseInventoryRead,
		biz.PermissionWarehouseOutboundConfirm,
	)
	repo := &stockReservationModuleGateOperationalFactRepo{}
	j := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)

	readOnlyInventoryConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.stock-reservation-inventory-read-only",
		"inventory",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyInventoryConfig)

	_, createRes, err := j.handleOperationalFact(ctx, "create_stock_reservation", "read-only-create", stockReservationModuleGateParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only inventory create reservation rejected, got %#v", createRes)
	}
	if repo.createStockReservationCalls != 0 {
		t.Fatalf("read_only inventory must not create stock reservation, got %d calls", repo.createStockReservationCalls)
	}
	_, listRes, err := j.handleOperationalFact(ctx, "list_stock_reservations", "read-after-read-only", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err listing historical stock reservations, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_stock_reservations to remain available for historical read, got %#v", listRes)
	}

	enabledConfig := customerConfigPublishParamsForRevision(t, "2026.06.28.stock-reservation-inventory-enabled")
	activateOperationalFactTestCustomerConfig(t, j, enabledConfig)
	_, createEnabledRes, err := j.handleOperationalFact(ctx, "create_stock_reservation", "enabled-create", stockReservationModuleGateParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createEnabledRes == nil || createEnabledRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled create stock reservation OK, got %#v", createEnabledRes)
	}
	_, releaseRes, err := j.handleOperationalFact(ctx, "release_stock_reservation", "enabled-release", mustJSONRPCStruct(t, map[string]any{"id": 400}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if releaseRes == nil || releaseRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled release stock reservation OK, got %#v", releaseRes)
	}
	_, consumeRes, err := j.handleOperationalFact(ctx, "consume_stock_reservation", "enabled-consume", mustJSONRPCStruct(t, map[string]any{"id": 400}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if consumeRes == nil || consumeRes.Code != errcode.UnknownMethod.Code {
		t.Fatalf("expected independent reservation consume API removed, got %#v", consumeRes)
	}

	disabledInventoryConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.stock-reservation-inventory-disabled",
		"inventory",
		"disabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, disabledInventoryConfig)
	_, disabledReleaseRes, err := j.handleOperationalFact(ctx, "release_stock_reservation", "disabled-release", mustJSONRPCStruct(t, map[string]any{"id": 400}))
	if err != nil {
		t.Fatalf("release_stock_reservation expected nil err, got %v", err)
	}
	if disabledReleaseRes == nil || disabledReleaseRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("release_stock_reservation expected disabled inventory rejected, got %#v", disabledReleaseRes)
	}
	if repo.releaseStockReservationCalls != 1 {
		t.Fatalf("disabled inventory must not call release again, release=%d", repo.releaseStockReservationCalls)
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

func TestJsonrpcDispatcher_OperationalFactListsRejectInvalidDateFilters(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := workflowJSONRPCAdmin(
		[]string{biz.PMCRoleKey, biz.PurchaseRoleKey, biz.WarehouseRoleKey, biz.FinanceRoleKey},
		biz.PermissionPMCPlanRead,
		biz.PermissionPurchaseOrderRead,
		biz.PermissionWarehouseInventoryRead,
		biz.PermissionShipmentRead,
		biz.PermissionFinanceReceivableRead,
	)
	j := newOperationalFactJSONRPCTestData(t, admin)

	for _, tc := range []struct {
		method string
		params map[string]any
	}{
		{method: "list_production_facts", params: map[string]any{"date_from": "not-a-date"}},
		{method: "list_production_facts", params: map[string]any{"date_to": ""}},
		{method: "list_production_facts", params: map[string]any{"date_from": "2026-06-30", "date_to": "2026-06-01"}},
		{method: "list_outsourcing_facts", params: map[string]any{"date_to": "not-a-date"}},
		{method: "list_outsourcing_facts", params: map[string]any{"date_from": "2026-06-30", "date_to": "2026-06-01"}},
		{method: "list_shipments", params: map[string]any{"date_from": "not-a-date"}},
		{method: "list_shipments", params: map[string]any{"date_from": "2026-06-30", "date_to": "2026-06-01"}},
		{method: "list_stock_reservations", params: map[string]any{"date_from": "not-a-date"}},
		{method: "list_stock_reservations", params: map[string]any{"date_from": "2026-06-30", "date_to": "2026-06-01"}},
		{method: "list_finance_facts", params: map[string]any{"date_to": "not-a-date"}},
		{method: "list_finance_facts", params: map[string]any{"date_from": "2026-06-30", "date_to": "2026-06-01"}},
	} {
		t.Run(tc.method, func(t *testing.T) {
			_, res, err := j.handleOperationalFact(ctx, tc.method, "invalid-date", mustJSONRPCStruct(t, tc.params))
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.InvalidParam.Code {
				t.Fatalf("expected invalid param for bad operational fact date filter, got %#v", res)
			}
		})
	}
}

func TestJsonrpcDispatcher_OperationalFactListsRejectInvalidEnums(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := workflowJSONRPCAdmin(
		[]string{biz.PMCRoleKey, biz.PurchaseRoleKey, biz.WarehouseRoleKey, biz.FinanceRoleKey},
		biz.PermissionPMCPlanRead,
		biz.PermissionPurchaseOrderRead,
		biz.PermissionWarehouseInventoryRead,
		biz.PermissionShipmentRead,
		biz.PermissionFinanceReceivableRead,
	)
	j := newOperationalFactJSONRPCTestData(t, admin)

	for _, tc := range []struct {
		name   string
		method string
		params map[string]any
	}{
		{name: "production invalid status", method: "list_production_facts", params: map[string]any{"status": "settled"}},
		{name: "production invalid fact type", method: "list_production_facts", params: map[string]any{"fact_type": "receivable"}},
		{name: "outsourcing invalid status", method: "list_outsourcing_facts", params: map[string]any{"status": "settled"}},
		{name: "outsourcing invalid fact type", method: "list_outsourcing_facts", params: map[string]any{"fact_type": "input"}},
		{name: "shipment invalid status", method: "list_shipments", params: map[string]any{"status": "posted"}},
		{name: "shipment invalid date field", method: "list_shipments", params: map[string]any{"date_field": "occurred_at", "date_from": "2026-06-01"}},
		{name: "stock reservation invalid status", method: "list_stock_reservations", params: map[string]any{"status": "posted"}},
		{name: "stock reservation invalid date field", method: "list_stock_reservations", params: map[string]any{"date_field": "occurred_at", "date_from": "2026-06-01"}},
		{name: "finance invalid status", method: "list_finance_facts", params: map[string]any{"status": "active"}},
		{name: "finance invalid fact type", method: "list_finance_facts", params: map[string]any{"fact_type": "output"}},
		{name: "finance invalid date field", method: "list_finance_facts", params: map[string]any{"date_field": "reserved_at", "date_from": "2026-06-01"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, res, err := j.handleOperationalFact(ctx, tc.method, "invalid-enum", mustJSONRPCStruct(t, tc.params))
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.InvalidParam.Code {
				t.Fatalf("expected invalid param for bad operational fact filter, got %#v", res)
			}
		})
	}
}

type shipmentModuleGateOperationalFactRepo struct {
	stubBusinessDashboardOperationalFactRepo
	createShipmentCalls          int
	createShipmentWithItemsCalls int
	addShipmentItemCalls         int
	shipShipmentCalls            int
	cancelShipmentCalls          int
	cancelShipmentActorID        int
}

func (r *shipmentModuleGateOperationalFactRepo) ProductIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentModuleGateOperationalFactRepo) UnitIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentModuleGateOperationalFactRepo) WarehouseIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentModuleGateOperationalFactRepo) CreateShipmentDraft(_ context.Context, in *biz.ShipmentCreate) (*biz.Shipment, error) {
	r.createShipmentCalls++
	now := time.Now()
	return &biz.Shipment{
		ID:             100,
		ShipmentNo:     in.ShipmentNo,
		Status:         biz.ShipmentStatusDraft,
		IdempotencyKey: in.IdempotencyKey,
		PlannedShipAt:  in.PlannedShipAt,
		CreatedAt:      now,
		UpdatedAt:      now,
	}, nil
}

func (r *shipmentModuleGateOperationalFactRepo) CreateShipmentDraftWithItems(_ context.Context, in *biz.ShipmentCreateWithItems) (*biz.Shipment, error) {
	r.createShipmentWithItemsCalls++
	now := time.Now()
	out := &biz.Shipment{
		ID:             101,
		ShipmentNo:     in.Shipment.ShipmentNo,
		Status:         biz.ShipmentStatusDraft,
		IdempotencyKey: in.Shipment.IdempotencyKey,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	for idx, item := range in.Items {
		out.Items = append(out.Items, &biz.ShipmentItem{
			ID:               idx + 1,
			ShipmentID:       out.ID,
			SalesOrderItemID: item.SalesOrderItemID,
			ProductID:        item.ProductID,
			ProductSkuID:     item.ProductSkuID,
			WarehouseID:      item.WarehouseID,
			UnitID:           item.UnitID,
			LotID:            item.LotID,
			Quantity:         item.Quantity,
			Note:             item.Note,
			CreatedAt:        now,
			UpdatedAt:        now,
		})
	}
	return out, nil
}

func (r *shipmentModuleGateOperationalFactRepo) AddShipmentItem(_ context.Context, in *biz.ShipmentItemCreate) (*biz.ShipmentItem, error) {
	r.addShipmentItemCalls++
	now := time.Now()
	return &biz.ShipmentItem{
		ID:               201,
		ShipmentID:       in.ShipmentID,
		SalesOrderItemID: in.SalesOrderItemID,
		ProductID:        in.ProductID,
		ProductSkuID:     in.ProductSkuID,
		WarehouseID:      in.WarehouseID,
		UnitID:           in.UnitID,
		LotID:            in.LotID,
		Quantity:         in.Quantity,
		CreatedAt:        now,
		UpdatedAt:        now,
	}, nil
}

func (r *shipmentModuleGateOperationalFactRepo) ShipShipment(_ context.Context, shipmentID int) (*biz.Shipment, error) {
	r.shipShipmentCalls++
	now := time.Now()
	return &biz.Shipment{
		ID:        shipmentID,
		Status:    biz.ShipmentStatusShipped,
		ShippedAt: &now,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (r *shipmentModuleGateOperationalFactRepo) CancelShippedShipment(_ context.Context, shipmentID int) (*biz.Shipment, error) {
	r.cancelShipmentCalls++
	now := time.Now()
	return &biz.Shipment{
		ID:        shipmentID,
		Status:    biz.ShipmentStatusCancelled,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (r *shipmentModuleGateOperationalFactRepo) CancelShippedShipmentWithActor(ctx context.Context, shipmentID int, actorID int) (*biz.Shipment, error) {
	r.cancelShipmentActorID = actorID
	return r.CancelShippedShipment(ctx, shipmentID)
}

func financeFactModuleGateParams(t *testing.T) *structpb.Struct {
	t.Helper()
	return mustJSONRPCStruct(t, map[string]any{
		"fact_no":           "FIN-MODULE-GATE",
		"fact_type":         biz.FinanceFactReceivable,
		"counterparty_type": biz.FinanceCounterpartyCustomer,
		"counterparty_id":   float64(501),
		"amount":            "128.50",
		"currency":          biz.FinanceCurrencyCNY,
		"source_type":       biz.ShipmentSourceType,
		"source_id":         float64(9001),
		"idempotency_key":   "FIN-MODULE-GATE",
	})
}

type financeModuleGateOperationalFactRepo struct {
	stubBusinessDashboardOperationalFactRepo
	createFinanceFactCalls   int
	postFinanceFactCalls     int
	settleFinanceFactCalls   int
	cancelFinanceFactCalls   int
	cancelFinanceFactActorID int
}

func (r *financeModuleGateOperationalFactRepo) GetShipment(_ context.Context, shipmentID int) (*biz.Shipment, error) {
	customerID := 501
	return &biz.Shipment{
		ID:         shipmentID,
		CustomerID: &customerID,
		Status:     biz.ShipmentStatusShipped,
	}, nil
}

func (r *financeModuleGateOperationalFactRepo) CreateFinanceFactDraft(_ context.Context, in *biz.FinanceFactCreate) (*biz.FinanceFact, error) {
	r.createFinanceFactCalls++
	now := time.Now()
	return &biz.FinanceFact{
		ID:               300,
		FactNo:           in.FactNo,
		FactType:         in.FactType,
		Status:           biz.OperationalFactStatusDraft,
		CounterpartyType: in.CounterpartyType,
		CounterpartyID:   in.CounterpartyID,
		Amount:           in.Amount,
		FeeAmount:        in.FeeAmount,
		Currency:         in.Currency,
		IdempotencyKey:   in.IdempotencyKey,
		OccurredAt:       in.OccurredAt,
		CreatedAt:        now,
		UpdatedAt:        now,
	}, nil
}

func (r *financeModuleGateOperationalFactRepo) PostFinanceFact(_ context.Context, id int) (*biz.FinanceFact, error) {
	r.postFinanceFactCalls++
	now := time.Now()
	return &biz.FinanceFact{
		ID:               id,
		FactNo:           "FIN-MODULE-GATE",
		FactType:         biz.FinanceFactReceivable,
		Status:           biz.OperationalFactStatusPosted,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.RequireFromString("128.50"),
		Currency:         biz.FinanceCurrencyCNY,
		OccurredAt:       now,
		PostedAt:         &now,
		CreatedAt:        now,
		UpdatedAt:        now,
	}, nil
}

func (r *financeModuleGateOperationalFactRepo) SettleFinanceFact(_ context.Context, id int) (*biz.FinanceFact, error) {
	r.settleFinanceFactCalls++
	now := time.Now()
	return &biz.FinanceFact{
		ID:               id,
		FactNo:           "FIN-MODULE-GATE",
		FactType:         biz.FinanceFactReceivable,
		Status:           biz.OperationalFactStatusSettled,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.RequireFromString("128.50"),
		Currency:         biz.FinanceCurrencyCNY,
		OccurredAt:       now,
		SettledAt:        &now,
		CreatedAt:        now,
		UpdatedAt:        now,
	}, nil
}

func (r *financeModuleGateOperationalFactRepo) CancelPostedFinanceFact(_ context.Context, id int) (*biz.FinanceFact, error) {
	r.cancelFinanceFactCalls++
	now := time.Now()
	return &biz.FinanceFact{
		ID:               id,
		FactNo:           "FIN-MODULE-GATE",
		FactType:         biz.FinanceFactReceivable,
		Status:           biz.OperationalFactStatusCancelled,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.RequireFromString("128.50"),
		Currency:         biz.FinanceCurrencyCNY,
		OccurredAt:       now,
		CreatedAt:        now,
		UpdatedAt:        now,
	}, nil
}

func (r *financeModuleGateOperationalFactRepo) CancelPostedFinanceFactWithActor(ctx context.Context, id int, actorID int) (*biz.FinanceFact, error) {
	r.cancelFinanceFactActorID = actorID
	return r.CancelPostedFinanceFact(ctx, id)
}

func stockReservationModuleGateParams(t *testing.T) *structpb.Struct {
	t.Helper()
	return mustJSONRPCStruct(t, map[string]any{
		"reservation_no":  "RSV-MODULE-GATE",
		"product_id":      float64(1),
		"warehouse_id":    float64(1),
		"unit_id":         float64(1),
		"quantity":        "8",
		"idempotency_key": "RSV-MODULE-GATE",
	})
}

type stockReservationModuleGateOperationalFactRepo struct {
	stubBusinessDashboardOperationalFactRepo
	createStockReservationCalls  int
	releaseStockReservationCalls int
}

func (r *stockReservationModuleGateOperationalFactRepo) ProductIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *stockReservationModuleGateOperationalFactRepo) UnitIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *stockReservationModuleGateOperationalFactRepo) WarehouseIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *stockReservationModuleGateOperationalFactRepo) CreateStockReservation(_ context.Context, in *biz.StockReservationCreate) (*biz.StockReservation, error) {
	r.createStockReservationCalls++
	now := time.Now()
	return &biz.StockReservation{
		ID:             400,
		ReservationNo:  in.ReservationNo,
		Status:         biz.StockReservationStatusActive,
		ProductID:      in.ProductID,
		WarehouseID:    in.WarehouseID,
		UnitID:         in.UnitID,
		LotID:          in.LotID,
		Quantity:       in.Quantity,
		IdempotencyKey: in.IdempotencyKey,
		ReservedAt:     in.ReservedAt,
		CreatedAt:      now,
		UpdatedAt:      now,
	}, nil
}

func (r *stockReservationModuleGateOperationalFactRepo) ReleaseStockReservation(_ context.Context, id int) (*biz.StockReservation, error) {
	r.releaseStockReservationCalls++
	now := time.Now()
	return &biz.StockReservation{
		ID:         id,
		Status:     biz.StockReservationStatusReleased,
		Quantity:   decimal.RequireFromString("8"),
		ReservedAt: now,
		ReleasedAt: &now,
		CreatedAt:  now,
		UpdatedAt:  now,
	}, nil
}

func productionFactModuleGateParams(t *testing.T) *structpb.Struct {
	t.Helper()
	return mustJSONRPCStruct(t, map[string]any{
		"fact_no":         "PROD-MODULE-GATE",
		"fact_type":       biz.ProductionFactFinishedGoodsReceipt,
		"subject_type":    biz.InventorySubjectProduct,
		"subject_id":      float64(1),
		"warehouse_id":    float64(1),
		"unit_id":         float64(1),
		"quantity":        "12",
		"idempotency_key": "PROD-MODULE-GATE",
	})
}

type productionModuleGateOperationalFactRepo struct {
	stubBusinessDashboardOperationalFactRepo
	createProductionFactCalls int
	postProductionFactCalls   int
	cancelProductionFactCalls int
}

func (r *productionModuleGateOperationalFactRepo) ProductIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *productionModuleGateOperationalFactRepo) UnitIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *productionModuleGateOperationalFactRepo) WarehouseIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *productionModuleGateOperationalFactRepo) CreateProductionFactDraft(_ context.Context, in *biz.OperationalFactMutation) (*biz.ProductionFact, error) {
	r.createProductionFactCalls++
	now := time.Now()
	return &biz.ProductionFact{
		ID:             500,
		FactNo:         in.FactNo,
		FactType:       in.FactType,
		Status:         biz.OperationalFactStatusDraft,
		SubjectType:    in.SubjectType,
		SubjectID:      in.SubjectID,
		WarehouseID:    in.WarehouseID,
		UnitID:         in.UnitID,
		LotID:          in.LotID,
		Quantity:       in.Quantity,
		IdempotencyKey: in.IdempotencyKey,
		OccurredAt:     in.OccurredAt,
		CreatedAt:      now,
		UpdatedAt:      now,
	}, nil
}

func (r *productionModuleGateOperationalFactRepo) PostProductionFact(_ context.Context, id int) (*biz.ProductionFact, error) {
	r.postProductionFactCalls++
	now := time.Now()
	return &biz.ProductionFact{
		ID:          id,
		FactNo:      "PROD-MODULE-GATE",
		FactType:    biz.ProductionFactFinishedGoodsReceipt,
		Status:      biz.OperationalFactStatusPosted,
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   1,
		WarehouseID: 1,
		UnitID:      1,
		Quantity:    decimal.RequireFromString("12"),
		OccurredAt:  now,
		PostedAt:    &now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (r *productionModuleGateOperationalFactRepo) CancelPostedProductionFact(_ context.Context, id int) (*biz.ProductionFact, error) {
	r.cancelProductionFactCalls++
	now := time.Now()
	return &biz.ProductionFact{
		ID:          id,
		FactNo:      "PROD-MODULE-GATE",
		FactType:    biz.ProductionFactFinishedGoodsReceipt,
		Status:      biz.OperationalFactStatusCancelled,
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   1,
		WarehouseID: 1,
		UnitID:      1,
		Quantity:    decimal.RequireFromString("12"),
		OccurredAt:  now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func outsourcingFactModuleGateParams(t *testing.T) *structpb.Struct {
	t.Helper()
	return mustJSONRPCStruct(t, map[string]any{
		"fact_no":         "OUT-MODULE-GATE",
		"fact_type":       biz.OutsourcingFactMaterialIssue,
		"subject_type":    biz.InventorySubjectMaterial,
		"subject_id":      float64(1),
		"warehouse_id":    float64(1),
		"unit_id":         float64(1),
		"quantity":        "6",
		"idempotency_key": "OUT-MODULE-GATE",
	})
}

type outsourcingModuleGateOperationalFactRepo struct {
	stubBusinessDashboardOperationalFactRepo
	createOutsourcingFactCalls int
	postOutsourcingFactCalls   int
	cancelOutsourcingFactCalls int
}

func (r *outsourcingModuleGateOperationalFactRepo) MaterialIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *outsourcingModuleGateOperationalFactRepo) UnitIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *outsourcingModuleGateOperationalFactRepo) WarehouseIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *outsourcingModuleGateOperationalFactRepo) SupplierIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *outsourcingModuleGateOperationalFactRepo) CreateOutsourcingFactDraft(_ context.Context, in *biz.OperationalFactMutation) (*biz.OutsourcingFact, error) {
	r.createOutsourcingFactCalls++
	now := time.Now()
	return &biz.OutsourcingFact{
		ID:             600,
		FactNo:         in.FactNo,
		FactType:       in.FactType,
		Status:         biz.OperationalFactStatusDraft,
		SubjectType:    in.SubjectType,
		SubjectID:      in.SubjectID,
		WarehouseID:    in.WarehouseID,
		UnitID:         in.UnitID,
		LotID:          in.LotID,
		Quantity:       in.Quantity,
		SupplierID:     in.SupplierID,
		SupplierName:   in.SupplierName,
		IdempotencyKey: in.IdempotencyKey,
		OccurredAt:     in.OccurredAt,
		CreatedAt:      now,
		UpdatedAt:      now,
	}, nil
}

func (r *outsourcingModuleGateOperationalFactRepo) PostOutsourcingFact(_ context.Context, id int) (*biz.OutsourcingFact, error) {
	r.postOutsourcingFactCalls++
	now := time.Now()
	return &biz.OutsourcingFact{
		ID:          id,
		FactNo:      "OUT-MODULE-GATE",
		FactType:    biz.OutsourcingFactMaterialIssue,
		Status:      biz.OperationalFactStatusPosted,
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   1,
		WarehouseID: 1,
		UnitID:      1,
		Quantity:    decimal.RequireFromString("6"),
		OccurredAt:  now,
		PostedAt:    &now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (r *outsourcingModuleGateOperationalFactRepo) CancelPostedOutsourcingFact(_ context.Context, id int) (*biz.OutsourcingFact, error) {
	r.cancelOutsourcingFactCalls++
	now := time.Now()
	return &biz.OutsourcingFact{
		ID:          id,
		FactNo:      "OUT-MODULE-GATE",
		FactType:    biz.OutsourcingFactMaterialIssue,
		Status:      biz.OperationalFactStatusCancelled,
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   1,
		WarehouseID: 1,
		UnitID:      1,
		Quantity:    decimal.RequireFromString("6"),
		OccurredAt:  now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func TestOperationalFactFilterFromParamsParsesFactType(t *testing.T) {
	filter, ok := operationalFactFilterFromParams(mustJSONRPCStruct(t, map[string]any{
		"status":          "posted",
		"fact_type":       "receivable",
		"keyword":         "FIN-001",
		"subject_type":    "product",
		"subject_id":      float64(11),
		"warehouse_id":    float64(12),
		"lot_id":          float64(13),
		"source_type":     "shipment",
		"source_id":       float64(14),
		"customer_id":     float64(15),
		"product_id":      float64(16),
		"product_sku_id":  float64(17),
		"counterparty_id": float64(18),
		"limit":           float64(20),
		"offset":          float64(5),
	}).AsMap())
	if !ok {
		t.Fatal("expected operational fact filter params to parse")
	}
	if filter.Status != "posted" ||
		filter.FactType != "receivable" ||
		filter.Keyword != "FIN-001" ||
		filter.SubjectType != "product" ||
		filter.SubjectID != 11 ||
		filter.WarehouseID != 12 ||
		filter.LotID != 13 ||
		filter.SourceType != "shipment" ||
		filter.SourceID != 14 ||
		filter.CustomerID != 15 ||
		filter.ProductID != 16 ||
		filter.ProductSkuID != 17 ||
		filter.CounterpartyID != 18 ||
		filter.Limit != 20 ||
		filter.Offset != 5 {
		t.Fatalf("unexpected filter %#v", filter)
	}
}

func TestFinanceFactCreateFromParamsParsesFeeAndCurrency(t *testing.T) {
	input, ok := financeFactCreateFromParams(mustJSONRPCStruct(t, map[string]any{
		"fact_no":           "AR-JSONRPC-001",
		"fact_type":         "RECEIVABLE",
		"counterparty_type": "CUSTOMER",
		"amount":            "100.50",
		"fee_amount":        "1.25",
		"currency":          "HKD",
		"collection_type":   "ACCOUNTS_RECEIVABLE",
		"payment_term":      "CASH_ON_SHIPMENT",
		"payment_term_days": float64(0),
		"invoice_category":  "VAT_SPECIAL_13",
		"idempotency_key":   "AR-JSONRPC-001",
	}).AsMap())
	if !ok {
		t.Fatal("expected finance fact params to parse")
	}
	if input.Currency != "HKD" {
		t.Fatalf("unexpected currency %q", input.Currency)
	}
	if input.FeeAmount.String() != "1.25" {
		t.Fatalf("unexpected fee amount %s", input.FeeAmount)
	}
	if input.CollectionType == nil || *input.CollectionType != biz.FinanceCollectionAccountsReceivable {
		t.Fatalf("unexpected collection type %#v", input.CollectionType)
	}
	if input.PaymentTerm == nil || *input.PaymentTerm != biz.FinancePaymentTermCashOnShipment {
		t.Fatalf("unexpected payment term %#v", input.PaymentTerm)
	}
	if input.PaymentTermDays == nil || *input.PaymentTermDays != 0 {
		t.Fatalf("expected payment term days 0, got %#v", input.PaymentTermDays)
	}
	if input.InvoiceCategory == nil || *input.InvoiceCategory != biz.FinanceInvoiceCategoryVATSpecial13 {
		t.Fatalf("unexpected invoice category %#v", input.InvoiceCategory)
	}
	output := financeFactToAny(&biz.FinanceFact{
		ID:               1,
		FactNo:           input.FactNo,
		FactType:         input.FactType,
		CounterpartyType: input.CounterpartyType,
		Amount:           input.Amount,
		FeeAmount:        input.FeeAmount,
		Currency:         input.Currency,
		CollectionType:   input.CollectionType,
		PaymentTerm:      input.PaymentTerm,
		PaymentTermDays:  input.PaymentTermDays,
		InvoiceCategory:  input.InvoiceCategory,
	})
	if output["payment_term_days"] != 0 {
		t.Fatalf("expected response payment_term_days 0, got %#v", output)
	}
	if output["invoice_category"] != biz.FinanceInvoiceCategoryVATSpecial13 {
		t.Fatalf("expected response invoice category, got %#v", output)
	}
}
