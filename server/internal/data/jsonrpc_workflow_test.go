package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/errcode"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
	"google.golang.org/protobuf/types/known/structpb"
)

type stubWorkflowJSONRPCRepo struct {
	urgeInput        *biz.WorkflowTaskUrge
	urgeActorID      int
	urgeActorRoleKey string
	currentTask      *biz.WorkflowTask
}

func workflowJSONRPCAdmin(roleKeys []string, permissionKeys ...string) *biz.AdminUser {
	roles := make([]biz.AdminRole, 0, len(roleKeys))
	for _, roleKey := range roleKeys {
		roles = append(roles, biz.AdminRole{Key: biz.NormalizeRoleKey(roleKey)})
	}
	return &biz.AdminUser{
		ID:          7,
		Username:    "admin",
		Roles:       roles,
		Permissions: biz.NormalizePermissionKeys(permissionKeys),
	}
}

func workflowJSONRPCAdminContext() context.Context {
	return biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
}

func (s *stubWorkflowJSONRPCRepo) GetWorkflowTask(_ context.Context, id int) (*biz.WorkflowTask, error) {
	if s.currentTask != nil {
		return s.currentTask, nil
	}
	return &biz.WorkflowTask{
		ID:            id,
		TaskGroup:     "generic",
		SourceType:    "generic-source",
		SourceID:      1,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.SalesRoleKey,
		Payload:       map[string]any{},
	}, nil
}

func (s *stubWorkflowJSONRPCRepo) ListWorkflowTasks(context.Context, biz.WorkflowTaskFilter) ([]*biz.WorkflowTask, int, error) {
	return nil, 0, nil
}

func (s *stubWorkflowJSONRPCRepo) CreateWorkflowTask(_ context.Context, in *biz.WorkflowTaskCreate, _ int) (*biz.WorkflowTask, error) {
	return &biz.WorkflowTask{ID: 1, TaskStatusKey: in.TaskStatusKey, Payload: in.Payload}, nil
}

func (s *stubWorkflowJSONRPCRepo) UpdateWorkflowTaskStatus(_ context.Context, in *biz.WorkflowTaskStatusUpdate, _ int, _ string) (*biz.WorkflowTask, error) {
	return &biz.WorkflowTask{ID: in.ID, TaskStatusKey: in.TaskStatusKey, Payload: in.Payload}, nil
}

func (s *stubWorkflowJSONRPCRepo) UrgeWorkflowTask(_ context.Context, in *biz.WorkflowTaskUrge, actorID int, actorRoleKey string) (*biz.WorkflowTask, error) {
	s.urgeInput = in
	s.urgeActorID = actorID
	s.urgeActorRoleKey = actorRoleKey
	return &biz.WorkflowTask{
		ID:            in.ID,
		TaskCode:      "TASK-001",
		TaskGroup:     "shipment_release",
		TaskName:      "出货放行",
		SourceType:    "shipping-release",
		SourceID:      1,
		TaskStatusKey: "ready",
		OwnerRoleKey:  "warehouse",
		Payload: map[string]any{
			"urged":            true,
			"urge_count":       1,
			"last_urge_reason": in.Reason,
		},
	}, nil
}

func (s *stubWorkflowJSONRPCRepo) ListWorkflowBusinessStates(context.Context, biz.WorkflowBusinessStateFilter) ([]*biz.WorkflowBusinessState, int, error) {
	return nil, 0, nil
}

func (s *stubWorkflowJSONRPCRepo) UpsertWorkflowBusinessState(_ context.Context, in *biz.WorkflowBusinessStateUpsert, _ int) (*biz.WorkflowBusinessState, error) {
	return &biz.WorkflowBusinessState{ID: 1, BusinessStatusKey: in.BusinessStatusKey, Payload: in.Payload}, nil
}

