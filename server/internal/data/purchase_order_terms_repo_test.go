package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/sourceorderlifecycleevent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseOrderTermsCompletesBeforeAndAfterReceiptWithoutRewritingSnapshots(t *testing.T) {
	for _, stage := range []string{"before_receipt", "draft_receipt", "posted_receipt"} {
		t.Run(stage, func(t *testing.T) {
			ctx := context.Background()
			data, client := openInventoryRepoTestData(t, "purchase_terms_"+stage)
			f := prepareMaterialRequestFixture(t, ctx, data, "TERMS-"+stage)
			request := approveMaterialRequestFixture(t, ctx, f, submitMaterialRequestFixture(t, ctx, f))
			po := client.PurchaseOrder.Query().Where(purchaseorder.EngineeringMaterialRequestID(request.ID)).FirstX(ctx)
			lines := client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(po.ID)).Order(ent.Asc(purchaseorderitem.FieldID)).AllX(ctx)
			for _, line := range lines {
				client.Material.UpdateOneID(line.MaterialID).SetStockCategory("MAIN").SaveX(ctx)
			}
			wh := createTestWarehouse(t, ctx, client, "TERMS-WH")
			inv := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
			var receiptID int
			createReceipt := func() {
				receipt, err := inv.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: po.ID, ReceiptNo: "PR-TERMS", WarehouseID: wh.ID, AllRemaining: true, IdempotencyKey: "terms-receipt"})
				if err != nil {
					t.Fatal(err)
				}
				receiptID = receipt.ID
			}
			if stage != "before_receipt" {
				createReceipt()
			}
			postReceipt := func() {
				inspections, _, err := inv.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: receiptID, Limit: 100})
				if err != nil {
					t.Fatal(err)
				}
				for _, inspection := range inspections {
					if _, err := inv.PassQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultPass)); err != nil {
						t.Fatal(err)
					}
				}
				if _, err := inv.PostPurchaseReceipt(ctx, receiptID); err != nil {
					t.Fatal(err)
				}
			}
			if stage == "posted_receipt" {
				postReceipt()
			}
			uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
			price := decimal.RequireFromString("2.5")
			due := po.PurchaseDate.UTC().AddDate(0, 0, 7)
			input := &biz.PurchaseOrderTermsCompletion{ID: po.ID, ExpectedVersion: po.Version, ActorID: 33, IdempotencyKey: "terms-confirm", ExpectedArrivalDate: &due}
			for _, line := range lines {
				input.Items = append(input.Items, biz.PurchaseOrderTermsItem{ID: line.ID, UnitPrice: &price, ExpectedArrivalDate: &due})
			}
			updated, err := uc.CompletePurchaseOrderTerms(ctx, input)
			if err != nil || updated.Version != po.Version+1 {
				t.Fatalf("completion=%+v err=%v", updated, err)
			}
			if _, err := uc.CompletePurchaseOrderTerms(ctx, input); err != nil {
				t.Fatalf("exact replay: %v", err)
			}
			if count := client.SourceOrderLifecycleEvent.Query().Where(sourceorderlifecycleevent.ActionKey(biz.PurchaseOrderActionCompleteTerms)).CountX(ctx); count != 1 {
				t.Fatalf("replayed terms receipts=%d", count)
			}
			changed := *input
			changed.ActorID++
			if _, err := uc.CompletePurchaseOrderTerms(ctx, &changed); !errors.Is(err, biz.ErrIdempotencyConflict) {
				t.Fatalf("actor replay=%v", err)
			}
			if stage == "before_receipt" {
				createReceipt()
			}
			if stage != "posted_receipt" {
				postReceipt()
			}
			facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
			payable, err := facts.CreatePayableFromPurchaseReceipt(ctx, &biz.FinanceFactFromPurchaseReceiptCreate{FactNo: "AP-TERMS", PurchaseReceiptID: receiptID, IdempotencyKey: "terms-payable"})
			if err != nil {
				t.Fatalf("late priced payable: %v", err)
			}
			expected := decimal.Zero
			for _, line := range lines {
				expected = expected.Add(line.PurchasedQuantity.Mul(price).Round(6))
			}
			if !payable.Amount.Equal(expected) {
				t.Fatalf("amount=%s want=%s", payable.Amount, expected)
			}
			for _, item := range client.PurchaseReceiptItem.Query().AllX(ctx) {
				if stage != "before_receipt" && (item.UnitPrice != nil || item.Amount != nil) {
					t.Fatal("late pricing rewrote receipt snapshot")
				}
			}
			frozen := *input
			frozen.ExpectedVersion, frozen.IdempotencyKey = updated.Version, "terms-price-overwrite"
			frozen.Items = append([]biz.PurchaseOrderTermsItem(nil), input.Items...)
			other := price.Add(decimal.NewFromInt(1))
			frozen.Items[0].UnitPrice = &other
			if _, err := uc.CompletePurchaseOrderTerms(ctx, &frozen); !errors.Is(err, biz.ErrPurchaseOrderPriceFrozen) {
				t.Fatalf("overwrite confirmed price=%v", err)
			}
			if client.PurchaseOrder.GetX(ctx, po.ID).Version != updated.Version {
				t.Fatal("rejected overwrite changed order version")
			}
		})
	}
}

