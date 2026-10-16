package data

import (
	"context"
	"fmt"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/shopspring/decimal"
)

func TestWorkflowTrackingFiltersUseCurrentResponsibilityAndBusinessDay(t *testing.T) {
	client, repo, process, approval := trackingFixture(t)
	ctx := context.Background()
	now := process.StartedAt.Add(time.Hour)
	approval.Update().SetTaskStatusKey("done").SetDueAt(now.Add(-time.Hour)).SaveX(ctx)
	client.ProcessNodeInstance.UpdateOneID(*approval.ProcessNodeInstanceID).SetStatus("completed").SetCompletedAt(now).SaveX(ctx)
	node := client.ProcessNodeInstance.Create().SetProcessInstanceID(process.ID).SetNodeKey("engineering").SetNodeType("human_task").SetStatus("active").SetStartedAt(now).SaveX(ctx)
	current := client.WorkflowTask.Create().SetTaskCode("TRACK-CURRENT").SetTaskGroup("engineering").SetTaskName("核对工程资料").SetSourceType("sales_order").SetSourceID(1).SetConfigRevision("frozen").SetProcessInstanceID(process.ID).SetProcessNodeInstanceID(node.ID).SetOwnerRoleKey("engineering").SetTaskStatusKey("blocked").SetDueAt(now.Add(-time.Minute)).SaveX(ctx)
	client.WorkflowTask.Create().SetTaskCode("TRACK-FINISHED").SetTaskGroup("business_followup").SetTaskName("已结束跟进").SetSourceType("finance_payment").SetSourceID(3).SetOwnerRoleKey("sales").SetTaskStatusKey("done").SetCompletedAt(now).SetCreatedBy(7).SetCreatedAt(process.StartedAt).SaveX(ctx)
	count := func(q biz.WorkflowTrackingQuery, want int) {
		t.Helper()
		q.SnapshotAt = now
		page, err := repo.ListWorkflowTracking(ctx, q)
		if err != nil || len(page.Items) != want || page.Total != want {
			t.Fatalf("query=%#v page=%#v err=%v", q, page, err)
		}
	}
	for _, tc := range []struct {
		name   string
		change func(*biz.WorkflowTrackingQuery)
		want   int
	}{
		{"active", func(q *biz.WorkflowTrackingQuery) { q.Status = "active" }, 1},
		{"completed", func(q *biz.WorkflowTrackingQuery) { q.Status = "completed" }, 1},
		{"past approver", func(q *biz.WorkflowTrackingQuery) { q.OwnerRoleKey = "boss" }, 0},
		{"current role", func(q *biz.WorkflowTrackingQuery) { q.OwnerRoleKey = "engineering" }, 1},
		{"blocked", func(q *biz.WorkflowTrackingQuery) { q.Attention = "blocked" }, 1},
		{"overdue", func(q *biz.WorkflowTrackingQuery) { q.Attention = "overdue" }, 1},
		{"source type alone", func(q *biz.WorkflowTrackingQuery) { q.SourceType = "finance_payment" }, 1},
		{"intersection", func(q *biz.WorkflowTrackingQuery) { q.Status = "completed"; q.OwnerRoleKey = "engineering" }, 0},
		{"other actor", func(q *biz.WorkflowTrackingQuery) { q.ActorID = 99; q.OwnerRoleKey = "engineering" }, 0},
	} {
		t.Run(tc.name, func(t *testing.T) { q := trackingQuery(7, "started"); tc.change(&q); count(q, tc.want) })
	}
	current.Update().ClearDueAt().SetTaskStatusKey("ready").SaveX(ctx)
	q := trackingQuery(7, "started")
	q.Attention = "overdue"
	count(q, 0)
	q.Attention = "blocked"
	count(q, 0)
	day := time.Date(2026, 10, 8, 0, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*3600))
	for index, offset := range []time.Duration{-time.Second, 0, 24*time.Hour - time.Second, 24 * time.Hour} {
		client.ProcessInstance.Create().SetProcessKey(biz.ProcessKeySalesOrderAcceptance).SetProcessVersion("v1").SetConfigRevision("frozen").SetDefinitionHash("hash").SetBusinessRefType("sales_order").SetBusinessRefID(index + 10).SetIdempotencyKey(fmt.Sprintf("filter-date-%d", index)).SetCreatedBy(7).SetStartedAt(day.Add(offset)).SaveX(ctx)
		client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("TRACK-DATE-%d", index)).SetTaskGroup(biz.WorkflowFollowupTaskGroup).SetTaskName("核对交期").SetSourceType("sales_order").SetSourceID(index + 10).SetOwnerRoleKey("sales").SetTaskStatusKey("ready").SetCreatedBy(7).SetCreatedAt(day.Add(offset)).SaveX(ctx)
	}
	q = trackingQuery(7, "started")
	q.DateFrom, q.DateTo = &day, &day
	count(q, 4)
}

