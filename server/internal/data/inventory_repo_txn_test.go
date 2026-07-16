package data

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"reflect"
	"sync"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryRepo_ApplyTxnUpdatesBalances(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_apply")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	materialIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10.5"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-in-001",
	})
	if err != nil {
		t.Fatalf("material inbound failed: %v", err)
	}
	assertDecimalEqual(t, materialIn.Balance.Quantity, "10.5")

	replayed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10.5"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-in-001",
	})
	if err != nil {
		t.Fatalf("material inbound replay failed: %v", err)
	}
	if !replayed.IdempotentReplay {
		t.Fatalf("expected replay to be marked idempotent")
	}
	if replayed.Txn.ID != materialIn.Txn.ID {
		t.Fatalf("expected replay to return existing txn id=%d, got %d", materialIn.Txn.ID, replayed.Txn.ID)
	}
	assertDecimalEqual(t, replayed.Balance.Quantity, "10.5")

	productIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "3.25"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "prd-in-001",
	})
	if err != nil {
		t.Fatalf("product inbound failed: %v", err)
	}
	assertDecimalEqual(t, productIn.Balance.Quantity, "3.25")

	materialOut, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "4"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-out-001",
	})
	if err != nil {
		t.Fatalf("material outbound failed: %v", err)
	}
	assertDecimalEqual(t, materialOut.Balance.Quantity, "6.5")

	txnCountBeforeFailedOut, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count txns before failed outbound failed: %v", err)
	}
	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "7"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-out-overdraw",
	})
	if !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected insufficient stock, got %v", err)
	}
	txnCountAfterFailedOut, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count txns after failed outbound failed: %v", err)
	}
	if txnCountAfterFailedOut != txnCountBeforeFailedOut {
		t.Fatalf("failed outbound should not create txn, before=%d after=%d", txnCountBeforeFailedOut, txnCountAfterFailedOut)
	}

	reversalOf := materialOut.Txn.ID
	reversed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "4"),
		UnitID:          fixtures.unitID,
		SourceType:      "test",
		IdempotencyKey:  "mat-reversal-001",
		ReversalOfTxnID: &reversalOf,
	})
	if err != nil {
		t.Fatalf("material reversal failed: %v", err)
	}
	assertDecimalEqual(t, reversed.Balance.Quantity, "10.5")

	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get material balance failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "10.5")

	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected inventory balance unique constraint, got %v", err)
	}
}

func TestInventoryRepo_PreservesDecimalPrecision(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_decimal")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	applied, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1.234567"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-decimal-001",
	})
	if err != nil {
		t.Fatalf("decimal inbound failed: %v", err)
	}
	assertDecimalEqual(t, applied.Txn.Quantity, "1.234567")
	assertDecimalEqual(t, applied.Balance.Quantity, "1.234567")
}

func TestInventoryRepo_ReversalOffsetsOriginalAndRejectsDuplicate(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_reversal")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	inbound, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "test-1",
	})
	if err != nil {
		t.Fatalf("inbound before reversal failed: %v", err)
	}

	reversalOf := inbound.Txn.ID
	reversed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       -1,
		Quantity:        mustDecimal(t, "10"),
		UnitID:          fixtures.unitID,
		SourceType:      "test",
		IdempotencyKey:  "test-2",
		ReversalOfTxnID: &reversalOf,
	})
	if err != nil {
		t.Fatalf("reversal failed: %v", err)
	}
	assertDecimalEqual(t, reversed.Balance.Quantity, "0")

	replayed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       -1,
		Quantity:        mustDecimal(t, "10"),
		UnitID:          fixtures.unitID,
		SourceType:      "test",
		IdempotencyKey:  "test-2",
		ReversalOfTxnID: &reversalOf,
	})
	if err != nil {
		t.Fatalf("reversal replay failed: %v", err)
	}
	if !replayed.IdempotentReplay {
		t.Fatalf("expected reversal replay to be idempotent")
	}
	assertDecimalEqual(t, replayed.Balance.Quantity, "0")

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       -1,
		Quantity:        mustDecimal(t, "10"),
		UnitID:          fixtures.unitID,
		SourceType:      "test",
		IdempotencyKey:  "test-3",
		ReversalOfTxnID: &reversalOf,
	})
	if !errors.Is(err, biz.ErrInventoryTxnAlreadyReversed) {
		t.Fatalf("expected duplicate reversal to be rejected, got %v", err)
	}

	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after duplicate reversal failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "0")
}

func TestInventoryTxnRejectsHistoricalDelete(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_immutable_txn")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	applied, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "immutable-txn-001",
	})
	if err != nil {
		t.Fatalf("inbound before immutable delete check failed: %v", err)
	}
	if err := client.InventoryTxn.DeleteOneID(applied.Txn.ID).Exec(ctx); err == nil {
		t.Fatalf("expected inventory txn delete to be rejected")
	}
}

