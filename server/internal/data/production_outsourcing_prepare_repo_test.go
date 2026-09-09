package data

import (
	"context"
	"errors"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingorderitem"
	"testing"
	"time"
)

func TestProductionWIPPrepareOutsourcingUsesManagerSelectionAndReplays(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "wip_prepare_outsourcing", func(ctx context.Context, client *ent.Client, unitID, bomID int) {
		m := createTestMaterial(t, ctx, client, unitID, "OTHER-HANDWORK-MATERIAL")
		client.BOMItem.Create().SetBomHeaderID(bomID).SetMaterialID(m.ID).SetUnitID(unitID).SetQuantity(decimal.NewFromInt(1)).SetLossRate(decimal.Zero).SaveX(ctx)
	})
	createProductionWIPRouteProcesses(t, ctx, f.client)
	wip := releaseProductionWIPRoute(t, ctx, f, "WIP-PREPARE", 10, false)
	batch := wip.Batches[0]
	vendor := f.client.Supplier.Create().SetCode("WIP-PREPARE-VENDOR").SetName("测试加工厂").SetSupplierType("outsourcing").SaveX(ctx)
	in := &biz.ProductionOutsourcingPrepare{BatchID: batch.ID, ExpectedVersion: batch.Version, SupplierID: vendor.ID, RequirementIDs: []int{wip.MaterialRequirements[0].ID}, ExpectedReturnDate: time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC), ActorID: f.actorID}
	prepared, err := f.uc.PrepareProductionOutsourcing(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	order := f.client.OutsourcingOrder.GetX(ctx, prepared.OutsourcingOrderID)
	if order.LifecycleStatus != biz.OutsourcingOrderStatusDraft || order.SourceWipBatchID == nil || *order.SourceWipBatchID != batch.ID || order.SourceWipPreparedBy == nil || *order.SourceWipPreparedBy != f.actorID {
		t.Fatalf("generated contract trace: %+v", order)
	}
	lines := f.client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(order.ID)).AllX(ctx)
	if len(lines) != 1 || lines[0].MaterialID == nil || *lines[0].MaterialID != wip.MaterialRequirements[0].MaterialID || !lines[0].OutsourcingQuantity.Equal(wip.MaterialRequirements[0].PlannedQuantity) || lines[0].UnitPrice != nil {
		t.Fatalf("draft must derive only selected material quantity: %+v", lines)
	}
	again, err := f.uc.PrepareProductionOutsourcing(ctx, in)
	if err != nil || again.OutsourcingOrderID != prepared.OutsourcingOrderID {
		t.Fatalf("retry: %v", err)
	}
	changed := *in
	changed.RequirementIDs = []int{wip.MaterialRequirements[1].ID}
	if _, err := f.uc.PrepareProductionOutsourcing(ctx, &changed); !errors.Is(err, biz.ErrProductionOrderConflict) {
		t.Fatalf("different intent overwrote draft: %v", err)
	}
	reason := "取消批次"
	_, err = f.uc.CancelProductionWIPBatch(ctx, &biz.ProductionWIPAction{ProductionOrderID: wip.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: "cancel-prepared-batch", Reason: &reason})
	if !errors.Is(err, biz.ErrProductionWIPPreparedContractDependency) {
		t.Fatalf("prepared contract must be handled before batch cancellation: %v", err)
	}
	if f.client.InventoryTxn.Query().CountX(ctx) != 0 || f.client.OutsourcingFact.Query().CountX(ctx) != 0 || f.client.ProductionWIPBatch.GetX(ctx, batch.ID).ExecutionMode != nil {
		t.Fatal("preparing a draft fabricated execution or warehouse facts")
	}
}
