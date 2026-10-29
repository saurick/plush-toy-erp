package data

import (
	"errors"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent/sourceorderlifecycleevent"
)

func TestPurchaseOrderDeliveryPreservesMissingPricesAndUsesIndependentReceipt(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "DELIVERY-ONLY")
	f := createInventoryTestFixtures(t, t.Context(), client)
	item := createApprovedPurchaseOrderItemForReceiptTest(t, t.Context(), client, f, "DELIVERY-ONLY", decimal.NewFromInt(10))
	client.PurchaseOrderItem.UpdateOneID(item.ID).ClearUnitPrice().ClearAmount().SaveX(t.Context())
	priced := client.PurchaseOrderItem.Create().SetPurchaseOrderID(item.PurchaseOrderID).SetLineNo(2).SetMaterialID(f.materialID).SetUnitID(f.unitID).SetPurchasedQuantity(decimal.NewFromInt(5)).SetUnitPrice(decimal.NewFromInt(2)).SetAmount(decimal.NewFromInt(10)).SaveX(t.Context())
	order := client.PurchaseOrder.GetX(t.Context(), item.PurchaseOrderID)
	due := order.PurchaseDate.AddDate(0, 0, 5).UTC().Truncate(24 * time.Hour)
	uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
	in := &biz.PurchaseOrderTermsCompletion{ID: order.ID, ExpectedVersion: order.Version, ActorID: 1, IdempotencyKey: "delivery-only", DeliveryOnly: true, ExpectedArrivalDate: &due, Items: []biz.PurchaseOrderTermsItem{{ID: item.ID, ExpectedArrivalDate: &due}}}
	in.Items = append(in.Items, biz.PurchaseOrderTermsItem{ID: priced.ID})
	updated, err := uc.CompletePurchaseOrderTerms(t.Context(), in)
	if err != nil {
		t.Fatal(err)
	}
	unchanged := client.PurchaseOrderItem.GetX(t.Context(), item.ID)
	if unchanged.UnitPrice != nil || unchanged.Amount != nil || !unchanged.ExpectedArrivalDate.Equal(due) {
		t.Fatalf("schedule fabricated money: %+v", unchanged)
	}
	known := client.PurchaseOrderItem.GetX(t.Context(), priced.ID)
	if known.UnitPrice == nil || !known.UnitPrice.Equal(*priced.UnitPrice) || known.Amount == nil || !known.Amount.Equal(*priced.Amount) {
		t.Fatal("schedule changed confirmed money")
	}
	if _, err = uc.CompletePurchaseOrderTerms(t.Context(), in); err != nil {
		t.Fatal(err)
	}
	if n := client.SourceOrderLifecycleEvent.Query().Where(sourceorderlifecycleevent.ActionKey(biz.PurchaseOrderActionUpdateDelivery)).CountX(t.Context()); n != 1 {
		t.Fatalf("replay created %d events", n)
	}
	if n := client.SourceOrderLifecycleEvent.Query().Where(sourceorderlifecycleevent.ActionKey(biz.PurchaseOrderActionCompleteTerms)).CountX(t.Context()); n != 0 {
		t.Fatal("schedule masquerades as price confirmation")
	}
	in.IdempotencyKey = "delivery-clear"
	in.ExpectedVersion = updated.Version
	in.ExpectedArrivalDate = nil
	in.Items[0].ExpectedArrivalDate = nil
	updated, err = uc.CompletePurchaseOrderTerms(t.Context(), in)
	if err != nil {
		t.Fatal(err)
	}
	if client.PurchaseOrderItem.GetX(t.Context(), item.ID).ExpectedArrivalDate != nil {
		t.Fatal("line date not cleared")
	}
	in.IdempotencyKey = "delivery-stale"
	if _, err = uc.CompletePurchaseOrderTerms(t.Context(), in); !errors.Is(err, biz.ErrPurchaseOrderConflict) {
		t.Fatalf("stale version: %v", err)
	}
	in.ExpectedVersion = updated.Version
	in.Items[0].UnitPrice = new(decimal.Decimal)
	if _, err = uc.CompletePurchaseOrderTerms(t.Context(), in); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("price injection: %v", err)
	}
	in.Items[0].UnitPrice = nil
	client.PurchaseOrder.UpdateOneID(order.ID).SetLifecycleStatus(biz.PurchaseOrderStatusClosed).SaveX(t.Context())
	if _, err = uc.CompletePurchaseOrderTerms(t.Context(), in); !errors.Is(err, biz.ErrSourceOrderStateInvalid) {
		t.Fatalf("closed schedule: %v", err)
	}
}
