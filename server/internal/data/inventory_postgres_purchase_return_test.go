package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereturn"
	"server/internal/data/model/ent/purchasereturnitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseReturnPostgresMigrationShape(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)

	for _, table := range []string{
		"purchase_returns",
		"purchase_return_items",
	} {
		assertPostgresTableExists(t, data.sqldb, table)
	}
	assertPostgresNumericColumn(t, data.sqldb, "purchase_return_items", "quantity", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "purchase_return_items", "unit_price", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "purchase_return_items", "amount", 20, 6)
	assertPostgresUniqueIndex(t, data.sqldb, "purchase_returns", "purchasereturn_return_no")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "purchase_return_items", "purchasereturnitem_return_id_source_line_no", "source_line_no IS NOT NULL AND source_line_no <> ''")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_return_items", "purchase_return_items_quantity_positive", "quantity > 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_return_items", "purchase_return_items_unit_price_non_negative", "unit_price IS NULL OR unit_price >= 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_return_items", "purchase_return_items_amount_non_negative", "amount IS NULL OR amount >= 0")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_return_items", "purchase_return_items_inventory_lots_purchase_return_items", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_returns", "purchase_returns_purchase_receipts_purchase_returns", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_return_items", "purchase_return_items_purchase_receipt_items_purchase_return_it", "NO ACTION")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id", "lot_id IS NULL")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l", "lot_id IS NOT NULL")

	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	returnDraft, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PG-PRTN-SHAPE-" + fixtures.suffix,
		SupplierName: "PG退货供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres purchase return shape draft failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, returnDraft.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres draft return cancel to be rejected, got %v", err)
	}
	if _, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PG-PRTN-SHAPE-" + fixtures.suffix,
		SupplierName: "PG退货供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres return_no unique constraint, got %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:     returnDraft.ID,
		MaterialID:   fixtures.materialID,
		WarehouseID:  fixtures.warehouseID,
		UnitID:       fixtures.unitID,
		Quantity:     mustDecimal(t, "1"),
		SourceLineNo: stringPtr("same-line"),
	}); err != nil {
		t.Fatalf("create postgres return source line item failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:     returnDraft.ID,
		MaterialID:   fixtures.materialID,
		WarehouseID:  fixtures.warehouseID,
		UnitID:       fixtures.unitID,
		Quantity:     mustDecimal(t, "1"),
		SourceLineNo: stringPtr("same-line"),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres return source_line_no unique constraint, got %v", err)
	}
	if _, err := client.PurchaseReturnItem.Create().
		SetReturnID(returnDraft.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(decimal.Zero).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres return quantity DB check, got %v", err)
	}
	if _, err := client.PurchaseReturnItem.Create().
		SetReturnID(returnDraft.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		SetUnitPrice(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres return unit_price DB check, got %v", err)
	}
	if _, err := client.PurchaseReturnItem.Create().
		SetReturnID(returnDraft.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		SetAmount(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres return amount DB check, got %v", err)
	}
}

func TestPurchaseReturnPostgresFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)

	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected postgres posted receipt lot_id")
	}
	purchaseReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PG-PRTN-FLOW-" + fixtures.suffix,
		PurchaseReceiptID: &postedReceipt.ID,
		SupplierName:      "PG退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 13, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres purchase return failed: %v", err)
	}
	item, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              purchaseReturn.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "4"),
		SourceLineNo:          stringPtr("1"),
	})
	if err != nil {
		t.Fatalf("add postgres purchase return item failed: %v", err)
	}

	postedReturn, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID)
	if err != nil {
		t.Fatalf("post postgres purchase return failed: %v", err)
	}
	if postedReturn.Status != biz.PurchaseReturnStatusPosted {
		t.Fatalf("expected postgres posted return, got %s", postedReturn.Status)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres lot balance after return failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "6")

	outTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(purchaseReturn.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find postgres purchase return out txn failed: %v", err)
	}
	assertOptionalIntEqual(t, outTxn.LotID, *receiptItem.LotID)

	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    purchaseReturn.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       receiptItem.LotID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres posted return item add to be rejected, got %v", err)
	}
	if _, err := client.PurchaseReturn.UpdateOneID(purchaseReturn.ID).SetStatus(biz.PurchaseReturnStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted return status update to be rejected")
	}
	if _, err := client.PurchaseReturnItem.UpdateOneID(item.ID).SetQuantity(mustDecimal(t, "5")).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted return item quantity update to be rejected")
	}
	if _, err := client.PurchaseReturn.Delete().Where(purchasereturn.ID(purchaseReturn.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres posted return bulk delete to be rejected")
	}
	if err := client.PurchaseReturnItem.DeleteOneID(item.ID).Exec(ctx); err == nil {
		t.Fatalf("expected postgres posted return item delete-one to be rejected")
	}

	if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("repeat postgres purchase return post failed: %v", err)
	}
	outCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(purchaseReturn.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres purchase return out txns failed: %v", err)
	}
	if outCount != 1 {
		t.Fatalf("expected one postgres return out txn after repeat post, got %d", outCount)
	}

	overReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PG-PRTN-OVER-" + fixtures.suffix,
		SupplierName: "PG退货供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 14, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres over return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    overReturn.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       receiptItem.LotID,
		Quantity:    mustDecimal(t, "7"),
	}); err != nil {
		t.Fatalf("add postgres over return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, overReturn.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected postgres over return to fail as insufficient stock, got %v", err)
	}

	cancelled, err := uc.CancelPostedPurchaseReturn(ctx, purchaseReturn.ID)
	if err != nil {
		t.Fatalf("cancel postgres posted purchase return failed: %v", err)
	}
	if cancelled.Status != biz.PurchaseReturnStatusCancelled {
		t.Fatalf("expected postgres cancelled return, got %s", cancelled.Status)
	}
	if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cancelled return post to be rejected, got %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    purchaseReturn.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       receiptItem.LotID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cancelled return item add to be rejected, got %v", err)
	}
	if _, err := client.PurchaseReturn.UpdateOneID(purchaseReturn.ID).SetSupplierName("PG修改退货供应商").Save(ctx); err == nil {
		t.Fatalf("expected postgres cancelled return protected update to be rejected")
	}
	if _, err := client.PurchaseReturnItem.UpdateOneID(item.ID).SetWarehouseID(fixtures.warehouseID).Save(ctx); err == nil {
		t.Fatalf("expected postgres cancelled return item protected update to be rejected")
	}
	if err := client.PurchaseReturn.DeleteOneID(purchaseReturn.ID).Exec(ctx); err == nil {
		t.Fatalf("expected postgres cancelled return delete-one to be rejected")
	}
	if _, err := client.PurchaseReturnItem.Delete().Where(purchasereturnitem.ID(item.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres cancelled return item bulk delete to be rejected")
	}
	afterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres lot balance after return cancel failed: %v", err)
	}
	assertDecimalEqual(t, afterCancel.Quantity, "10")
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(outTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres return reversal failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("expected one postgres return reversal, got %d", reversalCount)
	}
	reversalTxn, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(outTxn.ID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("find postgres return reversal failed: %v", err)
	}
	assertOptionalIntEqual(t, reversalTxn.LotID, *receiptItem.LotID)
	traceTxns, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(purchaseReturn.ID),
			inventorytxn.SourceLineID(item.ID),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query postgres return trace txns failed: %v", err)
	}
	if len(traceTxns) != 2 {
		t.Fatalf("expected postgres return out and reversal trace txns, got %d", len(traceTxns))
	}
	for _, txn := range traceTxns {
		assertOptionalIntEqual(t, txn.SourceID, purchaseReturn.ID)
		assertOptionalIntEqual(t, txn.SourceLineID, item.ID)
		assertOptionalIntEqual(t, txn.LotID, *receiptItem.LotID)
		if err := client.InventoryTxn.DeleteOneID(txn.ID).Exec(ctx); err == nil {
			t.Fatalf("expected postgres return trace inventory txn delete to be rejected")
		}
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("repeat postgres purchase return cancel failed: %v", err)
	}
	reversalCount, err = client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(outTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres return reversal after repeat cancel failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("expected one postgres return reversal after repeat cancel, got %d", reversalCount)
	}
}

