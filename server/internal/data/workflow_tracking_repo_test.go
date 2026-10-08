package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/attachmentstore"
)

func trackingFixture(t *testing.T) (*ent.Client, biz.WorkflowTrackingReader, *ent.ProcessInstance, *ent.WorkflowTask) {
	t.Helper()
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:"+t.Name()+"?mode=memory&cache=shared&_fk=1")
	t.Cleanup(func() { mustCloseEntClient(t, client) })
	now := time.Date(2026, 10, 7, 10, 0, 0, 0, time.UTC)
	p := client.ProcessInstance.Create().SetProcessKey(biz.ProcessKeySalesOrderAcceptance).SetProcessVersion("v1").SetConfigRevision("frozen").SetDefinitionHash("hash").SetBusinessRefType("sales_order").SetBusinessRefID(1).SetBusinessRefNo("SO-TRACK").SetIdempotencyKey("tracking").SetCreatedBy(7).SetStartedAt(now).SaveX(ctx)
	node := client.ProcessNodeInstance.Create().SetProcessInstanceID(p.ID).SetNodeKey("approval").SetNodeType(biz.ProcessNodeTypeApproval).SetStatus(biz.ProcessNodeStatusActive).SetStartedAt(now).SaveX(ctx)
	task := client.WorkflowTask.Create().SetTaskCode("TRACK-APPROVAL").SetTaskGroup("order_approval").SetTaskName("订单审批").SetSourceType("sales_order").SetSourceID(1).SetConfigRevision("frozen").SetProcessInstanceID(p.ID).SetProcessNodeInstanceID(node.ID).SetOwnerRoleKey("boss").SetTaskStatusKey("ready").SetCreatedBy(7).SetCreatedAt(now).SetPayload(map[string]any{"amount": "private"}).SaveX(ctx)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	return client, repo, p, task
}

func trackingQuery(actor int, view string) biz.WorkflowTrackingQuery {
	return biz.WorkflowTrackingQuery{ActorID: actor, Scope: view, Limit: 20, VisibilityScope: &biz.WorkflowTaskVisibilityScope{}}
}

