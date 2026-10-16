package data

import (
	"context"
	"errors"
	"fmt"
	"github.com/go-kratos/kratos/v2/log"
	"io"
	"server/internal/biz"
	"testing"
)

func TestWorkflowHandlingChainUsesSourceRelationsAndVisibility(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "handling_chain")
	createProductionWIPRouteProcesses(t, ctx, f.client)
	testWorkflowHandlingChainRelations(t, f)
}

func TestProductionOrderPostgresHandlingChain(t *testing.T) {
	pg := openProductionOrderPGFixture(t)
	ensureProductionWIPRouteProcessesForPostgresRace(t, context.Background(), pg.client, pg.suffix)
	testWorkflowHandlingChainRelations(t, productionOrderTestFixture{uc: pg.uc, data: pg.data, client: pg.client, actorID: pg.actorID, unitID: pg.unitID, materialID: pg.materialID, productID: pg.productID, skuID: pg.skuID, salesItemID: pg.salesItemID, bomID: *pg.item.BOMHeaderID})
}

func testWorkflowHandlingChainRelations(t *testing.T, f productionOrderTestFixture) {
	t.Helper()
	ctx := context.Background()
	suffix := postgresTestSuffix()
	flow := releaseProductionWIPRoute(t, ctx, f, "MO-HANDLING-CHAIN-"+suffix, 10, false)
	line := f.client.SalesOrderItem.GetX(ctx, f.salesItemID)
	so := f.client.SalesOrder.GetX(ctx, line.SalesOrderID)
	anchor := f.client.WorkflowTask.Create().SetTaskCode("chain-sales-" + suffix).SetTaskGroup("sales_followup").SetTaskName("销售跟进").SetSourceType("sales_order").SetSourceID(so.ID).SetOwnerRoleKey("sales").SetTaskStatusKey("ready").SaveX(ctx)
	other := f.client.WorkflowTask.Create().SetTaskCode("chain-other-" + suffix).SetTaskGroup("sales_followup").SetTaskName("不相关订单").SetSourceType("sales_order").SetSourceID(so.ID + 1000).SetOwnerRoleKey("sales").SetTaskStatusKey("ready").SaveX(ctx)
	root := flow.Batches[0]
	warehouse := f.client.WorkflowTask.Create().SetTaskCode("chain-warehouse-" + suffix).SetTaskGroup("handoff_production_return").SetTaskName("仓库回货").SetSourceType("production_wip_batch").SetSourceID(root.ID).SetOwnerRoleKey("warehouse").SetTaskStatusKey("done").SaveX(ctx)
	for _, keyword := range []string{"销售跟进", "生产", "missing' OR 1=1 --"} {
		rows, err := f.client.WorkflowTask.Query().Where(workflowTaskKeywordPredicate(keyword)).All(ctx)
		if err != nil {
			t.Fatalf("task keyword %q failed: %v", keyword, err)
		}
		if keyword == "销售跟进" && (len(rows) != 1 || rows[0].ID != anchor.ID) {
			t.Fatal("task keyword failed to retain exact task identity")
		}
		if keyword == "missing' OR 1=1 --" && len(rows) != 0 {
			t.Fatal("keyword must remain a bound value")
		}
	}
	if _, err := f.client.WorkflowTask.Query().Where(workflowTaskDiscoveryPredicate(biz.WorkflowTaskDiscoveryFilter{StageKey: biz.WorkflowTaskStages()[0].Key})).All(ctx); err != nil {
		t.Fatalf("task stage filter failed: %v", err)
	}
	repo := NewWorkflowRepo(f.data, log.NewStdLogger(io.Discard))
	scope := &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"sales"}}
	chain, err := repo.GetWorkflowHandlingChain(ctx, anchor.ID, biz.WorkflowHandlingChainOrderView, scope)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range chain.Items {
		if item.ID == other.ID || item.ID == warehouse.ID {
			t.Fatalf("unrelated or hidden task exposed: %+v", item)
		}
	}
	if _, err = repo.GetWorkflowHandlingChain(ctx, warehouse.ID, biz.WorkflowHandlingChainTaskView, scope); !errors.Is(err, biz.ErrWorkflowTaskNotFound) {
		t.Fatalf("hidden anchor=%v", err)
	}
	scope.StandaloneAllowAllOwnerRoles = true
	chain, err = repo.GetWorkflowHandlingChain(ctx, anchor.ID, biz.WorkflowHandlingChainOrderView, scope)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, item := range chain.Items {
		if item.ID == warehouse.ID {
			found = true
			if item.OperationCode != biz.ProductionWIPOperationFabricProcessing || item.BatchNo != root.BatchNo {
				t.Fatalf("lost source detail: %+v", item)
			}
		}
	}
	if !found {
		t.Fatal("WIP source must link through the production line to the sales order")
	}
	focused, err := repo.GetWorkflowHandlingChain(ctx, anchor.ID, biz.WorkflowHandlingChainTaskView, scope)
	if err != nil || len(focused.Items) != 1 || focused.Items[0].ID != anchor.ID {
		t.Fatalf("task detail must not expand to the sales order: %+v %v", focused, err)
	}
	for i := 0; i < 105; i++ {
		f.client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("chain-parallel-%s-%d", suffix, i)).SetTaskGroup("sales_followup").SetTaskName("同订单其他跟进").SetSourceType("sales_order").SetSourceID(so.ID).SetOwnerRoleKey("sales").SetTaskStatusKey("ready").SaveX(ctx)
	}
	focused, err = repo.GetWorkflowHandlingChain(ctx, warehouse.ID, biz.WorkflowHandlingChainTaskView, scope)
	if err != nil || focused.Truncated || len(focused.Items) == 0 || focused.Items[0].ID != warehouse.ID {
		t.Fatalf("parallel order work must not crowd out task detail: %+v %v", focused, err)
	}
	for _, item := range focused.Items {
		if item.BatchNo != root.BatchNo {
			t.Fatalf("task detail contains unrelated work: %+v", item)
		}
	}
	order, err := repo.GetWorkflowHandlingChain(ctx, warehouse.ID, biz.WorkflowHandlingChainOrderView, scope)
	if err != nil || !order.Truncated || len(order.Items) != 100 || order.Items[0].ID != warehouse.ID {
		t.Fatalf("explicit order overview must remain bounded and retain anchor: %+v %v", order, err)
	}
}
