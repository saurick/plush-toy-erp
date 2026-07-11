package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/inventorytxn"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

type inventoryTestFixtures struct {
	unitID      int
	materialID  int
	productID   int
	warehouseID int
}

func TestInventoryMasterDataCodeUnique(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:inventory_master_unique?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	unit := createTestUnit(t, ctx, client, "PCS")
	if _, err := client.Unit.Create().SetCode("PCS").SetName("重复单位").Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected unit code unique constraint, got %v", err)
	}

	createTestMaterial(t, ctx, client, unit.ID, "MAT-001")
	if _, err := client.Material.Create().
		SetCode("MAT-001").
		SetName("重复物料").
		SetDefaultUnitID(unit.ID).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected material code unique constraint, got %v", err)
	}

	createTestProduct(t, ctx, client, unit.ID, "PRD-001")
	if _, err := client.Product.Create().
		SetCode("PRD-001").
		SetName("重复成品").
		SetDefaultUnitID(unit.ID).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected product code unique constraint, got %v", err)
	}

	createTestWarehouse(t, ctx, client, "RAW-01")
	if _, err := client.Warehouse.Create().
		SetCode("RAW-01").
		SetName("重复仓库").
		SetType("RAW_MATERIAL").
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected warehouse code unique constraint, got %v", err)
	}
}

func openInventoryRepoTestData(t *testing.T, name string) (*Data, *ent.Client) {
	t.Helper()
	db, err := stdsql.Open("sqlite3", "file:"+name+"?mode=memory&cache=shared&_fk=1&_busy_timeout=5000")
	if err != nil {
		t.Fatalf("open sqlite db failed: %v", err)
	}
	db.SetMaxOpenConns(1)
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.SQLite, db)))
	if err := client.Schema.Create(context.Background()); err != nil {
		_ = client.Close()
		_ = db.Close()
		t.Fatalf("create ent schema failed: %v", err)
	}
	t.Cleanup(func() {
		_ = client.Close()
		_ = db.Close()
	})
	return &Data{
		postgres:   client,
		sqldb:      db,
		sqlDialect: dialect.SQLite,
	}, client
}

func createInventoryTestFixtures(t *testing.T, ctx context.Context, client *ent.Client) inventoryTestFixtures {
	t.Helper()
	unit := createTestUnit(t, ctx, client, "PCS")
	material := createTestMaterial(t, ctx, client, unit.ID, "MAT-INV-001")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-INV-001")
	warehouse := createTestWarehouse(t, ctx, client, "WH-INV-001")
	return inventoryTestFixtures{
		unitID:      unit.ID,
		materialID:  material.ID,
		productID:   product.ID,
		warehouseID: warehouse.ID,
	}
}

func TestInventoryUsecase_IdempotencyKeyRequiresSamePayload(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_idempotency_payload")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	input := &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(2),
		UnitID:         fixtures.unitID,
		SourceType:     "IDEMPOTENCY_TEST",
		IdempotencyKey: "inventory-idempotency-same-payload",
	}
	first, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, input)
	if err != nil {
		t.Fatalf("first inventory apply failed: %v", err)
	}
	replayed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, input)
	if err != nil {
		t.Fatalf("same-payload replay failed: %v", err)
	}
	if !replayed.IdempotentReplay || replayed.Txn.ID != first.Txn.ID {
		t.Fatalf("expected same-payload replay of txn %d, got %#v", first.Txn.ID, replayed)
	}
	conflict := *input
	conflict.Quantity = decimal.NewFromInt(3)
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &conflict); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("different-payload replay error = %v, want ErrIdempotencyConflict", err)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   fixtures.productID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get inventory balance failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "2")
	if count := client.InventoryTxn.Query().Where(inventorytxn.IdempotencyKey(input.IdempotencyKey)).CountX(ctx); count != 1 {
		t.Fatalf("expected one persisted txn, got %d", count)
	}
}

