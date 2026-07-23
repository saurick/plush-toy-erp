package biz

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

func (uc *ProcessRuntimeUsecase) WakeProcessWaitEventNode(ctx context.Context, in *ProcessWaitEventWakeup, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProcessWaitEventWakeup(*in)
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
	if node.NodeType != ProcessNodeTypeWaitEvent {
		return nil, ErrBadParam
	}
	if node.Status != ProcessNodeStatusActive {
		return nil, ErrProcessNodeInstanceNotActive
	}
	if node.Version != normalized.ExpectedVersion {
		return nil, ErrProcessNodeInstanceConflict
	}
	nodeEventKey := processWaitEventKeyFromNode(node)
	if nodeEventKey == "" || normalized.EventKey != nodeEventKey {
		return nil, ErrBadParam
	}
	outcome := normalized.Outcome
	if outcome == "" {
		outcome = nodeEventKey
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
	if err := uc.advanceAfterNodeCompletion(ctx, completedNode, actorID); err != nil {
		return nil, err
	}
	return completedNode, nil
}

func (uc *ProcessRuntimeUsecase) BlockProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceBlock, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProcessNodeInstanceBlock(*in)
	if err != nil {
		return nil, err
	}
	return uc.blockActiveProcessNodeInstance(ctx, &normalized, actorID)
}

func (uc *ProcessRuntimeUsecase) EscalateDueProcessNode(ctx context.Context, in *ProcessNodeDueAtEscalation, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProcessNodeDueAtEscalation(*in)
	if err != nil {
		return nil, err
	}
	instance, node, err := uc.getActiveProcessNodeForMutation(ctx, normalized.ProcessInstanceID, normalized.ProcessNodeInstanceID, normalized.ExpectedVersion)
	if err != nil {
		return nil, err
	}
	if node.DueAt == nil {
		return nil, ErrProcessNodeDueAtMissing
	}
	now := normalized.Now
	if now.IsZero() {
		now = time.Now()
	}
	if now.Before(*node.DueAt) {
		return nil, ErrProcessNodeDueAtNotReached
	}
	outcome := normalized.Outcome
	if outcome == "" {
		outcome = "due_at_overdue"
	}
	blockedNode, err := uc.repo.BlockProcessNodeAndInstance(ctx, &ProcessNodeInstanceBlock{
		ProcessInstanceID:     instance.ID,
		ProcessNodeInstanceID: node.ID,
		ExpectedVersion:       node.Version,
		Reason:                "due_at reached",
		Outcome:               outcome,
	}, actorID)
	if err != nil {
		return nil, err
	}
	return blockedNode, nil
}

func (uc *ProcessRuntimeUsecase) blockActiveProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceBlock, actorID int) (*ProcessNodeInstance, error) {
	instance, node, err := uc.getActiveProcessNodeForMutation(ctx, in.ProcessInstanceID, in.ProcessNodeInstanceID, in.ExpectedVersion)
	if err != nil {
		return nil, err
	}
	blockedNode, err := uc.repo.BlockProcessNodeAndInstance(ctx, &ProcessNodeInstanceBlock{
		ProcessInstanceID:        instance.ID,
		ProcessNodeInstanceID:    node.ID,
		ExpectedVersion:          node.Version,
		Reason:                   in.Reason,
		Outcome:                  in.Outcome,
		DomainCommandFingerprint: in.DomainCommandFingerprint,
	}, actorID)
	if err != nil {
		return nil, err
	}
	return blockedNode, nil
}

func (uc *ProcessRuntimeUsecase) getActiveProcessNodeForMutation(ctx context.Context, processInstanceID int, processNodeInstanceID int, expectedVersion int) (*ProcessInstance, *ProcessNodeInstance, error) {
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || expectedVersion <= 0 {
		return nil, nil, ErrBadParam
	}
	instance, err := uc.repo.GetProcessInstance(ctx, processInstanceID)
	if err != nil {
		return nil, nil, err
	}
	if instance.Status != "" && instance.Status != ProcessStatusActive {
		return nil, nil, ErrProcessInstanceSettled
	}
	node, err := uc.repo.GetProcessNodeInstance(ctx, processNodeInstanceID)
	if err != nil {
		return nil, nil, err
	}
	if node.ProcessInstanceID != instance.ID {
		return nil, nil, ErrBadParam
	}
	if isSettledProcessNodeStatus(node.Status) {
		return nil, nil, ErrProcessNodeInstanceSettled
	}
	if node.Status != ProcessNodeStatusActive {
		return nil, nil, ErrProcessNodeInstanceNotActive
	}
	if node.Version != expectedVersion {
		return nil, nil, ErrProcessNodeInstanceConflict
	}
	return instance, node, nil
}

