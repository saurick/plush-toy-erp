package service

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

type recordingWorkflowRevisionJSONRPCRepo struct {
	stubWorkflowJSONRPCRepo
	listFilter biz.WorkflowTaskFilter
	boardQuery biz.WorkflowTaskBoardQuery
	roleQuery  biz.WorkflowRoleTaskViewQuery
}

func (r *recordingWorkflowRevisionJSONRPCRepo) ListWorkflowTasks(_ context.Context, filter biz.WorkflowTaskFilter) ([]*biz.WorkflowTask, int, error) {
	r.listFilter = filter
	return []*biz.WorkflowTask{}, 0, nil
}

func (r *recordingWorkflowRevisionJSONRPCRepo) GetWorkflowTaskBoard(_ context.Context, query biz.WorkflowTaskBoardQuery) (*biz.WorkflowTaskBoard, error) {
	r.boardQuery = query
	return &biz.WorkflowTaskBoard{SnapshotAt: query.SnapshotAt}, nil
}

func (r *recordingWorkflowRevisionJSONRPCRepo) ListWorkflowRoleTaskView(_ context.Context, query biz.WorkflowRoleTaskViewQuery) (*biz.WorkflowRoleTaskViewPage, error) {
	r.roleQuery = query
	return &biz.WorkflowRoleTaskViewPage{SnapshotAt: query.SnapshotAt}, nil
}

type workflowTaskRevisionErrorCustomerConfigRepo struct {
	biz.CustomerConfigRepo
	err error
}

func (r workflowTaskRevisionErrorCustomerConfigRepo) GetCustomerConfigRevision(context.Context, string, string) (*biz.CustomerConfigRevision, error) {
	return nil, r.err
}

func TestWorkflowTaskQueryVisibilityScopeKeepsRevisionPairsAcrossAllEntryPoints(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	customerConfigUC := workflowTaskRevisionCustomerConfigUC()
	admin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskRead)
	repo := &recordingWorkflowRevisionJSONRPCRepo{}
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_revision_test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: customerConfigUC,
	}
	ctx := workflowJSONRPCAdminContext()

	for _, call := range []struct {
		method string
		params map[string]any
	}{
		{method: "list_tasks", params: map[string]any{"limit": float64(20)}},
		{method: "list_role_tasks", params: map[string]any{"view_key": biz.WorkflowRoleTaskViewTodo, "role_key": biz.WarehouseRoleKey, "limit": float64(20)}},
		{method: "get_task_board", params: map[string]any{"limit": float64(5)}},
	} {
		_, result, err := dispatcher.handleWorkflow(ctx, call.method, call.method, mustJSONRPCStruct(t, call.params))
		if err != nil || result == nil || result.Code != errcode.OK.Code {
			t.Fatalf("%s result=%#v err=%v", call.method, result, err)
		}
	}

	for name, scope := range map[string]*biz.WorkflowTaskVisibilityScope{
		"list":      repo.listFilter.VisibilityScope,
		"role view": repo.roleQuery.VisibilityScope,
		"board":     repo.boardQuery.VisibilityScope,
	} {
		assertWorkflowRevisionScope(t, name, scope)
	}
	if repo.listFilter.VisibleOwnerRoleKeys != nil || repo.listFilter.VisibleAssigneeID != nil ||
		repo.boardQuery.VisibleOwnerRoleKeys != nil || repo.boardQuery.VisibleAssigneeID != nil ||
		repo.roleQuery.VisibleAssigneeID != nil {
		t.Fatal("entry points must pass paired revision scopes, not a flattened active-role union")
	}
}