func TestInventoryUsecase_IdempotencyDistinguishesExplicitOccurredAt(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_idempotency_explicit_occurred_at")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	create := func(key string, occurredAt time.Time) (*biz.InventoryTxnApplyResult, error) {
		return uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID,
			WarehouseID: fixtures.warehouseID, TxnType: biz.InventoryTxnIn, Direction: 1,
			Quantity: decimal.NewFromInt(1), UnitID: fixtures.unitID,
			SourceType: "IDEMPOTENCY_TIME_TEST", IdempotencyKey: key, OccurredAt: occurredAt,
		})
	}

	omitted, err := create("inventory-time-omitted", time.Time{})
	if err != nil {
		t.Fatalf("create omitted-time inventory txn: %v", err)
	}
	omittedReplay, err := create("inventory-time-omitted", time.Time{})
	if err != nil || !omittedReplay.IdempotentReplay || omittedReplay.Txn.ID != omitted.Txn.ID {
		t.Fatalf("omitted-time replay = %#v, err=%v", omittedReplay, err)
	}
	omittedRow := client.InventoryTxn.GetX(ctx, omitted.Txn.ID)
	if omittedRow.OccurredAtSpecified {
		t.Fatal("omitted occurred_at must persist occurred_at_specified=false")
	}
	explicit := time.Date(2026, 7, 10, 10, 11, 12, 345678901, time.FixedZone("UTC+8", 8*60*60))
	if _, err := create("inventory-time-omitted", explicit); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("omitted then explicit replay error = %v, want ErrIdempotencyConflict", err)
	}

	explicitTxn, err := create("inventory-time-explicit", explicit)
	if err != nil {
		t.Fatalf("create explicit-time inventory txn: %v", err)
	}
	explicitReplay, err := create("inventory-time-explicit", explicit)
	if err != nil || !explicitReplay.IdempotentReplay || explicitReplay.Txn.ID != explicitTxn.Txn.ID {
		t.Fatalf("explicit same-time replay = %#v, err=%v", explicitReplay, err)
	}
	explicitRow := client.InventoryTxn.GetX(ctx, explicitTxn.Txn.ID)
	wantExplicit := explicit.UTC().Truncate(time.Microsecond)
	if !explicitRow.OccurredAtSpecified || !explicitRow.OccurredAt.Equal(wantExplicit) {
		t.Fatalf("explicit persisted marker=%v time=%v, want true/%v", explicitRow.OccurredAtSpecified, explicitRow.OccurredAt, wantExplicit)
	}
	if _, err := create("inventory-time-explicit", explicit.Add(time.Second)); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed explicit occurred_at error = %v, want ErrIdempotencyConflict", err)
	}
	if _, err := create("inventory-time-explicit", time.Time{}); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("explicit then omitted replay error = %v, want ErrIdempotencyConflict", err)
	}

	historicalAt := time.Date(2026, 6, 1, 8, 0, 0, 0, time.UTC)
	historicalRow, err := client.InventoryTxn.Create().
		SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(fixtures.productID).
		SetWarehouseID(fixtures.warehouseID).
		SetTxnType(biz.InventoryTxnIn).
		SetDirection(1).
		SetQuantity(decimal.NewFromInt(1)).
		SetUnitID(fixtures.unitID).
		SetSourceType("IDEMPOTENCY_TIME_HISTORY").
		SetIdempotencyKey("inventory-time-history").
		SetOccurredAt(historicalAt).
		Save(ctx)
	if err != nil {
		t.Fatalf("create historical inventory txn without marker: %v", err)
	}
	if historicalRow.OccurredAtSpecified {
		t.Fatal("historical row must default occurred_at_specified=false")
	}
	historicalReplay, err := uc.CreateInventoryTxn(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID,
		WarehouseID: fixtures.warehouseID, TxnType: biz.InventoryTxnIn, Direction: 1,
		Quantity: decimal.NewFromInt(1), UnitID: fixtures.unitID,
		SourceType: "IDEMPOTENCY_TIME_HISTORY", IdempotencyKey: "inventory-time-history",
	})
	if err != nil || historicalReplay.ID != historicalRow.ID {
		t.Fatalf("omitted-time historical replay = %#v, want id %d, err=%v", historicalReplay, historicalRow.ID, err)
	}
	if _, err := uc.CreateInventoryTxn(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID,
		WarehouseID: fixtures.warehouseID, TxnType: biz.InventoryTxnIn, Direction: 1,
		Quantity: decimal.NewFromInt(1), UnitID: fixtures.unitID,
		SourceType: "IDEMPOTENCY_TIME_HISTORY", IdempotencyKey: "inventory-time-history",
		OccurredAt: historicalAt,
	}); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("explicit input must not impersonate historical omitted marker, err=%v", err)
	}
}

