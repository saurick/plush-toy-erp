package biz

import (
	"context"
	"errors"
	"testing"
)

type workflowTaskAuthorizationRevisionErrorRepo struct {
	CustomerConfigRepo
	err error
}

func (r workflowTaskAuthorizationRevisionErrorRepo) ListWorkflowTaskAuthorizationRevisions(context.Context, string) ([]WorkflowTaskAuthorizationRevision, error) {
	return nil, r.err
}

func TestCustomerConfigUsecaseWorkflowTaskRevisionRoleScopesKeepsRevisionPairsAndRejectsPublished(t *testing.T) {
	repo := newMemCustomerConfigRepo()
	for _, item := range []struct {
		revision string
		status   string
		grant    bool
	}{
		{revision: "rev-a", status: CustomerConfigStatusSuperseded, grant: true},
		{revision: "rev-b", status: CustomerConfigStatusActive},
		{revision: "published-only", status: CustomerConfigStatusPublished, grant: true},
	} {
		key := customerRevisionKey(DefaultCustomerKey, item.revision)
		repo.revisions[key] = &CustomerConfigRevision{CustomerKey: DefaultCustomerKey, Revision: item.revision, Status: item.status}
		repo.roles[key] = []RoleProfileInput{{RoleKey: WarehouseRoleKey, DisplayName: "仓库"}}
		if item.grant {
			repo.entitlements[key] = []AccessEntitlementInput{{
				RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskRead,
				ScopeType: "customer", ScopeValue: DefaultCustomerKey, Enabled: true,
			}}
		}
	}
	uc := NewCustomerConfigUsecase(repo)
	scopes, err := uc.WorkflowTaskRevisionRoleScopes(
		context.Background(),
		DefaultCustomerKey,
		&AdminUser{ID: 7, Roles: []AdminRole{{Key: WarehouseRoleKey}}},
		PermissionWorkflowTaskRead,
	)
	if err != nil {
		t.Fatalf("revision scopes: %v", err)
	}
	if len(scopes) != 2 || scopes[0].ConfigRevision != "rev-a" || scopes[1].ConfigRevision != "rev-b" {
		t.Fatalf("scopes=%#v", scopes)
	}
	if len(scopes[0].VisibleOwnerRoleKeys) != 1 || scopes[0].VisibleOwnerRoleKeys[0] != WarehouseRoleKey {
		t.Fatalf("rev-a roles=%#v", scopes[0].VisibleOwnerRoleKeys)
	}
	if len(scopes[1].VisibleOwnerRoleKeys) != 0 {
		t.Fatalf("rev-b roles=%#v", scopes[1].VisibleOwnerRoleKeys)
	}
}

func TestCustomerConfigUsecaseWorkflowTaskRevisionRoleScopesRepositoryErrorFailsClosed(t *testing.T) {
	repoErr := errors.New("workflow revision projection unavailable")
	uc := NewCustomerConfigUsecase(workflowTaskAuthorizationRevisionErrorRepo{
		CustomerConfigRepo: newMemCustomerConfigRepo(),
		err:                repoErr,
	})
	scopes, err := uc.WorkflowTaskRevisionRoleScopes(
		context.Background(),
		DefaultCustomerKey,
		&AdminUser{ID: 7, Roles: []AdminRole{{Key: WarehouseRoleKey}}},
		PermissionWorkflowTaskRead,
	)
	if !errors.Is(err, repoErr) || scopes != nil {
		t.Fatalf("scopes=%#v err=%v", scopes, err)
	}
}

func TestWorkflowTaskRevisionRoleScopesFreezeMultiRoleApprovalResponsibility(t *testing.T) {
	repo := newMemCustomerConfigRepo()
	admin := &AdminUser{
		ID:    22,
		Roles: []AdminRole{{Key: SalesRoleKey}, {Key: FinanceRoleKey}},
	}
	for _, item := range []struct {
		revision string
		status   string
		roleKey  string
	}{
		{revision: "approval-rev-a", status: CustomerConfigStatusSuperseded, roleKey: SalesRoleKey},
		{revision: "approval-rev-b", status: CustomerConfigStatusActive, roleKey: FinanceRoleKey},
	} {
		key := customerRevisionKey(DefaultCustomerKey, item.revision)
		repo.revisions[key] = &CustomerConfigRevision{
			CustomerKey: DefaultCustomerKey,
			Revision:    item.revision,
			Status:      item.status,
		}
		repo.roles[key] = []RoleProfileInput{
			{RoleKey: SalesRoleKey, DisplayName: "业务"},
			{RoleKey: FinanceRoleKey, DisplayName: "财务"},
		}
		repo.entitlements[key] = []AccessEntitlementInput{{
			RoleKey: item.roleKey, CapabilityKey: PermissionWorkflowTaskApprove,
			ScopeType: "customer", ScopeValue: DefaultCustomerKey, Enabled: true,
		}}
		repo.memberships[key] = []WorkPoolMembershipInput{{
			PoolKey: "approval.sales_order", RoleKey: item.roleKey, UserID: admin.ID,
			Strategy: ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
		}}
	}
	uc := NewCustomerConfigUsecaseForWire(
		repo,
		approvalSettingsAdminDirectory{admins: []*AdminUser{admin}},
	)
	scopes, err := uc.WorkflowTaskRevisionRoleScopes(
		context.Background(),
		DefaultCustomerKey,
		admin,
		PermissionWorkflowTaskApprove,
	)
	if err != nil {
		t.Fatalf("revision scopes error = %v", err)
	}
	if len(scopes) != 2 {
		t.Fatalf("revision scopes = %#v", scopes)
	}
	byRevision := map[string]WorkflowTaskRevisionRoleScope{}
	for _, scope := range scopes {
		byRevision[scope.ConfigRevision] = scope
	}
	for revision, roleKey := range map[string]string{
		"approval-rev-a": SalesRoleKey,
		"approval-rev-b": FinanceRoleKey,
	} {
		pairs := byRevision[revision].VisibleOwnerPoolRoles
		if len(pairs) != 1 ||
			pairs[0].OwnerPoolKey != "approval.sales_order" ||
			pairs[0].OwnerRoleKey != roleKey {
			t.Fatalf("%s responsibility pairs = %#v", revision, pairs)
		}
	}
}