func TestWorkflowTrackingSourceIdentityWithoutTaskAndAfterSourceChanges(t *testing.T) {
	client, repo, process, originalTask := trackingFixture(t)
	ctx := context.Background()
	customer := createSalesOrderTestCustomer(t, ctx, client, "TRACK-C", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "TRACK-U", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "TRACK-P", true)
	product.Update().SetStyleNo("TRACK-STYLE").SaveX(ctx)
	other := createSalesOrderTestProduct(t, ctx, client, unit.ID, "TRACK-OTHER", true)
	order := client.SalesOrder.Create().SetOrderNo("SO-IDENTITY").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SaveX(ctx)
	process.Update().SetBusinessRefID(order.ID + 1000).SaveX(ctx)
	originalTask.Update().SetSourceID(order.ID + 1000).SaveX(ctx)
	line := client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetProductID(product.ID).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(2)).SetProductNameSnapshot("订单时的小熊").SetProductCodeSnapshot("ORDER-BEAR").SaveX(ctx)
	client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(2).SetProductID(other.ID).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(1)).SaveX(ctx)
	primary := client.BusinessAttachment.Create().SetOwnerType("product").SetOwnerID(product.ID).SetAttachmentType("product_image").SetSlotKey("primary").SetFileName("bear.png").SetMimeType("image/png").SetFileSize(1).SetSha256("4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a").SetObjectKey(attachmentstore.NewKey()).SaveX(ctx)
	exempt := client.ProcessInstance.Create().SetProcessKey(biz.ProcessKeySalesOrderAcceptance).SetProcessVersion("v1").SetConfigRevision("frozen").SetDefinitionHash("hash").SetBusinessRefType("sales_order").SetBusinessRefID(order.ID).SetBusinessRefNo("SO-OLD").SetIdempotencyKey("identity-exempt").SetStatus("completed").SetCompletedAt(process.StartedAt).SetCreatedBy(7).SaveX(ctx)
	ref := biz.WorkflowTrackingRef{Kind: "process", ID: exempt.ID}
	q := trackingQuery(7, "started")
	read := func() *biz.WorkflowTaskDisplayContext {
		t.Helper()
		entry, err := repo.GetWorkflowTracking(ctx, q, ref, 0)
		if err != nil || len(entry.Tasks) != 0 || entry.DisplayContext == nil {
			t.Fatalf("entry=%#v err=%v", entry, err)
		}
		return entry.DisplayContext
	}
	got := read()
	if !got.Available || got.SourceNo != order.OrderNo || len(got.Items) != 2 || got.Items[0].Name != "订单时的小熊" || got.Items[0].Code != "ORDER-BEAR" || got.Items[0].StyleNo != "TRACK-STYLE" || got.Items[0].ImageAttachmentID != primary.ID {
		t.Fatalf("source identity=%#v", got)
	}
	page, err := repo.ListWorkflowTracking(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, item := range page.Items {
		if item.Ref == ref {
			found = item.DisplayContext != nil && item.DisplayContext.SourceNo == order.OrderNo && len(item.DisplayContext.Items) == 2
		}
	}
	if !found {
		t.Fatal("list did not use the source projection")
	}
	client.BusinessAttachment.DeleteOne(primary).ExecX(ctx)
	product.Update().ClearStyleNo().SaveX(ctx)
	if got = read(); got.Items[0].ImageAttachmentID != 0 || got.Items[0].StyleNo != "" {
		t.Fatalf("cleared image or style remained: %#v", got.Items[0])
	}
	line.Update().SetProductID(other.ID).ClearProductNameSnapshot().ClearProductCodeSnapshot().SaveX(ctx)
	if got = read(); len(got.Items) != 1 || got.Items[0].ProductID != other.ID || got.Items[0].ImageAttachmentID != 0 {
		t.Fatalf("replaced product retained old identity: %#v", got)
	}
	exempt.Update().SetBusinessRefID(order.ID + 100).SaveX(ctx)
	if got = read(); got.Available || len(got.Items) != 0 {
		t.Fatalf("missing source retained identity: %#v", got)
	}
	unbound := client.WorkflowTask.Create().SetTaskCode("TRACK-UNBOUND").SetTaskName("普通跟进").SetTaskGroup(biz.WorkflowFollowupTaskGroup).SetSourceType("sales_order").SetSourceID(order.ID).SetOwnerRoleKey("sales").SetTaskStatusKey("ready").SetCreatedBy(7).SaveX(ctx)
	entry, err := repo.GetWorkflowTracking(ctx, q, biz.WorkflowTrackingRef{Kind: "task", ID: unbound.ID}, 0)
	if err != nil || entry.DisplayContext != nil {
		t.Fatalf("unbound task must not gain source identity: %#v err=%v", entry, err)
	}
}