func TestPurchaseReturnPostgresOriginFKDeleteRules(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)

	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}

	headerOnlyReceipt, err := client.PurchaseReceipt.Create().
		SetReceiptNo("PG-PRTN-FK-HEAD-" + fixtures.suffix).
		SetSupplierName("PG退货供应商").
		SetStatus(biz.PurchaseReceiptStatusPosted).
		SetReceivedAt(time.Date(2026, 4, 26, 16, 0, 0, 0, time.UTC)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create header-only receipt for return FK test failed: %v", err)
	}
	purchaseReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PG-PRTN-FK-HEAD-RET-" + fixtures.suffix,
		PurchaseReceiptID: &headerOnlyReceipt.ID,
		SupplierName:      "PG退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 16, 10, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create return linked to header-only receipt failed: %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipts WHERE id = $1`, headerOnlyReceipt.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt referenced by purchase_return to fail")
	}
	persistedReturn, err := client.PurchaseReturn.Get(ctx, purchaseReturn.ID)
	if err != nil {
		t.Fatalf("get purchase return after failed origin receipt delete failed: %v", err)
	}
	assertOptionalIntEqual(t, persistedReturn.PurchaseReceiptID, headerOnlyReceipt.ID)

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-FK-ITEM-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-FK-ITEM-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected receipt item FK test lot_id")
	}
	itemReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PG-PRTN-FK-ITEM-RET-" + fixtures.suffix,
		SupplierName: "PG退货供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 16, 20, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create return for receipt item FK test failed: %v", err)
	}
	returnItem, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              itemReturn.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "1"),
	})
	if err != nil {
		t.Fatalf("add return item linked to receipt item failed: %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipt_items WHERE id = $1`, receiptItem.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt_item referenced by purchase_return_item to fail")
	}
	persistedReturnItem, err := client.PurchaseReturnItem.Get(ctx, returnItem.ID)
	if err != nil {
		t.Fatalf("get purchase return item after failed origin receipt item delete failed: %v", err)
	}
	assertOptionalIntEqual(t, persistedReturnItem.PurchaseReceiptItemID, receiptItem.ID)
}