func (uc *ProcessRuntimeUsecase) advanceAfterNodeCompletion(ctx context.Context, completedNode *ProcessNodeInstance, actorID int) error {
	activatedNodes, err := uc.activateNextNodesAfterCompletion(ctx, completedNode, actorID)
	if err != nil {
		return err
	}
	for _, activatedNode := range activatedNodes {
		if err := uc.handleActivatedSequentialNode(ctx, activatedNode, actorID); err != nil {
			return err
		}
	}
	return nil
}

func (uc *ProcessRuntimeUsecase) handleActivatedSequentialNode(ctx context.Context, activatedNode *ProcessNodeInstance, actorID int) error {
	if activatedNode == nil {
		return nil
	}
	switch activatedNode.NodeType {
	case ProcessNodeTypeHumanTask, ProcessNodeTypeApproval:
		_, err := uc.CreateLinkedWorkflowTask(ctx, &ProcessLinkedWorkflowTaskCreate{
			ProcessInstanceID:     activatedNode.ProcessInstanceID,
			ProcessNodeInstanceID: activatedNode.ID,
			ExpectedVersion:       activatedNode.Version,
		}, actorID)
		return err
	case ProcessNodeTypeEnd:
		return uc.completeEndNodeAndProcess(ctx, activatedNode, actorID)
	case ProcessNodeTypeDomainCommand:
		if !boolValueFromAny(activatedNode.PolicySnapshot["execute_after_approval"]) {
			return nil
		}
		instance, err := uc.repo.GetProcessInstance(ctx, activatedNode.ProcessInstanceID)
		if err != nil {
			return err
		}
		payload, err := automaticProcessDomainCommandPayload(instance)
		if err != nil {
			return err
		}
		_, err = uc.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
			ProcessInstanceID:     activatedNode.ProcessInstanceID,
			ProcessNodeInstanceID: activatedNode.ID,
			ExpectedVersion:       activatedNode.Version,
			CommandKey:            processDomainCommandKeyFromNode(activatedNode),
			IdempotencyKey:        fmt.Sprintf("process:%d:node:%d:auto-after-approval", activatedNode.ProcessInstanceID, activatedNode.ID),
			Payload:               payload,
		}, actorID)
		return err
	default:
		return nil
	}
}

func automaticProcessDomainCommandPayload(instance *ProcessInstance) (map[string]any, error) {
	if instance == nil || instance.BusinessRefID <= 0 {
		return nil, ErrBadParam
	}
	switch strings.TrimSpace(instance.BusinessRefType) {
	case "sales_order":
		return map[string]any{"sales_order_id": instance.BusinessRefID}, nil
	case "purchase_order":
		return map[string]any{"purchase_order_id": instance.BusinessRefID}, nil
	case "shipment":
		return map[string]any{"shipment_id": instance.BusinessRefID}, nil
	default:
		return nil, ErrBadParam
	}
}

func (uc *ProcessRuntimeUsecase) completeEndNodeAndProcess(ctx context.Context, endNode *ProcessNodeInstance, actorID int) error {
	if uc == nil || uc.repo == nil || endNode == nil || endNode.ID <= 0 || endNode.ProcessInstanceID <= 0 {
		return ErrBadParam
	}
	if endNode.NodeType != ProcessNodeTypeEnd {
		return ErrBadParam
	}
	if endNode.Status != ProcessNodeStatusActive {
		return ErrProcessNodeInstanceNotActive
	}
	if _, err := uc.repo.CompleteProcessNodeInstance(ctx, &ProcessNodeInstanceComplete{
		ID:                endNode.ID,
		ProcessInstanceID: endNode.ProcessInstanceID,
		ExpectedVersion:   endNode.Version,
		Outcome:           ProcessStatusCompleted,
	}, actorID); err != nil {
		return err
	}
	_, err := uc.repo.CompleteProcessInstance(ctx, &ProcessInstanceComplete{
		ID: endNode.ProcessInstanceID,
	}, actorID)
	return err
}

