package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
)

func TestInventoryRepo_CreateInventoryLots(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lots")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	colorNo := "C-01"
	dyeLotNo := "DYE-01"
	materialLot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-001",
		ColorNo:     &colorNo,
		DyeLotNo:    &dyeLotNo,
	})
	if err != nil {
		t.Fatalf("create material lot failed: %v", err)
	}
	if materialLot.Status != biz.InventoryLotActive {
		t.Fatalf("expected default lot status ACTIVE, got %s", materialLot.Status)
	}

	productLot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   fixtures.productID,
		LotNo:       "PRD-LOT-001",
	})
	if err != nil {
		t.Fatalf("create product lot failed: %v", err)
	}
	if productLot.SubjectType != biz.InventorySubjectProduct {
		t.Fatalf("expected product lot subject PRODUCT, got %s", productLot.SubjectType)
	}

	loaded, err := uc.GetInventoryLot(ctx, materialLot.ID)
	if err != nil {
		t.Fatalf("get material lot failed: %v", err)
	}
	if loaded.LotNo != materialLot.LotNo {
		t.Fatalf("expected loaded lot %s, got %s", materialLot.LotNo, loaded.LotNo)
	}
	if err := client.InventoryLot.DeleteOneID(materialLot.ID).Exec(ctx); err == nil {
		t.Fatalf("expected inventory lot delete to be rejected")
	}

	if _, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-001",
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate lot unique constraint, got %v", err)
	}

	if _, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   999999,
		LotNo:       "MISSING-MATERIAL-LOT",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing material lot subject to be rejected, got %v", err)
	}

	if _, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   999999,
		LotNo:       "MISSING-PRODUCT-LOT",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing product lot subject to be rejected, got %v", err)
	}
}

func TestInventoryRepo_ChangeInventoryLotStatus(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lot_status")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	defaultLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-STATUS-DEFAULT")
	if defaultLot.Status != biz.InventoryLotActive {
		t.Fatalf("expected default lot status ACTIVE, got %s", defaultLot.Status)
	}
	holdLot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-STATUS-HOLD",
		Status:      biz.InventoryLotHold,
	})
	if err != nil {
		t.Fatalf("create HOLD lot failed: %v", err)
	}
	if holdLot.Status != biz.InventoryLotHold {
		t.Fatalf("expected HOLD lot, got %s", holdLot.Status)
	}
	rejectedLot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-STATUS-REJECTED",
		Status:      biz.InventoryLotRejected,
	})
	if err != nil {
		t.Fatalf("create REJECTED lot failed: %v", err)
	}
	if rejectedLot.Status != biz.InventoryLotRejected {
		t.Fatalf("expected REJECTED lot, got %s", rejectedLot.Status)
	}
	if _, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-STATUS-INVALID",
		Status:      "WAITING",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected invalid lot status to be rejected, got %v", err)
	}

	changed, err := uc.ChangeInventoryLotStatus(ctx, defaultLot.ID, biz.InventoryLotHold, "待检")
	if err != nil {
		t.Fatalf("change ACTIVE to HOLD failed: %v", err)
	}
	if changed.Status != biz.InventoryLotHold {
		t.Fatalf("expected changed status HOLD, got %s", changed.Status)
	}
	changed, err = uc.ChangeInventoryLotStatus(ctx, changed.ID, biz.InventoryLotRejected, "不合格")
	if err != nil {
		t.Fatalf("change HOLD to REJECTED failed: %v", err)
	}
	if changed.Status != biz.InventoryLotRejected {
		t.Fatalf("expected changed status REJECTED, got %s", changed.Status)
	}
	changed, err = uc.ChangeInventoryLotStatus(ctx, changed.ID, biz.InventoryLotActive, "让步接收")
	if err != nil {
		t.Fatalf("change REJECTED to ACTIVE failed: %v", err)
	}
	if changed.Status != biz.InventoryLotActive {
		t.Fatalf("expected changed status ACTIVE, got %s", changed.Status)
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, changed.ID, "WAITING", "非法状态"); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected invalid changed status to be rejected, got %v", err)
	}

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &changed.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_status",
		IdempotencyKey: "lot-status-positive-balance",
	}); err != nil {
		t.Fatalf("inbound before DISABLED guard failed: %v", err)
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, changed.ID, biz.InventoryLotDisabled, "仍有余额"); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected DISABLED with positive balance to be rejected, got %v", err)
	}
	zeroLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-STATUS-ZERO")
	disabled, err := uc.ChangeInventoryLotStatus(ctx, zeroLot.ID, biz.InventoryLotDisabled, "无余额停用")
	if err != nil {
		t.Fatalf("change zero-balance lot to DISABLED failed: %v", err)
	}
	if disabled.Status != biz.InventoryLotDisabled {
		t.Fatalf("expected DISABLED zero-balance lot, got %s", disabled.Status)
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, zeroLot.ID, biz.InventoryLotActive, "停用恢复"); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected DISABLED to ACTIVE to be rejected, got %v", err)
	}
}