func TestPurchaseReturnPostgresReceiptItemCumulativeLimit(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)

	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-CUM-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-CUM-LOT-"+fixtures.suffix), mustDecimal(t, "100"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected postgres cumulative receipt lot_id")
	}
	createLinkedReturn := func(returnNo string, quantity decimal.Decimal) *biz.PurchaseReturn {
		t.Helper()
		purchaseReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
			ReturnNo:          returnNo,
			PurchaseReceiptID: &postedReceipt.ID,
			SupplierName:      "PG累计退货供应商",
			ReturnedAt:        time.Date(2026, 4, 26, 17, 0, 0, 0, time.UTC),
		})
		if err != nil {
			t.Fatalf("create postgres linked return %s failed: %v", returnNo, err)
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
			t.Fatalf("add postgres linked return item %s failed: %v", returnNo, err)
		}
		return purchaseReturn
	}

	return60 := createLinkedReturn("PG-PRTN-CUM-060-"+fixtures.suffix, mustDecimal(t, "60"))
	if _, err := uc.PostPurchaseReturn(ctx, return60.ID); err != nil {
		t.Fatalf("post postgres 60 cumulative return failed: %v", err)
	}
	return40 := createLinkedReturn("PG-PRTN-CUM-040-"+fixtures.suffix, mustDecimal(t, "40"))
	if _, err := uc.PostPurchaseReturn(ctx, return40.ID); err != nil {
		t.Fatalf("post postgres 40 cumulative return failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, return40.ID); err != nil {
		t.Fatalf("repeat postgres post 40 cumulative return should be idempotent, got %v", err)
	}
	outCount40, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(return40.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres repeated cumulative return out txns failed: %v", err)
	}
	if outCount40 != 1 {
		t.Fatalf("repeat postgres post should keep one out txn, got %d", outCount40)
	}

	extraStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-CUM-IN-EXTRA-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-CUM-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	if extraStockReceipt.Items[0].LotID == nil || *extraStockReceipt.Items[0].LotID == *receiptItem.LotID {
		t.Fatalf("same supplier lot snapshot must keep postgres receipt-line stock isolated")
	}
	overOriginal := createLinkedReturn("PG-PRTN-CUM-OVER-"+fixtures.suffix, mustDecimal(t, "1"))
	if _, err := uc.PostPurchaseReturn(ctx, overOriginal.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cumulative over-return to be rejected even with stock available, got %v", err)
	}

	if _, err := uc.CancelPostedPurchaseReturn(ctx, return60.ID); err != nil {
		t.Fatalf("cancel postgres 60 cumulative return failed: %v", err)
	}
	releasedReturn := createLinkedReturn("PG-PRTN-CUM-RELEASED-"+fixtures.suffix, mustDecimal(t, "60"))
	if _, err := uc.PostPurchaseReturn(ctx, releasedReturn.ID); err != nil {
		t.Fatalf("post postgres return after cancellation released quantity failed: %v", err)
	}

	multiLineReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-CUM-IN-MULTI-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-CUM-LOT-MULTI-"+fixtures.suffix), mustDecimal(t, "100"))
	multiLineItem := multiLineReceipt.Items[0]
	if multiLineItem.LotID == nil {
		t.Fatalf("expected postgres multi-line receipt lot_id")
	}
	multiLineReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PG-PRTN-CUM-MULTI-" + fixtures.suffix,
		PurchaseReceiptID: &multiLineReceipt.ID,
		SupplierName:      "PG累计退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 18, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres multi-line cumulative return failed: %v", err)
	}
	for _, quantity := range []string{"70", "31"} {
		if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
			ReturnID:              multiLineReturn.ID,
			PurchaseReceiptItemID: &multiLineItem.ID,
			MaterialID:            fixtures.materialID,
			WarehouseID:           fixtures.warehouseID,
			UnitID:                fixtures.unitID,
			LotID:                 multiLineItem.LotID,
			Quantity:              mustDecimal(t, quantity),
		}); err != nil {
			t.Fatalf("add postgres multi-line cumulative item %s failed: %v", quantity, err)
		}
	}
	if _, err := uc.PostPurchaseReturn(ctx, multiLineReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres same-return multi-line over original receipt item to be rejected, got %v", err)
	}

	lowStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-CUM-IN-LOW-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-CUM-LOT-LOW-"+fixtures.suffix), mustDecimal(t, "100"))
	lowStockItem := lowStockReceipt.Items[0]
	if lowStockItem.LotID == nil {
		t.Fatalf("expected postgres low-stock receipt lot_id")
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          lowStockItem.LotID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "95"),
		UnitID:         fixtures.unitID,
		SourceType:     "PG_TEST_LOW_STOCK_CONSUME",
		IdempotencyKey: "pg-test-low-stock-before-linked-return-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("consume postgres low-stock lot before linked return failed: %v", err)
	}
	lowStockReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PG-PRTN-CUM-LOW-STOCK-" + fixtures.suffix,
		PurchaseReceiptID: &lowStockReceipt.ID,
		SupplierName:      "PG累计退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 19, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres low-stock return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              lowStockReturn.ID,
		PurchaseReceiptItemID: &lowStockItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 lowStockItem.LotID,
		Quantity:              mustDecimal(t, "10"),
	}); err != nil {
		t.Fatalf("add postgres low-stock return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, lowStockReturn.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected postgres linked return within original quantity but over current stock to be rejected, got %v", err)
	}
}

