package service

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

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
	page := &biz.WorkflowRoleTaskViewPage{SnapshotAt: query.SnapshotAt}
	counts := biz.WorkflowRoleTaskViewCounts{
		Ready: 8, Blocked: 4, Todo: 12,
		Done: 2, Rejected: 1, History: 3, Total: 15,
		Approval: 3, Risk: 4, Overdue: 2,
	}
	if query.IncludeCounts {
		if len(query.ApprovalVisibilityScopes) == 0 {
			counts.Approval = 0
		}
		page.Counts = &counts
	}
	viewTotal, _ := counts.ViewTotal(query.ViewKey)
	for id := viewTotal; id > 0; id-- {
		if query.BeforeID > 0 && id >= query.BeforeID {
			continue
		}
		status := "ready"
		if query.ViewKey == biz.WorkflowRoleTaskViewHistory {
			status = "done"
		}
		page.Items = append(page.Items, &biz.WorkflowTask{ID: id, Version: 1, TaskStatusKey: status})
	}
	if len(page.Items) > query.Limit {
		page.Items = page.Items[:query.Limit]
		page.HasMore = true
		page.NextID = page.Items[len(page.Items)-1].ID
	}
	return page, nil
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
	admin := workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionMobileWarehouseAccess,
	)
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

func TestWorkflowMobileRoleTaskFirstPageReturnsAuthoritativeCounts(t *testing.T) {
	admin := workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionMobileSalesAccess,
	)
	repo := &recordingWorkflowRevisionJSONRPCRepo{}
	dispatcher := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_mobile_counts_test")),
		adminReader: stubAdminAccountReader{admin: admin},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"view_key": biz.WorkflowRoleTaskViewTodo,
		"role_key": biz.SalesRoleKey,
		"limit":    float64(20),
	})
	_, result, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(), "list_role_tasks", "mobile-counts", params,
	)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("first page result=%#v err=%v", result, err)
	}
	if !repo.roleQuery.IncludeCounts || len(repo.roleQuery.ApprovalVisibilityScopes) != 0 {
		t.Fatalf("first page query=%#v", repo.roleQuery)
	}
	if repo.roleQuery.SnapshotAt.Nanosecond() != 0 || repo.roleQuery.SnapshotAt.Location() != time.UTC {
		t.Fatalf("snapshot=%s, want whole UTC second", repo.roleQuery.SnapshotAt)
	}
	counts, ok := result.Data.AsMap()["counts"].(map[string]any)
	if !ok || counts["ready"] != float64(8) || counts["blocked"] != float64(4) ||
		counts["todo"] != float64(12) || counts["done"] != float64(2) ||
		counts["rejected"] != float64(1) || counts["history"] != float64(3) ||
		counts["total"] != float64(15) || counts["approval"] != float64(0) ||
		counts["risk"] != float64(4) || counts["overdue"] != float64(2) {
		t.Fatalf("counts=%#v", counts)
	}
	if result.Data.AsMap()["risk_scope"] != workflowRoleTaskRiskScopeRole {
		t.Fatalf("risk_scope=%#v", result.Data.AsMap()["risk_scope"])
	}

	cursor := encodeWorkflowRoleTaskViewCursor(workflowRoleTaskViewCursor{
		Method:        "list_role_tasks",
		ViewKey:       biz.WorkflowRoleTaskViewTodo,
		RoleKey:       biz.SalesRoleKey,
		BeforeID:      1,
		SnapshotUnix:  repo.roleQuery.SnapshotAt.Unix(),
		ExpectedTotal: 12,
		SeenTotal:     12,
		RiskScope:     workflowRoleTaskRiskScopeRole,
	})
	cursorParams := mustJSONRPCStruct(t, map[string]any{
		"view_key": biz.WorkflowRoleTaskViewTodo,
		"role_key": biz.SalesRoleKey,
		"limit":    float64(20),
		"cursor":   cursor,
	})
	_, cursorResult, cursorErr := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(), "list_role_tasks", "mobile-counts-cursor", cursorParams,
	)
	if cursorErr != nil || cursorResult == nil || cursorResult.Code != errcode.OK.Code {
		t.Fatalf("cursor result=%#v err=%v", cursorResult, cursorErr)
	}
	if repo.roleQuery.IncludeCounts {
		t.Fatalf("cursor query unexpectedly requested counts: %#v", repo.roleQuery)
	}
	if _, exists := cursorResult.Data.AsMap()["counts"]; exists {
		t.Fatalf("cursor response unexpectedly returned counts: %#v", cursorResult.Data.AsMap())
	}

	approvalParams := mustJSONRPCStruct(t, map[string]any{
		"view_key": biz.WorkflowRoleTaskViewApproval,
		"role_key": biz.SalesRoleKey,
		"limit":    float64(20),
	})
	_, approvalResult, approvalErr := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(), "list_role_tasks", "mobile-counts-approval-denied", approvalParams,
	)
	if approvalErr != nil || approvalResult == nil || approvalResult.Code != errcode.PermissionDenied.Code {
		t.Fatalf("approval result=%#v err=%v", approvalResult, approvalErr)
	}
}

