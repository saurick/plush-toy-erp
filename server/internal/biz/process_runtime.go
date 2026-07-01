package biz

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
)

var (
	ErrProcessInstanceNotFound             = errors.New("process instance not found")
	ErrProcessNodeInstanceNotFound         = errors.New("process node instance not found")
	ErrProcessInstanceExists               = errors.New("process instance already exists")
	ErrProcessInstanceSettled              = errors.New("process instance already settled")
	ErrProcessNodeInstanceSettled          = errors.New("process node instance already settled")
	ErrProcessNodeInstanceNotActive        = errors.New("process node instance is not active")
	ErrProcessNodeInstanceConflict         = errors.New("process node instance version conflict")
	ErrProcessTaskOwnerRoleNotFound        = errors.New("process workflow task owner role not found")
	ErrProcessTaskOwnerRoleAmbiguous       = errors.New("process workflow task owner role is ambiguous")
	ErrProcessDomainCommandHandlerNotFound = errors.New("process domain command handler not found")
	ErrProcessBranchPolicyHandlerNotFound  = errors.New("process branch policy handler not found")
	ErrProcessReturnAttemptLimit           = errors.New("process return attempt limit exceeded")
	ErrProcessNodeDueAtMissing             = errors.New("process node due_at is missing")
	ErrProcessNodeDueAtNotReached          = errors.New("process node due_at is not reached")
)

const (
	ProcessKeySalesOrderAcceptance  = "sales_order_acceptance"
	ProcessKeyMaterialSupply        = "material_supply"
	ProcessKeyFinishedGoodsDelivery = "finished_goods_delivery"

	ProcessDomainCommandFinishedGoodsQualityDecide = "finished_goods_quality.decide"
	ProcessDomainCommandShipmentFinanceRelease     = "shipment.finance_release"
	ProcessDomainCommandShipmentShip               = "shipment.ship"
	ProcessDomainCommandFinanceReceivableLead      = "finance.receivable_lead"

	ProcessStatusActive    = "active"
	ProcessStatusCompleted = "completed"
	ProcessStatusCancelled = "cancelled"
	ProcessStatusBlocked   = "blocked"

	ProcessNodeStatusWaiting   = "waiting"
	ProcessNodeStatusActive    = "active"
	ProcessNodeStatusCompleted = "completed"
	ProcessNodeStatusSkipped   = "skipped"
	ProcessNodeStatusFailed    = "failed"
	ProcessNodeStatusBlocked   = "blocked"

	ProcessNodeTypeHumanTask     = "human_task"
	ProcessNodeTypeApproval      = "approval"
	ProcessNodeTypeDomainCommand = "domain_command"
	ProcessNodeTypeWaitEvent     = "wait_event"
	ProcessNodeTypeEnd           = "end"
)

