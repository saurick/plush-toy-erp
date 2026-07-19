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
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseReceiptPostgresMigrationShape(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)

	for _, table := range []string{
		"purchase_receipts",
		"purchase_receipt_items",
	} {
		assertPostgresTableExists(t, data.sqldb, table)
	}
	assertPostgresNumericColumn(t, data.sqldb, "purchase_receipt_items", "quantity", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "purchase_receipt_items", "unit_price", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "purchase_receipt_items", "amount", 20, 6)
	assertPostgresColumnExists(t, data.sqldb, "purchase_receipts", "idempotency_key")
	assertPostgresColumnExists(t, data.sqldb, "purchase_receipts", "idempotency_payload_hash")
	assertPostgresColumnExists(t, data.sqldb, "purchase_receipts", "idempotency_item_count")
	assertPostgresColumnExists(t, data.sqldb, "purchase_receipt_items", "idempotency_key")
	assertPostgresColumnExists(t, data.sqldb, "purchase_receipt_items", "idempotency_payload_hash")
	assertPostgresUniqueIndex(t, data.sqldb, "purchase_receipts", "purchasereceipt_receipt_no")
	assertPostgresUniqueIndex(t, data.sqldb, "purchase_receipts", "purchasereceipt_idempotency_key")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "purchase_receipt_items", "purchasereceiptitem_receipt_id_idempotency_key", "idempotency_key IS NOT NULL AND idempotency_key <> ''")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "purchase_receipt_items", "purchasereceiptitem_receipt_id_source_line_no", "source_line_no IS NOT NULL AND source_line_no <> ''")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_receipts", "purchase_receipts_idempotency_bundle_complete", "idempotency_item_count > 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_receipt_items", "purchase_receipt_items_quantity_positive", "quantity > 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_receipt_items", "purchase_receipt_items_unit_price_non_negative", "unit_price IS NULL OR unit_price >= 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_receipt_items", "purchase_receipt_items_amount_non_negative", "amount IS NULL OR amount >= 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_receipt_items", "purchase_receipt_items_idempotency_bundle_complete", "length(idempotency_payload_hash) = 64")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_receipt_items", "purchase_receipt_items_inventory_lots_purchase_receipt_items", "NO ACTION")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id", "lot_id IS NULL")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l", "lot_id IS NOT NULL")

	fixtures := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PG-PR-SHAPE-" + fixtures.suffix,
		SupplierName: "PG供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres purchase receipt shape draft failed: %v", err)
	}
	draftToCancel, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PG-PR-SHAPE-CANCEL-" + fixtures.suffix,
		SupplierName: "PG供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres purchase receipt cancellation draft failed: %v", err)
	}
	if cancelled, err := uc.CancelPostedPurchaseReceipt(ctx, draftToCancel.ID); err != nil || cancelled.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("cancel postgres draft purchase receipt = %#v, err=%v", cancelled, err)
	}
	if _, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PG-PR-SHAPE-" + fixtures.suffix,
		SupplierName: "PG供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres receipt_no unique constraint, got %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       mustDecimal(t, "1"),
		SourceLineNo:   stringPtr("same-line"),
		IdempotencyKey: "test:postgres:source-line:first:" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("create postgres source line item failed: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       mustDecimal(t, "1"),
		SourceLineNo:   stringPtr("same-line"),
		IdempotencyKey: "test:postgres:source-line:second:" + fixtures.suffix,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres receipt source_line_no unique constraint, got %v", err)
	}
	if _, err := client.PurchaseReceiptItem.Create().
		SetReceiptID(receipt.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(decimal.Zero).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres quantity DB check, got %v", err)
	}
	if _, err := client.PurchaseReceiptItem.Create().
		SetReceiptID(receipt.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		SetUnitPrice(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres unit_price DB check, got %v", err)
	}
	if _, err := client.PurchaseReceiptItem.Create().
		SetReceiptID(receipt.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		SetAmount(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres amount DB check, got %v", err)
	}
}

func TestPurchaseReceiptPostgresFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)

	fixtures := createPurchaseReceiptPostgresFixtures(t, ctx, client)
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

	posted := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PR-FLOW-"+fixtures.suffix, invFixtures, stringPtr("PG-LOT-FLOW-"+fixtures.suffix), mustDecimal(t, "10"))
	lotID := posted.Items[0].LotID
	if lotID == nil {
		t.Fatalf("expected postgres posted purchase receipt lot_id")
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres purchase receipt lot balance failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "10")

	inboundTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(posted.ID),
			inventorytxn.SourceLineID(posted.Items[0].ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find postgres purchase receipt inbound txn failed: %v", err)
	}
	assertOptionalIntEqual(t, inboundTxn.LotID, *lotID)
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      posted.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       mustDecimal(t, "1"),
		IdempotencyKey: "test:postgres:posted-reject:" + fixtures.suffix,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres posted receipt item add to be rejected, got %v", err)
	}
	if _, err := client.PurchaseReceipt.UpdateOneID(posted.ID).SetStatus(biz.PurchaseReceiptStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted receipt status update to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.UpdateOneID(posted.Items[0].ID).SetQuantity(mustDecimal(t, "11")).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted receipt item quantity update to be rejected")
	}
	if _, err := client.PurchaseReceipt.Delete().Where(purchasereceipt.ID(posted.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres posted receipt bulk delete to be rejected")
	}
	if err := client.PurchaseReceiptItem.DeleteOneID(posted.Items[0].ID).Exec(ctx); err == nil {
		t.Fatalf("expected postgres posted receipt item delete-one to be rejected")
	}

	if _, err := uc.PostPurchaseReceipt(ctx, posted.ID); err != nil {
		t.Fatalf("repeat postgres purchase receipt post failed: %v", err)
	}
	inboundCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(posted.ID),
			inventorytxn.SourceLineID(posted.Items[0].ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres purchase receipt inbound txns failed: %v", err)
	}
	if inboundCount != 1 {
		t.Fatalf("expected one postgres inbound txn after repeat post, got %d", inboundCount)
	}

	second := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PR-FLOW-REUSE-"+fixtures.suffix, invFixtures, stringPtr("PG-LOT-FLOW-"+fixtures.suffix), mustDecimal(t, "2"))
	if second.Items[0].LotID == nil || *second.Items[0].LotID == *lotID {
		t.Fatalf("same supplier lot snapshot must keep postgres receipt-line lot identities distinct")
	}
	reusedBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres reused lot balance failed: %v", err)
	}
	assertDecimalEqual(t, reusedBalance.Quantity, "10")

	nonLot := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PR-FLOW-NOLOT-"+fixtures.suffix, invFixtures, nil, mustDecimal(t, "4"))
	if nonLot.Items[0].LotID == nil {
		t.Fatalf("expected postgres generated receipt-line lot identity")
	}
	nonLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       nonLot.Items[0].LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres non-lot purchase balance failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalance.Quantity, "4")

	cancelled, err := uc.CancelPostedPurchaseReceipt(ctx, posted.ID)
	if err != nil {
		t.Fatalf("cancel postgres posted purchase receipt failed: %v", err)
	}
	if cancelled.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("expected postgres cancelled receipt, got %s", cancelled.Status)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, posted.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cancelled receipt post to be rejected, got %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      posted.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       mustDecimal(t, "1"),
		IdempotencyKey: "test:postgres:cancelled-reject:" + fixtures.suffix,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cancelled receipt item add to be rejected, got %v", err)
	}
	if _, err := client.PurchaseReceipt.UpdateOneID(posted.ID).SetSupplierName("PG修改供应商").Save(ctx); err == nil {
		t.Fatalf("expected postgres cancelled receipt protected update to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.UpdateOneID(posted.Items[0].ID).SetLotNo("PG-LOT-CHANGED").Save(ctx); err == nil {
		t.Fatalf("expected postgres cancelled receipt item lot_no update to be rejected")
	}
	if err := client.PurchaseReceipt.DeleteOneID(posted.ID).Exec(ctx); err == nil {
		t.Fatalf("expected postgres cancelled receipt delete-one to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.Delete().Where(purchasereceiptitem.ID(posted.Items[0].ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres cancelled receipt item bulk delete to be rejected")
	}
	afterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres lot balance after cancel failed: %v", err)
	}
	assertDecimalEqual(t, afterCancel.Quantity, "0")
	secondBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       second.Items[0].LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres second receipt-line lot balance after first receipt cancel failed: %v", err)
	}
	assertDecimalEqual(t, secondBalance.Quantity, "2")
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(inboundTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres purchase receipt reversal failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("expected one postgres reversal, got %d", reversalCount)
	}
	traceTxns, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(posted.ID),
			inventorytxn.SourceLineID(posted.Items[0].ID),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query postgres purchase receipt trace txns failed: %v", err)
	}
	if len(traceTxns) != 2 {
		t.Fatalf("expected postgres inbound and reversal trace txns, got %d", len(traceTxns))
	}
	for _, txn := range traceTxns {
		assertOptionalIntEqual(t, txn.SourceID, posted.ID)
		assertOptionalIntEqual(t, txn.SourceLineID, posted.Items[0].ID)
		assertOptionalIntEqual(t, txn.LotID, *lotID)
		if err := client.InventoryTxn.DeleteOneID(txn.ID).Exec(ctx); err == nil {
			t.Fatalf("expected postgres trace inventory txn delete to be rejected")
		}
	}
	if _, err := client.PurchaseReceipt.Get(ctx, posted.ID); err != nil {
		t.Fatalf("postgres receipt should remain after failed deletes: %v", err)
	}
	if _, err := client.PurchaseReceiptItem.Get(ctx, posted.Items[0].ID); err != nil {
		t.Fatalf("postgres receipt item should remain after failed deletes: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, posted.ID); err != nil {
		t.Fatalf("repeat postgres purchase receipt cancel failed: %v", err)
	}
	reversalCount, err = client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(inboundTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres purchase receipt reversal after repeat cancel failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("expected one postgres reversal after repeat cancel, got %d", reversalCount)
	}
}

