package service

import (
	"io"
	"reflect"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func mobileReviewCustomerConfigRepo(customerKey string) *serviceCustomerConfigRepo {
	repo := newServiceCustomerConfigRepo()
	key := serviceCustomerConfigKey(customerKey, "mobile-review")
	repo.revisions[key] = &biz.CustomerConfigRevision{
		CustomerKey: customerKey, Revision: "mobile-review", ConfigHash: "review-hash", Status: biz.CustomerConfigStatusActive,
	}
	repo.modules[key] = []biz.DeploymentModuleStateInput{
		{ModuleKey: "workflow_tasks", State: "enabled"},
		{ModuleKey: "inventory", State: "enabled"},
		{ModuleKey: "sales_orders", State: "enabled"},
		{ModuleKey: "customers", State: "enabled"},
		{ModuleKey: "products", State: "enabled"},
	}
	for _, role := range []string{biz.BossRoleKey, biz.SalesRoleKey, biz.WarehouseRoleKey} {
		repo.profiles[key] = append(repo.profiles[key], biz.RoleProfileInput{RoleKey: role})
		for _, capability := range []string{biz.MobileRoleAccessPermission(role), biz.PermissionWorkflowTaskRead} {
			repo.entitlements[key] = append(repo.entitlements[key], biz.AccessEntitlementInput{
				RoleKey: role, CapabilityKey: capability, ScopeType: "customer", ScopeValue: customerKey, Enabled: true,
			})
		}
	}
	return repo
}

func TestWorkflowMobileReviewAllEnvironmentsAndPermissionBoundary(t *testing.T) {
	for _, customerKey := range []string{biz.DefaultCustomerKey, "review-customer"} {
		t.Run(customerKey, func(t *testing.T) {
			t.Setenv("ERP_CUSTOMER_KEY", customerKey)
			admin := workflowJSONRPCAdmin([]string{biz.AdminRoleKey})
			admin.IsSuperAdmin = true
			repo := &recordingWorkflowRevisionJSONRPCRepo{}
			config := mobileReviewCustomerConfigRepo(customerKey)
			dispatcher := &jsonrpcDispatcher{
				log: log.NewHelper(log.NewStdLogger(io.Discard)), adminReader: stubAdminAccountReader{admin: admin},
				workflowUC: biz.NewWorkflowUsecase(repo), customerConfigUC: biz.NewCustomerConfigUsecase(config),
			}
			call := func(role, cursor string) *v1.JsonrpcResult {
				t.Helper()
				_, result, err := dispatcher.handleWorkflow(workflowJSONRPCAdminContext(), "list_role_tasks", "review",
					mustJSONRPCStruct(t, map[string]any{"role_key": role, "view_key": "todo", "limit": float64(5), "cursor": cursor}))
				if err != nil || result == nil {
					t.Fatalf("result=%#v err=%v", result, err)
				}
				return result
			}
			first := call(biz.MobileAllRolesKey, "")
			if first.Code != errcode.OK.Code || !reflect.DeepEqual(repo.roleQuery.ReviewRoleKeys, []string{"boss", "sales", "warehouse"}) {
				t.Fatalf("all review result=%#v query=%#v", first, repo.roleQuery)
			}
			cursor := first.Data.AsMap()["next_cursor"].(string)
			if result := call(biz.MobileAllRolesKey, cursor); result.Code != errcode.OK.Code {
				t.Fatalf("pagination=%#v", result)
			}
			if result := call(biz.SalesRoleKey, ""); result.Code != errcode.OK.Code ||
				!reflect.DeepEqual(repo.roleQuery.ReviewRoleKeys, []string{"sales"}) || repo.roleQuery.CrossRoleRiskAllowed {
				t.Fatalf("single role review=%#v query=%#v", result, repo.roleQuery)
			}
			if result := call(biz.SalesRoleKey, cursor); result.Code != errcode.InvalidParam.Code {
				t.Fatalf("cross-role cursor must be rejected: %#v", result)
			}
			if result := call(biz.FinanceRoleKey, ""); result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("unconfigured role=%#v", result)
			}
			key := serviceCustomerConfigKey(customerKey, "mobile-review")
			for index, grant := range config.entitlements[key] {
				if grant.CapabilityKey == biz.PermissionMobileWarehouseAccess {
					config.entitlements[key][index].Enabled = false
				}
			}
			if result := call(biz.WarehouseRoleKey, ""); result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("revoked mobile action=%#v", result)
			}
			if result := call(biz.MobileAllRolesKey, cursor); result.Code != errcode.InvalidParam.Code {
				t.Fatalf("revoked-action cursor=%#v", result)
			}
			config.profiles[key][1].Disabled = true
			if result := call(biz.SalesRoleKey, ""); result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("disabled role=%#v", result)
			}
			if result := call(biz.MobileAllRolesKey, cursor); result.Code != errcode.InvalidParam.Code {
				t.Fatalf("revoked-scope cursor=%#v", result)
			}
			if !reflect.DeepEqual(biz.AdminRoleKeys(admin), []string{biz.AdminRoleKey}) {
				t.Fatal("review changed actor roles")
			}
			otherActor := admin.ID + 1
			if workflowAdminCanHandleTask(admin, &biz.WorkflowTask{TaskStatusKey: "ready", OwnerRoleKey: biz.SalesRoleKey, AssigneeID: &otherActor}, "done", []string{biz.SalesRoleKey}) {
				t.Fatal("review must not bypass task assignment")
			}
			admin.IsSuperAdmin = false
			admin.Permissions = []string{biz.PermissionWorkflowTaskRead, biz.PermissionMobileSalesAccess}
			for _, role := range []string{biz.MobileAllRolesKey, biz.SalesRoleKey, "unknown"} {
				if result := call(role, ""); result.Code != errcode.PermissionDenied.Code {
					t.Fatalf("ordinary admin forged scope %s: %#v", role, result)
				}
			}
		})
	}
}

func TestWorkflowMobileReviewRequiresActiveCustomerProjection(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	admin := workflowJSONRPCAdmin([]string{biz.AdminRoleKey})
	admin.IsSuperAdmin = true
	for _, uc := range []*biz.CustomerConfigUsecase{nil, biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo())} {
		dispatcher := &jsonrpcDispatcher{customerConfigUC: uc}
		if _, _, res := dispatcher.resolveActiveMobileRoleAccess(workflowJSONRPCAdminContext(), admin, biz.MobileAllRolesKey); res == nil || res.Code != errcode.PermissionDenied.Code {
			t.Fatalf("missing active projection must fail closed: %#v", res)
		}
	}
}
