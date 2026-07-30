package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/purchasereceiptitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseOrderReceiptProgressProjectsExactServerOwnedQuantities(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_order_receipt_progress")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(
		t,
		ctx,
		client,
		fixtures,
		"PROGRESS",
		mustDecimal(t, "10.000006"),
	)
	orderItem = client.PurchaseOrderItem.UpdateOneID(orderItem.ID).
		SetMaterialCodeSnapshot("MAT-SNAPSHOT-PROGRESS").
		SetMaterialNameSnapshot("订单时材料名称").
		SaveX(ctx)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt := createLinkedPurchaseReceiptDraftForTest(
		t,
		ctx,
		client,
		inventoryUC,
		fixtures,
		orderItem.ID,
		"PR-PROGRESS-POSTED",
		mustDecimal(t, "4.000001"),
	)
	if _, err := inventoryUC.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("post source receipt: %v", err)
	}
	receiptItem := client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		OnlyX(ctx)
	increase := createPurchaseReceiptQuantityAdjustmentForTest(
		t,
		ctx,
		inventoryUC,
		fixtures,
		entPurchaseReceiptItemToBiz(receiptItem),
		"PRA-PROGRESS-INCREASE",
		biz.PurchaseReceiptAdjustmentQuantityIncrease,
		mustDecimal(t, "1.000001"),
	)
	if _, err := inventoryUC.PostPurchaseReceiptAdjustment(ctx, increase.ID); err != nil {
		t.Fatalf("post quantity increase: %v", err)
	}
	decrease := createPurchaseReceiptQuantityAdjustmentForTest(
		t,
		ctx,
		inventoryUC,
		fixtures,
		entPurchaseReceiptItemToBiz(receiptItem),
		"PRA-PROGRESS-DECREASE",
		biz.PurchaseReceiptAdjustmentQuantityDecrease,
		mustDecimal(t, "0.000001"),
	)
	if _, err := inventoryUC.PostPurchaseReceiptAdjustment(ctx, decrease.ID); err != nil {
		t.Fatalf("post quantity decrease: %v", err)
	}
	createLinkedPurchaseReceiptDraftForTest(
		t,
		ctx,
		client,
		inventoryUC,
		fixtures,
		orderItem.ID,
		"PR-PROGRESS-DRAFT",
		mustDecimal(t, "2.000002"),
	)

	postedAt := time.Now()
	purchaseReturn := client.PurchaseReturn.Create().
		SetReturnNo("PR-RETURN-PROGRESS").
		SetPurchaseReceiptID(receipt.ID).
		SetSupplierName("退货不重开采购需求").
		SetStatus(biz.PurchaseReturnStatusPosted).
		SetReturnedAt(postedAt).
		SetPostedAt(postedAt).
		SaveX(ctx)
	client.PurchaseReturnItem.Create().
		SetReturnID(purchaseReturn.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		SaveX(ctx)

	uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
	progress, err := uc.GetPurchaseOrderReceiptProgress(ctx, orderItem.PurchaseOrderID)
	if err != nil {
		t.Fatalf("get receipt progress: %v", err)
	}
	if progress.PurchaseOrderID != orderItem.PurchaseOrderID ||
		progress.PurchaseOrderNo != "PO-RECEIPT-PROGRESS" ||
		progress.LifecycleStatus != biz.PurchaseOrderStatusApproved ||
		len(progress.Items) != 1 {
		t.Fatalf("unexpected progress header: %#v", progress)
	}
	item := progress.Items[0]
	if item.PurchaseOrderItemID != orderItem.ID ||
		item.MaterialCode != "MAT-SNAPSHOT-PROGRESS" ||
		item.MaterialName != "订单时材料名称" ||
		item.UnitCode == "" ||
		item.UnitName == "" ||
		!item.PurchasedQuantity.Equal(mustDecimal(t, "10.000006")) ||
		!item.EffectiveReceivedQuantity.Equal(mustDecimal(t, "5.000001")) ||
		!item.DraftReservedQuantity.Equal(mustDecimal(t, "2.000002")) ||
		!item.RemainingReceivableQuantity.Equal(mustDecimal(t, "5.000005")) ||
		!item.RemainingGeneratableQuantity.Equal(mustDecimal(t, "3.000003")) ||
		!item.CanGenerate ||
		item.DisabledReason != "" {
		t.Fatalf("unexpected receipt progress item: %#v", item)
	}
}