func TestPurchaseReceiptPostgresDraftPostCancelConcurrency(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	postgresFixtures := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	fixtures := inventoryTestFixtures{
		unitID:      postgresFixtures.unitID,
		materialID:  postgresFixtures.materialID,
		productID:   postgresFixtures.productID,
		warehouseID: postgresFixtures.warehouseID,
	}
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	for _, postFirst := range []bool{true, false} {
		name := "cancel first"
		if postFirst {
			name = "post first"
		}
		t.Run(name, func(t *testing.T) {
			suffix := fmt.Sprintf("%s-%t", postgresFixtures.suffix, postFirst)
			receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
				ReceiptNo:    "PG-PR-DRAFT-POST-CANCEL-" + suffix,
				SupplierName: "PG并发供应商",
				ReceivedAt:   time.Date(2026, 7, 18, 10, 0, 0, 0, time.UTC),
			})
			if err != nil {
				t.Fatalf("create draft receipt failed: %v", err)
			}
			item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
				ReceiptID:      receipt.ID,
				MaterialID:     fixtures.materialID,
				WarehouseID:    fixtures.warehouseID,
				UnitID:         fixtures.unitID,
				LotNo:          stringPtr("PG-PR-DRAFT-POST-CANCEL-LOT-" + suffix),
				Quantity:       mustDecimal(t, "3"),
				IdempotencyKey: "test:postgres:receipt:draft-post-cancel:" + suffix,
			})
			if err != nil || item.LotID == nil {
				t.Fatalf("add draft receipt item = %#v, err=%v", item, err)
			}
			passAllPurchaseReceiptQualityInspections(t, ctx, uc, receipt.ID)

			blocker, err := data.sqldb.BeginTx(ctx, nil)
			if err != nil {
				t.Fatalf("begin receipt lock blocker failed: %v", err)
			}
			blockerOpen := true
			t.Cleanup(func() {
				if blockerOpen {
					_ = blocker.Rollback()
				}
			})
			var lockedID int
			if err := blocker.QueryRowContext(ctx, `SELECT id FROM purchase_receipts WHERE id = $1 FOR UPDATE`, receipt.ID).Scan(&lockedID); err != nil {
				t.Fatalf("lock draft receipt failed: %v", err)
			}

			postDone := make(chan error, 1)
			cancelDone := make(chan error, 1)
			startPost := func() { go func() { _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); postDone <- err }() }
			startCancel := func() { go func() { _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); cancelDone <- err }() }
			if postFirst {
				startPost()
			} else {
				startCancel()
			}
			waitForPostgresBlockedQueryCount(t, ctx, data.sqldb, "SELECT id FROM purchase_receipts", 1)
			if postFirst {
				startCancel()
			} else {
				startPost()
			}
			waitForPostgresBlockedQueryCount(t, ctx, data.sqldb, "SELECT id FROM purchase_receipts", 2)
			if err := blocker.Rollback(); err != nil {
				t.Fatalf("release receipt lock blocker failed: %v", err)
			}
			blockerOpen = false
			postErr := receivePurchaseOperationError(t, postDone, "purchase receipt post")
			cancelErr := receivePurchaseOperationError(t, cancelDone, "purchase receipt cancel")

			persisted := client.PurchaseReceipt.GetX(ctx, receipt.ID)
			if persisted.Status != biz.PurchaseReceiptStatusCancelled {
				t.Fatalf("final receipt status=%s, want CANCELLED", persisted.Status)
			}
			txnCount := client.InventoryTxn.Query().Where(
				inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
				inventorytxn.SourceID(receipt.ID),
			).CountX(ctx)
			balances := client.InventoryBalance.Query().Where(inventorybalance.LotID(*item.LotID)).AllX(ctx)
			for _, balance := range balances {
				if !balance.Quantity.IsZero() {
					t.Fatalf("final receipt lot balance=%s, want zero", balance.Quantity)
				}
			}
			lot := client.InventoryLot.GetX(ctx, *item.LotID)
			if postFirst {
				if postErr != nil || cancelErr != nil || persisted.PostedAt == nil || txnCount != 2 || lot.Status != biz.InventoryLotActive {
					t.Fatalf("post-first result post=%v cancel=%v posted_at=%v txns=%d lot=%s", postErr, cancelErr, persisted.PostedAt, txnCount, lot.Status)
				}
			} else if !errors.Is(postErr, biz.ErrBadParam) || cancelErr != nil || persisted.PostedAt != nil || txnCount != 0 || lot.Status != biz.InventoryLotDisabled {
				t.Fatalf("cancel-first result post=%v cancel=%v posted_at=%v txns=%d lot=%s", postErr, cancelErr, persisted.PostedAt, txnCount, lot.Status)
			}
		})
	}
}