func TestPurchaseReturnPostgresConcurrentLotOutbound(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)

	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}
	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-CONCURRENT-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-CONCURRENT-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected postgres concurrent receipt lot_id")
	}

	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for i := 0; i < 20; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			ret, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
				ReturnNo:     fmt.Sprintf("PG-PRTN-CONCURRENT-%s-%02d", fixtures.suffix, i),
				SupplierName: "PG退货供应商",
				ReturnedAt:   time.Date(2026, 4, 26, 15, 0, 0, 0, time.UTC),
			})
			if err != nil {
				errs <- err
				return
			}
			if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
				ReturnID:              ret.ID,
				PurchaseReceiptItemID: &receiptItem.ID,
				MaterialID:            fixtures.materialID,
				WarehouseID:           fixtures.warehouseID,
				UnitID:                fixtures.unitID,
				LotID:                 receiptItem.LotID,
				Quantity:              mustDecimal(t, "1"),
			}); err != nil {
				errs <- err
				return
			}
			_, err = uc.PostPurchaseReturn(ctx, ret.ID)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)

	successes := 0
	failures := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrInventoryInsufficientStock) || errors.Is(err, biz.ErrBadParam):
			failures++
		default:
			t.Fatalf("unexpected postgres concurrent return error: %v", err)
		}
	}
	if successes > 10 {
		t.Fatalf("postgres concurrent purchase returns must not exceed stock, successes=%d", successes)
	}
	if failures < 10 {
		t.Fatalf("expected at least 10 postgres concurrent return failures, got %d", failures)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres lot balance after concurrent returns failed: %v", err)
	}
	if balance.Quantity.Cmp(decimal.Zero) < 0 {
		t.Fatalf("postgres concurrent purchase returns produced negative balance: %s", balance.Quantity)
	}
	assertDecimalEqual(t, balance.Quantity, fmt.Sprintf("%d", 10-successes))
}