func TestPurchaseOrderReceiptProgressKeepsDraftOverReservationReadable(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_order_receipt_progress_draft_over")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(
		t,
		ctx,
		client,
		fixtures,
		"DRAFT-OVER",
		mustDecimal(t, "10"),
	)
	postedItem := createDirectPurchaseReceiptItemForProgressTest(
		t,
		ctx,
		client,
		fixtures,
		orderItem,
		"PR-PROGRESS-POSTED-OVER",
		biz.PurchaseReceiptStatusPosted,
		mustDecimal(t, "8"),
	)
	_ = postedItem
	createDirectPurchaseReceiptItemForProgressTest(
		t,
		ctx,
		client,
		fixtures,
		orderItem,
		"PR-PROGRESS-DRAFT-OVER",
		biz.PurchaseReceiptStatusDraft,
		mustDecimal(t, "5"),
	)

	progress, err := NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)).
		GetPurchaseOrderReceiptProgress(ctx, orderItem.PurchaseOrderID)
	if err != nil {
		t.Fatalf("draft over-reservation must stay readable: %v", err)
	}
	item := progress.Items[0]
	if !item.EffectiveReceivedQuantity.Equal(mustDecimal(t, "8")) ||
		!item.DraftReservedQuantity.Equal(mustDecimal(t, "5")) ||
		!item.RemainingReceivableQuantity.Equal(mustDecimal(t, "2")) ||
		!item.RemainingGeneratableQuantity.IsZero() ||
		item.CanGenerate ||
		item.DisabledReason != "现有入库草稿占用超过剩余可收数量，请先处理草稿" {
		t.Fatalf("unexpected draft over-reservation projection: %#v", item)
	}
}

func TestPurchaseOrderReceiptProgressFailsClosedOnPostedQuantityInvariant(t *testing.T) {
	tests := []struct {
		name    string
		suffix  string
		prepare func(t *testing.T, ctx context.Context, client *ent.Client, fixtures inventoryTestFixtures, orderItem *ent.PurchaseOrderItem)
	}{
		{
			name:   "effective quantity exceeds purchased quantity",
			suffix: "OVER",
			prepare: func(t *testing.T, ctx context.Context, client *ent.Client, fixtures inventoryTestFixtures, orderItem *ent.PurchaseOrderItem) {
				createDirectPurchaseReceiptItemForProgressTest(
					t,
					ctx,
					client,
					fixtures,
					orderItem,
					"PR-PROGRESS-CORRUPT-OVER",
					biz.PurchaseReceiptStatusPosted,
					mustDecimal(t, "2"),
				)
			},
		},
		{
			name:   "effective quantity becomes negative",
			suffix: "NEGATIVE",
			prepare: func(t *testing.T, ctx context.Context, client *ent.Client, fixtures inventoryTestFixtures, orderItem *ent.PurchaseOrderItem) {
				receiptItem := createDirectPurchaseReceiptItemForProgressTest(
					t,
					ctx,
					client,
					fixtures,
					orderItem,
					"PR-PROGRESS-CORRUPT-NEGATIVE",
					biz.PurchaseReceiptStatusPosted,
					mustDecimal(t, "1"),
				)
				adjustedAt := time.Now()
				adjustment := client.PurchaseReceiptAdjustment.Create().
					SetAdjustmentNo("PRA-PROGRESS-CORRUPT-NEGATIVE").
					SetPurchaseReceiptID(receiptItem.ReceiptID).
					SetStatus(biz.PurchaseReceiptAdjustmentStatusPosted).
					SetAdjustedAt(adjustedAt).
					SetPostedAt(adjustedAt).
					SaveX(ctx)
				client.PurchaseReceiptAdjustmentItem.Create().
					SetAdjustmentID(adjustment.ID).
					SetPurchaseReceiptItemID(receiptItem.ID).
					SetAdjustType(biz.PurchaseReceiptAdjustmentQuantityDecrease).
					SetMaterialID(fixtures.materialID).
					SetWarehouseID(fixtures.warehouseID).
					SetUnitID(fixtures.unitID).
					SetQuantity(mustDecimal(t, "2")).
					SaveX(ctx)
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			data, client := openInventoryRepoTestData(t, "purchase_order_receipt_progress_invariant_"+tt.suffix)
			fixtures := createInventoryTestFixtures(t, ctx, client)
			orderItem := createApprovedPurchaseOrderItemForReceiptTest(
				t,
				ctx,
				client,
				fixtures,
				"INVARIANT-"+tt.suffix,
				mustDecimal(t, "1"),
			)
			tt.prepare(t, ctx, client, fixtures, orderItem)
			_, err := NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)).
				GetPurchaseOrderReceiptProgress(ctx, orderItem.PurchaseOrderID)
			if !errors.Is(err, biz.ErrPurchaseOrderReceiptProgressInvalid) {
				t.Fatalf("error = %v, want ErrPurchaseOrderReceiptProgressInvalid", err)
			}
		})
	}
}

