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