func TestWorkflowTrackingInitiatorParticipantAndFrozenVisibility(t *testing.T) {
	client, repo, process, task := trackingFixture(t)
	ctx := context.Background()
	client.WorkflowTaskEvent.Create().SetTaskID(task.ID).SetEventType("created").SetActorID(9).SaveX(ctx)
	client.WorkflowTaskEvent.Create().SetTaskID(task.ID).SetEventType("status_changed").SetActorID(8).SetActorRoleKey("boss").SetToStatusKey("done").SaveX(ctx)
	ref := biz.WorkflowTrackingRef{Kind: "process", ID: process.ID}
	for _, test := range []struct {
		name    string
		q       biz.WorkflowTrackingQuery
		allowed bool
	}{
		{"initiator after handoff", trackingQuery(7, "visible"), true},
		{"actual participant", trackingQuery(8, "visible"), true},
		{"creation event is not participation", trackingQuery(9, "participated"), false},
		{"unrelated user", trackingQuery(10, "visible"), false},
		{"responsible frozen role", biz.WorkflowTrackingQuery{ActorID: 10, Scope: "visible", Limit: 20, VisibilityScope: &biz.WorkflowTaskVisibilityScope{RevisionRoleScopes: []biz.WorkflowTaskRevisionRoleScope{{ConfigRevision: "frozen", Status: "active", VisibleOwnerRoleKeys: []string{"boss"}}}}}, true},
		{"role from other revision", biz.WorkflowTrackingQuery{ActorID: 10, Scope: "visible", Limit: 20, VisibilityScope: &biz.WorkflowTaskVisibilityScope{RevisionRoleScopes: []biz.WorkflowTaskRevisionRoleScope{{ConfigRevision: "other", Status: "active", VisibleOwnerRoleKeys: []string{"boss"}}}}}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			page, err := repo.ListWorkflowTracking(ctx, test.q)
			if err != nil || (len(page.Items) == 1) != test.allowed || page.Total != len(page.Items) {
				t.Fatalf("page=%#v err=%v", page, err)
			}
			_, err = repo.GetWorkflowTracking(ctx, test.q, ref, 0)
			if test.allowed && err != nil || !test.allowed && !errors.Is(err, biz.ErrForbidden) {
				t.Fatalf("get err=%v", err)
			}
		})
	}
	if client.WorkflowTask.Query().CountX(ctx) != 1 || client.WorkflowTaskEvent.Query().CountX(ctx) != 2 {
		t.Fatal("tracking read wrote business state")
	}
}

func TestWorkflowTrackingExemptProcessRemainsTrackableWithoutTasks(t *testing.T) {
	client, repo, process, _ := trackingFixture(t)
	ctx := context.Background()
	exempt := client.ProcessInstance.Create().SetProcessKey(biz.ProcessKeySalesOrderAcceptance).SetProcessVersion("v1").SetConfigRevision("frozen").SetDefinitionHash("hash").SetBusinessRefType("sales_order").SetBusinessRefID(2).SetBusinessRefNo("SO-EXEMPT").SetIdempotencyKey("exempt").SetStatus("completed").SetCompletedAt(process.StartedAt).SetCreatedBy(7).SaveX(ctx)
	q := trackingQuery(7, "started")
	entry, err := repo.GetWorkflowTracking(ctx, q, biz.WorkflowTrackingRef{Kind: "process", ID: exempt.ID}, 0)
	if err != nil || len(entry.Tasks) != 0 || entry.Instance.Status != "completed" {
		t.Fatalf("entry=%#v err=%v", entry, err)
	}
	q = trackingQuery(11, "visible")
	q.VisibilityScope.RevisionRoleScopes = []biz.WorkflowTaskRevisionRoleScope{{ConfigRevision: "frozen", Status: "active", AllowAllOwnerRoles: true}}
	if _, err = repo.GetWorkflowTracking(ctx, q, biz.WorkflowTrackingRef{Kind: "process", ID: exempt.ID}, 0); err != nil {
		t.Fatal(err)
	}
	q.VisibilityScope.RevisionRoleScopes[0].ConfigRevision = "other"
	if _, err = repo.GetWorkflowTracking(ctx, q, biz.WorkflowTrackingRef{Kind: "process", ID: exempt.ID}, 0); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("unexpected supervisor revision access: %v", err)
	}
}

