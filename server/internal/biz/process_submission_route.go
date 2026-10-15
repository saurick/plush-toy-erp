package biz

import (
	"context"
	"strings"
)

// ProcessSubmissionRoute describes the configured first handoff. It is not a
// promise that a source document is submittable or that an amount gate will run.
type ProcessSubmissionRoute struct {
	ConfigRevision      string
	ProcessKey          string
	NodeKey             string
	OwnerRoleKey        string
	AssigneeDisplayName string
	ApprovalKey         string
	Condition           ApprovalCondition
}

func (uc *CustomerConfigUsecase) GetProcessSubmissionRoute(ctx context.Context, customerKey, processKey string) (*ProcessSubmissionRoute, error) {
	if uc == nil || uc.repo == nil || !customerConfigRuntimeBuilderRegistered(processKey) {
		return nil, ErrBadParam
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		return nil, err
	}
	definition, err := customerConfigProcessDefinition(active.CompiledSnapshot, processKey)
	if err != nil {
		return nil, err
	}
	enabled, err := boolFromProcessDefinition(definition, "runtime_loader_enabled")
	if err != nil || !enabled {
		return nil, ErrCustomerConfigTransitionBlocked
	}
	modules, err := uc.repo.ListDeploymentModuleStates(ctx, customerKey, active.Revision)
	if err != nil {
		return nil, err
	}
	if err := ensureCustomerConfigProcessModulesEnabledForStart(processKey, getStringFromAnyMap(definition, "business_ref_type"), definition, active.CompiledSnapshot, modules); err != nil {
		return nil, err
	}
	approvalKey := approvalSettingKeyForProcessKey(processKey)
	if approvalKey != "" && !approvalSettingsEnabledMap(active.CompiledSnapshot)[approvalKey] {
		return nil, ErrCustomerConfigTransitionBlocked
	}
	nodes, err := processNodesFromCustomerConfigDefinition(processKey, definition)
	if err != nil {
		return nil, err
	}
	if !currentCustomerConfigProcessStartShape(processKey, nodes) {
		return nil, ErrCustomerConfigTransitionBlocked
	}
	conditions, err := approvalConditionsFromSnapshot(active.CompiledSnapshot)
	if err != nil {
		return nil, err
	}
	for _, node := range nodes {
		if node.NodeType != ProcessNodeTypeApproval && node.NodeType != ProcessNodeTypeHumanTask {
			continue
		}
		if node.OwnerPoolKey == nil || node.RequiredCapabilityKey == nil {
			return nil, ErrProcessTaskOwnerRoleNotFound
		}
		candidates, err := uc.WorkflowCandidateOwnerRoleKeysAtRevision(ctx, customerKey, active.Revision, *node.OwnerPoolKey, *node.RequiredCapabilityKey)
		if err != nil {
			return nil, err
		}
		if len(candidates.CandidateOwnerRoleKeys) == 0 {
			return nil, ErrProcessTaskOwnerRoleNotFound
		}
		if len(candidates.CandidateOwnerRoleKeys) != 1 {
			return nil, ErrProcessTaskOwnerRoleAmbiguous
		}
		route := &ProcessSubmissionRoute{
			ConfigRevision: active.Revision, ProcessKey: processKey, NodeKey: node.NodeKey,
			OwnerRoleKey: candidates.CandidateOwnerRoleKeys[0], ApprovalKey: approvalKey,
			Condition: ApprovalCondition{Mode: ApprovalConditionAll},
		}
		if approvalKey != "" {
			route.Condition, err = NormalizeApprovalCondition(approvalKey, conditions[approvalKey])
			if err != nil {
				return nil, err
			}
		}
		if len(candidates.CandidateAssigneeIDs) == 1 {
			if uc.adminDirectory == nil {
				return nil, ErrProcessTaskOwnerRoleNotFound
			}
			admin, err := uc.adminDirectory.GetAdminByID(ctx, candidates.CandidateAssigneeIDs[0])
			if err != nil {
				return nil, err
			}
			if admin == nil || !admin.IsActive() {
				return nil, ErrProcessTaskOwnerRoleNotFound
			}
			route.AssigneeDisplayName = strings.TrimSpace(admin.DisplayName)
			if route.AssigneeDisplayName == "" {
				route.AssigneeDisplayName = admin.Username
			}
		}
		return route, nil
	}
	return nil, ErrProcessTaskOwnerRoleNotFound
}
