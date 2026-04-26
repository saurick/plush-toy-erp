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

func (s *stubWorkflowJSONRPCRepo) GetWorkflowTask(_ context.Context, id int) (*biz.WorkflowTask, error) {
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