func TestWorkflowTrackingSourceFilterKeepsDocumentAnchorExact(t *testing.T) {
	client, repo, _, _ := trackingFixture(t)
	ctx := context.Background()
	for index, source := range []string{"production_order", biz.WorkflowSourceTaskProductionOrderSourceType} {
		task := client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("TRACK-SOURCE-%d", index)).SetTaskGroup(biz.WorkflowFollowupTaskGroup).SetTaskName("核对生产任务").SetSourceType(source).SetSourceID(91).SetOwnerRoleKey("pmc").SetTaskStatusKey("ready").SetCreatedBy(7)
		if source == biz.WorkflowSourceTaskProductionOrderSourceType {
			task.SetTaskGroup(biz.WorkflowSourceTaskProductionSchedulingGroup).SetTaskCode(biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskProductionSchedulingGroup, 91)).SetPayload(map[string]any{"source_task_contract": biz.WorkflowSourceTaskContractV1, "source_task_producer": biz.WorkflowSourceTaskProductionOrderReleaseProducer, "production_order_id": 91})
		}
		task.SaveX(ctx)
	}
	q := trackingQuery(7, "started")
	q.SourceType = "production_order"
	page, err := repo.ListWorkflowTracking(ctx, q)
	if err != nil || len(page.Items) != 2 {
		t.Fatalf("type filter page=%#v err=%v", page, err)
	}
	q.SourceID = 91
	page, err = repo.ListWorkflowTracking(ctx, q)
	if err != nil || len(page.Items) != 1 || page.Items[0].Task.SourceType != q.SourceType {
		t.Fatalf("document filter page=%#v err=%v", page, err)
	}
}

func TestWorkflowTrackingProductSearchUsesSourceForExemptProcesses(t *testing.T) {
	client, repo, process, approval := trackingFixture(t)
	ctx := context.Background()
	customer := createSalesOrderTestCustomer(t, ctx, client, "FILTER-C", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "FILTER-U", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "FILTER-P", true)
	product.Update().SetName("新档案名称").SetStyleNo("STYLE-FILTER").SaveX(ctx)
	order := client.SalesOrder.Create().SetOrderNo("SO-FILTER").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SaveX(ctx)
	process.Update().SetBusinessRefID(order.ID + 1000).SaveX(ctx)
	approval.Update().SetSourceID(order.ID + 1000).SaveX(ctx)
	client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetProductID(product.ID).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(1)).SetProductNameSnapshot("单据上的小熊").SetProductCodeSnapshot("BEAR-FILTER").SaveX(ctx)
	exempt := client.ProcessInstance.Create().SetProcessKey(biz.ProcessKeySalesOrderAcceptance).SetProcessVersion("v1").SetConfigRevision("frozen").SetDefinitionHash("hash").SetBusinessRefType("sales_order").SetBusinessRefID(order.ID).SetIdempotencyKey("filter-exempt").SetStatus("completed").SetCompletedAt(process.StartedAt.Add(time.Hour)).SetCreatedBy(7).SetStartedAt(process.StartedAt.Add(time.Hour)).SaveX(ctx)
	for _, keyword := range []string{"单据上的小熊", "STYLE-FILTER", "BEAR-FILTER"} {
		q := trackingQuery(7, "started")
		q.Keyword, q.Status, q.Limit = keyword, "completed", 1
		page, err := repo.ListWorkflowTracking(ctx, q)
		if err != nil || len(page.Items) != 1 || page.Items[0].Ref.ID != exempt.ID || page.Total != 1 {
			t.Fatalf("keyword=%s page=%#v err=%v", keyword, page, err)
		}
	}
	q := trackingQuery(7, "started")
	q.Keyword = "新档案名称"
	page, err := repo.ListWorkflowTracking(ctx, q)
	if err != nil || len(page.Items) != 0 {
		t.Fatalf("snapshot search drift page=%#v err=%v", page, err)
	}
	q.Keyword, q.ActorID = "STYLE-FILTER", 99
	page, err = repo.ListWorkflowTracking(ctx, q)
	if err != nil || len(page.Items) != 0 {
		t.Fatalf("search broadened access page=%#v err=%v", page, err)
	}
}
