package data

import (
	"server/internal/biz"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/workflowtask"

	entsql "entgo.io/ent/dialect/sql"
)

func workflowTaskRevisionVisibilityPredicate(
	scope *biz.WorkflowTaskVisibilityScope,
	ownerRoleKey string,
) predicate.WorkflowTask {
	scope = biz.NormalizeWorkflowTaskVisibilityScope(scope)
	if scope == nil {
		return nil
	}
	branches := []predicate.WorkflowTask{}
	if visibility, ok := workflowTaskOwnerOrAssigneePredicate(
		ownerRoleKey,
		scope.StandaloneVisibleOwnerRoleKeys,
		scope.VisibleAssigneeID,
		scope.StandaloneAllowAllOwnerRoles,
	); ok {
		branches = append(branches, workflowtask.And(
			workflowtask.ConfigRevisionIsNil(),
			workflowtask.ProcessInstanceIDIsNil(),
			workflowtask.ProcessNodeInstanceIDIsNil(),
			visibility,
		))
	}
	for _, revision := range scope.RevisionRoleScopes {
		visibility, ok := workflowTaskRuntimeOwnerPredicate(ownerRoleKey, revision, scope.VisibleAssigneeID)
		if !ok {
			continue
		}
		branches = append(branches, workflowtask.And(
			workflowtask.ConfigRevisionEQ(revision.ConfigRevision),
			workflowTaskPositiveRuntimeIDPredicate(workflowtask.FieldProcessInstanceID),
			workflowTaskPositiveRuntimeIDPredicate(workflowtask.FieldProcessNodeInstanceID),
			visibility,
		))
	}
	if len(branches) == 0 {
		return workflowtask.ID(0)
	}
	return workflowtask.Or(branches...)
}

func workflowTaskRoleViewRevisionVisibilityPredicate(
	scope *biz.WorkflowTaskVisibilityScope,
	roleKey string,
	crossRoleRiskAllowed bool,
) predicate.WorkflowTask {
	scope = biz.NormalizeWorkflowTaskVisibilityScope(scope)
	roleKey = biz.NormalizeRoleKey(roleKey)
	if scope == nil || roleKey == "" {
		return workflowtask.ID(0)
	}
	branches := []predicate.WorkflowTask{}
	standaloneRoleAuthorized := scope.StandaloneAllowAllOwnerRoles || workflowTaskRoleInScope(roleKey, scope.StandaloneVisibleOwnerRoleKeys)
	if visibility, ok := workflowTaskRoleViewOwnerPredicate(
		roleKey,
		scope.VisibleAssigneeID,
		crossRoleRiskAllowed,
		standaloneRoleAuthorized,
	); ok {
		branches = append(branches, workflowtask.And(
			workflowtask.ConfigRevisionIsNil(),
			workflowtask.ProcessInstanceIDIsNil(),
			workflowtask.ProcessNodeInstanceIDIsNil(),
			visibility,
		))
	}
	for _, revision := range scope.RevisionRoleScopes {
		roleAuthorized := revision.AllowAllOwnerRoles || workflowTaskRoleInScope(roleKey, revision.VisibleOwnerRoleKeys)
		visibility, ok := workflowTaskRuntimeRoleViewOwnerPredicate(
			roleKey, revision, scope.VisibleAssigneeID, crossRoleRiskAllowed, roleAuthorized,
		)
		if !ok {
			continue
		}
		branches = append(branches, workflowtask.And(
			workflowtask.ConfigRevisionEQ(revision.ConfigRevision),
			workflowTaskPositiveRuntimeIDPredicate(workflowtask.FieldProcessInstanceID),
			workflowTaskPositiveRuntimeIDPredicate(workflowtask.FieldProcessNodeInstanceID),
			visibility,
		))
	}
	if len(branches) == 0 {
		return workflowtask.ID(0)
	}
	return workflowtask.Or(branches...)
}

