package biz

import (
	"context"
	"errors"
	"strings"
	"time"
)

var (
	ErrProcessInstanceNotFound              = errors.New("process instance not found")
	ErrProcessNodeInstanceNotFound          = errors.New("process node instance not found")
	ErrProcessInstanceExists                = errors.New("process instance already exists")
	ErrProcessInstanceSettled               = errors.New("process instance already settled")
	ErrProcessNodeInstanceSettled           = errors.New("process node instance already settled")
	ErrProcessNodeInstanceNotActive         = errors.New("process node instance is not active")
	ErrProcessNodeInstanceConflict          = errors.New("process node instance version conflict")
	ErrProcessTaskOwnerRoleNotFound         = errors.New("process workflow task owner role not found")
	ErrProcessTaskOwnerRoleAmbiguous        = errors.New("process workflow task owner role is ambiguous")
	ErrProcessDomainCommandHandlerNotFound  = errors.New("process domain command handler not found")
	ErrProcessDomainCommandRecoveryRequired = errors.New("process domain command recovery requires explicit review")
	ErrProcessBranchPolicyHandlerNotFound   = errors.New("process branch policy handler not found")
	ErrProcessReturnAttemptLimit            = errors.New("process return attempt limit exceeded")
	ErrProcessNodeDueAtMissing              = errors.New("process node due_at is missing")
	ErrProcessNodeDueAtNotReached           = errors.New("process node due_at is not reached")
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
	ProcessStatusBlocked   = "blocked"

	ProcessNodeStatusWaiting   = "waiting"
	ProcessNodeStatusActive    = "active"
	ProcessNodeStatusCompleted = "completed"
	ProcessNodeStatusBlocked   = "blocked"

	ProcessNodeTypeHumanTask     = "human_task"
	ProcessNodeTypeApproval      = "approval"
	ProcessNodeTypeDomainCommand = "domain_command"
	ProcessNodeTypeWaitEvent     = "wait_event"
	ProcessNodeTypeEnd           = "end"

	ProcessDomainCommandProtocolVersionCurrent = 1

	ProcessDomainCommandResultStateSucceeded = "succeeded"
	ProcessDomainCommandResultStateBlocked   = "blocked"

	ProcessDomainCommandEffectStateUnknown     = "unknown"
	ProcessDomainCommandEffectStateNone        = "none"
	ProcessDomainCommandEffectStateApplied     = "applied"
	ProcessDomainCommandEffectStateCompensated = "compensated"
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
	ID                            int
	ProcessInstanceID             int
	NodeKey                       string
	NodeType                      string
	Attempt                       int
	Status                        string
	OwnerPoolKey                  *string
	RequiredCapabilityKey         *string
	FormProfileKey                *string
	ActionSetKey                  *string
	PolicySnapshot                map[string]any
	DueAt                         *time.Time
	StartedAt                     *time.Time
	CompletedAt                   *time.Time
	Outcome                       *string
	DomainCommandFingerprint      *string
	DomainCommandProtocolVersion  *int
	DomainCommandResultState      *string
	DomainCommandResult           map[string]any
	DomainCommandResultHash       *string
	DomainCommandEffectState      *string
	DomainCommandEffectRefType    *string
	DomainCommandEffectRefID      *int
	DomainCommandResultRecordedAt *time.Time
	DomainCommandResultRecordedBy *int
	DomainCommandCompensation     map[string]any
	DomainCommandCompensationHash *string
	DomainCommandCompensatedAt    *time.Time
	DomainCommandCompensatedBy    *int
	Version                       int
	CreatedAt                     time.Time
	UpdatedAt                     time.Time
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
	ProcessInstanceID        int
	ProcessNodeInstanceID    int
	ExpectedVersion          int
	Reason                   string
	Outcome                  string
	DomainCommandFingerprint *string
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
	Outcome string
	// BlockReason lets a domain gate settle the current node and process as
	// blocked without pretending that the business fact command succeeded.
	BlockReason        string
	LinkedBusinessRefs []ProcessBusinessRef
	// Production handlers must declare applied or none. Unknown remains only as a
	// fail-closed compatibility value for non-production adapters and must never
	// be treated as proof that an effect can be compensated.
	EffectState string
	EffectRef   *ProcessBusinessRef
}

