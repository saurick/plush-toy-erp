package service

import (
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestWorkflowWorkbenchRoleTasksAllowsProjectedSuperAdminWithoutMobileRole(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	admin := workflowJSONRPCAdmin(nil)
	admin.IsSuperAdmin = true
	customerConfigUC := workflowWorkbenchCustomerConfigUC(
		"yoyoosun",
		[]string{biz.WarehouseRoleKey},
		map[string][]string{
			biz.WarehouseRoleKey: {
				biz.PermissionERPWorkbenchRead,
				biz.PermissionWorkflowTaskRead,
				biz.PermissionMobileWarehouseAccess,
			},
		},
	)
	dispatcher, repo := workflowWorkbenchTestDispatcher(admin, customerConfigUC)
	params := workflowWorkbenchRoleTaskParams(t, biz.WarehouseRoleKey)

	_, workbenchResult, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(),
		"list_workbench_role_tasks",
		"workbench-super-admin",
		params,
	)
	if err != nil || workbenchResult == nil || workbenchResult.Code != errcode.OK.Code {
		t.Fatalf("workbench result=%#v err=%v", workbenchResult, err)
	}
	if repo.roleQuery.RoleKey != biz.WarehouseRoleKey ||
		repo.roleQuery.VisibilityScope == nil ||
		!repo.roleQuery.VisibilityScope.StandaloneAllowAllOwnerRoles {
		t.Fatalf("workbench query=%#v", repo.roleQuery)
	}

	_, mobileResult, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(),
		"list_role_tasks",
		"mobile-super-admin",
		params,
	)
	if err != nil || mobileResult == nil || mobileResult.Code != errcode.PermissionDenied.Code {
		t.Fatalf("mobile result=%#v err=%v", mobileResult, err)
	}
}

func TestWorkflowWorkbenchReturnsOneBoundedSnapshotForProjectedRoles(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	admin := workflowJSONRPCAdmin(nil)
	admin.IsSuperAdmin = true
	customerConfigUC := workflowWorkbenchCustomerConfigUC(
		"yoyoosun",
		[]string{biz.WarehouseRoleKey},
		map[string][]string{
			biz.WarehouseRoleKey: {
				biz.PermissionERPWorkbenchRead,
				biz.PermissionWorkflowTaskRead,
			},
		},
	)
	dispatcher, repo := workflowWorkbenchTestDispatcher(admin, customerConfigUC)
	params := mustJSONRPCStruct(t, map[string]any{
		"queue_key": biz.WorkflowWorkbenchQueueActionable,
		"limit":     float64(8),
		"offset":    float64(0),
	})

	_, result, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(),
		"get_workbench",
		"workbench-snapshot",
		params,
	)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("workbench result=%#v err=%v", result, err)
	}
	query := repo.workbenchQuery
	if query.QueueKey != biz.WorkflowWorkbenchQueueActionable || query.Limit != 8 || query.Offset != 0 || query.SnapshotAt.IsZero() {
		t.Fatalf("workbench query=%#v", query)
	}
	if query.VisibilityScope == nil || query.RiskVisibilityScope == nil {
		t.Fatalf("workbench visibility scopes=%#v", query)
	}
	data := result.Data.AsMap()
	counts, ok := data["counts"].(map[string]any)
	if !ok || counts["actionable"] != float64(1) || counts["risk"] != float64(0) || counts["approval"] != float64(0) {
		t.Fatalf("workbench counts=%#v", data["counts"])
	}
	items, ok := data["items"].([]any)
	if !ok || len(items) != 1 || data["queue_key"] != biz.WorkflowWorkbenchQueueActionable || data["total"] != float64(1) {
		t.Fatalf("workbench data=%#v", data)
	}
}

