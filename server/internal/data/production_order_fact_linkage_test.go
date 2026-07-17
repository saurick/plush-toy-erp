package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestProductionCompletionFromOrderDerivesSourceAndReplays(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "production_completion_from_order")
	logger := log.NewStdLogger(io.Discard)
	actor := client.AdminUser.Create().SetUsername("production-completion-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	unitRow := createTestUnit(t, ctx, client, "PCO-U")
	productRow := createTestProduct(t, ctx, client, unitRow.ID, "PCO-P")
	skuRow := createInventoryTestSKU(t, ctx, client, productRow.ID, unitRow.ID, "PCO-SKU")
	warehouseRow := createTestWarehouse(t, ctx, client, "PCO-WH")

	orderUC := biz.NewProductionOrderUsecase(NewProductionOrderRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	created, err := orderUC.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: biz.ProductionOrderDraft{OrderNo: "MO-COMPLETION-001", Items: []biz.ProductionOrderDraftItem{{
			LineNo: 1, ProductID: productRow.ID, ProductSKUID: &skuRow.ID, UnitID: unitRow.ID, PlannedQuantity: decimal.NewFromInt(10),
		}}},
		ActorID: actor.ID, IdempotencyKey: "mo-completion-create",
	})
	if err != nil {
		t.Fatalf("create production order: %v", err)
	}
	released, err := orderUC.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: 1, ActorID: actor.ID, IdempotencyKey: "mo-completion-release",
	})
	if err != nil {
		t.Fatalf("release production order: %v", err)
	}
	completeProductionSchedulingTaskForTest(t, ctx, data, client, released.Order.ID, actor.ID)
	line := released.Items[0]
	lotNo := "PCO-COMPLETION-LOT"
	input := &biz.ProductionCompletionFromOrderCreate{
		FactNo:                "PF-COMPLETION-001",
		ProductionOrderID:     released.Order.ID,
		ProductionOrderItemID: line.ID,
		WarehouseID:           warehouseRow.ID,
		NewLotNo:              &lotNo,
		Quantity:              decimal.NewFromInt(4),
		IdempotencyKey:        "pf-completion-001",
		OccurredAt:            time.Now().UTC(),
		OccurredAtSpecified:   true,
	}

	fact, err := factUC.CreateProductionCompletionFromOrder(ctx, input)
	if err != nil {
		t.Fatalf("create production completion: %v", err)
	}
	if fact.FactType != biz.ProductionFactFinishedGoodsReceipt || fact.SubjectType != biz.InventorySubjectProduct || fact.SubjectID != productRow.ID || fact.ProductSkuID == nil || *fact.ProductSkuID != skuRow.ID || fact.UnitID != unitRow.ID {
		t.Fatalf("completion source-derived fields = %#v", fact)
	}
	if fact.SourceType == nil || *fact.SourceType != biz.ProductionOrderSourceType || fact.SourceID == nil || *fact.SourceID != released.Order.ID || fact.SourceLineID == nil || *fact.SourceLineID != line.ID {
		t.Fatalf("completion source linkage = %#v", fact)
	}
	listed, total, err := factUC.ListProductionFacts(ctx, biz.OperationalFactFilter{
		SourceType: biz.ProductionOrderSourceType,
		SourceID:   released.Order.ID,
	})
	if err != nil || total != 1 || len(listed) != 1 || listed[0].SourceNo == nil || *listed[0].SourceNo != released.Order.OrderNo {
		t.Fatalf("listed completion source number rows=%#v total=%d err=%v", listed, total, err)
	}
	replayed, err := factUC.CreateProductionCompletionFromOrder(ctx, input)
	if err != nil || replayed.ID != fact.ID {
		t.Fatalf("completion replay = %#v, %v", replayed, err)
	}
	changed := *input
	changed.Quantity = decimal.NewFromInt(5)
	if _, err := factUC.CreateProductionCompletionFromOrder(ctx, &changed); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed completion replay error = %v", err)
	}
	wrongLine := *input
	wrongLine.IdempotencyKey = "pf-completion-wrong-line"
	wrongLine.ProductionOrderItemID = line.ID + 999999
	if _, err := factUC.CreateProductionCompletionFromOrder(ctx, &wrongLine); !errors.Is(err, biz.ErrProductionOrderFactSourceInvalid) {
		t.Fatalf("wrong completion order item error = %v", err)
	}
}

