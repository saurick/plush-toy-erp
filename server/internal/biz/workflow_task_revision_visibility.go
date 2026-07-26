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
	ConfigRevision        string
	Status                string
	VisibleOwnerRoleKeys  []string
	VisibleOwnerPoolRoles []WorkflowTaskOwnerPoolRole
	AllowAllOwnerRoles    bool
}

type WorkflowTaskOwnerPoolRole struct {
	OwnerPoolKey string
	OwnerRoleKey string
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
	var approvalAdmins []*AdminUser
	if !admin.IsSuperAdmin && workflowAuthorizationRevisionsUseApprovalPools(revisions) {
		if uc.adminDirectory == nil {
			return nil, ErrCustomerConfigActiveRevisionRequired
		}
		approvalAdmins, err = uc.adminDirectory.ListAdmins(ctx)
		if err != nil {
			return nil, err
		}
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
			scope.VisibleOwnerRoleKeys, scope.VisibleOwnerPoolRoles = workflowVisibleOwnerScopesFromAuthorizationRevision(
				customerKey,
				admin,
				revision,
				requiredCapabilities,
			)
			scope.VisibleOwnerPoolRoles = workflowApprovalCandidatePoolRolesForAdmin(
				customerKey,
				admin,
				revision,
				requiredCapabilities,
				approvalAdmins,
				scope.VisibleOwnerPoolRoles,
			)
		}
		out = append(out, scope)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ConfigRevision < out[j].ConfigRevision })
	return out, nil
}

func workflowAuthorizationRevisionsUseApprovalPools(revisions []WorkflowTaskAuthorizationRevision) bool {
	for _, revision := range revisions {
		for _, membership := range revision.WorkPoolMemberships {
			if membership.Enabled && IsApprovalSettingsPoolKey(membership.PoolKey) {
				return true
			}
		}
	}
	return false
}

func workflowApprovalCandidatePoolRolesForAdmin(
	customerKey string,
	admin *AdminUser,
	revision WorkflowTaskAuthorizationRevision,
	requiredCapabilities []string,
	approvalAdmins []*AdminUser,
	visiblePairs []WorkflowTaskOwnerPoolRole,
) []WorkflowTaskOwnerPoolRole {
	if admin == nil || approvalAdmins == nil {
		return visiblePairs
	}
	membershipRoleKeys := []string{}
	for _, membership := range revision.WorkPoolMemberships {
		if !membership.Enabled ||
			!IsApprovalSettingsPoolKey(membership.PoolKey) ||
			!approvalMembershipHasActiveAdmin(membership, approvalAdmins) {
			continue
		}
		membershipRoleKeys = append(membershipRoleKeys, membership.RoleKey)
	}
	candidateRoleKeys := enabledCustomerRoleKeys(membershipRoleKeys, revision.RoleProfiles)
	eligibleRoles := workflowEligibleRoleKeysWithCapabilities(
		candidateRoleKeys,
		revision.RoleProfiles,
		revision.AccessEntitlements,
		normalizeWorkflowTaskRequiredCapabilities(requiredCapabilities),
		customerKey,
	)
	selectedPriorityByPool := map[string]int{}
	for _, membership := range revision.WorkPoolMemberships {
		poolKey := strings.TrimSpace(membership.PoolKey)
		roleKey := NormalizeRoleKey(membership.RoleKey)
		if !membership.Enabled ||
			!IsApprovalSettingsPoolKey(poolKey) ||
			!approvalMembershipHasActiveAdmin(membership, approvalAdmins) {
			continue
		}
		if _, eligible := eligibleRoles[roleKey]; !eligible {
			continue
		}
		priority := membership.Priority
		if priority <= 0 {
			priority = 100
		}
		if current := selectedPriorityByPool[poolKey]; current == 0 || priority < current {
			selectedPriorityByPool[poolKey] = priority
		}
	}
	selectedForAdmin := map[string]struct{}{}
	for _, membership := range revision.WorkPoolMemberships {
		poolKey := strings.TrimSpace(membership.PoolKey)
		roleKey := NormalizeRoleKey(membership.RoleKey)
		priority := membership.Priority
		if priority <= 0 {
			priority = 100
		}
		if !membership.Enabled ||
			selectedPriorityByPool[poolKey] == 0 ||
			priority != selectedPriorityByPool[poolKey] ||
			!approvalMembershipHasActiveAdmin(membership, approvalAdmins) ||
			!AdminHasRole(admin, roleKey) ||
			(membership.UserID > 0 && membership.UserID != admin.ID) {
			continue
		}
		if _, eligible := eligibleRoles[roleKey]; !eligible {
			continue
		}
		selectedForAdmin[poolKey+"\x00"+roleKey] = struct{}{}
	}
	out := make([]WorkflowTaskOwnerPoolRole, 0, len(visiblePairs))
	for _, pair := range visiblePairs {
		if !IsApprovalSettingsPoolKey(pair.OwnerPoolKey) {
			out = append(out, pair)
			continue
		}
		key := strings.TrimSpace(pair.OwnerPoolKey) + "\x00" + NormalizeRoleKey(pair.OwnerRoleKey)
		if _, selected := selectedForAdmin[key]; selected {
			out = append(out, pair)
		}
	}
	return normalizeWorkflowOwnerPoolRoles(out)
}