func TestInventoryRepo_ProductOutboundProtectsActiveReservations(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_product_outbound_reservation_guard")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	operationalRepo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(5), UnitID: fixtures.unitID,
		SourceType: "RESERVATION_GUARD", IdempotencyKey: "RESERVATION_GUARD:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}
	if _, err := operationalRepo.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo: "RSV-GUARD", ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID,
		UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(4), IdempotencyKey: "RSV-GUARD",
	}); err != nil {
		t.Fatalf("create stock reservation failed: %v", err)
	}
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID,
		TxnType: biz.InventoryTxnOut, Direction: -1, Quantity: decimal.NewFromInt(2), UnitID: fixtures.unitID,
		SourceType: "RESERVATION_GUARD", IdempotencyKey: "RESERVATION_GUARD:OUT-REJECTED",
	}); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("outbound consuming reserved stock error = %v, want insufficient stock", err)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.IdempotencyKey("RESERVATION_GUARD:OUT-REJECTED")).CountX(ctx); count != 0 {
		t.Fatalf("rejected outbound persisted %d inventory txns", count)
	}
	result, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID,
		TxnType: biz.InventoryTxnOut, Direction: -1, Quantity: decimal.NewFromInt(1), UnitID: fixtures.unitID,
		SourceType: "RESERVATION_GUARD", IdempotencyKey: "RESERVATION_GUARD:OUT-ALLOWED",
	})
	if err != nil {
		t.Fatalf("outbound within free quantity failed: %v", err)
	}
	if !result.Balance.Quantity.Equal(decimal.NewFromInt(4)) {
		t.Fatalf("balance after free outbound = %s, want 4", result.Balance.Quantity)
	}
}

func createTestUnit(t *testing.T, ctx context.Context, client *ent.Client, code string) *ent.Unit {
	t.Helper()
	unit, err := client.Unit.Create().
		SetCode(code).
		SetName(code + "单位").
		SetPrecision(2).
		Save(ctx)
	if err != nil {
		t.Fatalf("create unit %s failed: %v", code, err)
	}
	return unit
}

func createTestMaterial(t *testing.T, ctx context.Context, client *ent.Client, unitID int, code string) *ent.Material {
	t.Helper()
	material, err := client.Material.Create().
		SetCode(code).
		SetName(code + "材料").
		SetCategory("FABRIC").
		SetSpec("10mm").
		SetDefaultUnitID(unitID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create material %s failed: %v", code, err)
	}
	return material
}

func createTestProduct(t *testing.T, ctx context.Context, client *ent.Client, unitID int, code string) *ent.Product {
	t.Helper()
	product, err := client.Product.Create().
		SetCode(code).
		SetName(code + "成品").
		SetStyleNo("STYLE-" + code).
		SetDefaultUnitID(unitID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create product %s failed: %v", code, err)
	}
	return product
}

func createTestWarehouse(t *testing.T, ctx context.Context, client *ent.Client, code string) *ent.Warehouse {
	t.Helper()
	warehouse, err := client.Warehouse.Create().
		SetCode(code).
		SetName(code + "仓").
		SetType("RAW_MATERIAL").
		Save(ctx)
	if err != nil {
		t.Fatalf("create warehouse %s failed: %v", code, err)
	}
	return warehouse
}

