package service

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestJsonrpcDispatcher_InventoryLedgerReadOnlyLists(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_inventory_ledger")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newInventoryJSONRPCTestData(data, workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWarehouseInventoryRead,
	))
	adminCtx := workflowJSONRPCAdminContext()

	lot, err := j.inventoryUC.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType:   biz.InventorySubjectMaterial,
		SubjectID:     fixtures.materialID,
		LotNo:         "INV-LEDGER-LOT-001",
		SupplierLotNo: inventoryStringPtr("SUP-LOT-001"),
		Status:        biz.InventoryLotActive,
		ReceivedAt:    inventoryTimePtr(time.Date(2026, 6, 17, 8, 0, 0, 0, time.UTC)),
	})
	if err != nil {
		t.Fatalf("create inventory lot failed: %v", err)
	}
	sourceID := 77
	sourceLineID := 88
	createdBy := 9
	applied, err := j.inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &lot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       inventoryDecimal(t, "12.5"),
		UnitID:         fixtures.unitID,
		SourceType:     "MANUAL_SEED",
		SourceID:       &sourceID,
		SourceLineID:   &sourceLineID,
		IdempotencyKey: "INV-LEDGER-TXN-001",
		OccurredAt:     time.Date(2026, 6, 17, 9, 30, 0, 0, time.UTC),
		CreatedBy:      &createdBy,
		Note:           inventoryStringPtr("ledger seed"),
	})
	if err != nil {
		t.Fatalf("apply inventory txn failed: %v", err)
	}
	if applied.Balance == nil {
		t.Fatalf("expected balance after apply, got %#v", applied)
	}

	_, balanceRes, err := j.handleInventory(adminCtx, "list_inventory_balances", "1", mustJSONRPCStruct(t, map[string]any{
		"subject_type": biz.InventorySubjectMaterial,
		"subject_id":   float64(fixtures.materialID),
		"warehouse_id": float64(fixtures.warehouseID),
		"lot_id":       float64(lot.ID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if balanceRes == nil || balanceRes.Code != errcode.OK.Code {
		t.Fatalf("expected balance list OK, got %#v", balanceRes)
	}
	balanceData := balanceRes.Data.AsMap()
	if total := jsonRPCInt(t, balanceData, "total"); total != 1 {
		t.Fatalf("expected one inventory balance, got %d", total)
	}
	balances := jsonRPCList(t, balanceData, "inventory_balances")
	balance := balances[0].(map[string]any)
	if got := balance["quantity"]; got != "12.5" {
		t.Fatalf("expected balance quantity 12.5, got %#v", got)
	}
	if got := jsonRPCInt(t, balance, "lot_id"); got != lot.ID {
		t.Fatalf("expected balance lot_id %d, got %d", lot.ID, got)
	}

	_, lotRes, err := j.handleInventory(adminCtx, "list_inventory_lots", "2", mustJSONRPCStruct(t, map[string]any{
		"status":       biz.InventoryLotActive,
		"keyword":      "INV-LEDGER-LOT",
		"warehouse_id": float64(fixtures.warehouseID),
		"date_from":    "2026-06-17",
		"date_to":      "2026-06-17",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if lotRes == nil || lotRes.Code != errcode.OK.Code {
		t.Fatalf("expected lot list OK, got %#v", lotRes)
	}
	lots := jsonRPCList(t, lotRes.Data.AsMap(), "inventory_lots")
	if len(lots) != 1 {
		t.Fatalf("expected one inventory lot, got %#v", lots)
	}
	listedLot := lots[0].(map[string]any)
	if got := listedLot["lot_no"]; got != "INV-LEDGER-LOT-001" {
		t.Fatalf("expected lot no in list, got %#v", got)
	}

	_, txnRes, err := j.handleInventory(adminCtx, "list_inventory_txns", "3", mustJSONRPCStruct(t, map[string]any{
		"txn_type":     biz.InventoryTxnIn,
		"source_type":  "MANUAL_SEED",
		"warehouse_id": float64(fixtures.warehouseID),
		"lot_id":       float64(lot.ID),
		"keyword":      "ledger",
		"date_from":    "2026-06-17",
		"date_to":      "2026-06-17",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if txnRes == nil || txnRes.Code != errcode.OK.Code {
		t.Fatalf("expected txn list OK, got %#v", txnRes)
	}
	txns := jsonRPCList(t, txnRes.Data.AsMap(), "inventory_txns")
	if len(txns) != 1 {
		t.Fatalf("expected one inventory txn, got %#v", txns)
	}
	txn := txns[0].(map[string]any)
	if got := txn["idempotency_key"]; got != "INV-LEDGER-TXN-001" {
		t.Fatalf("expected idempotency key in list, got %#v", got)
	}
	if got := txn["source_type"]; got != "MANUAL_SEED" {
		t.Fatalf("expected source type MANUAL_SEED, got %#v", got)
	}

	if _, err := j.inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       inventoryDecimal(t, "12.5"),
		UnitID:         fixtures.unitID,
		SourceType:     "MANUAL_SEED",
		IdempotencyKey: "INV-LEDGER-PRODUCT-TXN-001",
		OccurredAt:     time.Date(2026, 6, 17, 10, 30, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("seed product inventory balance failed: %v", err)
	}
	if _, err := client.StockReservation.Create().
		SetReservationNo("RSV-LEDGER-ACTIVE-001").
		SetStatus(biz.StockReservationStatusActive).
		SetProductID(fixtures.productID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(inventoryDecimal(t, "4")).
		SetIdempotencyKey("RSV-LEDGER-ACTIVE-001").
		Save(ctx); err != nil {
		t.Fatalf("seed active stock reservation failed: %v", err)
	}
	releasedAt := time.Date(2026, 6, 17, 11, 30, 0, 0, time.UTC)
	if _, err := client.StockReservation.Create().
		SetReservationNo("RSV-LEDGER-RELEASED-001").
		SetStatus(biz.StockReservationStatusReleased).
		SetProductID(fixtures.productID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(inventoryDecimal(t, "2")).
		SetIdempotencyKey("RSV-LEDGER-RELEASED-001").
		SetReleasedAt(releasedAt).
		Save(ctx); err != nil {
		t.Fatalf("seed released stock reservation failed: %v", err)
	}
	_, productBalanceRes, err := j.handleInventory(adminCtx, "list_inventory_balances", "4", mustJSONRPCStruct(t, map[string]any{
		"subject_type": biz.InventorySubjectProduct,
		"subject_id":   float64(fixtures.productID),
		"warehouse_id": float64(fixtures.warehouseID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if productBalanceRes == nil || productBalanceRes.Code != errcode.OK.Code {
		t.Fatalf("expected product balance list OK, got %#v", productBalanceRes)
	}
	productBalances := jsonRPCList(t, productBalanceRes.Data.AsMap(), "inventory_balances")
	if len(productBalances) != 1 {
		t.Fatalf("expected one product balance, got %#v", productBalances)
	}
	productBalance := productBalances[0].(map[string]any)
	if got := productBalance["quantity"]; got != "12.5" {
		t.Fatalf("expected product balance quantity 12.5, got %#v", got)
	}
	if got := productBalance["active_reserved_quantity"]; got != "4" {
		t.Fatalf("expected active reservation quantity 4, got %#v", got)
	}
	if got := productBalance["available_quantity"]; got != "8.5" {
		t.Fatalf("expected available quantity 8.5, got %#v", got)
	}

	_, unknownRes, err := j.handleInventory(adminCtx, "create_inventory_txn", "5", mustJSONRPCStruct(t, map[string]any{}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if unknownRes == nil || unknownRes.Code != errcode.UnknownMethod.Code {
		t.Fatalf("inventory JSON-RPC must stay read-only, got %#v", unknownRes)
	}
}

func TestJsonrpcDispatcher_InventoryLedgerRequiresInventoryReadPermission(t *testing.T) {
	data, _ := openInventoryRepoTestData(t, "jsonrpc_inventory_permission")
	j := newInventoryJSONRPCTestData(data, workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWarehouseInboundRead))

	_, res, err := j.handleInventory(workflowJSONRPCAdminContext(), "list_inventory_balances", "1", mustJSONRPCStruct(t, map[string]any{}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected inventory read permission denied, got %#v", res)
	}
}

func newInventoryJSONRPCTestData(data *datarepo.Data, admin *biz.AdminUser) *jsonrpcDispatcher {
	logger := log.NewStdLogger(io.Discard)
	return &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(logger, "module", "service.jsonrpc.inventory.test")),
		adminReader: stubAdminAccountReader{admin: admin},
		inventoryUC: biz.NewInventoryUsecase(datarepo.NewInventoryRepo(data, logger)),
	}
}

func jsonRPCList(t *testing.T, data map[string]any, key string) []any {
	t.Helper()
	items, ok := data[key].([]any)
	if !ok {
		t.Fatalf("expected jsonrpc list %s, got %#v", key, data[key])
	}
	return items
}

func inventoryStringPtr(value string) *string {
	return &value
}

func inventoryTimePtr(value time.Time) *time.Time {
	return &value
}

func inventoryDecimal(t *testing.T, value string) decimal.Decimal {
	t.Helper()
	parsed, err := decimal.NewFromString(value)
	if err != nil {
		t.Fatalf("parse decimal %s failed: %v", value, err)
	}
	return parsed
}
