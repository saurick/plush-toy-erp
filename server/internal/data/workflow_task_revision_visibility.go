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
		visibility, ok := workflowTaskOwnerOrAssigneePredicate(
			ownerRoleKey,
			revision.VisibleOwnerRoleKeys,
			scope.VisibleAssigneeID,
			revision.AllowAllOwnerRoles,
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
		visibility, ok := workflowTaskRoleViewOwnerPredicate(
			roleKey,
			scope.VisibleAssigneeID,
			crossRoleRiskAllowed,
			roleAuthorized,
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
