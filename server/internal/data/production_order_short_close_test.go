package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func assertProductionSalesPlanningQuantity(t *testing.T, client *ent.Client, salesItemID int, quantity int64) {
	t.Helper()
	totals, err := readProductionOrderSalesPlanning(context.Background(), client, []int{salesItemID}, 0)
	if err != nil || !totals[salesItemID].Equal(decimal.NewFromInt(quantity)) {
		t.Fatalf("sales planning quantity=%s want=%d err=%v", totals[salesItemID], quantity, err)
	}
}

func TestProductionOrderShortCloseReplansOnlyUnfinishedDemand(t *testing.T) {
	for _, completed := range []int64{0, 6, 20, 22} {
		t.Run(fmt.Sprintf("completed_%d", completed), func(t *testing.T) {
			ctx := context.Background()
			f := openProductionOrderRepoTest(t, fmt.Sprintf("short_close_%d", completed), func(ctx context.Context, client *ent.Client, _, _ int) {
				// Freeze engineering approval against demand including two samples.
				client.SalesOrderItem.Update().SetPreShipmentSampleQuantity(decimal.NewFromInt(2)).SaveX(ctx)
			})
			created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("SHORT-ORIGINAL", 22), ActorID: f.actorID, IdempotencyKey: "short-create"})
			if err != nil {
				t.Fatal(err)
			}
			order, err := f.uc.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: created.Order.Version, ActorID: f.actorID, IdempotencyKey: "short-release"})
			if err != nil {
				t.Fatal(err)
			}
			facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
			var posted *biz.ProductionFact
			if completed > 0 {
				batchID := prepareProductionHandworkBatchForFactTest(t, ctx, f.client, order.Items[0].ID, f.actorID)
				warehouse := createTestProductWarehouse(t, ctx, f.client, "SHORT-WH")
				lot := "SHORT-LOT"
				draft, err := facts.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
					FactNo: "SHORT-FINISH", ProductionOrderID: order.Order.ID, ProductionOrderItemID: order.Items[0].ID, ProductionWIPBatchID: batchID,
					WarehouseID: warehouse.ID, NewLotNo: &lot, Quantity: decimal.NewFromInt(completed), IdempotencyKey: "short-finish",
				})
				if err != nil {
					t.Fatal(err)
				}
				posted, err = facts.PostProductionFact(ctx, operationalFactStatusMutation(draft.ID, draft.Version, f.actorID, ""))
				if err != nil {
					t.Fatal(err)
				}
			} else {
				cancelUnstartedProductionWIPForTest(t, ctx, f, order.Order.ID)
			}
			completeProductionSchedulingTaskForWIPClose(t, ctx, f, order.Order.ID)
			assertProductionSalesPlanningQuantity(t, f.client, f.salesItemID, 22)
			reason := "剩余数量转新生产单安排"
			action := &biz.ProductionOrderAction{ID: order.Order.ID, ExpectedVersion: order.Order.Version, ActorID: f.actorID, IdempotencyKey: "short-close", Reason: &reason}
			closed, err := f.uc.Close(ctx, action)
			if err != nil || closed.Order.Status != biz.ProductionOrderStatusClosed {
				t.Fatalf("close: %v", err)
			}
			assertProductionSalesPlanningQuantity(t, f.client, f.salesItemID, completed)
			if _, err := f.uc.Close(ctx, action); err != nil {
				t.Fatalf("close replay: %v", err)
			}
			if completed < 22 {
				if _, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("SHORT-REPLACEMENT", 22-completed), ActorID: f.actorID, IdempotencyKey: "short-replacement"}); err != nil {
					t.Fatalf("supplement remaining demand: %v", err)
				}
			}
			assertProductionSalesPlanningQuantity(t, f.client, f.salesItemID, 22)
			if _, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("SHORT-OVER", 1), ActorID: f.actorID, IdempotencyKey: "short-over"}); !errors.Is(err, biz.ErrProductionOrderPlannedQuantityExceeded) {
				t.Fatalf("supplement exceeded sales demand: %v", err)
			}
			if posted != nil {
				if _, err := facts.CancelPostedProductionFact(ctx, operationalFactStatusMutation(posted.ID, posted.Version, f.actorID, "冲正完工登记")); err != nil {
					t.Fatal(err)
				}
				assertProductionSalesPlanningQuantity(t, f.client, f.salesItemID, 22-completed)
			}
		})
	}
}
