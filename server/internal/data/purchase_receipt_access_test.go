package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/purchasereceiptitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseReceiptWarehouseAccessReadWriteAndReplay(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "purchase_receipt_access")
	runPurchaseReceiptWarehouseAccessReadWriteAndReplay(t, data, client)
}

func TestPurchaseReceiptPostgresWarehouseAccessReadWriteAndReplay(t *testing.T) {
	data, client := openPurchaseReceiptPostgresTestData(t)
	runPurchaseReceiptWarehouseAccessReadWriteAndReplay(t, data, client)
}

func runPurchaseReceiptWarehouseAccessReadWriteAndReplay(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	f := createInventoryTestFixtures(t, ctx, client)
	otherWarehouse := createTestWarehouse(t, ctx, client, "WH-ACCESS-OTHER")
	repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(repo)
	assigned := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID}}
	all := biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}
	none := biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}
	create := func(no string, warehouses ...int) *biz.PurchaseReceipt {
		t.Helper()
		items := []*biz.PurchaseReceiptItemCreate{}
		for _, warehouseID := range warehouses {
			items = append(items, &biz.PurchaseReceiptItemCreate{MaterialID: f.materialID, WarehouseID: warehouseID, UnitID: f.unitID, Quantity: decimal.NewFromInt(1)})
		}
		receipt, err := uc.CreatePurchaseReceiptWithItems(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: no, SupplierName: "模拟供应商"}, items)
		if err != nil {
			t.Fatal(err)
		}
		return receipt
	}
	allowed := create("PR-ACCESS-ALLOWED", f.warehouseID)
	outside := create("PR-ACCESS-OUTSIDE", otherWarehouse.ID)
	mixed := create("PR-ACCESS-MIXED", f.warehouseID, otherWarehouse.ID)
	for _, scope := range []biz.WarehouseDataScope{assigned, none, {Mode: "unknown"}} {
		for _, receipt := range []*biz.PurchaseReceipt{outside, mixed} {
			if got, err := uc.GetPurchaseReceiptForAccess(ctx, receipt.ID, scope); !errors.Is(err, biz.ErrDataScopeForbidden) || got != nil {
				t.Fatalf("read scope=%v receipt=%d got=%v err=%v", scope, receipt.ID, got, err)
			}
			if _, err := uc.PostPurchaseReceiptForAccess(ctx, receipt.ID, scope); !errors.Is(err, biz.ErrDataScopeForbidden) {
				t.Fatalf("post: %v", err)
			}
			command := &biz.ProcessDomainCommandInput{WarehouseScope: &scope}
			if _, err := repo.PostPurchaseReceiptForProcessCommand(ctx, receipt.ID, command, &biz.ProcessDomainCommandResult{}, 7); !errors.Is(err, biz.ErrDataScopeForbidden) {
				t.Fatalf("process post: %v", err)
			}
			if _, err := uc.CancelPostedPurchaseReceiptForAccess(ctx, receipt.ID, 7, scope); !errors.Is(err, biz.ErrDataScopeForbidden) {
				t.Fatalf("cancel: %v", err)
			}
			if _, err := uc.CancelPurchaseReceiptDraft(ctx, receipt.ID, 7, scope); !errors.Is(err, biz.ErrDataScopeForbidden) {
				t.Fatalf("cancel draft: %v", err)
			}
			if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{ReceiptID: receipt.ID, MaterialID: f.materialID, WarehouseID: f.warehouseID, UnitID: f.unitID, Quantity: decimal.NewFromInt(1), IdempotencyKey: "access-denied", WarehouseScope: &scope}); !errors.Is(err, biz.ErrDataScopeForbidden) {
				t.Fatalf("append to hidden parent: %v", err)
			}
		}
	}
	if client.InventoryTxn.Query().CountX(ctx) != 0 || client.PurchaseReceiptItem.Query().CountX(ctx) != 4 {
		t.Fatal("denied writes changed inventory or lines")
	}
	for _, warehouseFilter := range []int{0, f.warehouseID, otherWarehouse.ID} {
		items, total, err := uc.ListPurchaseReceipts(ctx, biz.PurchaseReceiptFilter{WarehouseScope: &assigned, WarehouseID: warehouseFilter, Limit: 1})
		want := 1
		if warehouseFilter == otherWarehouse.ID {
			want = 0
		}
		if err != nil || total != want || len(items) != want {
			t.Fatalf("filter=%d total=%d rows=%d err=%v", warehouseFilter, total, len(items), err)
		}
		if want == 1 && (items[0].ID != allowed.ID || len(items[0].Items) != 1) {
			t.Fatal("unexpected nested document")
		}
	}
	items, total, err := uc.ListPurchaseReceipts(ctx, biz.PurchaseReceiptFilter{WarehouseScope: &assigned, Limit: 1, Offset: 1})
	if err != nil || total != 1 || len(items) != 0 {
		t.Fatalf("pagination total=%d rows=%d err=%v", total, len(items), err)
	}
	items, total, err = uc.ListPurchaseReceipts(ctx, biz.PurchaseReceiptFilter{WarehouseScope: &none})
	if err != nil || total != 0 || len(items) != 0 {
		t.Fatalf("NONE total=%d rows=%d err=%v", total, len(items), err)
	}
	if got, err := uc.GetPurchaseReceiptForAccess(ctx, mixed.ID, all); err != nil || len(got.Items) != 2 {
		t.Fatalf("ALL read=%v err=%v", got, err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{ReceiptID: allowed.ID, MaterialID: f.materialID, WarehouseID: otherWarehouse.ID, UnitID: f.unitID, Quantity: decimal.NewFromInt(1), IdempotencyKey: "outside-new-line", WarehouseScope: &assigned}); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("append outside warehouse: %v", err)
	}
	appendInput := &biz.PurchaseReceiptItemCreate{ReceiptID: allowed.ID, MaterialID: f.materialID, WarehouseID: f.warehouseID, UnitID: f.unitID, Quantity: decimal.NewFromInt(1), IdempotencyKey: "allowed-line", WarehouseScope: &assigned}
	appended, err := uc.AddPurchaseReceiptItem(ctx, appendInput)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := uc.AddPurchaseReceiptItem(ctx, appendInput)
	if err != nil || replay.ID != appended.ID {
		t.Fatalf("append replay=%v err=%v", replay, err)
	}
	appendInput.WarehouseScope = &none
	if _, err := uc.AddPurchaseReceiptItem(ctx, appendInput); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("append NONE replay: %v", err)
	}
	if _, err := uc.PostPurchaseReceiptForAccess(ctx, allowed.ID, assigned); !errors.Is(err, biz.ErrPurchaseReceiptQualityPending) {
		t.Fatalf("quality control lost: %v", err)
	}
	passAllPurchaseReceiptQualityInspections(t, ctx, uc, allowed.ID)
	for i := 0; i < 2; i++ {
		if _, err := uc.PostPurchaseReceiptForAccess(ctx, allowed.ID, assigned); err != nil {
			t.Fatal(err)
		}
		if _, err := uc.PostPurchaseReceiptForAccess(ctx, allowed.ID, none); !errors.Is(err, biz.ErrDataScopeForbidden) {
			t.Fatalf("post replay scope: %v", err)
		}
	}
	for i := 0; i < 2; i++ {
		if _, err := uc.CancelPostedPurchaseReceiptForAccess(ctx, allowed.ID, 7, none); !errors.Is(err, biz.ErrDataScopeForbidden) {
			t.Fatalf("cancel replay scope: %v", err)
		}
		if _, err := uc.CancelPostedPurchaseReceiptForAccess(ctx, allowed.ID, 7, assigned); err != nil {
			t.Fatal(err)
		}
	}
	if client.InventoryTxn.Query().CountX(ctx) != 4 {
		t.Fatal("post/cancel replay duplicated inventory effects")
	}
	if client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(allowed.ID)).CountX(ctx) != 2 {
		t.Fatal("append replay duplicated line")
	}
}