type ProcessInstance struct {
	ID                     int
	ProcessKey             string
	ProcessVersion         string
	VariantKey             *string
	ConfigRevision         string
	DefinitionHash         string
	ModuleContractSnapshot map[string]any
	BusinessRefType        string
	BusinessRefID          int
	BusinessRefNo          *string
	CorrelationKey         *string
	IdempotencyKey         string
	Status                 string
	StartedAt              time.Time
	CompletedAt            *time.Time
	CreatedBy              *int
	UpdatedBy              *int
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type ProcessNodeInstance struct {
	ID                    int
	ProcessInstanceID     int
	NodeKey               string
	NodeType              string
	Attempt               int
	Status                string
	OwnerPoolKey          *string
	RequiredCapabilityKey *string
	FormProfileKey        *string
	ActionSetKey          *string
	PolicySnapshot        map[string]any
	DueAt                 *time.Time
	StartedAt             *time.Time
	CompletedAt           *time.Time
	Outcome               *string
	Version               int
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type ProcessInstanceCreate struct {
	ProcessKey             string
	ProcessVersion         string
	VariantKey             *string
	ConfigRevision         string
	DefinitionHash         string
	ModuleContractSnapshot map[string]any
	BusinessRefType        string
	BusinessRefID          int
	BusinessRefNo          *string
	CorrelationKey         *string
	IdempotencyKey         string
	Status                 string
	Nodes                  []ProcessNodeInstanceCreate
}

type ProcessInstanceFromCustomerConfigInput struct {
	CustomerKey     string
	ProcessKey      string
	ProcessVersion  string
	BusinessRefType string
	BusinessRefID   int
	BusinessRefNo   *string
	CorrelationKey  *string
	IdempotencyKey  string
}

type ProcessNodeInstanceCreate struct {
	NodeKey               string
	NodeType              string
	Attempt               int
	Status                string
	OwnerPoolKey          *string
	RequiredCapabilityKey *string
	FormProfileKey        *string
	ActionSetKey          *string
	PolicySnapshot        map[string]any
	DueAt                 *time.Time
}

type ProcessInstanceStart struct {
	ID int
}

type ProcessLinkedWorkflowTaskCreate struct {
	ProcessInstanceID     int
	ProcessNodeInstanceID int
	ExpectedVersion       int
	TaskCode              string
	TaskGroup             string
	TaskName              string
	TaskStatusKey         string
	OwnerRoleKey          string
	Payload               map[string]any
}

type ProcessLinkedWorkflowTaskCompletion struct {
	WorkflowTaskID int
	Outcome        string
}

type ProcessDomainCommandExecution struct {
	ProcessInstanceID     int
	ProcessNodeInstanceID int
	ExpectedVersion       int
	CommandKey            string
	IdempotencyKey        string
	Payload               map[string]any
}

type ProcessBusinessRef struct {
	RefType string
	RefID   int
	RefNo   *string
}

type ProcessInstanceLinkedBusinessRefRecord struct {
	ProcessInstanceID int
	RefType           string
	RefID             int
	RefNo             *string
	SourceNodeKey     string
	SourceCommandKey  string
}

type ProcessWaitEventWakeup struct {
	ProcessInstanceID     int
	ProcessNodeInstanceID int
	ExpectedVersion       int
	EventKey              string
	IdempotencyKey        string
	Outcome               string
	Payload               map[string]any
}

type ProcessNodeInstanceBlock struct {
	ProcessInstanceID     int
	ProcessNodeInstanceID int
	ExpectedVersion       int
	Reason                string
	Outcome               string
}

type ProcessNodeDueAtEscalation struct {
	ProcessInstanceID     int
	ProcessNodeInstanceID int
	ExpectedVersion       int
	Now                   time.Time
	Outcome               string
}

type ProcessDomainCommandInput struct {
	ProcessInstance *ProcessInstance
	Node            *ProcessNodeInstance
	CommandKey      string
	IdempotencyKey  string
	Payload         map[string]any
}

type ProcessDomainCommandResult struct {
	Outcome            string
	LinkedBusinessRefs []ProcessBusinessRef
}

type ProcessBranchPolicyInput struct {
	ProcessInstance *ProcessInstance
	CompletedNode   *ProcessNodeInstance
	PolicyKey       string
	Outcome         string
	PolicySnapshot  map[string]any
}

type ProcessBranchPolicyResult struct {
	NextNodeKey string
}

type ProcessNodeInstanceComplete struct {
	ID                int
	ProcessInstanceID int
	ExpectedVersion   int
	Outcome           string
}

type ProcessInstanceComplete struct {
	ID int
}

type ProcessInstanceBlock struct {
	ID int
}

type ProcessNodeInstanceActivate struct {
	ID                int
	ProcessInstanceID int
	ExpectedVersion   int
}

type ProcessNodeInstanceAttemptCreate struct {
	ProcessInstanceID     int
	NodeKey               string
	NodeType              string
	Attempt               int
	OwnerPoolKey          *string
	RequiredCapabilityKey *string
	FormProfileKey        *string
	ActionSetKey          *string
	PolicySnapshot        map[string]any
	DueAt                 *time.Time
}

type ProcessRuntimeRepo interface {
	CreateProcessInstance(ctx context.Context, in *ProcessInstanceCreate, actorID int) (*ProcessInstance, []*ProcessNodeInstance, error)
	GetProcessInstance(ctx context.Context, id int) (*ProcessInstance, error)
	GetProcessNodeInstance(ctx context.Context, id int) (*ProcessNodeInstance, error)
	ListProcessNodeInstances(ctx context.Context, processInstanceID int) ([]*ProcessNodeInstance, error)
	CompleteProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceComplete, actorID int) (*ProcessNodeInstance, error)
	CompleteProcessInstance(ctx context.Context, in *ProcessInstanceComplete, actorID int) (*ProcessInstance, error)
	RecordProcessInstanceLinkedBusinessRef(ctx context.Context, in *ProcessInstanceLinkedBusinessRefRecord, actorID int) (*ProcessInstance, error)
	BlockProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceBlock, actorID int) (*ProcessNodeInstance, error)
	BlockProcessInstance(ctx context.Context, in *ProcessInstanceBlock, actorID int) (*ProcessInstance, error)
	ActivateProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceActivate, actorID int) (*ProcessNodeInstance, error)
	CreateProcessNodeInstanceAttempt(ctx context.Context, in *ProcessNodeInstanceAttemptCreate, actorID int) (*ProcessNodeInstance, error)
}

type ProcessRuntimeOwnerRoleResolver interface {
	WorkflowCandidateOwnerRoleKeys(ctx context.Context, customerKey string, ownerPoolKey string, requiredCapabilities ...string) (*WorkflowTaskCandidateExplanation, error)
}

type ProcessDomainCommandHandler interface {
	ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error)
}

type ProcessBranchPolicyHandler interface {
	ResolveProcessBranch(ctx context.Context, in *ProcessBranchPolicyInput, actorID int) (*ProcessBranchPolicyResult, error)
}