func TestWorkflowTaskVisibilityScopeIncludesTaskRequiresCompleteCategoryAnchor(t *testing.T) {
	assigneeID := 7
	processID := 11
	nodeID := 12
	revision := "rev-a"
	scope := &WorkflowTaskVisibilityScope{
		VisibleAssigneeID: &assigneeID,
		RevisionRoleScopes: []WorkflowTaskRevisionRoleScope{{
			ConfigRevision: revision,
			Status:         CustomerConfigStatusActive,
		}},
	}
	standalone := &WorkflowTask{OwnerRoleKey: FinanceRoleKey, AssigneeID: &assigneeID}
	if !WorkflowTaskVisibilityScopeIncludesTask(scope, standalone) {
		t.Fatal("standalone assignee should remain visible")
	}
	standalone.ProcessInstanceID = &processID
	if WorkflowTaskVisibilityScopeIncludesTask(scope, standalone) {
		t.Fatal("partial runtime anchor must fail closed before assignee visibility")
	}
	runtime := &WorkflowTask{
		OwnerRoleKey: FinanceRoleKey, AssigneeID: &assigneeID,
		ConfigRevision: &revision, ProcessInstanceID: &processID, ProcessNodeInstanceID: &nodeID,
	}
	if !WorkflowTaskVisibilityScopeIncludesTask(scope, runtime) {
		t.Fatal("complete authorized runtime anchor should allow the assignee")
	}
	missingRevision := "rev-missing"
	runtime.ConfigRevision = &missingRevision
	if WorkflowTaskVisibilityScopeIncludesTask(scope, runtime) {
		t.Fatal("unknown runtime revision must fail closed before assignee visibility")
	}
}

func TestWorkflowTaskVisibilityScopeMatchesSelectedApprovalPoolAcrossFallbackRole(t *testing.T) {
	processID := 11
	nodeID := 12
	revision := "approval-rev-a"
	poolKey := "approval.sales_order"
	scope := &WorkflowTaskVisibilityScope{
		RevisionRoleScopes: []WorkflowTaskRevisionRoleScope{{
			ConfigRevision: revision,
			Status:         CustomerConfigStatusSuperseded,
			VisibleOwnerPoolRoles: []WorkflowTaskOwnerPoolRole{{
				OwnerPoolKey: poolKey,
				OwnerRoleKey: PurchaseRoleKey,
			}},
		}},
	}
	task := &WorkflowTask{
		OwnerRoleKey:          SalesRoleKey,
		OwnerPoolKey:          &poolKey,
		ConfigRevision:        &revision,
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &nodeID,
		Payload:               map[string]any{"assignee_released_to_pool": true},
	}
	if !WorkflowTaskVisibilityScopeIncludesTask(scope, task) {
		t.Fatal("selected backup responsibility must see the frozen approval pool task")
	}
}

func TestWorkflowTaskVisibilityScopeKeepsQualifiedFrozenApprovalAssignee(t *testing.T) {
	assigneeID := 22
	processID := 11
	nodeID := 12
	revision := "approval-rev-a"
	poolKey := "approval.sales_order"
	task := &WorkflowTask{
		OwnerRoleKey:          SalesRoleKey,
		OwnerPoolKey:          &poolKey,
		AssigneeID:            &assigneeID,
		ConfigRevision:        &revision,
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &nodeID,
	}
	scope := &WorkflowTaskVisibilityScope{
		VisibleAssigneeID: &assigneeID,
		RevisionRoleScopes: []WorkflowTaskRevisionRoleScope{{
			ConfigRevision:       revision,
			Status:               CustomerConfigStatusSuperseded,
			VisibleOwnerRoleKeys: []string{SalesRoleKey},
			VisibleOwnerPoolRoles: []WorkflowTaskOwnerPoolRole{{
				OwnerPoolKey: poolKey,
				OwnerRoleKey: BossRoleKey,
			}},
		}},
	}
	if !WorkflowTaskVisibilityScopeIncludesTask(scope, task) {
		t.Fatal("qualified frozen assignee must keep the task when a higher-priority tier returns")
	}
	scope.RevisionRoleScopes[0].VisibleOwnerRoleKeys = nil
	scope.RevisionRoleScopes[0].VisibleOwnerPoolRoles = nil
	if WorkflowTaskVisibilityScopeIncludesTask(scope, task) {
		t.Fatal("frozen assignment must not bypass a removed role or entitlement")
	}
}
