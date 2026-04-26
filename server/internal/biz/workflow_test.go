package biz

import (
	"context"
	"errors"
	"strconv"
	"testing"
)

type stubWorkflowRepo struct {
	createTaskInput  *WorkflowTaskCreate
	updateTaskInput  *WorkflowTaskStatusUpdate
	urgeTaskInput    *WorkflowTaskUrge
	upsertStateInput *WorkflowBusinessStateUpsert
	currentTask      *WorkflowTask
	getTaskCalled    bool
	listTaskCalled   bool
	derivedTaskCount int
	derivedTaskKeys  map[string]struct{}
}

func (s *stubWorkflowRepo) GetWorkflowTask(_ context.Context, id int) (*WorkflowTask, error) {
	s.getTaskCalled = true
	if s.currentTask != nil {
		return s.currentTask, nil
	}
	return &WorkflowTask{
		ID:            id,
		TaskGroup:     "generic",
		TaskName:      "普通任务",
		SourceType:    "generic-source",
		SourceID:      1,
		TaskStatusKey: "ready",
		OwnerRoleKey:  SalesRoleKey,
		Payload:       map[string]any{},
	}, nil
}

func (s *stubWorkflowRepo) ListWorkflowTasks(context.Context, WorkflowTaskFilter) ([]*WorkflowTask, int, error) {
	s.listTaskCalled = true
	return nil, 0, nil
}

func (s *stubWorkflowRepo) CreateWorkflowTask(_ context.Context, in *WorkflowTaskCreate, _ int) (*WorkflowTask, error) {
	s.createTaskInput = in
	return &WorkflowTask{
		TaskCode:      in.TaskCode,
		TaskStatusKey: in.TaskStatusKey,
		Payload:       in.Payload,
	}, nil
}

func (s *stubWorkflowRepo) UpdateWorkflowTaskStatus(_ context.Context, in *WorkflowTaskStatusUpdate, _ int, _ string) (*WorkflowTask, error) {
	s.updateTaskInput = in
	if in.SideEffects != nil && in.SideEffects.DerivedTask != nil {
		key := in.SideEffects.DerivedTask.SourceType + "|" + strconv.Itoa(in.SideEffects.DerivedTask.SourceID) + "|" + in.SideEffects.DerivedTask.TaskGroup + "|" + in.SideEffects.DerivedTask.OwnerRoleKey
		if s.derivedTaskKeys == nil {
			s.derivedTaskKeys = map[string]struct{}{}
		}
		if _, ok := s.derivedTaskKeys[key]; !ok {
			s.derivedTaskKeys[key] = struct{}{}
			s.derivedTaskCount++
		}
	}
	return &WorkflowTask{
		ID:                in.ID,
		TaskStatusKey:     in.TaskStatusKey,
		BusinessStatusKey: &in.BusinessStatusKey,
		Payload:           in.Payload,
	}, nil
}

func (s *stubWorkflowRepo) UrgeWorkflowTask(_ context.Context, in *WorkflowTaskUrge, _ int, _ string) (*WorkflowTask, error) {
	s.urgeTaskInput = in
	return &WorkflowTask{
		ID:            in.ID,
		TaskStatusKey: "ready",
		Payload:       in.Payload,
	}, nil
}

func (s *stubWorkflowRepo) ListWorkflowBusinessStates(context.Context, WorkflowBusinessStateFilter) ([]*WorkflowBusinessState, int, error) {
	return nil, 0, nil
}

func (s *stubWorkflowRepo) UpsertWorkflowBusinessState(_ context.Context, in *WorkflowBusinessStateUpsert, _ int) (*WorkflowBusinessState, error) {
	s.upsertStateInput = in
	return &WorkflowBusinessState{
		SourceType:        in.SourceType,
		SourceID:          in.SourceID,
		BusinessStatusKey: in.BusinessStatusKey,
		Payload:           in.Payload,
	}, nil
}

func TestWorkflowUsecase_CreateTaskDefaultsPending(t *testing.T) {
	repo := &stubWorkflowRepo{}
	uc := NewWorkflowUsecase(repo)

	task, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
		TaskCode:     "T-001",
		TaskGroup:    "order",
		TaskName:     "确认资料",
		SourceType:   "project_order",
		SourceID:     1,
		OwnerRoleKey: SalesRoleKey,
	}, 7)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if task.TaskStatusKey != "pending" {
		t.Fatalf("expected pending, got %q", task.TaskStatusKey)
	}
	if repo.createTaskInput == nil {
		t.Fatalf("expected repo input")
	}
	if repo.createTaskInput.Payload == nil {
		t.Fatalf("expected payload default to empty map")
	}
}

func TestWorkflowUsecase_CreateTaskRejectsInvalidBusinessStatus(t *testing.T) {
	invalid := "unknown"
	uc := NewWorkflowUsecase(&stubWorkflowRepo{})

	_, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
		TaskCode:          "T-001",
		TaskGroup:         "order",
		TaskName:          "确认资料",
		SourceType:        "project_order",
		SourceID:          1,
		OwnerRoleKey:      SalesRoleKey,
		BusinessStatusKey: &invalid,
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
}

func TestWorkflowBusinessStatesAcceptPurchaseInboundStatuses(t *testing.T) {
	expectedStatuses := map[string]struct{}{
		"iqc_pending":               {},
		"qc_failed":                 {},
		"warehouse_inbound_pending": {},
		"inbound_done":              {},
	}

	states := WorkflowBusinessStates()
	stateKeys := make(map[string]struct{}, len(states))
	for _, state := range states {
		stateKeys[state.Key] = struct{}{}
	}

	for statusKey := range expectedStatuses {
		if !IsValidWorkflowBusinessState(statusKey) {
			t.Fatalf("expected %q to be valid", statusKey)
		}
		if _, ok := stateKeys[statusKey]; !ok {
			t.Fatalf("expected WorkflowBusinessStates to include %q", statusKey)
		}
	}
}

func TestWorkflowBusinessStatesAcceptShipmentStatusKeys(t *testing.T) {
	expectedStatuses := map[string]struct{}{
		"shipment_pending":  {},
		"shipping_released": {},
		"shipped":           {},
	}

	states := WorkflowBusinessStates()
	stateKeys := make(map[string]struct{}, len(states))
	for _, state := range states {
		stateKeys[state.Key] = struct{}{}
	}

	for statusKey := range expectedStatuses {
		if !IsValidWorkflowBusinessState(statusKey) {
			t.Fatalf("expected %q to be valid", statusKey)
		}
		if _, ok := stateKeys[statusKey]; !ok {
			t.Fatalf("expected WorkflowBusinessStates to include %q", statusKey)
		}
	}
}

func TestWorkflowStatusActionPermissionMapsUpdateCompleteApproveReject(t *testing.T) {
	if got := WorkflowStatusActionPermission("processing", &WorkflowTask{TaskGroup: "generic"}); got != PermissionWorkflowTaskUpdate {
		t.Fatalf("processing should require update, got %s", got)
	}
	if got := WorkflowStatusActionPermission("blocked", &WorkflowTask{TaskGroup: "generic"}); got != PermissionWorkflowTaskUpdate {
		t.Fatalf("blocked should require update, got %s", got)
	}
	if got := WorkflowStatusActionPermission("done", &WorkflowTask{TaskGroup: "purchase_iqc"}); got != PermissionWorkflowTaskComplete {
		t.Fatalf("regular done should require complete, got %s", got)
	}
	if got := WorkflowStatusActionPermission("rejected", &WorkflowTask{TaskGroup: "purchase_iqc"}); got != PermissionWorkflowTaskReject {
		t.Fatalf("rejected should require reject, got %s", got)
	}
	if got := WorkflowStatusActionPermission("done", bossApprovalWorkflowTask()); got != PermissionWorkflowTaskApprove {
		t.Fatalf("boss approval done should require approve, got %s", got)
	}
}

func TestCanAdminHandleWorkflowTaskEnforcesOwnerAssigneeAndStatus(t *testing.T) {
	assigneeID := 8
	task := &WorkflowTask{
		ID:            1,
		TaskStatusKey: "ready",
		OwnerRoleKey:  QualityRoleKey,
	}
	qualityAdmin := &AdminUser{
		ID:    7,
		Roles: []AdminRole{{Key: QualityRoleKey}},
	}
	financeAdmin := &AdminUser{
		ID:    9,
		Roles: []AdminRole{{Key: FinanceRoleKey}},
	}
	assignedAdmin := &AdminUser{
		ID:    assigneeID,
		Roles: []AdminRole{{Key: FinanceRoleKey}},
	}
	superAdmin := &AdminUser{
		ID:           10,
		IsSuperAdmin: true,
		Roles:        []AdminRole{{Key: AdminRoleKey}},
	}

	if !CanAdminHandleWorkflowTask(qualityAdmin, task, "done") {
		t.Fatalf("owner role should handle unassigned task")
	}
	if CanAdminHandleWorkflowTask(financeAdmin, task, "done") {
		t.Fatalf("different role must not handle unassigned quality task")
	}
	task.AssigneeID = &assigneeID
	if CanAdminHandleWorkflowTask(qualityAdmin, task, "done") {
		t.Fatalf("assigned task must require assigned admin")
	}
	if !CanAdminHandleWorkflowTask(assignedAdmin, task, "done") {
		t.Fatalf("assigned admin should handle assigned task")
	}
	if CanAdminHandleWorkflowTask(superAdmin, task, "done") {
		t.Fatalf("super admin must not bypass assignee business boundary")
	}
	task.AssigneeID = nil
	task.TaskStatusKey = "done"
	if CanAdminHandleWorkflowTask(qualityAdmin, task, "processing") {
		t.Fatalf("terminal current task must not be handled")
	}
	task.TaskStatusKey = "ready"
	if CanAdminHandleWorkflowTask(qualityAdmin, task, "unknown") {
		t.Fatalf("invalid next status must not be handled")
	}
}