func createTestInventoryLot(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, subjectType string, subjectID int, lotNo string) *biz.InventoryLot {
	t.Helper()
	lot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: subjectType,
		SubjectID:   subjectID,
		LotNo:       lotNo,
	})
	if err != nil {
		t.Fatalf("create inventory lot %s failed: %v", lotNo, err)
	}
	return lot
}

func TestInventoryUsecase_ListInventoryLotsWarehouseFilterRequiresPositiveBalance(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_lot_warehouse_positive_balance")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "LOT-WH-POSITIVE")
	quantity := mustDecimal(t, "5")

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &lot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       quantity,
		UnitID:         fixtures.unitID,
		SourceType:     "TEST",
		IdempotencyKey: "LOT-WH-POSITIVE-IN",
		OccurredAt:     time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("seed positive lot balance failed: %v", err)
	}

	items, total, err := uc.ListInventoryLots(ctx, biz.InventoryLotFilter{
		WarehouseID: fixtures.warehouseID,
		Keyword:     "LOT-WH-POSITIVE",
	})
	if err != nil {
		t.Fatalf("list lots with positive balance failed: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].ID != lot.ID {
		t.Fatalf("expected lot with positive warehouse balance, total=%d items=%#v", total, items)
	}

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &lot.ID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       quantity,
		UnitID:         fixtures.unitID,
		SourceType:     "TEST",
		IdempotencyKey: "LOT-WH-POSITIVE-OUT",
		OccurredAt:     time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("consume lot balance failed: %v", err)
	}

	items, total, err = uc.ListInventoryLots(ctx, biz.InventoryLotFilter{
		WarehouseID: fixtures.warehouseID,
		Keyword:     "LOT-WH-POSITIVE",
	})
	if err != nil {
		t.Fatalf("list lots after zero balance failed: %v", err)
	}
	if total != 0 || len(items) != 0 {
		t.Fatalf("expected zero-balance historical lot excluded by warehouse filter, total=%d items=%#v", total, items)
	}
}

func TestInventoryUsecase_DirectWritePrimitiveAllowsHistoricalInactiveReferences(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_direct_write_inactive_refs")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	if _, err := client.Material.UpdateOneID(fixtures.materialID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable material failed: %v", err)
	}
	if _, err := client.Unit.UpdateOneID(fixtures.unitID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable unit failed: %v", err)
	}
	if _, err := client.Warehouse.UpdateOneID(fixtures.warehouseID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable warehouse failed: %v", err)
	}
	lot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "LOT-HISTORICAL-INACTIVE",
	})
	if err != nil {
		t.Fatalf("inventory lot source primitive should keep inactive historical subject references readable: %v", err)
	}
	applied, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &lot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(3),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_HISTORICAL_SOURCE",
		IdempotencyKey: "TEST_HISTORICAL_SOURCE:IN",
	})
	if err != nil {
		t.Fatalf("inventory txn source primitive should not active-guard historical references: %v", err)
	}
	reversalOf := applied.Txn.ID
	if _, err := uc.CreateInventoryTxn(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		LotID:           &lot.ID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       -1,
		Quantity:        decimal.NewFromInt(3),
		UnitID:          fixtures.unitID,
		SourceType:      "TEST_HISTORICAL_SOURCE",
		IdempotencyKey:  "TEST_HISTORICAL_SOURCE:REVERSAL",
		ReversalOfTxnID: &reversalOf,
	}); err != nil {
		t.Fatalf("inventory reversal primitive should not active-guard historical references: %v", err)
	}
}

