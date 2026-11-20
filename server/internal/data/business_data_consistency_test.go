package data

import (
	"context"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestBusinessDataConsistency(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "business_data_consistency")
	runBusinessDataConsistency(t, data, client, "SQLITE")
}

func TestSourceDocumentPostgresBusinessDataConsistency(t *testing.T) {
	data, client := openPurchaseReceiptPostgresTestData(t)
	runBusinessDataConsistency(t, data, client, "PG-"+postgresTestSuffix())
}

func runBusinessDataConsistency(t *testing.T, data *Data, client *ent.Client, suffix string) {
	t.Run("purchase_receipt_and_return_round_before_storage", func(t *testing.T) {
		ctx := context.Background()
		key := "CONS-ROUND-" + suffix
		unit := createTestUnit(t, ctx, client, key)
		client.Unit.UpdateOneID(unit.ID).SetPrecision(6).SaveX(ctx)
		material := createTestMaterial(t, ctx, client, unit.ID, key)
		warehouse := createTestWarehouse(t, ctx, client, key)
		supplier := createPurchaseOrderTestSupplier(t, ctx, client, key, true)
		order := client.PurchaseOrder.Create().SetPurchaseOrderNo(key).SetSupplierID(supplier.ID).SetCurrency("CNY").SetPaymentTermDays(0).SetSupplierSnapshot(map[string]any{"name": supplier.Name}).SetPurchaseDate(time.Now()).SetLifecycleStatus(biz.PurchaseOrderStatusApproved).SaveX(ctx)
		client.PurchaseOrderItem.Create().SetPurchaseOrderID(order.ID).SetLineNo(1).SetMaterialID(material.ID).SetUnitID(unit.ID).SetPurchasedQuantity(decimal.RequireFromString("0.333333")).SetUnitPrice(decimal.RequireFromString("0.123456")).SetAmount(decimal.RequireFromString("0.041152")).SaveX(ctx)
		uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
		receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: order.ID, ReceiptNo: key, WarehouseID: warehouse.ID, AllRemaining: true, IdempotencyKey: key})
		if err != nil {
			t.Fatal(err)
		}
		if len(receipt.Items) != 1 || receipt.Items[0].Amount == nil || !receipt.Items[0].Amount.Equal(decimal.RequireFromString("0.041152")) {
			t.Fatalf("receipt rounded amount=%#v", receipt.Items)
		}
		passAllPurchaseReceiptQualityInspections(t, ctx, uc, receipt.ID)
		if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
			t.Fatal(err)
		}
		returned, err := uc.CreatePurchaseReturnFromReceipt(ctx, &biz.PurchaseReturnFromReceiptCreate{ReturnNo: key, PurchaseReceiptID: receipt.ID, ReturnedAt: time.Now(), IdempotencyKey: key, Items: []biz.PurchaseReturnFromReceiptItemCreate{{PurchaseReceiptItemID: receipt.Items[0].ID, Quantity: decimal.RequireFromString("0.111111")}}})
		if err != nil {
			t.Fatal(err)
		}
		if len(returned.Items) != 1 || returned.Items[0].Amount == nil || !returned.Items[0].Amount.Equal(decimal.RequireFromString("0.013717")) {
			t.Fatalf("return rounded amount=%#v", returned.Items)
		}
		stored := client.PurchaseReturnItem.GetX(ctx, returned.Items[0].ID)
		if stored.Amount == nil || !stored.Amount.Equal(*returned.Items[0].Amount) {
			t.Fatal("returned amount differs from persisted value")
		}
	})
	t.Run("purchase_snapshot_preservation_and_source_switch", func(t *testing.T) {
		ctx := context.Background()
		unit := createTestUnit(t, ctx, client, "CONS-U-"+suffix)
		material := createTestMaterial(t, ctx, client, unit.ID, "CONS-M-"+suffix)
		client.Material.UpdateOneID(material.ID).SetSpec("原规格").SetSupplierItemNo("原料号").SaveX(ctx)
		other := createTestMaterial(t, ctx, client, unit.ID, "CONS-M2-"+suffix)
		client.Material.UpdateOneID(other.ID).ClearSpec().SaveX(ctx)
		supplier := createPurchaseOrderTestSupplier(t, ctx, client, "CONS-S-"+suffix, true)
		uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
		price := decimal.RequireFromString("0.123456")
		mutation := biz.PurchaseOrderItemMutation{LineNo: 1, MaterialID: material.ID, UnitID: unit.ID, PurchasedQuantity: decimal.NewFromInt(2), UnitPrice: &price}
		header := &biz.PurchaseOrderMutation{PurchaseOrderNo: "CONS-PO-" + suffix, SupplierID: supplier.ID, Currency: biz.FinanceCurrencyUSD, PurchaseDate: time.Now().UTC()}
		saved, err := uc.SavePurchaseOrderWithItems(ctx, 0, header, []*biz.PurchaseOrderItemSaveMutation{{PurchaseOrderItemMutation: mutation}})
		if err != nil {
			t.Fatal(err)
		}
		line := saved.Items[0]
		header.PaymentTermDays = saved.Order.PaymentTermDays
		if line.MaterialSpecSnapshot == nil || *line.MaterialSpecSnapshot != "原规格" || line.SupplierItemNoSnapshot == nil || *line.SupplierItemNoSnapshot != "原料号" || line.UnitNameSnapshot == nil || *line.UnitNameSnapshot != unit.Name {
			t.Fatalf("missing source snapshot: %#v", line)
		}
		client.Material.UpdateOneID(material.ID).SetSpec("现规格").SetSupplierItemNo("现料号").SaveX(ctx)
		client.Unit.UpdateOneID(unit.ID).SetName("现单位").SaveX(ctx)
		mutation.PurchasedQuantity = decimal.NewFromInt(3)
		header.ExpectedVersion = saved.Order.Version
		saved, err = uc.SavePurchaseOrderWithItems(ctx, saved.Order.ID, header, []*biz.PurchaseOrderItemSaveMutation{{ID: line.ID, PurchaseOrderItemMutation: mutation}})
		if err != nil {
			t.Fatal(err)
		}
		line = saved.Items[0]
		if *line.MaterialSpecSnapshot != "原规格" || *line.SupplierItemNoSnapshot != "原料号" || *line.UnitNameSnapshot != unit.Name {
			t.Fatalf("ordinary edit refreshed snapshot: %#v", line)
		}
		mutation.MaterialID = other.ID
		header.ExpectedVersion = saved.Order.Version
		saved, err = uc.SavePurchaseOrderWithItems(ctx, saved.Order.ID, header, []*biz.PurchaseOrderItemSaveMutation{{ID: line.ID, PurchaseOrderItemMutation: mutation}})
		if err != nil {
			t.Fatal(err)
		}
		if saved.Items[0].MaterialSpecSnapshot != nil || saved.Items[0].SupplierItemNoSnapshot != nil {
			t.Fatal("source switch retained previous values")
		}
		client.PurchaseOrderItem.UpdateOneID(line.ID).ClearUnitNameSnapshot().SaveX(ctx)
		header.ExpectedVersion = saved.Order.Version
		saved, err = uc.SavePurchaseOrderWithItems(ctx, saved.Order.ID, header, []*biz.PurchaseOrderItemSaveMutation{{ID: line.ID, PurchaseOrderItemMutation: mutation}})
		if err != nil {
			t.Fatal(err)
		}
		if saved.Items[0].UnitNameSnapshot != nil {
			t.Fatal("unknown historical snapshot fabricated from current master")
		}
	})
	for _, mode := range []string{biz.SalesOrderTaxModeExclusive, biz.SalesOrderTaxModeInclusive, biz.SalesOrderTaxModeNone} {
		t.Run("shipment_commercial_"+mode, func(t *testing.T) { runShipmentCommercialConsistency(t, data, client, suffix+"-"+mode, mode) })
	}
	t.Run("outsourcing_payable_remainder_and_replay", func(t *testing.T) { runOutsourcingPayableConsistency(t, data, client, suffix) })
}