func TestWorkflowTrackingMergedPagination(t *testing.T) {
	client, repo, process, _ := trackingFixture(t)
	ctx := context.Background()
	expected := []biz.WorkflowTrackingRef{{Kind: "process", ID: process.ID}}
	for i := 0; i < 3; i++ {
		task := client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("FOLLOW-%d", i)).SetTaskGroup(biz.WorkflowFollowupTaskGroup).SetTaskName("跟进").SetSourceType("sales_order").SetSourceID(1).SetOwnerRoleKey("sales").SetTaskStatusKey("done").SetCreatedBy(7).SetCreatedAt(process.StartedAt).SaveX(ctx)
		expected = append([]biz.WorkflowTrackingRef{{Kind: "task", ID: task.ID}}, expected...)
	}
	newer := client.ProcessInstance.Create().SetProcessKey(biz.ProcessKeySalesOrderAcceptance).SetProcessVersion("v1").SetConfigRevision("frozen").SetDefinitionHash("hash").SetBusinessRefType("sales_order").SetBusinessRefID(2).SetIdempotencyKey("newer").SetCreatedBy(7).SetStartedAt(process.StartedAt.Add(time.Hour)).SaveX(ctx)
	expected = append([]biz.WorkflowTrackingRef{{Kind: "process", ID: newer.ID}}, expected...)
	q := trackingQuery(7, "started")
	// Direct jumps, repeated reads, a partial last page and an empty page must
	// share the filtered total and the same timestamp/kind/ID ordering.
	for _, limit := range []int{1, 2, 20} {
		q.Limit = limit
		for _, offset := range []int{3, 0, 1, 4, 1, 5, 100} {
			q.Offset = offset
			page, err := repo.ListWorkflowTracking(ctx, q)
			want := 0
			if offset < len(expected) {
				want = min(limit, len(expected)-offset)
			}
			if err != nil || len(page.Items) != want || page.Total != len(expected) {
				t.Fatalf("limit=%d offset=%d page=%#v err=%v", limit, offset, page, err)
			}
			for i, entry := range page.Items {
				if entry.Ref != expected[offset+i] {
					t.Fatalf("limit=%d offset=%d position=%d got=%#v want=%#v", limit, offset, i, entry.Ref, expected[offset+i])
				}
			}
		}
	}
	q.Offset, q.Limit, q.Keyword = 1, 1, "跟进"
	page, err := repo.ListWorkflowTracking(ctx, q)
	if err != nil || page.Total != 3 || len(page.Items) != 1 || page.Items[0].Ref != expected[2] {
		t.Fatalf("filtered page=%#v err=%v", page, err)
	}
	q.ActorID = 99
	page, err = repo.ListWorkflowTracking(ctx, q)
	if err != nil || page.Total != 0 || len(page.Items) != 0 {
		t.Fatalf("total leaked another actor's records: page=%#v err=%v", page, err)
	}
}

func TestWorkflowTrackingEventsAreBoundedAndExcludeReceiptPayload(t *testing.T) {
	client, repo, process, task := trackingFixture(t)
	ctx := context.Background()
	for i := 0; i < 103; i++ {
		client.WorkflowTaskEvent.Create().SetTaskID(task.ID).SetEventType("urge_role").SetActorID(8).SetPayload(map[string]any{"bank_account": "private"}).SaveX(ctx)
	}
	ref, q := biz.WorkflowTrackingRef{Kind: "process", ID: process.ID}, trackingQuery(7, "visible")
	entry, err := repo.GetWorkflowTracking(ctx, q, ref, 0)
	if err != nil || !entry.EventsTruncated || len(entry.Events) != 100 {
		t.Fatalf("entry=%#v err=%v", entry, err)
	}
	for _, event := range entry.Events {
		if len(event.Payload) != 0 || event.ActorDisplayName != "人员信息未记录" {
			t.Fatalf("unsafe or invented event actor: %#v", event)
		}
	}
	older, err := repo.GetWorkflowTracking(ctx, q, ref, entry.Events[99].ID)
	if err != nil || older.EventsTruncated || len(older.Events) != 3 || older.Events[0].ID >= entry.Events[99].ID {
		t.Fatalf("older=%#v err=%v", older, err)
	}
}

func TestWorkflowTrackingRejectsMismatchedTaskAnchor(t *testing.T) {
	client, repo, process, task := trackingFixture(t)
	client.WorkflowTask.UpdateOneID(task.ID).SetConfigRevision("wrong-revision").SaveX(context.Background())
	_, err := repo.GetWorkflowTracking(context.Background(), trackingQuery(7, "visible"), biz.WorkflowTrackingRef{Kind: "process", ID: process.ID}, 0)
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("mismatched task anchor accepted: %v", err)
	}
}
