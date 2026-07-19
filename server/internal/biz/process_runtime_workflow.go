package biz

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

func (uc *ProcessRuntimeUsecase) CreateLinkedWorkflowTask(ctx context.Context, in *ProcessLinkedWorkflowTaskCreate, actorID int) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || uc.workflowRepo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProcessLinkedWorkflowTaskCreate(*in)
	if err != nil {
		return nil, err
	}
	instance, err := uc.repo.GetProcessInstance(ctx, normalized.ProcessInstanceID)
	if err != nil {
		return nil, err
	}
	node, err := uc.repo.GetProcessNodeInstance(ctx, normalized.ProcessNodeInstanceID)
	if err != nil {
		return nil, err
	}
	if node.ProcessInstanceID != instance.ID {
		return nil, ErrBadParam
	}
	if node.NodeType != ProcessNodeTypeHumanTask && node.NodeType != ProcessNodeTypeApproval {
		return nil, ErrBadParam
	}
	if node.Status != ProcessNodeStatusActive {
		return nil, ErrProcessNodeInstanceNotActive
	}
	if node.Version != normalized.ExpectedVersion {
		return nil, ErrProcessNodeInstanceConflict
	}
	taskCode := normalized.TaskCode
	if taskCode == "" {
		taskCode = fmt.Sprintf("PROC-%d-NODE-%d-A%d", instance.ID, node.ID, node.Attempt)
	}
	taskGroup := normalized.TaskGroup
	if taskGroup == "" {
		taskGroup = node.NodeKey
	}
	if err := ValidateWorkflowSourceTaskReservedNamespace(taskGroup, taskCode); err != nil {
		return nil, err
	}
	taskName := normalized.TaskName
	if taskName == "" {
		taskName = node.NodeKey
	}
	taskStatusKey := normalized.TaskStatusKey
	if taskStatusKey == "" {
		taskStatusKey = "ready"
	}
	ownerRoleKey, err := uc.resolveLinkedWorkflowTaskOwnerRole(ctx, instance, node, normalized.OwnerRoleKey)
	if err != nil {
		return nil, err
	}
	configRevision := instance.ConfigRevision
	processInstanceID := instance.ID
	processNodeInstanceID := node.ID
	taskCreate := &WorkflowTaskCreate{
		TaskCode:              taskCode,
		TaskGroup:             taskGroup,
		TaskName:              taskName,
		SourceType:            instance.BusinessRefType,
		SourceID:              instance.BusinessRefID,
		SourceNo:              instance.BusinessRefNo,
		TaskStatusKey:         taskStatusKey,
		OwnerRoleKey:          ownerRoleKey,
		OwnerPoolKey:          node.OwnerPoolKey,
		RequiredCapabilityKey: node.RequiredCapabilityKey,
		ConfigRevision:        &configRevision,
		ProcessInstanceID:     &processInstanceID,
		ProcessNodeInstanceID: &processNodeInstanceID,
		DueAt:                 node.DueAt,
		Payload:               normalized.Payload,
	}
	workflowTask, err := normalizeWorkflowTaskCreate(*taskCreate)
	if err != nil {
		return nil, err
	}
	created, err := uc.workflowRepo.CreateWorkflowTask(ctx, &workflowTask, actorID)
	if err == nil {
		return created, nil
	}
	if !errors.Is(err, ErrWorkflowTaskExists) {
		return nil, err
	}
	existing, getErr := uc.workflowRepo.GetWorkflowTaskByTaskCode(ctx, workflowTask.TaskCode)
	if getErr != nil {
		return nil, getErr
	}
	if !workflowTaskMatchesProcessNode(existing, &workflowTask) {
		return nil, ErrWorkflowTaskExists
	}
	return existing, nil
}