func TestWorkflowMobileRoleTaskCountsKeepSupervisorRiskScopeOnTodoPage(t *testing.T) {
	admin := workflowJSONRPCAdmin(
		[]string{biz.BossRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskSupervise,
		biz.PermissionMobileBossAccess,
	)
	repo := &recordingWorkflowRevisionJSONRPCRepo{}
	dispatcher := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_mobile_supervisor_counts_test")),
		adminReader: stubAdminAccountReader{admin: admin},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	_, result, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(),
		"list_role_tasks",
		"mobile-supervisor-counts",
		mustJSONRPCStruct(t, map[string]any{
			"view_key": biz.WorkflowRoleTaskViewTodo,
			"role_key": biz.BossRoleKey,
			"limit":    float64(20),
		}),
	)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("result=%#v err=%v", result, err)
	}
	if !repo.roleQuery.IncludeCounts || !repo.roleQuery.CrossRoleRiskAllowed {
		t.Fatalf("supervisor count query=%#v", repo.roleQuery)
	}
	if result.Data.AsMap()["risk_scope"] != workflowRoleTaskRiskScopeSupervised {
		t.Fatalf("risk_scope=%#v", result.Data.AsMap()["risk_scope"])
	}
}

func TestWorkflowMobileRoleTaskRiskScopeUsesEffectiveSupervisePermission(t *testing.T) {
	for _, testCase := range []struct {
		name          string
		roles         []string
		permissions   []string
		superAdmin    bool
		wantSupervise bool
	}{
		{
			name:        "boss role without permission stays role local",
			roles:       []string{biz.BossRoleKey},
			permissions: []string{biz.PermissionWorkflowTaskRead, biz.PermissionMobileBossAccess},
		},
		{
			name:          "ordinary role with permission receives supervised risk",
			roles:         []string{biz.SalesRoleKey},
			permissions:   []string{biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskSupervise, biz.PermissionMobileSalesAccess},
			wantSupervise: true,
		},
		{
			name:          "super admin receives supervised risk",
			roles:         []string{biz.BossRoleKey},
			permissions:   []string{biz.PermissionWorkflowTaskRead, biz.PermissionMobileBossAccess},
			superAdmin:    true,
			wantSupervise: true,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			admin := workflowJSONRPCAdmin(testCase.roles, testCase.permissions...)
			admin.IsSuperAdmin = testCase.superAdmin
			repo := &recordingWorkflowRevisionJSONRPCRepo{}
			dispatcher := &jsonrpcDispatcher{
				log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_mobile_supervise_permission_test")),
				adminReader: stubAdminAccountReader{admin: admin},
				workflowUC:  biz.NewWorkflowUsecase(repo),
			}
			roleKey := testCase.roles[0]
			_, result, err := dispatcher.handleWorkflow(
				workflowJSONRPCAdminContext(),
				"list_role_tasks",
				"mobile-supervise-permission",
				mustJSONRPCStruct(t, map[string]any{
					"view_key": biz.WorkflowRoleTaskViewTodo,
					"role_key": roleKey,
					"limit":    float64(20),
				}),
			)
			if err != nil || result == nil || result.Code != errcode.OK.Code {
				t.Fatalf("result=%#v err=%v", result, err)
			}
			if repo.roleQuery.CrossRoleRiskAllowed != testCase.wantSupervise {
				t.Fatalf("query=%#v want supervise=%t", repo.roleQuery, testCase.wantSupervise)
			}
			wantScope := workflowRoleTaskRiskScopeRole
			if testCase.wantSupervise {
				wantScope = workflowRoleTaskRiskScopeSupervised
			}
			if result.Data.AsMap()["risk_scope"] != wantScope {
				t.Fatalf("risk_scope=%#v want=%s", result.Data.AsMap()["risk_scope"], wantScope)
			}
		})
	}
}

