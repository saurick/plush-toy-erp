package data

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

func openPurchaseOrderRepoTest(t *testing.T, name string) (*biz.PurchaseOrderUsecase, *ent.Client) {
	t.Helper()
	client := enttest.Open(t, dialect.SQLite, "file:"+name+"?mode=memory&cache=shared&_fk=1")
	repo := NewPurchaseOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	return biz.NewPurchaseOrderUsecase(repo), client
}

func TestPurchaseOrderRepoSaveLifecycleAndReceiptLink(t *testing.T) {
	ctx := context.Background()
	uc, client := openPurchaseOrderRepoTest(t, "purchase_order_repo_lifecycle")
	defer mustCloseEntClient(t, client)

	unit := createTestUnit(t, ctx, client, "PCS-PO")
	material := createTestMaterial(t, ctx, client, unit.ID, "MAT-PO-001")
	warehouse := createTestWarehouse(t, ctx, client, "WH-PO-001")
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-PO-001", true)
	purchaseDate := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	expectedArrival := purchaseDate.AddDate(0, 0, 7)
	qty := decimal.NewFromInt(10)
	price := decimal.NewFromInt(5)

	result, err := uc.SavePurchaseOrderWithItems(ctx, 0, &biz.PurchaseOrderMutation{
		PurchaseOrderNo:     "PO-001",
		SupplierID:          supplier.ID,
		SupplierSnapshot:    map[string]any{"name": supplier.Name},
		PurchaseDate:        purchaseDate,
		ExpectedArrivalDate: &expectedArrival,
	}, []*biz.PurchaseOrderItemSaveMutation{
		{
			PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{
				LineNo:               1,
				MaterialID:           material.ID,
				UnitID:               unit.ID,
				MaterialCodeSnapshot: &material.Code,
				MaterialNameSnapshot: &material.Name,
				PurchasedQuantity:    qty,
				UnitPrice:            &price,
				ExpectedArrivalDate:  &expectedArrival,
			},
		},
	})
	if err != nil {
		t.Fatalf("save purchase order failed: %v", err)
	}
	if result.Order.LifecycleStatus != biz.PurchaseOrderStatusDraft || len(result.Items) != 1 {
		t.Fatalf("expected draft purchase order with one line, got %#v", result)
	}

	if _, err := uc.SubmitPurchaseOrder(ctx, result.Order.ID); err != nil {
		t.Fatalf("submit purchase order failed: %v", err)
	}
	approved, err := uc.ApprovePurchaseOrder(ctx, result.Order.ID)
	if err != nil {
		t.Fatalf("approve purchase order failed: %v", err)
	}
	if approved.LifecycleStatus != biz.PurchaseOrderStatusApproved {
		t.Fatalf("expected approved purchase order, got %#v", approved)
	}

	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard)))
	receipt, err := inventoryUC.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-PO-001",
		SupplierName: supplier.Name,
		ReceivedAt:   purchaseDate,
	})
	if err != nil {
		t.Fatalf("create receipt failed: %v", err)
	}
	receiptLine, err := inventoryUC.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:           receipt.ID,
		MaterialID:          material.ID,
		WarehouseID:         warehouse.ID,
		UnitID:              unit.ID,
		PurchaseOrderItemID: &result.Items[0].ID,
		Quantity:            qty,
		UnitPrice:           &price,
	})
	if err != nil {
		t.Fatalf("add receipt item linked to purchase order line failed: %v", err)
	}
	if receiptLine.PurchaseOrderItemID == nil || *receiptLine.PurchaseOrderItemID != result.Items[0].ID {
		t.Fatalf("expected receipt line linked to purchase order item, got %#v", receiptLine)
	}
}

func createPurchaseOrderTestSupplier(t *testing.T, ctx context.Context, client *ent.Client, code string, active bool) *ent.Supplier {
	t.Helper()
	row, err := client.Supplier.Create().
		SetCode(code).
		SetName("供应商-" + code).
		SetIsActive(active).
		Save(ctx)
	if err != nil {
		t.Fatalf("create supplier %s failed: %v", code, err)
	}
	return row
}