func TestCanAdminUrgeWorkflowTaskEnforcesBusinessBoundary(t *testing.T) {
	assigneeID := 8
	task := &WorkflowTask{
		ID:            1,
		TaskStatusKey: "ready",
		OwnerRoleKey:  WarehouseRoleKey,
	}
	warehouseAdmin := &AdminUser{ID: 7, Roles: []AdminRole{{Key: WarehouseRoleKey}}}
	qualityAdmin := &AdminUser{ID: 9, Roles: []AdminRole{{Key: QualityRoleKey}}}
	pmcAdmin := &AdminUser{ID: 10, Roles: []AdminRole{{Key: PMCRoleKey}}}
	bossAdmin := &AdminUser{ID: 11, Roles: []AdminRole{{Key: BossRoleKey}}}
	superAdmin := &AdminUser{ID: 12, IsSuperAdmin: true}
	assignedAdmin := &AdminUser{ID: assigneeID, Roles: []AdminRole{{Key: QualityRoleKey}}}

	if !CanAdminUrgeWorkflowTask(warehouseAdmin, task) {
		t.Fatalf("owner role should urge own task")
	}
	if CanAdminUrgeWorkflowTask(qualityAdmin, task) {
		t.Fatalf("ordinary non-owner role must not urge unrelated task")
	}
	if !CanAdminUrgeWorkflowTask(pmcAdmin, task) || !CanAdminUrgeWorkflowTask(bossAdmin, task) {
		t.Fatalf("pmc and boss should be able to urge active tasks")
	}
	if !CanAdminUrgeWorkflowTask(superAdmin, task) {
		t.Fatalf("super admin should be able to urge active tasks")
	}
	task.AssigneeID = &assigneeID
	if CanAdminUrgeWorkflowTask(warehouseAdmin, task) {
		t.Fatalf("assigned task must require assignee for ordinary owner role urge")
	}
	if !CanAdminUrgeWorkflowTask(assignedAdmin, task) {
		t.Fatalf("assigned admin should urge assigned task")
	}
	task.TaskStatusKey = "done"
	if CanAdminUrgeWorkflowTask(pmcAdmin, task) {
		t.Fatalf("terminal task must not be urged")
	}
}

func TestWorkflowUsecase_AcceptsPurchaseInboundBusinessStatuses(t *testing.T) {
	validStatuses := []string{
		"iqc_pending",
		"qc_failed",
		"warehouse_inbound_pending",
		"inbound_done",
	}

	for _, statusKey := range validStatuses {
		t.Run(statusKey, func(t *testing.T) {
			repo := &stubWorkflowRepo{}
			uc := NewWorkflowUsecase(repo)

			createStatusKey := statusKey
			_, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
				TaskCode:          "T-" + statusKey,
				TaskGroup:         "purchase",
				TaskName:          "采购入库闭环任务",
				SourceType:        "inbound",
				SourceID:          1,
				OwnerRoleKey:      "quality",
				BusinessStatusKey: &createStatusKey,
			}, 7)
			if err != nil {
				t.Fatalf("CreateTask should accept %q, got %v", statusKey, err)
			}
			if repo.createTaskInput == nil || repo.createTaskInput.BusinessStatusKey == nil || *repo.createTaskInput.BusinessStatusKey != statusKey {
				t.Fatalf("expected CreateTask repo input to keep %q", statusKey)
			}

			_, err = uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:                1,
				TaskStatusKey:     "ready",
				BusinessStatusKey: statusKey,
			}, 7, "quality")
			if err != nil {
				t.Fatalf("UpdateTaskStatus should accept %q, got %v", statusKey, err)
			}
			if repo.updateTaskInput == nil || repo.updateTaskInput.BusinessStatusKey != statusKey {
				t.Fatalf("expected UpdateTaskStatus repo input to keep %q", statusKey)
			}

			_, err = uc.UpsertBusinessState(context.Background(), &WorkflowBusinessStateUpsert{
				SourceType:        "inbound",
				SourceID:          1,
				BusinessStatusKey: statusKey,
			}, 7)
			if err != nil {
				t.Fatalf("UpsertBusinessState should accept %q, got %v", statusKey, err)
			}
			if repo.upsertStateInput == nil || repo.upsertStateInput.BusinessStatusKey != statusKey {
				t.Fatalf("expected UpsertBusinessState repo input to keep %q", statusKey)
			}
		})
	}
}

func TestWorkflowUsecase_AcceptsShipmentPendingBusinessStatus(t *testing.T) {
	const statusKey = "shipment_pending"

	repo := &stubWorkflowRepo{}
	uc := NewWorkflowUsecase(repo)

	createStatusKey := statusKey
	_, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
		TaskCode:          "T-shipment-pending",
		TaskGroup:         "shipment_release",
		TaskName:          "出货放行 / 出货准备",
		SourceType:        "production-progress",
		SourceID:          1,
		OwnerRoleKey:      "warehouse",
		BusinessStatusKey: &createStatusKey,
	}, 7)
	if err != nil {
		t.Fatalf("CreateTask should accept %q, got %v", statusKey, err)
	}
	if repo.createTaskInput == nil || repo.createTaskInput.BusinessStatusKey == nil || *repo.createTaskInput.BusinessStatusKey != statusKey {
		t.Fatalf("expected CreateTask repo input to keep %q", statusKey)
	}

	_, err = uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:                1,
		TaskStatusKey:     "ready",
		BusinessStatusKey: statusKey,
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("UpdateTaskStatus should accept %q, got %v", statusKey, err)
	}
	if repo.updateTaskInput == nil || repo.updateTaskInput.BusinessStatusKey != statusKey {
		t.Fatalf("expected UpdateTaskStatus repo input to keep %q", statusKey)
	}

	_, err = uc.UpsertBusinessState(context.Background(), &WorkflowBusinessStateUpsert{
		SourceType:        "production-progress",
		SourceID:          1,
		BusinessStatusKey: statusKey,
	}, 7)
	if err != nil {
		t.Fatalf("UpsertBusinessState should accept %q, got %v", statusKey, err)
	}
	if repo.upsertStateInput == nil || repo.upsertStateInput.BusinessStatusKey != statusKey {
		t.Fatalf("expected UpsertBusinessState repo input to keep %q", statusKey)
	}
}

func TestWorkflowUsecase_BossApprovalDoneDerivesEngineeringTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "boss"},
	}, 7, "boss")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput == nil {
		t.Fatalf("expected repo update input")
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowOrderApprovedStatusKey {
		t.Fatalf("expected business status %q, got %q", workflowOrderApprovedStatusKey, repo.updateTaskInput.BusinessStatusKey)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected boss approval side effects, got %#v", effects)
	}
	if effects.BusinessState.BusinessStatusKey != workflowOrderApprovedStatusKey {
		t.Fatalf("expected project approved state, got %q", effects.BusinessState.BusinessStatusKey)
	}
	if effects.BusinessState.OwnerRoleKey == nil || *effects.BusinessState.OwnerRoleKey != "engineering" {
		t.Fatalf("expected engineering state owner, got %#v", effects.BusinessState.OwnerRoleKey)
	}
	if effects.BusinessState.Payload["approval_result"] != "approved" {
		t.Fatalf("expected approved payload, got %#v", effects.BusinessState.Payload)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowEngineeringDataTaskGroup ||
		task.TaskName != "准备 BOM / 色卡 / 作业指导书" ||
		task.OwnerRoleKey != "engineering" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected engineering task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowEngineeringPreparingStatusKey {
		t.Fatalf("expected engineering_preparing, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowProjectOrderModuleKey || task.SourceID != 88 {
		t.Fatalf("expected project order source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["next_module_key"] != workflowMaterialBOMModuleKey ||
		task.Payload["entry_path"] != "/erp/purchase/material-bom" {
		t.Fatalf("expected engineering task entry payload, got %#v", task.Payload)
	}
}

func TestWorkflowUsecase_BossApprovalRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            101,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "boss")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived engineering task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_BossApprovalBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "boss")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_BossApprovalBlockedDerivesRevisionTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 缺少款图 "},
	}, 7, "boss")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "缺少款图" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != "blocked" {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected blocked side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "boss_approval_blocked_to_order_revision" {
		t.Fatalf("expected blocked workflow rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != "blocked" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "缺少款图" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "缺少款图" {
		t.Fatalf("expected blocked decision payload, got %#v", effects.BusinessState.Payload)
	}
	assertRevisionTask(t, effects.DerivedTask, "blocked", "缺少款图")
}

func TestWorkflowUsecase_BossApprovalRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "boss")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_BossApprovalRejectedDerivesRevisionTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "rejected",
		Reason:        " 交期和款图缺失 ",
		Payload:       map[string]any{},
	}, 7, "boss")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "交期和款图缺失" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowOrderApprovalStatusKey {
		t.Fatalf("expected project_pending, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowOrderApprovalStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != SalesRoleKey {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "boss_approval_rejected_to_order_revision" {
		t.Fatalf("expected rejected workflow rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.Payload["decision"] != "rejected" ||
		effects.BusinessState.Payload["transition_status"] != "rejected" ||
		effects.BusinessState.Payload["rejected_reason"] != "交期和款图缺失" {
		t.Fatalf("expected rejected decision payload, got %#v", effects.BusinessState.Payload)
	}
	assertRevisionTask(t, effects.DerivedTask, "rejected", "交期和款图缺失")
}

func TestWorkflowUsecase_NonBossApprovalTaskKeepsOriginalUpdateBehavior(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: &WorkflowTask{
		ID:            201,
		TaskGroup:     workflowOrderApprovalTaskGroup,
		SourceType:    workflowProjectOrderModuleKey,
		SourceID:      88,
		TaskStatusKey: "ready",
		OwnerRoleKey:  SalesRoleKey,
		Payload:       map[string]any{},
	}}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            201,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{},
	}, 7, SalesRoleKey)
	if err != nil {
		t.Fatalf("non-boss task should keep original behavior, got %v", err)
	}
	if repo.updateTaskInput.SideEffects != nil {
		t.Fatalf("non-boss task should not derive side effects")
	}
}