func TestWorkflowMobileRoleTaskCursorBindsMethodRoleViewScopeAndExpectedTotal(t *testing.T) {
	admin := workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionMobileSalesAccess,
	)
	repo := &recordingWorkflowRevisionJSONRPCRepo{}
	dispatcher := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_mobile_cursor_binding_test")),
		adminReader: stubAdminAccountReader{admin: admin},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	_, first, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(),
		"list_role_tasks",
		"mobile-cursor-first",
		mustJSONRPCStruct(t, map[string]any{
			"view_key": biz.WorkflowRoleTaskViewTodo,
			"role_key": biz.SalesRoleKey,
			"limit":    float64(5),
		}),
	)
	if err != nil || first == nil || first.Code != errcode.OK.Code {
		t.Fatalf("first=%#v err=%v", first, err)
	}
	cursor, _ := first.Data.AsMap()["next_cursor"].(string)
	if cursor == "" {
		t.Fatalf("first page missing cursor: %#v", first.Data.AsMap())
	}
	for name, params := range map[string]map[string]any{
		"different view": {
			"view_key": biz.WorkflowRoleTaskViewRisk,
			"role_key": biz.SalesRoleKey,
			"limit":    float64(20),
			"cursor":   cursor,
		},
		"different role": {
			"view_key": biz.WorkflowRoleTaskViewTodo,
			"role_key": biz.WarehouseRoleKey,
			"limit":    float64(20),
			"cursor":   cursor,
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, result, callErr := dispatcher.handleWorkflow(
				workflowJSONRPCAdminContext(), "list_role_tasks", name, mustJSONRPCStruct(t, params),
			)
			if callErr != nil || result == nil || result.Code != errcode.InvalidParam.Code {
				t.Fatalf("result=%#v err=%v", result, callErr)
			}
		})
	}
	tampered := encodeWorkflowRoleTaskViewCursor(workflowRoleTaskViewCursor{
		Method: "list_role_tasks", ViewKey: biz.WorkflowRoleTaskViewTodo, RoleKey: biz.SalesRoleKey,
		BeforeID: 8, SnapshotUnix: time.Now().Unix(), ExpectedTotal: 13, SeenTotal: 5,
		RiskScope: workflowRoleTaskRiskScopeRole,
	})
	_, drifted, driftErr := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(), "list_role_tasks", "cursor-drift",
		mustJSONRPCStruct(t, map[string]any{
			"view_key": biz.WorkflowRoleTaskViewTodo,
			"role_key": biz.SalesRoleKey,
			"limit":    float64(20),
			"cursor":   tampered,
		}),
	)
	if driftErr != nil || drifted == nil || drifted.Code != errcode.InvalidParam.Code {
		t.Fatalf("drifted=%#v err=%v", drifted, driftErr)
	}
}

func TestWorkflowRoleTaskViewRequiresActiveMobileRoleEntitlement(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	admin := workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionMobileWarehouseAccess,
	)
	configRepo := newServiceCustomerConfigRepo()
	key := serviceCustomerConfigKey(biz.DefaultCustomerKey, "rev-mobile")
	configRepo.revisions[key] = &biz.CustomerConfigRevision{
		CustomerKey: biz.DefaultCustomerKey,
		Revision:    "rev-mobile",
		Status:      biz.CustomerConfigStatusActive,
	}
	configRepo.profiles[key] = []biz.RoleProfileInput{{
		RoleKey: biz.WarehouseRoleKey, DisplayName: "仓库",
	}}
	configRepo.modules[key] = []biz.DeploymentModuleStateInput{
		{ModuleKey: "inventory", State: "enabled"},
		{ModuleKey: "workflow_tasks", State: "enabled"},
	}
	configRepo.entitlements[key] = []biz.AccessEntitlementInput{{
		RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskRead,
		ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true,
	}}
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_mobile_access_test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		workflowUC:       biz.NewWorkflowUsecase(&recordingWorkflowRevisionJSONRPCRepo{}),
		customerConfigUC: biz.NewCustomerConfigUsecase(configRepo),
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"view_key": biz.WorkflowRoleTaskViewTodo,
		"role_key": biz.WarehouseRoleKey,
		"limit":    float64(20),
	})
	_, result, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(), "list_role_tasks", "mobile-denied", params,
	)
	if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}

func TestWorkflowApprovalRoleViewsUseSpecializedCapabilityScope(t *testing.T) {
	admin := workflowJSONRPCAdmin(
		[]string{biz.FinanceRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionERPWorkbenchRead,
		biz.PermissionMobileFinanceAccess,
		biz.PermissionFinancePaymentApprove,
	)
	repo := &recordingWorkflowRevisionJSONRPCRepo{}
	dispatcher := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_approval_role_view_test")),
		adminReader: stubAdminAccountReader{admin: admin},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"view_key": biz.WorkflowRoleTaskViewApproval,
		"role_key": biz.FinanceRoleKey,
		"limit":    float64(20),
	})
	for _, method := range []string{"list_role_tasks", "list_workbench_role_tasks"} {
		repo.roleQuery = biz.WorkflowRoleTaskViewQuery{}
		_, result, err := dispatcher.handleWorkflow(
			workflowJSONRPCAdminContext(),
			method,
			method+"-approval",
			params,
		)
		if err != nil || result == nil || result.Code != errcode.OK.Code {
			t.Fatalf("%s result=%#v err=%v", method, result, err)
		}
		if repo.roleQuery.ViewKey != biz.WorkflowRoleTaskViewApproval ||
			repo.roleQuery.VisibilityScope == nil ||
			len(repo.roleQuery.ApprovalVisibilityScopes) != 1 ||
			repo.roleQuery.ApprovalVisibilityScopes[0].CapabilityKey != biz.PermissionFinancePaymentApprove {
			t.Fatalf("%s approval query=%#v", method, repo.roleQuery)
		}
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
		if item.status == biz.CustomerConfigStatusActive {
			repo.modules[key] = []biz.DeploymentModuleStateInput{
				{ModuleKey: "inventory", State: "enabled"},
				{ModuleKey: "workflow_tasks", State: "enabled"},
			}
			repo.entitlements[key] = append(repo.entitlements[key], biz.AccessEntitlementInput{
				RoleKey:       biz.WarehouseRoleKey,
				CapabilityKey: biz.PermissionMobileWarehouseAccess,
				ScopeType:     "customer",
				ScopeValue:    biz.DefaultCustomerKey,
				Enabled:       true,
			})
		}
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
