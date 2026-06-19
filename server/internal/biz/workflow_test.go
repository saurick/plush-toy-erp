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

func TestWorkflowUsecase_CreateTaskRejectsNumberedPhaseLabels(t *testing.T) {
	uc := NewWorkflowUsecase(&stubWorkflowRepo{})
	sourceNo := "SIM-YOYOOSUN-" + "PHASE" + "9-QC"

	_, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
		TaskCode:     "SIM-YOYOOSUN-MOBILE-WORKFLOW-QC",
		TaskGroup:    "finished_goods_qc",
		TaskName:     "Mobile workflow 模拟成品抽检",
		SourceType:   "production-progress",
		SourceID:     1,
		SourceNo:     &sourceNo,
		OwnerRoleKey: QualityRoleKey,
		Payload: map[string]any{
			"record_title": "Phase" + " 9 模拟产品",
		},
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
}

func TestWorkflowUsecase_UpdateTaskRejectsNumberedPhaseLabels(t *testing.T) {
	repo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:            1,
			TaskGroup:     "generic",
			TaskName:      "普通任务",
			SourceType:    "generic-source",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  WarehouseRoleKey,
			Payload:       map[string]any{},
		},
	}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1,
		TaskStatusKey: "blocked",
		Reason:        "Phase" + " 9 模拟异常",
		Payload: map[string]any{
			"blocked_reason": "Phase" + " 9 模拟异常",
		},
	}, 7, WarehouseRoleKey)
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