func runOutsourcingPayableConsistency(t *testing.T, data *Data, client *ent.Client, suffix string) {
	t.Helper()
	ctx := context.Background()
	logger := log.NewStdLogger(io.Discard)
	fixtures := createFinanceBusinessSourceFixtures(t, ctx, client, "CONS-OUT-"+suffix)
	client.Unit.UpdateOneID(fixtures.unitID).SetPrecision(6).SaveX(ctx)
	source := createOutsourcingFactSourceFixtureWithSKU(t, ctx, client, fixtures, "CONS-OUT-"+suffix, decimal.NewFromInt(1), nil)
	client.OutsourcingOrder.UpdateOneID(source.order.ID).SetCurrency(biz.FinanceCurrencyHKD).SetPaymentTermDays(0).SaveX(ctx)
	client.OutsourcingOrderItem.UpdateOneID(source.productLine.ID).SetUnitPrice(decimal.RequireFromString("0.2")).SaveX(ctx)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	inventory := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	actor := client.AdminUser.Create().SetUsername("cons-out-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	var requests []*biz.FinanceFactFromOutsourcingReturnCreate
	var payables []*biz.FinanceFact
	for i, quantity := range []string{"0.333333", "0.333333", "0.333334"} {
		key := fmt.Sprintf("CONS-OUT-%s-%d", suffix, i)
		lot := "LOT-" + key
		fact, err := uc.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{FactNo: key, OutsourcingOrderID: source.order.ID, OutsourcingOrderItemID: source.productLine.ID, WarehouseID: fixtures.productWarehouseID, NewLotNo: &lot, Quantity: decimal.RequireFromString(quantity), IdempotencyKey: key})
		if err != nil {
			t.Fatal(err)
		}
		fact, err = uc.PostOutsourcingFact(ctx, operationalFactStatusMutation(fact.ID, fact.Version, actor.ID, ""))
		if err != nil {
			t.Fatal(err)
		}
		inspection, err := inventory.CreateQualityInspectionFromOutsourcingReturn(ctx, &biz.QualityInspectionFromOutsourcingReturnCreate{InspectionNo: "QI-" + key, OutsourcingFactID: fact.ID})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := inventory.SubmitQualityInspection(ctx, inspection.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := inventory.PassQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultPass)); err != nil {
			t.Fatal(err)
		}
		request := &biz.FinanceFactFromOutsourcingReturnCreate{FactNo: "AP-" + key, OutsourcingFactID: fact.ID, IdempotencyKey: "AP-" + key}
		payable, err := uc.CreatePayableFromOutsourcingReturn(ctx, request)
		if err != nil {
			t.Fatal(err)
		}
		want := []string{"0.066667", "0.066667", "0.066666"}[i]
		if !payable.Amount.Equal(decimal.RequireFromString(want)) || payable.Currency != biz.FinanceCurrencyHKD {
			t.Fatalf("batch %d = %s, want %s", i, payable.Amount, want)
		}
		requests = append(requests, request)
		payables = append(payables, payable)
	}
	// An earlier command replay must keep its amount after final rounding.
	for i, request := range requests {
		replay, err := uc.CreatePayableFromOutsourcingReturn(ctx, request)
		if err != nil || replay.ID != payables[i].ID || !replay.Amount.Equal(payables[i].Amount) {
			t.Fatalf("replay %d changed: %#v %v", i, replay, err)
		}
	}
	posted, err := uc.PostFinanceFact(ctx, operationalFactStatusMutation(payables[0].ID, payables[0].Version, actor.ID, ""))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CancelPostedFinanceFact(ctx, operationalFactStatusMutation(posted.ID, posted.Version, actor.ID, "金额复核")); err != nil {
		t.Fatal(err)
	}
	replacement := *requests[0]
	replacement.FactNo += "-NEW"
	replacement.IdempotencyKey += "-NEW"
	recreated, err := uc.CreatePayableFromOutsourcingReturn(ctx, &replacement)
	if err != nil || !recreated.Amount.Equal(payables[0].Amount) {
		t.Fatalf("cancelled allocation not released: %#v %v", recreated, err)
	}
}