func TestPurchaseOrderTermsRejectsMalformedAndIncompleteCommands(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_terms_invalid")
	f := prepareMaterialRequestFixture(t, ctx, data, "TERMS-INVALID")
	request := approveMaterialRequestFixture(t, ctx, f, submitMaterialRequestFixture(t, ctx, f))
	po := client.PurchaseOrder.Query().Where(purchaseorder.EngineeringMaterialRequestID(request.ID)).FirstX(ctx)
	line := client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(po.ID)).FirstX(ctx)
	uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
	price := decimal.NewFromInt(3)
	base := biz.PurchaseOrderTermsCompletion{ID: po.ID, ExpectedVersion: po.Version, ActorID: 33, IdempotencyKey: "terms-invalid", Items: []biz.PurchaseOrderTermsItem{{ID: line.ID, UnitPrice: &price}}}
	for _, mutate := range []func(*biz.PurchaseOrderTermsCompletion){
		func(in *biz.PurchaseOrderTermsCompletion) { in.ActorID = 0 },
		func(in *biz.PurchaseOrderTermsCompletion) { in.ExpectedVersion = po.Version + 1 },
		func(in *biz.PurchaseOrderTermsCompletion) { in.Items[0].ID = line.ID + 100 },
		func(in *biz.PurchaseOrderTermsCompletion) { in.Items[0].UnitPrice = nil },
		func(in *biz.PurchaseOrderTermsCompletion) {
			past := po.PurchaseDate.Add(-24 * time.Hour)
			in.ExpectedArrivalDate = &past
		},
	} {
		input := base
		input.Items = append([]biz.PurchaseOrderTermsItem(nil), base.Items...)
		mutate(&input)
		if _, err := uc.CompletePurchaseOrderTerms(ctx, &input); err == nil {
			t.Fatal("invalid terms accepted")
		}
	}
	if client.SourceOrderLifecycleEvent.Query().CountX(ctx) != 0 {
		t.Fatal("invalid terms recorded a receipt")
	}
	if client.PurchaseOrderItem.GetX(ctx, line.ID).UnitPrice != nil {
		t.Fatal("invalid terms changed price")
	}
}