func createAndPostPurchaseReceipt(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, receiptNo string, fixtures inventoryTestFixtures, lotNo *string, quantity decimal.Decimal) *biz.PurchaseReceipt {
	t.Helper()
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    receiptNo,
		SupplierName: "采购供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 11, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase receipt %s failed: %v", receiptNo, err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:   receipt.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotNo:       lotNo,
		Quantity:    quantity,
	}); err != nil {
		t.Fatalf("add purchase receipt %s item failed: %v", receiptNo, err)
	}
	passAllPurchaseReceiptQualityInspections(t, ctx, uc, receipt.ID)
	posted, err := uc.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post purchase receipt %s failed: %v", receiptNo, err)
	}
	if len(posted.Items) != 1 {
		t.Fatalf("expected purchase receipt %s to have one item, got %d", receiptNo, len(posted.Items))
	}
	return posted
}

func passAllPurchaseReceiptQualityInspections(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, receiptID int) {
	t.Helper()
	inspections, _, err := uc.ListQualityInspections(ctx, biz.QualityInspectionFilter{
		PurchaseReceiptID: receiptID,
		SourceType:        biz.QualityInspectionSourcePurchaseReceipt,
		InspectionType:    biz.QualityInspectionTypeIncoming,
		Limit:             200,
	})
	if err != nil {
		t.Fatalf("list purchase receipt %d quality inspections failed: %v", receiptID, err)
	}
	if len(inspections) == 0 {
		t.Fatalf("purchase receipt %d must have generated incoming quality inspections", receiptID)
	}
	for _, inspection := range inspections {
		if inspection.Status == biz.QualityInspectionStatusPassed {
			continue
		}
		if inspection.Status != biz.QualityInspectionStatusSubmitted {
			t.Fatalf("purchase receipt %d inspection %d not decidable: %s", receiptID, inspection.ID, inspection.Status)
		}
		if _, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{
			InspectionID: inspection.ID,
			Result:       biz.QualityInspectionResultPass,
			DecisionNote: stringPtr("测试来料质检通过"),
		}); err != nil {
			t.Fatalf("pass purchase receipt %d inspection %d failed: %v", receiptID, inspection.ID, err)
		}
	}
}

func createLinkedPurchaseReturn(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, returnNo string, receiptID int, receiptItem *biz.PurchaseReceiptItem, fixtures inventoryTestFixtures, quantity decimal.Decimal) *biz.PurchaseReturn {
	t.Helper()
	purchaseReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          returnNo,
		PurchaseReceiptID: &receiptID,
		SupplierName:      "采购供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 15, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase return %s failed: %v", returnNo, err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              purchaseReturn.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              quantity,
	}); err != nil {
		t.Fatalf("add purchase return %s item failed: %v", returnNo, err)
	}
	return purchaseReturn
}

func createQualityInspectionDraftFromReceipt(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, inspectionNo string, receipt *biz.PurchaseReceipt, fixtures inventoryTestFixtures) *biz.QualityInspection {
	t.Helper()
	if len(receipt.Items) != 1 {
		t.Fatalf("expected receipt %s to have one item, got %d", receipt.ReceiptNo, len(receipt.Items))
	}
	item := receipt.Items[0]
	if item.LotID == nil {
		t.Fatalf("expected receipt %s item lot_id", receipt.ReceiptNo)
	}
	inspection, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:          inspectionNo,
		PurchaseReceiptID:     receipt.ID,
		PurchaseReceiptItemID: &item.ID,
		InventoryLotID:        *item.LotID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
	})
	if err != nil {
		t.Fatalf("create quality inspection %s failed: %v", inspectionNo, err)
	}
	return inspection
}

func createPurchaseReceiptAdjustmentDraft(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, adjustmentNo string, receiptID int) *biz.PurchaseReceiptAdjustment {
	t.Helper()
	adjustment, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      adjustmentNo,
		PurchaseReceiptID: receiptID,
		AdjustedAt:        time.Date(2026, 4, 26, 16, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase receipt adjustment %s failed: %v", adjustmentNo, err)
	}
	return adjustment
}

