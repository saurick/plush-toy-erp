package biz

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

const ProcessLinkedWorkflowTaskReconcileMaxLimit = 100

type ProcessLinkedWorkflowTaskSettlementCandidateRepo interface {
	ListPendingLinkedWorkflowTaskSettlements(ctx context.Context, afterWorkflowTaskID int, limit int) ([]*WorkflowTask, error)
}

type ProcessLinkedWorkflowTaskReconcileFailure struct {
	WorkflowTaskID        int
	ProcessInstanceID     int
	ProcessNodeInstanceID int
	Err                   error
}

type ProcessLinkedWorkflowTaskReconcileResult struct {
	Scanned                   int
	Reconciled                int
	LastScannedWorkflowTaskID int
	Failures                  []ProcessLinkedWorkflowTaskReconcileFailure
}

// ReconcilePendingLinkedWorkflowTasks closes only the durable gap where a
// linked Workflow task is already terminal while its human/approval node is
// still active. It reuses the original task actor and the existing idempotent
// ProcessRuntime settlement path; it does not infer or replay domain facts.
func (uc *ProcessRuntimeUsecase) ReconcilePendingLinkedWorkflowTasks(
	ctx context.Context,
	afterWorkflowTaskID int,
	limit int,
) (*ProcessLinkedWorkflowTaskReconcileResult, error) {
	if uc == nil || uc.workflowRepo == nil || afterWorkflowTaskID < 0 || limit < 1 || limit > ProcessLinkedWorkflowTaskReconcileMaxLimit {
		return nil, ErrBadParam
	}
	candidateRepo, ok := uc.workflowRepo.(ProcessLinkedWorkflowTaskSettlementCandidateRepo)
	if !ok {
		return nil, ErrBadParam
	}
	tasks, err := candidateRepo.ListPendingLinkedWorkflowTaskSettlements(ctx, afterWorkflowTaskID, limit)
	if err != nil {
		return nil, err
	}
	if len(tasks) > limit {
		return nil, ErrBadParam
	}

	lastScannedWorkflowTaskID := afterWorkflowTaskID
	for _, task := range tasks {
		if task == nil {
			continue
		}
		if task.ID <= lastScannedWorkflowTaskID {
			return nil, ErrBadParam
		}
		lastScannedWorkflowTaskID = task.ID
	}
	result := &ProcessLinkedWorkflowTaskReconcileResult{
		Scanned:                   len(tasks),
		LastScannedWorkflowTaskID: lastScannedWorkflowTaskID,
		Failures:                  make([]ProcessLinkedWorkflowTaskReconcileFailure, 0),
	}
	for _, task := range tasks {
		failure := ProcessLinkedWorkflowTaskReconcileFailure{}
		if task != nil {
			failure.WorkflowTaskID = task.ID
			if task.ProcessInstanceID != nil {
				failure.ProcessInstanceID = *task.ProcessInstanceID
			}
			if task.ProcessNodeInstanceID != nil {
				failure.ProcessNodeInstanceID = *task.ProcessNodeInstanceID
			}
		}
		if task == nil || task.ID <= 0 || task.ProcessInstanceID == nil || task.ProcessNodeInstanceID == nil ||
			task.UpdatedBy == nil || *task.UpdatedBy <= 0 {
			failure.Err = ErrBadParam
			result.Failures = append(result.Failures, failure)
			continue
		}
		if _, err := uc.CompleteLinkedWorkflowTask(ctx, &ProcessLinkedWorkflowTaskCompletion{
			WorkflowTaskID: task.ID,
		}, *task.UpdatedBy); err != nil {
			failure.Err = err
			result.Failures = append(result.Failures, failure)
			continue
		}
		result.Reconciled++
	}
	return result, nil
}

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
	ownerRoleKey, assigneeID, err := uc.resolveLinkedWorkflowTaskOwner(ctx, instance, node, normalized.OwnerRoleKey)
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
		AssigneeID:            assigneeID,
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

