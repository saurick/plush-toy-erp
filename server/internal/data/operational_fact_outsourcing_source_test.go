package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type outsourcingFactSourceFixture struct {
	order        *ent.OutsourcingOrder
	materialLine *ent.OutsourcingOrderItem
	productLine  *ent.OutsourcingOrderItem
	productSKU   *ent.ProductSKU
}

func TestOutsourcingFactFromOrderDerivesSourceAndRestrictsLineTypes(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "outsourcing_fact_source_derivation")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	productSKU, err := client.ProductSKU.Create().
		SetProductID(fixtures.productID).
		SetSkuCode("SKU-OUT-DERIVE").
		SetSkuName("委外来源规格").
		SetDefaultUnitID(fixtures.unitID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create product SKU: %v", err)
	}
	source := createOutsourcingFactSourceFixtureWithSKU(t, ctx, client, fixtures, "DERIVE", decimal.NewFromInt(8), &productSKU.ID)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))

	issueIn := &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 "OUT-ISSUE-DERIVE",
		OutsourcingOrderID:     source.order.ID,
		OutsourcingOrderItemID: source.materialLine.ID,
		WarehouseID:            fixtures.warehouseID,
		Quantity:               decimal.NewFromInt(3),
		IdempotencyKey:         "OUT-ISSUE-DERIVE",
	}
	issue, err := uc.CreateOutsourcingMaterialIssueFromOrder(ctx, issueIn)
	if err != nil {
		t.Fatalf("create sourced material issue: %v", err)
	}
	assertOutsourcingFactSource(t, issue, biz.OutsourcingFactMaterialIssue, biz.InventorySubjectMaterial, fixtures.materialID, source)
	replayed, err := uc.CreateOutsourcingMaterialIssueFromOrder(ctx, issueIn)
	if err != nil || replayed.ID != issue.ID {
		t.Fatalf("same-intent replay = %#v, err=%v", replayed, err)
	}
	conflict := *issueIn
	conflict.Quantity = decimal.NewFromInt(4)
	if _, err := uc.CreateOutsourcingMaterialIssueFromOrder(ctx, &conflict); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed-intent replay error = %v, want idempotency conflict", err)
	}

	wrongIssue := *issueIn
	wrongIssue.FactNo = "OUT-ISSUE-PRODUCT-LINE"
	wrongIssue.IdempotencyKey = "OUT-ISSUE-PRODUCT-LINE"
	wrongIssue.OutsourcingOrderItemID = source.productLine.ID
	if _, err := uc.CreateOutsourcingMaterialIssueFromOrder(ctx, &wrongIssue); !errors.Is(err, biz.ErrOutsourcingOrderFactSourceInvalid) {
		t.Fatalf("product-line material issue error = %v, want source invalid", err)
	}

	wrongReceipt := wrongIssue
	wrongReceipt.FactNo = "OUT-RECEIPT-MATERIAL-LINE"
	wrongReceipt.IdempotencyKey = "OUT-RECEIPT-MATERIAL-LINE"
	wrongReceipt.OutsourcingOrderItemID = source.materialLine.ID
	wrongReceiptLotNo := "OUT-RECEIPT-MATERIAL-LINE-LOT"
	wrongReceipt.NewLotNo = &wrongReceiptLotNo
	if _, err := uc.CreateOutsourcingReturnReceiptFromOrder(ctx, &wrongReceipt); !errors.Is(err, biz.ErrOutsourcingOrderFactSourceInvalid) {
		t.Fatalf("material-line return receipt error = %v, want source invalid", err)
	}

	receiptLotNo := "OUT-RECEIPT-DERIVE-LOT"
	receiptIn := &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 "OUT-RECEIPT-DERIVE",
		OutsourcingOrderID:     source.order.ID,
		OutsourcingOrderItemID: source.productLine.ID,
		WarehouseID:            fixtures.warehouseID,
		NewLotNo:               &receiptLotNo,
		Quantity:               decimal.NewFromInt(2),
		IdempotencyKey:         "OUT-RECEIPT-DERIVE",
	}
	receipt, err := uc.CreateOutsourcingReturnReceiptFromOrder(ctx, receiptIn)
	if err != nil {
		t.Fatalf("create sourced return receipt: %v", err)
	}
	assertOutsourcingFactSource(t, receipt, biz.OutsourcingFactReturnReceipt, biz.InventorySubjectProduct, fixtures.productID, source)
	assertOutsourcingFactSKUSnapshot(t, receipt, productSKU.SkuCode)
	replayedReceipt, err := uc.CreateOutsourcingReturnReceiptFromOrder(ctx, receiptIn)
	if err != nil || replayedReceipt.ID != receipt.ID {
		t.Fatalf("same-intent return replay = %#v, err=%v", replayedReceipt, err)
	}
	assertOutsourcingFactSKUSnapshot(t, replayedReceipt, productSKU.SkuCode)
	postedReceipt, err := uc.PostOutsourcingFact(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post sourced return receipt: %v", err)
	}
	assertOutsourcingFactSKUSnapshot(t, postedReceipt, productSKU.SkuCode)
	cancelledReceipt, err := uc.CancelPostedOutsourcingFact(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("cancel sourced return receipt: %v", err)
	}
	assertOutsourcingFactSKUSnapshot(t, cancelledReceipt, productSKU.SkuCode)
	listed, total, err := uc.ListOutsourcingFacts(ctx, biz.OperationalFactFilter{
		SourceType: biz.OutsourcingOrderSourceType,
		SourceID:   source.order.ID,
	})
	if err != nil || total != 2 || len(listed) != 2 {
		t.Fatalf("listed sourced outsourcing facts rows=%#v total=%d err=%v", listed, total, err)
	}
	for _, item := range listed {
		if item.SourceNo == nil || *item.SourceNo != source.order.OutsourcingOrderNo {
			t.Fatalf("listed outsourcing source number = %#v, want %q", item.SourceNo, source.order.OutsourcingOrderNo)
		}
	}
	assertListedSnapshot := func(rows []*biz.OutsourcingFact, factID int, want *string) {
		t.Helper()
		for _, item := range rows {
			if item.ID != factID {
				continue
			}
			if want == nil {
				if item.SKUCodeSnapshot != nil {
					t.Fatalf("historical missing source SKU snapshot = %#v, want nil", item.SKUCodeSnapshot)
				}
				return
			}
			if item.SKUCodeSnapshot == nil || *item.SKUCodeSnapshot != *want {
				t.Fatalf("return source SKU snapshot = %#v, want %q", item.SKUCodeSnapshot, *want)
			}
			return
		}
		t.Fatalf("outsourcing fact %d not found in list", factID)
	}
	assertListedSnapshot(listed, receipt.ID, &productSKU.SkuCode)

	if _, err := client.ProductSKU.UpdateOneID(productSKU.ID).SetSkuCode("SKU-OUT-DERIVE-RENAMED").Save(ctx); err != nil {
		t.Fatalf("rename product SKU: %v", err)
	}
	listed, _, err = uc.ListOutsourcingFacts(ctx, biz.OperationalFactFilter{SourceType: biz.OutsourcingOrderSourceType, SourceID: source.order.ID})
	if err != nil {
		t.Fatalf("list after SKU rename: %v", err)
	}
	assertListedSnapshot(listed, receipt.ID, &productSKU.SkuCode)

	if _, err := client.OutsourcingOrderItem.UpdateOneID(source.productLine.ID).ClearSkuCodeSnapshot().Save(ctx); err != nil {
		t.Fatalf("clear historical source SKU snapshot: %v", err)
	}
	listed, _, err = uc.ListOutsourcingFacts(ctx, biz.OperationalFactFilter{SourceType: biz.OutsourcingOrderSourceType, SourceID: source.order.ID})
	if err != nil {
		t.Fatalf("list after clearing source SKU snapshot: %v", err)
	}
	assertListedSnapshot(listed, receipt.ID, nil)

	if _, err := client.OutsourcingOrderItem.UpdateOneID(source.productLine.ID).SetSkuCodeSnapshot(productSKU.SkuCode).Save(ctx); err != nil {
		t.Fatalf("restore source SKU snapshot: %v", err)
	}
	otherSKU, err := client.ProductSKU.Create().
		SetProductID(fixtures.productID).
		SetSkuCode("SKU-OUT-DERIVE-OTHER").
		SetDefaultUnitID(fixtures.unitID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create mismatched product SKU: %v", err)
	}
	mismatched, err := client.OutsourcingFact.Create().
		SetFactNo("OUT-RECEIPT-DERIVE-MISMATCH").
		SetFactType(biz.OutsourcingFactReturnReceipt).
		SetStatus(biz.OperationalFactStatusDraft).
		SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(fixtures.productID).
		SetProductSkuID(otherSKU.ID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(decimal.NewFromInt(1)).
		SetSupplierID(source.order.SupplierID).
		SetSourceType(biz.OutsourcingOrderSourceType).
		SetSourceID(source.order.ID).
		SetSourceLineID(source.productLine.ID).
		SetIdempotencyKey("OUT-RECEIPT-DERIVE-MISMATCH").
		Save(ctx)
	if err != nil {
		t.Fatalf("create mismatched historical outsourcing fact: %v", err)
	}
	listed, _, err = uc.ListOutsourcingFacts(ctx, biz.OperationalFactFilter{SourceType: biz.OutsourcingOrderSourceType, SourceID: source.order.ID})
	if err != nil {
		t.Fatalf("list mismatched source SKU fact: %v", err)
	}
	foundMismatched := false
	for _, item := range listed {
		if item.ID != mismatched.ID {
			continue
		}
		foundMismatched = true
		if item.SKUCodeSnapshot != nil {
			t.Fatalf("mismatched source SKU snapshot = %#v, want nil", item.SKUCodeSnapshot)
		}
	}
	if !foundMismatched {
		t.Fatalf("mismatched outsourcing fact %d not found in list", mismatched.ID)
	}

	otherSource := createOutsourcingFactSourceFixtureWithSKU(t, ctx, client, fixtures, "DERIVE-OTHER-ORDER", decimal.NewFromInt(2), &productSKU.ID)
	crossOrder, err := client.OutsourcingFact.Create().
		SetFactNo("OUT-RECEIPT-DERIVE-CROSS-ORDER").
		SetFactType(biz.OutsourcingFactReturnReceipt).
		SetStatus(biz.OperationalFactStatusDraft).
		SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(fixtures.productID).
		SetProductSkuID(productSKU.ID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(decimal.NewFromInt(1)).
		SetSupplierID(source.order.SupplierID).
		SetSourceType(biz.OutsourcingOrderSourceType).
		SetSourceID(source.order.ID).
		SetSourceLineID(otherSource.productLine.ID).
		SetIdempotencyKey("OUT-RECEIPT-DERIVE-CROSS-ORDER").
		Save(ctx)
	if err != nil {
		t.Fatalf("create cross-order historical outsourcing fact: %v", err)
	}
	missingSourceID, err := client.OutsourcingFact.Create().
		SetFactNo("OUT-RECEIPT-DERIVE-MISSING-SOURCE-ID").
		SetFactType(biz.OutsourcingFactReturnReceipt).
		SetStatus(biz.OperationalFactStatusDraft).
		SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(fixtures.productID).
		SetProductSkuID(productSKU.ID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(decimal.NewFromInt(1)).
		SetSupplierID(source.order.SupplierID).
		SetSourceType(biz.OutsourcingOrderSourceType).
		SetSourceLineID(source.productLine.ID).
		SetIdempotencyKey("OUT-RECEIPT-DERIVE-MISSING-SOURCE-ID").
		Save(ctx)
	if err != nil {
		t.Fatalf("create missing-source-id historical outsourcing fact: %v", err)
	}
	nonCanonicalSourceType, err := client.OutsourcingFact.Create().
		SetFactNo("OUT-RECEIPT-DERIVE-NON-CANONICAL-SOURCE-TYPE").
		SetFactType(biz.OutsourcingFactReturnReceipt).
		SetStatus(biz.OperationalFactStatusDraft).
		SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(fixtures.productID).
		SetProductSkuID(productSKU.ID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(decimal.NewFromInt(1)).
		SetSupplierID(source.order.SupplierID).
		SetSourceType("outsourcing_order").
		SetSourceID(source.order.ID).
		SetSourceLineID(source.productLine.ID).
		SetIdempotencyKey("OUT-RECEIPT-DERIVE-NON-CANONICAL-SOURCE-TYPE").
		Save(ctx)
	if err != nil {
		t.Fatalf("create non-canonical-source-type historical outsourcing fact: %v", err)
	}
	listed, _, err = uc.ListOutsourcingFacts(ctx, biz.OperationalFactFilter{})
	if err != nil {
		t.Fatalf("list strict source SKU projection cases: %v", err)
	}
	assertListedSnapshot(listed, crossOrder.ID, nil)
	assertListedSnapshot(listed, missingSourceID.ID, nil)
	assertListedSnapshot(listed, nonCanonicalSourceType.ID, nil)
}

func TestOutsourcingFactFromOrderEnforcesPostedQuantityAndAllowsClosedSourceReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "outsourcing_fact_source_quantity")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	source := createOutsourcingFactSourceFixture(t, ctx, client, fixtures, "QTY", decimal.NewFromInt(5))
	logger := log.NewStdLogger(io.Discard)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	orderRepo := NewOutsourcingOrderRepo(data, logger)
	inventoryRepo := NewInventoryRepo(data, logger)
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(10),
		UnitID:         fixtures.unitID,
		SourceType:     "OUTSOURCING_SOURCE_TEST",
		IdempotencyKey: "OUTSOURCING_SOURCE_TEST:IN",
	}); err != nil {
		t.Fatalf("seed material inventory: %v", err)
	}

	createIssue := func(suffix string, quantity decimal.Decimal) *biz.OutsourcingFact {
		t.Helper()
		row, err := uc.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
			FactNo:                 "OUT-ISSUE-" + suffix,
			OutsourcingOrderID:     source.order.ID,
			OutsourcingOrderItemID: source.materialLine.ID,
			WarehouseID:            fixtures.warehouseID,
			Quantity:               quantity,
			IdempotencyKey:         "OUT-ISSUE-" + suffix,
		})
		if err != nil {
			t.Fatalf("create issue %s: %v", suffix, err)
		}
		return row
	}
	first := createIssue("QTY-1", decimal.NewFromInt(3))
	second := createIssue("QTY-2", decimal.NewFromInt(3))
	if _, err := uc.PostOutsourcingFact(ctx, first.ID); err != nil {
		t.Fatalf("post first issue: %v", err)
	}
	if _, err := uc.PostOutsourcingFact(ctx, second.ID); !errors.Is(err, biz.ErrOutsourcingOrderFactQuantityExceeded) {
		t.Fatalf("post over-quantity issue error = %v, want quantity exceeded", err)
	}

	if _, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, source.order.ID, biz.OutsourcingOrderStatusClosed); !errors.Is(err, biz.ErrOutsourcingOrderFactDependency) {
		t.Fatalf("failed over-quantity draft must block parent close, err=%v", err)
	}

	closeSource := createOutsourcingFactSourceFixture(t, ctx, client, fixtures, "CLOSE-POSTED", decimal.NewFromInt(4))
	closeFact, err := uc.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 "OUT-ISSUE-CLOSE-POSTED",
		OutsourcingOrderID:     closeSource.order.ID,
		OutsourcingOrderItemID: closeSource.materialLine.ID,
		WarehouseID:            fixtures.warehouseID,
		Quantity:               decimal.NewFromInt(3),
		IdempotencyKey:         "OUT-ISSUE-CLOSE-POSTED",
	})
	if err != nil {
		t.Fatalf("create close source issue: %v", err)
	}
	if _, err := uc.PostOutsourcingFact(ctx, closeFact.ID); err != nil {
		t.Fatalf("post close source issue: %v", err)
	}
	closed, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, closeSource.order.ID, biz.OutsourcingOrderStatusClosed)
	if err != nil || closed.LifecycleStatus != biz.OutsourcingOrderStatusClosed {
		t.Fatalf("close order after only posted issue = %#v, err=%v", closed, err)
	}
	cancelled, err := uc.CancelPostedOutsourcingFact(ctx, closeFact.ID)
	if err != nil || cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("cancel posted issue after parent close = %#v, err=%v", cancelled, err)
	}
	if got := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.OutsourcingFactSourceType), inventorytxn.SourceID(closeFact.ID)).CountX(ctx); got != 2 {
		t.Fatalf("expected outbound and reversal inventory rows, got %d", got)
	}
}

