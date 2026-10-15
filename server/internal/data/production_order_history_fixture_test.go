package data

import (
	"context"
	"fmt"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productionwipbatch"
)

// These fixtures exercise the documented historical null-route fact boundary.
// Current writes must include a route; the WIP suite exercises routed completion.
func markProductionOrderHistoricalUnroutedForTest(t *testing.T, ctx context.Context, client *ent.Client, orderID int) {
	t.Helper()
	client.ProductionOrderItem.Update().Where(productionorderitem.ProductionOrderID(orderID)).ClearRouteCode().SaveX(ctx)
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
