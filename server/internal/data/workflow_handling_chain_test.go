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
	// A forwarded link can follow the same batch after handoff without exposing
	// the hidden original task or other work on the same order.
	quality := f.client.WorkflowTask.Create().SetTaskCode("chain-link-quality-" + suffix).SetTaskGroup("quality_followup").SetTaskName("裁片检查").SetSourceType("production_wip_batch").SetSourceID(root.ID).SetOwnerRoleKey("engineering").SetTaskStatusKey("ready").SaveX(ctx)
	engineeringScope := &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"engineering"}}
	shared, err := repo.GetWorkflowHandlingChain(ctx, warehouse.ID, biz.WorkflowHandlingChainLinkView, engineeringScope)
	if err != nil || len(shared.Items) != 1 || shared.Items[0].ID != quality.ID {
		t.Fatalf("link must follow authorized batch task only: %+v %v", shared, err)
	}
	f.client.WorkflowTask.UpdateOneID(quality.ID).SetTaskStatusKey("done").SaveX(ctx)
	next := f.client.WorkflowTask.Create().SetTaskCode("chain-link-next-" + suffix).SetTaskGroup("quality_followup").SetTaskName("复核裁片").SetSourceType("production_wip_batch").SetSourceID(root.ID).SetOwnerRoleKey("engineering").SetTaskStatusKey("ready").SaveX(ctx)
	shared, err = repo.GetWorkflowHandlingChain(ctx, warehouse.ID, biz.WorkflowHandlingChainLinkView, engineeringScope)
	if err != nil || len(shared.Items) != 2 || shared.Items[0].ID != next.ID || shared.Items[1].Status != "done" {
		t.Fatalf("old link must reflect current task state: %+v %v", shared, err)
	}
	f.client.WorkflowTask.UpdateOneID(next.ID).SetTaskStatusKey("done").SaveX(ctx)
	qualityCurrent := f.client.WorkflowTask.Create().SetTaskCode("chain-link-handoff-" + suffix).SetTaskGroup("quality_followup").SetTaskName("品质接收裁片").SetSourceType("production_wip_batch").SetSourceID(root.ID).SetOwnerRoleKey(biz.QualityRoleKey).SetTaskStatusKey("ready").SaveX(ctx)
	shared, err = repo.GetWorkflowHandlingChain(ctx, warehouse.ID, biz.WorkflowHandlingChainLinkView, engineeringScope)
	if err != nil || len(shared.Items) != 2 || shared.Items[0].Status != "done" || shared.Items[1].Status != "done" {
		t.Fatalf("previous role must see its completed history after cross-role handoff: %+v %v", shared, err)
	}
	qualityScope := &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{biz.QualityRoleKey}}
	shared, err = repo.GetWorkflowHandlingChain(ctx, warehouse.ID, biz.WorkflowHandlingChainLinkView, qualityScope)
	if err != nil || len(shared.Items) != 1 || shared.Items[0].ID != qualityCurrent.ID || shared.Items[0].Status != "ready" {
		t.Fatalf("next role must receive its current task through the same old link: %+v %v", shared, err)
	}
	for _, hiddenID := range []int{other.ID, anchor.ID, warehouse.ID + 1000000} {
		if _, err = repo.GetWorkflowHandlingChain(ctx, hiddenID, biz.WorkflowHandlingChainLinkView, engineeringScope); !errors.Is(err, biz.ErrWorkflowTaskNotFound) {
			t.Fatalf("link must not expose unrelated or missing anchor %d: %v", hiddenID, err)
		}
	}
	privateFollowup := f.client.WorkflowTask.Create().SetTaskCode("chain-link-private-" + suffix).SetTaskGroup(biz.WorkflowFollowupTaskGroup).SetTaskName("独立跟进").SetSourceType("production_wip_batch").SetSourceID(root.ID).SetOwnerRoleKey("sales").SetTaskStatusKey("ready").SaveX(ctx)
	if _, err = repo.GetWorkflowHandlingChain(ctx, privateFollowup.ID, biz.WorkflowHandlingChainLinkView, engineeringScope); !errors.Is(err, biz.ErrWorkflowTaskNotFound) {
		t.Fatalf("independent followup must not jump to another task: %v", err)
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
		if item.ID == privateFollowup.ID {
			t.Fatalf("standalone followup must not become another task's handling target: %+v", item)
		}
		if item.BatchNo != root.BatchNo {
			t.Fatalf("task detail contains unrelated work: %+v", item)
		}
	}
	order, err := repo.GetWorkflowHandlingChain(ctx, warehouse.ID, biz.WorkflowHandlingChainOrderView, scope)
	if err != nil || !order.Truncated || len(order.Items) != 100 || order.Items[0].ID != warehouse.ID {
		t.Fatalf("explicit order overview must remain bounded and retain anchor: %+v %v", order, err)
	}
	uc := biz.NewWorkflowUsecase(repo)
	linkFirst, err := uc.GetHandlingChainPage(ctx, anchor.ID, biz.WorkflowHandlingChainLinkView, scope, 0)
	if err != nil || len(linkFirst.Items) != 100 || !linkFirst.Truncated {
		t.Fatalf("link page must remain bounded: %+v %v", linkFirst, err)
	}
	linkNext, err := uc.GetHandlingChainPage(ctx, anchor.ID, biz.WorkflowHandlingChainLinkView, scope, 100)
	if err != nil || len(linkNext.Items) != 6 || linkNext.Truncated {
		t.Fatalf("link must continue the same source: %+v %v", linkNext, err)
	}
	seen := map[int]bool{}
	for _, page := range []*biz.WorkflowHandlingChain{linkFirst, linkNext} {
		for _, item := range page.Items {
			if seen[item.ID] || item.ID == other.ID || item.ID == warehouse.ID {
				t.Fatalf("link paging duplicated or crossed scope: %+v", item)
			}
			seen[item.ID] = true
		}
	}

	// Every recipient opens the same link. The SQL projection must contain only
	// that recipient's current scope, even when the shared anchor is hidden.
	roleTasks := map[string]int{}
	for _, role := range []string{biz.SalesRoleKey, biz.EngineeringRoleKey, biz.PurchaseRoleKey, biz.ProductionRoleKey, biz.WarehouseRoleKey, biz.QualityRoleKey, biz.FinanceRoleKey, biz.PMCRoleKey, biz.BossRoleKey} {
		task := f.client.WorkflowTask.Create().SetTaskCode("chain-role-" + role + "-" + suffix).SetTaskGroup("role_followup").SetTaskName("岗位待办").SetSourceType(other.SourceType).SetSourceID(other.SourceID).SetOwnerRoleKey(role).SetTaskStatusKey("ready").SaveX(ctx)
		roleTasks[role] = task.ID
	}
	assertRoleScope := func(t *testing.T, roles []string, all bool) {
		t.Helper()
		result, err := repo.GetWorkflowHandlingChain(ctx, other.ID, biz.WorkflowHandlingChainLinkView, &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: roles, StandaloneAllowAllOwnerRoles: all})
		if len(roles) == 0 && !all {
			if !errors.Is(err, biz.ErrWorkflowTaskNotFound) {
				t.Fatalf("unrelated recipient must not discover the chain: %+v %v", result, err)
			}
			return
		}
		want := map[int]bool{}
		for role, id := range roleTasks {
			allowed := all
			for _, visibleRole := range roles {
				allowed = allowed || visibleRole == role
			}
			if allowed {
				want[id] = true
				if role == biz.SalesRoleKey {
					want[other.ID] = true
				}
			}
		}
		if err != nil || len(result.Items) != len(want) {
			t.Fatalf("recipient roles=%v all=%v chain=%+v err=%v", roles, all, result, err)
		}
		for _, item := range result.Items {
			if !want[item.ID] {
				t.Fatalf("recipient received another role's task: %+v", item)
			}
			delete(want, item.ID)
		}
	}
	for role := range roleTasks {
		t.Run("shared_link_"+role, func(t *testing.T) { assertRoleScope(t, []string{role}, false) })
	}
	t.Run("shared_link_multiple_roles", func(t *testing.T) { assertRoleScope(t, []string{biz.PurchaseRoleKey, biz.FinanceRoleKey}, false) })
	t.Run("shared_link_supervision", func(t *testing.T) { assertRoleScope(t, nil, true) })
	t.Run("shared_link_no_visible_role", func(t *testing.T) { assertRoleScope(t, nil, false) })
}