func (uc *ProcessRuntimeUsecase) resolveLinkedWorkflowTaskOwner(ctx context.Context, instance *ProcessInstance, node *ProcessNodeInstance, explicitOwnerRoleKey string) (string, *int, error) {
	if ownerRoleKey := NormalizeRoleKey(explicitOwnerRoleKey); ownerRoleKey != "" {
		return ownerRoleKey, nil, nil
	}
	if uc == nil || uc.ownerResolver == nil || instance == nil || node == nil ||
		node.OwnerPoolKey == nil || strings.TrimSpace(*node.OwnerPoolKey) == "" ||
		node.RequiredCapabilityKey == nil || strings.TrimSpace(*node.RequiredCapabilityKey) == "" {
		return "", nil, ErrProcessTaskOwnerRoleNotFound
	}
	customerKey := processInstanceCustomerKey(instance)
	configRevision := strings.TrimSpace(instance.ConfigRevision)
	if configRevision == "" {
		return "", nil, ErrProcessTaskOwnerRoleNotFound
	}
	explanation, err := uc.ownerResolver.WorkflowCandidateOwnerRoleKeysAtRevision(ctx, customerKey, configRevision, *node.OwnerPoolKey, *node.RequiredCapabilityKey)
	if err != nil {
		return "", nil, err
	}
	if explanation == nil {
		return "", nil, ErrProcessTaskOwnerRoleNotFound
	}
	if explanation.ConfigRevision != configRevision {
		return "", nil, ErrProcessTaskOwnerRoleNotFound
	}
	candidates := NormalizeAdminRoleKeys(explanation.CandidateOwnerRoleKeys)
	switch len(candidates) {
	case 0:
		return "", nil, ErrProcessTaskOwnerRoleNotFound
	case 1:
		if len(explanation.CandidateAssigneeIDs) == 1 {
			assigneeID := explanation.CandidateAssigneeIDs[0]
			return candidates[0], &assigneeID, nil
		}
		return candidates[0], nil, nil
	default:
		return "", nil, ErrProcessTaskOwnerRoleAmbiguous
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
		commandPayload, payloadErr := workflowTaskProcessCommandPayload(task, node, taskStatusKey, reason)
		if payloadErr != nil {
			return nil, payloadErr
		}
		if err := uc.reconcileLinkedWorkflowTaskCompletion(ctx, node, taskStatusKey, reason, actorID, commandPayload); err != nil {
			return nil, err
		}
		return node, nil
	}
	if node.Status != ProcessNodeStatusActive {
		return nil, ErrProcessNodeInstanceNotActive
	}
	commandPayload, err := workflowTaskProcessCommandPayload(task, node, taskStatusKey, reason)
	if err != nil {
		return nil, err
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
		if err := uc.settleRejectedProcessAfterNodeCompletion(ctx, completedNode, reason, actorID, commandPayload); err != nil {
			return nil, err
		}
	} else {
		if err := uc.advanceAfterNodeCompletionWithPayload(ctx, completedNode, actorID, commandPayload); err != nil {
			return nil, err
		}
	}
	return completedNode, nil
}

// ValidateLinkedWorkflowTaskCompletionIntent performs the linked ProcessRuntime
// checks before a Workflow task mutation is replayed or committed. It keeps a
// malformed approval form from making the task terminal while leaving the
// authoritative process node active.
func (uc *ProcessRuntimeUsecase) ValidateLinkedWorkflowTaskCompletionIntent(
	ctx context.Context,
	task *WorkflowTask,
	targetStatus string,
	payloadPatch map[string]any,
	reason string,
	actorID int,
) error {
	if uc == nil || uc.repo == nil || task == nil || actorID <= 0 {
		return ErrBadParam
	}
	hasProcessInstance := task.ProcessInstanceID != nil
	hasProcessNode := task.ProcessNodeInstanceID != nil
	if !hasProcessInstance && !hasProcessNode {
		return nil
	}
	if !hasProcessInstance || !hasProcessNode || (targetStatus != "done" && targetStatus != "rejected") {
		return ErrBadParam
	}
	processContext, err := uc.GetProcessTaskContext(ctx, task)
	if err != nil {
		return err
	}
	if processContext.LinkedNode.NodeType != ProcessNodeTypeHumanTask &&
		processContext.LinkedNode.NodeType != ProcessNodeTypeApproval {
		return ErrBadParam
	}
	currentStatus := strings.TrimSpace(processContext.LinkedNode.Status)
	if currentStatus != ProcessNodeStatusActive && currentStatus != ProcessNodeStatusCompleted {
		return ErrProcessNodeInstanceNotActive
	}
	candidate := *task
	candidate.TaskStatusKey = targetStatus
	candidate.Payload = mergeWorkflowPayload(task.Payload, payloadPatch)
	commandPayload, err := workflowTaskProcessCommandPayload(
		&candidate,
		processContext.LinkedNode,
		targetStatus,
		strings.TrimSpace(reason),
	)
	if err != nil || currentStatus == ProcessNodeStatusCompleted {
		return err
	}
	return uc.validateNextAutomaticDomainCommandAfterWorkflowTaskCompletion(
		ctx,
		processContext,
		&candidate,
		targetStatus,
		strings.TrimSpace(reason),
		commandPayload,
		actorID,
	)
}