func addPurchaseReceiptAdjustmentItem(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, adjustmentID int, receiptItem *biz.PurchaseReceiptItem, adjustType string, warehouseID int, lotID *int, quantity decimal.Decimal, correctionGroup *string) *biz.PurchaseReceiptAdjustmentItem {
	t.Helper()
	item, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustmentID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            adjustType,
		MaterialID:            receiptItem.MaterialID,
		WarehouseID:           warehouseID,
		UnitID:                receiptItem.UnitID,
		LotID:                 lotID,
		Quantity:              quantity,
		CorrectionGroup:       correctionGroup,
	})
	if err != nil {
		t.Fatalf("add purchase receipt adjustment item failed: %v", err)
	}
	return item
}

func changeLotToStatus(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, lotID int, status string) {
	t.Helper()
	if status == biz.InventoryLotRejected {
		if _, err := uc.ChangeInventoryLotStatus(ctx, lotID, biz.InventoryLotHold, "待判"); err != nil {
			t.Fatalf("change lot %d to HOLD before REJECTED failed: %v", lotID, err)
		}
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, lotID, status, "测试状态变更"); err != nil {
		t.Fatalf("change lot %d to %s failed: %v", lotID, status, err)
	}
}

func forceLotStatus(t *testing.T, ctx context.Context, client *ent.Client, lotID int, status string) {
	t.Helper()
	if _, err := client.InventoryLot.UpdateOneID(lotID).SetStatus(status).Save(ctx); err != nil {
		t.Fatalf("force lot %d to %s failed: %v", lotID, status, err)
	}
}

func assertLotStatus(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, lotID int, want string) {
	t.Helper()
	lot, err := uc.GetInventoryLot(ctx, lotID)
	if err != nil {
		t.Fatalf("get lot %d failed: %v", lotID, err)
	}
	if lot.Status != want {
		t.Fatalf("expected lot %d status %s, got %s", lotID, want, lot.Status)
	}
}

func inventoryTxnCount(t *testing.T, ctx context.Context, client *ent.Client) int {
	t.Helper()
	count, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory txns failed: %v", err)
	}
	return count
}

func assertInventoryTxnCount(t *testing.T, ctx context.Context, client *ent.Client, want int) {
	t.Helper()
	count := inventoryTxnCount(t, ctx, client)
	if count != want {
		t.Fatalf("expected inventory txn count %d, got %d", want, count)
	}
}

func assertAdjustmentTxnCount(t *testing.T, ctx context.Context, client *ent.Client, adjustmentID int, want int) {
	t.Helper()
	count, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustmentID),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count adjustment txns failed: %v", err)
	}
	if count != want {
		t.Fatalf("expected adjustment %d txn count %d, got %d", adjustmentID, want, count)
	}
}

func assertReversalCount(t *testing.T, ctx context.Context, client *ent.Client, originalTxnID int, want int) {
	t.Helper()
	count, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(originalTxnID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count reversals for txn %d failed: %v", originalTxnID, err)
	}
	if count != want {
		t.Fatalf("expected txn %d reversal count %d, got %d", originalTxnID, want, count)
	}
}

func stringPtr(value string) *string {
	return &value
}

func mustDecimal(t *testing.T, value string) decimal.Decimal {
	t.Helper()
	out, err := decimal.NewFromString(value)
	if err != nil {
		t.Fatalf("parse decimal %q failed: %v", value, err)
	}
	return out
}

func assertDecimalEqual(t *testing.T, got decimal.Decimal, want string) {
	t.Helper()
	expected := mustDecimal(t, want)
	if got.Cmp(expected) != 0 {
		t.Fatalf("expected decimal %s, got %s", expected.String(), got.String())
	}
}

func assertOptionalIntEqual(t *testing.T, got *int, want int) {
	t.Helper()
	if got == nil {
		t.Fatalf("expected int pointer %d, got nil", want)
	}
	if *got != want {
		t.Fatalf("expected int pointer %d, got %d", want, *got)
	}
}