func (uc *ProcessRuntimeUsecase) activateNextNodesAfterCompletion(ctx context.Context, completedNode *ProcessNodeInstance, actorID int) ([]*ProcessNodeInstance, error) {
	returnRoute, err := processReturnRouteFromNode(completedNode)
	if err != nil {
		return nil, err
	}
	if returnRoute != nil && returnRoute.matchesOutcome(completedNode.Outcome) {
		activatedNode, err := uc.activateReturnToNodeAttempt(ctx, completedNode, returnRoute, actorID)
		if err != nil {
			return nil, err
		}
		return []*ProcessNodeInstance{activatedNode}, nil
	}
	branchPolicyKey := processBranchPolicyKeyFromNode(completedNode)
	if branchPolicyKey != "" {
		activatedNode, err := uc.activateNamedPolicyBranchNode(ctx, completedNode, branchPolicyKey, actorID)
		if err != nil {
			return nil, err
		}
		return []*ProcessNodeInstance{activatedNode}, nil
	}
	fanOutNodeKeys, err := processFanOutNodeKeysFromNode(completedNode)
	if err != nil {
		return nil, err
	}
	if len(fanOutNodeKeys) > 0 {
		return uc.activateFanOutNodes(ctx, completedNode, fanOutNodeKeys, actorID)
	}
	joinRoute, err := processJoinRouteFromNode(completedNode)
	if err != nil {
		return nil, err
	}
	if joinRoute != nil {
		activatedNode, err := uc.activateJoinNodeIfReady(ctx, completedNode, joinRoute, actorID)
		if err != nil {
			return nil, err
		}
		if activatedNode == nil {
			return nil, nil
		}
		return []*ProcessNodeInstance{activatedNode}, nil
	}
	activatedNode, err := uc.activateNextSequentialNode(ctx, completedNode, actorID)
	if err != nil {
		return nil, err
	}
	if activatedNode == nil {
		return nil, nil
	}
	return []*ProcessNodeInstance{activatedNode}, nil
}

func (uc *ProcessRuntimeUsecase) activateNamedPolicyBranchNode(ctx context.Context, completedNode *ProcessNodeInstance, branchPolicyKey string, actorID int) (*ProcessNodeInstance, error) {
	return uc.activateNamedPolicyBranchNodeWithReason(ctx, completedNode, branchPolicyKey, "", actorID)
}

func (uc *ProcessRuntimeUsecase) activateNamedPolicyBranchNodeWithReason(ctx context.Context, completedNode *ProcessNodeInstance, branchPolicyKey string, reason string, actorID int) (*ProcessNodeInstance, error) {
	nextNodeKey, err := uc.resolveNamedPolicyBranchNodeKey(ctx, completedNode, branchPolicyKey, reason, actorID)
	if err != nil {
		return nil, err
	}
	return uc.activateNamedWaitingNode(ctx, completedNode.ProcessInstanceID, nextNodeKey, actorID)
}

func (uc *ProcessRuntimeUsecase) resolveNamedPolicyBranchNodeKey(ctx context.Context, completedNode *ProcessNodeInstance, branchPolicyKey string, reason string, actorID int) (string, error) {
	if uc == nil || uc.repo == nil {
		return "", ErrBadParam
	}
	handler := uc.branchPolicyHandlers[branchPolicyKey]
	if handler == nil {
		return "", ErrProcessBranchPolicyHandlerNotFound
	}
	instance, err := uc.repo.GetProcessInstance(ctx, completedNode.ProcessInstanceID)
	if err != nil {
		return "", err
	}
	outcome := ""
	if completedNode.Outcome != nil {
		outcome = strings.TrimSpace(*completedNode.Outcome)
	}
	result, err := handler.ResolveProcessBranch(ctx, &ProcessBranchPolicyInput{
		ProcessInstance: instance,
		CompletedNode:   completedNode,
		PolicyKey:       branchPolicyKey,
		Outcome:         outcome,
		Reason:          strings.TrimSpace(reason),
		PolicySnapshot:  completedNode.PolicySnapshot,
	}, actorID)
	if err != nil {
		return "", err
	}
	nextNodeKey := ""
	if result != nil {
		nextNodeKey = strings.TrimSpace(result.NextNodeKey)
	}
	if nextNodeKey == "" {
		return "", ErrBadParam
	}
	return nextNodeKey, nil
}

func (uc *ProcessRuntimeUsecase) activateFanOutNodes(ctx context.Context, completedNode *ProcessNodeInstance, nodeKeys []string, actorID int) ([]*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || completedNode == nil || completedNode.ProcessInstanceID <= 0 {
		return nil, ErrBadParam
	}
	activatedNodes := make([]*ProcessNodeInstance, 0, len(nodeKeys))
	for _, nodeKey := range nodeKeys {
		activatedNode, err := uc.activateNamedWaitingNode(ctx, completedNode.ProcessInstanceID, nodeKey, actorID)
		if err != nil {
			return nil, err
		}
		activatedNodes = append(activatedNodes, activatedNode)
	}
	return activatedNodes, nil
}