func TestProductionOrderFactLinkageQuantityReversalAndCancellation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "production_order_fact_linkage")
	logger := log.NewStdLogger(io.Discard)
	actor := client.AdminUser.Create().SetUsername("production-order-fact-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	unitRow := createTestUnit(t, ctx, client, "POF-U")
	productRow := createTestProduct(t, ctx, client, unitRow.ID, "POF-P")
	skuRow := createInventoryTestSKU(t, ctx, client, productRow.ID, unitRow.ID, "POF-SKU")
	warehouseRow := createTestWarehouse(t, ctx, client, "POF-WH")

	orderUC := biz.NewProductionOrderUsecase(NewProductionOrderRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	created, err := orderUC.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: biz.ProductionOrderDraft{OrderNo: "MO-FACT-001", Items: []biz.ProductionOrderDraftItem{{
			LineNo: 1, ProductID: productRow.ID, ProductSKUID: &skuRow.ID, UnitID: unitRow.ID, PlannedQuantity: decimal.NewFromInt(10),
		}}},
		ActorID: actor.ID, IdempotencyKey: "mo-fact-create",
	})
	if err != nil {
		t.Fatalf("create production order: %v", err)
	}
	released, err := orderUC.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 1, ActorID: actor.ID, IdempotencyKey: "mo-fact-release"})
	if err != nil {
		t.Fatalf("release production order: %v", err)
	}
	completeProductionSchedulingTaskForTest(t, ctx, data, client, released.Order.ID, actor.ID)
	line := released.Items[0]

	newFact := func(no, key string, quantity int64) *biz.OperationalFactMutation {
		sourceType, sourceID, sourceLineID := biz.ProductionOrderSourceType, released.Order.ID, line.ID
		return &biz.OperationalFactMutation{
			FactNo: no, FactType: biz.ProductionFactFinishedGoodsReceipt,
			SubjectType: biz.InventorySubjectProduct, SubjectID: productRow.ID, ProductSkuID: &skuRow.ID,
			WarehouseID: warehouseRow.ID, UnitID: unitRow.ID, Quantity: decimal.NewFromInt(quantity),
			SourceType: &sourceType, SourceID: &sourceID, SourceLineID: &sourceLineID,
			IdempotencyKey: key, OccurredAt: time.Now().UTC(), OccurredAtSpecified: true,
		}
	}

	fact1Input := newFact("PF-MO-001", "pf-mo-001", 6)
	fact1, err := factUC.CreateProductionFactDraft(ctx, fact1Input)
	if err != nil {
		t.Fatalf("create first linked fact: %v", err)
	}
	replayedFact1, err := factUC.CreateProductionFactDraft(ctx, fact1Input)
	if err != nil || replayedFact1.ID != fact1.ID {
		t.Fatalf("linked fact exact replay = %#v, %v", replayedFact1, err)
	}
	changedFact1 := *fact1Input
	changedFact1.Quantity = decimal.NewFromInt(7)
	if _, err := factUC.CreateProductionFactDraft(ctx, &changedFact1); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed linked fact replay error = %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, fact1.ID); err != nil {
		t.Fatalf("post first linked fact: %v", err)
	}
	cancelReason := "计划取消"
	if _, err := orderUC.Cancel(ctx, &biz.ProductionOrderAction{ID: released.Order.ID, ExpectedVersion: 2, ActorID: actor.ID, IdempotencyKey: "cancel-with-posted", Reason: &cancelReason}); !errors.Is(err, biz.ErrProductionOrderHasPostedFacts) {
		t.Fatalf("order with effective posted fact cancellation error = %v", err)
	}

	overInput := newFact("PF-MO-OVER", "pf-mo-over", 5)
	over, err := factUC.CreateProductionFactDraft(ctx, overInput)
	if err != nil {
		t.Fatalf("create over-limit draft: %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, over.ID); !errors.Is(err, biz.ErrProductionOrderQuantityExceeded) {
		t.Fatalf("over-limit post error = %v", err)
	}
	if row := client.ProductionFact.GetX(ctx, over.ID); row.Status != biz.OperationalFactStatusDraft {
		t.Fatalf("failed over-limit post must remain DRAFT: %#v", row)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.IdempotencyKey(biz.OperationalFactInventoryIdempotencyKey(biz.ProductionFactSourceType, over.ID, over.ID, "POST"))).CountX(ctx); count != 0 {
		t.Fatalf("failed over-limit post must write zero inventory txn, count=%d", count)
	}

	fact2, err := factUC.CreateProductionFactDraft(ctx, newFact("PF-MO-002", "pf-mo-002", 4))
	if err != nil {
		t.Fatalf("create second linked fact: %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, fact2.ID); err != nil {
		t.Fatalf("post second linked fact: %v", err)
	}
	if _, err := factUC.CancelPostedProductionFact(ctx, fact1.ID); err != nil {
		t.Fatalf("cancel first linked fact: %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, over.ID); err != nil {
		t.Fatalf("reversal must release effective quantity for later post: %v", err)
	}

	if _, err := factUC.CancelPostedProductionFact(ctx, fact2.ID); err != nil {
		t.Fatalf("cancel second linked fact: %v", err)
	}
	if _, err := factUC.CancelPostedProductionFact(ctx, over.ID); err != nil {
		t.Fatalf("cancel formerly over-limit linked fact: %v", err)
	}
	pending, err := factUC.CreateProductionFactDraft(ctx, newFact("PF-MO-PENDING", "pf-mo-pending", 1))
	if err != nil {
		t.Fatalf("create pending linked fact: %v", err)
	}
	cancelled, err := orderUC.Cancel(ctx, &biz.ProductionOrderAction{ID: released.Order.ID, ExpectedVersion: 2, ActorID: actor.ID, IdempotencyKey: "cancel-after-reversal", Reason: &cancelReason})
	if err != nil || cancelled.Order.Status != biz.ProductionOrderStatusCancelled {
		t.Fatalf("cancel order after all reversals = %#v, %v", cancelled, err)
	}
	replayedCancel, err := orderUC.Cancel(ctx, &biz.ProductionOrderAction{ID: released.Order.ID, ExpectedVersion: 999, ActorID: actor.ID, IdempotencyKey: "cancel-after-reversal", Reason: &cancelReason})
	if err != nil || replayedCancel.Order.Version != cancelled.Order.Version {
		t.Fatalf("released cancellation exact replay = %#v, %v", replayedCancel, err)
	}
	if _, err := factUC.PostProductionFact(ctx, pending.ID); !errors.Is(err, biz.ErrProductionOrderInvalidState) {
		t.Fatalf("pending fact must not post after order cancellation, error = %v", err)
	}
	if replay, err := factUC.CreateProductionFactDraft(ctx, fact1Input); err != nil || replay.ID != fact1.ID {
		t.Fatalf("fact receipt replay must survive later order cancellation: %#v, %v", replay, err)
	}
}

func TestProductionOrderFactLinkageRejectsWrongSourceShape(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "production_order_fact_wrong_source")
	logger := log.NewStdLogger(io.Discard)
	actor := client.AdminUser.Create().SetUsername("production-order-wrong-source-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	unitRow := createTestUnit(t, ctx, client, "POW-U")
	otherUnit := createTestUnit(t, ctx, client, "POW-U2")
	productRow := createTestProduct(t, ctx, client, unitRow.ID, "POW-P")
	otherProduct := createTestProduct(t, ctx, client, unitRow.ID, "POW-P2")
	skuRow := createInventoryTestSKU(t, ctx, client, productRow.ID, unitRow.ID, "POW-SKU")
	otherSKU := createInventoryTestSKU(t, ctx, client, otherProduct.ID, unitRow.ID, "POW-SKU2")
	warehouseRow := createTestWarehouse(t, ctx, client, "POW-WH")
	orderUC := biz.NewProductionOrderUsecase(NewProductionOrderRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	created, err := orderUC.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: biz.ProductionOrderDraft{OrderNo: "MO-WRONG", Items: []biz.ProductionOrderDraftItem{{
		LineNo: 1, ProductID: productRow.ID, ProductSKUID: &skuRow.ID, UnitID: unitRow.ID, PlannedQuantity: decimal.NewFromInt(10),
	}}}, ActorID: actor.ID, IdempotencyKey: "mo-wrong-create"})
	if err != nil {
		t.Fatalf("create source order: %v", err)
	}
	released, err := orderUC.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 1, ActorID: actor.ID, IdempotencyKey: "mo-wrong-release"})
	if err != nil {
		t.Fatalf("release source order: %v", err)
	}
	sourceType, sourceID, sourceLineID := biz.ProductionOrderSourceType, released.Order.ID, released.Items[0].ID
	base := biz.OperationalFactMutation{
		FactNo: "PF-WRONG", FactType: biz.ProductionFactFinishedGoodsReceipt,
		SubjectType: biz.InventorySubjectProduct, SubjectID: productRow.ID, ProductSkuID: &skuRow.ID,
		WarehouseID: warehouseRow.ID, UnitID: unitRow.ID, Quantity: decimal.NewFromInt(1),
		SourceType: &sourceType, SourceID: &sourceID, SourceLineID: &sourceLineID,
		OccurredAt: time.Now().UTC(), OccurredAtSpecified: true,
	}
	tests := []struct {
		name string
		edit func(*biz.OperationalFactMutation)
	}{
		{name: "wrong line", edit: func(in *biz.OperationalFactMutation) { wrong := sourceLineID + 999999; in.SourceLineID = &wrong }},
		{name: "wrong product", edit: func(in *biz.OperationalFactMutation) { in.SubjectID = otherProduct.ID; in.ProductSkuID = &otherSKU.ID }},
		{name: "wrong sku", edit: func(in *biz.OperationalFactMutation) { in.ProductSkuID = &otherSKU.ID }},
		{name: "wrong unit", edit: func(in *biz.OperationalFactMutation) { in.UnitID = otherUnit.ID }},
		{name: "wrong fact type", edit: func(in *biz.OperationalFactMutation) { in.FactType = biz.ProductionFactRework }},
	}
	for index, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			input := base
			input.IdempotencyKey = "pf-wrong-" + string(rune('a'+index))
			input.FactNo = "PF-WRONG-" + string(rune('A'+index))
			tc.edit(&input)
			if _, err := factUC.CreateProductionFactDraft(ctx, &input); !errors.Is(err, biz.ErrProductionOrderFactSourceInvalid) {
				t.Fatalf("wrong source error = %v", err)
			}
		})
	}
}