func TestOutsourcingOrderCancelRejectsPostedFactDependency(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "outsourcing_order_fact_dependency")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	source := createOutsourcingFactSourceFixture(t, ctx, client, fixtures, "DEPENDENCY", decimal.NewFromInt(4))
	logger := log.NewStdLogger(io.Discard)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	orderRepo := NewOutsourcingOrderRepo(data, logger)

	returnLotNo := "OUT-RETURN-DEPENDENCY-LOT"
	fact, err := uc.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 "OUT-RETURN-DEPENDENCY",
		OutsourcingOrderID:     source.order.ID,
		OutsourcingOrderItemID: source.productLine.ID,
		WarehouseID:            fixtures.warehouseID,
		NewLotNo:               &returnLotNo,
		Quantity:               decimal.NewFromInt(2),
		IdempotencyKey:         "OUT-RETURN-DEPENDENCY",
	})
	if err != nil {
		t.Fatalf("create return receipt: %v", err)
	}
	if _, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, source.order.ID, biz.OutsourcingOrderStatusCanceled); !errors.Is(err, biz.ErrOutsourcingOrderFactDependency) {
		t.Fatalf("cancel order with draft fact error = %v, want dependency", err)
	}
	if _, err := uc.PostOutsourcingFact(ctx, fact.ID); err != nil {
		t.Fatalf("post return receipt: %v", err)
	}
	if _, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, source.order.ID, biz.OutsourcingOrderStatusCanceled); !errors.Is(err, biz.ErrOutsourcingOrderFactDependency) {
		t.Fatalf("cancel order with posted fact error = %v, want dependency", err)
	}
	if _, err := uc.CancelPostedOutsourcingFact(ctx, fact.ID); err != nil {
		t.Fatalf("cancel posted return receipt: %v", err)
	}
	cancelled, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, source.order.ID, biz.OutsourcingOrderStatusCanceled)
	if err != nil || cancelled.LifecycleStatus != biz.OutsourcingOrderStatusCanceled {
		t.Fatalf("cancel order after reversing fact = %#v, err=%v", cancelled, err)
	}
}