func TestExpandWorkflowTaskVisibilityForSupervisionBroadensReadOnlyScope(t *testing.T) {
	adminID := 7
	base := &biz.WorkflowTaskVisibilityScope{
		VisibleAssigneeID:              &adminID,
		StandaloneVisibleOwnerRoleKeys: []string{biz.BossRoleKey},
		RevisionRoleScopes: []biz.WorkflowTaskRevisionRoleScope{
			{ConfigRevision: "rev-a", Status: biz.CustomerConfigStatusSuperseded, VisibleOwnerRoleKeys: []string{biz.BossRoleKey}},
			{ConfigRevision: "rev-b", Status: biz.CustomerConfigStatusActive, VisibleOwnerRoleKeys: []string{biz.BossRoleKey}},
		},
	}

	ordinary := expandWorkflowTaskVisibilityForSupervision(base, false)
	if ordinary == nil || ordinary.VisibleAssigneeID == nil || ordinary.StandaloneAllowAllOwnerRoles {
		t.Fatalf("ordinary scope=%#v", ordinary)
	}
	supervised := expandWorkflowTaskVisibilityForSupervision(base, true)
	if supervised == nil || supervised.VisibleAssigneeID != nil || !supervised.StandaloneAllowAllOwnerRoles {
		t.Fatalf("supervised scope=%#v", supervised)
	}
	for _, revision := range supervised.RevisionRoleScopes {
		if !revision.AllowAllOwnerRoles || len(revision.VisibleOwnerRoleKeys) != 0 {
			t.Fatalf("supervised revision=%#v", revision)
		}
	}
	if base.VisibleAssigneeID == nil || base.StandaloneAllowAllOwnerRoles {
		t.Fatalf("input scope mutated=%#v", base)
	}
}

func TestWorkflowTaskRoleVisibilityUsesImmutableRevisionForReadUpdateActionUrgeAndAssignee(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	admin := workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
		biz.PermissionWorkflowTaskReject,
	)
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_revision_test")),
		customerConfigUC: workflowTaskRevisionCustomerConfigUC(),
	}
	processID := 11
	nodeID := 12
	revision := "rev-a"
	ownerPool := "warehouse"
	task := &biz.WorkflowTask{
		ID:                    701,
		TaskGroup:             "generic",
		TaskStatusKey:         "ready",
		OwnerRoleKey:          biz.WarehouseRoleKey,
		OwnerPoolKey:          &ownerPool,
		ConfigRevision:        &revision,
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &nodeID,
	}

	read := dispatcher.workflowTaskRoleVisibilityForTask(context.Background(), admin, task, biz.PermissionWorkflowTaskRead)
	update := dispatcher.workflowTaskRoleVisibilityForTask(context.Background(), admin, task, biz.PermissionWorkflowTaskUpdate)
	complete := dispatcher.workflowTaskRoleVisibilityForTask(context.Background(), admin, task, biz.PermissionWorkflowTaskComplete)
	for name, visibility := range map[string]workflowTaskRoleVisibility{"read": read, "update": update, "complete": complete} {
		if !visibility.Valid || len(visibility.RoleKeys) != 1 || visibility.RoleKeys[0] != biz.WarehouseRoleKey {
			t.Fatalf("%s visibility=%#v", name, visibility)
		}
	}
	if !workflowAdminCanViewTask(admin, task, read.RoleKeys) ||
		!workflowAdminCanHandleTask(admin, task, "blocked", update.RoleKeys) ||
		!workflowAdminCanHandleTask(admin, task, "done", complete.RoleKeys) ||
		!workflowAdminCanUrgeTask(admin, task, update.RoleKeys) {
		t.Fatal("stored rev-a task lost read/update/action/urge authorization after rev-b became active")
	}
	actionRoles := dispatcher.workflowTaskActionCandidateOwnerRoleKeysMap(context.Background(), admin, task)
	if len(actionRoles) != 5 {
		t.Fatalf("available action roles=%#v", actionRoles)
	}

	revision = "rev-b"
	assigneeID := admin.ID
	assigned := *task
	assigned.ConfigRevision = &revision
	assigned.AssigneeID = &assigneeID
	assignedVisibility := dispatcher.workflowTaskRoleVisibilityForTask(context.Background(), admin, &assigned, biz.PermissionWorkflowTaskRead)
	if assignedVisibility.Valid || len(assignedVisibility.RoleKeys) != 0 {
		t.Fatalf("rev-b direct assignee without entitlement must fail closed=%#v", assignedVisibility)
	}

	crossPool := "approval.other"
	crossPoolTask := *task
	crossPoolTask.ConfigRevision = workflowRevisionStringPtr("rev-a")
	crossPoolTask.OwnerPoolKey = &crossPool
	if visibility := dispatcher.workflowTaskRoleVisibilityForTask(
		context.Background(), admin, &crossPoolTask, biz.PermissionWorkflowTaskRead,
	); visibility.Valid {
		t.Fatalf("same role in a different owner pool must fail closed=%#v", visibility)
	}
}