func (uc *ProcessRuntimeUsecase) resolveLinkedWorkflowTaskOwnerRole(ctx context.Context, instance *ProcessInstance, node *ProcessNodeInstance, explicitOwnerRoleKey string) (string, error) {
	if ownerRoleKey := NormalizeRoleKey(explicitOwnerRoleKey); ownerRoleKey != "" {
		return ownerRoleKey, nil
	}
	if uc == nil || uc.ownerResolver == nil || instance == nil || node == nil ||
		node.OwnerPoolKey == nil || strings.TrimSpace(*node.OwnerPoolKey) == "" ||
		node.RequiredCapabilityKey == nil || strings.TrimSpace(*node.RequiredCapabilityKey) == "" {
		return "", ErrProcessTaskOwnerRoleNotFound
	}
	customerKey := processInstanceCustomerKey(instance)
	configRevision := strings.TrimSpace(instance.ConfigRevision)
	if configRevision == "" {
		return "", ErrProcessTaskOwnerRoleNotFound
	}
	explanation, err := uc.ownerResolver.WorkflowCandidateOwnerRoleKeysAtRevision(ctx, customerKey, configRevision, *node.OwnerPoolKey, *node.RequiredCapabilityKey)
	if err != nil {
		return "", err
	}
	if explanation == nil {
		return "", ErrProcessTaskOwnerRoleNotFound
	}
	if explanation.ConfigRevision != configRevision {
		return "", ErrProcessTaskOwnerRoleNotFound
	}
	candidates := NormalizeAdminRoleKeys(explanation.CandidateOwnerRoleKeys)
	switch len(candidates) {
	case 0:
		return "", ErrProcessTaskOwnerRoleNotFound
	case 1:
		return candidates[0], nil
	default:
		return "", ErrProcessTaskOwnerRoleAmbiguous
	}
}

func processInstanceCustomerKey(instance *ProcessInstance) string {
	if instance == nil || instance.ModuleContractSnapshot == nil {
		return ""
	}
	customerKey, _ := instance.ModuleContractSnapshot["customer_key"].(string)
	return NormalizeCustomerKey(customerKey)
}

func (uc *ProcessRuntimeUsecase) CompleteLinkedWorkflowTask(ctx context.Context, in *ProcessLinkedWorkflowTaskCompletion, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || uc.workflowRepo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProcessLinkedWorkflowTaskCompletion(*in)
	if err != nil {
		return nil, err
	}
	task, err := uc.workflowRepo.GetWorkflowTask(ctx, normalized.WorkflowTaskID)
	if err != nil {
		return nil, err
	}
	if task.ProcessInstanceID == nil || task.ProcessNodeInstanceID == nil {
		return nil, ErrBadParam
	}
	taskStatusKey := strings.TrimSpace(task.TaskStatusKey)
	if taskStatusKey != "done" && taskStatusKey != "rejected" {
		return nil, ErrBadParam
	}
	outcome := normalized.Outcome
	reason := ""
	if taskStatusKey == "rejected" {
		if outcome != "" && !strings.EqualFold(outcome, "rejected") {
			return nil, ErrBadParam
		}
		outcome = "rejected"
		reason = workflowTaskRejectionReason(task)
		if reason == "" {
			return nil, ErrBadParam
		}
	} else if outcome == "" {
		outcome = workflowTaskPayloadOutcome(task)
	}
	node, err := uc.repo.GetProcessNodeInstance(ctx, *task.ProcessNodeInstanceID)
	if err != nil {
		return nil, err
	}
	if node.ProcessInstanceID != *task.ProcessInstanceID {
		return nil, ErrBadParam
	}
	if node.NodeType != ProcessNodeTypeHumanTask && node.NodeType != ProcessNodeTypeApproval {
		return nil, ErrBadParam
	}
	if isSettledProcessNodeStatus(node.Status) {
		if node.Status != ProcessNodeStatusCompleted || !processNodeOutcomeMatches(node, outcome) {
			return nil, ErrProcessNodeInstanceSettled
		}
		if err := uc.reconcileLinkedWorkflowTaskCompletion(ctx, node, taskStatusKey, reason, actorID); err != nil {
			return nil, err
		}
		return node, nil
	}
	if node.Status != ProcessNodeStatusActive {
		return nil, ErrProcessNodeInstanceNotActive
	}
	completedNode, err := uc.repo.CompleteProcessNodeInstance(ctx, &ProcessNodeInstanceComplete{
		ID:                node.ID,
		ProcessInstanceID: node.ProcessInstanceID,
		ExpectedVersion:   node.Version,
		Outcome:           outcome,
	}, actorID)
	if err != nil {
		return nil, err
	}
	if taskStatusKey == "rejected" {
		if err := uc.settleRejectedProcessAfterNodeCompletion(ctx, completedNode, reason, actorID); err != nil {
			return nil, err
		}
	} else {
		if err := uc.advanceAfterNodeCompletion(ctx, completedNode, actorID); err != nil {
			return nil, err
		}
	}
	return completedNode, nil
}