type ProcessNodeDomainCommandResultRecord struct {
	ProcessInstanceID        int
	ProcessNodeInstanceID    int
	ExpectedVersion          int
	DomainCommandFingerprint string
	ProtocolVersion          int
	ResultState              string
	Result                   map[string]any
	ResultHash               string
	EffectState              string
	EffectRefType            *string
	EffectRefID              *int
}

type ProcessNodeDomainCommandCompensationMark struct {
	ProcessInstanceID        int
	ProcessNodeInstanceID    int
	ExpectedVersion          int
	DomainCommandFingerprint string
	ExpectedResultHash       string
	Compensation             map[string]any
	CompensationHash         string
}

type ProcessBranchPolicyInput struct {
	ProcessInstance *ProcessInstance
	CompletedNode   *ProcessNodeInstance
	PolicyKey       string
	Outcome         string
	Reason          string
	PolicySnapshot  map[string]any
}

type ProcessBranchPolicyResult struct {
	NextNodeKey string
}

type ProcessNodeInstanceComplete struct {
	ID                               int
	ProcessInstanceID                int
	ExpectedVersion                  int
	Outcome                          string
	DomainCommandFingerprint         *string
	ExpectedDomainCommandResultHash  *string
	ExpectedDomainCommandEffectState *string
}

type ProcessNodeDomainCommandClaim struct {
	ProcessInstanceID        int
	ProcessNodeInstanceID    int
	ExpectedVersion          int
	DomainCommandFingerprint string
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
	// ClaimProcessNodeDomainCommand binds one immutable command intent to an
	// active node without changing its business version.
	ClaimProcessNodeDomainCommand(ctx context.Context, in *ProcessNodeDomainCommandClaim) (*ProcessNodeInstance, error)
	CompleteProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceComplete, actorID int) (*ProcessNodeInstance, error)
	CompleteProcessInstance(ctx context.Context, in *ProcessInstanceComplete, actorID int) (*ProcessInstance, error)
	RecordProcessInstanceLinkedBusinessRef(ctx context.Context, in *ProcessInstanceLinkedBusinessRefRecord, actorID int) (*ProcessInstance, error)
	BlockProcessNodeAndInstance(ctx context.Context, in *ProcessNodeInstanceBlock, actorID int) (*ProcessNodeInstance, error)
	BlockProcessInstance(ctx context.Context, in *ProcessInstanceBlock, actorID int) (*ProcessInstance, error)
	ActivateProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceActivate, actorID int) (*ProcessNodeInstance, error)
	CreateProcessNodeInstanceAttempt(ctx context.Context, in *ProcessNodeInstanceAttemptCreate, actorID int) (*ProcessNodeInstance, error)
}

// ProcessRuntimeSourceCreateRepo atomically binds a new process instance to an
// authoritative source document. Implementations must lock and re-read the
// source in the same transaction that creates the process, derive BusinessRefNo
// from that row, and reject unsupported source states before any runtime write.
type ProcessRuntimeSourceCreateRepo interface {
	CreateProcessInstanceFromSource(ctx context.Context, in *ProcessInstanceCreate, actorID int) (*ProcessInstance, []*ProcessNodeInstance, error)
}

// ProcessRuntimeDomainCommandResultRepo is intentionally separate from
// ProcessRuntimeRepo while existing non-persistent test adapters migrate. The
// production repository implements it; ProcessRuntime never treats an adapter
// without it as durable result evidence.
type ProcessRuntimeDomainCommandResultRepo interface {
	GetProcessNodeDomainCommandResult(ctx context.Context, processInstanceID int, processNodeInstanceID int, domainCommandFingerprint string) (*ProcessNodeInstance, bool, error)
	RecordProcessNodeDomainCommandResult(ctx context.Context, in *ProcessNodeDomainCommandResultRecord, actorID int) (*ProcessNodeInstance, error)
	MarkProcessNodeDomainCommandCompensated(ctx context.Context, in *ProcessNodeDomainCommandCompensationMark, actorID int) (*ProcessNodeInstance, error)
}

type ProcessRuntimeOwnerRoleResolver interface {
	WorkflowCandidateOwnerRoleKeysAtRevision(ctx context.Context, customerKey, revision, ownerPoolKey string, requiredCapabilities ...string) (*WorkflowTaskCandidateExplanation, error)
}