func TestPurchaseOrderTermsReceiptFailureRollsBackAndRetries(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryRepoTestData(t, "purchase_terms_rollback")
	f := prepareMaterialRequestFixture(t, ctx, data, "TERMS-ROLLBACK")
	request := approveMaterialRequestFixture(t, ctx, f, submitMaterialRequestFixture(t, ctx, f))
	order := client.PurchaseOrder.Query().Where(purchaseorder.EngineeringMaterialRequestID(request.ID)).FirstX(ctx)
	line := client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(order.ID)).FirstX(ctx)
	uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
	price := decimal.NewFromInt(4)
	in := &biz.PurchaseOrderTermsCompletion{ID: order.ID, ExpectedVersion: order.Version, ActorID: 33, IdempotencyKey: "terms-rollback", Items: []biz.PurchaseOrderTermsItem{{ID: line.ID, UnitPrice: &price}}}
	injected := errors.New("simulated terms receipt failure")
	fail := true
	client.SourceOrderLifecycleEvent.Use(func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, mutation ent.Mutation) (ent.Value, error) {
			if fail {
				fail = false
				return nil, injected
			}
			return next.Mutate(ctx, mutation)
		})
	})
	if _, err := uc.CompletePurchaseOrderTerms(ctx, in); !errors.Is(err, injected) {
		t.Fatalf("receipt failure=%v", err)
	}
	if client.PurchaseOrder.GetX(ctx, order.ID).Version != order.Version || client.PurchaseOrderItem.GetX(ctx, line.ID).UnitPrice != nil {
		t.Fatal("failed receipt leaked a price or version")
	}
	if _, err := uc.CompletePurchaseOrderTerms(ctx, in); err != nil {
		t.Fatalf("retry=%v", err)
	}
	if count := client.SourceOrderLifecycleEvent.Query().Where(sourceorderlifecycleevent.SourceID(order.ID), sourceorderlifecycleevent.SourceType("purchase_order")).CountX(ctx); count != 1 {
		t.Fatalf("receipts=%d", count)
	}
}

func TestPurchaseOrderTermsClearsDatesAndOnlyFillsMissingPricesAfterClose(t *testing.T) {
	for _, closed := range []bool{false, true} {
		name := "approved"
		if closed {
			name = "closed"
		}
		t.Run(name, func(t *testing.T) {
			ctx := t.Context()
			data, client := openInventoryRepoTestData(t, "terms_dates_"+name)
			fixture := prepareMaterialRequestFixture(t, ctx, data, "TERMS-DATE-"+name)
			request := approveMaterialRequestFixture(t, ctx, fixture, submitMaterialRequestFixture(t, ctx, fixture))
			order := client.PurchaseOrder.Query().Where(purchaseorder.EngineeringMaterialRequestID(request.ID)).FirstX(ctx)
			line := client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(order.ID)).FirstX(ctx)
			due := order.PurchaseDate.UTC().Truncate(time.Second).AddDate(0, 0, 7)
			client.PurchaseOrder.UpdateOneID(order.ID).SetExpectedArrivalDate(due).SetSupplierConfirmedArrivalDate(due).SaveX(ctx)
			client.PurchaseOrderItem.UpdateOneID(line.ID).SetExpectedArrivalDate(due).SaveX(ctx)
			uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
			if closed {
				var err error
				orderResult, err := uc.ClosePurchaseOrderWithAction(ctx, &biz.SourceOrderLifecycleAction{ID: order.ID, ExpectedVersion: order.Version, ActorID: 33, IdempotencyKey: "close-before-price", CloseMode: biz.SourceOrderCloseModeShort, Reason: "模拟未继续采购"})
				if err != nil {
					t.Fatal(err)
				}
				order.Version = orderResult.Version
			}
			zero := decimal.Zero
			input := &biz.PurchaseOrderTermsCompletion{ID: order.ID, ExpectedVersion: order.Version, ActorID: 33, IdempotencyKey: "terms-dates", Items: []biz.PurchaseOrderTermsItem{{ID: line.ID, UnitPrice: &zero}}}
			if closed {
				if _, err := uc.CompletePurchaseOrderTerms(ctx, input); !errors.Is(err, biz.ErrBadParam) {
					t.Fatalf("closed dates changed: %v", err)
				}
				input.ExpectedArrivalDate, input.SupplierConfirmedArrivalDate = &due, &due
				input.Items[0].ExpectedArrivalDate = &due
			}
			updated, err := uc.CompletePurchaseOrderTerms(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			got := client.PurchaseOrderItem.GetX(ctx, line.ID)
			if got.UnitPrice == nil || !got.UnitPrice.IsZero() || got.Amount == nil || !got.Amount.IsZero() {
				t.Fatal("an explicitly confirmed zero price was treated as unknown")
			}
			if !closed && (updated.ExpectedArrivalDate != nil || updated.SupplierConfirmedArrivalDate != nil || got.ExpectedArrivalDate != nil) {
				t.Fatal("explicit date clear retained stale dates")
			}
			if closed {
				input.ExpectedVersion, input.IdempotencyKey = updated.Version, "closed-no-missing-price"
				if _, err := uc.CompletePurchaseOrderTerms(ctx, input); !errors.Is(err, biz.ErrBadParam) {
					t.Fatalf("closed order without a missing price accepted terms mutation: %v", err)
				}
			}
		})
	}
}

