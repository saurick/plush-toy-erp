package data

import (
	"context"
	"errors"
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
	data, client := openInventoryRepoTestData(t, "purchase_order_repo_lifecycle")
	uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))

	unit := createTestUnit(t, ctx, client, "PCS-PO")
	material := createTestMaterial(t, ctx, client, unit.ID, "MAT-PO-001")
	warehouse := createTestWarehouse(t, ctx, client, "WH-PO-001")
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-PO-001", true)
	if _, err := client.Supplier.UpdateOneID(supplier.ID).SetDefaultPaymentTermDays(30).Save(ctx); err != nil {
		t.Fatalf("set supplier payment term: %v", err)
	}
	purchaseDate := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	expectedArrival := purchaseDate.AddDate(0, 0, 7)
	qty := decimal.NewFromInt(10)
	price := decimal.NewFromInt(5)
	productOrderNo := "SO-PO-001"
	productNo := "P-PO-001"
	productName := "采购关联产品"

	result, err := uc.SavePurchaseOrderWithItems(ctx, 0, &biz.PurchaseOrderMutation{
		PurchaseOrderNo:     "PO-001",
		SupplierID:          supplier.ID,
		SupplierSnapshot:    map[string]any{"name": supplier.Name},
		PurchaseDate:        purchaseDate,
		ExpectedArrivalDate: &expectedArrival,
	}, []*biz.PurchaseOrderItemSaveMutation{
		{
			PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{
				LineNo:                 1,
				MaterialID:             material.ID,
				UnitID:                 unit.ID,
				MaterialCodeSnapshot:   &material.Code,
				MaterialNameSnapshot:   &material.Name,
				ProductOrderNoSnapshot: &productOrderNo,
				ProductNoSnapshot:      &productNo,
				ProductNameSnapshot:    &productName,
				PurchasedQuantity:      qty,
				UnitPrice:              &price,
				ExpectedArrivalDate:    &expectedArrival,
			},
		},
	})
	if err != nil {
		t.Fatalf("save purchase order failed: %v", err)
	}
	if result.Order.LifecycleStatus != biz.PurchaseOrderStatusDraft || len(result.Items) != 1 {
		t.Fatalf("expected draft purchase order with one line, got %#v", result)
	}
	if result.Order.Currency != biz.FinanceCurrencyCNY || result.Order.PaymentTermDays == nil || *result.Order.PaymentTermDays != 30 {
		t.Fatalf("expected create to freeze CNY and supplier term 30, got %#v", result.Order)
	}
	line := result.Items[0]
	if line.ProductOrderNoSnapshot == nil || *line.ProductOrderNoSnapshot != productOrderNo ||
		line.ProductNoSnapshot == nil || *line.ProductNoSnapshot != productNo ||
		line.ProductNameSnapshot == nil || *line.ProductNameSnapshot != productName {
		t.Fatalf("expected product snapshots persisted, got %#v", line)
	}
	updatedTermDays := 60
	updated, err := uc.UpdatePurchaseOrder(ctx, result.Order.ID, &biz.PurchaseOrderMutation{
		PurchaseOrderNo:     result.Order.PurchaseOrderNo,
		SupplierID:          supplier.ID,
		Currency:            biz.FinanceCurrencyHKD,
		PaymentTermDays:     &updatedTermDays,
		SupplierSnapshot:    result.Order.SupplierSnapshot,
		PurchaseDate:        purchaseDate,
		ExpectedArrivalDate: &expectedArrival,
	})
	if err != nil {
		t.Fatalf("update purchase currency/term failed: %v", err)
	}
	if updated.Currency != biz.FinanceCurrencyHKD || updated.PaymentTermDays == nil || *updated.PaymentTermDays != 60 {
		t.Fatalf("expected explicit HKD/60 update persisted, got %#v", updated)
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

	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := client.Material.UpdateOneID(material.ID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable material after purchase order approval failed: %v", err)
	}
	if _, err := client.Unit.UpdateOneID(unit.ID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable unit after purchase order approval failed: %v", err)
	}
	receipt, err := inventoryUC.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: result.Order.ID,
		ReceiptNo:       "PR-PO-001",
		WarehouseID:     warehouse.ID,
		ReceivedAt:      purchaseDate,
	})
	if err != nil {
		t.Fatalf("create receipt from historical purchase order should allow inactive material/unit: %v", err)
	}
	if len(receipt.Items) != 1 {
		t.Fatalf("expected one receipt line from purchase order, got %d", len(receipt.Items))
	}
	receiptLine := receipt.Items[0]
	if receiptLine.PurchaseOrderItemID == nil || *receiptLine.PurchaseOrderItemID != result.Items[0].ID {
		t.Fatalf("expected receipt line linked to purchase order item, got %#v", receiptLine)
	}
	passAllPurchaseReceiptQualityInspections(t, ctx, inventoryUC, receipt.ID)
	posted, err := inventoryUC.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post receipt linked to historical purchase order line should allow inactive material/unit: %v", err)
	}
	if posted.Status != biz.PurchaseReceiptStatusPosted {
		t.Fatalf("expected posted purchase receipt, got %s", posted.Status)
	}
}