func (uc *ProcessRuntimeUsecase) validateNextAutomaticDomainCommandAfterWorkflowTaskCompletion(
	ctx context.Context,
	processContext *ProcessTaskContext,
	task *WorkflowTask,
	targetStatus string,
	reason string,
	additionalPayload map[string]any,
	actorID int,
) error {
	if uc == nil || processContext == nil || processContext.Instance == nil ||
		processContext.LinkedNode == nil || task == nil || actorID <= 0 {
		return ErrBadParam
	}
	branchPolicyKey := processBranchPolicyKeyFromNode(processContext.LinkedNode)
	if branchPolicyKey == "" {
		return nil
	}
	outcome := workflowTaskPayloadOutcome(task)
	if targetStatus == "rejected" {
		outcome = "rejected"
	}
	prospectiveNode := *processContext.LinkedNode
	prospectiveNode.Status = ProcessNodeStatusCompleted
	prospectiveNode.Outcome = optionalStringPointer(outcome)
	nextNodeKey, err := uc.resolveNamedPolicyBranchNodeKey(
		ctx,
		&prospectiveNode,
		branchPolicyKey,
		reason,
		actorID,
	)
	if err != nil {
		return err
	}
	var nextNode *ProcessNodeInstance
	for _, node := range processContext.Nodes {
		if node == nil || node.ProcessInstanceID != processContext.Instance.ID ||
			node.NodeKey != nextNodeKey || node.Status != ProcessNodeStatusWaiting {
			continue
		}
		if nextNode != nil {
			return ErrProcessNodeInstanceConflict
		}
		nextNode = node
	}
	if nextNode == nil {
		return ErrProcessNodeInstanceNotFound
	}
	if nextNode.NodeType != ProcessNodeTypeDomainCommand ||
		!boolValueFromAny(nextNode.PolicySnapshot["execute_after_approval"]) {
		return nil
	}
	commandKey := processDomainCommandKeyFromNode(nextNode)
	handler := uc.domainCommandHandlers[commandKey]
	if commandKey == "" || handler == nil {
		return ErrProcessDomainCommandHandlerNotFound
	}
	payload, err := automaticProcessDomainCommandPayload(processContext.Instance)
	if err != nil {
		return err
	}
	for key, value := range additionalPayload {
		if _, exists := payload[key]; exists {
			return ErrBadParam
		}
		payload[key] = value
	}
	if normalizer, ok := handler.(ProcessDomainCommandPayloadNormalizer); ok {
		payload, err = normalizer.NormalizeProcessDomainCommandPayload(payload)
		if err != nil {
			return err
		}
	}
	return handler.ValidateProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: processContext.Instance,
		Node:            nextNode,
		CommandKey:      commandKey,
		IdempotencyKey:  fmt.Sprintf("process:%d:node:%d:auto-after-approval", processContext.Instance.ID, nextNode.ID),
		Payload:         payload,
	}, actorID)
}