func TestPurchaseOrderReceiptProgressHandlesEmptyOrdersAndAvailabilityReasons(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_order_receipt_progress_empty")
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-PROGRESS-EMPTY", true)
	order := client.PurchaseOrder.Create().
		SetPurchaseOrderNo("PO-PROGRESS-EMPTY").
		SetSupplierID(supplier.ID).
		SetSupplierSnapshot(map[string]any{"name": supplier.Name}).
		SetPurchaseDate(time.Now()).
		SetLifecycleStatus(biz.PurchaseOrderStatusApproved).
		SaveX(ctx)
	progress, err := NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)).
		GetPurchaseOrderReceiptProgress(ctx, order.ID)
	if err != nil || progress.Items == nil || len(progress.Items) != 0 {
		t.Fatalf("empty progress = %#v err=%v", progress, err)
	}

	tests := []struct {
		name            string
		orderStatus     string
		lineStatus      string
		effective       string
		purchased       string
		draftReserved   string
		remaining       string
		wantCanGenerate bool
		wantReason      string
	}{
		{
			name:          "order not approved",
			orderStatus:   biz.PurchaseOrderStatusDraft,
			lineStatus:    biz.PurchaseOrderItemStatusOpen,
			effective:     "0",
			purchased:     "10",
			draftReserved: "0",
			remaining:     "10",
			wantReason:    "采购订单不是已批准状态，不能生成入库草稿",
		},
		{
			name:          "line not open",
			orderStatus:   biz.PurchaseOrderStatusApproved,
			lineStatus:    biz.PurchaseOrderItemStatusClosed,
			effective:     "0",
			purchased:     "10",
			draftReserved: "0",
			remaining:     "10",
			wantReason:    "采购订单行不是开放状态，不能生成入库草稿",
		},
		{
			name:          "fully received",
			orderStatus:   biz.PurchaseOrderStatusApproved,
			lineStatus:    biz.PurchaseOrderItemStatusOpen,
			effective:     "10",
			purchased:     "10",
			draftReserved: "0",
			remaining:     "0",
			wantReason:    "采购订单行已全部入库",
		},
		{
			name:          "draft occupies all remaining",
			orderStatus:   biz.PurchaseOrderStatusApproved,
			lineStatus:    biz.PurchaseOrderItemStatusOpen,
			effective:     "4",
			purchased:     "10",
			draftReserved: "6",
			remaining:     "6",
			wantReason:    "现有入库草稿已占用全部剩余可收数量",
		},
		{
			name:            "available",
			orderStatus:     biz.PurchaseOrderStatusApproved,
			lineStatus:      biz.PurchaseOrderItemStatusOpen,
			effective:       "4",
			purchased:       "10",
			draftReserved:   "1",
			remaining:       "6",
			wantCanGenerate: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			canGenerate, reason := purchaseOrderReceiptProgressAvailability(
				tt.orderStatus,
				tt.lineStatus,
				decimal.RequireFromString(tt.effective),
				decimal.RequireFromString(tt.purchased),
				decimal.RequireFromString(tt.draftReserved),
				decimal.RequireFromString(tt.remaining),
			)
			if canGenerate != tt.wantCanGenerate || reason != tt.wantReason {
				t.Fatalf("availability = (%t, %q), want (%t, %q)", canGenerate, reason, tt.wantCanGenerate, tt.wantReason)
			}
		})
	}
}

func createDirectPurchaseReceiptItemForProgressTest(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	fixtures inventoryTestFixtures,
	orderItem *ent.PurchaseOrderItem,
	receiptNo string,
	status string,
	quantity decimal.Decimal,
) *ent.PurchaseReceiptItem {
	t.Helper()
	order := client.PurchaseOrder.GetX(ctx, orderItem.PurchaseOrderID)
	supplier := client.Supplier.GetX(ctx, order.SupplierID)
	receivedAt := time.Now()
	create := client.PurchaseReceipt.Create().
		SetReceiptNo(receiptNo).
		SetSupplierID(supplier.ID).
		SetSupplierName(supplier.Name).
		SetStatus(status).
		SetReceivedAt(receivedAt)
	if status == biz.PurchaseReceiptStatusPosted {
		create.SetPostedAt(receivedAt)
	}
	receipt := create.SaveX(ctx)
	return client.PurchaseReceiptItem.Create().
		SetReceiptID(receipt.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetPurchaseOrderItemID(orderItem.ID).
		SetQuantity(quantity).
		SaveX(ctx)
}
