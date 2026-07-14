package biz

import (
	"context"
	"sort"
	"strings"
)

// WorkflowTaskAuthorizationRevision is the immutable customer-config material
// needed to project workflow responsibility for one runtime revision.
type WorkflowTaskAuthorizationRevision struct {
	CustomerKey         string
	Revision            string
	Status              string
	RoleProfiles        []RoleProfileInput
	AccessEntitlements  []AccessEntitlementInput
	WorkPoolMemberships []WorkPoolMembershipInput
}

type WorkflowTaskRevisionRoleScope struct {
	ConfigRevision       string
	Status               string
	VisibleOwnerRoleKeys []string
	AllowAllOwnerRoles   bool
}

// WorkflowTaskVisibilityScope keeps ProcessRuntime tasks bound to their
// immutable revision and models standalone collaboration tasks as a separate,
// current task category with no runtime anchor.
type WorkflowTaskVisibilityScope struct {
	RevisionRoleScopes             []WorkflowTaskRevisionRoleScope
	StandaloneVisibleOwnerRoleKeys []string
	StandaloneAllowAllOwnerRoles   bool
	VisibleAssigneeID              *int
}

func (uc *CustomerConfigUsecase) WorkflowTaskRevisionRoleScopes(
	ctx context.Context,
	customerKey string,
	admin *AdminUser,
	requiredCapabilities ...string,
) ([]WorkflowTaskRevisionRoleScope, error) {
	if uc == nil || uc.repo == nil || admin == nil || admin.Disabled {
		return nil, ErrForbidden
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	revisions, err := uc.repo.ListWorkflowTaskAuthorizationRevisions(ctx, customerKey)
	if err != nil {
		return nil, err
	}
	out := make([]WorkflowTaskRevisionRoleScope, 0, len(revisions))
	for _, revision := range revisions {
		if NormalizeCustomerKey(revision.CustomerKey) != customerKey ||
			!customerConfigRevisionCanAuthorizeRuntimeTask(revision.Status) {
			continue
		}
		revisionKey := strings.TrimSpace(revision.Revision)
		if revisionKey == "" {
			continue
		}
		scope := WorkflowTaskRevisionRoleScope{
			ConfigRevision:     revisionKey,
			Status:             strings.TrimSpace(revision.Status),
			AllowAllOwnerRoles: admin.IsSuperAdmin,
		}
		if !admin.IsSuperAdmin {
			scope.VisibleOwnerRoleKeys = workflowVisibleOwnerRoleKeysFromAuthorizationRevision(
				customerKey,
				admin,
				revision,
				requiredCapabilities,
			)
		}
		out = append(out, scope)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ConfigRevision < out[j].ConfigRevision })
	return out, nil
}

func workflowVisibleOwnerRoleKeysFromAuthorizationRevision(
	customerKey string,
	admin *AdminUser,
	revision WorkflowTaskAuthorizationRevision,
	requiredCapabilities []string,
) []string {
	baseRoleKeys := enabledCustomerRoleKeys(AdminRoleKeys(admin), revision.RoleProfiles)
	baseRoleSet := map[string]struct{}{}
	for _, roleKey := range baseRoleKeys {
		baseRoleSet[roleKey] = struct{}{}
	}
	membershipRoleKeys := []string{}
	for _, membership := range revision.WorkPoolMemberships {
		if !membership.Enabled {
			continue
		}
		roleKey := NormalizeRoleKey(membership.RoleKey)
		_, baseRoleMatched := baseRoleSet[roleKey]
		userMatched := membership.UserID > 0 && membership.UserID == admin.ID
		if roleKey != "" && (baseRoleMatched || userMatched) {
			membershipRoleKeys = append(membershipRoleKeys, roleKey)
		}
	}
	candidateRoleKeys := enabledCustomerRoleKeys(
		append(baseRoleKeys, membershipRoleKeys...),
		revision.RoleProfiles,
	)
	eligible := workflowEligibleRoleKeysWithCapabilities(
		candidateRoleKeys,
		revision.RoleProfiles,
		revision.AccessEntitlements,
		requiredCapabilities,
		customerKey,
	)
	visible := make([]string, 0, len(candidateRoleKeys))
	for _, roleKey := range candidateRoleKeys {
		if _, ok := eligible[roleKey]; ok {
			visible = append(visible, roleKey)
		}
	}
	return NormalizeAdminRoleKeys(visible)
}

func customerConfigRevisionCanAuthorizeRuntimeTask(status string) bool {
	switch strings.TrimSpace(status) {
	case CustomerConfigStatusActive, CustomerConfigStatusSuperseded:
		return true
	default:
		return false
	}
}

func NormalizeWorkflowTaskVisibilityScope(scope *WorkflowTaskVisibilityScope) *WorkflowTaskVisibilityScope {
	if scope == nil {
		return nil
	}
	out := &WorkflowTaskVisibilityScope{
		StandaloneVisibleOwnerRoleKeys: normalizeWorkflowVisibleOwnerRoleKeys(scope.StandaloneVisibleOwnerRoleKeys),
		StandaloneAllowAllOwnerRoles:   scope.StandaloneAllowAllOwnerRoles,
	}
	if scope.VisibleAssigneeID != nil && *scope.VisibleAssigneeID > 0 {
		value := *scope.VisibleAssigneeID
		out.VisibleAssigneeID = &value
	}
	byRevision := map[string]WorkflowTaskRevisionRoleScope{}
	for _, raw := range scope.RevisionRoleScopes {
		revision := strings.TrimSpace(raw.ConfigRevision)
		if revision == "" || !customerConfigRevisionCanAuthorizeRuntimeTask(raw.Status) {
			continue
		}
		item := byRevision[revision]
		item.ConfigRevision = revision
		item.Status = strings.TrimSpace(raw.Status)
		item.AllowAllOwnerRoles = item.AllowAllOwnerRoles || raw.AllowAllOwnerRoles
		item.VisibleOwnerRoleKeys = normalizeWorkflowVisibleOwnerRoleKeys(
			append(item.VisibleOwnerRoleKeys, raw.VisibleOwnerRoleKeys...),
		)
		byRevision[revision] = item
	}
	keys := make([]string, 0, len(byRevision))
	for revision := range byRevision {
		keys = append(keys, revision)
	}
	sort.Strings(keys)
	for _, revision := range keys {
		out.RevisionRoleScopes = append(out.RevisionRoleScopes, byRevision[revision])
	}
	return out
}

func WorkflowTaskVisibilityScopeIncludesRole(scope *WorkflowTaskVisibilityScope, roleKey string) bool {
	scope = NormalizeWorkflowTaskVisibilityScope(scope)
	roleKey = NormalizeRoleKey(roleKey)
	if scope == nil || roleKey == "" {
		return false
	}
	if scope.StandaloneAllowAllOwnerRoles || workflowRoleKeyInList(roleKey, scope.StandaloneVisibleOwnerRoleKeys) {
		return true
	}
	for _, revision := range scope.RevisionRoleScopes {
		if revision.AllowAllOwnerRoles || workflowRoleKeyInList(roleKey, revision.VisibleOwnerRoleKeys) {
			return true
		}
	}
	return false
}

func workflowRoleKeyInList(roleKey string, values []string) bool {
	for _, value := range values {
		if NormalizeRoleKey(value) == roleKey {
			return true
		}
	}
	return false
}