func TestPurchaseOrderTermsReadProjectionRequiresExplicitConfirmationForEachLine(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryRepoTestData(t, "terms_read_batch")
	fixture := createInventoryTestFixtures(t, ctx, client)
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "TERMS-READ-BATCH", true)
	order := client.PurchaseOrder.Create().SetPurchaseOrderNo("PO-TERMS-READ-BATCH").SetSupplierID(supplier.ID).SetSupplierSnapshot(map[string]any{"name": supplier.Name}).SetCurrency("CNY").SetPurchaseDate(time.Now()).SetLifecycleStatus(biz.PurchaseOrderStatusApproved).SaveX(ctx)
	for index, quantity := range []int64{4, 6} {
		client.PurchaseOrderItem.Create().SetPurchaseOrderID(order.ID).SetLineNo(index + 1).SetMaterialID(fixture.materialID).SetUnitID(fixture.unitID).SetPurchasedQuantity(decimal.NewFromInt(quantity)).SaveX(ctx)
	}
	inv := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := inv.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: order.ID, ReceiptNo: "PR-TERMS-READ-BATCH", WarehouseID: fixture.warehouseID, AllRemaining: true, IdempotencyKey: "terms-read-arrival"})
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(order.ID)).AllX(ctx) {
		price := decimal.NewFromInt(2)
		if line.PurchasedQuantity.IntPart() == 6 {
			price = decimal.NewFromInt(3)
		}
		client.PurchaseOrderItem.UpdateOneID(line.ID).SetUnitPrice(price).SetAmount(line.PurchasedQuantity.Mul(price)).SaveX(ctx)
	}
	before, err := inv.GetPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range before.Items {
		if item.UnitPrice != nil || item.Amount != nil || item.PriceConfirmedLater {
			t.Fatal("unrecorded current order prices supplied receipt money")
		}
	}
	input := &biz.PurchaseOrderTermsCompletion{ID: order.ID, ExpectedVersion: order.Version, ActorID: 33, IdempotencyKey: "terms-read-batch"}
	for _, line := range client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(order.ID)).AllX(ctx) {
		input.Items = append(input.Items, biz.PurchaseOrderTermsItem{ID: line.ID, UnitPrice: line.UnitPrice})
	}
	uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := uc.CompletePurchaseOrderTerms(ctx, input); err != nil {
		t.Fatal(err)
	}
	after, err := inv.GetPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range after.Items {
		want := decimal.NewFromInt(2)
		if item.Quantity.IntPart() == 6 {
			want = decimal.NewFromInt(3)
		}
		if !item.PriceConfirmedLater || item.UnitPrice == nil || !item.UnitPrice.Equal(want) || item.Amount == nil || !item.Amount.Equal(item.Quantity.Mul(want)) {
			t.Fatalf("line price provenance=%+v", item)
		}
		stored := client.PurchaseReceiptItem.GetX(ctx, item.ID)
		if stored.UnitPrice != nil || stored.Amount != nil {
			t.Fatal("read projection rewrote the receipt price snapshot")
		}
	}
}
