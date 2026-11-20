package data

import (
	"context"
	"fmt"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productionorderoperation"
	"server/internal/data/model/ent/productionwipbatch"

	"github.com/shopspring/decimal"
)

// Fact tests freeze real route/material references and provide a completed
// handwork fixture. The WIP suite separately exercises the upstream transitions.
func prepareProductionOrderFactMaterialsForTest(t *testing.T, ctx context.Context, client *ent.Client, orderID int) {
	t.Helper()
	for _, item := range client.ProductionOrderItem.Query().Where(productionorderitem.ProductionOrderID(orderID)).AllX(ctx) {
		if item.BomHeaderID != nil {
			continue
		}
		bom := client.BOMHeader.Create().SetProductID(item.ProductID).SetVersion(fmt.Sprintf("SIM-FACT-%d", item.ID)).SetStatus("ACTIVE").SaveX(ctx)
		material := createTestMaterial(t, ctx, client, item.UnitID, fmt.Sprintf("SIM-FACT-MAT-%d", item.ID))
		client.BOMItem.Create().SetBomHeaderID(bom.ID).SetMaterialID(material.ID).SetUnitID(item.UnitID).SetQuantity(decimal.NewFromInt(1)).SetLossRate(decimal.Zero).SaveX(ctx)
		client.ProductionOrderItem.UpdateOneID(item.ID).SetBomHeaderID(bom.ID).SetBomVersionSnapshot(bom.Version).SaveX(ctx)
	}
}

func prepareProductionHandworkBatchForFactTest(t *testing.T, ctx context.Context, client *ent.Client, itemID, actorID int) int {
	t.Helper()
	if batch, err := client.ProductionWIPBatch.Query().Where(productionwipbatch.ProductionOrderItemID(itemID), productionwipbatch.Status(biz.ProductionWIPStatusAccepted)).Only(ctx); err == nil {
		return batch.ID
	}
	item := client.ProductionOrderItem.GetX(ctx, itemID)
	operation := client.ProductionOrderOperation.Query().Where(productionorderoperation.ProductionOrderItemID(itemID), productionorderoperation.OperationCode(biz.ProductionWIPOperationHandwork)).OnlyX(ctx)
	client.ProductionWIPBatch.Update().Where(productionwipbatch.ProductionOrderItemID(itemID), productionwipbatch.Status(biz.ProductionWIPStatusPlanned)).SetStatus(biz.ProductionWIPStatusCancelled).SaveX(ctx)
	return client.ProductionWIPBatch.Create().SetProductionOrderID(item.ProductionOrderID).SetProductionOrderItemID(item.ID).SetProductionOrderOperationID(operation.ID).
		SetBatchNo(fmt.Sprintf("SIM-HANDWORK-%d", item.ID)).SetStatus(biz.ProductionWIPStatusAccepted).SetExecutionMode(biz.ProductionWIPExecutionInHouse).
		SetQuantity(item.PlannedQuantity).SetCreatedBy(actorID).SaveX(ctx).ID
}

func cancelUnstartedProductionWIPForTest(t *testing.T, ctx context.Context, f productionOrderTestFixture, orderID int) {
	t.Helper()
	rows := f.client.ProductionWIPBatch.Query().Where(productionwipbatch.ProductionOrderID(orderID), productionwipbatch.Status(biz.ProductionWIPStatusPlanned)).AllX(ctx)
	reason := "模拟计划终止，撤销未开工批次"
	for _, row := range rows {
		if _, err := f.uc.CancelProductionWIPBatch(ctx, &biz.ProductionWIPAction{
			ProductionOrderID: orderID, BatchID: row.ID, ExpectedVersion: row.Version, ActorID: f.actorID,
			IdempotencyKey: fmt.Sprintf("fixture-cancel-unstarted-%d", row.ID), Reason: &reason,
		}); err != nil {
			t.Fatal(err)
		}
	}
}
