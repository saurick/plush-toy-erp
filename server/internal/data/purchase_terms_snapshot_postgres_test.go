package data

import (
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/sourceorderlifecycleevent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestSourceOrderLifecyclePostgresPurchaseTermsPreserveCountedSnapshots(t *testing.T) {
	for _, stage := range []string{"before_receipt", "draft_receipt", "posted_receipt"} {
		t.Run(stage, func(t *testing.T) {
			ctx := t.Context()
			data, client := openInventoryPostgresTestData(t)
			key := "PG-TSP-" + postgresTestSuffix()
			fixture := prepareMaterialRequestFixture(t, ctx, data, key)
			request := approveMaterialRequestFixture(t, ctx, fixture, submitMaterialRequestFixture(t, ctx, fixture))
			order := client.PurchaseOrder.Query().Where(purchaseorder.EngineeringMaterialRequestID(request.ID)).FirstX(ctx)
			lines := client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(order.ID)).Order(ent.Asc(purchaseorderitem.FieldID)).AllX(ctx)
			if len(lines) == 0 {
				t.Fatal("approved engineering material must produce purchase lines")
			}
			for _, line := range lines {
				if line.UnitPrice != nil || line.Amount != nil {
					t.Fatal("the fixture must start with genuinely unconfirmed prices")
				}
				client.Material.UpdateOneID(line.MaterialID).SetStockCategory("MAIN").SaveX(ctx)
			}
			warehouse := createTestWarehouse(t, ctx, client, key+"-WH")
			inventory := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
			finance := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
			terms := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
			var receipt *biz.PurchaseReceipt
			createReceipt := func() {
				t.Helper()
				var err error
				receipt, err = inventory.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
					PurchaseOrderID: order.ID, ReceiptNo: key + "-IN", WarehouseID: warehouse.ID,
					AllRemaining: true, IdempotencyKey: key + "-arrival",
				})
				if err != nil {
					t.Fatal(err)
				}
			}
			postReceipt := func() {
				t.Helper()
				inspections, _, err := inventory.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: receipt.ID, Limit: 100})
				if err != nil || len(inspections) != len(lines) {
					t.Fatalf("line inspections=%d lines=%d err=%v", len(inspections), len(lines), err)
				}
				for _, inspection := range inspections {
					if _, err := inventory.PassQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultPass)); err != nil {
						t.Fatal(err)
					}
				}
				if _, err := inventory.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
					t.Fatal(err)
				}
			}
			readReceiptSnapshot := func() string {
				t.Helper()
				var snapshot string
				if err := data.sqldb.QueryRowContext(ctx, `SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id)::text FROM purchase_receipt_items i WHERE receipt_id=$1`, receipt.ID).Scan(&snapshot); err != nil {
					t.Fatal(err)
				}
				return snapshot
			}
			var before string
			if stage != "before_receipt" {
				createReceipt()
				before = readReceiptSnapshot()
			}
			if stage == "posted_receipt" {
				postReceipt()
				_, err := finance.CreatePayableFromPurchaseReceipt(ctx, &biz.FinanceFactFromPurchaseReceiptCreate{
					FactNo: key + "-AP", PurchaseReceiptID: receipt.ID, IdempotencyKey: key + "-payable",
				})
				if !errors.Is(err, biz.ErrFinanceFactSourceAmountInvalid) {
					t.Fatalf("an unpriced posted receipt must block payable creation: %v", err)
				}
				if count := client.FinanceFact.Query().Where(financefact.SourceType(biz.PurchaseReceiptSourceType), financefact.SourceID(receipt.ID)).CountX(ctx); count != 0 {
					t.Fatalf("failed payable creation wrote %d finance records", count)
				}
			}
			price := decimal.RequireFromString("3.125001")
			input := &biz.PurchaseOrderTermsCompletion{ID: order.ID, ExpectedVersion: order.Version, ActorID: 33, IdempotencyKey: key + "-terms"}
			expectedAmount := decimal.Zero
			for _, line := range lines {
				input.Items = append(input.Items, biz.PurchaseOrderTermsItem{ID: line.ID, UnitPrice: &price})
				expectedAmount = expectedAmount.Add(line.PurchasedQuantity.Mul(price).Round(6))
			}
			updated, err := terms.CompletePurchaseOrderTerms(ctx, input)
			if err != nil || updated.Version != order.Version+1 {
				t.Fatalf("price confirmation=%+v err=%v", updated, err)
			}
			if _, err := terms.CompletePurchaseOrderTerms(ctx, input); err != nil {
				t.Fatalf("exact price confirmation replay=%v", err)
			}
			changed := *input
			changed.ActorID++
			if _, err := terms.CompletePurchaseOrderTerms(ctx, &changed); !errors.Is(err, biz.ErrIdempotencyConflict) {
				t.Fatalf("another actor reused the price receipt: %v", err)
			}
			if count := client.SourceOrderLifecycleEvent.Query().Where(sourceorderlifecycleevent.SourceType("purchase_order"), sourceorderlifecycleevent.SourceID(order.ID), sourceorderlifecycleevent.ActionKey(biz.PurchaseOrderActionCompleteTerms)).CountX(ctx); count != 1 {
				t.Fatalf("price receipt count=%d", count)
			}
			if stage == "before_receipt" {
				createReceipt()
			} else if actual := readReceiptSnapshot(); actual != before {
				t.Fatalf("late pricing rewrote counted receipt items\nbefore=%s\nafter=%s", before, actual)
			}
			if stage != "posted_receipt" {
				postReceipt()
			}
			payableInput := &biz.FinanceFactFromPurchaseReceiptCreate{FactNo: key + "-AP", PurchaseReceiptID: receipt.ID, IdempotencyKey: key + "-payable"}
			payable, err := finance.CreatePayableFromPurchaseReceipt(ctx, payableInput)
			if err != nil || !payable.Amount.Equal(expectedAmount) {
				t.Fatalf("priced payable=%+v expectedAmount=%s err=%v", payable, expectedAmount, err)
			}
			replayed, err := finance.CreatePayableFromPurchaseReceipt(ctx, payableInput)
			if err != nil || replayed.ID != payable.ID || !replayed.Amount.Equal(expectedAmount) {
				t.Fatalf("payable exact replay=%+v err=%v", replayed, err)
			}
			if count := client.FinanceFact.Query().Where(financefact.SourceType(biz.PurchaseReceiptSourceType), financefact.SourceID(receipt.ID)).CountX(ctx); count != 1 {
				t.Fatalf("payable replay wrote %d finance records", count)
			}
			frozen := *input
			frozen.IdempotencyKey, frozen.ExpectedVersion = key+"-overwrite", updated.Version
			frozen.Items = append([]biz.PurchaseOrderTermsItem(nil), input.Items...)
			otherPrice := price.Add(decimal.NewFromInt(1))
			frozen.Items[0].UnitPrice = &otherPrice
			if _, err := terms.CompletePurchaseOrderTerms(ctx, &frozen); !errors.Is(err, biz.ErrPurchaseOrderPriceFrozen) {
				t.Fatalf("confirmed price overwrite=%v", err)
			}
			if stage != "before_receipt" && readReceiptSnapshot() != before {
				t.Fatal("payable or rejected price overwrite changed the original receipt snapshot")
			}
		})
	}
}