func (uc *ProcessRuntimeUsecase) settleRejectedProcessAfterNodeCompletion(ctx context.Context, completedNode *ProcessNodeInstance, reason string, actorID int) error {
	if uc == nil || uc.repo == nil || completedNode == nil || completedNode.ProcessInstanceID <= 0 || strings.TrimSpace(reason) == "" {
		return ErrBadParam
	}
	returnRoute, err := processReturnRouteFromNode(completedNode)
	if err == nil && returnRoute != nil && returnRoute.matchesOutcome(completedNode.Outcome) {
		var activatedNode *ProcessNodeInstance
		activatedNode, err = uc.activateReturnToNodeAttempt(ctx, completedNode, returnRoute, actorID)
		if err == nil {
			err = uc.handleActivatedSequentialNode(ctx, activatedNode, actorID)
		}
	} else if err == nil {
		branchPolicyKey := processBranchPolicyKeyFromNode(completedNode)
		if branchPolicyKey != "" {
			var activatedNode *ProcessNodeInstance
			activatedNode, err = uc.activateNamedPolicyBranchNodeWithReason(ctx, completedNode, branchPolicyKey, reason, actorID)
			if err == nil {
				err = uc.handleActivatedSequentialNode(ctx, activatedNode, actorID)
			}
		} else {
			return uc.ensureRejectedProcessBlocked(ctx, completedNode.ProcessInstanceID, actorID)
		}
	}
	return err
}

func (uc *ProcessRuntimeUsecase) reconcileLinkedWorkflowTaskCompletion(ctx context.Context, completedNode *ProcessNodeInstance, taskStatusKey string, reason string, actorID int) error {
	if uc == nil || uc.repo == nil || completedNode == nil || completedNode.ProcessInstanceID <= 0 {
		return ErrBadParam
	}
	if taskStatusKey == "rejected" && !processRejectedNodeHasExplicitRoute(completedNode) {
		return uc.ensureRejectedProcessBlocked(ctx, completedNode.ProcessInstanceID, actorID)
	}
	activatedNodes, err := uc.reconcileNextNodesAfterCompletion(ctx, completedNode, reason, actorID)
	if err != nil {
		return err
	}
	for _, activatedNode := range activatedNodes {
		if err := uc.reconcileActivatedSequentialNode(ctx, activatedNode, actorID); err != nil {
			return err
		}
	}
	return nil
}

func (uc *ProcessRuntimeUsecase) reconcileNextNodesAfterCompletion(ctx context.Context, completedNode *ProcessNodeInstance, reason string, actorID int) ([]*ProcessNodeInstance, error) {
	returnRoute, err := processReturnRouteFromNode(completedNode)
	if err != nil {
		return nil, err
	}
	if returnRoute != nil && returnRoute.matchesOutcome(completedNode.Outcome) {
		node, err := uc.reconcileReturnToNodeAttempt(ctx, completedNode, returnRoute, actorID)
		if err != nil {
			return nil, err
		}
		return []*ProcessNodeInstance{node}, nil
	}
	branchPolicyKey := processBranchPolicyKeyFromNode(completedNode)
	if branchPolicyKey != "" {
		nodeKey, err := uc.resolveNamedPolicyBranchNodeKey(ctx, completedNode, branchPolicyKey, reason, actorID)
		if err != nil {
			return nil, err
		}
		node, err := uc.reconcileNamedProcessNode(ctx, completedNode.ProcessInstanceID, nodeKey, actorID)
		if err != nil {
			return nil, err
		}
		return []*ProcessNodeInstance{node}, nil
	}
	fanOutNodeKeys, err := processFanOutNodeKeysFromNode(completedNode)
	if err != nil {
		return nil, err
	}
	if len(fanOutNodeKeys) > 0 {
		nodes := make([]*ProcessNodeInstance, 0, len(fanOutNodeKeys))
		for _, nodeKey := range fanOutNodeKeys {
			node, err := uc.reconcileNamedProcessNode(ctx, completedNode.ProcessInstanceID, nodeKey, actorID)
			if err != nil {
				return nil, err
			}
			nodes = append(nodes, node)
		}
		return nodes, nil
	}
	joinRoute, err := processJoinRouteFromNode(completedNode)
	if err != nil {
		return nil, err
	}
	if joinRoute != nil {
		node, err := uc.reconcileJoinNodeIfReady(ctx, completedNode, joinRoute, actorID)
		if err != nil || node == nil {
			return nil, err
		}
		return []*ProcessNodeInstance{node}, nil
	}
	node, err := uc.reconcileNextSequentialNode(ctx, completedNode, actorID)
	if err != nil || node == nil {
		return nil, err
	}
	return []*ProcessNodeInstance{node}, nil
}

