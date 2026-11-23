package service

import (
	"context"
	"server/internal/biz"
	"server/internal/errcode"
	"testing"
)

type workflowExceptionJSONRPCRepo struct {
	stubWorkflowJSONRPCRepo
	calls int
	query biz.WorkflowExceptionQuery
}

func (r *workflowExceptionJSONRPCRepo) ListWorkflowExceptions(_ context.Context, q biz.WorkflowExceptionQuery) (*biz.WorkflowExceptionBoard, error) {
	r.calls++
	r.query = q
	item := biz.WorkflowExceptionItem{Key: "quality:1", Number: "QI-1", State: "open", TaskIDs: []int{8}, Tasks: []*biz.WorkflowTask{{ID: 8, TaskName: "裁片质检", TaskStatusKey: "ready", OwnerRoleKey: "quality", Discovery: biz.WorkflowTaskDiscoveryFor("cutting_quality", "检验员")}}, Orders: []biz.WorkflowExceptionOrder{{ID: 2, Number: "SO-2"}}}
	if q.IncludeQualityPhotoSources {
		item.QualityPhotoSources = []biz.WorkflowExceptionQualityPhotoSource{{ID: 1, Number: "QI-1"}}
	}
	return &biz.WorkflowExceptionBoard{Total: 1, Open: 1, PendingPlan: 1, PendingTasks: 1, AffectedOrders: 1, Limit: q.Limit, Items: []biz.WorkflowExceptionItem{item}}, nil
}

func TestWorkflowExceptionQueryPermissionValidationAndSerialization(t *testing.T) {
	for _, allowed := range []bool{false, true} {
		admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey})
		if allowed {
			admin = workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead)
		}
		d, _ := workflowWorkbenchTestDispatcher(admin, nil)
		repo := &workflowExceptionJSONRPCRepo{}
		d.workflowUC = biz.NewWorkflowUsecase(repo)
		_, res, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "list_exceptions", "exceptions", mustJSONRPCStruct(t, map[string]any{"stage_key": "cutting_quality", "limit": 20}))
		if !allowed {
			if err != nil || res.Code != errcode.PermissionDenied.Code || repo.calls != 0 {
				t.Fatalf("permission=%v %v", res, err)
			}
			continue
		}
		if err != nil || res.Code != errcode.OK.Code || res.Data == nil || repo.query.Visibility == nil || repo.query.Visibility.StandaloneAllowAllOwnerRoles || repo.query.StageKey != "cutting_quality" {
			t.Fatalf("result=%v err=%v query=%+v", res, err, repo.query)
		}
		item := res.Data.AsMap()["items"].([]any)[0].(map[string]any)
		if repo.query.IncludeQualityPhotoSources || len(item["quality_photo_sources"].([]any)) != 0 || res.Data.AsMap()["pending_plan"] != float64(1) {
			t.Fatal("workflow-only access must expose the stage count without disclosing inspection photos")
		}
		task := item["tasks"].([]any)[0].(map[string]any)
		if task["discovery"].(map[string]any)["assignee_name"] != "检验员" || len(item["orders"].([]any)) != 1 {
			t.Fatal("lost task/people/order read projection")
		}
		if _, exists := task["payload"]; exists {
			t.Fatal("exception summary leaked payload")
		}
		for _, params := range []map[string]any{{"limit": 0}, {"offset": -1}, {"limit": 101}, {"assignee": "1.2"}, {"stage_key": "invented"}, {"state": "done"}, {"view": "invented"}, {"warehouse_ids": []any{1}}, {"tracking_kind": "process"}, {"tracking_id": 8}, {"tracking_kind": "order", "tracking_id": 8}, {"tracking_kind": "task", "tracking_id": "8"}, {"tracking_kind": "task", "tracking_id": 1.5}, {"tracking_kind": "process", "tracking_id": 0}, {"tracking_kind": nil, "tracking_id": nil}} {
			_, res, err = d.handleWorkflow(workflowJSONRPCAdminContext(), "list_exceptions", "exceptions", mustJSONRPCStruct(t, params))
			if err != nil || res.Code != errcode.InvalidParam.Code || repo.calls != 1 {
				t.Fatalf("invalid filter=%v result=%v err=%v", params, res, err)
			}
		}
		for _, kind := range []string{"process", "task"} {
			_, res, err = d.handleWorkflow(workflowJSONRPCAdminContext(), "list_exceptions", "exceptions", mustJSONRPCStruct(t, map[string]any{"tracking_kind": kind, "tracking_id": 8}))
			if err != nil || res.Code != errcode.OK.Code || repo.query.TrackingRef == nil || *repo.query.TrackingRef != (biz.WorkflowTrackingRef{Kind: kind, ID: 8}) || repo.query.Visibility == nil || repo.query.Visibility.StandaloneAllowAllOwnerRoles {
				t.Fatalf("tracking scope lost identity or expanded permission: %v %v %+v", res, err, repo.query)
			}
		}
	}
}

func TestWorkflowExceptionQualityPhotosUseInspectionPermission(t *testing.T) {
	admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionQualityInspectionRead)
	d, _ := workflowWorkbenchTestDispatcher(admin, nil)
	repo := &workflowExceptionJSONRPCRepo{}
	d.workflowUC = biz.NewWorkflowUsecase(repo)
	_, res, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "list_exceptions", "exceptions", mustJSONRPCStruct(t, map[string]any{"state": biz.WorkflowExceptionFilterPendingPlan}))
	if err != nil || res.Code != errcode.OK.Code || repo.query.State != biz.WorkflowExceptionFilterPendingPlan || !repo.query.IncludeQualityPhotoSources {
		t.Fatalf("result=%v err=%v query=%+v", res, err, repo.query)
	}
	item := res.Data.AsMap()["items"].([]any)[0].(map[string]any)
	sources := item["quality_photo_sources"].([]any)
	if len(sources) != 1 || sources[0].(map[string]any)["id"] != float64(1) {
		t.Fatalf("unexpected quality photo sources: %v", sources)
	}
}