func TestPurchaseOrderRepoSaveWithItemsKeepsLineIdentityWhileReordering(t *testing.T) {
	ctx := context.Background()
	uc, client := openPurchaseOrderRepoTest(t, "purchase_order_repo_display_order")
	defer mustCloseEntClient(t, client)

	unit := createTestUnit(t, ctx, client, "PCS-PO-ORDER")
	material := createTestMaterial(t, ctx, client, unit.ID, "MAT-PO-ORDER")
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-PO-ORDER", true)
	purchaseDate := time.Date(2026, 8, 22, 0, 0, 0, 0, time.UTC)
	qty := decimal.NewFromInt(10)
	line := func(id, lineNo int) *biz.PurchaseOrderItemSaveMutation {
		return &biz.PurchaseOrderItemSaveMutation{
			ID: id,
			PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{
				LineNo:            lineNo,
				MaterialID:        material.ID,
				UnitID:            unit.ID,
				PurchasedQuantity: qty,
			},
		}
	}
	created, err := uc.SavePurchaseOrderWithItems(ctx, 0, &biz.PurchaseOrderMutation{
		PurchaseOrderNo: "PO-DISPLAY-ORDER",
		SupplierID:      supplier.ID,
		PurchaseDate:    purchaseDate,
	}, []*biz.PurchaseOrderItemSaveMutation{line(0, 1), line(0, 2), line(0, 3)})
	if err != nil {
		t.Fatalf("create purchase order with items: %v", err)
	}
	first, second, third := created.Items[0], created.Items[1], created.Items[2]
	orderMutation := func(expectedVersion int) *biz.PurchaseOrderMutation {
		return &biz.PurchaseOrderMutation{
			PurchaseOrderNo:       created.Order.PurchaseOrderNo,
			SupplierID:            supplier.ID,
			Currency:              created.Order.Currency,
			PaymentTermDays:       created.Order.PaymentTermDays,
			SupplierSnapshot:      created.Order.SupplierSnapshot,
			ContractPartySnapshot: created.Order.ContractPartySnapshot,
			PurchaseDate:          purchaseDate,
			ExpectedVersion:       expectedVersion,
		}
	}

	reordered, err := uc.ReorderPurchaseOrderItems(ctx, created.Order.ID, &biz.SourceDocumentItemOrderMutation{
		ExpectedVersion: created.Order.Version,
		ItemIDs:         []int{third.ID, first.ID, second.ID},
	})
	if err != nil {
		t.Fatalf("reorder purchase order items: %v", err)
	}
	if len(reordered.Items) != 3 || reordered.Items[0].ID != third.ID || reordered.Items[1].ID != first.ID || reordered.Items[2].ID != second.ID {
		t.Fatalf("unexpected reordered items: %#v", reordered.Items)
	}
	if reordered.Items[0].LineNo != third.LineNo || reordered.Items[1].LineNo != first.LineNo || reordered.Items[2].LineNo != second.LineNo {
		t.Fatalf("line identity changed during reorder: %#v", reordered.Items)
	}
	for itemID, expectedOrder := range map[int]int{third.ID: 1, first.ID: 2, second.ID: 3} {
		row := client.PurchaseOrderItem.GetX(ctx, itemID)
		if row.DisplayOrder == nil || *row.DisplayOrder != expectedOrder {
			t.Fatalf("item %d display_order = %v, want %d", itemID, row.DisplayOrder, expectedOrder)
		}
	}
	if _, err := uc.ReorderPurchaseOrderItems(ctx, created.Order.ID, &biz.SourceDocumentItemOrderMutation{
		ExpectedVersion: reordered.Order.Version,
		ItemIDs:         []int{third.ID, first.ID},
	}); err == nil {
		t.Fatal("incomplete purchase order item permutation must fail")
	}
	if current := client.PurchaseOrder.GetX(ctx, created.Order.ID); current.Version != reordered.Order.Version {
		t.Fatalf("failed purchase reorder must roll back parent version: got %d want %d", current.Version, reordered.Order.Version)
	}

	_, err = uc.SavePurchaseOrderWithItems(ctx, created.Order.ID, orderMutation(reordered.Order.Version), []*biz.PurchaseOrderItemSaveMutation{
		line(third.ID, 1),
		line(0, 2),
		line(first.ID, 3),
	})
	if err != nil {
		t.Fatalf("replace purchase order item: %v", err)
	}
	openItems, _, err := uc.ListPurchaseOrderItems(ctx, biz.PurchaseOrderItemFilter{
		PurchaseOrderID: created.Order.ID,
		LineStatus:      biz.PurchaseOrderItemStatusOpen,
		Limit:           20,
	})
	if err != nil {
		t.Fatalf("list reordered purchase order items: %v", err)
	}
	if len(openItems) != 3 || openItems[0].ID != third.ID || openItems[2].ID != first.ID || openItems[1].LineNo != 4 {
		t.Fatalf("new line must use the next stable identity: %#v", openItems)
	}

	current := client.PurchaseOrder.GetX(ctx, created.Order.ID)
	client.PurchaseOrder.UpdateOneID(created.Order.ID).
		SetLifecycleStatus(biz.PurchaseOrderStatusApproved).
		SaveX(ctx)
	approvedOrder, err := uc.ReorderPurchaseOrderItems(ctx, created.Order.ID, &biz.SourceDocumentItemOrderMutation{
		ExpectedVersion: current.Version,
		ItemIDs:         []int{openItems[2].ID, openItems[0].ID, openItems[1].ID},
	})
	if err != nil {
		t.Fatalf("reorder approved purchase order items: %v", err)
	}
	if approvedOrder.Order.LifecycleStatus != biz.PurchaseOrderStatusApproved || approvedOrder.Order.Version != current.Version+1 {
		t.Fatalf("approved purchase reorder changed lifecycle or version unexpectedly: %#v", approvedOrder.Order)
	}

	repo := NewPurchaseOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	client.PurchaseOrder.UpdateOneID(created.Order.ID).
		SetLifecycleStatus(biz.PurchaseOrderStatusClosed).
		SaveX(ctx)
	if _, err := repo.ReorderPurchaseOrderItems(ctx, created.Order.ID, approvedOrder.Order.Version, []int{openItems[0].ID, openItems[1].ID, openItems[2].ID}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("closed purchase order reorder must fail: %v", err)
	}
	if current := client.PurchaseOrder.GetX(ctx, created.Order.ID); current.Version != approvedOrder.Order.Version {
		t.Fatalf("blocked purchase reorder changed parent version: got %d want %d", current.Version, approvedOrder.Order.Version)
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
