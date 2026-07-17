package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestFinanceBusinessSourcesSQLite(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_business_sources")
	runPurchaseReceiptPayableAndReconciliation(t, ctx, data, client, "SQLITE")
	runOutsourcingReturnPayable(t, ctx, data, client, "SQLITE")
}

func TestFinanceBusinessSourcesPostgres(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	suffix := "PG-" + postgresTestSuffix()
	runPurchaseReceiptPayableAndReconciliation(t, ctx, data, client, suffix)
	runOutsourcingReturnPayable(t, ctx, data, client, suffix)
}

func runPurchaseReceiptPayableAndReconciliation(t *testing.T, ctx context.Context, data *Data, client *ent.Client, suffix string) {
	t.Helper()
	logger := log.NewStdLogger(io.Discard)
	fixtures := createFinanceBusinessSourceFixtures(t, ctx, client, "PR-"+suffix)
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "FIN-SUP-"+suffix, true)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	operationalRepo := NewOperationalFactRepo(data, logger)
	operationalUC := biz.NewOperationalFactUsecase(operationalRepo)
	actor := client.AdminUser.Create().
		SetUsername("finance-source-actor-" + suffix).
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
	unitPrice := decimal.NewFromInt(10)
	amount := decimal.NewFromInt(50)
	lotNo := "FIN-LOT-" + suffix
	receipt, err := inventoryUC.CreatePurchaseReceiptWithItems(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "FIN-RECEIPT-" + suffix,
		SupplierID:   &supplier.ID,
		SupplierName: supplier.Name,
		ReceivedAt:   time.Now().UTC(),
	}, []*biz.PurchaseReceiptItemCreate{{
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotNo:       &lotNo,
		Quantity:    decimal.NewFromInt(5),
		UnitPrice:   &unitPrice,
		Amount:      &amount,
	}})
	if err != nil {
		t.Fatalf("create purchase receipt payable source: %v", err)
	}
	passAllPurchaseReceiptQualityInspections(t, ctx, inventoryUC, receipt.ID)
	receipt, err = inventoryUC.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post purchase receipt payable source: %v", err)
	}
	payableInput := &biz.FinanceFactFromPurchaseReceiptCreate{
		FactNo: "AP-RECEIPT-" + suffix, PurchaseReceiptID: receipt.ID, IdempotencyKey: "AP-RECEIPT-" + suffix,
	}
	payable, err := operationalUC.CreatePayableFromPurchaseReceipt(ctx, payableInput)
	if err != nil {
		t.Fatalf("create payable from purchase receipt: %v", err)
	}
	if payable.FactType != biz.FinanceFactPayable || payable.CounterpartyID == nil || *payable.CounterpartyID != supplier.ID ||
		payable.SourceType == nil || *payable.SourceType != biz.PurchaseReceiptSourceType || payable.SourceID == nil || *payable.SourceID != receipt.ID ||
		!payable.Amount.Equal(amount) || payable.Currency != biz.FinanceCurrencyCNY {
		t.Fatalf("derived purchase payable = %#v", payable)
	}
	replayed, err := operationalUC.CreatePayableFromPurchaseReceipt(ctx, payableInput)
	if err != nil || replayed.ID != payable.ID {
		t.Fatalf("purchase payable replay=%#v err=%v", replayed, err)
	}
	if _, err := operationalUC.CreatePayableFromPurchaseReceipt(ctx, &biz.FinanceFactFromPurchaseReceiptCreate{
		FactNo: "AP-RECEIPT-DUP-" + suffix, PurchaseReceiptID: receipt.ID, IdempotencyKey: "AP-RECEIPT-DUP-" + suffix,
	}); !errors.Is(err, biz.ErrFinanceFactSourceConflict) {
		t.Fatalf("duplicate purchase payable error=%v", err)
	}

	returnDraft, err := inventoryUC.CreatePurchaseReturnFromReceipt(ctx, &biz.PurchaseReturnFromReceiptCreate{
		ReturnNo: "FIN-RETURN-" + suffix, PurchaseReceiptID: receipt.ID, ReturnedAt: time.Now().UTC(),
		IdempotencyKey: "FIN-RETURN-" + suffix,
		Items:          []biz.PurchaseReturnFromReceiptItemCreate{{PurchaseReceiptItemID: receipt.Items[0].ID, Quantity: decimal.NewFromInt(1)}},
	})
	if err != nil {
		t.Fatalf("create return after payable: %v", err)
	}
	if _, err := inventoryUC.PostPurchaseReturn(ctx, returnDraft.ID); !errors.Is(err, biz.ErrPurchaseReceiptFinanceDependency) {
		t.Fatalf("post return with active payable error=%v", err)
	}
	if _, err := inventoryUC.CancelPostedPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrPurchaseReceiptFinanceDependency) {
		t.Fatalf("cancel receipt with active payable error=%v", err)
	}

	payable, err = operationalUC.PostFinanceFact(ctx, payable.ID)
	if err != nil {
		t.Fatalf("post payable: %v", err)
	}
	reconciliation, err := operationalUC.CreateReconciliationFromFinanceFact(ctx, &biz.FinanceReconciliationFromFactCreate{
		FactNo: "REC-AP-" + suffix, FinanceFactID: payable.ID, IdempotencyKey: "REC-AP-" + suffix,
	})
	if err != nil {
		t.Fatalf("create single-record reconciliation: %v", err)
	}
	if reconciliation.FactType != biz.FinanceFactReconciliation || reconciliation.SourceType == nil || *reconciliation.SourceType != biz.FinanceFactSourceType ||
		reconciliation.SourceID == nil || *reconciliation.SourceID != payable.ID || !reconciliation.Amount.Equal(payable.Amount) ||
		reconciliation.CounterpartyID == nil || *reconciliation.CounterpartyID != supplier.ID {
		t.Fatalf("derived reconciliation = %#v", reconciliation)
	}
	if _, err := operationalUC.CancelPostedFinanceFact(ctx, payable.ID, actor.ID, "来源更正"); !errors.Is(err, biz.ErrFinanceReconciliationDependency) {
		t.Fatalf("cancel payable with active reconciliation error=%v", err)
	}
	reconciliation, err = operationalUC.PostFinanceFact(ctx, reconciliation.ID)
	if err != nil {
		t.Fatalf("post reconciliation: %v", err)
	}
	if _, err := operationalUC.CancelPostedFinanceFact(ctx, reconciliation.ID, actor.ID, "核对撤销"); err != nil {
		t.Fatalf("cancel reconciliation: %v", err)
	}
	if _, err := operationalUC.CancelPostedFinanceFact(ctx, payable.ID, actor.ID, "来源更正"); err != nil {
		t.Fatalf("cancel payable after reconciliation cancellation: %v", err)
	}
	if _, err := inventoryUC.PostPurchaseReturn(ctx, returnDraft.ID); err != nil {
		t.Fatalf("post return after payable cancellation: %v", err)
	}
	if _, err := inventoryUC.CancelPostedPurchaseReturn(ctx, returnDraft.ID); err != nil {
		t.Fatalf("cancel return before receipt cancellation: %v", err)
	}
	if _, err := inventoryUC.CancelPostedPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("cancel receipt after finance and return cancellation: %v", err)
	}
}