func TestPurchaseReceiptPostgresConcurrentItemReplayReturnsOneFactSet(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	fixtures := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PG-PR-ITEM-IDEMPOTENCY-" + fixtures.suffix,
		SupplierName: "PG幂等供应商",
		ReceivedAt:   time.Now().UTC().Truncate(time.Microsecond),
	})
	if err != nil {
		t.Fatalf("create postgres receipt draft failed: %v", err)
	}
	lotCountBefore := client.InventoryLot.Query().CountX(ctx)
	inspectionCountBefore := client.QualityInspection.Query().CountX(ctx)
	input := biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		LotNo:          stringPtr("PG-IDEMPOTENT-LOT-" + fixtures.suffix),
		Quantity:       mustDecimal(t, "5"),
		SourceLineNo:   stringPtr("PG-IDEMPOTENT-LINE"),
		IdempotencyKey: "test:postgres:purchase-receipt-item:" + fixtures.suffix,
	}

	type addResult struct {
		item *biz.PurchaseReceiptItem
		err  error
	}
	start := make(chan struct{})
	results := make(chan addResult, 2)
	var ready sync.WaitGroup
	ready.Add(2)
	for range 2 {
		go func() {
			ready.Done()
			<-start
			attempt := input
			item, err := uc.AddPurchaseReceiptItem(ctx, &attempt)
			results <- addResult{item: item, err: err}
		}()
	}
	ready.Wait()
	close(start)
	first := <-results
	second := <-results
	if first.err != nil || second.err != nil {
		t.Fatalf("concurrent idempotent append errors: first=%v second=%v", first.err, second.err)
	}
	if first.item == nil || second.item == nil || first.item.ID != second.item.ID {
		t.Fatalf("concurrent idempotent append results differ: first=%#v second=%#v", first.item, second.item)
	}
	if got := client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receipt.ID)).CountX(ctx); got != 1 {
		t.Fatalf("concurrent idempotent append item count=%d, want 1", got)
	}
	if got := client.InventoryLot.Query().CountX(ctx); got != lotCountBefore+1 {
		t.Fatalf("concurrent idempotent append lot count=%d, want %d", got, lotCountBefore+1)
	}
	if got := client.QualityInspection.Query().CountX(ctx); got != inspectionCountBefore+1 {
		t.Fatalf("concurrent idempotent append inspection count=%d, want %d", got, inspectionCountBefore+1)
	}
}