type ProcessDomainCommandHandler interface {
	// ValidateProcessDomainCommand must be read-only. It rejects malformed or
	// currently invalid intent before the runtime binds the immutable fingerprint.
	ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error
	// Production implementations write their result/effect evidence in the same
	// domain transaction. Exact-intent replay remains required to recover legacy
	// side effects that predate durable result evidence.
	ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error)
}

// ProcessDomainCommandPayloadNormalizer canonicalizes command-specific values
// before the immutable fingerprint is calculated. Implementations must not
// read or write external state.
type ProcessDomainCommandPayloadNormalizer interface {
	NormalizeProcessDomainCommandPayload(payload map[string]any) (map[string]any, error)
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

func (uc *ProcessRuntimeUsecase) CreateProcessInstanceFromSource(ctx context.Context, in *ProcessInstanceCreate, actorID int) (*ProcessInstance, []*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, nil, ErrBadParam
	}
	repo, ok := uc.repo.(ProcessRuntimeSourceCreateRepo)
	if !ok {
		return nil, nil, ErrBadParam
	}
	normalized, err := normalizeProcessInstanceCreate(*in)
	if err != nil {
		return nil, nil, err
	}
	return repo.CreateProcessInstanceFromSource(ctx, &normalized, actorID)
}

func (uc *ProcessRuntimeUsecase) StartProcessInstance(ctx context.Context, in *ProcessInstanceStart, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || in == nil || in.ID <= 0 {
		return nil, ErrBadParam
	}
	instance, err := uc.repo.GetProcessInstance(ctx, in.ID)
	if err != nil {
		return nil, err
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
	if instance.Status == ProcessStatusCompleted {
		if firstNode.NodeType == ProcessNodeTypeEnd && firstNode.Status == ProcessNodeStatusCompleted {
			return firstNode, nil
		}
		return nil, ErrProcessInstanceSettled
	}
	if firstNode.NodeType == ProcessNodeTypeDomainCommand &&
		(firstNode.Status == ProcessNodeStatusCompleted || firstNode.Status == ProcessNodeStatusBlocked) {
		if instance.Status != "" && instance.Status != ProcessStatusActive &&
			(firstNode.Status != ProcessNodeStatusBlocked || instance.Status != ProcessStatusBlocked) {
			return nil, ErrProcessInstanceSettled
		}
		if firstNode.Version <= 1 || firstNode.DomainCommandFingerprint == nil {
			return nil, ErrProcessDomainCommandRecoveryRequired
		}
		return uc.reconcileSettledDomainCommandNode(
			ctx,
			firstNode,
			firstNode.Version-1,
			*firstNode.DomainCommandFingerprint,
			actorID,
		)
	}
	if instance.Status != "" && instance.Status != ProcessStatusActive {
		return nil, ErrProcessInstanceSettled
	}

	switch firstNode.Status {
	case ProcessNodeStatusWaiting:
		activatedNode, err := uc.reconcileProcessNodeActivation(ctx, firstNode, actorID)
		if err != nil {
			return nil, err
		}
		if err := uc.reconcileActivatedSequentialNode(ctx, activatedNode, actorID); err != nil {
			return nil, err
		}
		return activatedNode, nil
	case ProcessNodeStatusActive:
		switch firstNode.NodeType {
		case ProcessNodeTypeHumanTask, ProcessNodeTypeApproval, ProcessNodeTypeEnd:
			if err := uc.reconcileActivatedSequentialNode(ctx, firstNode, actorID); err != nil {
				return nil, err
			}
			return firstNode, nil
		case ProcessNodeTypeDomainCommand, ProcessNodeTypeWaitEvent:
			return firstNode, nil
		default:
			return nil, ErrProcessNodeInstanceConflict
		}
	case ProcessNodeStatusCompleted:
		if firstNode.NodeType != ProcessNodeTypeEnd {
			return nil, ErrProcessNodeInstanceConflict
		}
		if err := uc.ensureProcessInstanceCompleted(ctx, firstNode.ProcessInstanceID, actorID); err != nil {
			return nil, err
		}
		return firstNode, nil
	default:
		return nil, ErrProcessNodeInstanceConflict
	}
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