func TestPurchaseReceiptCreateReplayChecksEntireCurrentWarehouseSet(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_receipt_access_create_replay")
	f := createInventoryTestFixtures(t, ctx, client)
	other := createTestWarehouse(t, ctx, client, "WH-ACCESS-REPLAY-OTHER")
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, f, "ACCESS", decimal.NewFromInt(10))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	scope := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID}}
	input := &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: orderItem.PurchaseOrderID, ReceiptNo: "PR-ACCESS-CREATE", Lines: []biz.PurchaseReceiptOrderLine{{PurchaseOrderItemID: orderItem.ID, WarehouseID: f.warehouseID, Quantity: decimal.NewFromInt(1)}}, IdempotencyKey: "access-create", WarehouseScope: &scope}
	receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, input); err != nil {
		t.Fatal(err)
	}
	processInput := &biz.ProcessDomainCommandInput{
		ProcessInstance: &biz.ProcessInstance{BusinessRefType: "purchase_order", BusinessRefID: orderItem.PurchaseOrderID},
		CommandKey:      biz.ProcessDomainCommandPurchaseReceiptCreate, IdempotencyKey: input.IdempotencyKey, WarehouseScope: &scope,
		Payload: map[string]any{"receipt_no": input.ReceiptNo, "items": []any{map[string]any{
			"purchase_order_item_id": orderItem.ID, "warehouse_id": f.warehouseID, "quantity": "1",
		}}},
	}
	if err := uc.ValidatePurchaseReceiptProcessWarehouseAccess(ctx, processInput); err != nil {
		t.Fatalf("allowed process creation replay: %v", err)
	}
	for _, deniedScope := range []biz.WarehouseDataScope{{Mode: biz.DataScopeModeNone}, {Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{other.ID}}} {
		processInput.WarehouseScope = &deniedScope
		if err := uc.ValidatePurchaseReceiptProcessWarehouseAccess(ctx, processInput); !errors.Is(err, biz.ErrDataScopeForbidden) {
			t.Fatalf("process creation scope=%v: %v", deniedScope, err)
		}
	}
	processInput.WarehouseScope = &scope
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{ReceiptID: receipt.ID, MaterialID: f.materialID, WarehouseID: other.ID, UnitID: f.unitID, PurchaseOrderItemID: &orderItem.ID, Quantity: decimal.NewFromInt(1), IdempotencyKey: "access-append-other"}); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, input); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("initial-line-only replay bypass: %v", err)
	}
	if err := uc.ValidatePurchaseReceiptProcessWarehouseAccess(ctx, processInput); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("process creation current document replay bypass: %v", err)
	}
}