func TestJsonrpcData_WorkflowUrgeTaskRecordsEventIntent(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionWorkflowTaskUpdate)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"task_id":        float64(1),
		"action":         "urge_task",
		"reason":         "请今天确认",
		"actor_role_key": "pmc",
		"payload": map[string]any{
			"source_no": "SHIP-001",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(ctx, "urge_task", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	if repo.urgeInput == nil {
		t.Fatalf("expected urge input")
	}
	if repo.urgeInput.ID != 1 || repo.urgeInput.Action != "urge_task" {
		t.Fatalf("unexpected urge input %#v", repo.urgeInput)
	}
	if repo.urgeInput.Reason != "请今天确认" {
		t.Fatalf("expected reason, got %q", repo.urgeInput.Reason)
	}
	if repo.urgeActorID != 7 || repo.urgeActorRoleKey != "pmc" {
		t.Fatalf("expected actor 7/pmc, got %d/%q", repo.urgeActorID, repo.urgeActorRoleKey)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "ready" {
		t.Fatalf("expected returned ready task, got %#v", data["task"])
	}
}

func TestJsonrpcData_WorkflowUrgeTaskRejectsUnrelatedOrdinaryRole(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            1,
			TaskGroup:     "warehouse_inbound",
			SourceType:    "accessories-purchase",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{},
		},
	}
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskUpdate)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	params, err := structpb.NewStruct(map[string]any{
		"task_id": float64(1),
		"action":  "urge_task",
		"reason":  "请今天确认",
		"payload": map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "urge_task", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", res)
	}
	if repo.urgeInput != nil {
		t.Fatalf("unrelated ordinary role must not record urge input")
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusRequiresActionPermission(t *testing.T) {
	tests := []struct {
		name        string
		admin       *biz.AdminUser
		currentTask *biz.WorkflowTask
		nextStatus  string
		wantCode    int32
	}{
		{
			name:        "done requires complete",
			admin:       workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskUpdate),
			currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "purchase_iqc", TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
			wantCode:    errcode.PermissionDenied.Code,
		},
		{
			name:        "rejected requires reject",
			admin:       workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskUpdate),
			currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "purchase_iqc", TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			nextStatus:  "rejected",
			wantCode:    errcode.PermissionDenied.Code,
		},
		{
			name:        "boss approval done requires approve",
			admin:       workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionWorkflowTaskComplete),
			currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "order_approval", SourceType: "project-orders", TaskStatusKey: "ready", OwnerRoleKey: biz.BossRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
			wantCode:    errcode.PermissionDenied.Code,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubWorkflowJSONRPCRepo{currentTask: tt.currentTask}
			j := &JsonrpcData{
				log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
				adminReader: stubAdminAccountReader{admin: tt.admin},
				workflowUC:  biz.NewWorkflowUsecase(repo),
			}
			params, err := structpb.NewStruct(map[string]any{
				"id":              float64(1),
				"task_status_key": tt.nextStatus,
				"payload":         map[string]any{},
			})
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != tt.wantCode {
				t.Fatalf("expected code %d, got %#v", tt.wantCode, res)
			}
		})
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusEnforcesOwnerRoleBoundary(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            1,
			TaskGroup:     "purchase_iqc",
			SourceType:    "accessories-purchase",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.QualityRoleKey,
			Payload:       map[string]any{},
		},
	}
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(1),
		"task_status_key": "done",
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied for mismatched owner role, got %#v", res)
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusAllowsOwnerRoles(t *testing.T) {
	tests := []struct {
		name        string
		roleKey     string
		permissions []string
		currentTask *biz.WorkflowTask
		nextStatus  string
	}{
		{
			name:        "quality completes purchase IQC",
			roleKey:     biz.QualityRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "purchase_iqc", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
		{
			name:        "quality completes outsource return QC",
			roleKey:     biz.QualityRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 2, TaskGroup: "outsource_return_qc", SourceType: "processing-contracts", SourceID: 2, TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
		{
			name:        "quality completes finished goods QC",
			roleKey:     biz.QualityRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 3, TaskGroup: "finished_goods_qc", SourceType: "production-progress", SourceID: 3, TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
		{
			name:        "warehouse completes warehouse inbound",
			roleKey:     biz.WarehouseRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 4, TaskGroup: "warehouse_inbound", SourceType: "accessories-purchase", SourceID: 4, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
		{
			name:        "warehouse completes finished goods inbound",
			roleKey:     biz.WarehouseRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 7, TaskGroup: "finished_goods_inbound", SourceType: "production-progress", SourceID: 7, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{"finished_goods": true}},
			nextStatus:  "done",
		},
		{
			name:        "warehouse completes shipment release",
			roleKey:     biz.WarehouseRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 9, TaskGroup: "shipment_release", SourceType: "shipping-release", SourceID: 9, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{"shipment_release": true}},
			nextStatus:  "done",
		},
		{
			name:        "boss approves order approval",
			roleKey:     biz.BossRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskApprove},
			currentTask: &biz.WorkflowTask{ID: 5, TaskGroup: "order_approval", SourceType: "project-orders", SourceID: 5, TaskStatusKey: "ready", OwnerRoleKey: biz.BossRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
		{
			name:        "production completes outsource rework",
			roleKey:     biz.ProductionRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 6, TaskGroup: "outsource_rework", SourceType: "processing-contracts", SourceID: 6, TaskStatusKey: "ready", OwnerRoleKey: biz.ProductionRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubWorkflowJSONRPCRepo{currentTask: tt.currentTask}
			j := &JsonrpcData{
				log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
				adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{tt.roleKey}, tt.permissions...)},
				workflowUC:  biz.NewWorkflowUsecase(repo),
			}
			params, err := structpb.NewStruct(map[string]any{
				"id":              float64(tt.currentTask.ID),
				"task_status_key": tt.nextStatus,
				"payload":         map[string]any{},
			})
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.OK.Code {
				t.Fatalf("expected OK response, got %#v", res)
			}
		})
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusRejectsNonWarehouseShipmentRelease(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            10,
			TaskGroup:     "shipment_release",
			SourceType:    "shipping-release",
			SourceID:      10,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{"shipment_release": true},
		},
	}
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(10),
		"task_status_key": "done",
		"actor_role_key":  biz.FinanceRoleKey,
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied for non-warehouse shipment release, got %#v", res)
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusAllowsSuperAdminShipmentRelease(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            11,
			TaskGroup:     "shipment_release",
			SourceType:    "shipping-release",
			SourceID:      11,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{"shipment_release": true},
		},
	}
	admin := workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskComplete)
	admin.IsSuperAdmin = true
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: admin},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(11),
		"task_status_key": "done",
		"actor_role_key":  biz.FinanceRoleKey,
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK for super admin shipment release, got %#v", res)
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusRejectsNonWarehouseFinishedGoodsInbound(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            8,
			TaskGroup:     "finished_goods_inbound",
			SourceType:    "production-progress",
			SourceID:      8,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{"finished_goods": true},
		},
	}
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(8),
		"task_status_key": "done",
		"actor_role_key":  biz.QualityRoleKey,
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied for non-warehouse finished goods inbound, got %#v", res)
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusDisabledAdminRejected(t *testing.T) {
	admin := workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)
	admin.Disabled = true
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "purchase_iqc", TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
	}
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: admin},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(1),
		"task_status_key": "done",
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.AdminDisabled.Code {
		t.Fatalf("expected disabled admin rejection, got %#v", res)
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusTriggersBossApprovalDerivation(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_derivation?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionWorkflowTaskApprove)},
		workflowUC:  workflowUC,
	}

	sourceNo := "PO-20260425-001"
	statusKey := "project_pending"
	approvalTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "ORDER-APPROVAL-RPC-001",
		TaskGroup:         "order_approval",
		TaskName:          "老板审批订单",
		SourceType:        "project-orders",
		SourceID:          88,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "boss",
		Payload: map[string]any{
			"record_title":  "企鹅抱枕",
			"customer_name": "成慧怡",
			"style_no":      "ST-001",
			"product_no":    "PRD-001",
			"product_name":  "企鹅抱枕",
			"due_date":      "2026-05-01",
		},
	}, 7)
	if err != nil {
		t.Fatalf("create approval task failed: %v", err)
	}

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":                  float64(approvalTask.ID),
		"task_status_key":     "done",
		"business_status_key": "project_approved",
		"actor_role_key":      "boss",
		"payload": map[string]any{
			"approval_result": "approved",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	downstreamCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("project-orders"),
			workflowtask.SourceID(88),
			workflowtask.TaskGroup("engineering_data"),
			workflowtask.OwnerRoleKey("engineering"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count downstream tasks failed: %v", err)
	}
	if downstreamCount != 1 {
		t.Fatalf("expected one engineering task after JSON-RPC update, got %d", downstreamCount)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("project-orders"), workflowbusinessstate.SourceID(88)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "project_approved" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "engineering" {
		t.Fatalf("unexpected business state %#v", state)
	}

	tasks, _, err := workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
		SourceType: "project-orders",
		SourceID:   88,
		Limit:      200,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	foundEngineering := false
	for _, task := range tasks {
		if task.TaskGroup == "engineering_data" && task.OwnerRoleKey == "engineering" {
			foundEngineering = true
			break
		}
	}
	if !foundEngineering {
		t.Fatalf("expected list_tasks refresh path to include derived engineering task")
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusTriggersPurchaseIQCDerivation(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_purchase_iqc?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  workflowUC,
	}

	sourceNo := "PUR-ARR-RPC-001"
	statusKey := "iqc_pending"
	iqcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "PURCHASE-IQC-RPC-001",
		TaskGroup:         "purchase_iqc",
		TaskName:          "IQC 来料检验",
		SourceType:        "accessories-purchase",
		SourceID:          166,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          2,
		Payload: map[string]any{
			"record_title":  "PP 棉到货",
			"supplier_name": "联调供应商",
			"material_name": "PP 棉",
		},
	}, 7)
	if err != nil {
		t.Fatalf("create IQC task failed: %v", err)
	}

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":                  float64(iqcTask.ID),
		"task_status_key":     "done",
		"business_status_key": "warehouse_inbound_pending",
		"actor_role_key":      "quality",
		"payload": map[string]any{
			"qc_result": "pass",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	downstreamCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("accessories-purchase"),
			workflowtask.SourceID(166),
			workflowtask.TaskGroup("warehouse_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count warehouse inbound tasks failed: %v", err)
	}
	if downstreamCount != 1 {
		t.Fatalf("expected one warehouse inbound task after JSON-RPC update, got %d", downstreamCount)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("accessories-purchase"), workflowbusinessstate.SourceID(166)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "warehouse_inbound_pending" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected IQC business state %#v", state)
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusTriggersWarehouseInboundBusinessState(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_warehouse_inbound?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  workflowUC,
	}

	sourceNo := "PUR-IN-RPC-001"
	statusKey := "warehouse_inbound_pending"
	warehouseTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "WAREHOUSE-INBOUND-RPC-001",
		TaskGroup:         "warehouse_inbound",
		TaskName:          "确认入库",
		SourceType:        "accessories-purchase",
		SourceID:          266,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          2,
		Payload: map[string]any{
			"record_title":  "PP 棉到货",
			"material_name": "PP 棉",
			"quantity":      float64(120),
			"unit":          "kg",
		},
	}, 7)
	if err != nil {
		t.Fatalf("create warehouse inbound task failed: %v", err)
	}

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":                  float64(warehouseTask.ID),
		"task_status_key":     "done",
		"business_status_key": "inbound_done",
		"actor_role_key":      "warehouse",
		"payload": map[string]any{
			"mobile_role_key": "warehouse",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("accessories-purchase"), workflowbusinessstate.SourceID(266)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "inbound_done" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected warehouse inbound business state %#v", state)
	}
	if state.Payload["inventory_balance_deferred"] != true ||
		state.Payload["inbound_result"] != "done" {
		t.Fatalf("expected deferred inventory inbound payload, got %#v", state.Payload)
	}

	taskCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("accessories-purchase"), workflowtask.SourceID(266)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("warehouse inbound JSON-RPC update must not create downstream tasks, got %d tasks", taskCount)
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusTriggersOutsourceReturnQCDerivation(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_outsource_return_qc?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  workflowUC,
	}

	sourceNo := "OUT-RET-RPC-001"
	statusKey := "qc_pending"
	qcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "OUTSOURCE-RETURN-QC-RPC-001",
		TaskGroup:         "outsource_return_qc",
		TaskName:          "委外回货检验",
		SourceType:        "processing-contracts",
		SourceID:          366,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          2,
		Payload: map[string]any{
			"record_title":         "兔子挂件委外车缝",
			"supplier_name":        "联调加工厂",
			"product_name":         "兔子挂件",
			"quantity":             float64(300),
			"unit":                 "pcs",
			"qc_type":              "outsource_return",
			"outsource_processing": true,
		},
	}, 7)
	if err != nil {
		t.Fatalf("create outsource return QC task failed: %v", err)
	}

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":                  float64(qcTask.ID),
		"task_status_key":     "done",
		"business_status_key": "warehouse_inbound_pending",
		"actor_role_key":      "quality",
		"payload": map[string]any{
			"qc_result": "pass",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	downstreamCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("processing-contracts"),
			workflowtask.SourceID(366),
			workflowtask.TaskGroup("outsource_warehouse_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count outsource warehouse inbound tasks failed: %v", err)
	}
	if downstreamCount != 1 {
		t.Fatalf("expected one outsource warehouse inbound task after JSON-RPC update, got %d", downstreamCount)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("processing-contracts"), workflowbusinessstate.SourceID(366)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "warehouse_inbound_pending" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected outsource QC business state %#v", state)
	}

	tasks, _, err := workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
		SourceType: "processing-contracts",
		SourceID:   366,
		Limit:      200,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	foundWarehouseInbound := false
	for _, task := range tasks {
		if task.TaskGroup == "outsource_warehouse_inbound" && task.OwnerRoleKey == "warehouse" {
			foundWarehouseInbound = true
			break
		}
	}
	if !foundWarehouseInbound {
		t.Fatalf("expected list_tasks refresh path to include derived outsource warehouse inbound task")
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusTriggersFinishedGoodsQCDerivation(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_finished_goods_qc?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  workflowUC,
	}
	qcTask := createFinishedGoodsQCTask(t, ctx, repo, 466)

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":                  float64(qcTask.ID),
		"task_status_key":     "done",
		"business_status_key": "warehouse_inbound_pending",
		"actor_role_key":      "quality",
		"payload": map[string]any{
			"qc_result": "pass",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	downstreamCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(466),
			workflowtask.TaskGroup("finished_goods_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count finished goods inbound tasks failed: %v", err)
	}
	if downstreamCount != 1 {
		t.Fatalf("expected one finished goods inbound task after JSON-RPC update, got %d", downstreamCount)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(466)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "warehouse_inbound_pending" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods QC business state %#v", state)
	}

	tasks, _, err := workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
		SourceType: "production-progress",
		SourceID:   466,
		Limit:      200,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	foundFinishedGoodsInbound := false
	for _, task := range tasks {
		if task.TaskGroup == "finished_goods_inbound" && task.OwnerRoleKey == "warehouse" {
			foundFinishedGoodsInbound = true
			break
		}
	}
	if !foundFinishedGoodsInbound {
		t.Fatalf("expected list_tasks refresh path to include derived finished goods inbound task")
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusTriggersFinishedGoodsInboundBusinessState(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_finished_goods_inbound?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  workflowUC,
	}
	inboundTask := createFinishedGoodsInboundTask(t, ctx, repo, 566, map[string]any{})

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(inboundTask.ID),
		"task_status_key": "done",
		"actor_role_key":  "warehouse",
		"payload": map[string]any{
			"mobile_role_key": "warehouse",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(566)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query finished goods inbound business state failed: %v", err)
	}
	if state.BusinessStatusKey != "inbound_done" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods inbound business state %#v", state)
	}
	if state.Payload["inventory_balance_deferred"] != true ||
		state.Payload["shipment_release_deferred"] != true ||
		state.Payload["decision"] != "done" {
		t.Fatalf("expected deferred inbound_done payload, got %#v", state.Payload)
	}

	taskCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("production-progress"), workflowtask.SourceID(566)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("finished goods inbound JSON-RPC update must not create downstream tasks, got %d tasks", taskCount)
	}
	shipmentCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(566),
			workflowtask.TaskGroup("shipment_release"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count shipment release tasks failed: %v", err)
	}
	if shipmentCount != 0 {
		t.Fatalf("finished goods inbound JSON-RPC update must not derive shipment release, got %d", shipmentCount)
	}

	tasks, _, err := workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
		SourceType: "production-progress",
		SourceID:   566,
		Limit:      200,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	for _, task := range tasks {
		if task.TaskGroup == "shipment_release" {
			t.Fatalf("list_tasks refresh path must not include shipment release after finished goods inbound done")
		}
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusTriggersShipmentReleaseBusinessState(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_shipment_release?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  workflowUC,
	}
	shipmentTask := createShipmentReleaseTask(t, ctx, repo, 666, map[string]any{})

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(shipmentTask.ID),
		"task_status_key": "done",
		"actor_role_key":  "warehouse",
		"payload": map[string]any{
			"mobile_role_key": "warehouse",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("shipping-release"), workflowbusinessstate.SourceID(666)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query shipment release business state failed: %v", err)
	}
	if state.BusinessStatusKey != "shipping_released" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected shipment release business state %#v", state)
	}
	if state.Payload["inventory_out_deferred"] != true ||
		state.Payload["receivable_deferred"] != true ||
		state.Payload["invoice_deferred"] != true ||
		state.Payload["decision"] != "done" {
		t.Fatalf("expected deferred shipping_released payload, got %#v", state.Payload)
	}

	taskCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("shipping-release"), workflowtask.SourceID(666)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("shipment release JSON-RPC update must not create downstream tasks, got %d tasks", taskCount)
	}
	receivableCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("shipping-release"),
			workflowtask.SourceID(666),
			workflowtask.TaskGroup("receivable_registration"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count receivable tasks failed: %v", err)
	}
	if receivableCount != 0 {
		t.Fatalf("shipment release JSON-RPC update must not derive receivable task, got %d", receivableCount)
	}

	tasks, _, err := workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
		SourceType: "shipping-release",
		SourceID:   666,
		Limit:      200,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	for _, task := range tasks {
		if task.TaskGroup == "receivable_registration" || task.TaskGroup == "invoice_registration" {
			t.Fatalf("list_tasks refresh path must not include finance task after shipment release done")
		}
	}
}

func TestJsonrpcData_WorkflowUpdateTaskStatusKeepsAdminBoundary(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(1),
		"task_status_key": "done",
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, unauthRes, err := j.handleWorkflow(context.Background(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if unauthRes == nil || unauthRes.Code != errcode.AuthRequired.Code {
		t.Fatalf("expected auth required, got %#v", unauthRes)
	}

	userCtx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   8,
		Username: "user",
		Role:     biz.RoleUser,
	})
	_, userRes, err := j.handleWorkflow(userCtx, "update_task_status", "2", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if userRes == nil || userRes.Code != errcode.AdminRequired.Code {
		t.Fatalf("expected admin required for non-admin role, got %#v", userRes)
	}
}