type ProcessRuntimeUsecase struct {
	repo                  ProcessRuntimeRepo
	workflowRepo          WorkflowRepo
	ownerResolver         ProcessRuntimeOwnerRoleResolver
	domainCommandHandlers map[string]ProcessDomainCommandHandler
	branchPolicyHandlers  map[string]ProcessBranchPolicyHandler
}

func NewProcessRuntimeUsecase(repo ProcessRuntimeRepo, workflowRepo WorkflowRepo, ownerResolver ...ProcessRuntimeOwnerRoleResolver) *ProcessRuntimeUsecase {
	uc := &ProcessRuntimeUsecase{repo: repo, workflowRepo: workflowRepo}
	if len(ownerResolver) > 0 {
		uc.ownerResolver = ownerResolver[0]
	}
	return uc
}

func (uc *ProcessRuntimeUsecase) RegisterDomainCommandHandler(commandKey string, handler ProcessDomainCommandHandler) error {
	commandKey = strings.TrimSpace(commandKey)
	if uc == nil || commandKey == "" || handler == nil {
		return ErrBadParam
	}
	if uc.domainCommandHandlers == nil {
		uc.domainCommandHandlers = map[string]ProcessDomainCommandHandler{}
	}
	uc.domainCommandHandlers[commandKey] = handler
	return nil
}

func (uc *ProcessRuntimeUsecase) RegisterBranchPolicyHandler(policyKey string, handler ProcessBranchPolicyHandler) error {
	policyKey = strings.TrimSpace(policyKey)
	if uc == nil || policyKey == "" || handler == nil {
		return ErrBadParam
	}
	if uc.branchPolicyHandlers == nil {
		uc.branchPolicyHandlers = map[string]ProcessBranchPolicyHandler{}
	}
	uc.branchPolicyHandlers[policyKey] = handler
	return nil
}

func (uc *ProcessRuntimeUsecase) CreateProcessInstance(ctx context.Context, in *ProcessInstanceCreate, actorID int) (*ProcessInstance, []*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, nil, ErrBadParam
	}
	normalized, err := normalizeProcessInstanceCreate(*in)
	if err != nil {
		return nil, nil, err
	}
	return uc.repo.CreateProcessInstance(ctx, &normalized, actorID)
}