func createOutsourcingFactSourceFixture(t *testing.T, ctx context.Context, client *ent.Client, fixtures inventoryTestFixtures, suffix string, quantity decimal.Decimal) outsourcingFactSourceFixture {
	return createOutsourcingFactSourceFixtureWithSKU(t, ctx, client, fixtures, suffix, quantity, nil)
}

func createOutsourcingFactSourceFixtureWithSKU(t *testing.T, ctx context.Context, client *ent.Client, fixtures inventoryTestFixtures, suffix string, quantity decimal.Decimal, productSKUID *int) outsourcingFactSourceFixture {
	t.Helper()
	process, err := client.Process.Create().
		SetCode("PROC-OUT-" + suffix).
		SetName("委外工序 " + suffix).
		SetOutsourcingEnabled(true).
		Save(ctx)
	if err != nil {
		t.Fatalf("create process: %v", err)
	}
	supplier, err := client.Supplier.Create().
		SetCode("SUP-OUT-" + suffix).
		SetName("委外加工厂 " + suffix).
		SetSupplierType("outsourcing").
		Save(ctx)
	if err != nil {
		t.Fatalf("create supplier: %v", err)
	}
	order, err := client.OutsourcingOrder.Create().
		SetOutsourcingOrderNo("OUT-ORDER-" + suffix).
		SetSupplierID(supplier.ID).
		SetSupplierSnapshot(map[string]any{"name": supplier.Name}).
		SetOrderDate(time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC)).
		SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).
		Save(ctx)
	if err != nil {
		t.Fatalf("create outsourcing order: %v", err)
	}
	materialLine, err := client.OutsourcingOrderItem.Create().
		SetOutsourcingOrderID(order.ID).
		SetLineNo(1).
		SetSubjectType(biz.OutsourcingOrderSubjectMaterial).
		SetMaterialID(fixtures.materialID).
		SetProcessID(process.ID).
		SetUnitID(fixtures.unitID).
		SetOutsourcingQuantity(quantity).
		SetLineStatus(biz.OutsourcingOrderItemStatusOpen).
		Save(ctx)
	if err != nil {
		t.Fatalf("create material line: %v", err)
	}
	var productSKU *ent.ProductSKU
	if productSKUID != nil {
		productSKU, err = client.ProductSKU.Get(ctx, *productSKUID)
		if err != nil {
			t.Fatalf("load product SKU: %v", err)
		}
	}
	productLineCreate := client.OutsourcingOrderItem.Create().
		SetOutsourcingOrderID(order.ID).
		SetLineNo(2).
		SetSubjectType(biz.OutsourcingOrderSubjectProduct).
		SetProductID(fixtures.productID).
		SetNillableProductSkuID(productSKUID).
		SetProcessID(process.ID).
		SetUnitID(fixtures.unitID).
		SetOutsourcingQuantity(quantity).
		SetLineStatus(biz.OutsourcingOrderItemStatusOpen)
	if productSKU != nil {
		productLineCreate.SetSkuCodeSnapshot(productSKU.SkuCode)
	}
	productLine, err := productLineCreate.Save(ctx)
	if err != nil {
		t.Fatalf("create product line: %v", err)
	}
	return outsourcingFactSourceFixture{order: order, materialLine: materialLine, productLine: productLine, productSKU: productSKU}
}