func runShipmentCommercialConsistency(t *testing.T, data *Data, client *ent.Client, suffix, mode string) {
	t.Helper()
	ctx := context.Background()
	logger := log.NewStdLogger(io.Discard)
	unit := createTestUnit(t, ctx, client, "CONS-SU-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "CONS-P-"+suffix)
	client.Product.UpdateOneID(product.ID).SetUnitNetWeightG(decimal.NewFromInt(1000)).SaveX(ctx)
	warehouse := createTestProductWarehouse(t, ctx, client, "CONS-W-"+suffix)
	customer := createSalesOrderTestCustomer(t, ctx, client, "CONS-C-"+suffix, true)
	sales := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))
	rate, freight, price := decimal.NewFromInt(13), decimal.NewFromInt(10), decimal.NewFromInt(100)
	days := 0
	input := &biz.SalesOrderMutation{OrderNo: "CONS-SO-" + suffix, CustomerID: customer.ID, OrderDate: time.Now().UTC(), Currency: biz.FinanceCurrencyUSD, PaymentTermDays: &days, TaxMode: &mode, TaxRate: &rate, FreightTerms: stringPtr(biz.SalesOrderFreightTermsExcluded), QuotedFreightAmount: &freight}
	if mode == biz.SalesOrderTaxModeNone {
		input.TaxRate = nil
	}
	order, err := sales.CreateSalesOrder(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	line, err := sales.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{SalesOrderID: order.ID, LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: decimal.NewFromInt(3), UnitPrice: &price})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sales.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatal(err)
	}
	order, err = sales.ActivateSalesOrder(ctx, order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewInventoryRepo(data, logger).ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectProduct, SubjectID: product.ID, WarehouseID: warehouse.ID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10), UnitID: unit.ID, SourceType: "CONSISTENCY_TEST", IdempotencyKey: "cons-stock-" + suffix}); err != nil {
		t.Fatal(err)
	}
	repo := NewOperationalFactRepo(data, logger)
	uc := biz.NewOperationalFactUsecase(repo)
	weight := decimal.NewFromInt(1)
	gross := decimal.RequireFromString("0.5")
	badKey := "CONS-WEIGHT-" + suffix
	bad, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{Shipment: &biz.ShipmentCreate{ShipmentNo: badKey, SalesOrderID: &order.ID, CustomerID: &customer.ID, IdempotencyKey: badKey, TotalNetWeightG: &weight, GrossWeightKg: &gross}, Items: []*biz.ShipmentItemCreate{{SalesOrderItemID: &line.ID, ProductID: product.ID, UnitID: unit.ID, WarehouseID: warehouse.ID, Quantity: decimal.NewFromInt(1)}}})
	if err != nil {
		t.Fatal(err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, bad.ID)
	beforeTxns := client.InventoryTxn.Query().CountX(ctx)
	if _, err := repo.ShipShipment(ctx, bad.ID); err == nil {
		t.Fatal("automatic net weight exceeded gross weight without rejection")
	}
	unchanged := client.Shipment.GetX(ctx, bad.ID)
	if unchanged.Status == biz.ShipmentStatusShipped || unchanged.ReceivableAmountSnapshot != nil || client.InventoryTxn.Query().CountX(ctx) != beforeTxns {
		t.Fatal("invalid weight partially posted")
	}
	newBatch := func(n int) *biz.Shipment {
		key := fmt.Sprintf("CONS-SHP-%s-%d", suffix, n)
		batch, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{Shipment: &biz.ShipmentCreate{ShipmentNo: key, SalesOrderID: &order.ID, CustomerID: &customer.ID, IdempotencyKey: key, TotalNetWeightG: &weight}, Items: []*biz.ShipmentItemCreate{{SalesOrderItemID: &line.ID, ProductID: product.ID, UnitID: unit.ID, WarehouseID: warehouse.ID, Quantity: decimal.NewFromInt(1)}}})
		if err != nil {
			t.Fatal(err)
		}
		submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, batch.ID)
		batch, err = repo.ShipShipment(ctx, batch.ID)
		if err != nil {
			t.Fatal(err)
		}
		return batch
	}
	// A cancelled posted batch releases its allocation; its frozen evidence remains.
	cancelled := newBatch(0)
	if _, err := repo.CancelShippedShipment(ctx, cancelled.ID); err != nil {
		t.Fatal(err)
	}
	total, taxes, freights := decimal.Zero, decimal.Zero, decimal.Zero
	for n := 1; n <= 3; n++ {
		batch := newBatch(n)
		if batch.ReceivableAmountSnapshot == nil || batch.TaxAmountSnapshot == nil || batch.QuotedFreightAmountSnapshot == nil {
			t.Fatalf("commercial snapshots absent: %#v", batch)
		}
		total = total.Add(*batch.ReceivableAmountSnapshot)
		taxes = taxes.Add(*batch.TaxAmountSnapshot)
		freights = freights.Add(*batch.QuotedFreightAmountSnapshot)
		if !batch.Items[0].AmountSnapshot.Equal(price) {
			t.Fatal("goods line amount changed by header allocation")
		}
		request := &biz.FinanceFactFromShipmentCreate{FactNo: fmt.Sprintf("CONS-AR-%s-%d", suffix, n), ShipmentID: batch.ID, IdempotencyKey: fmt.Sprintf("cons-ar-%s-%d", suffix, n)}
		ar, err := uc.CreateReceivableFromShipment(ctx, request)
		if err != nil {
			t.Fatal(err)
		}
		if !ar.Amount.Equal(*batch.ReceivableAmountSnapshot) || ar.Currency != biz.FinanceCurrencyUSD {
			t.Fatalf("receivable mismatch: %#v", ar)
		}
		replay, err := uc.CreateReceivableFromShipment(ctx, request)
		if err != nil || replay.ID != ar.ID || !replay.Amount.Equal(ar.Amount) {
			t.Fatalf("replay changed: %#v %v", replay, err)
		}
	}
	if !total.Equal(*order.OrderTotal) || !taxes.Equal(*order.TaxAmount) || !freights.Equal(freight) {
		t.Fatalf("final reconciliation total=%s tax=%s freight=%s order=%#v", total, taxes, freights, order)
	}
	if mode == biz.SalesOrderTaxModeExclusive && !total.Equal(decimal.RequireFromString("350.3")) {
		t.Fatalf("exclusive total=%s", total)
	}
	// Missing frozen commercial terms cannot silently turn into zero tax/freight.
	if _, err := shipmentCommercialTotal(&ent.Shipment{}, price); err == nil {
		t.Fatal("missing commercial snapshot accepted")
	}
}