func TestPurchaseReceiptPostgresConcurrentCreateFromOrderReturnsOneFactSet(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	postgresFixtures := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	fixtures := inventoryTestFixtures{
		unitID:      postgresFixtures.unitID,
		materialID:  postgresFixtures.materialID,
		productID:   postgresFixtures.productID,
		warehouseID: postgresFixtures.warehouseID,
	}
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "PG-CREATE-IDEMPOTENCY-"+postgresFixtures.suffix, mustDecimal(t, "7"))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	input := biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: orderItem.PurchaseOrderID,
		ReceiptNo:       "PG-PR-CREATE-IDEMPOTENCY-" + postgresFixtures.suffix,
		WarehouseID:     fixtures.warehouseID,
		ReceivedAt:      time.Now().UTC().Truncate(time.Microsecond),
		IdempotencyKey:  "test:postgres:purchase-receipt-create:" + postgresFixtures.suffix,
	}

	type createResult struct {
		receipt *biz.PurchaseReceipt
		err     error
	}
	start := make(chan struct{})
	results := make(chan createResult, 2)
	var ready sync.WaitGroup
	ready.Add(2)
	for range 2 {
		go func() {
			ready.Done()
			<-start
			attempt := input
			receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &attempt)
			results <- createResult{receipt: receipt, err: err}
		}()
	}
	ready.Wait()
	close(start)
	first, second := <-results, <-results
	if first.err != nil || second.err != nil {
		t.Fatalf("concurrent idempotent receipt creation errors: first=%v second=%v", first.err, second.err)
	}
	if first.receipt == nil || second.receipt == nil || first.receipt.ID != second.receipt.ID {
		t.Fatalf("concurrent idempotent receipt results differ: first=%#v second=%#v", first.receipt, second.receipt)
	}
	receiptID := first.receipt.ID
	if got := client.PurchaseReceipt.Query().Where(purchasereceipt.IdempotencyKey(input.IdempotencyKey)).CountX(ctx); got != 1 {
		t.Fatalf("concurrent idempotent receipt count=%d, want 1", got)
	}
	items, err := client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receiptID)).All(ctx)
	if err != nil {
		t.Fatalf("load generated receipt items: %v", err)
	}
	if len(items) != 1 || items[0].LotID == nil {
		t.Fatalf("generated receipt fact boundary is incomplete: %#v", items)
	}
	if got := client.QualityInspection.Query().Where(qualityinspection.PurchaseReceiptID(receiptID)).CountX(ctx); got != 1 {
		t.Fatalf("concurrent idempotent initial inspection count=%d, want 1", got)
	}
}