func TestWorkflowUsecase_SameNameNonBossApprovalTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "business order approval",
			task: &WorkflowTask{
				ID:            301,
				TaskGroup:     workflowOrderApprovalTaskGroup,
				TaskName:      "老板审批订单",
				SourceType:    workflowProjectOrderModuleKey,
				SourceID:      88,
				TaskStatusKey: "ready",
				OwnerRoleKey:  SalesRoleKey,
				Payload:       map[string]any{},
			},
		},
		{
			name: "boss task from another source",
			task: &WorkflowTask{
				ID:            302,
				TaskGroup:     workflowOrderApprovalTaskGroup,
				TaskName:      "老板审批订单",
				SourceType:    "shipping-release",
				SourceID:      88,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "boss",
				Payload:       map[string]any{},
			},
		},
		{
			name: "boss project task from another group",
			task: &WorkflowTask{
				ID:            303,
				TaskGroup:     "warehouse_inbound",
				TaskName:      "老板审批订单",
				SourceType:    workflowProjectOrderModuleKey,
				SourceID:      88,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "boss",
				Payload:       map[string]any{},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubWorkflowRepo{currentTask: tc.task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            tc.task.ID,
				TaskStatusKey: "blocked",
				Payload:       map[string]any{},
			}, 7, tc.task.OwnerRoleKey)
			if err != nil {
				t.Fatalf("same-name non-boss approval task should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("same-name non-boss approval task should not derive side effects")
			}
		})
	}
}

func TestWorkflowUsecase_BossApprovalNonDerivedStatusKeepsOriginalBehavior(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "processing",
		Payload:       map[string]any{},
	}, 7, "boss")
	if err != nil {
		t.Fatalf("processing should keep original behavior, got %v", err)
	}
	if repo.updateTaskInput.SideEffects != nil {
		t.Fatalf("processing should not derive side effects")
	}
}