func (uc *ProcessRuntimeUsecase) settleRejectedProcessAfterNodeCompletion(
	ctx context.Context,
	completedNode *ProcessNodeInstance,
	reason string,
	actorID int,
	commandPayload map[string]any,
) error {
	if uc == nil || uc.repo == nil || completedNode == nil || completedNode.ProcessInstanceID <= 0 || strings.TrimSpace(reason) == "" {
		return ErrBadParam
	}
	returnRoute, err := processReturnRouteFromNode(completedNode)
	if err == nil && returnRoute != nil && returnRoute.matchesOutcome(completedNode.Outcome) {
		var activatedNode *ProcessNodeInstance
		activatedNode, err = uc.activateReturnToNodeAttempt(ctx, completedNode, returnRoute, actorID)
		if err == nil {
			err = uc.handleActivatedSequentialNodeWithPayload(ctx, activatedNode, actorID, commandPayload)
		}
	} else if err == nil {
		branchPolicyKey := processBranchPolicyKeyFromNode(completedNode)
		if branchPolicyKey != "" {
			var activatedNode *ProcessNodeInstance
			activatedNode, err = uc.activateNamedPolicyBranchNodeWithReason(ctx, completedNode, branchPolicyKey, reason, actorID)
			if err == nil {
				err = uc.handleActivatedSequentialNodeWithPayload(ctx, activatedNode, actorID, commandPayload)
			}
		} else {
			return uc.ensureRejectedProcessBlocked(ctx, completedNode.ProcessInstanceID, actorID)
		}
	}
	return err
}

func (uc *ProcessRuntimeUsecase) reconcileLinkedWorkflowTaskCompletion(
	ctx context.Context,
	completedNode *ProcessNodeInstance,
	taskStatusKey string,
	reason string,
	actorID int,
	commandPayload map[string]any,
) error {
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
		if err := uc.reconcileActivatedSequentialNodeWithPayload(ctx, activatedNode, actorID, commandPayload); err != nil {
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
	return uc.reconcileActivatedSequentialNodeWithPayload(ctx, node, actorID, nil)
}

func (uc *ProcessRuntimeUsecase) reconcileActivatedSequentialNodeWithPayload(
	ctx context.Context,
	node *ProcessNodeInstance,
	actorID int,
	commandPayload map[string]any,
) error {
	if node == nil {
		return nil
	}
	if node.NodeType == ProcessNodeTypeEnd && node.Status == ProcessNodeStatusCompleted {
		return uc.ensureProcessInstanceCompleted(ctx, node.ProcessInstanceID, actorID)
	}
	if node.Status != ProcessNodeStatusActive {
		return nil
	}
	return uc.handleActivatedSequentialNodeWithPayload(ctx, node, actorID, commandPayload)
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

func workflowTaskProcessCommandPayload(
	task *WorkflowTask,
	node *ProcessNodeInstance,
	taskStatusKey string,
	rejectionReason string,
) (map[string]any, error) {
	if task == nil || node == nil {
		return nil, ErrBadParam
	}
	if taskStatusKey == "rejected" {
		reason := strings.TrimSpace(rejectionReason)
		if reason == "" {
			return nil, ErrBadParam
		}
		return map[string]any{"reason": reason}, nil
	}
	profileKey := ""
	if node.FormProfileKey != nil {
		profileKey = strings.TrimSpace(*node.FormProfileKey)
	}
	requiresDecision := profileKey == "finance_payment_approval" ||
		profileKey == "inventory_adjustment_approval" ||
		profileKey == "production_exception_approval"
	rawDecision, hasDecision := task.Payload["process_decision"]
	if !requiresDecision {
		if hasDecision {
			return nil, ErrBadParam
		}
		return nil, nil
	}
	decision, ok := rawDecision.(map[string]any)
	if !ok {
		return nil, ErrBadParam
	}
	reasonValue, ok := decision["reason"].(string)
	reason := strings.TrimSpace(reasonValue)
	if !ok || reason == "" || len([]rune(reason)) > 255 {
		return nil, ErrBadParam
	}
	out := map[string]any{"reason": reason}
	for key := range decision {
		if key != "reason" && key != "approved_quantity" {
			return nil, ErrBadParam
		}
	}
	if profileKey != "production_exception_approval" {
		if _, exists := decision["approved_quantity"]; exists {
			return nil, ErrBadParam
		}
		return out, nil
	}
	if value, exists := decision["approved_quantity"]; exists {
		text, ok := value.(string)
		if !ok || text == "" {
			return nil, ErrBadParam
		}
		quantity, ok := parsePositiveNumeric20Scale6Contract(text)
		if !ok {
			return nil, ErrBadParam
		}
		out["approved_quantity"] = quantity.String()
	}
	return out, nil
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