func TestWorkflowWorkbenchRoleTasksRequiresBothEffectiveReadPermissions(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	for _, test := range []struct {
		name         string
		entitlements []string
	}{
		{
			name:         "missing workbench read",
			entitlements: []string{biz.PermissionWorkflowTaskRead},
		},
		{
			name:         "missing workflow task read",
			entitlements: []string{biz.PermissionERPWorkbenchRead},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			admin := workflowJSONRPCAdmin(
				[]string{biz.WarehouseRoleKey},
				biz.PermissionERPWorkbenchRead,
				biz.PermissionWorkflowTaskRead,
			)
			dispatcher, repo := workflowWorkbenchTestDispatcher(
				admin,
				workflowWorkbenchCustomerConfigUC(
					biz.DefaultCustomerKey,
					[]string{biz.WarehouseRoleKey},
					map[string][]string{biz.WarehouseRoleKey: test.entitlements},
				),
			)
			_, result, err := dispatcher.handleWorkflow(
				workflowJSONRPCAdminContext(),
				"list_workbench_role_tasks",
				test.name,
				workflowWorkbenchRoleTaskParams(t, biz.WarehouseRoleKey),
			)
			if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("result=%#v err=%v", result, err)
			}
			if repo.roleQuery.RoleKey != "" {
				t.Fatalf("denied request reached repository: %#v", repo.roleQuery)
			}

			_, workbenchResult, workbenchErr := dispatcher.handleWorkflow(
				workflowJSONRPCAdminContext(),
				"get_workbench",
				test.name+"-snapshot",
				mustJSONRPCStruct(t, map[string]any{
					"queue_key": biz.WorkflowWorkbenchQueueActionable,
					"limit":     float64(8),
					"offset":    float64(0),
				}),
			)
			if workbenchErr != nil || workbenchResult == nil || workbenchResult.Code != errcode.PermissionDenied.Code {
				t.Fatalf("workbench result=%#v err=%v", workbenchResult, workbenchErr)
			}
			if repo.workbenchQuery.QueueKey != "" {
				t.Fatalf("denied workbench reached repository: %#v", repo.workbenchQuery)
			}
		})
	}
}

func TestWorkflowWorkbenchRejectsUnknownOrInvalidPaginationParams(t *testing.T) {
	admin := workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionERPWorkbenchRead,
		biz.PermissionWorkflowTaskRead,
	)
	dispatcher, repo := workflowWorkbenchTestDispatcher(admin, nil)
	for _, params := range []map[string]any{
		{"queue_key": "unknown", "limit": float64(8), "offset": float64(0)},
		{"queue_key": biz.WorkflowWorkbenchQueueRisk, "limit": float64(0), "offset": float64(0)},
		{"queue_key": biz.WorkflowWorkbenchQueueRisk, "limit": float64(8), "offset": float64(-1)},
		{"queue_key": biz.WorkflowWorkbenchQueueRisk, "limit": float64(8), "offset": float64(0), "role_key": biz.WarehouseRoleKey},
	} {
		_, result, err := dispatcher.handleWorkflow(
			workflowJSONRPCAdminContext(),
			"get_workbench",
			"invalid-workbench",
			mustJSONRPCStruct(t, params),
		)
		if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
			t.Fatalf("params=%#v result=%#v err=%v", params, result, err)
		}
	}
	if repo.workbenchQuery.QueueKey != "" {
		t.Fatalf("invalid params reached repository: %#v", repo.workbenchQuery)
	}
}

func TestWorkflowWorkbenchRoleTasksRejectsRoleOutsideEffectiveProjection(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	admin := workflowJSONRPCAdmin(nil)
	admin.IsSuperAdmin = true
	dispatcher, repo := workflowWorkbenchTestDispatcher(
		admin,
		workflowWorkbenchCustomerConfigUC(
			"yoyoosun",
			[]string{biz.SalesRoleKey},
			map[string][]string{
				biz.SalesRoleKey: {
					biz.PermissionERPWorkbenchRead,
					biz.PermissionWorkflowTaskRead,
				},
			},
		),
	)

	_, result, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(),
		"list_workbench_role_tasks",
		"role-outside-projection",
		workflowWorkbenchRoleTaskParams(t, biz.WarehouseRoleKey),
	)
	if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("result=%#v err=%v", result, err)
	}
	if repo.roleQuery.RoleKey != "" {
		t.Fatalf("unprojected role reached repository: %#v", repo.roleQuery)
	}
}

