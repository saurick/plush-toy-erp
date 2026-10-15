package service

import (
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestWorkflowTrackingFilterContract(t *testing.T) {
	repo := &trackingJSONRPCRepo{entry: &biz.WorkflowTrackingEntry{Ref: biz.WorkflowTrackingRef{Kind: "process", ID: 1}, Instance: &biz.ProcessInstance{ID: 1, StartedAt: time.Now(), Status: "active"}}}
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard)), workflowUC: biz.NewWorkflowUsecase(repo), customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled")}
	d.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead)}
	for _, params := range []map[string]any{
		{"status": "done"}, {"status": true}, {"owner_role_key": "other"}, {"attention": "urgent"},
		{"date_from": "2026-02-30"}, {"date_from": 123}, {"date_to": "2026-10-09T10:00:00Z"},
		{"date_from": "2026-10-09", "date_to": "2026-10-08"}, {"actor_id": 99, "status": "active"},
	} {
		input, _ := structpb.NewStruct(params)
		_, result, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "list_tracking", "filter", input)
		if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
			t.Fatalf("params=%v result=%v err=%v", params, result, err)
		}
	}
	if repo.calls != 0 {
		t.Fatalf("invalid filters reached repository: %d", repo.calls)
	}
	input, _ := structpb.NewStruct(map[string]any{"scope": "participated", "limit": 8, "offset": 24, "source_type": "sales_order", "status": "active", "owner_role_key": "engineering", "attention": "overdue", "date_from": "2026-10-08", "date_to": "2026-10-08"})
	_, result, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "list_tracking", "filter", input)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("result=%v err=%v", result, err)
	}
	q := repo.query
	if q.ActorID != 7 || q.Limit != 8 || q.Offset != 24 || q.Scope != "participated" || q.SourceID != 0 || q.SourceType != "sales_order" || q.Status != "active" || q.OwnerRoleKey != "engineering" || q.Attention != "overdue" || q.SnapshotAt.IsZero() || q.VisibilityScope == nil {
		t.Fatalf("query=%#v", q)
	}
	if q.DateFrom == nil || q.DateTo == nil || q.DateFrom.UTC().Format(time.RFC3339) != "2026-10-07T16:00:00Z" || !q.DateTo.Equal(*q.DateFrom) {
		t.Fatalf("wrong business day: %#v", q)
	}
}