func TestPurchaseReceiptPostgresMaterialSupplyMultiLineQualityGate(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	postgresFixtures := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	fixtures := inventoryTestFixtures{
		unitID:      postgresFixtures.unitID,
		materialID:  postgresFixtures.materialID,
		productID:   postgresFixtures.productID,
		warehouseID: postgresFixtures.warehouseID,
	}
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "PG-QUALITY-"+postgresFixtures.suffix, mustDecimal(t, "6"))
	secondMaterial := createTestMaterial(t, ctx, client, fixtures.unitID, "PG-MAT-QUALITY-2-"+postgresFixtures.suffix)
	if _, err := client.PurchaseOrderItem.Create().
		SetPurchaseOrderID(orderItem.PurchaseOrderID).
		SetLineNo(2).
		SetMaterialID(secondMaterial.ID).
		SetUnitID(fixtures.unitID).
		SetPurchasedQuantity(mustDecimal(t, "3")).
		SetLineStatus(biz.PurchaseOrderItemStatusOpen).
		Save(ctx); err != nil {
		t.Fatalf("create postgres second purchase order line failed: %v", err)
	}
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: orderItem.PurchaseOrderID,
		ReceiptNo:       "PG-PR-QUALITY-" + postgresFixtures.suffix,
		WarehouseID:     fixtures.warehouseID,
	})
	if err != nil {
		t.Fatalf("create postgres material supply receipt failed: %v", err)
	}
	if len(receipt.Items) != 2 || len(receipt.QualityInspections) != 2 {
		t.Fatalf("expected postgres two-line quality preparation, receipt=%#v", receipt)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrPurchaseReceiptQualityPending) {
		t.Fatalf("postgres pending quality must block post, got %v", err)
	}
	cancelledInspection := receipt.QualityInspections[0]
	if _, err := uc.CancelQualityInspection(ctx, cancelledInspection.ID, nil); err != nil {
		t.Fatalf("cancel postgres initial line inspection failed: %v", err)
	}
	replacement, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:          "PG-QI-REPLACEMENT-" + postgresFixtures.suffix,
		PurchaseReceiptID:     receipt.ID,
		PurchaseReceiptItemID: cancelledInspection.PurchaseReceiptItemID,
		InventoryLotID:        cancelledInspection.InventoryLotID,
		MaterialID:            cancelledInspection.MaterialID,
		WarehouseID:           cancelledInspection.WarehouseID,
		SourceType:            biz.QualityInspectionSourcePurchaseReceipt,
		SourceID:              receipt.ID,
		InspectionType:        biz.QualityInspectionTypeIncoming,
		SubjectType:           biz.QualityInspectionSubjectMaterial,
		SubjectID:             cancelledInspection.MaterialID,
	})
	if err != nil {
		t.Fatalf("create postgres replacement line inspection failed: %v", err)
	}
	replacement, err = uc.SubmitQualityInspection(ctx, replacement.ID)
	if err != nil {
		t.Fatalf("submit postgres replacement line inspection failed: %v", err)
	}
	for _, inspection := range []*biz.QualityInspection{replacement, receipt.QualityInspections[1]} {
		if _, err := uc.PassQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultPass)); err != nil {
			t.Fatalf("pass postgres line inspection %d failed: %v", inspection.ID, err)
		}
	}
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("postgres qualified multi-line receipt post failed: %v", err)
	}
	count := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
		inventorytxn.SourceID(receipt.ID),
		inventorytxn.TxnType(biz.InventoryTxnIn),
	).CountX(ctx)
	if count != 2 {
		t.Fatalf("expected two postgres inbound txns, got %d", count)
	}
}