func (uc *ProcessRuntimeUsecase) activateReturnToNodeAttempt(ctx context.Context, completedNode *ProcessNodeInstance, route *processReturnRoute, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || completedNode == nil || route == nil || completedNode.ProcessInstanceID <= 0 {
		return nil, ErrBadParam
	}
	nodes, err := uc.repo.ListProcessNodeInstances(ctx, completedNode.ProcessInstanceID)
	if err != nil {
		return nil, err
	}
	var template *ProcessNodeInstance
	highestAttempt := 0
	for _, node := range nodes {
		if node == nil || node.ProcessInstanceID != completedNode.ProcessInstanceID || node.NodeKey != route.NodeKey {
			continue
		}
		if node.Attempt > highestAttempt {
			highestAttempt = node.Attempt
			template = node
		}
	}
	if template == nil {
		return nil, ErrProcessNodeInstanceNotFound
	}
	if !isSettledProcessNodeStatus(template.Status) {
		return nil, ErrProcessNodeInstanceConflict
	}
	nextAttempt := highestAttempt + 1
	if route.MaxAttempts > 0 && nextAttempt > route.MaxAttempts {
		return nil, ErrProcessReturnAttemptLimit
	}
	createdNode, err := uc.repo.CreateProcessNodeInstanceAttempt(ctx, &ProcessNodeInstanceAttemptCreate{
		ProcessInstanceID:     completedNode.ProcessInstanceID,
		NodeKey:               template.NodeKey,
		NodeType:              template.NodeType,
		Attempt:               nextAttempt,
		OwnerPoolKey:          template.OwnerPoolKey,
		RequiredCapabilityKey: template.RequiredCapabilityKey,
		FormProfileKey:        template.FormProfileKey,
		ActionSetKey:          template.ActionSetKey,
		PolicySnapshot:        cloneProcessPolicySnapshot(template.PolicySnapshot),
		DueAt:                 template.DueAt,
	}, actorID)
	if err != nil {
		return nil, err
	}
	return uc.repo.ActivateProcessNodeInstance(ctx, &ProcessNodeInstanceActivate{
		ID:                createdNode.ID,
		ProcessInstanceID: createdNode.ProcessInstanceID,
		ExpectedVersion:   createdNode.Version,
	}, actorID)
}

func (uc *ProcessRuntimeUsecase) reconcileReturnToNodeAttempt(ctx context.Context, completedNode *ProcessNodeInstance, route *processReturnRoute, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || completedNode == nil || route == nil || completedNode.ProcessInstanceID <= 0 {
		return nil, ErrBadParam
	}
	nodes, err := uc.repo.ListProcessNodeInstances(ctx, completedNode.ProcessInstanceID)
	if err != nil {
		return nil, err
	}
	var routedAttempt *ProcessNodeInstance
	for _, node := range nodes {
		if node == nil || node.ProcessInstanceID != completedNode.ProcessInstanceID || node.NodeKey != route.NodeKey || node.ID <= completedNode.ID {
			continue
		}
		if routedAttempt == nil || node.ID < routedAttempt.ID {
			routedAttempt = node
		}
	}
	if routedAttempt != nil {
		return uc.reconcileProcessNodeActivation(ctx, routedAttempt, actorID)
	}
	activatedNode, err := uc.activateReturnToNodeAttempt(ctx, completedNode, route, actorID)
	if err == nil || (!errors.Is(err, ErrProcessInstanceExists) && !errors.Is(err, ErrProcessNodeInstanceConflict)) {
		return activatedNode, err
	}
	nodes, listErr := uc.repo.ListProcessNodeInstances(ctx, completedNode.ProcessInstanceID)
	if listErr != nil {
		return nil, listErr
	}
	for _, node := range nodes {
		if node != nil && node.ProcessInstanceID == completedNode.ProcessInstanceID && node.NodeKey == route.NodeKey && node.ID > completedNode.ID {
			return uc.reconcileProcessNodeActivation(ctx, node, actorID)
		}
	}
	return nil, err
}