func TestWorkflowWorkbenchRoleTasksWithoutCustomerConfigUsesActualRoles(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	for _, test := range []struct {
		name       string
		admin      *biz.AdminUser
		roleKey    string
		wantResult int32
	}{
		{
			name: "ordinary actual role",
			admin: workflowJSONRPCAdmin(
				[]string{biz.WarehouseRoleKey},
				biz.PermissionERPWorkbenchRead,
				biz.PermissionWorkflowTaskRead,
			),
			roleKey:    biz.WarehouseRoleKey,
			wantResult: errcode.OK.Code,
		},
		{
			name: "ordinary different role",
			admin: workflowJSONRPCAdmin(
				[]string{biz.WarehouseRoleKey},
				biz.PermissionERPWorkbenchRead,
				biz.PermissionWorkflowTaskRead,
			),
			roleKey:    biz.SalesRoleKey,
			wantResult: errcode.PermissionDenied.Code,
		},
		{
			name: "super admin without actual role",
			admin: func() *biz.AdminUser {
				admin := workflowJSONRPCAdmin(nil)
				admin.IsSuperAdmin = true
				return admin
			}(),
			roleKey:    biz.WarehouseRoleKey,
			wantResult: errcode.PermissionDenied.Code,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			dispatcher, repo := workflowWorkbenchTestDispatcher(test.admin, nil)
			_, result, err := dispatcher.handleWorkflow(
				workflowJSONRPCAdminContext(),
				"list_workbench_role_tasks",
				test.name,
				workflowWorkbenchRoleTaskParams(t, test.roleKey),
			)
			if err != nil || result == nil || result.Code != test.wantResult {
				t.Fatalf("result=%#v err=%v want=%d", result, err, test.wantResult)
			}
			if test.wantResult == errcode.OK.Code && repo.roleQuery.RoleKey != test.roleKey {
				t.Fatalf("allowed role query=%#v", repo.roleQuery)
			}
			if test.wantResult != errcode.OK.Code && repo.roleQuery.RoleKey != "" {
				t.Fatalf("denied role reached repository: %#v", repo.roleQuery)
			}
		})
	}
}

func TestWorkflowWorkbenchRoleTasksKeepsSupervisorReadOnlyRiskScope(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	admin := workflowJSONRPCAdmin(
		[]string{biz.PMCRoleKey},
		biz.PermissionERPWorkbenchRead,
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskSupervise,
	)
	dispatcher, repo := workflowWorkbenchTestDispatcher(admin, nil)

	_, result, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(),
		"list_workbench_role_tasks",
		"supervisor-risk",
		workflowWorkbenchRoleTaskParamsWithView(t, biz.PMCRoleKey, biz.WorkflowRoleTaskViewRisk),
	)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("result=%#v err=%v", result, err)
	}
	if !repo.roleQuery.CrossRoleRiskAllowed ||
		repo.roleQuery.VisibilityScope == nil ||
		!repo.roleQuery.VisibilityScope.StandaloneAllowAllOwnerRoles ||
		repo.roleQuery.VisibilityScope.VisibleAssigneeID != nil {
		t.Fatalf("supervisor query=%#v", repo.roleQuery)
	}
}

func workflowWorkbenchCustomerConfigUC(
	customerKey string,
	roleKeys []string,
	entitlementsByRole map[string][]string,
) *biz.CustomerConfigUsecase {
	repo := newServiceCustomerConfigRepo()
	revision := "workbench-active"
	key := serviceCustomerConfigKey(customerKey, revision)
	repo.revisions[key] = &biz.CustomerConfigRevision{
		CustomerKey: customerKey,
		Revision:    revision,
		Status:      biz.CustomerConfigStatusActive,
	}
	for _, roleKey := range biz.NormalizeAdminRoleKeys(roleKeys) {
		repo.profiles[key] = append(repo.profiles[key], biz.RoleProfileInput{
			RoleKey:     roleKey,
			DisplayName: roleKey,
		})
		for _, permissionKey := range entitlementsByRole[roleKey] {
			repo.entitlements[key] = append(repo.entitlements[key], biz.AccessEntitlementInput{
				RoleKey:       roleKey,
				CapabilityKey: permissionKey,
				ScopeType:     "customer",
				ScopeValue:    customerKey,
				Enabled:       true,
			})
		}
	}
	return biz.NewCustomerConfigUsecase(repo)
}

func workflowWorkbenchTestDispatcher(
	admin *biz.AdminUser,
	customerConfigUC *biz.CustomerConfigUsecase,
) (*jsonrpcDispatcher, *recordingWorkflowRevisionJSONRPCRepo) {
	repo := &recordingWorkflowRevisionJSONRPCRepo{}
	return &jsonrpcDispatcher{
		log: log.NewHelper(log.With(
			log.NewStdLogger(io.Discard),
			"module", "service.workflow_workbench_test",
		)),
		adminReader:      stubAdminAccountReader{admin: admin},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: customerConfigUC,
	}, repo
}

func workflowWorkbenchRoleTaskParams(t *testing.T, roleKey string) *structpb.Struct {
	t.Helper()
	return workflowWorkbenchRoleTaskParamsWithView(t, roleKey, biz.WorkflowRoleTaskViewTodo)
}

func workflowWorkbenchRoleTaskParamsWithView(
	t *testing.T,
	roleKey string,
	viewKey string,
) *structpb.Struct {
	t.Helper()
	return mustJSONRPCStruct(t, map[string]any{
		"view_key": viewKey,
		"role_key": roleKey,
		"limit":    float64(20),
	})
}