func runOutsourcingReturnPayable(t *testing.T, ctx context.Context, data *Data, client *ent.Client, suffix string) {
	t.Helper()
	logger := log.NewStdLogger(io.Discard)
	fixtures := createFinanceBusinessSourceFixtures(t, ctx, client, "OUT-"+suffix)
	productSKU := createInventoryTestSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "FIN-OUT-SKU-"+suffix)
	source := createOutsourcingFactSourceFixtureWithSKU(t, ctx, client, fixtures, "FIN-"+suffix, decimal.NewFromInt(8), &productSKU.ID)
	unitPrice := decimal.NewFromInt(12)
	if _, err := client.OutsourcingOrderItem.UpdateOneID(source.productLine.ID).SetUnitPrice(unitPrice).Save(ctx); err != nil {
		t.Fatalf("freeze outsourcing price: %v", err)
	}
	operationalRepo := NewOperationalFactRepo(data, logger)
	operationalUC := biz.NewOperationalFactUsecase(operationalRepo)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	actor := client.AdminUser.Create().
		SetUsername("outsourcing-finance-actor-" + suffix).
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
	returnLotNo := "FIN-OUT-RETURN-LOT-" + suffix
	returnFact, err := operationalUC.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 "OUT-FIN-RETURN-" + suffix,
		OutsourcingOrderID:     source.order.ID,
		OutsourcingOrderItemID: source.productLine.ID,
		WarehouseID:            fixtures.warehouseID,
		NewLotNo:               &returnLotNo,
		Quantity:               decimal.NewFromInt(2),
		IdempotencyKey:         "OUT-FIN-RETURN-" + suffix,
	})
	if err != nil {
		t.Fatalf("create outsourcing return payable source: %v", err)
	}
	returnFact, err = operationalUC.PostOutsourcingFact(ctx, returnFact.ID)
	if err != nil {
		t.Fatalf("post outsourcing return payable source: %v", err)
	}
	payableInput := &biz.FinanceFactFromOutsourcingReturnCreate{
		FactNo: "AP-OUT-" + suffix, OutsourcingFactID: returnFact.ID, IdempotencyKey: "AP-OUT-" + suffix,
	}
	if _, err := operationalUC.CreatePayableFromOutsourcingReturn(ctx, payableInput); !errors.Is(err, biz.ErrOutsourcingReturnQualityPending) {
		t.Fatalf("create payable before outsourcing quality acceptance error=%v", err)
	}
	inspection, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, &biz.QualityInspectionFromOutsourcingReturnCreate{
		InspectionNo: "QI-AP-OUT-" + suffix, OutsourcingFactID: returnFact.ID,
	})
	if err != nil {
		t.Fatalf("create outsourcing return quality before payable: %v", err)
	}
	if _, err := inventoryUC.SubmitQualityInspection(ctx, inspection.ID); err != nil {
		t.Fatalf("submit outsourcing return quality before payable: %v", err)
	}
	if _, err := operationalUC.CreatePayableFromOutsourcingReturn(ctx, payableInput); !errors.Is(err, biz.ErrOutsourcingReturnQualityPending) {
		t.Fatalf("create payable while outsourcing quality submitted error=%v", err)
	}
	if _, err := inventoryUC.PassQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultConcession)); err != nil {
		t.Fatalf("accept outsourcing return quality by concession before payable: %v", err)
	}
	// Corrupt the persisted source anchor directly to prove the read-side
	// consistency guard. Normal Ent mutations intentionally reject changes to
	// protected posted-fact fields.
	if _, err := data.sqldb.ExecContext(ctx, `UPDATE outsourcing_facts SET product_sku_id = NULL WHERE id = $1`, returnFact.ID); err != nil {
		t.Fatalf("clear outsourcing return SKU for consistency guard: %v", err)
	}
	if _, err := operationalUC.CreatePayableFromOutsourcingReturn(ctx, payableInput); !errors.Is(err, biz.ErrOutsourcingOrderFactSourceInvalid) {
		t.Fatalf("create payable from SKU-mismatched outsourcing return error=%v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `UPDATE outsourcing_facts SET product_sku_id = $1 WHERE id = $2`, productSKU.ID, returnFact.ID); err != nil {
		t.Fatalf("restore outsourcing return SKU: %v", err)
	}
	payable, err := operationalUC.CreatePayableFromOutsourcingReturn(ctx, payableInput)
	if err != nil {
		t.Fatalf("create payable from outsourcing return: %v", err)
	}
	if payable.CounterpartyID == nil || *payable.CounterpartyID != source.order.SupplierID || !payable.Amount.Equal(decimal.NewFromInt(24)) ||
		payable.SourceType == nil || *payable.SourceType != biz.OutsourcingFactSourceType || payable.SourceID == nil || *payable.SourceID != returnFact.ID {
		t.Fatalf("derived outsourcing payable = %#v", payable)
	}
	if _, err := operationalUC.CancelPostedOutsourcingFact(ctx, returnFact.ID); !errors.Is(err, biz.ErrOutsourcingReturnQualityDependency) {
		t.Fatalf("cancel accepted outsourcing return with active quality error=%v", err)
	}
	if _, err := operationalUC.PostFinanceFact(ctx, payable.ID); err != nil {
		t.Fatalf("post outsourcing payable: %v", err)
	}
	if _, err := operationalUC.CancelPostedFinanceFact(ctx, payable.ID, actor.ID, "委外来源更正"); err != nil {
		t.Fatalf("cancel outsourcing payable: %v", err)
	}
	if _, err := operationalUC.CancelPostedOutsourcingFact(ctx, returnFact.ID); !errors.Is(err, biz.ErrOutsourcingReturnQualityDependency) {
		t.Fatalf("cancel accepted outsourcing return after payable cancellation error=%v", err)
	}

	rejectedLotNo := "FIN-OUT-REJECTED-LOT-" + suffix
	rejectedReturn, err := operationalUC.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 "OUT-FIN-REJECTED-" + suffix,
		OutsourcingOrderID:     source.order.ID,
		OutsourcingOrderItemID: source.productLine.ID,
		WarehouseID:            fixtures.warehouseID,
		NewLotNo:               &rejectedLotNo,
		Quantity:               decimal.NewFromInt(1),
		IdempotencyKey:         "OUT-FIN-REJECTED-" + suffix,
	})
	if err != nil {
		t.Fatalf("create rejected outsourcing return payable source: %v", err)
	}
	rejectedReturn, err = operationalUC.PostOutsourcingFact(ctx, rejectedReturn.ID)
	if err != nil {
		t.Fatalf("post rejected outsourcing return payable source: %v", err)
	}
	rejectedInspection, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, &biz.QualityInspectionFromOutsourcingReturnCreate{
		InspectionNo: "QI-AP-OUT-REJECTED-" + suffix, OutsourcingFactID: rejectedReturn.ID,
	})
	if err != nil {
		t.Fatalf("create rejected outsourcing return quality: %v", err)
	}
	if _, err := inventoryUC.SubmitQualityInspection(ctx, rejectedInspection.ID); err != nil {
		t.Fatalf("submit rejected outsourcing return quality: %v", err)
	}
	if _, err := inventoryUC.RejectQualityInspection(ctx, approximateQualityInspectionDecision(rejectedInspection.ID, biz.QualityInspectionResultReject)); err != nil {
		t.Fatalf("reject outsourcing return quality: %v", err)
	}
	if _, err := operationalUC.CreatePayableFromOutsourcingReturn(ctx, &biz.FinanceFactFromOutsourcingReturnCreate{
		FactNo: "AP-OUT-REJECTED-" + suffix, OutsourcingFactID: rejectedReturn.ID, IdempotencyKey: "AP-OUT-REJECTED-" + suffix,
	}); !errors.Is(err, biz.ErrOutsourcingReturnQualityRejected) {
		t.Fatalf("create payable from rejected outsourcing return error=%v", err)
	}
}

func createFinanceBusinessSourceFixtures(t *testing.T, ctx context.Context, client *ent.Client, suffix string) inventoryTestFixtures {
	t.Helper()
	unit := createTestUnit(t, ctx, client, "FIN-U-"+suffix)
	material := createTestMaterial(t, ctx, client, unit.ID, "FIN-M-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "FIN-P-"+suffix)
	warehouse := createTestWarehouse(t, ctx, client, "FIN-W-"+suffix)
	return inventoryTestFixtures{unitID: unit.ID, materialID: material.ID, productID: product.ID, warehouseID: warehouse.ID}
}