func TestInventoryRepo_ApplyTxnUpdatesLotBalances(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lot_apply")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	materialLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-APPLY-001")
	productLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectProduct, fixtures.productID, "PRD-LOT-APPLY-001")

	lotIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &materialLot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-lot-in-001",
	})
	if err != nil {
		t.Fatalf("lot inbound failed: %v", err)
	}
	assertOptionalIntEqual(t, lotIn.Txn.LotID, materialLot.ID)
	assertOptionalIntEqual(t, lotIn.Balance.LotID, materialLot.ID)
	assertDecimalEqual(t, lotIn.Balance.Quantity, "10")
	persistedLotInTxn, err := client.InventoryTxn.Get(ctx, lotIn.Txn.ID)
	if err != nil {
		t.Fatalf("get persisted lot inbound txn failed: %v", err)
	}
	assertOptionalIntEqual(t, persistedLotInTxn.LotID, materialLot.ID)
	persistedLotBalance, err := client.InventoryBalance.Get(ctx, lotIn.Balance.ID)
	if err != nil {
		t.Fatalf("get persisted lot balance failed: %v", err)
	}
	assertOptionalIntEqual(t, persistedLotBalance.LotID, materialLot.ID)

	replayed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &materialLot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-lot-in-001",
	})
	if err != nil {
		t.Fatalf("lot inbound replay failed: %v", err)
	}
	if !replayed.IdempotentReplay {
		t.Fatalf("expected lot inbound replay to be idempotent")
	}
	assertDecimalEqual(t, replayed.Balance.Quantity, "10")

	nilLotIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "5"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-no-lot-in-001",
	})
	if err != nil {
		t.Fatalf("non-lot inbound failed: %v", err)
	}
	if nilLotIn.Balance.LotID != nil {
		t.Fatalf("expected non-lot balance lot_id to be nil, got %v", *nilLotIn.Balance.LotID)
	}
	assertDecimalEqual(t, nilLotIn.Balance.Quantity, "5")

	lotOut, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &materialLot.ID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "3"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-lot-out-001",
	})
	if err != nil {
		t.Fatalf("lot outbound failed: %v", err)
	}
	assertDecimalEqual(t, lotOut.Balance.Quantity, "7")

	batchBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &materialLot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance failed: %v", err)
	}
	assertDecimalEqual(t, batchBalance.Quantity, "7")

	nonLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get non-lot balance failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalance.Quantity, "5")

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "6"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-no-lot-overdraw-001",
	})
	if !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected non-lot outbound to ignore lot stock, got %v", err)
	}
	batchBalanceAfterNonLotOverdraw, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &materialLot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after non-lot overdraw failed: %v", err)
	}
	assertDecimalEqual(t, batchBalanceAfterNonLotOverdraw.Quantity, "7")
	nonLotBalanceAfterOverdraw, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get non-lot balance after non-lot overdraw failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalanceAfterOverdraw.Quantity, "5")

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &productLot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-lot-mismatch-001",
	})
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected txn lot subject mismatch to be rejected, got %v", err)
	}

	reversalOf := lotOut.Txn.ID
	reversed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "3"),
		UnitID:          fixtures.unitID,
		SourceType:      "test_lot",
		IdempotencyKey:  "mat-lot-reversal-001",
		ReversalOfTxnID: &reversalOf,
	})
	if err != nil {
		t.Fatalf("lot reversal without explicit lot_id failed: %v", err)
	}
	assertOptionalIntEqual(t, reversed.Txn.LotID, materialLot.ID)
	assertDecimalEqual(t, reversed.Balance.Quantity, "10")
	persistedReversalTxn, err := client.InventoryTxn.Get(ctx, reversed.Txn.ID)
	if err != nil {
		t.Fatalf("get persisted lot reversal txn failed: %v", err)
	}
	assertOptionalIntEqual(t, persistedReversalTxn.LotID, materialLot.ID)

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		LotID:           &productLot.ID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "3"),
		UnitID:          fixtures.unitID,
		SourceType:      "test_lot",
		IdempotencyKey:  "mat-lot-reversal-wrong-lot",
		ReversalOfTxnID: &reversalOf,
	})
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected reversal with mismatched lot_id to be rejected, got %v", err)
	}

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		LotID:           &materialLot.ID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "3"),
		UnitID:          fixtures.unitID,
		SourceType:      "test_lot",
		IdempotencyKey:  "mat-lot-reversal-duplicate",
		ReversalOfTxnID: &reversalOf,
	})
	if !errors.Is(err, biz.ErrInventoryTxnAlreadyReversed) {
		t.Fatalf("expected duplicate lot reversal to be rejected, got %v", err)
	}
}