func (uc *ProcessRuntimeUsecase) reconcileNamedProcessNode(ctx context.Context, processInstanceID int, nodeKey string, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || processInstanceID <= 0 || strings.TrimSpace(nodeKey) == "" {
		return nil, ErrBadParam
	}
	nodes, err := uc.repo.ListProcessNodeInstances(ctx, processInstanceID)
	if err != nil {
		return nil, err
	}
	var target *ProcessNodeInstance
	for _, node := range nodes {
		if node == nil || node.ProcessInstanceID != processInstanceID || node.NodeKey != nodeKey {
			continue
		}
		if target != nil {
			return nil, ErrProcessNodeInstanceConflict
		}
		target = node
	}
	if target == nil {
		return nil, ErrProcessNodeInstanceNotFound
	}
	return uc.reconcileProcessNodeActivation(ctx, target, actorID)
}

func (uc *ProcessRuntimeUsecase) reconcileProcessNodeActivation(ctx context.Context, node *ProcessNodeInstance, actorID int) (*ProcessNodeInstance, error) {
	if node == nil || node.ID <= 0 || node.ProcessInstanceID <= 0 {
		return nil, ErrBadParam
	}
	if node.Status != ProcessNodeStatusWaiting {
		return node, nil
	}
	activated, err := uc.repo.ActivateProcessNodeInstance(ctx, &ProcessNodeInstanceActivate{
		ID:                node.ID,
		ProcessInstanceID: node.ProcessInstanceID,
		ExpectedVersion:   node.Version,
	}, actorID)
	if err == nil || !errors.Is(err, ErrProcessNodeInstanceConflict) {
		return activated, err
	}
	current, getErr := uc.repo.GetProcessNodeInstance(ctx, node.ID)
	if getErr != nil {
		return nil, getErr
	}
	if current.ProcessInstanceID == node.ProcessInstanceID && current.Status != ProcessNodeStatusWaiting {
		return current, nil
	}
	return nil, err
}

func (uc *ProcessRuntimeUsecase) reconcileActivatedSequentialNode(ctx context.Context, node *ProcessNodeInstance, actorID int) error {
	if node == nil {
		return nil
	}
	if node.NodeType == ProcessNodeTypeEnd && node.Status == ProcessNodeStatusCompleted {
		return uc.ensureProcessInstanceCompleted(ctx, node.ProcessInstanceID, actorID)
	}
	if node.Status != ProcessNodeStatusActive {
		return nil
	}
	return uc.handleActivatedSequentialNode(ctx, node, actorID)
}

func (uc *ProcessRuntimeUsecase) ensureProcessInstanceCompleted(ctx context.Context, processInstanceID int, actorID int) error {
	instance, err := uc.repo.GetProcessInstance(ctx, processInstanceID)
	if err != nil {
		return err
	}
	if instance.Status == ProcessStatusCompleted {
		return nil
	}
	if instance.Status != ProcessStatusActive {
		return ErrProcessInstanceSettled
	}
	_, err = uc.repo.CompleteProcessInstance(ctx, &ProcessInstanceComplete{ID: processInstanceID}, actorID)
	if !errors.Is(err, ErrProcessInstanceSettled) {
		return err
	}
	instance, getErr := uc.repo.GetProcessInstance(ctx, processInstanceID)
	if getErr != nil {
		return getErr
	}
	if instance.Status != ProcessStatusCompleted {
		return err
	}
	return nil
}

func (uc *ProcessRuntimeUsecase) ensureRejectedProcessBlocked(ctx context.Context, processInstanceID int, actorID int) error {
	if uc == nil || uc.repo == nil || processInstanceID <= 0 {
		return ErrBadParam
	}
	if _, err := uc.repo.BlockProcessInstance(ctx, &ProcessInstanceBlock{ID: processInstanceID}, actorID); err != nil {
		if !errors.Is(err, ErrProcessInstanceSettled) {
			return err
		}
		instance, getErr := uc.repo.GetProcessInstance(ctx, processInstanceID)
		if getErr != nil {
			return getErr
		}
		if instance.Status != ProcessStatusBlocked {
			return ErrProcessInstanceSettled
		}
	}
	return nil
}

func processNodeOutcomeMatches(node *ProcessNodeInstance, outcome string) bool {
	if node == nil {
		return false
	}
	stored := ""
	if node.Outcome != nil {
		stored = strings.TrimSpace(*node.Outcome)
	}
	return stored == strings.TrimSpace(outcome)
}

func processRejectedNodeHasExplicitRoute(node *ProcessNodeInstance) bool {
	if processBranchPolicyKeyFromNode(node) != "" {
		return true
	}
	returnRoute, err := processReturnRouteFromNode(node)
	return err == nil && returnRoute != nil && returnRoute.matchesOutcome(node.Outcome)
}