func TestWorkflowUsecase_PurchaseIQCDoneDerivesWarehouseInboundTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput == nil {
		t.Fatalf("expected repo update input")
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowWarehouseInboundPendingKey {
		t.Fatalf("expected business status %q, got %q", workflowWarehouseInboundPendingKey, repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["qc_result"] != "pass" {
		t.Fatalf("expected qc_result pass in update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected IQC done side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "purchase_iqc_done_to_warehouse_inbound" {
		t.Fatalf("expected IQC done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowWarehouseInboundPendingKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected IQC done business state %#v", effects.BusinessState)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowWarehouseInboundTaskGroup ||
		task.TaskName != "确认入库" ||
		task.OwnerRoleKey != "warehouse" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected warehouse inbound task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowWarehouseInboundPendingKey {
		t.Fatalf("expected warehouse_inbound_pending, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowAccessoriesPurchaseModuleKey || task.SourceID != 66 {
		t.Fatalf("expected purchase arrival source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["qc_result"] != "pass" ||
		task.Payload["notification_type"] != "task_created" ||
		task.Payload["alert_type"] != "inbound_pending" {
		t.Fatalf("expected warehouse inbound payload, got %#v", task.Payload)
	}
}

func TestWorkflowUsecase_PurchaseIQCRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            501,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "quality")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived warehouse inbound task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_PurchaseIQCBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "quality")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_PurchaseIQCBlockedDerivesQualityExceptionTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 来料破包 "},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "来料破包" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "来料破包" {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected IQC blocked side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "purchase_iqc_blocked_to_quality_exception" {
		t.Fatalf("expected IQC blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != PurchaseRoleKey ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "来料破包" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	assertPurchaseQualityExceptionTask(t, effects.DerivedTask, "blocked", "来料破包")
}

func TestWorkflowUsecase_PurchaseIQCRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "quality")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_PurchaseIQCRejectedDerivesQualityExceptionTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "rejected",
		Reason:        " 来料尺寸不符 ",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "来料尺寸不符" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "来料尺寸不符" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != PurchaseRoleKey {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "purchase_iqc_rejected_to_quality_exception" {
		t.Fatalf("expected IQC rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	assertPurchaseQualityExceptionTask(t, effects.DerivedTask, "rejected", "来料尺寸不符")
}

func TestWorkflowUsecase_SameNameNonPurchaseIQCTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "wrong owner",
			task: &WorkflowTask{
				ID:            601,
				TaskGroup:     workflowPurchaseIQCTaskGroup,
				TaskName:      "IQC 来料检验",
				SourceType:    workflowAccessoriesPurchaseModuleKey,
				SourceID:      66,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "warehouse",
				Payload:       map[string]any{},
			},
		},
		{
			name: "wrong source",
			task: &WorkflowTask{
				ID:            602,
				TaskGroup:     workflowPurchaseIQCTaskGroup,
				TaskName:      "IQC 来料检验",
				SourceType:    "processing-contracts",
				SourceID:      66,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "quality",
				Payload:       map[string]any{},
			},
		},
		{
			name: "wrong group",
			task: &WorkflowTask{
				ID:            603,
				TaskGroup:     "outsource_return_qc",
				TaskName:      "IQC 来料检验",
				SourceType:    workflowInboundModuleKey,
				SourceID:      66,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "quality",
				Payload:       map[string]any{},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubWorkflowRepo{currentTask: tc.task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            tc.task.ID,
				TaskStatusKey: "blocked",
				Payload:       map[string]any{},
			}, 7, tc.task.OwnerRoleKey)
			if err != nil {
				t.Fatalf("same-name non-IQC task should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("same-name non-IQC task should not derive side effects")
			}
		})
	}
}

func TestWorkflowUsecase_PurchaseIQCNonDerivedStatusKeepsOriginalBehavior(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "processing",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("processing should keep original behavior, got %v", err)
	}
	if repo.updateTaskInput.SideEffects != nil {
		t.Fatalf("processing should not derive side effects")
	}
}

func TestWorkflowUsecase_WarehouseInboundDoneUpsertsInboundDoneOnly(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput == nil {
		t.Fatalf("expected repo update input")
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowInboundDoneStatusKey {
		t.Fatalf("expected business status %q, got %q", workflowInboundDoneStatusKey, repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "done" ||
		repo.updateTaskInput.Payload["transition_status"] != "done" ||
		repo.updateTaskInput.Payload["inbound_result"] != "done" ||
		repo.updateTaskInput.Payload["warehouse_task_id"] != 701 ||
		repo.updateTaskInput.Payload["inventory_balance_deferred"] != true {
		t.Fatalf("expected warehouse inbound done update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected warehouse inbound business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("warehouse inbound done must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "warehouse_inbound_done_to_inbound_done" {
		t.Fatalf("expected warehouse inbound done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowInboundDoneStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected warehouse inbound done business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["inbound_result"] != "done" ||
		effects.BusinessState.Payload["inventory_balance_deferred"] != true ||
		effects.BusinessState.Payload["decision"] != "done" ||
		effects.BusinessState.Payload["transition_status"] != "done" {
		t.Fatalf("expected inbound_done state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_WarehouseInboundRepeatedDoneDoesNotDeriveDownstreamTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            701,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "warehouse")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
		if repo.updateTaskInput.SideEffects == nil ||
			repo.updateTaskInput.SideEffects.DerivedTask != nil {
			t.Fatalf("warehouse inbound done should only upsert business state")
		}
	}
	if repo.derivedTaskCount != 0 {
		t.Fatalf("expected no derived downstream task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_WarehouseInboundBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "warehouse")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_WarehouseInboundBlockedUpsertsBlockedState(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 库位未确认 "},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "库位未确认" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "库位未确认" {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected warehouse inbound blocked business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("warehouse inbound blocked must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "warehouse_inbound_blocked_to_blocked" {
		t.Fatalf("expected warehouse inbound blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "库位未确认" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "库位未确认" {
		t.Fatalf("expected blocked state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_WarehouseInboundRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_WarehouseInboundRejectedUpsertsBlockedState(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
		TaskStatusKey: "rejected",
		Reason:        " 到货数量与单据不符 ",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "到货数量与单据不符" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "到货数量与单据不符" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected warehouse inbound rejected business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("warehouse inbound rejected must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "warehouse_inbound_rejected_to_blocked" {
		t.Fatalf("expected warehouse inbound rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "rejected" ||
		effects.BusinessState.Payload["transition_status"] != "rejected" ||
		effects.BusinessState.Payload["rejected_reason"] != "到货数量与单据不符" {
		t.Fatalf("expected rejected state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_SameNameNonWarehouseInboundTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "wrong owner",
			task: &WorkflowTask{
				ID:            801,
				TaskGroup:     workflowWarehouseInboundTaskGroup,
				TaskName:      "确认入库",
				SourceType:    workflowAccessoriesPurchaseModuleKey,
				SourceID:      77,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "quality",
				Payload:       map[string]any{},
			},
		},
		{
			name: "wrong source",
			task: &WorkflowTask{
				ID:            802,
				TaskGroup:     workflowWarehouseInboundTaskGroup,
				TaskName:      "确认入库",
				SourceType:    "processing-contracts",
				SourceID:      77,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "warehouse",
				Payload:       map[string]any{},
			},
		},
		{
			name: "wrong business status",
			task: &WorkflowTask{
				ID:                803,
				TaskGroup:         workflowWarehouseInboundTaskGroup,
				TaskName:          "确认入库",
				SourceType:        workflowInboundModuleKey,
				SourceID:          77,
				BusinessStatusKey: ptrString(workflowQCFailedStatusKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Payload:           map[string]any{},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubWorkflowRepo{currentTask: tc.task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            tc.task.ID,
				TaskStatusKey: "blocked",
				Payload:       map[string]any{},
			}, 7, tc.task.OwnerRoleKey)
			if err != nil {
				t.Fatalf("same-name non-warehouse-inbound task should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("same-name non-warehouse-inbound task should not derive side effects")
			}
		})
	}
}

func TestWorkflowUsecase_WarehouseInboundSettledBusinessStatusDoesNotTriggerSpecialRule(t *testing.T) {
	cases := []struct {
		name              string
		businessStatusKey string
	}{
		{name: "already inbound done", businessStatusKey: workflowInboundDoneStatusKey},
		{name: "already blocked", businessStatusKey: workflowBlockedStatusKey},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := warehouseInboundWorkflowTask()
			task.BusinessStatusKey = ptrString(tc.businessStatusKey)
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: "blocked",
				Payload:       map[string]any{},
			}, 7, "warehouse")
			if err != nil {
				t.Fatalf("settled warehouse inbound status should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("settled warehouse inbound status should not trigger special side effects")
			}
		})
	}
}

func TestWorkflowUsecase_WarehouseInboundNonDerivedStatusKeepsOriginalBehavior(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
		TaskStatusKey: "processing",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("processing should keep original behavior, got %v", err)
	}
	if repo.updateTaskInput.SideEffects != nil {
		t.Fatalf("processing should not derive side effects")
	}
}

func TestWorkflowUsecase_OutsourceReturnQCDoneDerivesWarehouseInboundTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput == nil {
		t.Fatalf("expected repo update input")
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowWarehouseInboundPendingKey {
		t.Fatalf("expected business status %q, got %q", workflowWarehouseInboundPendingKey, repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["qc_result"] != "pass" ||
		repo.updateTaskInput.Payload["qc_type"] != "outsource_return" ||
		repo.updateTaskInput.Payload["outsource_processing"] != true {
		t.Fatalf("expected outsource QC done update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected outsource QC done side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "outsource_return_qc_done_to_outsource_warehouse_inbound" {
		t.Fatalf("expected outsource QC done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowWarehouseInboundPendingKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected outsource QC done business state %#v", effects.BusinessState)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowOutsourceWarehouseInboundTaskGroup ||
		task.TaskName != "委外回货入库" ||
		task.OwnerRoleKey != "warehouse" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected outsource warehouse inbound task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowWarehouseInboundPendingKey {
		t.Fatalf("expected warehouse_inbound_pending, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowProcessingContractsModuleKey || task.SourceID != 99 {
		t.Fatalf("expected processing contract source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["qc_task_id"] != 901 ||
		task.Payload["qc_result"] != "pass" ||
		task.Payload["qc_type"] != "outsource_return" ||
		task.Payload["outsource_processing"] != true ||
		task.Payload["inventory_balance_deferred"] != true ||
		task.Payload["notification_type"] != "task_created" ||
		task.Payload["alert_type"] != "inbound_pending" {
		t.Fatalf("expected outsource warehouse inbound payload, got %#v", task.Payload)
	}
}

func TestWorkflowUsecase_OutsourceReturnQCDoneUsesTransitionPayloadForDownstream(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "done",
		Payload:       map[string]any{"qc_result": "accepted"},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected outsource QC done side effects, got %#v", effects)
	}
	if repo.updateTaskInput.Payload["qc_result"] != "accepted" {
		t.Fatalf("expected update payload qc_result accepted, got %#v", repo.updateTaskInput.Payload)
	}
	if effects.BusinessState.Payload["qc_result"] != "accepted" {
		t.Fatalf("expected business state to keep transition qc_result, got %#v", effects.BusinessState.Payload)
	}
	if effects.DerivedTask.Payload["qc_result"] != "accepted" {
		t.Fatalf("expected derived warehouse inbound to keep transition qc_result, got %#v", effects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_OutsourceReturnQCRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            901,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "quality")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived outsource warehouse inbound task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_OutsourceReturnQCBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "quality")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_OutsourceReturnQCBlockedDerivesReworkTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 回货抽检待判责 "},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "回货抽检待判责" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "回货抽检待判责" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "回货抽检待判责" ||
		repo.updateTaskInput.Payload["qc_type"] != "outsource_return" {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected outsource QC blocked side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "outsource_return_qc_blocked_to_outsource_rework" {
		t.Fatalf("expected outsource QC blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "回货抽检待判责" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "回货抽检待判责" {
		t.Fatalf("expected blocked state payload, got %#v", effects.BusinessState.Payload)
	}
	assertOutsourceReworkTask(t, effects.DerivedTask, "blocked", "回货抽检待判责")
}

func TestWorkflowUsecase_OutsourceReturnQCBlockedOverridesStaleRejectedReason(t *testing.T) {
	task := outsourceReturnQCWorkflowTask()
	task.Payload["decision"] = "rejected"
	task.Payload["rejected_reason"] = "旧退回原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "blocked",
		Reason:        "当前阻塞原因",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "当前阻塞原因" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "当前阻塞原因" {
		t.Fatalf("expected blocked transition to refresh stale reason fields, got %#v", repo.updateTaskInput.Payload)
	}
}

func TestWorkflowUsecase_OutsourceReturnQCRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "quality")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_OutsourceReturnQCRejectedDerivesReworkTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "rejected",
		Reason:        " 车缝开线 ",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "车缝开线" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "车缝开线" ||
		repo.updateTaskInput.Payload["qc_type"] != "outsource_return" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "outsource_return_qc_rejected_to_outsource_rework" {
		t.Fatalf("expected outsource QC rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	assertOutsourceReworkTask(t, effects.DerivedTask, "rejected", "车缝开线")
}

func TestWorkflowUsecase_OutsourceReturnQCRejectedClearsStaleBlockedReason(t *testing.T) {
	task := outsourceReturnQCWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowQCFailedStatusKey)
	task.Payload["decision"] = "blocked"
	task.Payload["blocked_reason"] = "旧阻塞原因"
	task.Payload["rejected_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "rejected",
		Reason:        "当前退回原因",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "当前退回原因" {
		t.Fatalf("expected rejected transition payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.SideEffects.DerivedTask.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected rework task payload to omit stale blocked_reason, got %#v", repo.updateTaskInput.SideEffects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_SameNameNonOutsourceReturnQCTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "wrong owner",
			task: &WorkflowTask{
				ID:            1001,
				TaskGroup:     workflowOutsourceReturnQCTaskGroup,
				TaskName:      "委外回货检验",
				SourceType:    workflowProcessingContractsModuleKey,
				SourceID:      99,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "warehouse",
				Payload:       map[string]any{"qc_type": "outsource_return"},
			},
		},
		{
			name: "wrong source",
			task: &WorkflowTask{
				ID:            1002,
				TaskGroup:     workflowOutsourceReturnQCTaskGroup,
				TaskName:      "委外回货检验",
				SourceType:    workflowAccessoriesPurchaseModuleKey,
				SourceID:      99,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "quality",
				Payload:       map[string]any{"qc_type": "outsource_return"},
			},
		},
		{
			name: "missing outsource marker",
			task: &WorkflowTask{
				ID:            1003,
				TaskGroup:     workflowOutsourceReturnQCTaskGroup,
				TaskName:      "委外回货检验",
				SourceType:    workflowInboundModuleKey,
				SourceID:      99,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "quality",
				Payload:       map[string]any{},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubWorkflowRepo{currentTask: tc.task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            tc.task.ID,
				TaskStatusKey: "blocked",
				Payload:       map[string]any{},
			}, 7, tc.task.OwnerRoleKey)
			if err != nil {
				t.Fatalf("same-name non-outsource-QC task should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("same-name non-outsource-QC task should not derive side effects")
			}
		})
	}
}

func TestWorkflowUsecase_OutsourceReturnQCSettledBusinessStatusDoesNotTriggerSpecialRule(t *testing.T) {
	cases := []struct {
		name              string
		businessStatusKey string
	}{
		{name: "already warehouse inbound pending", businessStatusKey: workflowWarehouseInboundPendingKey},
		{name: "already blocked", businessStatusKey: workflowBlockedStatusKey},
		{name: "already inbound done", businessStatusKey: workflowInboundDoneStatusKey},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := outsourceReturnQCWorkflowTask()
			task.BusinessStatusKey = ptrString(tc.businessStatusKey)
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: "blocked",
				Payload:       map[string]any{},
			}, 7, "quality")
			if err != nil {
				t.Fatalf("settled outsource QC status should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("settled outsource QC status should not trigger special side effects")
			}
		})
	}
}

func TestWorkflowUsecase_OutsourceReturnQCFailedBusinessStatusStillUsesSpecialRule(t *testing.T) {
	task := outsourceReturnQCWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowQCFailedStatusKey)
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "rejected",
		Reason:        "返工后复检仍不合格",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("qc_failed outsource QC task should still use special rule, got %v", err)
	}
	if repo.updateTaskInput == nil || repo.updateTaskInput.SideEffects == nil {
		t.Fatalf("expected qc_failed outsource QC task to derive side effects")
	}
	if repo.updateTaskInput.SideEffects.DerivedTask == nil ||
		repo.updateTaskInput.SideEffects.DerivedTask.TaskGroup != workflowOutsourceReworkTaskGroup {
		t.Fatalf("expected outsource rework side effect, got %#v", repo.updateTaskInput.SideEffects)
	}
}

func TestWorkflowUsecase_OutsourceReturnQCNonDerivedStatusKeepsOriginalBehavior(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "processing",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("processing should keep original behavior, got %v", err)
	}
	if repo.updateTaskInput.SideEffects != nil {
		t.Fatalf("processing should not derive side effects")
	}
}

func TestWorkflowUsecase_FinishedGoodsQCDoneDerivesInboundTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowWarehouseInboundPendingKey {
		t.Fatalf("expected warehouse inbound pending, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["qc_result"] != "pass" ||
		repo.updateTaskInput.Payload["finished_goods"] != true ||
		repo.updateTaskInput.Payload["inventory_balance_deferred"] != true ||
		repo.updateTaskInput.Payload["alert_type"] != "finished_goods_inbound_pending" {
		t.Fatalf("expected finished goods QC done update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected finished goods QC done side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "finished_goods_qc_done_to_finished_goods_inbound" {
		t.Fatalf("expected finished goods QC done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowWarehouseInboundPendingKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods QC business state %#v", effects.BusinessState)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowFinishedGoodsInboundTaskGroup ||
		task.TaskName != "成品入库" ||
		task.OwnerRoleKey != "warehouse" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected finished goods inbound task %#v", task)
	}
	if task.Payload["qc_task_id"] != 1001 ||
		task.Payload["qc_result"] != "pass" ||
		task.Payload["finished_goods"] != true ||
		task.Payload["inventory_balance_deferred"] != true ||
		task.Payload["alert_type"] != "finished_goods_inbound_pending" ||
		task.Payload["customer_name"] != "成慧怡" ||
		task.Payload["style_no"] != "ST-001" ||
		task.Payload["shipment_date"] != "2026-04-30" {
		t.Fatalf("expected finished goods inbound payload, got %#v", task.Payload)
	}
	if task.TaskGroup == "shipment_release" {
		t.Fatalf("finished goods QC done must not derive shipment release")
	}
}

func TestWorkflowUsecase_FinishedGoodsQCDoneUsesTransitionPayloadForDownstream(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
		TaskStatusKey: "done",
		Payload: map[string]any{
			"qc_result": "accepted",
			"quantity":  1180,
		},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected finished goods QC done side effects, got %#v", effects)
	}
	if repo.updateTaskInput.Payload["qc_result"] != "accepted" ||
		effects.BusinessState.Payload["qc_result"] != "accepted" ||
		effects.DerivedTask.Payload["qc_result"] != "accepted" {
		t.Fatalf("expected transition qc_result in update, state and downstream, got update=%#v state=%#v task=%#v", repo.updateTaskInput.Payload, effects.BusinessState.Payload, effects.DerivedTask.Payload)
	}
	if effects.DerivedTask.Payload["quantity"] != 1180 {
		t.Fatalf("expected downstream to use transition quantity, got %#v", effects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_FinishedGoodsQCRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            1001,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "quality")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived finished goods inbound task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_FinishedGoodsQCBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "quality")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_FinishedGoodsQCBlockedDerivesReworkTask(t *testing.T) {
	task := finishedGoodsQCWorkflowTask()
	task.Payload["rejected_reason"] = "旧退回原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 车缝开线 "},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "车缝开线" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "车缝开线" ||
		repo.updateTaskInput.Payload["qc_result"] != "blocked" ||
		repo.updateTaskInput.Payload["finished_goods"] != true {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked transition to clear stale rejected_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected finished goods QC blocked side effects, got %#v", effects)
	}
	if !effects.RefreshExistingDerivedTaskPayload {
		t.Fatalf("expected finished goods rework reuse to refresh payload")
	}
	if effects.WorkflowRuleKey != "finished_goods_qc_blocked_to_finished_goods_rework" {
		t.Fatalf("expected finished goods QC blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "车缝开线" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "车缝开线" {
		t.Fatalf("expected blocked state payload, got %#v", effects.BusinessState.Payload)
	}
	assertFinishedGoodsReworkTask(t, effects.DerivedTask, "blocked", "车缝开线")
	if _, ok := effects.DerivedTask.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked rework payload to omit stale rejected_reason, got %#v", effects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_FinishedGoodsQCRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "quality")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_FinishedGoodsQCRejectedDerivesReworkTask(t *testing.T) {
	task := finishedGoodsQCWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowQCFailedStatusKey)
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
		TaskStatusKey: "rejected",
		Reason:        "尺寸偏差",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "尺寸偏差" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "尺寸偏差" ||
		repo.updateTaskInput.Payload["qc_result"] != "rejected" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "finished_goods_qc_rejected_to_finished_goods_rework" {
		t.Fatalf("expected finished goods QC rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	assertFinishedGoodsReworkTask(t, effects.DerivedTask, "rejected", "尺寸偏差")
	if _, ok := effects.DerivedTask.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected rework payload to omit stale blocked_reason, got %#v", effects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_SameNameNonFinishedGoodsQCTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "wrong owner",
			task: &WorkflowTask{
				ID:            1101,
				TaskGroup:     workflowFinishedGoodsQCTaskGroup,
				TaskName:      "成品抽检",
				SourceType:    workflowProductionProgressModuleKey,
				SourceID:      101,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "warehouse",
				Payload:       map[string]any{"finished_goods": true},
			},
		},
		{
			name: "wrong source",
			task: &WorkflowTask{
				ID:            1102,
				TaskGroup:     workflowFinishedGoodsQCTaskGroup,
				TaskName:      "成品抽检",
				SourceType:    workflowInboundModuleKey,
				SourceID:      101,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "quality",
				Payload:       map[string]any{"finished_goods": true},
			},
		},
		{
			name: "missing finished goods marker",
			task: &WorkflowTask{
				ID:            1103,
				TaskGroup:     workflowFinishedGoodsQCTaskGroup,
				TaskName:      "成品抽检",
				SourceType:    workflowProductionProgressModuleKey,
				SourceID:      101,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "quality",
				Payload:       map[string]any{},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubWorkflowRepo{currentTask: tc.task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            tc.task.ID,
				TaskStatusKey: "blocked",
				Payload:       map[string]any{},
			}, 7, tc.task.OwnerRoleKey)
			if err != nil {
				t.Fatalf("same-name non-finished-goods-QC task should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("same-name non-finished-goods-QC task should not derive side effects")
			}
		})
	}
}

func TestWorkflowUsecase_FinishedGoodsQCSettledBusinessStatusDoesNotTriggerSpecialRule(t *testing.T) {
	cases := []struct {
		name              string
		businessStatusKey string
	}{
		{name: "already warehouse inbound pending", businessStatusKey: workflowWarehouseInboundPendingKey},
		{name: "already inbound done", businessStatusKey: workflowInboundDoneStatusKey},
		{name: "already shipped", businessStatusKey: "shipped"},
		{name: "already blocked", businessStatusKey: workflowBlockedStatusKey},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := finishedGoodsQCWorkflowTask()
			task.BusinessStatusKey = ptrString(tc.businessStatusKey)
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: "blocked",
				Payload:       map[string]any{},
			}, 7, "quality")
			if err != nil {
				t.Fatalf("settled finished goods QC status should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("settled finished goods QC status should not trigger special side effects")
			}
		})
	}
}

func TestWorkflowUsecase_FinishedGoodsQCFailedBusinessStatusStillUsesSpecialRule(t *testing.T) {
	task := finishedGoodsQCWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowQCFailedStatusKey)
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "blocked",
		Reason:        "返工后复检仍不合格",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("qc_failed finished goods QC task should still use special rule, got %v", err)
	}
	if repo.updateTaskInput == nil || repo.updateTaskInput.SideEffects == nil {
		t.Fatalf("expected qc_failed finished goods QC task to derive side effects")
	}
	if repo.updateTaskInput.SideEffects.DerivedTask == nil ||
		repo.updateTaskInput.SideEffects.DerivedTask.TaskGroup != workflowFinishedGoodsReworkTaskGroup {
		t.Fatalf("expected finished goods rework side effect, got %#v", repo.updateTaskInput.SideEffects)
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundDoneUpsertsInboundDoneOnly(t *testing.T) {
	task := finishedGoodsInboundWorkflowTask()
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowInboundDoneStatusKey {
		t.Fatalf("expected inbound_done, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["inbound_task_id"] != task.ID ||
		repo.updateTaskInput.Payload["inbound_result"] != "done" ||
		repo.updateTaskInput.Payload["finished_goods"] != true ||
		repo.updateTaskInput.Payload["inventory_balance_deferred"] != true ||
		repo.updateTaskInput.Payload["shipment_release_deferred"] != true ||
		repo.updateTaskInput.Payload["decision"] != "done" ||
		repo.updateTaskInput.Payload["transition_status"] != "done" {
		t.Fatalf("expected finished goods inbound done payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected done transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected finished goods inbound business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("finished goods inbound done must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "finished_goods_inbound_done_to_inbound_done" {
		t.Fatalf("expected finished goods inbound done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowInboundDoneStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods inbound business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["inbound_task_id"] != task.ID ||
		effects.BusinessState.Payload["inbound_result"] != "done" ||
		effects.BusinessState.Payload["inventory_balance_deferred"] != true ||
		effects.BusinessState.Payload["shipment_release_deferred"] != true ||
		effects.BusinessState.Payload["decision"] != "done" {
		t.Fatalf("expected inbound_done state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundRepeatedDoneDoesNotDeriveDownstreamTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            1201,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "warehouse")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
		if repo.updateTaskInput.SideEffects == nil ||
			repo.updateTaskInput.SideEffects.DerivedTask != nil {
			t.Fatalf("finished goods inbound done should only upsert business state")
		}
	}
	if repo.derivedTaskCount != 0 {
		t.Fatalf("expected no derived downstream task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1201,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "warehouse")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundBlockedUpsertsBlockedState(t *testing.T) {
	task := finishedGoodsInboundWorkflowTask()
	task.Payload["rejected_reason"] = "旧退回原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 库位未确认 "},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "库位未确认" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "库位未确认" ||
		repo.updateTaskInput.Payload["finished_goods"] != true {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked transition to clear stale rejected_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected finished goods inbound blocked business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("finished goods inbound blocked must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "finished_goods_inbound_blocked_to_blocked" {
		t.Fatalf("expected finished goods inbound blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "库位未确认" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "库位未确认" {
		t.Fatalf("expected blocked state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1201,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundRejectedUpsertsBlockedState(t *testing.T) {
	task := finishedGoodsInboundWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowBlockedStatusKey)
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "rejected",
		Reason:        "数量与完工单不符",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "数量与完工单不符" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "finished_goods_inbound_rejected_to_blocked" {
		t.Fatalf("expected finished goods inbound rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("finished goods inbound rejected must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if _, ok := effects.BusinessState.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected business state to omit stale blocked_reason, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_SameNameNonFinishedGoodsInboundTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "wrong owner",
			task: &WorkflowTask{
				ID:                1301,
				TaskGroup:         workflowFinishedGoodsInboundTaskGroup,
				TaskName:          "成品入库",
				SourceType:        workflowProductionProgressModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowWarehouseInboundPendingKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "quality",
				Payload:           map[string]any{"finished_goods": true},
			},
		},
		{
			name: "wrong source",
			task: &WorkflowTask{
				ID:                1302,
				TaskGroup:         workflowFinishedGoodsInboundTaskGroup,
				TaskName:          "成品入库",
				SourceType:        workflowInboundModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowWarehouseInboundPendingKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Payload:           map[string]any{"finished_goods": true},
			},
		},
		{
			name: "missing finished goods marker",
			task: &WorkflowTask{
				ID:                1303,
				TaskGroup:         workflowFinishedGoodsInboundTaskGroup,
				TaskName:          "成品入库",
				SourceType:        workflowProductionProgressModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowWarehouseInboundPendingKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Payload:           map[string]any{},
			},
		},
		{
			name: "settled business status",
			task: &WorkflowTask{
				ID:                1304,
				TaskGroup:         workflowFinishedGoodsInboundTaskGroup,
				TaskName:          "成品入库",
				SourceType:        workflowProductionProgressModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowInboundDoneStatusKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Payload:           map[string]any{"finished_goods": true},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubWorkflowRepo{currentTask: tc.task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            tc.task.ID,
				TaskStatusKey: "blocked",
				Payload:       map[string]any{},
			}, 7, tc.task.OwnerRoleKey)
			if err != nil {
				t.Fatalf("same-name non-finished-goods-inbound task should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("same-name non-finished-goods-inbound task should not derive side effects")
			}
		})
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundSettledBusinessStatusDoesNotTriggerSpecialRule(t *testing.T) {
	cases := []struct {
		name              string
		businessStatusKey string
	}{
		{name: "already inbound done", businessStatusKey: workflowInboundDoneStatusKey},
		{name: "already shipment pending", businessStatusKey: "shipment_pending"},
		{name: "already shipment release pending legacy state", businessStatusKey: "shipment_release_pending"},
		{name: "already shipping released", businessStatusKey: "shipping_released"},
		{name: "already shipped", businessStatusKey: "shipped"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := finishedGoodsInboundWorkflowTask()
			task.BusinessStatusKey = ptrString(tc.businessStatusKey)
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{},
			}, 7, "warehouse")
			if err != nil {
				t.Fatalf("settled finished goods inbound status should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("settled finished goods inbound status should not trigger special side effects")
			}
		})
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundBlockedBusinessStatusStillUsesSpecialRule(t *testing.T) {
	task := finishedGoodsInboundWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowBlockedStatusKey)
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "blocked",
		Reason:        "重复确认仍卡库位",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("blocked finished goods inbound task should still use special rule, got %v", err)
	}
	if repo.updateTaskInput == nil || repo.updateTaskInput.SideEffects == nil {
		t.Fatalf("expected blocked finished goods inbound task to upsert business state")
	}
	if repo.updateTaskInput.SideEffects.DerivedTask != nil {
		t.Fatalf("blocked finished goods inbound task must not derive downstream task")
	}
	if repo.updateTaskInput.SideEffects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business state, got %#v", repo.updateTaskInput.SideEffects.BusinessState)
	}
}

func TestWorkflowUsecase_ShipmentReleaseDoneUpsertsShippingReleasedOnly(t *testing.T) {
	task := shipmentReleaseWorkflowTask()
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowShippingReleasedStatusKey {
		t.Fatalf("expected shipping_released, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["shipment_release_task_id"] != task.ID ||
		repo.updateTaskInput.Payload["shipment_release_result"] != "done" ||
		repo.updateTaskInput.Payload["shipment_release_deferred_inventory"] != true ||
		repo.updateTaskInput.Payload["shipment_execution_required"] != true ||
		repo.updateTaskInput.Payload["inventory_out_deferred"] != true ||
		repo.updateTaskInput.Payload["receivable_deferred"] != true ||
		repo.updateTaskInput.Payload["invoice_deferred"] != true ||
		repo.updateTaskInput.Payload["decision"] != "done" ||
		repo.updateTaskInput.Payload["transition_status"] != "done" {
		t.Fatalf("expected shipment release done payload, got %#v", repo.updateTaskInput.Payload)
	}
	if repo.updateTaskInput.Payload["shipment_result"] == "shipped" {
		t.Fatalf("shipment_release done must not be marked as shipped, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected done transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected shipment release business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("shipment release done must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "shipment_release_done_to_shipping_released" {
		t.Fatalf("expected shipment release done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowShippingReleasedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected shipment release business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["shipment_release_task_id"] != task.ID ||
		effects.BusinessState.Payload["shipment_release_result"] != "done" ||
		effects.BusinessState.Payload["inventory_out_deferred"] != true ||
		effects.BusinessState.Payload["receivable_deferred"] != true ||
		effects.BusinessState.Payload["invoice_deferred"] != true ||
		effects.BusinessState.Payload["decision"] != "done" {
		t.Fatalf("expected shipping_released state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_ShipmentReleaseRepeatedDoneDoesNotDeriveDownstreamTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: shipmentReleaseWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            1401,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "warehouse")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
		if repo.updateTaskInput.SideEffects == nil ||
			repo.updateTaskInput.SideEffects.DerivedTask != nil {
			t.Fatalf("shipment release done should only upsert business state")
		}
	}
	if repo.derivedTaskCount != 0 {
		t.Fatalf("expected no derived downstream task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_ShipmentReleaseBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: shipmentReleaseWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1401,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "warehouse")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_ShipmentReleaseBlockedUpsertsBlockedState(t *testing.T) {
	task := shipmentReleaseWorkflowTask()
	task.Payload["rejected_reason"] = "旧退回原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 客户资料未确认 "},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "客户资料未确认" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "客户资料未确认" ||
		repo.updateTaskInput.Payload["shipment_release_task_id"] != task.ID {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked transition to clear stale rejected_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected shipment release blocked business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("shipment release blocked must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "shipment_release_blocked_to_blocked" {
		t.Fatalf("expected shipment release blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "客户资料未确认" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "客户资料未确认" {
		t.Fatalf("expected blocked state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_ShipmentReleaseRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: shipmentReleaseWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1401,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_ShipmentReleaseRejectedUpsertsBlockedState(t *testing.T) {
	task := shipmentReleaseWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowBlockedStatusKey)
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "rejected",
		Reason:        "客户取消本次放行",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "客户取消本次放行" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "shipment_release_rejected_to_blocked" {
		t.Fatalf("expected shipment release rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("shipment release rejected must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if _, ok := effects.BusinessState.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected business state to omit stale blocked_reason, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_SameNameNonShipmentReleaseTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "wrong owner",
			task: &WorkflowTask{
				ID:                1501,
				TaskGroup:         workflowShipmentReleaseTaskGroup,
				TaskName:          "出货放行 / 出货准备",
				SourceType:        workflowShippingReleaseModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowShipmentPendingStatusKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "sales",
				Payload:           map[string]any{"shipment_release": true},
			},
		},
		{
			name: "wrong source",
			task: &WorkflowTask{
				ID:                1502,
				TaskGroup:         workflowShipmentReleaseTaskGroup,
				TaskName:          "出货放行 / 出货准备",
				SourceType:        "receivables",
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowShipmentPendingStatusKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Payload:           map[string]any{"shipment_release": true},
			},
		},
		{
			name: "missing shipment marker",
			task: &WorkflowTask{
				ID:                1503,
				TaskGroup:         workflowShipmentReleaseTaskGroup,
				TaskName:          "出货放行 / 出货准备",
				SourceType:        workflowShippingReleaseModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowShipmentPendingStatusKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Payload:           map[string]any{},
			},
		},
		{
			name: "settled business status",
			task: &WorkflowTask{
				ID:                1504,
				TaskGroup:         workflowShipmentReleaseTaskGroup,
				TaskName:          "出货放行 / 出货准备",
				SourceType:        workflowShippingReleaseModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowShippingReleasedStatusKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Payload:           map[string]any{"shipment_release": true},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubWorkflowRepo{currentTask: tc.task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            tc.task.ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{},
			}, 7, tc.task.OwnerRoleKey)
			if err != nil {
				t.Fatalf("same-name non-shipment-release task should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("same-name non-shipment-release task should not derive side effects")
			}
		})
	}
}

func TestWorkflowUsecase_ShipmentReleaseSettledBusinessStatusDoesNotTriggerSpecialRule(t *testing.T) {
	cases := []struct {
		name              string
		businessStatusKey string
	}{
		{name: "already shipping released", businessStatusKey: workflowShippingReleasedStatusKey},
		{name: "already shipped", businessStatusKey: "shipped"},
		{name: "already receivable pending", businessStatusKey: "receivable_pending"},
		{name: "already invoice pending", businessStatusKey: "invoice_pending"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := shipmentReleaseWorkflowTask()
			task.BusinessStatusKey = ptrString(tc.businessStatusKey)
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{},
			}, 7, "warehouse")
			if err != nil {
				t.Fatalf("settled shipment release status should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("settled shipment release status should not trigger special side effects")
			}
		})
	}
}

func TestWorkflowUsecase_ShipmentReleaseBlockedBusinessStatusStillUsesSpecialRule(t *testing.T) {
	task := shipmentReleaseWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowBlockedStatusKey)
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "blocked",
		Reason:        "重复确认仍不能放行",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("blocked shipment release task should still use special rule, got %v", err)
	}
	if repo.updateTaskInput == nil || repo.updateTaskInput.SideEffects == nil {
		t.Fatalf("expected blocked shipment release task to upsert business state")
	}
	if repo.updateTaskInput.SideEffects.DerivedTask != nil {
		t.Fatalf("blocked shipment release task must not derive downstream task")
	}
	if repo.updateTaskInput.SideEffects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business state, got %#v", repo.updateTaskInput.SideEffects.BusinessState)
	}
}

func TestWorkflowUsecase_ListTasksRejectsInvalidStatus(t *testing.T) {
	repo := &stubWorkflowRepo{}
	uc := NewWorkflowUsecase(repo)

	_, _, err := uc.ListTasks(context.Background(), WorkflowTaskFilter{TaskStatusKey: "unknown"})
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.listTaskCalled {
		t.Fatalf("repo should not be called for invalid status")
	}
}

func TestWorkflowUsecase_UpsertBusinessStateRejectsInvalidStatus(t *testing.T) {
	uc := NewWorkflowUsecase(&stubWorkflowRepo{})

	_, err := uc.UpsertBusinessState(context.Background(), &WorkflowBusinessStateUpsert{
		SourceType:        "project_order",
		SourceID:          1,
		BusinessStatusKey: "unknown",
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
}

func TestWorkflowUsecase_UrgeTaskRejectsInvalidInput(t *testing.T) {
	uc := NewWorkflowUsecase(&stubWorkflowRepo{})

	cases := []struct {
		name  string
		input *WorkflowTaskUrge
	}{
		{name: "empty task id", input: &WorkflowTaskUrge{Action: "urge_task", Reason: "请处理"}},
		{name: "invalid action", input: &WorkflowTaskUrge{ID: 1, Action: "comment", Reason: "请处理"}},
		{name: "empty reason", input: &WorkflowTaskUrge{ID: 1, Action: "urge_task", Reason: "   "}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := uc.UrgeTask(context.Background(), tc.input, 7, "pmc")
			if !errors.Is(err, ErrBadParam) {
				t.Fatalf("expected ErrBadParam, got %v", err)
			}
		})
	}
}

func TestWorkflowUsecase_UrgeTaskAcceptsSupportedActions(t *testing.T) {
	actions := []string{
		"urge_task",
		"urge_role",
		"urge_assignee",
		"escalate_to_pmc",
		"escalate_to_boss",
	}

	for _, action := range actions {
		t.Run(action, func(t *testing.T) {
			repo := &stubWorkflowRepo{}
			uc := NewWorkflowUsecase(repo)
			task, err := uc.UrgeTask(context.Background(), &WorkflowTaskUrge{
				ID:      1,
				Action:  " " + action + " ",
				Reason:  " 请尽快处理 ",
				Payload: nil,
			}, 7, " pmc ")
			if err != nil {
				t.Fatalf("UrgeTask should accept %q, got %v", action, err)
			}
			if task.ID != 1 {
				t.Fatalf("expected task id 1, got %d", task.ID)
			}
			if repo.urgeTaskInput == nil {
				t.Fatalf("expected repo input")
			}
			if repo.urgeTaskInput.Action != action {
				t.Fatalf("expected normalized action %q, got %q", action, repo.urgeTaskInput.Action)
			}
			if repo.urgeTaskInput.Reason != "请尽快处理" {
				t.Fatalf("expected trimmed reason, got %q", repo.urgeTaskInput.Reason)
			}
			if repo.urgeTaskInput.Payload == nil {
				t.Fatalf("expected payload default to empty map")
			}
		})
	}
}

func bossApprovalWorkflowTask() *WorkflowTask {
	sourceNo := "PO-20260425-001"
	statusKey := workflowOrderApprovalStatusKey
	return &WorkflowTask{
		ID:                101,
		TaskCode:          "order-approval-88",
		TaskGroup:         workflowOrderApprovalTaskGroup,
		TaskName:          "老板审批订单",
		SourceType:        workflowProjectOrderModuleKey,
		SourceID:          88,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "boss",
		Priority:          2,
		Payload: map[string]any{
			"record_title":  "企鹅抱枕",
			"customer_name": "成慧怡",
			"style_no":      "ST-001",
			"product_no":    "PRD-001",
			"product_name":  "企鹅抱枕",
			"due_date":      "2026-05-01",
		},
	}
}

func purchaseIQCWorkflowTask() *WorkflowTask {
	sourceNo := "PUR-ARR-001"
	statusKey := workflowIQCPendingStatusKey
	return &WorkflowTask{
		ID:                501,
		TaskCode:          "purchase-iqc-66",
		TaskGroup:         workflowPurchaseIQCTaskGroup,
		TaskName:          "IQC 来料检验",
		SourceType:        workflowAccessoriesPurchaseModuleKey,
		SourceID:          66,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          2,
		Payload: map[string]any{
			"record_title":  "PP 棉到货",
			"supplier_name": "联调供应商",
			"material_name": "PP 棉",
			"quantity":      120,
			"unit":          "kg",
			"due_date":      "2026-04-28",
		},
	}
}

func warehouseInboundWorkflowTask() *WorkflowTask {
	sourceNo := "PUR-ARR-001"
	statusKey := workflowWarehouseInboundPendingKey
	return &WorkflowTask{
		ID:                701,
		TaskCode:          "warehouse-inbound-77",
		TaskGroup:         workflowWarehouseInboundTaskGroup,
		TaskName:          "确认入库",
		SourceType:        workflowAccessoriesPurchaseModuleKey,
		SourceID:          77,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          2,
		Payload: map[string]any{
			"record_title":  "PP 棉到货",
			"supplier_name": "联调供应商",
			"material_name": "PP 棉",
			"quantity":      120,
			"unit":          "kg",
			"due_date":      "2026-04-28",
		},
	}
}

func outsourceReturnQCWorkflowTask() *WorkflowTask {
	sourceNo := "OUT-RET-001"
	statusKey := workflowQCPendingStatusKey
	return &WorkflowTask{
		ID:                901,
		TaskCode:          "outsource-return-qc-99",
		TaskGroup:         workflowOutsourceReturnQCTaskGroup,
		TaskName:          "委外回货检验",
		SourceType:        workflowProcessingContractsModuleKey,
		SourceID:          99,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          2,
		Payload: map[string]any{
			"record_title":         "兔子挂件委外车缝",
			"supplier_name":        "联调加工厂",
			"source_no":            "OUT-001",
			"product_no":           "SKU-001",
			"product_name":         "兔子挂件",
			"quantity":             300,
			"unit":                 "pcs",
			"due_date":             "2026-04-28",
			"expected_return_date": "2026-04-28",
			"qc_type":              "outsource_return",
			"outsource_processing": true,
		},
	}
}

func finishedGoodsQCWorkflowTask() *WorkflowTask {
	sourceNo := "FG-QC-001"
	statusKey := workflowQCPendingStatusKey
	return &WorkflowTask{
		ID:                1001,
		TaskCode:          "finished-goods-qc-101",
		TaskGroup:         workflowFinishedGoodsQCTaskGroup,
		TaskName:          "成品抽检",
		SourceType:        workflowProductionProgressModuleKey,
		SourceID:          101,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          3,
		Payload: map[string]any{
			"record_title":          "小熊公仔完工",
			"source_no":             "SO-2026-101",
			"customer_name":         "成慧怡",
			"style_no":              "ST-001",
			"product_no":            "SKU-101",
			"product_name":          "小熊公仔",
			"quantity":              1200,
			"unit":                  "只",
			"due_date":              "2026-04-28",
			"shipment_date":         "2026-04-30",
			"packaging_requirement": "彩盒 12 只/箱",
			"shipping_requirement":  "客户唛头",
			"finished_goods":        true,
		},
	}
}

func finishedGoodsInboundWorkflowTask() *WorkflowTask {
	sourceNo := "FG-IN-001"
	statusKey := workflowWarehouseInboundPendingKey
	return &WorkflowTask{
		ID:                1201,
		TaskCode:          "finished-goods-inbound-101",
		TaskGroup:         workflowFinishedGoodsInboundTaskGroup,
		TaskName:          "成品入库",
		SourceType:        workflowProductionProgressModuleKey,
		SourceID:          101,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          3,
		Payload: map[string]any{
			"record_title":               "小熊公仔入库",
			"source_no":                  "SO-2026-101",
			"customer_name":              "成慧怡",
			"style_no":                   "ST-001",
			"product_no":                 "SKU-101",
			"product_name":               "小熊公仔",
			"quantity":                   1200,
			"unit":                       "只",
			"due_date":                   "2026-04-28",
			"shipment_date":              "2026-04-30",
			"packaging_requirement":      "彩盒 12 只/箱",
			"shipping_requirement":       "客户唛头",
			"finished_goods":             true,
			"inventory_balance_deferred": true,
		},
	}
}

func shipmentReleaseWorkflowTask() *WorkflowTask {
	sourceNo := "SHIP-REL-001"
	statusKey := workflowShipmentPendingStatusKey
	return &WorkflowTask{
		ID:                1401,
		TaskCode:          "shipment-release-101",
		TaskGroup:         workflowShipmentReleaseTaskGroup,
		TaskName:          "出货放行 / 出货准备",
		SourceType:        workflowShippingReleaseModuleKey,
		SourceID:          101,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          3,
		Payload: map[string]any{
			"record_title":          "小熊公仔出货放行",
			"source_no":             "SO-2026-101",
			"customer_name":         "成慧怡",
			"style_no":              "ST-001",
			"product_no":            "SKU-101",
			"product_name":          "小熊公仔",
			"quantity":              1200,
			"unit":                  "只",
			"due_date":              "2026-04-28",
			"shipment_date":         "2026-04-30",
			"warehouse_location":    "FG-A-01",
			"packaging_requirement": "彩盒 12 只/箱",
			"shipping_requirement":  "客户唛头",
			"finished_goods":        true,
			"shipment_release":      true,
		},
	}
}

func ptrString(value string) *string {
	return &value
}

func assertRevisionTask(t *testing.T, task *WorkflowTaskCreate, decision string, reason string) {
	t.Helper()
	if task == nil {
		t.Fatalf("expected revision task")
	}
	if task.TaskGroup != workflowOrderRevisionTaskGroup ||
		task.TaskName != "补充订单资料后重新提交" ||
		task.OwnerRoleKey != SalesRoleKey ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected revision task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowOrderApprovalStatusKey {
		t.Fatalf("expected project_pending, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowProjectOrderModuleKey || task.SourceID != 88 {
		t.Fatalf("expected project order source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["rejected_reason"] != reason {
		t.Fatalf("expected rejected reason %q, got %#v", reason, task.Payload["rejected_reason"])
	}
	if task.Payload["decision"] != decision || task.Payload["transition_status"] != decision {
		t.Fatalf("expected decision %q payload, got %#v", decision, task.Payload)
	}
	if decision == "blocked" && task.Payload["blocked_reason"] != reason {
		t.Fatalf("expected blocked reason %q, got %#v", reason, task.Payload["blocked_reason"])
	}
	if task.Payload["notification_type"] != "task_rejected" ||
		task.Payload["alert_type"] != "approval_pending" {
		t.Fatalf("expected rejection alert payload, got %#v", task.Payload)
	}
}

func assertPurchaseQualityExceptionTask(t *testing.T, task *WorkflowTaskCreate, decision string, reason string) {
	t.Helper()
	if task == nil {
		t.Fatalf("expected purchase quality exception task")
	}
	if task.TaskGroup != workflowPurchaseQualityExceptionGroup ||
		task.TaskName != "处理来料不良 / 补货 / 退货" ||
		task.OwnerRoleKey != PurchaseRoleKey ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected purchase quality exception task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowAccessoriesPurchaseModuleKey || task.SourceID != 66 {
		t.Fatalf("expected purchase arrival source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["decision"] != decision || task.Payload["transition_status"] != decision {
		t.Fatalf("expected decision %q payload, got %#v", decision, task.Payload)
	}
	if task.Payload["rejected_reason"] != reason {
		t.Fatalf("expected rejected reason %q, got %#v", reason, task.Payload["rejected_reason"])
	}
	if decision == "blocked" && task.Payload["blocked_reason"] != reason {
		t.Fatalf("expected blocked reason %q, got %#v", reason, task.Payload["blocked_reason"])
	}
	if task.Payload["notification_type"] != "qc_failed" ||
		task.Payload["alert_type"] != "qc_failed" {
		t.Fatalf("expected qc_failed alert payload, got %#v", task.Payload)
	}
}

func assertOutsourceReworkTask(t *testing.T, task *WorkflowTaskCreate, decision string, reason string) {
	t.Helper()
	if task == nil {
		t.Fatalf("expected outsource rework task")
	}
	if task.TaskGroup != workflowOutsourceReworkTaskGroup ||
		task.TaskName != "委外返工 / 补做处理" ||
		task.OwnerRoleKey != "production" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected outsource rework task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowProcessingContractsModuleKey || task.SourceID != 99 {
		t.Fatalf("expected processing contract source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["decision"] != decision || task.Payload["transition_status"] != decision {
		t.Fatalf("expected decision %q payload, got %#v", decision, task.Payload)
	}
	if task.Payload["rejected_reason"] != reason {
		t.Fatalf("expected rejected reason %q, got %#v", reason, task.Payload["rejected_reason"])
	}
	if decision == "blocked" && task.Payload["blocked_reason"] != reason {
		t.Fatalf("expected blocked reason %q, got %#v", reason, task.Payload["blocked_reason"])
	}
	if task.Payload["qc_type"] != "outsource_return" ||
		task.Payload["outsource_processing"] != true ||
		task.Payload["outsource_owner_role_key"] != "outsource" {
		t.Fatalf("expected outsource payload markers, got %#v", task.Payload)
	}
	if task.Payload["notification_type"] != "qc_failed" ||
		task.Payload["alert_type"] != "qc_failed" {
		t.Fatalf("expected qc_failed alert payload, got %#v", task.Payload)
	}
}

func assertFinishedGoodsReworkTask(t *testing.T, task *WorkflowTaskCreate, decision string, reason string) {
	t.Helper()
	if task == nil {
		t.Fatalf("expected finished goods rework task")
	}
	if task.TaskGroup != workflowFinishedGoodsReworkTaskGroup ||
		task.TaskName != "成品返工处理" ||
		task.OwnerRoleKey != "production" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected finished goods rework task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowProductionProgressModuleKey || task.SourceID != 101 {
		t.Fatalf("expected production progress source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["decision"] != decision || task.Payload["transition_status"] != decision {
		t.Fatalf("expected decision %q payload, got %#v", decision, task.Payload)
	}
	if decision == "blocked" {
		if task.Payload["blocked_reason"] != reason {
			t.Fatalf("expected blocked reason %q, got %#v", reason, task.Payload["blocked_reason"])
		}
		if task.Payload["qc_result"] != "blocked" {
			t.Fatalf("expected blocked qc_result, got %#v", task.Payload["qc_result"])
		}
	} else {
		if task.Payload["rejected_reason"] != reason {
			t.Fatalf("expected rejected reason %q, got %#v", reason, task.Payload["rejected_reason"])
		}
		if task.Payload["qc_result"] != "rejected" {
			t.Fatalf("expected rejected qc_result, got %#v", task.Payload["qc_result"])
		}
	}
	if task.Payload["finished_goods"] != true {
		t.Fatalf("expected finished goods marker, got %#v", task.Payload)
	}
	if task.Payload["notification_type"] != "qc_failed" ||
		task.Payload["alert_type"] != "qc_failed" {
		t.Fatalf("expected qc_failed alert payload, got %#v", task.Payload)
	}
}