func TestInventoryRepo_LotStatusGuardsOrdinaryDeduction(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lot_status_guard")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	statuses := []struct {
		name    string
		status  string
		wantErr error
	}{
		{name: "ACTIVE", status: biz.InventoryLotActive},
		{name: "HOLD", status: biz.InventoryLotHold, wantErr: biz.ErrInventoryLotStatusBlocked},
		{name: "REJECTED", status: biz.InventoryLotRejected, wantErr: biz.ErrInventoryLotStatusBlocked},
		{name: "DISABLED", status: biz.InventoryLotDisabled, wantErr: biz.ErrInventoryLotStatusBlocked},
	}
	for _, tc := range statuses {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			lot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
				SubjectType: biz.InventorySubjectMaterial,
				SubjectID:   fixtures.materialID,
				LotNo:       "MAT-LOT-STATUS-GUARD-" + tc.name,
				Status:      tc.status,
			})
			if err != nil {
				t.Fatalf("create %s lot failed: %v", tc.status, err)
			}
			if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
				SubjectType:    biz.InventorySubjectMaterial,
				SubjectID:      fixtures.materialID,
				WarehouseID:    fixtures.warehouseID,
				LotID:          &lot.ID,
				TxnType:        biz.InventoryTxnIn,
				Direction:      1,
				Quantity:       mustDecimal(t, "5"),
				UnitID:         fixtures.unitID,
				SourceType:     "test_lot_status_guard",
				IdempotencyKey: "status-guard-in-" + tc.name,
			}); err != nil {
				t.Fatalf("inbound into %s lot fixture failed: %v", tc.status, err)
			}
			beforeCount, err := client.InventoryTxn.Query().Count(ctx)
			if err != nil {
				t.Fatalf("count before %s adjust-out failed: %v", tc.status, err)
			}
			_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
				SubjectType:    biz.InventorySubjectMaterial,
				SubjectID:      fixtures.materialID,
				WarehouseID:    fixtures.warehouseID,
				LotID:          &lot.ID,
				TxnType:        biz.InventoryTxnAdjustOut,
				Direction:      -1,
				Quantity:       mustDecimal(t, "1"),
				UnitID:         fixtures.unitID,
				SourceType:     "test_lot_status_guard",
				IdempotencyKey: "status-guard-adjust-out-" + tc.name,
			})
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("expected %s adjust-out to fail with %v, got %v", tc.status, tc.wantErr, err)
				}
				afterCount, err := client.InventoryTxn.Query().Count(ctx)
				if err != nil {
					t.Fatalf("count after %s adjust-out failed: %v", tc.status, err)
				}
				if afterCount != beforeCount {
					t.Fatalf("failed %s adjust-out should not create txn, before=%d after=%d", tc.status, beforeCount, afterCount)
				}
				balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
					SubjectType: biz.InventorySubjectMaterial,
					SubjectID:   fixtures.materialID,
					WarehouseID: fixtures.warehouseID,
					LotID:       &lot.ID,
					UnitID:      fixtures.unitID,
				})
				if err != nil {
					t.Fatalf("get %s lot balance failed: %v", tc.status, err)
				}
				assertDecimalEqual(t, balance.Quantity, "5")
				return
			}
			if err != nil {
				t.Fatalf("expected ACTIVE adjust-out to succeed, got %v", err)
			}
			balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
				SubjectType: biz.InventorySubjectMaterial,
				SubjectID:   fixtures.materialID,
				WarehouseID: fixtures.warehouseID,
				LotID:       &lot.ID,
				UnitID:      fixtures.unitID,
			})
			if err != nil {
				t.Fatalf("get ACTIVE lot balance failed: %v", err)
			}
			assertDecimalEqual(t, balance.Quantity, "4")
		})
	}

	holdOutLot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-STATUS-GUARD-OUT",
		Status:      biz.InventoryLotHold,
	})
	if err != nil {
		t.Fatalf("create HOLD lot for ordinary OUT failed: %v", err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &holdOutLot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "3"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_status_guard",
		IdempotencyKey: "status-guard-hold-out-in",
	}); err != nil {
		t.Fatalf("inbound into HOLD lot for ordinary OUT failed: %v", err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &holdOutLot.ID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_status_guard",
		IdempotencyKey: "status-guard-hold-ordinary-out",
	}); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected HOLD ordinary OUT to be blocked, got %v", err)
	}

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "3"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_status_guard",
		IdempotencyKey: "status-guard-non-lot-in",
	}); err != nil {
		t.Fatalf("non-lot inbound before status boundary failed: %v", err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "2"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_status_guard",
		IdempotencyKey: "status-guard-non-lot-out",
	}); err != nil {
		t.Fatalf("non-lot outbound should not be checked by lot status, got %v", err)
	}
	nonLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get non-lot balance after status boundary failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalance.Quantity, "1")
}

func TestInventoryRepo_LotBalancesHaveSeparateUniqueScopes(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lot_unique")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	lotA := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-UNIQ-A")
	lotB := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-UNIQ-B")

	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); err != nil {
		t.Fatalf("create nil-lot balance failed: %v", err)
	}
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate nil-lot balance unique constraint, got %v", err)
	}

	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(lotA.ID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); err != nil {
		t.Fatalf("create lot balance failed: %v", err)
	}
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(lotA.ID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate lot balance unique constraint, got %v", err)
	}
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(lotB.ID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); err != nil {
		t.Fatalf("expected different lot balance to be allowed, got %v", err)
	}
}