func (uc *ProcessRuntimeUsecase) StartProcessInstance(ctx context.Context, in *ProcessInstanceStart, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || in == nil || in.ID <= 0 {
		return nil, ErrBadParam
	}
	instance, err := uc.repo.GetProcessInstance(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if instance.Status != "" && instance.Status != ProcessStatusActive {
		return nil, ErrProcessInstanceSettled
	}
	nodes, err := uc.repo.ListProcessNodeInstances(ctx, instance.ID)
	if err != nil {
		return nil, err
	}
	if len(nodes) == 0 || nodes[0] == nil {
		return nil, ErrProcessNodeInstanceNotFound
	}
	firstNode := nodes[0]
	if firstNode.ProcessInstanceID != instance.ID {
		return nil, ErrBadParam
	}
	if firstNode.Status != ProcessNodeStatusWaiting {
		return nil, ErrProcessNodeInstanceConflict
	}
	activatedNode, err := uc.repo.ActivateProcessNodeInstance(ctx, &ProcessNodeInstanceActivate{
		ID:                firstNode.ID,
		ProcessInstanceID: firstNode.ProcessInstanceID,
		ExpectedVersion:   firstNode.Version,
	}, actorID)
	if err != nil {
		return nil, err
	}
	if err := uc.handleActivatedSequentialNode(ctx, activatedNode, actorID); err != nil {
		return nil, err
	}
	return activatedNode, nil
}

func (uc *ProcessRuntimeUsecase) GetProcessInstance(ctx context.Context, id int) (*ProcessInstance, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetProcessInstance(ctx, id)
}

func (uc *ProcessRuntimeUsecase) ListProcessNodeInstances(ctx context.Context, processInstanceID int) ([]*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || processInstanceID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ListProcessNodeInstances(ctx, processInstanceID)
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
		return nil, err
	}
	if !workflowTaskMatchesProcessNode(existing, instance.ID, node.ID) {
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
	explanation, err := uc.ownerResolver.WorkflowCandidateOwnerRoleKeys(ctx, customerKey, *node.OwnerPoolKey, *node.RequiredCapabilityKey)
	if err != nil {
		return "", err
	}
	if explanation == nil {
		return "", ErrProcessTaskOwnerRoleNotFound
	}
	if explanation.ConfigRevision != "" && instance.ConfigRevision != "" && explanation.ConfigRevision != instance.ConfigRevision {
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
	if task.TaskStatusKey != "done" {
		return nil, ErrBadParam
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
		return nil, ErrProcessNodeInstanceSettled
	}
	if node.Status != ProcessNodeStatusActive {
		return nil, ErrProcessNodeInstanceNotActive
	}
	outcome := normalized.Outcome
	if outcome == "" {
		outcome = workflowTaskPayloadOutcome(task)
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

func (uc *ProcessRuntimeUsecase) ExecuteDomainCommandNode(ctx context.Context, in *ProcessDomainCommandExecution, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProcessDomainCommandExecution(*in)
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
	if node.NodeType != ProcessNodeTypeDomainCommand {
		return nil, ErrBadParam
	}
	if node.Status != ProcessNodeStatusActive {
		return nil, ErrProcessNodeInstanceNotActive
	}
	if node.Version != normalized.ExpectedVersion {
		return nil, ErrProcessNodeInstanceConflict
	}
	nodeCommandKey := processDomainCommandKeyFromNode(node)
	if nodeCommandKey == "" {
		return nil, ErrBadParam
	}
	if normalized.CommandKey != "" && normalized.CommandKey != nodeCommandKey {
		return nil, ErrBadParam
	}
	handler := uc.domainCommandHandlers[nodeCommandKey]
	if handler == nil {
		return nil, ErrProcessDomainCommandHandlerNotFound
	}
	result, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: instance,
		Node:            node,
		CommandKey:      nodeCommandKey,
		IdempotencyKey:  normalized.IdempotencyKey,
		Payload:         normalized.Payload,
	}, actorID)
	if err != nil {
		return nil, err
	}
	outcome := nodeCommandKey
	if result != nil && strings.TrimSpace(result.Outcome) != "" {
		outcome = strings.TrimSpace(result.Outcome)
	}
	if result != nil {
		for _, ref := range result.LinkedBusinessRefs {
			normalizedRef, err := normalizeProcessBusinessRef(ref)
			if err != nil {
				return nil, err
			}
			if _, err := uc.repo.RecordProcessInstanceLinkedBusinessRef(ctx, &ProcessInstanceLinkedBusinessRefRecord{
				ProcessInstanceID: normalized.ProcessInstanceID,
				RefType:           normalizedRef.RefType,
				RefID:             normalizedRef.RefID,
				RefNo:             normalizedRef.RefNo,
				SourceNodeKey:     node.NodeKey,
				SourceCommandKey:  nodeCommandKey,
			}, actorID); err != nil {
				return nil, err
			}
		}
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
	blockedNode, err := uc.repo.BlockProcessNodeInstance(ctx, &ProcessNodeInstanceBlock{
		ProcessInstanceID:     instance.ID,
		ProcessNodeInstanceID: node.ID,
		ExpectedVersion:       node.Version,
		Reason:                "due_at reached",
		Outcome:               outcome,
	}, actorID)
	if err != nil {
		return nil, err
	}
	if _, err := uc.repo.BlockProcessInstance(ctx, &ProcessInstanceBlock{ID: instance.ID}, actorID); err != nil {
		return nil, err
	}
	return blockedNode, nil
}

func (uc *ProcessRuntimeUsecase) blockActiveProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceBlock, actorID int) (*ProcessNodeInstance, error) {
	instance, node, err := uc.getActiveProcessNodeForMutation(ctx, in.ProcessInstanceID, in.ProcessNodeInstanceID, in.ExpectedVersion)
	if err != nil {
		return nil, err
	}
	blockedNode, err := uc.repo.BlockProcessNodeInstance(ctx, &ProcessNodeInstanceBlock{
		ProcessInstanceID:     instance.ID,
		ProcessNodeInstanceID: node.ID,
		ExpectedVersion:       node.Version,
		Reason:                in.Reason,
		Outcome:               in.Outcome,
	}, actorID)
	if err != nil {
		return nil, err
	}
	if _, err := uc.repo.BlockProcessInstance(ctx, &ProcessInstanceBlock{ID: instance.ID}, actorID); err != nil {
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
	default:
		return nil
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
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	handler := uc.branchPolicyHandlers[branchPolicyKey]
	if handler == nil {
		return nil, ErrProcessBranchPolicyHandlerNotFound
	}
	instance, err := uc.repo.GetProcessInstance(ctx, completedNode.ProcessInstanceID)
	if err != nil {
		return nil, err
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
		PolicySnapshot:  completedNode.PolicySnapshot,
	}, actorID)
	if err != nil {
		return nil, err
	}
	nextNodeKey := ""
	if result != nil {
		nextNodeKey = strings.TrimSpace(result.NextNodeKey)
	}
	if nextNodeKey == "" {
		return nil, ErrBadParam
	}
	return uc.activateNamedWaitingNode(ctx, completedNode.ProcessInstanceID, nextNodeKey, actorID)
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
	if targetNode.Status != ProcessNodeStatusWaiting {
		if targetNode.Status == ProcessNodeStatusActive || targetNode.Status == ProcessNodeStatusCompleted {
			return nil, nil
		}
		return nil, ErrProcessNodeInstanceConflict
	}
	return uc.repo.ActivateProcessNodeInstance(ctx, &ProcessNodeInstanceActivate{
		ID:                targetNode.ID,
		ProcessInstanceID: targetNode.ProcessInstanceID,
		ExpectedVersion:   targetNode.Version,
	}, actorID)
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

func normalizeProcessLinkedWorkflowTaskCreate(in ProcessLinkedWorkflowTaskCreate) (ProcessLinkedWorkflowTaskCreate, error) {
	in.TaskCode = strings.TrimSpace(in.TaskCode)
	in.TaskGroup = strings.TrimSpace(in.TaskGroup)
	in.TaskName = strings.TrimSpace(in.TaskName)
	in.TaskStatusKey = strings.TrimSpace(in.TaskStatusKey)
	in.OwnerRoleKey = NormalizeRoleKey(in.OwnerRoleKey)
	if in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 {
		return ProcessLinkedWorkflowTaskCreate{}, ErrBadParam
	}
	if in.TaskStatusKey != "" && !IsValidWorkflowTaskState(in.TaskStatusKey) {
		return ProcessLinkedWorkflowTaskCreate{}, ErrBadParam
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	return in, nil
}

func normalizeProcessDomainCommandExecution(in ProcessDomainCommandExecution) (ProcessDomainCommandExecution, error) {
	in.CommandKey = strings.TrimSpace(in.CommandKey)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	if in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 || in.IdempotencyKey == "" {
		return ProcessDomainCommandExecution{}, ErrBadParam
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	return in, nil
}

func normalizeProcessWaitEventWakeup(in ProcessWaitEventWakeup) (ProcessWaitEventWakeup, error) {
	in.EventKey = strings.TrimSpace(in.EventKey)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.Outcome = strings.TrimSpace(in.Outcome)
	if in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 || in.EventKey == "" || in.IdempotencyKey == "" {
		return ProcessWaitEventWakeup{}, ErrBadParam
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	return in, nil
}

func normalizeProcessBusinessRef(in ProcessBusinessRef) (ProcessBusinessRef, error) {
	in.RefType = strings.TrimSpace(in.RefType)
	if in.RefNo != nil {
		trimmed := strings.TrimSpace(*in.RefNo)
		if trimmed == "" {
			in.RefNo = nil
		} else {
			in.RefNo = &trimmed
		}
	}
	if in.RefType == "" || in.RefID <= 0 {
		return ProcessBusinessRef{}, ErrBadParam
	}
	return in, nil
}

func processPositiveIntFromAny(value any) (int, error) {
	switch typed := value.(type) {
	case int:
		if typed <= 0 {
			return 0, ErrBadParam
		}
		return typed, nil
	case int64:
		if typed <= 0 || typed > int64(maxProcessCommandInt()) {
			return 0, ErrBadParam
		}
		return int(typed), nil
	case float64:
		if typed <= 0 || math.Trunc(typed) != typed || typed > float64(maxProcessCommandInt()) {
			return 0, ErrBadParam
		}
		return int(typed), nil
	default:
		return 0, ErrBadParam
	}
}

func ProcessInstanceHasBusinessRef(instance *ProcessInstance, refType string, refID int) bool {
	refType = strings.TrimSpace(refType)
	if instance == nil || refType == "" || refID <= 0 {
		return false
	}
	if instance.BusinessRefType == refType && instance.BusinessRefID == refID {
		return true
	}
	for _, ref := range ProcessInstanceLinkedBusinessRefs(instance) {
		if ref.RefType == refType && ref.RefID == refID {
			return true
		}
	}
	return false
}

func ProcessInstanceLinkedBusinessRefs(instance *ProcessInstance) []ProcessBusinessRef {
	if instance == nil || instance.ModuleContractSnapshot == nil {
		return []ProcessBusinessRef{}
	}
	rawItems, ok := instance.ModuleContractSnapshot["linked_business_refs"].([]any)
	if !ok {
		return []ProcessBusinessRef{}
	}
	refs := make([]ProcessBusinessRef, 0, len(rawItems))
	for _, raw := range rawItems {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		refID, err := processPositiveIntFromAny(item["ref_id"])
		if err != nil {
			continue
		}
		refType, _ := item["ref_type"].(string)
		refNo, _ := item["ref_no"].(string)
		ref := ProcessBusinessRef{
			RefType: strings.TrimSpace(refType),
			RefID:   refID,
		}
		if strings.TrimSpace(refNo) != "" {
			trimmed := strings.TrimSpace(refNo)
			ref.RefNo = &trimmed
		}
		if normalized, err := normalizeProcessBusinessRef(ref); err == nil {
			refs = append(refs, normalized)
		}
	}
	return refs
}

func ApplyProcessLinkedBusinessRefToSnapshot(snapshot map[string]any, in *ProcessInstanceLinkedBusinessRefRecord) (map[string]any, error) {
	normalized, err := normalizeProcessInstanceLinkedBusinessRefRecord(in)
	if err != nil {
		return nil, err
	}
	out := cloneProcessPolicySnapshot(snapshot)
	rawItems, _ := out["linked_business_refs"].([]any)
	items := make([]any, 0, len(rawItems)+1)
	exists := false
	for _, raw := range rawItems {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		refID, err := processPositiveIntFromAny(item["ref_id"])
		if err != nil {
			continue
		}
		refType, _ := item["ref_type"].(string)
		if strings.TrimSpace(refType) == normalized.RefType && refID == normalized.RefID {
			exists = true
		}
		items = append(items, item)
	}
	if exists {
		out["linked_business_refs"] = items
		return out, nil
	}
	next := map[string]any{
		"ref_type":           normalized.RefType,
		"ref_id":             normalized.RefID,
		"source_node_key":    normalized.SourceNodeKey,
		"source_command_key": normalized.SourceCommandKey,
	}
	if normalized.RefNo != nil {
		next["ref_no"] = *normalized.RefNo
	}
	items = append(items, next)
	out["linked_business_refs"] = items
	return out, nil
}

func normalizeProcessInstanceLinkedBusinessRefRecord(in *ProcessInstanceLinkedBusinessRefRecord) (ProcessInstanceLinkedBusinessRefRecord, error) {
	if in == nil {
		return ProcessInstanceLinkedBusinessRefRecord{}, ErrBadParam
	}
	out := *in
	out.RefType = strings.TrimSpace(out.RefType)
	out.SourceNodeKey = strings.TrimSpace(out.SourceNodeKey)
	out.SourceCommandKey = strings.TrimSpace(out.SourceCommandKey)
	if out.RefNo != nil {
		trimmed := strings.TrimSpace(*out.RefNo)
		if trimmed == "" {
			out.RefNo = nil
		} else {
			out.RefNo = &trimmed
		}
	}
	if out.ProcessInstanceID <= 0 || out.RefType == "" || out.RefID <= 0 || out.SourceNodeKey == "" || out.SourceCommandKey == "" {
		return ProcessInstanceLinkedBusinessRefRecord{}, ErrBadParam
	}
	return out, nil
}

func normalizeProcessNodeInstanceBlock(in ProcessNodeInstanceBlock) (ProcessNodeInstanceBlock, error) {
	in.Reason = strings.TrimSpace(in.Reason)
	in.Outcome = strings.TrimSpace(in.Outcome)
	if in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 || in.Reason == "" {
		return ProcessNodeInstanceBlock{}, ErrBadParam
	}
	if in.Outcome == "" {
		in.Outcome = "blocked"
	}
	return in, nil
}

func normalizeProcessNodeDueAtEscalation(in ProcessNodeDueAtEscalation) (ProcessNodeDueAtEscalation, error) {
	in.Outcome = strings.TrimSpace(in.Outcome)
	if in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 {
		return ProcessNodeDueAtEscalation{}, ErrBadParam
	}
	return in, nil
}

func normalizeProcessLinkedWorkflowTaskCompletion(in ProcessLinkedWorkflowTaskCompletion) (ProcessLinkedWorkflowTaskCompletion, error) {
	in.Outcome = strings.TrimSpace(in.Outcome)
	if in.WorkflowTaskID <= 0 {
		return ProcessLinkedWorkflowTaskCompletion{}, ErrBadParam
	}
	return in, nil
}

func workflowTaskPayloadOutcome(task *WorkflowTask) string {
	if task == nil || task.Payload == nil {
		return ""
	}
	for _, key := range []string{"outcome", "decision", "transition_status"} {
		if value, ok := task.Payload[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func processDomainCommandKeyFromNode(node *ProcessNodeInstance) string {
	if node == nil || node.PolicySnapshot == nil {
		return ""
	}
	if value, ok := node.PolicySnapshot["command_key"].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func processWaitEventKeyFromNode(node *ProcessNodeInstance) string {
	if node == nil || node.PolicySnapshot == nil {
		return ""
	}
	if value, ok := node.PolicySnapshot["event_key"].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func processBranchPolicyKeyFromNode(node *ProcessNodeInstance) string {
	if node == nil || node.PolicySnapshot == nil {
		return ""
	}
	if value, ok := node.PolicySnapshot["branch_policy_key"].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

type processJoinRoute struct {
	NodeKey        string
	Policy         string
	SourceNodeKeys []string
}

type processReturnRoute struct {
	NodeKey     string
	Outcomes    []string
	MaxAttempts int
}

func (route *processReturnRoute) matchesOutcome(outcome *string) bool {
	if route == nil || len(route.Outcomes) == 0 || outcome == nil {
		return false
	}
	normalizedOutcome := strings.ToLower(strings.TrimSpace(*outcome))
	if normalizedOutcome == "" {
		return false
	}
	for _, candidate := range route.Outcomes {
		if normalizedOutcome == strings.ToLower(strings.TrimSpace(candidate)) {
			return true
		}
	}
	return false
}

func processFanOutNodeKeysFromNode(node *ProcessNodeInstance) ([]string, error) {
	if node == nil || node.PolicySnapshot == nil {
		return nil, nil
	}
	value, ok := node.PolicySnapshot["fan_out_node_keys"]
	if !ok {
		return nil, nil
	}
	return normalizeProcessNodeKeyList(value)
}

func processJoinRouteFromNode(node *ProcessNodeInstance) (*processJoinRoute, error) {
	if node == nil || node.PolicySnapshot == nil {
		return nil, nil
	}
	targetValue, ok := node.PolicySnapshot["join_node_key"]
	if !ok {
		return nil, nil
	}
	targetNodeKey, ok := targetValue.(string)
	if !ok {
		return nil, ErrBadParam
	}
	targetNodeKey = strings.TrimSpace(targetNodeKey)
	if targetNodeKey == "" {
		return nil, ErrBadParam
	}
	policy := "all"
	if value, ok := node.PolicySnapshot["join_policy"]; ok {
		policyValue, ok := value.(string)
		if !ok {
			return nil, ErrBadParam
		}
		policy = strings.ToLower(strings.TrimSpace(policyValue))
	}
	if policy != "all" && policy != "any" {
		return nil, ErrBadParam
	}
	sourceValue, ok := node.PolicySnapshot["join_source_node_keys"]
	if !ok {
		return nil, ErrBadParam
	}
	sourceNodeKeys, err := normalizeProcessNodeKeyList(sourceValue)
	if err != nil {
		return nil, err
	}
	return &processJoinRoute{
		NodeKey:        targetNodeKey,
		Policy:         policy,
		SourceNodeKeys: sourceNodeKeys,
	}, nil
}

func processReturnRouteFromNode(node *ProcessNodeInstance) (*processReturnRoute, error) {
	if node == nil || node.PolicySnapshot == nil {
		return nil, nil
	}
	targetValue, ok := node.PolicySnapshot["return_to_node_key"]
	if !ok {
		return nil, nil
	}
	targetNodeKey, ok := targetValue.(string)
	if !ok {
		return nil, ErrBadParam
	}
	targetNodeKey = strings.TrimSpace(targetNodeKey)
	if targetNodeKey == "" {
		return nil, ErrBadParam
	}
	maxAttemptsValue, ok := node.PolicySnapshot["return_max_attempts"]
	if !ok {
		return nil, ErrBadParam
	}
	maxAttempts, err := normalizeProcessPositiveInt(maxAttemptsValue)
	if err != nil {
		return nil, err
	}
	outcomes := []string{"return"}
	if value, ok := node.PolicySnapshot["return_outcomes"]; ok {
		outcomes, err = normalizeProcessStringList(value)
		if err != nil {
			return nil, err
		}
	}
	return &processReturnRoute{
		NodeKey:     targetNodeKey,
		Outcomes:    outcomes,
		MaxAttempts: maxAttempts,
	}, nil
}

func normalizeProcessNodeKeyList(value any) ([]string, error) {
	return normalizeProcessStringList(value)
}

func normalizeProcessStringList(value any) ([]string, error) {
	rawValues, ok := value.([]any)
	if !ok {
		if stringValues, ok := value.([]string); ok {
			rawValues = make([]any, 0, len(stringValues))
			for _, stringValue := range stringValues {
				rawValues = append(rawValues, stringValue)
			}
		} else {
			return nil, ErrBadParam
		}
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(rawValues))
	for _, rawValue := range rawValues {
		nodeKey, ok := rawValue.(string)
		if !ok {
			return nil, ErrBadParam
		}
		nodeKey = strings.TrimSpace(nodeKey)
		if nodeKey == "" || seen[nodeKey] {
			return nil, ErrBadParam
		}
		seen[nodeKey] = true
		out = append(out, nodeKey)
	}
	if len(out) == 0 {
		return nil, ErrBadParam
	}
	return out, nil
}

func normalizeProcessPositiveInt(value any) (int, error) {
	switch typed := value.(type) {
	case int:
		if typed <= 0 {
			return 0, ErrBadParam
		}
		return typed, nil
	case int64:
		if typed <= 0 {
			return 0, ErrBadParam
		}
		return int(typed), nil
	case float64:
		integer := int(typed)
		if typed <= 0 || float64(integer) != typed {
			return 0, ErrBadParam
		}
		return integer, nil
	default:
		return 0, ErrBadParam
	}
}

func cloneProcessPolicySnapshot(in map[string]any) map[string]any {
	if in == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

func collectJoinRouteNodes(nodes []*ProcessNodeInstance, processInstanceID int, route *processJoinRoute) (map[string]string, *ProcessNodeInstance, error) {
	sourceKeySet := map[string]bool{}
	for _, nodeKey := range route.SourceNodeKeys {
		sourceKeySet[nodeKey] = true
	}
	sourceStatuses := map[string]string{}
	var targetNode *ProcessNodeInstance
	for _, node := range nodes {
		if node == nil || node.ProcessInstanceID != processInstanceID {
			continue
		}
		if sourceKeySet[node.NodeKey] {
			if _, exists := sourceStatuses[node.NodeKey]; exists {
				return nil, nil, ErrProcessNodeInstanceConflict
			}
			sourceStatuses[node.NodeKey] = node.Status
		}
		if node.NodeKey == route.NodeKey {
			if targetNode != nil {
				return nil, nil, ErrProcessNodeInstanceConflict
			}
			targetNode = node
		}
	}
	if len(sourceStatuses) != len(sourceKeySet) {
		return nil, nil, ErrProcessNodeInstanceNotFound
	}
	if targetNode == nil {
		return nil, nil, ErrProcessNodeInstanceNotFound
	}
	return sourceStatuses, targetNode, nil
}

func workflowTaskMatchesProcessNode(task *WorkflowTask, processInstanceID int, processNodeInstanceID int) bool {
	return task != nil &&
		task.ProcessInstanceID != nil &&
		*task.ProcessInstanceID == processInstanceID &&
		task.ProcessNodeInstanceID != nil &&
		*task.ProcessNodeInstanceID == processNodeInstanceID
}

func normalizeProcessInstanceCreate(in ProcessInstanceCreate) (ProcessInstanceCreate, error) {
	in.ProcessKey = strings.TrimSpace(in.ProcessKey)
	in.ProcessVersion = strings.TrimSpace(in.ProcessVersion)
	in.ConfigRevision = strings.TrimSpace(in.ConfigRevision)
	in.DefinitionHash = strings.TrimSpace(in.DefinitionHash)
	in.BusinessRefType = strings.TrimSpace(in.BusinessRefType)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.Status = normalizeProcessStatus(in.Status)
	if in.ProcessKey == "" ||
		in.ProcessVersion == "" ||
		in.ConfigRevision == "" ||
		in.DefinitionHash == "" ||
		in.BusinessRefType == "" ||
		in.BusinessRefID <= 0 ||
		in.IdempotencyKey == "" ||
		!isValidProcessStatus(in.Status) {
		return ProcessInstanceCreate{}, ErrBadParam
	}
	if in.ModuleContractSnapshot == nil {
		in.ModuleContractSnapshot = map[string]any{}
	}
	for i := range in.Nodes {
		node, err := normalizeProcessNodeInstanceCreate(in.Nodes[i])
		if err != nil {
			return ProcessInstanceCreate{}, err
		}
		in.Nodes[i] = node
	}
	return in, nil
}

func normalizeProcessNodeInstanceCreate(in ProcessNodeInstanceCreate) (ProcessNodeInstanceCreate, error) {
	in.NodeKey = strings.TrimSpace(in.NodeKey)
	in.NodeType = strings.TrimSpace(in.NodeType)
	in.Status = normalizeProcessNodeStatus(in.Status)
	if in.Attempt <= 0 {
		in.Attempt = 1
	}
	if in.NodeKey == "" ||
		!isValidProcessNodeType(in.NodeType) ||
		!isValidProcessNodeStatus(in.Status) {
		return ProcessNodeInstanceCreate{}, ErrBadParam
	}
	if in.PolicySnapshot == nil {
		in.PolicySnapshot = map[string]any{}
	}
	return in, nil
}

func NormalizeProcessNodeInstanceCreateForRepo(in ProcessNodeInstanceCreate) (ProcessNodeInstanceCreate, error) {
	return normalizeProcessNodeInstanceCreate(in)
}

func normalizeProcessStatus(status string) string {
	status = strings.TrimSpace(status)
	if status == "" {
		return ProcessStatusActive
	}
	return status
}

func isValidProcessStatus(status string) bool {
	switch status {
	case ProcessStatusActive, ProcessStatusCompleted, ProcessStatusCancelled, ProcessStatusBlocked:
		return true
	default:
		return false
	}
}

func normalizeProcessNodeStatus(status string) string {
	status = strings.TrimSpace(status)
	if status == "" {
		return ProcessNodeStatusWaiting
	}
	return status
}

func isValidProcessNodeStatus(status string) bool {
	switch status {
	case ProcessNodeStatusWaiting, ProcessNodeStatusActive, ProcessNodeStatusCompleted, ProcessNodeStatusSkipped, ProcessNodeStatusFailed, ProcessNodeStatusBlocked:
		return true
	default:
		return false
	}
}

func isSettledProcessNodeStatus(status string) bool {
	switch status {
	case ProcessNodeStatusCompleted, ProcessNodeStatusSkipped, ProcessNodeStatusFailed:
		return true
	default:
		return false
	}
}

func isValidProcessNodeType(nodeType string) bool {
	switch nodeType {
	case ProcessNodeTypeHumanTask, ProcessNodeTypeApproval, ProcessNodeTypeDomainCommand, ProcessNodeTypeWaitEvent, ProcessNodeTypeEnd:
		return true
	default:
		return false
	}
}