func workflowVisibleOwnerScopesFromAuthorizationRevision(
	customerKey string,
	admin *AdminUser,
	revision WorkflowTaskAuthorizationRevision,
	requiredCapabilities []string,
) ([]string, []WorkflowTaskOwnerPoolRole) {
	baseRoleKeys := enabledCustomerRoleKeys(AdminRoleKeys(admin), revision.RoleProfiles)
	baseRoleSet := map[string]struct{}{}
	for _, roleKey := range baseRoleKeys {
		baseRoleSet[roleKey] = struct{}{}
	}
	membershipRoleKeys := []string{}
	matchedMemberships := []WorkPoolMembershipInput{}
	for _, membership := range revision.WorkPoolMemberships {
		if !membership.Enabled {
			continue
		}
		roleKey := NormalizeRoleKey(membership.RoleKey)
		_, actorRoleMatched := baseRoleSet[roleKey]
		rolePoolMatched := actorRoleMatched && membership.UserID == 0
		userMatched := membership.UserID > 0 && membership.UserID == admin.ID
		if IsApprovalSettingsPoolKey(membership.PoolKey) {
			userMatched = userMatched && actorRoleMatched
		}
		if roleKey != "" && (rolePoolMatched || userMatched) {
			membershipRoleKeys = append(membershipRoleKeys, roleKey)
			matchedMemberships = append(matchedMemberships, membership)
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
	visible = NormalizeAdminRoleKeys(visible)
	visibleSet := map[string]struct{}{}
	for _, roleKey := range visible {
		visibleSet[roleKey] = struct{}{}
	}
	poolRoles := make([]WorkflowTaskOwnerPoolRole, 0, len(matchedMemberships))
	for _, membership := range matchedMemberships {
		roleKey := NormalizeRoleKey(membership.RoleKey)
		poolKey := strings.TrimSpace(membership.PoolKey)
		if _, ok := visibleSet[roleKey]; !ok || poolKey == "" {
			continue
		}
		poolRoles = append(poolRoles, WorkflowTaskOwnerPoolRole{
			OwnerPoolKey: poolKey,
			OwnerRoleKey: roleKey,
		})
	}
	return visible, normalizeWorkflowOwnerPoolRoles(poolRoles)
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
		item.VisibleOwnerPoolRoles = normalizeWorkflowOwnerPoolRoles(
			append(item.VisibleOwnerPoolRoles, raw.VisibleOwnerPoolRoles...),
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

func WorkflowTaskVisibilityScopeIncludesTask(scope *WorkflowTaskVisibilityScope, task *WorkflowTask) bool {
	scope = NormalizeWorkflowTaskVisibilityScope(scope)
	if scope == nil || task == nil {
		return false
	}
	roleKey := NormalizeRoleKey(task.OwnerRoleKey)
	if roleKey == "" {
		return false
	}
	assigneeVisible := scope.VisibleAssigneeID != nil && task.AssigneeID != nil && *scope.VisibleAssigneeID == *task.AssigneeID
	if task.ConfigRevision == nil || strings.TrimSpace(*task.ConfigRevision) == "" {
		if task.ProcessInstanceID != nil || task.ProcessNodeInstanceID != nil {
			return false
		}
		return scope.StandaloneAllowAllOwnerRoles ||
			workflowRoleKeyInList(roleKey, scope.StandaloneVisibleOwnerRoleKeys) ||
			assigneeVisible
	}
	if task.ProcessInstanceID == nil || *task.ProcessInstanceID <= 0 ||
		task.ProcessNodeInstanceID == nil || *task.ProcessNodeInstanceID <= 0 {
		return false
	}
	revisionKey := strings.TrimSpace(*task.ConfigRevision)
	for _, revision := range scope.RevisionRoleScopes {
		if revision.ConfigRevision != revisionKey {
			continue
		}
		if revision.AllowAllOwnerRoles {
			return true
		}
		poolKey := ""
		if task.OwnerPoolKey != nil {
			poolKey = strings.TrimSpace(*task.OwnerPoolKey)
		}
		if poolKey == "" {
			return workflowRoleKeyInList(roleKey, revision.VisibleOwnerRoleKeys) || assigneeVisible
		}
		if IsApprovalSettingsPoolKey(poolKey) {
			return workflowOwnerPoolInList(poolKey, revision.VisibleOwnerPoolRoles) ||
				(assigneeVisible && workflowRoleKeyInList(roleKey, revision.VisibleOwnerRoleKeys))
		}
		return workflowOwnerPoolRoleInList(poolKey, roleKey, revision.VisibleOwnerPoolRoles)
	}
	return false
}

func workflowOwnerPoolInList(poolKey string, values []WorkflowTaskOwnerPoolRole) bool {
	poolKey = strings.TrimSpace(poolKey)
	for _, value := range values {
		if strings.TrimSpace(value.OwnerPoolKey) == poolKey {
			return true
		}
	}
	return false
}

func normalizeWorkflowOwnerPoolRoles(values []WorkflowTaskOwnerPoolRole) []WorkflowTaskOwnerPoolRole {
	byKey := map[string]WorkflowTaskOwnerPoolRole{}
	for _, value := range values {
		poolKey := strings.TrimSpace(value.OwnerPoolKey)
		roleKey := NormalizeRoleKey(value.OwnerRoleKey)
		if poolKey == "" || roleKey == "" {
			continue
		}
		byKey[poolKey+"\x00"+roleKey] = WorkflowTaskOwnerPoolRole{
			OwnerPoolKey: poolKey,
			OwnerRoleKey: roleKey,
		}
	}
	keys := make([]string, 0, len(byKey))
	for key := range byKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]WorkflowTaskOwnerPoolRole, 0, len(keys))
	for _, key := range keys {
		out = append(out, byKey[key])
	}
	return out
}

func workflowOwnerPoolRoleInList(poolKey, roleKey string, values []WorkflowTaskOwnerPoolRole) bool {
	poolKey = strings.TrimSpace(poolKey)
	roleKey = NormalizeRoleKey(roleKey)
	for _, value := range values {
		if strings.TrimSpace(value.OwnerPoolKey) == poolKey && NormalizeRoleKey(value.OwnerRoleKey) == roleKey {
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