func TestWorkflowTaskRoleVisibilityKeepsQualifiedFrozenApprovalAssigneeAfterPrimaryReturns(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	backup := workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskApprove,
	)
	primary := &biz.AdminUser{
		ID:    8,
		Roles: []biz.AdminRole{{Key: biz.BossRoleKey}},
	}
	repo := newServiceCustomerConfigRepo()
	revision := "approval-rev-a"
	key := serviceCustomerConfigKey(biz.DefaultCustomerKey, revision)
	repo.revisions[key] = &biz.CustomerConfigRevision{
		CustomerKey: biz.DefaultCustomerKey,
		Revision:    revision,
		Status:      biz.CustomerConfigStatusActive,
	}
	repo.profiles[key] = []biz.RoleProfileInput{
		{RoleKey: biz.SalesRoleKey, DisplayName: "业务"},
		{RoleKey: biz.BossRoleKey, DisplayName: "老板"},
	}
	for _, roleKey := range []string{biz.SalesRoleKey, biz.BossRoleKey} {
		for _, capability := range []string{
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
			biz.PermissionWorkflowTaskApprove,
		} {
			repo.entitlements[key] = append(repo.entitlements[key], biz.AccessEntitlementInput{
				RoleKey: roleKey, CapabilityKey: capability,
				ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true,
			})
		}
	}
	repo.memberships[key] = []biz.WorkPoolMembershipInput{
		{
			PoolKey: "approval.sales_order", RoleKey: biz.BossRoleKey, UserID: primary.ID,
			Strategy: biz.ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
		},
		{
			PoolKey: "approval.sales_order", RoleKey: biz.SalesRoleKey, UserID: backup.ID,
			Strategy: biz.ApprovalMemberStrategyBackup, Priority: 200, Enabled: true,
		},
	}
	adminDirectory := newMemAdminManageRepoForData()
	adminDirectory.admins = map[int]*biz.AdminUser{
		backup.ID:  backup,
		primary.ID: primary,
	}
	dispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(
			log.NewStdLogger(io.Discard),
			"module",
			"service.workflow_revision_test",
		)),
		customerConfigUC: biz.NewCustomerConfigUsecaseForWire(repo, adminDirectory),
	}
	processID := 11
	nodeID := 12
	poolKey := "approval.sales_order"
	assigneeID := backup.ID
	task := &biz.WorkflowTask{
		ID:                    711,
		TaskStatusKey:         "ready",
		OwnerRoleKey:          biz.SalesRoleKey,
		OwnerPoolKey:          &poolKey,
		AssigneeID:            &assigneeID,
		ConfigRevision:        &revision,
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &nodeID,
	}

	visibility := dispatcher.workflowTaskRoleVisibilityForTask(
		context.Background(),
		backup,
		task,
		biz.PermissionWorkflowTaskApprove,
	)
	if !visibility.Valid ||
		len(visibility.RoleKeys) != 1 ||
		visibility.RoleKeys[0] != biz.SalesRoleKey {
		t.Fatalf("frozen backup visibility = %#v", visibility)
	}
	if !workflowAdminCanViewTask(backup, task, visibility.RoleKeys) ||
		!workflowAdminCanHandleTask(backup, task, "done", visibility.RoleKeys) {
		t.Fatal("qualified frozen backup must remain able to view and handle the assigned approval")
	}

	backup.Roles = nil
	visibility = dispatcher.workflowTaskRoleVisibilityForTask(
		context.Background(),
		backup,
		task,
		biz.PermissionWorkflowTaskApprove,
	)
	if visibility.Valid || len(visibility.RoleKeys) != 0 {
		t.Fatalf("removed backup role must fail closed = %#v", visibility)
	}
}