func TestInventoryRepo_RejectsInvalidSubjectReferences(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_invalid_subject")

	unit := createTestUnit(t, ctx, client, "PCS")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-SUBJECT-001")
	warehouse := createTestWarehouse(t, ctx, client, "WH-SUBJECT-001")
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      product.ID,
		WarehouseID:    warehouse.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         unit.ID,
		SourceType:     "test",
		IdempotencyKey: "invalid-material-points-product",
	})
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected MATERIAL with product id to be rejected, got %v", err)
	}

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      999999,
		WarehouseID:    warehouse.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         unit.ID,
		SourceType:     "test",
		IdempotencyKey: "invalid-product-missing",
	})
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing PRODUCT to be rejected, got %v", err)
	}
}

func TestInventoryRepo_ConcurrentOutboundCannotOverdraw(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_concurrent_out")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "concurrent-in-001",
	}); err != nil {
		t.Fatalf("inbound before concurrent outbound failed: %v", err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
				SubjectType:    biz.InventorySubjectMaterial,
				SubjectID:      fixtures.materialID,
				WarehouseID:    fixtures.warehouseID,
				TxnType:        biz.InventoryTxnOut,
				Direction:      -1,
				Quantity:       mustDecimal(t, "7"),
				UnitID:         fixtures.unitID,
				SourceType:     "test",
				IdempotencyKey: "concurrent-out-00" + string(rune('1'+i)),
			})
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	insufficient := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrInventoryInsufficientStock):
			insufficient++
		default:
			t.Fatalf("unexpected concurrent outbound error: %v", err)
		}
	}
	if successes != 1 || insufficient != 1 {
		t.Fatalf("expected one success and one insufficient stock, successes=%d insufficient=%d", successes, insufficient)
	}

	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after concurrent outbound failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "3")
}

func TestInventoryRepo_LotConcurrentOutboundCannotOverdraw(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lot_concurrent_out")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-CONCURRENT")

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &lot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_concurrent",
		IdempotencyKey: "lot-concurrent-in-001",
	}); err != nil {
		t.Fatalf("lot inbound before concurrent outbound failed: %v", err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
				SubjectType:    biz.InventorySubjectMaterial,
				SubjectID:      fixtures.materialID,
				WarehouseID:    fixtures.warehouseID,
				LotID:          &lot.ID,
				TxnType:        biz.InventoryTxnOut,
				Direction:      -1,
				Quantity:       mustDecimal(t, "7"),
				UnitID:         fixtures.unitID,
				SourceType:     "test_lot_concurrent",
				IdempotencyKey: "lot-concurrent-out-00" + string(rune('1'+i)),
			})
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	insufficient := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrInventoryInsufficientStock):
			insufficient++
		default:
			t.Fatalf("unexpected lot concurrent outbound error: %v", err)
		}
	}
	if successes != 1 || insufficient != 1 {
		t.Fatalf("expected one lot success and one insufficient stock, successes=%d insufficient=%d", successes, insufficient)
	}

	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &lot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after concurrent outbound failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "3")
}

func TestInventoryQuantityGeneratedTypeIsDecimal(t *testing.T) {
	decimalType := reflect.TypeOf(decimal.Decimal{})
	txnQuantity, ok := reflect.TypeOf(ent.InventoryTxn{}).FieldByName("Quantity")
	if !ok {
		t.Fatalf("inventory txn quantity field missing")
	}
	if txnQuantity.Type != decimalType {
		t.Fatalf("inventory txn quantity must be decimal.Decimal, got %s", txnQuantity.Type)
	}
	balanceQuantity, ok := reflect.TypeOf(ent.InventoryBalance{}).FieldByName("Quantity")
	if !ok {
		t.Fatalf("inventory balance quantity field missing")
	}
	if balanceQuantity.Type != decimalType {
		t.Fatalf("inventory balance quantity must be decimal.Decimal, got %s", balanceQuantity.Type)
	}
	bomQuantity, ok := reflect.TypeOf(ent.BOMItem{}).FieldByName("Quantity")
	if !ok {
		t.Fatalf("bom item quantity field missing")
	}
	if bomQuantity.Type != decimalType {
		t.Fatalf("bom item quantity must be decimal.Decimal, got %s", bomQuantity.Type)
	}
	bomLossRate, ok := reflect.TypeOf(ent.BOMItem{}).FieldByName("LossRate")
	if !ok {
		t.Fatalf("bom item loss_rate field missing")
	}
	if bomLossRate.Type != decimalType {
		t.Fatalf("bom item loss_rate must be decimal.Decimal, got %s", bomLossRate.Type)
	}
	returnQuantity, ok := reflect.TypeOf(ent.PurchaseReturnItem{}).FieldByName("Quantity")
	if !ok {
		t.Fatalf("purchase return item quantity field missing")
	}
	if returnQuantity.Type != decimalType {
		t.Fatalf("purchase return item quantity must be decimal.Decimal, got %s", returnQuantity.Type)
	}

	payload, err := json.Marshal(struct {
		Quantity decimal.Decimal `json:"quantity"`
	}{Quantity: mustDecimal(t, "1.234567")})
	if err != nil {
		t.Fatalf("marshal decimal quantity failed: %v", err)
	}
	var decoded struct {
		Quantity decimal.Decimal `json:"quantity"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("unmarshal decimal quantity failed: %v", err)
	}
	assertDecimalEqual(t, decoded.Quantity, "1.234567")
}