func assertOutsourcingFactSource(t *testing.T, fact *biz.OutsourcingFact, factType, subjectType string, subjectID int, source outsourcingFactSourceFixture) {
	t.Helper()
	if fact == nil || fact.FactType != factType || fact.SubjectType != subjectType || fact.SubjectID != subjectID ||
		fact.SupplierID == nil || *fact.SupplierID != source.order.SupplierID ||
		fact.SourceType == nil || *fact.SourceType != biz.OutsourcingOrderSourceType ||
		fact.SourceID == nil || *fact.SourceID != source.order.ID || fact.SourceLineID == nil {
		t.Fatalf("unexpected sourced outsourcing fact: %#v", fact)
	}
	wantLine := source.materialLine.ID
	if factType == biz.OutsourcingFactReturnReceipt {
		wantLine = source.productLine.ID
	}
	if *fact.SourceLineID != wantLine {
		t.Fatalf("source line = %d, want %d", *fact.SourceLineID, wantLine)
	}
	if factType == biz.OutsourcingFactReturnReceipt {
		if !sameOptionalInt(fact.ProductSkuID, source.productLine.ProductSkuID) {
			t.Fatalf("return SKU = %v, want %v", fact.ProductSkuID, source.productLine.ProductSkuID)
		}
	} else if fact.ProductSkuID != nil {
		t.Fatalf("material issue must not carry product SKU: %#v", fact.ProductSkuID)
	}
	if fact.SupplierName == nil || *fact.SupplierName != fmt.Sprintf("委外加工厂 %s", sourceSuffix(source.order.OutsourcingOrderNo)) {
		t.Fatalf("supplier snapshot not derived: %#v", fact.SupplierName)
	}
}

func assertOutsourcingFactSKUSnapshot(t *testing.T, fact *biz.OutsourcingFact, want string) {
	t.Helper()
	if fact == nil || fact.SKUCodeSnapshot == nil || *fact.SKUCodeSnapshot != want {
		t.Fatalf("outsourcing fact SKU snapshot = %#v, want %q", fact, want)
	}
}

func sourceSuffix(orderNo string) string {
	const prefix = "OUT-ORDER-"
	if len(orderNo) >= len(prefix) && orderNo[:len(prefix)] == prefix {
		return orderNo[len(prefix):]
	}
	return orderNo
}