func TestWorkflowTaskRoleVisibilityRejectsPublishedUnknownMismatchedAndIncompleteAnchors(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	admin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskRead)
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_revision_test")),
		customerConfigUC: workflowTaskRevisionCustomerConfigUC(),
	}
	processID := 11
	nodeID := 12
	zero := 0
	negative := -1
	assigneeID := admin.ID

	tests := []struct {
		name      string
		revision  *string
		processID *int
		nodeID    *int
	}{
		{name: "published", revision: workflowRevisionStringPtr("published-only"), processID: &processID, nodeID: &nodeID},
		{name: "unknown", revision: workflowRevisionStringPtr("unknown"), processID: &processID, nodeID: &nodeID},
		{name: "revision only", revision: workflowRevisionStringPtr("rev-a")},
		{name: "missing node", revision: workflowRevisionStringPtr("rev-a"), processID: &processID},
		{name: "missing process", revision: workflowRevisionStringPtr("rev-a"), nodeID: &nodeID},
		{name: "zero process", revision: workflowRevisionStringPtr("rev-a"), processID: &zero, nodeID: &nodeID},
		{name: "negative process", revision: workflowRevisionStringPtr("rev-a"), processID: &negative, nodeID: &nodeID},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			task := &biz.WorkflowTask{
				ID:                    702,
				TaskStatusKey:         "ready",
				OwnerRoleKey:          biz.WarehouseRoleKey,
				AssigneeID:            &assigneeID,
				ConfigRevision:        test.revision,
				ProcessInstanceID:     test.processID,
				ProcessNodeInstanceID: test.nodeID,
			}
			visibility := dispatcher.workflowTaskRoleVisibilityForTask(context.Background(), admin, task, biz.PermissionWorkflowTaskRead)
			if visibility.Valid || len(visibility.RoleKeys) != 0 {
				t.Fatalf("visibility=%#v", visibility)
			}
		})
	}

	legacy := &biz.WorkflowTask{ID: 703, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey}
	legacyDispatcher := &jsonrpcDispatcher{log: dispatcher.log}
	legacyVisibility := legacyDispatcher.workflowTaskRoleVisibilityForTask(context.Background(), admin, legacy, biz.PermissionWorkflowTaskRead)
	if !legacyVisibility.Valid || len(legacyVisibility.RoleKeys) != 1 || legacyVisibility.RoleKeys[0] != biz.WarehouseRoleKey {
		t.Fatalf("legacy default visibility=%#v", legacyVisibility)
	}

	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	mismatched := &biz.WorkflowTask{
		ID: 704, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey,
		ConfigRevision: workflowRevisionStringPtr("rev-a"), ProcessInstanceID: &processID, ProcessNodeInstanceID: &nodeID,
	}
	if visibility := dispatcher.workflowTaskRoleVisibilityForTask(context.Background(), admin, mismatched, biz.PermissionWorkflowTaskRead); visibility.Valid {
		t.Fatalf("customer-mismatched visibility=%#v", visibility)
	}
}

func TestWorkflowTaskRoleVisibilityRepositoryErrorAndPublishedTaskEndpointFailClosed(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	admin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskRead)
	baseUC := workflowTaskRevisionCustomerConfigUC()
	repoErr := errors.New("revision projection unavailable")
	errorDispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_revision_test")),
		customerConfigUC: biz.NewCustomerConfigUsecase(workflowTaskRevisionErrorCustomerConfigRepo{
			CustomerConfigRepo: newServiceCustomerConfigRepo(),
			err:                repoErr,
		}),
	}
	processID := 11
	nodeID := 12
	task := &biz.WorkflowTask{
		ID: 705, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey,
		ConfigRevision: workflowRevisionStringPtr("rev-a"), ProcessInstanceID: &processID, ProcessNodeInstanceID: &nodeID,
	}
	if visibility := errorDispatcher.workflowTaskRoleVisibilityForTask(context.Background(), admin, task, biz.PermissionWorkflowTaskRead); visibility.Valid {
		t.Fatalf("repository error visibility=%#v", visibility)
	}

	assigneeID := admin.ID
	publishedTask := *task
	publishedTask.ConfigRevision = workflowRevisionStringPtr("published-only")
	publishedTask.AssigneeID = &assigneeID
	workflowRepo := &stubWorkflowJSONRPCRepo{currentTask: &publishedTask}
	dispatcher := newCustomerConfigTestDispatcher(admin, []string{biz.WarehouseRoleKey})
	dispatcher.customerConfigUC = baseUC
	dispatcher.workflowUC = biz.NewWorkflowUsecase(workflowRepo)
	_, result, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(),
		"explain_action_access",
		"published-task",
		mustJSONRPCStruct(t, map[string]any{"task_id": float64(publishedTask.ID)}),
	)
	if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("published task endpoint result=%#v err=%v", result, err)
	}
	explanation := dispatcher.workflowTaskConfiguredCandidateExplanation(context.Background(), &publishedTask, biz.PermissionWorkflowTaskRead)
	if explanation.Source != "customer_config_error" || len(explanation.CandidateOwnerRoleKeys) != 0 {
		t.Fatalf("published candidate explanation=%#v", explanation)
	}
}