func (uc *ProcessRuntimeUsecase) activateJoinNodeIfReady(ctx context.Context, completedNode *ProcessNodeInstance, route *processJoinRoute, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || completedNode == nil || route == nil || completedNode.ProcessInstanceID <= 0 {
		return nil, ErrBadParam
	}
	nodes, err := uc.repo.ListProcessNodeInstances(ctx, completedNode.ProcessInstanceID)
	if err != nil {
		return nil, err
	}
	sourceStatuses, targetNode, err := collectJoinRouteNodes(nodes, completedNode.ProcessInstanceID, route)
	if err != nil {
		return nil, err
	}
	if _, ok := sourceStatuses[completedNode.NodeKey]; !ok {
		return nil, ErrBadParam
	}
	ready := false
	switch route.Policy {
	case "all":
		ready = true
		for _, status := range sourceStatuses {
			if status != ProcessNodeStatusCompleted {
				ready = false
				break
			}
		}
	case "any":
		for _, status := range sourceStatuses {
			if status == ProcessNodeStatusCompleted {
				ready = true
				break
			}
		}
	default:
		return nil, ErrBadParam
	}
	if !ready {
		return nil, nil
	}
	if targetNode.Status == ProcessNodeStatusActive || targetNode.Status == ProcessNodeStatusCompleted {
		return nil, nil
	}
	if targetNode.Status != ProcessNodeStatusWaiting {
		return nil, ErrProcessNodeInstanceConflict
	}
	return uc.repo.ActivateProcessNodeInstance(ctx, &ProcessNodeInstanceActivate{
		ID:                targetNode.ID,
		ProcessInstanceID: targetNode.ProcessInstanceID,
		ExpectedVersion:   targetNode.Version,
	}, actorID)
}

func (uc *ProcessRuntimeUsecase) reconcileJoinNodeIfReady(ctx context.Context, completedNode *ProcessNodeInstance, route *processJoinRoute, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || completedNode == nil || route == nil || completedNode.ProcessInstanceID <= 0 {
		return nil, ErrBadParam
	}
	nodes, err := uc.repo.ListProcessNodeInstances(ctx, completedNode.ProcessInstanceID)
	if err != nil {
		return nil, err
	}
	sourceStatuses, targetNode, err := collectJoinRouteNodes(nodes, completedNode.ProcessInstanceID, route)
	if err != nil {
		return nil, err
	}
	if _, ok := sourceStatuses[completedNode.NodeKey]; !ok {
		return nil, ErrBadParam
	}
	ready := route.Policy == "all"
	for _, status := range sourceStatuses {
		if route.Policy == "all" && status != ProcessNodeStatusCompleted {
			ready = false
		}
		if route.Policy == "any" && status == ProcessNodeStatusCompleted {
			ready = true
		}
	}
	if !ready {
		return nil, nil
	}
	return uc.reconcileProcessNodeActivation(ctx, targetNode, actorID)
}

func (uc *ProcessRuntimeUsecase) activateNamedWaitingNode(ctx context.Context, processInstanceID int, nodeKey string, actorID int) (*ProcessNodeInstance, error) {
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
	if target.Status != ProcessNodeStatusWaiting {
		return nil, ErrProcessNodeInstanceConflict
	}
	return uc.repo.ActivateProcessNodeInstance(ctx, &ProcessNodeInstanceActivate{
		ID:                target.ID,
		ProcessInstanceID: target.ProcessInstanceID,
		ExpectedVersion:   target.Version,
	}, actorID)
}

func (uc *ProcessRuntimeUsecase) activateNextSequentialNode(ctx context.Context, completedNode *ProcessNodeInstance, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || completedNode == nil || completedNode.ProcessInstanceID <= 0 || completedNode.ID <= 0 {
		return nil, ErrBadParam
	}
	nodes, err := uc.repo.ListProcessNodeInstances(ctx, completedNode.ProcessInstanceID)
	if err != nil {
		return nil, err
	}
	for index, node := range nodes {
		if node == nil || node.ID != completedNode.ID {
			continue
		}
		if index+1 >= len(nodes) || nodes[index+1] == nil {
			return nil, nil
		}
		next := nodes[index+1]
		if next.Status != ProcessNodeStatusWaiting {
			return nil, nil
		}
		return uc.repo.ActivateProcessNodeInstance(ctx, &ProcessNodeInstanceActivate{
			ID:                next.ID,
			ProcessInstanceID: next.ProcessInstanceID,
			ExpectedVersion:   next.Version,
		}, actorID)
	}
	return nil, ErrProcessNodeInstanceNotFound
}

func (uc *ProcessRuntimeUsecase) reconcileNextSequentialNode(ctx context.Context, completedNode *ProcessNodeInstance, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || completedNode == nil || completedNode.ProcessInstanceID <= 0 || completedNode.ID <= 0 {
		return nil, ErrBadParam
	}
	nodes, err := uc.repo.ListProcessNodeInstances(ctx, completedNode.ProcessInstanceID)
	if err != nil {
		return nil, err
	}
	for index, node := range nodes {
		if node == nil || node.ID != completedNode.ID {
			continue
		}
		if index+1 >= len(nodes) || nodes[index+1] == nil {
			return nil, nil
		}
		return uc.reconcileProcessNodeActivation(ctx, nodes[index+1], actorID)
	}
	return nil, ErrProcessNodeInstanceNotFound
}