func workflowTaskRuntimeOwnerPredicate(
	ownerRoleKey string,
	revision biz.WorkflowTaskRevisionRoleScope,
	visibleAssigneeID *int,
) (predicate.WorkflowTask, bool) {
	if revision.AllowAllOwnerRoles {
		return workflowTaskOwnerOrAssigneePredicate(ownerRoleKey, nil, visibleAssigneeID, true)
	}
	visible := []predicate.WorkflowTask{}
	for _, pair := range revision.VisibleOwnerPoolRoles {
		if ownerRoleKey != "" && biz.NormalizeRoleKey(pair.OwnerRoleKey) != biz.NormalizeRoleKey(ownerRoleKey) {
			continue
		}
		if biz.IsApprovalSettingsPoolKey(pair.OwnerPoolKey) {
			visible = append(visible, workflowtask.OwnerPoolKey(pair.OwnerPoolKey))
			continue
		}
		visible = append(visible, workflowtask.And(
			workflowtask.OwnerPoolKey(pair.OwnerPoolKey),
			workflowtask.OwnerRoleKey(pair.OwnerRoleKey),
		))
	}
	if assigned := workflowTaskRuntimeAssignedOwnerPredicate(
		ownerRoleKey,
		revision.VisibleOwnerRoleKeys,
		visibleAssigneeID,
	); assigned != nil {
		visible = append(visible, assigned)
	}
	legacyVisibility, legacyOK := workflowTaskOwnerOrAssigneePredicate(
		ownerRoleKey,
		revision.VisibleOwnerRoleKeys,
		visibleAssigneeID,
		false,
	)
	if legacyOK {
		visible = append(visible, workflowtask.And(workflowTaskOwnerPoolAbsentPredicate(), legacyVisibility))
	}
	if len(visible) == 0 {
		return nil, false
	}
	return workflowtask.Or(visible...), true
}

func workflowTaskRuntimeRoleViewOwnerPredicate(
	roleKey string,
	revision biz.WorkflowTaskRevisionRoleScope,
	visibleAssigneeID *int,
	crossRoleRiskAllowed bool,
	roleAuthorized bool,
) (predicate.WorkflowTask, bool) {
	if revision.AllowAllOwnerRoles {
		return workflowTaskRoleViewOwnerPredicate(roleKey, visibleAssigneeID, crossRoleRiskAllowed, true)
	}
	visible := []predicate.WorkflowTask{}
	for _, pair := range revision.VisibleOwnerPoolRoles {
		if biz.NormalizeRoleKey(pair.OwnerRoleKey) != biz.NormalizeRoleKey(roleKey) {
			continue
		}
		if biz.IsApprovalSettingsPoolKey(pair.OwnerPoolKey) {
			visible = append(visible, workflowtask.OwnerPoolKey(pair.OwnerPoolKey))
			continue
		}
		visible = append(visible, workflowtask.And(
			workflowtask.OwnerPoolKey(pair.OwnerPoolKey),
			workflowtask.OwnerRoleKey(roleKey),
		))
	}
	if roleAuthorized && visibleAssigneeID != nil && *visibleAssigneeID > 0 {
		visible = append(visible, workflowtask.And(
			workflowtask.AssigneeID(*visibleAssigneeID),
			workflowtask.OwnerRoleKey(roleKey),
		))
	}
	legacyVisibility, legacyOK := workflowTaskRoleViewOwnerPredicate(
		roleKey, visibleAssigneeID, crossRoleRiskAllowed, roleAuthorized,
	)
	if legacyOK {
		visible = append(visible, workflowtask.And(workflowTaskOwnerPoolAbsentPredicate(), legacyVisibility))
	}
	if len(visible) == 0 {
		return nil, false
	}
	return workflowtask.Or(visible...), true
}