func workflowTaskRevisionCustomerConfigUC() *biz.CustomerConfigUsecase {
	repo := newServiceCustomerConfigRepo()
	for _, item := range []struct {
		revision string
		status   string
		grant    bool
	}{
		{revision: "rev-a", status: biz.CustomerConfigStatusSuperseded, grant: true},
		{revision: "rev-b", status: biz.CustomerConfigStatusActive},
		{revision: "published-only", status: biz.CustomerConfigStatusPublished, grant: true},
	} {
		key := serviceCustomerConfigKey(biz.DefaultCustomerKey, item.revision)
		repo.revisions[key] = &biz.CustomerConfigRevision{
			CustomerKey: biz.DefaultCustomerKey,
			Revision:    item.revision,
			Status:      item.status,
		}
		repo.profiles[key] = []biz.RoleProfileInput{{RoleKey: biz.WarehouseRoleKey, DisplayName: "仓库"}}
		repo.memberships[key] = []biz.WorkPoolMembershipInput{{PoolKey: "warehouse", RoleKey: biz.WarehouseRoleKey, Enabled: true}}
		if item.grant {
			for _, capability := range []string{
				biz.PermissionWorkflowTaskRead,
				biz.PermissionWorkflowTaskUpdate,
				biz.PermissionWorkflowTaskComplete,
				biz.PermissionWorkflowTaskReject,
			} {
				repo.entitlements[key] = append(repo.entitlements[key], biz.AccessEntitlementInput{
					RoleKey:       biz.WarehouseRoleKey,
					CapabilityKey: capability,
					ScopeType:     "customer",
					ScopeValue:    biz.DefaultCustomerKey,
					Enabled:       true,
				})
			}
		}
	}
	return biz.NewCustomerConfigUsecase(repo)
}

func assertWorkflowRevisionScope(t *testing.T, name string, scope *biz.WorkflowTaskVisibilityScope) {
	t.Helper()
	scope = biz.NormalizeWorkflowTaskVisibilityScope(scope)
	if scope == nil || scope.VisibleAssigneeID == nil || *scope.VisibleAssigneeID != 7 || len(scope.RevisionRoleScopes) != 2 {
		t.Fatalf("%s scope=%#v", name, scope)
	}
	byRevision := map[string]biz.WorkflowTaskRevisionRoleScope{}
	for _, item := range scope.RevisionRoleScopes {
		byRevision[item.ConfigRevision] = item
	}
	if roles := byRevision["rev-a"].VisibleOwnerRoleKeys; len(roles) != 1 || roles[0] != biz.WarehouseRoleKey {
		t.Fatalf("%s rev-a roles=%#v", name, roles)
	}
	if roles := byRevision["rev-b"].VisibleOwnerRoleKeys; len(roles) != 0 {
		t.Fatalf("%s rev-b roles=%#v", name, roles)
	}
	if _, exists := byRevision["published-only"]; exists {
		t.Fatalf("%s published revision leaked into query scope", name)
	}
	if len(scope.StandaloneVisibleOwnerRoleKeys) != 0 {
		t.Fatalf("%s standalone roles must remain empty for revision-bound visibility, got %#v", name, scope.StandaloneVisibleOwnerRoleKeys)
	}
}

func workflowRevisionStringPtr(value string) *string {
	return &value
}