func workflowTaskRuntimeAssignedOwnerPredicate(
	ownerRoleKey string,
	visibleOwnerRoleKeys []string,
	visibleAssigneeID *int,
) predicate.WorkflowTask {
	if visibleAssigneeID == nil || *visibleAssigneeID <= 0 {
		return nil
	}
	ownerRoleKey = biz.NormalizeRoleKey(ownerRoleKey)
	visibleOwnerRoleKeys = biz.NormalizeAdminRoleKeys(visibleOwnerRoleKeys)
	if ownerRoleKey != "" {
		if !workflowTaskRoleInScope(ownerRoleKey, visibleOwnerRoleKeys) {
			return nil
		}
		return workflowtask.And(
			workflowtask.AssigneeID(*visibleAssigneeID),
			workflowtask.OwnerRoleKey(ownerRoleKey),
		)
	}
	if len(visibleOwnerRoleKeys) == 0 {
		return nil
	}
	return workflowtask.And(
		workflowtask.AssigneeID(*visibleAssigneeID),
		workflowtask.OwnerRoleKeyIn(visibleOwnerRoleKeys...),
	)
}

func workflowTaskOwnerPoolAbsentPredicate() predicate.WorkflowTask {
	return workflowtask.Or(workflowtask.OwnerPoolKeyIsNil(), workflowtask.OwnerPoolKey(""))
}

func workflowTaskOwnerOrAssigneePredicate(
	ownerRoleKey string,
	visibleOwnerRoleKeys []string,
	visibleAssigneeID *int,
	allowAllOwnerRoles bool,
) (predicate.WorkflowTask, bool) {
	ownerRoleKey = biz.NormalizeRoleKey(ownerRoleKey)
	visibleOwnerRoleKeys = biz.NormalizeAdminRoleKeys(visibleOwnerRoleKeys)
	visible := []predicate.WorkflowTask{}
	if allowAllOwnerRoles {
		if ownerRoleKey != "" {
			return workflowtask.OwnerRoleKey(ownerRoleKey), true
		}
		return workflowtask.IDNEQ(0), true
	}
	if ownerRoleKey != "" {
		if workflowTaskRoleInScope(ownerRoleKey, visibleOwnerRoleKeys) {
			visible = append(visible, workflowtask.OwnerRoleKey(ownerRoleKey))
		}
	} else if len(visibleOwnerRoleKeys) > 0 {
		visible = append(visible, workflowtask.OwnerRoleKeyIn(visibleOwnerRoleKeys...))
	}
	if visibleAssigneeID != nil && *visibleAssigneeID > 0 {
		assigned := workflowtask.AssigneeID(*visibleAssigneeID)
		if ownerRoleKey != "" {
			assigned = workflowtask.And(assigned, workflowtask.OwnerRoleKey(ownerRoleKey))
		}
		visible = append(visible, assigned)
	}
	if len(visible) == 0 {
		return nil, false
	}
	return workflowtask.Or(visible...), true
}

func workflowTaskRoleViewOwnerPredicate(
	roleKey string,
	visibleAssigneeID *int,
	crossRoleRiskAllowed bool,
	roleAuthorized bool,
) (predicate.WorkflowTask, bool) {
	if crossRoleRiskAllowed && roleAuthorized {
		return workflowtask.IDNEQ(0), true
	}
	visible := []predicate.WorkflowTask{}
	if roleAuthorized {
		visible = append(visible, workflowtask.OwnerRoleKey(roleKey))
	}
	if visibleAssigneeID != nil && *visibleAssigneeID > 0 {
		visible = append(visible, workflowtask.AssigneeID(*visibleAssigneeID))
	}
	if len(visible) == 0 {
		return nil, false
	}
	return workflowtask.Or(visible...), true
}

func workflowTaskRoleInScope(roleKey string, values []string) bool {
	roleKey = biz.NormalizeRoleKey(roleKey)
	for _, value := range biz.NormalizeAdminRoleKeys(values) {
		if value == roleKey {
			return true
		}
	}
	return false
}

func workflowTaskPositiveRuntimeIDPredicate(field string) predicate.WorkflowTask {
	return predicate.WorkflowTask(func(selector *entsql.Selector) {
		selector.Where(entsql.GT(selector.C(field), 0))
	})
}
