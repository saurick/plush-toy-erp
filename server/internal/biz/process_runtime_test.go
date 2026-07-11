package biz

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type memProcessRuntimeRepo struct {
	created              *ProcessInstanceCreate
	process              *ProcessInstance
	node                 *ProcessNodeInstance
	nodes                []*ProcessNodeInstance
	completedNode        *ProcessNodeInstanceComplete
	completedNodes       []*ProcessNodeInstanceComplete
	completedProcess     *ProcessInstanceComplete
	linkedRef            *ProcessInstanceLinkedBusinessRefRecord
	blockedNode          *ProcessNodeInstanceBlock
	blockedProcess       *ProcessInstanceBlock
	activatedNode        *ProcessNodeInstanceActivate
	createdAttempt       *ProcessNodeInstanceAttemptCreate
	claimedDomainCommand *ProcessNodeDomainCommandClaim
	claimCalls           int
	resultRecordCalls    int
	compensationCalls    int
	settleDuringClaim    bool
	completeNodeFailures int
	completeNodeErr      error
}

type stubProcessOwnerRoleResolver struct {
	explanation          *WorkflowTaskCandidateExplanation
	err                  error
	customerKey          string
	ownerPoolKey         string
	requiredCapabilities []string
}

type stubProcessDomainCommandHandler struct {
	input         *ProcessDomainCommandInput
	result        *ProcessDomainCommandResult
	err           error
	validateErr   error
	validateCalls int
	calls         int
}

type stubProcessBranchPolicyHandler struct {
	input  *ProcessBranchPolicyInput
	result *ProcessBranchPolicyResult
	err    error
	calls  int
}

type recordingWorkflowRepo struct {
	stubWorkflowRepo
	createTaskInputs []*WorkflowTaskCreate
}

type retryWorkflowRepo struct {
	stubWorkflowRepo
	remainingFailures int
	failureErr        error
	createCalls       int
	createdByCode     map[string]*WorkflowTask
}

func processTestIntPtr(value int) *int {
	return &value
}

func (s *recordingWorkflowRepo) CreateWorkflowTask(ctx context.Context, in *WorkflowTaskCreate, actorID int) (*WorkflowTask, error) {
	s.createTaskInputs = append(s.createTaskInputs, in)
	return s.stubWorkflowRepo.CreateWorkflowTask(ctx, in, actorID)
}

func (s *retryWorkflowRepo) CreateWorkflowTask(_ context.Context, in *WorkflowTaskCreate, _ int) (*WorkflowTask, error) {
	s.createCalls++
	if s.remainingFailures > 0 {
		s.remainingFailures--
		return nil, s.failureErr
	}
	if s.createdByCode == nil {
		s.createdByCode = map[string]*WorkflowTask{}
	}
	if _, exists := s.createdByCode[in.TaskCode]; exists {
		return nil, ErrWorkflowTaskExists
	}
	created := &WorkflowTask{
		TaskCode:              in.TaskCode,
		TaskStatusKey:         in.TaskStatusKey,
		OwnerRoleKey:          in.OwnerRoleKey,
		OwnerPoolKey:          in.OwnerPoolKey,
		RequiredCapabilityKey: in.RequiredCapabilityKey,
		ConfigRevision:        in.ConfigRevision,
		ProcessInstanceID:     in.ProcessInstanceID,
		ProcessNodeInstanceID: in.ProcessNodeInstanceID,
		Payload:               in.Payload,
	}
	s.createdByCode[in.TaskCode] = created
	return created, nil
}

func (s *retryWorkflowRepo) GetWorkflowTaskByTaskCode(_ context.Context, taskCode string) (*WorkflowTask, error) {
	if task, ok := s.createdByCode[taskCode]; ok {
		return task, nil
	}
	return nil, ErrWorkflowTaskNotFound
}

func (h *stubProcessDomainCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	h.validateCalls++
	h.input = in
	return h.validateErr
}

func (h *stubProcessDomainCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	h.calls++
	h.input = in
	if h.err != nil {
		return nil, h.err
	}
	if h.result != nil {
		return h.result, nil
	}
	return &ProcessDomainCommandResult{Outcome: "executed"}, nil
}

func (h *stubProcessBranchPolicyHandler) ResolveProcessBranch(ctx context.Context, in *ProcessBranchPolicyInput, actorID int) (*ProcessBranchPolicyResult, error) {
	h.calls++
	h.input = in
	if h.err != nil {
		return nil, h.err
	}
	if h.result != nil {
		return h.result, nil
	}
	return &ProcessBranchPolicyResult{NextNodeKey: "engineering_release_approval"}, nil
}

func (r *stubProcessOwnerRoleResolver) WorkflowCandidateOwnerRoleKeys(ctx context.Context, customerKey string, ownerPoolKey string, requiredCapabilities ...string) (*WorkflowTaskCandidateExplanation, error) {
	r.customerKey = customerKey
	r.ownerPoolKey = ownerPoolKey
	r.requiredCapabilities = append([]string{}, requiredCapabilities...)
	if r.err != nil {
		return nil, r.err
	}
	if r.explanation != nil {
		return r.explanation, nil
	}
	return &WorkflowTaskCandidateExplanation{
		ConfigRevision:         "yoyoosun-rev-1",
		OwnerPoolKey:           ownerPoolKey,
		RequiredCapabilities:   requiredCapabilities,
		CandidateOwnerRoleKeys: []string{EngineeringRoleKey},
		Source:                 "active_customer_config",
	}, nil
}

func (r *memProcessRuntimeRepo) CreateProcessInstance(ctx context.Context, in *ProcessInstanceCreate, actorID int) (*ProcessInstance, []*ProcessNodeInstance, error) {
	r.created = in
	return &ProcessInstance{
			ID:             1,
			ProcessKey:     in.ProcessKey,
			ProcessVersion: in.ProcessVersion,
			ConfigRevision: in.ConfigRevision,
			DefinitionHash: in.DefinitionHash,
			BusinessRefID:  in.BusinessRefID,
			Status:         in.Status,
		},
		[]*ProcessNodeInstance{{ID: 1, NodeKey: in.Nodes[0].NodeKey, NodeType: in.Nodes[0].NodeType, Attempt: in.Nodes[0].Attempt, Status: in.Nodes[0].Status}},
		nil
}

func (r *memProcessRuntimeRepo) GetProcessInstance(ctx context.Context, id int) (*ProcessInstance, error) {
	if r.process != nil && r.process.ID == id {
		return r.process, nil
	}
	if id == 1 {
		return &ProcessInstance{ID: id, BusinessRefType: "sales_order", BusinessRefID: 1001, ConfigRevision: "yoyoosun-rev-1"}, nil
	}
	return nil, ErrProcessInstanceNotFound
}

func (r *memProcessRuntimeRepo) GetProcessNodeInstance(ctx context.Context, id int) (*ProcessNodeInstance, error) {
	for _, node := range r.nodes {
		if node != nil && node.ID == id {
			return node, nil
		}
	}
	if r.node != nil && r.node.ID == id {
		return r.node, nil
	}
	if id == 1 {
		return &ProcessNodeInstance{ID: 1, ProcessInstanceID: 1, NodeKey: "prepare_engineering_data", NodeType: ProcessNodeTypeHumanTask, Attempt: 1}, nil
	}
	return nil, ErrProcessNodeInstanceNotFound
}

func (r *memProcessRuntimeRepo) ListProcessNodeInstances(ctx context.Context, processInstanceID int) ([]*ProcessNodeInstance, error) {
	if len(r.nodes) > 0 {
		out := make([]*ProcessNodeInstance, 0, len(r.nodes))
		for _, node := range r.nodes {
			if node != nil && node.ProcessInstanceID == processInstanceID {
				out = append(out, node)
			}
		}
		return out, nil
	}
	if r.node != nil && r.node.ProcessInstanceID == processInstanceID {
		return []*ProcessNodeInstance{r.node}, nil
	}
	if processInstanceID == 1 {
		return []*ProcessNodeInstance{{ID: 1, ProcessInstanceID: processInstanceID}}, nil
	}
	return nil, errors.New("unexpected process")
}

func (r *memProcessRuntimeRepo) ClaimProcessNodeDomainCommand(ctx context.Context, in *ProcessNodeDomainCommandClaim) (*ProcessNodeInstance, error) {
	r.claimedDomainCommand = in
	r.claimCalls++
	claim := func(node *ProcessNodeInstance) (*ProcessNodeInstance, error) {
		if node == nil || node.ID != in.ProcessNodeInstanceID {
			return nil, ErrProcessNodeInstanceNotFound
		}
		if node.ProcessInstanceID != in.ProcessInstanceID || node.Status != ProcessNodeStatusActive || node.Version != in.ExpectedVersion {
			return nil, ErrProcessNodeInstanceConflict
		}
		if node.NodeType != ProcessNodeTypeDomainCommand {
			return nil, ErrBadParam
		}
		if node.DomainCommandFingerprint != nil && (node.DomainCommandProtocolVersion == nil || *node.DomainCommandProtocolVersion != ProcessDomainCommandProtocolVersionCurrent) {
			return nil, ErrProcessDomainCommandRecoveryRequired
		}
		if node.DomainCommandFingerprint != nil && *node.DomainCommandFingerprint != in.DomainCommandFingerprint {
			return nil, ErrIdempotencyConflict
		}
		fingerprint := in.DomainCommandFingerprint
		protocolVersion := ProcessDomainCommandProtocolVersionCurrent
		node.DomainCommandFingerprint = &fingerprint
		node.DomainCommandProtocolVersion = &protocolVersion
		if r.settleDuringClaim {
			out := *node
			out.Status = ProcessNodeStatusCompleted
			out.Version = in.ExpectedVersion + 1
			outcome := "settled_by_concurrent_execution"
			out.Outcome = &outcome
			record, err := processDomainCommandResultRecord(node, processDomainCommandKeyFromNode(node), in.DomainCommandFingerprint, &ProcessDomainCommandResult{Outcome: outcome})
			if err != nil {
				return nil, err
			}
			out.DomainCommandResultState = &record.ResultState
			out.DomainCommandResult = record.Result
			out.DomainCommandResultHash = &record.ResultHash
			out.DomainCommandEffectState = &record.EffectState
			out.DomainCommandEffectRefType = record.EffectRefType
			out.DomainCommandEffectRefID = record.EffectRefID
			now := time.Now()
			out.DomainCommandResultRecordedAt = &now
			if r.node == node {
				r.node = &out
			}
			for index, stored := range r.nodes {
				if stored == node {
					r.nodes[index] = &out
				}
			}
			return &out, nil
		}
		return node, nil
	}
	for _, node := range r.nodes {
		if node != nil && node.ID == in.ProcessNodeInstanceID {
			return claim(node)
		}
	}
	return claim(r.node)
}

func (r *memProcessRuntimeRepo) GetProcessNodeDomainCommandResult(_ context.Context, processInstanceID int, processNodeInstanceID int, fingerprint string) (*ProcessNodeInstance, bool, error) {
	node := r.memProcessNode(processNodeInstanceID)
	if node == nil {
		return nil, false, ErrProcessNodeInstanceNotFound
	}
	if node.ProcessInstanceID != processInstanceID {
		return nil, false, ErrProcessNodeInstanceConflict
	}
	if node.DomainCommandFingerprint == nil {
		return node, false, nil
	}
	if *node.DomainCommandFingerprint != fingerprint {
		return nil, false, ErrIdempotencyConflict
	}
	if node.DomainCommandProtocolVersion == nil || *node.DomainCommandProtocolVersion != ProcessDomainCommandProtocolVersionCurrent {
		return nil, false, ErrProcessDomainCommandRecoveryRequired
	}
	if node.DomainCommandResultHash == nil {
		return node, false, nil
	}
	return node, true, nil
}

func (r *memProcessRuntimeRepo) RecordProcessNodeDomainCommandResult(_ context.Context, in *ProcessNodeDomainCommandResultRecord, actorID int) (*ProcessNodeInstance, error) {
	r.resultRecordCalls++
	node := r.memProcessNode(in.ProcessNodeInstanceID)
	if node == nil {
		return nil, ErrProcessNodeInstanceNotFound
	}
	if node.ProcessInstanceID != in.ProcessInstanceID || node.DomainCommandFingerprint == nil || *node.DomainCommandFingerprint != in.DomainCommandFingerprint {
		return nil, ErrIdempotencyConflict
	}
	if node.DomainCommandResultHash != nil {
		if *node.DomainCommandResultHash != in.ResultHash {
			return nil, ErrIdempotencyConflict
		}
		return node, nil
	}
	state := in.ResultState
	hash := in.ResultHash
	effectState := in.EffectState
	protocolVersion := in.ProtocolVersion
	now := time.Now()
	node.DomainCommandProtocolVersion = &protocolVersion
	node.DomainCommandResultState = &state
	node.DomainCommandResult = in.Result
	node.DomainCommandResultHash = &hash
	node.DomainCommandEffectState = &effectState
	node.DomainCommandEffectRefType = in.EffectRefType
	node.DomainCommandEffectRefID = in.EffectRefID
	node.DomainCommandResultRecordedAt = &now
	if actorID > 0 {
		value := actorID
		node.DomainCommandResultRecordedBy = &value
	}
	return node, nil
}

func (r *memProcessRuntimeRepo) MarkProcessNodeDomainCommandCompensated(_ context.Context, in *ProcessNodeDomainCommandCompensationMark, actorID int) (*ProcessNodeInstance, error) {
	r.compensationCalls++
	node := r.memProcessNode(in.ProcessNodeInstanceID)
	if node == nil {
		return nil, ErrProcessNodeInstanceNotFound
	}
	if node.ProcessInstanceID != in.ProcessInstanceID || node.DomainCommandFingerprint == nil || *node.DomainCommandFingerprint != in.DomainCommandFingerprint ||
		node.DomainCommandResultHash == nil || *node.DomainCommandResultHash != in.ExpectedResultHash {
		return nil, ErrIdempotencyConflict
	}
	if node.DomainCommandCompensationHash != nil {
		if *node.DomainCommandCompensationHash != in.CompensationHash {
			return nil, ErrIdempotencyConflict
		}
		return node, nil
	}
	effectState := ProcessDomainCommandEffectStateCompensated
	hash := in.CompensationHash
	now := time.Now()
	node.DomainCommandEffectState = &effectState
	node.DomainCommandCompensation = in.Compensation
	node.DomainCommandCompensationHash = &hash
	node.DomainCommandCompensatedAt = &now
	if actorID > 0 {
		value := actorID
		node.DomainCommandCompensatedBy = &value
	}
	return node, nil
}

func (r *memProcessRuntimeRepo) memProcessNode(id int) *ProcessNodeInstance {
	for _, node := range r.nodes {
		if node != nil && node.ID == id {
			return node
		}
	}
	if r.node != nil && r.node.ID == id {
		return r.node
	}
	return nil
}

func (r *memProcessRuntimeRepo) CompleteProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceComplete, actorID int) (*ProcessNodeInstance, error) {
	r.completedNode = in
	r.completedNodes = append(r.completedNodes, in)
	if r.completeNodeFailures > 0 {
		r.completeNodeFailures--
		return nil, r.completeNodeErr
	}
	for index, node := range r.nodes {
		if node == nil || node.ID != in.ID {
			continue
		}
		if node.Version != in.ExpectedVersion {
			return nil, ErrProcessNodeInstanceConflict
		}
		if in.DomainCommandFingerprint != nil && (node.DomainCommandFingerprint == nil || *node.DomainCommandFingerprint != *in.DomainCommandFingerprint) {
			return nil, ErrIdempotencyConflict
		}
		out := *node
		out.Status = ProcessNodeStatusCompleted
		out.Outcome = &in.Outcome
		out.DomainCommandFingerprint = in.DomainCommandFingerprint
		out.Version = in.ExpectedVersion + 1
		r.nodes[index] = &out
		return &out, nil
	}
	if r.node == nil || r.node.ID != in.ID {
		return nil, ErrProcessNodeInstanceNotFound
	}
	if r.node.Version != in.ExpectedVersion {
		return nil, ErrProcessNodeInstanceConflict
	}
	if in.DomainCommandFingerprint != nil && (r.node.DomainCommandFingerprint == nil || *r.node.DomainCommandFingerprint != *in.DomainCommandFingerprint) {
		return nil, ErrIdempotencyConflict
	}
	out := *r.node
	out.Status = ProcessNodeStatusCompleted
	out.Outcome = &in.Outcome
	out.DomainCommandFingerprint = in.DomainCommandFingerprint
	out.Version = in.ExpectedVersion + 1
	r.node = &out
	return &out, nil
}

func (r *memProcessRuntimeRepo) CompleteProcessInstance(ctx context.Context, in *ProcessInstanceComplete, actorID int) (*ProcessInstance, error) {
	r.completedProcess = in
	if in == nil || in.ID <= 0 {
		return nil, ErrBadParam
	}
	if r.process != nil && r.process.ID == in.ID {
		if r.process.Status != "" && r.process.Status != ProcessStatusActive {
			return nil, ErrProcessInstanceSettled
		}
		out := *r.process
		now := time.Now()
		out.Status = ProcessStatusCompleted
		out.CompletedAt = &now
		r.process = &out
		return &out, nil
	}
	if in.ID == 1 {
		now := time.Now()
		return &ProcessInstance{ID: in.ID, Status: ProcessStatusCompleted, CompletedAt: &now}, nil
	}
	return nil, ErrProcessInstanceNotFound
}

func (r *memProcessRuntimeRepo) RecordProcessInstanceLinkedBusinessRef(ctx context.Context, in *ProcessInstanceLinkedBusinessRefRecord, actorID int) (*ProcessInstance, error) {
	r.linkedRef = in
	if in == nil || in.ProcessInstanceID <= 0 {
		return nil, ErrBadParam
	}
	if r.process != nil && r.process.ID == in.ProcessInstanceID {
		snapshot, err := ApplyProcessLinkedBusinessRefToSnapshot(r.process.ModuleContractSnapshot, in)
		if err != nil {
			return nil, err
		}
		out := *r.process
		out.ModuleContractSnapshot = snapshot
		r.process = &out
		return &out, nil
	}
	if in.ProcessInstanceID == 1 {
		return &ProcessInstance{ID: in.ProcessInstanceID}, nil
	}
	return nil, ErrProcessInstanceNotFound
}

func (r *memProcessRuntimeRepo) BlockProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceBlock, actorID int) (*ProcessNodeInstance, error) {
	r.blockedNode = in
	for index, node := range r.nodes {
		if node == nil || node.ID != in.ProcessNodeInstanceID {
			continue
		}
		if node.Status != ProcessNodeStatusActive || node.Version != in.ExpectedVersion {
			return nil, ErrProcessNodeInstanceConflict
		}
		if in.DomainCommandFingerprint != nil && (node.DomainCommandFingerprint == nil || *node.DomainCommandFingerprint != *in.DomainCommandFingerprint) {
			return nil, ErrIdempotencyConflict
		}
		out := *node
		out.Status = ProcessNodeStatusBlocked
		out.Outcome = &in.Outcome
		out.DomainCommandFingerprint = in.DomainCommandFingerprint
		out.Version = in.ExpectedVersion + 1
		r.nodes[index] = &out
		return &out, nil
	}
	if r.node == nil || r.node.ID != in.ProcessNodeInstanceID {
		return nil, ErrProcessNodeInstanceNotFound
	}
	if r.node.Status != ProcessNodeStatusActive || r.node.Version != in.ExpectedVersion {
		return nil, ErrProcessNodeInstanceConflict
	}
	if in.DomainCommandFingerprint != nil && (r.node.DomainCommandFingerprint == nil || *r.node.DomainCommandFingerprint != *in.DomainCommandFingerprint) {
		return nil, ErrIdempotencyConflict
	}
	out := *r.node
	out.Status = ProcessNodeStatusBlocked
	out.Outcome = &in.Outcome
	out.DomainCommandFingerprint = in.DomainCommandFingerprint
	out.Version = in.ExpectedVersion + 1
	r.node = &out
	return &out, nil
}

func (r *memProcessRuntimeRepo) BlockProcessInstance(ctx context.Context, in *ProcessInstanceBlock, actorID int) (*ProcessInstance, error) {
	r.blockedProcess = in
	if in == nil || in.ID <= 0 {
		return nil, ErrBadParam
	}
	if r.process != nil && r.process.ID == in.ID {
		if r.process.Status != "" && r.process.Status != ProcessStatusActive {
			return nil, ErrProcessInstanceSettled
		}
		out := *r.process
		out.Status = ProcessStatusBlocked
		r.process = &out
		return &out, nil
	}
	if in.ID == 1 {
		return &ProcessInstance{ID: in.ID, Status: ProcessStatusBlocked}, nil
	}
	return nil, ErrProcessInstanceNotFound
}

func (r *memProcessRuntimeRepo) ActivateProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceActivate, actorID int) (*ProcessNodeInstance, error) {
	r.activatedNode = in
	for index, node := range r.nodes {
		if node == nil || node.ID != in.ID {
			continue
		}
		if node.Status != ProcessNodeStatusWaiting || node.Version != in.ExpectedVersion {
			return nil, ErrProcessNodeInstanceConflict
		}
		out := *node
		out.Status = ProcessNodeStatusActive
		out.Version = in.ExpectedVersion + 1
		r.nodes[index] = &out
		return &out, nil
	}
	return nil, ErrProcessNodeInstanceNotFound
}

func (r *memProcessRuntimeRepo) CreateProcessNodeInstanceAttempt(ctx context.Context, in *ProcessNodeInstanceAttemptCreate, actorID int) (*ProcessNodeInstance, error) {
	r.createdAttempt = in
	if in == nil || in.ProcessInstanceID <= 0 || in.NodeKey == "" || in.NodeType == "" || in.Attempt <= 0 {
		return nil, ErrBadParam
	}
	for _, node := range r.nodes {
		if node == nil || node.ProcessInstanceID != in.ProcessInstanceID {
			continue
		}
		if node.NodeKey == in.NodeKey && node.Attempt == in.Attempt {
			return nil, ErrProcessInstanceExists
		}
	}
	nextID := len(r.nodes) + 1
	for _, node := range r.nodes {
		if node != nil && node.ID >= nextID {
			nextID = node.ID + 1
		}
	}
	node := &ProcessNodeInstance{
		ID:                    nextID,
		ProcessInstanceID:     in.ProcessInstanceID,
		NodeKey:               in.NodeKey,
		NodeType:              in.NodeType,
		Attempt:               in.Attempt,
		Status:                ProcessNodeStatusWaiting,
		OwnerPoolKey:          in.OwnerPoolKey,
		RequiredCapabilityKey: in.RequiredCapabilityKey,
		FormProfileKey:        in.FormProfileKey,
		ActionSetKey:          in.ActionSetKey,
		PolicySnapshot:        in.PolicySnapshot,
		DueAt:                 in.DueAt,
		Version:               1,
	}
	r.nodes = append(r.nodes, node)
	return node, nil
}

func TestProcessRuntimeUsecaseCreateNormalizesDefaults(t *testing.T) {
	repo := &memProcessRuntimeRepo{}
	uc := NewProcessRuntimeUsecase(repo, &stubWorkflowRepo{})
	ownerPoolKey := "engineering_data"
	requiredCapabilityKey := "workflow.task.complete"

	instance, nodes, err := uc.CreateProcessInstance(context.Background(), &ProcessInstanceCreate{
		ProcessKey:      "engineering_release",
		ProcessVersion:  "v1",
		ConfigRevision:  "yoyoosun-rev-1",
		DefinitionHash:  "sha256:definition",
		BusinessRefType: "sales_order",
		BusinessRefID:   1001,
		IdempotencyKey:  "sales_order:1001:engineering_release:v1",
		Nodes: []ProcessNodeInstanceCreate{
			{
				NodeKey:               "prepare_engineering_data",
				NodeType:              ProcessNodeTypeHumanTask,
				OwnerPoolKey:          &ownerPoolKey,
				RequiredCapabilityKey: &requiredCapabilityKey,
			},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create process failed: %v", err)
	}
	if instance.Status != ProcessStatusActive {
		t.Fatalf("expected active process, got %q", instance.Status)
	}
	if len(nodes) != 1 || nodes[0].Status != ProcessNodeStatusWaiting || nodes[0].Attempt != 1 {
		t.Fatalf("expected normalized node defaults, got %#v", nodes)
	}
	if repo.created.ModuleContractSnapshot == nil || repo.created.Nodes[0].PolicySnapshot == nil {
		t.Fatalf("expected empty JSON snapshots normalized")
	}
}

func TestProcessRuntimeUsecaseRejectsInvalidNodeType(t *testing.T) {
	uc := NewProcessRuntimeUsecase(&memProcessRuntimeRepo{}, &stubWorkflowRepo{})
	_, _, err := uc.CreateProcessInstance(context.Background(), &ProcessInstanceCreate{
		ProcessKey:      "engineering_release",
		ProcessVersion:  "v1",
		ConfigRevision:  "yoyoosun-rev-1",
		DefinitionHash:  "sha256:definition",
		BusinessRefType: "sales_order",
		BusinessRefID:   1001,
		IdempotencyKey:  "sales_order:1001:engineering_release:v1",
		Nodes: []ProcessNodeInstanceCreate{
			{NodeKey: "bad", NodeType: "script"},
		},
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
}

func TestProcessRuntimeUsecaseStartProcessInstanceActivatesFirstWaitingApprovalNode(t *testing.T) {
	ownerPoolKey := "engineering_data"
	requiredCapabilityKey := PermissionWorkflowTaskComplete
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			Status:          ProcessStatusActive,
			ConfigRevision:  "yoyoosun-rev-1",
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                    20,
				ProcessInstanceID:     10,
				NodeKey:               "prepare_engineering_data",
				NodeType:              ProcessNodeTypeApproval,
				Attempt:               1,
				Status:                ProcessNodeStatusWaiting,
				Version:               3,
				OwnerPoolKey:          &ownerPoolKey,
				RequiredCapabilityKey: &requiredCapabilityKey,
			},
			{
				ID:                21,
				ProcessInstanceID: 10,
				NodeKey:           "engineering_release_end",
				NodeType:          ProcessNodeTypeEnd,
				Attempt:           1,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{})

	activatedNode, err := uc.StartProcessInstance(context.Background(), &ProcessInstanceStart{
		ID: 10,
	}, 7)
	if err != nil {
		t.Fatalf("expected first node activation, got %v", err)
	}
	if activatedNode.ID != 20 || activatedNode.Status != ProcessNodeStatusActive {
		t.Fatalf("unexpected activated node %#v", activatedNode)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != 20 || processRepo.activatedNode.ExpectedVersion != 3 {
		t.Fatalf("expected first waiting node activation, got %#v", processRepo.activatedNode)
	}
	if workflowRepo.createTaskInput == nil {
		t.Fatalf("expected linked workflow task for first approval node")
	}
	if workflowRepo.createTaskInput.ProcessNodeInstanceID == nil || *workflowRepo.createTaskInput.ProcessNodeInstanceID != 20 {
		t.Fatalf("expected process node link on first task, got %#v", workflowRepo.createTaskInput.ProcessNodeInstanceID)
	}
	if workflowRepo.createTaskInput.OwnerRoleKey != EngineeringRoleKey {
		t.Fatalf("expected owner role resolved from active config, got %q", workflowRepo.createTaskInput.OwnerRoleKey)
	}
}

func TestProcessRuntimeUsecaseStartProcessInstanceReturnsActiveFirstNode(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			Status:          ProcessStatusActive,
			ConfigRevision:  "yoyoosun-rev-1",
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                20,
				ProcessInstanceID: 10,
				NodeKey:           "submit_sales_order",
				NodeType:          ProcessNodeTypeDomainCommand,
				Attempt:           1,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot:    map[string]any{"command_key": ProcessDomainCommandSalesOrderSubmit},
			},
			{
				ID:                21,
				ProcessInstanceID: 10,
				NodeKey:           "boss_approval",
				NodeType:          ProcessNodeTypeApproval,
				Attempt:           1,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{})

	startedNode, err := uc.StartProcessInstance(context.Background(), &ProcessInstanceStart{ID: 10}, 7)
	if err != nil {
		t.Fatalf("expected active first node to be returned, got %v", err)
	}
	if startedNode.ID != 20 || startedNode.Status != ProcessNodeStatusActive {
		t.Fatalf("unexpected started node %#v", startedNode)
	}
	if processRepo.activatedNode != nil {
		t.Fatalf("active first node should not be activated again, got %#v", processRepo.activatedNode)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatalf("active first node should not create duplicate linked workflow task")
	}
}

func TestProcessRuntimeUsecaseStartProcessInstanceDoesNotCreateTaskForDomainCommand(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			Status:          ProcessStatusActive,
			ConfigRevision:  "yoyoosun-rev-1",
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                20,
				ProcessInstanceID: 10,
				NodeKey:           "publish_engineering_data",
				NodeType:          ProcessNodeTypeDomainCommand,
				Attempt:           1,
				Status:            ProcessNodeStatusWaiting,
				Version:           3,
				PolicySnapshot:    map[string]any{"command_key": "engineering_package.publish"},
			},
			{
				ID:                21,
				ProcessInstanceID: 10,
				NodeKey:           "engineering_release_end",
				NodeType:          ProcessNodeTypeEnd,
				Attempt:           1,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	activatedNode, err := uc.StartProcessInstance(context.Background(), &ProcessInstanceStart{
		ID: 10,
	}, 7)
	if err != nil {
		t.Fatalf("expected first domain command activation, got %v", err)
	}
	if activatedNode.ID != 20 || activatedNode.Status != ProcessNodeStatusActive {
		t.Fatalf("unexpected activated node %#v", activatedNode)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatalf("domain command start must not create workflow task")
	}
	if processRepo.completedNode != nil || processRepo.completedProcess != nil {
		t.Fatalf("domain command start must not complete node or process")
	}
}

func TestProcessRuntimeUsecaseStartProcessInstanceRejectsSettledProcess(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:     10,
			Status: ProcessStatusCompleted,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                20,
				ProcessInstanceID: 10,
				NodeKey:           "prepare_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})

	_, err := uc.StartProcessInstance(context.Background(), &ProcessInstanceStart{
		ID: 10,
	}, 7)
	if !errors.Is(err, ErrProcessInstanceSettled) {
		t.Fatalf("expected settled process rejection, got %v", err)
	}
	if processRepo.activatedNode != nil {
		t.Fatalf("settled process must not activate node")
	}
}

func TestProcessRuntimeUsecaseStartProcessInstanceRejectsBlockedFirstNode(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:     10,
			Status: ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                20,
				ProcessInstanceID: 10,
				NodeKey:           "prepare_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusBlocked,
				Version:           1,
			},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})

	_, err := uc.StartProcessInstance(context.Background(), &ProcessInstanceStart{
		ID: 10,
	}, 7)
	if !errors.Is(err, ErrProcessNodeInstanceConflict) {
		t.Fatalf("expected blocked first node conflict, got %v", err)
	}
	if processRepo.activatedNode != nil {
		t.Fatalf("blocked first node must not be re-activated")
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskFromHumanNode(t *testing.T) {
	ownerPoolKey := "engineering_data"
	requiredCapabilityKey := PermissionWorkflowTaskComplete
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			ProcessKey:      "engineering_release",
			ProcessVersion:  "v1",
			ConfigRevision:  "yoyoosun-rev-1",
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
		},
		node: &ProcessNodeInstance{
			ID:                    20,
			ProcessInstanceID:     10,
			NodeKey:               "prepare_engineering_data",
			NodeType:              ProcessNodeTypeHumanTask,
			Attempt:               2,
			Status:                ProcessNodeStatusActive,
			Version:               4,
			OwnerPoolKey:          &ownerPoolKey,
			RequiredCapabilityKey: &requiredCapabilityKey,
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	task, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       4,
		TaskName:              "准备工程资料",
		OwnerRoleKey:          EngineeringRoleKey,
	}, 7)
	if err != nil {
		t.Fatalf("expected linked workflow task, got %v", err)
	}
	if task.TaskCode != "PROC-10-NODE-20-A2" {
		t.Fatalf("expected generated task code, got %q", task.TaskCode)
	}
	if workflowRepo.createTaskInput == nil {
		t.Fatalf("expected workflow task create input")
	}
	if workflowRepo.createTaskInput.SourceType != "sales_order" || workflowRepo.createTaskInput.SourceID != 1001 {
		t.Fatalf("expected process business ref copied, got %#v", workflowRepo.createTaskInput)
	}
	if workflowRepo.createTaskInput.ProcessInstanceID == nil || *workflowRepo.createTaskInput.ProcessInstanceID != 10 {
		t.Fatalf("expected process instance link, got %#v", workflowRepo.createTaskInput.ProcessInstanceID)
	}
	if workflowRepo.createTaskInput.ProcessNodeInstanceID == nil || *workflowRepo.createTaskInput.ProcessNodeInstanceID != 20 {
		t.Fatalf("expected process node link, got %#v", workflowRepo.createTaskInput.ProcessNodeInstanceID)
	}
	if workflowRepo.createTaskInput.OwnerPoolKey == nil || *workflowRepo.createTaskInput.OwnerPoolKey != ownerPoolKey {
		t.Fatalf("expected node owner pool copied, got %#v", workflowRepo.createTaskInput.OwnerPoolKey)
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskResolvesOwnerRoleFromCandidate(t *testing.T) {
	ownerPoolKey := "engineering_data"
	requiredCapabilityKey := PermissionWorkflowTaskComplete
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			ConfigRevision:  "yoyoosun-rev-1",
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
		},
		node: &ProcessNodeInstance{
			ID:                    20,
			ProcessInstanceID:     10,
			NodeKey:               "prepare_engineering_data",
			NodeType:              ProcessNodeTypeHumanTask,
			Attempt:               1,
			Status:                ProcessNodeStatusActive,
			Version:               2,
			OwnerPoolKey:          &ownerPoolKey,
			RequiredCapabilityKey: &requiredCapabilityKey,
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{})

	_, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       2,
	}, 7)
	if err != nil {
		t.Fatalf("expected owner role resolved from customer config candidate, got %v", err)
	}
	if workflowRepo.createTaskInput == nil || workflowRepo.createTaskInput.OwnerRoleKey != EngineeringRoleKey {
		t.Fatalf("expected resolved owner role on task create, got %#v", workflowRepo.createTaskInput)
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskUsesInstanceCustomerKeyForOwnerResolution(t *testing.T) {
	ownerPoolKey := "warehouse_execution"
	requiredCapabilityKey := PermissionWorkflowTaskComplete
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:             10,
			ConfigRevision: "customer-a-rev-1",
			ModuleContractSnapshot: map[string]any{
				"customer_key": " customer-a ",
			},
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
		},
		node: &ProcessNodeInstance{
			ID:                    20,
			ProcessInstanceID:     10,
			NodeKey:               "warehouse_release",
			NodeType:              ProcessNodeTypeHumanTask,
			Status:                ProcessNodeStatusActive,
			Version:               2,
			OwnerPoolKey:          &ownerPoolKey,
			RequiredCapabilityKey: &requiredCapabilityKey,
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	resolver := &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "customer-a-rev-1",
			CandidateOwnerRoleKeys: []string{WarehouseRoleKey},
			Source:                 "active_customer_config",
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, resolver)

	_, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       2,
	}, 7)
	if err != nil {
		t.Fatalf("expected owner role resolved from instance customer config, got %v", err)
	}
	if resolver.customerKey != "customer-a" {
		t.Fatalf("expected resolver customer key from process snapshot, got %q", resolver.customerKey)
	}
	if resolver.ownerPoolKey != ownerPoolKey {
		t.Fatalf("expected resolver owner pool %q, got %q", ownerPoolKey, resolver.ownerPoolKey)
	}
	if len(resolver.requiredCapabilities) != 1 || resolver.requiredCapabilities[0] != requiredCapabilityKey {
		t.Fatalf("expected resolver capability %q, got %#v", requiredCapabilityKey, resolver.requiredCapabilities)
	}
	if workflowRepo.createTaskInput == nil || workflowRepo.createTaskInput.OwnerRoleKey != WarehouseRoleKey {
		t.Fatalf("expected resolved warehouse owner role, got %#v", workflowRepo.createTaskInput)
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsMissingOwnerResolver(t *testing.T) {
	ownerPoolKey := "engineering_data"
	requiredCapabilityKey := PermissionWorkflowTaskComplete
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, ConfigRevision: "yoyoosun-rev-1", BusinessRefType: "sales_order", BusinessRefID: 1001},
		node: &ProcessNodeInstance{
			ID:                    20,
			ProcessInstanceID:     10,
			NodeKey:               "prepare_engineering_data",
			NodeType:              ProcessNodeTypeHumanTask,
			Status:                ProcessNodeStatusActive,
			Version:               2,
			OwnerPoolKey:          &ownerPoolKey,
			RequiredCapabilityKey: &requiredCapabilityKey,
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       2,
	}, 7)
	if !errors.Is(err, ErrProcessTaskOwnerRoleNotFound) {
		t.Fatalf("expected missing owner resolver error, got %v", err)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatalf("missing owner resolver must not create workflow task")
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsAmbiguousOwnerCandidates(t *testing.T) {
	ownerPoolKey := "shared_execution"
	requiredCapabilityKey := PermissionWorkflowTaskComplete
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, ConfigRevision: "yoyoosun-rev-1", BusinessRefType: "sales_order", BusinessRefID: 1001},
		node: &ProcessNodeInstance{
			ID:                    20,
			ProcessInstanceID:     10,
			NodeKey:               "shared_execution",
			NodeType:              ProcessNodeTypeHumanTask,
			Status:                ProcessNodeStatusActive,
			Version:               2,
			OwnerPoolKey:          &ownerPoolKey,
			RequiredCapabilityKey: &requiredCapabilityKey,
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	resolver := &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "yoyoosun-rev-1",
			CandidateOwnerRoleKeys: []string{WarehouseRoleKey, EngineeringRoleKey},
			Source:                 "active_customer_config",
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, resolver)

	_, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       2,
	}, 7)
	if !errors.Is(err, ErrProcessTaskOwnerRoleAmbiguous) {
		t.Fatalf("expected ambiguous owner candidates error, got %v", err)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatalf("ambiguous candidates must not create workflow task")
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsConfigRevisionMismatch(t *testing.T) {
	ownerPoolKey := "engineering_data"
	requiredCapabilityKey := PermissionWorkflowTaskComplete
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, ConfigRevision: "yoyoosun-rev-1", BusinessRefType: "sales_order", BusinessRefID: 1001},
		node: &ProcessNodeInstance{
			ID:                    20,
			ProcessInstanceID:     10,
			NodeKey:               "prepare_engineering_data",
			NodeType:              ProcessNodeTypeHumanTask,
			Status:                ProcessNodeStatusActive,
			Version:               2,
			OwnerPoolKey:          &ownerPoolKey,
			RequiredCapabilityKey: &requiredCapabilityKey,
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	resolver := &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "other-rev",
			CandidateOwnerRoleKeys: []string{EngineeringRoleKey},
			Source:                 "active_customer_config",
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, resolver)

	_, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       2,
	}, 7)
	if !errors.Is(err, ErrProcessTaskOwnerRoleNotFound) {
		t.Fatalf("expected config revision mismatch to reject owner role, got %v", err)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatalf("config revision mismatch must not create workflow task")
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsInactiveNode(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, ConfigRevision: "yoyoosun-rev-1", BusinessRefType: "sales_order", BusinessRefID: 1001},
		node: &ProcessNodeInstance{
			ID:                20,
			ProcessInstanceID: 10,
			NodeKey:           "prepare_engineering_data",
			NodeType:          ProcessNodeTypeHumanTask,
			Attempt:           1,
			Status:            ProcessNodeStatusWaiting,
			Version:           2,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})

	_, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       2,
		OwnerRoleKey:          EngineeringRoleKey,
	}, 7)
	if !errors.Is(err, ErrProcessNodeInstanceNotActive) {
		t.Fatalf("expected inactive node error, got %v", err)
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsStaleNodeVersion(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, ConfigRevision: "yoyoosun-rev-1", BusinessRefType: "sales_order", BusinessRefID: 1001},
		node: &ProcessNodeInstance{
			ID:                20,
			ProcessInstanceID: 10,
			NodeKey:           "prepare_engineering_data",
			NodeType:          ProcessNodeTypeHumanTask,
			Attempt:           1,
			Status:            ProcessNodeStatusActive,
			Version:           3,
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       2,
		OwnerRoleKey:          EngineeringRoleKey,
	}, 7)
	if !errors.Is(err, ErrProcessNodeInstanceConflict) {
		t.Fatalf("expected stale node version conflict, got %v", err)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatalf("stale node version must not create workflow task")
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskReturnsExistingOnRetry(t *testing.T) {
	processInstanceID := 10
	processNodeInstanceID := 20
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: processInstanceID, ConfigRevision: "yoyoosun-rev-1", BusinessRefType: "sales_order", BusinessRefID: 1001},
		node: &ProcessNodeInstance{
			ID:                processNodeInstanceID,
			ProcessInstanceID: processInstanceID,
			NodeKey:           "prepare_engineering_data",
			NodeType:          ProcessNodeTypeHumanTask,
			Attempt:           1,
			Status:            ProcessNodeStatusActive,
			Version:           3,
		},
	}
	workflowRepo := &stubWorkflowRepo{
		createTaskErr: ErrWorkflowTaskExists,
		taskByCode: &WorkflowTask{
			ID:                    88,
			TaskCode:              "PROC-10-NODE-20-A1",
			TaskStatusKey:         "ready",
			OwnerRoleKey:          EngineeringRoleKey,
			ProcessInstanceID:     &processInstanceID,
			ProcessNodeInstanceID: &processNodeInstanceID,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	task, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       3,
		OwnerRoleKey:          EngineeringRoleKey,
	}, 7)
	if err != nil {
		t.Fatalf("expected existing linked workflow task on retry, got %v", err)
	}
	if task.ID != 88 || task.TaskCode != "PROC-10-NODE-20-A1" {
		t.Fatalf("expected existing task returned, got %#v", task)
	}
	if !workflowRepo.getByCodeCalled {
		t.Fatalf("expected retry path to read existing task by task_code")
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsTaskCodeCollision(t *testing.T) {
	processInstanceID := 10
	processNodeInstanceID := 20
	otherProcessInstanceID := 11
	otherProcessNodeInstanceID := 21
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: processInstanceID, ConfigRevision: "yoyoosun-rev-1", BusinessRefType: "sales_order", BusinessRefID: 1001},
		node: &ProcessNodeInstance{
			ID:                processNodeInstanceID,
			ProcessInstanceID: processInstanceID,
			NodeKey:           "prepare_engineering_data",
			NodeType:          ProcessNodeTypeHumanTask,
			Attempt:           1,
			Status:            ProcessNodeStatusActive,
			Version:           3,
		},
	}
	workflowRepo := &stubWorkflowRepo{
		createTaskErr: ErrWorkflowTaskExists,
		taskByCode: &WorkflowTask{
			ID:                    88,
			TaskCode:              "PROC-10-NODE-20-A1",
			TaskStatusKey:         "ready",
			OwnerRoleKey:          EngineeringRoleKey,
			ProcessInstanceID:     &otherProcessInstanceID,
			ProcessNodeInstanceID: &otherProcessNodeInstanceID,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       3,
		OwnerRoleKey:          EngineeringRoleKey,
	}, 7)
	if !errors.Is(err, ErrWorkflowTaskExists) {
		t.Fatalf("expected task_code collision, got %v", err)
	}
	if !workflowRepo.getByCodeCalled {
		t.Fatalf("expected collision path to read existing task by task_code")
	}
}

func TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsDomainCommandNode(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, ConfigRevision: "yoyoosun-rev-1", BusinessRefType: "sales_order", BusinessRefID: 1001},
		node:    &ProcessNodeInstance{ID: 20, ProcessInstanceID: 10, NodeKey: "post_inventory", NodeType: ProcessNodeTypeDomainCommand, Attempt: 1, Status: ProcessNodeStatusActive, Version: 1},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})

	_, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       1,
		OwnerRoleKey:          WarehouseRoleKey,
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected bad param for domain command node, got %v", err)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskCompletesNode(t *testing.T) {
	processID := 10
	nodeID := 20
	processRepo := &memProcessRuntimeRepo{
		node: &ProcessNodeInstance{
			ID:                nodeID,
			ProcessInstanceID: processID,
			NodeKey:           "prepare_engineering_data",
			NodeType:          ProcessNodeTypeHumanTask,
			Status:            ProcessNodeStatusActive,
			Version:           3,
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
			Payload: map[string]any{
				"outcome": "CONFIRMED",
			},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	node, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected linked workflow task completion, got %v", err)
	}
	if node.Status != ProcessNodeStatusCompleted || node.Outcome == nil || *node.Outcome != "CONFIRMED" {
		t.Fatalf("expected completed node with outcome, got %#v", node)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.ExpectedVersion != 3 {
		t.Fatalf("expected optimistic version passed to repo, got %#v", processRepo.completedNode)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectedBlocksProcessWithoutRoute(t *testing.T) {
	processID := 10
	nodeID := 20
	reason := "订单资料不完整"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: processID, Status: ProcessStatusActive},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "order_approval",
				NodeType:          ProcessNodeTypeApproval,
				Status:            ProcessNodeStatusActive,
				Version:           3,
			},
			{
				ID:                21,
				ProcessInstanceID: processID,
				NodeKey:           "order_review",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "rejected",
			BlockedReason:         &reason,
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
			Payload:               map[string]any{"outcome": "APPROVED"},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	node, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected rejected linked task settlement, got %v", err)
	}
	if node.Status != ProcessNodeStatusCompleted || node.Outcome == nil || *node.Outcome != "rejected" {
		t.Fatalf("expected completed decision node with rejected outcome, got %#v", node)
	}
	if processRepo.blockedProcess == nil || processRepo.blockedProcess.ID != processID {
		t.Fatalf("rejected node without explicit route must block process, got %#v", processRepo.blockedProcess)
	}
	if processRepo.process.Status != ProcessStatusBlocked {
		t.Fatalf("expected process blocked after unhandled rejection, got %#v", processRepo.process)
	}
	if processRepo.activatedNode != nil || processRepo.nodes[1].Status != ProcessNodeStatusWaiting {
		t.Fatalf("unhandled rejection must not advance along success sequence, next=%#v activation=%#v", processRepo.nodes[1], processRepo.activatedNode)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectedPassesReasonToExplicitBranch(t *testing.T) {
	processID := 10
	nodeID := 20
	targetNodeID := 21
	reason := "缺少客户确认的交期"
	branchPolicyKey := "order_approval.decision"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			Status:          ProcessStatusActive,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "order_approval",
				NodeType:          ProcessNodeTypeApproval,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot: map[string]any{
					"branch_policy_key": branchPolicyKey,
				},
			},
			{
				ID:                    targetNodeID,
				ProcessInstanceID:     processID,
				NodeKey:               "order_revision",
				NodeType:              ProcessNodeTypeHumanTask,
				Status:                ProcessNodeStatusWaiting,
				OwnerPoolKey:          ptrString("order_review"),
				RequiredCapabilityKey: ptrString(PermissionWorkflowTaskComplete),
				Version:               1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "rejected",
			BlockedReason:         &reason,
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
		},
	}
	branchHandler := &stubProcessBranchPolicyHandler{
		result: &ProcessBranchPolicyResult{NextNodeKey: "order_revision"},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "yoyoosun-rev-1",
			CandidateOwnerRoleKeys: []string{SalesRoleKey},
			Source:                 "active_customer_config",
		},
	})
	if err := uc.RegisterBranchPolicyHandler(branchPolicyKey, branchHandler); err != nil {
		t.Fatalf("register branch policy failed: %v", err)
	}

	if _, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7); err != nil {
		t.Fatalf("expected rejected branch settlement, got %v", err)
	}
	if branchHandler.input == nil || branchHandler.input.Outcome != "rejected" || branchHandler.input.Reason != reason {
		t.Fatalf("expected rejected outcome and reason passed to branch policy, got %#v", branchHandler.input)
	}
	if processRepo.nodes[1].Status != ProcessNodeStatusActive {
		t.Fatalf("expected explicit rejection branch target active, got %#v", processRepo.nodes[1])
	}
	if processRepo.blockedProcess != nil {
		t.Fatalf("explicit rejection branch must not block process, got %#v", processRepo.blockedProcess)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectedRetryIsIdempotent(t *testing.T) {
	processID := 10
	nodeID := 20
	reason := "审批资料缺失"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: processID, Status: ProcessStatusActive},
		node: &ProcessNodeInstance{
			ID:                nodeID,
			ProcessInstanceID: processID,
			NodeType:          ProcessNodeTypeApproval,
			Status:            ProcessNodeStatusActive,
			Version:           1,
		},
	}
	workflowRepo := &stubWorkflowRepo{currentTask: &WorkflowTask{
		ID:                    99,
		TaskStatusKey:         "rejected",
		BlockedReason:         &reason,
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &nodeID,
	}}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	for attempt := 0; attempt < 2; attempt++ {
		node, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
			WorkflowTaskID: 99,
		}, 7)
		if err != nil {
			t.Fatalf("rejected settlement attempt %d failed: %v", attempt+1, err)
		}
		if node.Status != ProcessNodeStatusCompleted || node.Outcome == nil || *node.Outcome != "rejected" {
			t.Fatalf("unexpected settled node on attempt %d: %#v", attempt+1, node)
		}
	}
	if len(processRepo.completedNodes) != 1 {
		t.Fatalf("repeated rejection must complete node once, got %d writes", len(processRepo.completedNodes))
	}
	if processRepo.process.Status != ProcessStatusBlocked {
		t.Fatalf("repeated rejection must keep process blocked, got %#v", processRepo.process)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectedRequiresReason(t *testing.T) {
	processID := 10
	nodeID := 20
	processRepo := &memProcessRuntimeRepo{node: &ProcessNodeInstance{
		ID:                nodeID,
		ProcessInstanceID: processID,
		NodeType:          ProcessNodeTypeApproval,
		Status:            ProcessNodeStatusActive,
		Version:           1,
	}}
	workflowRepo := &stubWorkflowRepo{currentTask: &WorkflowTask{
		ID:                    99,
		TaskStatusKey:         "rejected",
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &nodeID,
	}}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected rejected task without reason to fail, got %v", err)
	}
	if processRepo.completedNode != nil {
		t.Fatalf("rejected task without reason must not settle process node")
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskDoneRetryIsIdempotent(t *testing.T) {
	processID := 10
	nodeID := 20
	outcome := "CONFIRMED"
	processRepo := &memProcessRuntimeRepo{node: &ProcessNodeInstance{
		ID:                nodeID,
		ProcessInstanceID: processID,
		NodeType:          ProcessNodeTypeHumanTask,
		Status:            ProcessNodeStatusCompleted,
		Outcome:           &outcome,
		Version:           2,
	}}
	workflowRepo := &stubWorkflowRepo{currentTask: &WorkflowTask{
		ID:                    99,
		TaskStatusKey:         "done",
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &nodeID,
		Payload:               map[string]any{"outcome": outcome},
	}}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	node, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected repeated done settlement to succeed, got %v", err)
	}
	if node != processRepo.node || processRepo.completedNode != nil {
		t.Fatalf("repeated done settlement must return existing node without rewriting, node=%#v write=%#v", node, processRepo.completedNode)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskDoneRetryReconcilesMissingNextTask(t *testing.T) {
	processID := 10
	nodeID := 20
	nextNodeID := 21
	downstreamErr := errors.New("workflow task storage temporarily unavailable")
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			Status:          ProcessStatusActive,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "prepare_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Attempt:           1,
				Status:            ProcessNodeStatusActive,
				Version:           3,
			},
			{
				ID:                    nextNodeID,
				ProcessInstanceID:     processID,
				NodeKey:               "engineering_release_approval",
				NodeType:              ProcessNodeTypeApproval,
				Attempt:               1,
				Status:                ProcessNodeStatusWaiting,
				OwnerPoolKey:          ptrString("boss_approval"),
				RequiredCapabilityKey: ptrString(PermissionWorkflowTaskApprove),
				Version:               1,
			},
		},
	}
	workflowRepo := &retryWorkflowRepo{
		stubWorkflowRepo: stubWorkflowRepo{currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
			Payload:               map[string]any{"outcome": "CONFIRMED"},
		}},
		remainingFailures: 1,
		failureErr:        downstreamErr,
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "yoyoosun-rev-1",
			CandidateOwnerRoleKeys: []string{BossRoleKey},
			Source:                 "active_customer_config",
		},
	})

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{WorkflowTaskID: 99}, 7)
	if !errors.Is(err, downstreamErr) {
		t.Fatalf("expected first completion to fail after node activation, got %v", err)
	}
	if processRepo.nodes[0].Status != ProcessNodeStatusCompleted || processRepo.nodes[1].Status != ProcessNodeStatusActive {
		t.Fatalf("expected completed source and active target after partial failure, got %#v / %#v", processRepo.nodes[0], processRepo.nodes[1])
	}
	if len(workflowRepo.createdByCode) != 0 {
		t.Fatalf("failed target task write must not be treated as persisted, got %#v", workflowRepo.createdByCode)
	}

	if _, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{WorkflowTaskID: 99}, 7); err != nil {
		t.Fatalf("expected retry to reconcile active target task, got %v", err)
	}
	if len(processRepo.completedNodes) != 1 {
		t.Fatalf("retry must not complete source node twice, got %d writes", len(processRepo.completedNodes))
	}
	if processRepo.nodes[1].Version != 2 {
		t.Fatalf("retry must not activate target node twice, got %#v", processRepo.nodes[1])
	}
	if len(workflowRepo.createdByCode) != 1 {
		t.Fatalf("retry must persist exactly one target task, got %#v", workflowRepo.createdByCode)
	}

	if _, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{WorkflowTaskID: 99}, 7); err != nil {
		t.Fatalf("expected repeated reconciliation to reuse target task, got %v", err)
	}
	if len(workflowRepo.createdByCode) != 1 {
		t.Fatalf("repeated reconciliation must not duplicate target task, got %#v", workflowRepo.createdByCode)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectedRetryReconcilesExplicitBranchTask(t *testing.T) {
	processID := 10
	nodeID := 20
	targetNodeID := 21
	reason := "客户交期依据不足"
	branchPolicyKey := "order_approval.decision"
	downstreamErr := errors.New("workflow task storage temporarily unavailable")
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			Status:          ProcessStatusActive,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "order_approval",
				NodeType:          ProcessNodeTypeApproval,
				Attempt:           1,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot:    map[string]any{"branch_policy_key": branchPolicyKey},
			},
			{
				ID:                    targetNodeID,
				ProcessInstanceID:     processID,
				NodeKey:               "order_revision",
				NodeType:              ProcessNodeTypeHumanTask,
				Attempt:               1,
				Status:                ProcessNodeStatusWaiting,
				OwnerPoolKey:          ptrString("order_review"),
				RequiredCapabilityKey: ptrString(PermissionWorkflowTaskComplete),
				Version:               1,
			},
		},
	}
	workflowRepo := &retryWorkflowRepo{
		stubWorkflowRepo: stubWorkflowRepo{currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "rejected",
			BlockedReason:         &reason,
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
		}},
		remainingFailures: 1,
		failureErr:        downstreamErr,
	}
	branchHandler := &stubProcessBranchPolicyHandler{result: &ProcessBranchPolicyResult{NextNodeKey: "order_revision"}}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "yoyoosun-rev-1",
			CandidateOwnerRoleKeys: []string{SalesRoleKey},
			Source:                 "active_customer_config",
		},
	})
	if err := uc.RegisterBranchPolicyHandler(branchPolicyKey, branchHandler); err != nil {
		t.Fatalf("register branch policy failed: %v", err)
	}

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{WorkflowTaskID: 99}, 7)
	if !errors.Is(err, downstreamErr) {
		t.Fatalf("expected first rejection routing to fail after target activation, got %v", err)
	}
	if processRepo.process.Status != ProcessStatusActive || processRepo.blockedProcess != nil {
		t.Fatalf("explicit rejection route failure must remain retryable, process=%#v block=%#v", processRepo.process, processRepo.blockedProcess)
	}
	if processRepo.nodes[0].Status != ProcessNodeStatusCompleted || processRepo.nodes[1].Status != ProcessNodeStatusActive {
		t.Fatalf("expected completed decision and active revision target, got %#v / %#v", processRepo.nodes[0], processRepo.nodes[1])
	}

	if _, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{WorkflowTaskID: 99}, 7); err != nil {
		t.Fatalf("expected rejection retry to reconcile explicit branch task, got %v", err)
	}
	if len(processRepo.completedNodes) != 1 || processRepo.nodes[1].Version != 2 {
		t.Fatalf("rejection retry must not repeat node transitions, completions=%d target=%#v", len(processRepo.completedNodes), processRepo.nodes[1])
	}
	if len(workflowRepo.createdByCode) != 1 {
		t.Fatalf("rejection retry must create exactly one revision task, got %#v", workflowRepo.createdByCode)
	}
	if branchHandler.input == nil || branchHandler.input.Reason != reason || branchHandler.input.Outcome != "rejected" {
		t.Fatalf("reconciliation must retain rejected reason and outcome, got %#v", branchHandler.input)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskActivatesNextWaitingNode(t *testing.T) {
	processID := 10
	nodeID := 20
	nextNodeID := 21
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "prepare_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusActive,
				Version:           3,
			},
			{
				ID:                nextNodeID,
				ProcessInstanceID: processID,
				NodeKey:           "engineering_release_approval",
				NodeType:          ProcessNodeTypeApproval,
				Attempt:           1,
				Status:            ProcessNodeStatusWaiting,
				OwnerPoolKey:      ptrString("boss_approval"),
				RequiredCapabilityKey: ptrString(
					PermissionWorkflowTaskApprove,
				),
				Version: 1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "yoyoosun-rev-1",
			OwnerPoolKey:           "boss_approval",
			RequiredCapabilities:   []string{PermissionWorkflowTaskApprove},
			CandidateOwnerRoleKeys: []string{BossRoleKey},
			Source:                 "active_customer_config",
		},
	})

	node, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected linked workflow task completion, got %v", err)
	}
	if node.Status != ProcessNodeStatusCompleted {
		t.Fatalf("expected current node completed, got %#v", node)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != nextNodeID || processRepo.activatedNode.ExpectedVersion != 1 {
		t.Fatalf("expected next waiting node activation, got %#v", processRepo.activatedNode)
	}
	if got := processRepo.nodes[1]; got.Status != ProcessNodeStatusActive || got.Version != 2 {
		t.Fatalf("expected next node active with incremented version, got %#v", got)
	}
	if workflowRepo.createTaskInput == nil {
		t.Fatalf("expected next linked workflow task creation")
	}
	if workflowRepo.createTaskInput.ProcessNodeInstanceID == nil || *workflowRepo.createTaskInput.ProcessNodeInstanceID != nextNodeID {
		t.Fatalf("expected next node linked task, got %#v", workflowRepo.createTaskInput.ProcessNodeInstanceID)
	}
	if workflowRepo.createTaskInput.TaskCode != "PROC-10-NODE-21-A1" {
		t.Fatalf("expected stable next task code, got %q", workflowRepo.createTaskInput.TaskCode)
	}
	if workflowRepo.createTaskInput.OwnerRoleKey != BossRoleKey {
		t.Fatalf("expected resolved next owner role, got %q", workflowRepo.createTaskInput.OwnerRoleKey)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskUsesNamedBranchPolicy(t *testing.T) {
	processID := 10
	nodeID := 20
	approvalNodeID := 22
	branchPolicyKey := "engineering_release.decision"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "prepare_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot: map[string]any{
					"branch_policy_key": branchPolicyKey,
				},
			},
			{
				ID:                21,
				ProcessInstanceID: processID,
				NodeKey:           "request_more_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
			{
				ID:                approvalNodeID,
				ProcessInstanceID: processID,
				NodeKey:           "engineering_release_approval",
				NodeType:          ProcessNodeTypeApproval,
				Attempt:           1,
				Status:            ProcessNodeStatusWaiting,
				OwnerPoolKey:      ptrString("boss_approval"),
				RequiredCapabilityKey: ptrString(
					PermissionWorkflowTaskApprove,
				),
				Version: 1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
			Payload: map[string]any{
				"outcome": "APPROVED",
			},
		},
	}
	branchHandler := &stubProcessBranchPolicyHandler{
		result: &ProcessBranchPolicyResult{NextNodeKey: "engineering_release_approval"},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "yoyoosun-rev-1",
			OwnerPoolKey:           "boss_approval",
			RequiredCapabilities:   []string{PermissionWorkflowTaskApprove},
			CandidateOwnerRoleKeys: []string{BossRoleKey},
			Source:                 "active_customer_config",
		},
	})
	if err := uc.RegisterBranchPolicyHandler(branchPolicyKey, branchHandler); err != nil {
		t.Fatalf("register branch policy failed: %v", err)
	}

	node, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected branch policy completion, got %v", err)
	}
	if node.Status != ProcessNodeStatusCompleted || node.Outcome == nil || *node.Outcome != "APPROVED" {
		t.Fatalf("expected current node completed with payload outcome, got %#v", node)
	}
	if branchHandler.calls != 1 || branchHandler.input == nil {
		t.Fatalf("expected branch handler called once, got %#v", branchHandler)
	}
	if branchHandler.input.PolicyKey != branchPolicyKey || branchHandler.input.Outcome != "APPROVED" {
		t.Fatalf("expected named policy and outcome passed, got %#v", branchHandler.input)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != approvalNodeID {
		t.Fatalf("expected named target activation, got %#v", processRepo.activatedNode)
	}
	if processRepo.nodes[1].Status != ProcessNodeStatusWaiting {
		t.Fatalf("branch policy must not automatically skip non-selected node, got %#v", processRepo.nodes[1])
	}
	if workflowRepo.createTaskInput == nil || workflowRepo.createTaskInput.ProcessNodeInstanceID == nil || *workflowRepo.createTaskInput.ProcessNodeInstanceID != approvalNodeID {
		t.Fatalf("expected linked workflow task for named branch target, got %#v", workflowRepo.createTaskInput)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectsUnregisteredBranchPolicy(t *testing.T) {
	processID := 10
	nodeID := 20
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "prepare_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot: map[string]any{
					"branch_policy_key": "engineering_release.decision",
				},
			},
			{
				ID:                21,
				ProcessInstanceID: processID,
				NodeKey:           "engineering_release_approval",
				NodeType:          ProcessNodeTypeApproval,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if !errors.Is(err, ErrProcessBranchPolicyHandlerNotFound) {
		t.Fatalf("expected unregistered branch policy rejection, got %v", err)
	}
	if processRepo.activatedNode != nil {
		t.Fatalf("unregistered branch policy must not activate target, got %#v", processRepo.activatedNode)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatalf("unregistered branch policy must not create target task")
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskFanOutActivatesNamedBranches(t *testing.T) {
	processID := 10
	nodeID := 20
	warehouseNodeID := 21
	qualityNodeID := 22
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "prepare_order",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot: map[string]any{
					"fan_out_node_keys": []string{"warehouse_check", "quality_check"},
				},
			},
			{
				ID:                    warehouseNodeID,
				ProcessInstanceID:     processID,
				NodeKey:               "warehouse_check",
				NodeType:              ProcessNodeTypeHumanTask,
				Attempt:               1,
				Status:                ProcessNodeStatusWaiting,
				OwnerPoolKey:          ptrString("warehouse_execution"),
				RequiredCapabilityKey: ptrString(PermissionWorkflowTaskComplete),
				Version:               1,
			},
			{
				ID:                    qualityNodeID,
				ProcessInstanceID:     processID,
				NodeKey:               "quality_check",
				NodeType:              ProcessNodeTypeApproval,
				Attempt:               1,
				Status:                ProcessNodeStatusWaiting,
				OwnerPoolKey:          ptrString("quality_approval"),
				RequiredCapabilityKey: ptrString(PermissionWorkflowTaskApprove),
				Version:               1,
			},
		},
	}
	workflowRepo := &recordingWorkflowRepo{
		stubWorkflowRepo: stubWorkflowRepo{
			currentTask: &WorkflowTask{
				ID:                    99,
				TaskStatusKey:         "done",
				ProcessInstanceID:     &processID,
				ProcessNodeInstanceID: &nodeID,
			},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "yoyoosun-rev-1",
			CandidateOwnerRoleKeys: []string{EngineeringRoleKey},
			Source:                 "active_customer_config",
		},
	})

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected fan-out completion, got %v", err)
	}
	if processRepo.nodes[1].Status != ProcessNodeStatusActive || processRepo.nodes[2].Status != ProcessNodeStatusActive {
		t.Fatalf("expected both fan-out targets active, got %#v / %#v", processRepo.nodes[1], processRepo.nodes[2])
	}
	if len(workflowRepo.createTaskInputs) != 2 {
		t.Fatalf("expected linked tasks for both human fan-out targets, got %d", len(workflowRepo.createTaskInputs))
	}
	if workflowRepo.createTaskInputs[0].ProcessNodeInstanceID == nil || *workflowRepo.createTaskInputs[0].ProcessNodeInstanceID != warehouseNodeID {
		t.Fatalf("expected first fan-out task for warehouse node, got %#v", workflowRepo.createTaskInputs[0])
	}
	if workflowRepo.createTaskInputs[1].ProcessNodeInstanceID == nil || *workflowRepo.createTaskInputs[1].ProcessNodeInstanceID != qualityNodeID {
		t.Fatalf("expected second fan-out task for quality node, got %#v", workflowRepo.createTaskInputs[1])
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskJoinAllWaitsForSources(t *testing.T) {
	processID := 10
	nodeID := 20
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "warehouse_check",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot: map[string]any{
					"join_node_key":         "release_review",
					"join_policy":           "all",
					"join_source_node_keys": []string{"warehouse_check", "quality_check"},
				},
			},
			{
				ID:                21,
				ProcessInstanceID: processID,
				NodeKey:           "quality_check",
				NodeType:          ProcessNodeTypeApproval,
				Status:            ProcessNodeStatusActive,
				Version:           1,
			},
			{
				ID:                22,
				ProcessInstanceID: processID,
				NodeKey:           "release_review",
				NodeType:          ProcessNodeTypeEnd,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected first join-all source completion, got %v", err)
	}
	if processRepo.nodes[2].Status != ProcessNodeStatusWaiting {
		t.Fatalf("join-all target must wait for all sources, got %#v", processRepo.nodes[2])
	}
	if processRepo.completedProcess != nil {
		t.Fatalf("join-all target must not complete process before all sources finish")
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskJoinAllActivatesTarget(t *testing.T) {
	processID := 10
	nodeID := 20
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			Status:          ProcessStatusActive,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "warehouse_check",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot: map[string]any{
					"join_node_key":         "release_review",
					"join_policy":           "all",
					"join_source_node_keys": []string{"warehouse_check", "quality_check"},
				},
			},
			{
				ID:                21,
				ProcessInstanceID: processID,
				NodeKey:           "quality_check",
				NodeType:          ProcessNodeTypeApproval,
				Status:            ProcessNodeStatusCompleted,
				Version:           2,
			},
			{
				ID:                22,
				ProcessInstanceID: processID,
				NodeKey:           "release_review",
				NodeType:          ProcessNodeTypeEnd,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected join-all target activation, got %v", err)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != 22 {
		t.Fatalf("expected join target activation, got %#v", processRepo.activatedNode)
	}
	if processRepo.completedProcess == nil || processRepo.completedProcess.ID != processID {
		t.Fatalf("expected end join target to complete process, got %#v", processRepo.completedProcess)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskJoinAnyIsIdempotentAfterTargetActive(t *testing.T) {
	processID := 10
	firstNodeID := 20
	secondNodeID := 21
	targetNodeID := 22
	joinPolicy := map[string]any{
		"join_node_key":         "risk_review",
		"join_policy":           "any",
		"join_source_node_keys": []string{"quality_blocked", "warehouse_blocked"},
	}
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			Status:          ProcessStatusActive,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                firstNodeID,
				ProcessInstanceID: processID,
				NodeKey:           "quality_blocked",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot:    joinPolicy,
			},
			{
				ID:                secondNodeID,
				ProcessInstanceID: processID,
				NodeKey:           "warehouse_blocked",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusActive,
				Version:           5,
				PolicySnapshot:    joinPolicy,
			},
			{
				ID:                    targetNodeID,
				ProcessInstanceID:     processID,
				NodeKey:               "risk_review",
				NodeType:              ProcessNodeTypeApproval,
				Status:                ProcessNodeStatusWaiting,
				OwnerPoolKey:          ptrString("boss_approval"),
				RequiredCapabilityKey: ptrString(PermissionWorkflowTaskApprove),
				Version:               1,
			},
		},
	}
	firstWorkflowTaskID := 99
	workflowRepo := &recordingWorkflowRepo{
		stubWorkflowRepo: stubWorkflowRepo{
			currentTask: &WorkflowTask{
				ID:                    firstWorkflowTaskID,
				TaskStatusKey:         "done",
				ProcessInstanceID:     &processID,
				ProcessNodeInstanceID: &firstNodeID,
			},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "yoyoosun-rev-1",
			CandidateOwnerRoleKeys: []string{BossRoleKey},
			Source:                 "active_customer_config",
		},
	})

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: firstWorkflowTaskID,
	}, 7)
	if err != nil {
		t.Fatalf("expected first join-any completion, got %v", err)
	}
	if processRepo.nodes[2].Status != ProcessNodeStatusActive {
		t.Fatalf("expected join-any target active after first source, got %#v", processRepo.nodes[2])
	}
	if len(workflowRepo.createTaskInputs) != 1 {
		t.Fatalf("expected one linked task for join target, got %d", len(workflowRepo.createTaskInputs))
	}
	secondWorkflowTaskID := 100
	workflowRepo.currentTask = &WorkflowTask{
		ID:                    secondWorkflowTaskID,
		TaskStatusKey:         "done",
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &secondNodeID,
	}

	_, err = uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: secondWorkflowTaskID,
	}, 7)
	if err != nil {
		t.Fatalf("expected second join-any source to no-op after target active, got %v", err)
	}
	if len(workflowRepo.createTaskInputs) != 1 {
		t.Fatalf("join-any target already active must not create duplicate task, got %d", len(workflowRepo.createTaskInputs))
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskReturnToCreatesNextAttempt(t *testing.T) {
	ownerPoolKey := "engineering_data"
	requiredCapabilityKey := "workflow.task.complete"
	returnOutcomes := []string{"return"}
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              1,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                    10,
				ProcessInstanceID:     1,
				NodeKey:               "prepare_engineering_data",
				NodeType:              ProcessNodeTypeHumanTask,
				Attempt:               1,
				Status:                ProcessNodeStatusCompleted,
				OwnerPoolKey:          &ownerPoolKey,
				RequiredCapabilityKey: &requiredCapabilityKey,
				PolicySnapshot:        map[string]any{},
				Version:               2,
			},
			{
				ID:                11,
				ProcessInstanceID: 1,
				NodeKey:           "engineering_release_approval",
				NodeType:          ProcessNodeTypeApproval,
				Attempt:           1,
				Status:            ProcessNodeStatusActive,
				PolicySnapshot: map[string]any{
					"return_to_node_key":  "prepare_engineering_data",
					"return_outcomes":     returnOutcomes,
					"return_max_attempts": 2,
				},
				Version: 1,
			},
		},
	}
	workflowRepo := &recordingWorkflowRepo{
		stubWorkflowRepo: stubWorkflowRepo{
			currentTask: &WorkflowTask{
				ID:                    501,
				TaskCode:              "TASK-501",
				TaskStatusKey:         "done",
				ProcessInstanceID:     processTestIntPtr(1),
				ProcessNodeInstanceID: processTestIntPtr(11),
				Payload:               map[string]any{"outcome": "return"},
			},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{})

	completedNode, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 501,
	}, 7)
	if err != nil {
		t.Fatalf("complete linked task with returnTo failed: %v", err)
	}
	if completedNode.ID != 11 || completedNode.Outcome == nil || *completedNode.Outcome != "return" {
		t.Fatalf("unexpected completed approval node %#v", completedNode)
	}
	if processRepo.createdAttempt == nil {
		t.Fatalf("expected returnTo to create a new node attempt")
	}
	if processRepo.createdAttempt.NodeKey != "prepare_engineering_data" || processRepo.createdAttempt.Attempt != 2 {
		t.Fatalf("unexpected return attempt %#v", processRepo.createdAttempt)
	}
	var returnedNode *ProcessNodeInstance
	for _, node := range processRepo.nodes {
		if node != nil && node.NodeKey == "prepare_engineering_data" && node.Attempt == 2 {
			returnedNode = node
			break
		}
	}
	if returnedNode == nil || returnedNode.Status != ProcessNodeStatusActive {
		t.Fatalf("expected returned node attempt to be active, got %#v", returnedNode)
	}
	if len(workflowRepo.createTaskInputs) != 1 {
		t.Fatalf("expected linked task for returned attempt, got %d", len(workflowRepo.createTaskInputs))
	}
	if workflowRepo.createTaskInputs[0].ProcessNodeInstanceID == nil ||
		*workflowRepo.createTaskInputs[0].ProcessNodeInstanceID != returnedNode.ID {
		t.Fatalf("expected linked task to point at returned attempt, got %#v", workflowRepo.createTaskInputs[0])
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskReturnRetryReusesCreatedAttempt(t *testing.T) {
	ownerPoolKey := "engineering_data"
	requiredCapabilityKey := PermissionWorkflowTaskComplete
	downstreamErr := errors.New("workflow task storage temporarily unavailable")
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              1,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                    10,
				ProcessInstanceID:     1,
				NodeKey:               "prepare_engineering_data",
				NodeType:              ProcessNodeTypeHumanTask,
				Attempt:               1,
				Status:                ProcessNodeStatusCompleted,
				OwnerPoolKey:          &ownerPoolKey,
				RequiredCapabilityKey: &requiredCapabilityKey,
				PolicySnapshot:        map[string]any{},
				Version:               2,
			},
			{
				ID:                11,
				ProcessInstanceID: 1,
				NodeKey:           "engineering_release_approval",
				NodeType:          ProcessNodeTypeApproval,
				Attempt:           1,
				Status:            ProcessNodeStatusActive,
				PolicySnapshot: map[string]any{
					"return_to_node_key":  "prepare_engineering_data",
					"return_outcomes":     []string{"return"},
					"return_max_attempts": 2,
				},
				Version: 1,
			},
		},
	}
	workflowRepo := &retryWorkflowRepo{
		stubWorkflowRepo: stubWorkflowRepo{currentTask: &WorkflowTask{
			ID:                    501,
			TaskStatusKey:         "done",
			ProcessInstanceID:     processTestIntPtr(1),
			ProcessNodeInstanceID: processTestIntPtr(11),
			Payload:               map[string]any{"outcome": "return"},
		}},
		remainingFailures: 1,
		failureErr:        downstreamErr,
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{})

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{WorkflowTaskID: 501}, 7)
	if !errors.Is(err, downstreamErr) {
		t.Fatalf("expected first return routing to fail after attempt activation, got %v", err)
	}
	if len(processRepo.nodes) != 3 || processRepo.nodes[2].Attempt != 2 || processRepo.nodes[2].Status != ProcessNodeStatusActive {
		t.Fatalf("expected one active returned attempt after partial failure, got %#v", processRepo.nodes)
	}

	if _, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{WorkflowTaskID: 501}, 7); err != nil {
		t.Fatalf("expected return retry to reconcile created attempt, got %v", err)
	}
	if len(processRepo.nodes) != 3 || processRepo.createdAttempt == nil || processRepo.createdAttempt.Attempt != 2 {
		t.Fatalf("return retry must not create a third attempt, got nodes=%#v create=%#v", processRepo.nodes, processRepo.createdAttempt)
	}
	if len(workflowRepo.createdByCode) != 1 {
		t.Fatalf("return retry must persist exactly one task, got %#v", workflowRepo.createdByCode)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskReturnToRejectsAttemptLimit(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              1,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                10,
				ProcessInstanceID: 1,
				NodeKey:           "prepare_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Attempt:           1,
				Status:            ProcessNodeStatusCompleted,
				PolicySnapshot:    map[string]any{},
				Version:           2,
			},
			{
				ID:                12,
				ProcessInstanceID: 1,
				NodeKey:           "prepare_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Attempt:           2,
				Status:            ProcessNodeStatusCompleted,
				PolicySnapshot:    map[string]any{},
				Version:           2,
			},
			{
				ID:                13,
				ProcessInstanceID: 1,
				NodeKey:           "engineering_release_approval",
				NodeType:          ProcessNodeTypeApproval,
				Attempt:           1,
				Status:            ProcessNodeStatusActive,
				PolicySnapshot: map[string]any{
					"return_to_node_key":  "prepare_engineering_data",
					"return_outcomes":     []string{"return"},
					"return_max_attempts": 2,
				},
				Version: 1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    501,
			TaskCode:              "TASK-501",
			TaskStatusKey:         "done",
			ProcessInstanceID:     processTestIntPtr(1),
			ProcessNodeInstanceID: processTestIntPtr(13),
			Payload:               map[string]any{"outcome": "return"},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 501,
	}, 7)
	if !errors.Is(err, ErrProcessReturnAttemptLimit) {
		t.Fatalf("expected return attempt limit, got %v", err)
	}
	if processRepo.createdAttempt != nil {
		t.Fatalf("expected no new attempt after limit, got %#v", processRepo.createdAttempt)
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskDoesNotCreateTaskForNonHumanNextNode(t *testing.T) {
	processID := 10
	nodeID := 20
	processRepo := &memProcessRuntimeRepo{
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "prepare_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusActive,
				Version:           3,
			},
			{
				ID:                21,
				ProcessInstanceID: processID,
				NodeKey:           "sync_engineering_snapshot",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected linked workflow task completion, got %v", err)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != 21 {
		t.Fatalf("expected adjacent domain command node activation, got %#v", processRepo.activatedNode)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatalf("domain command activation must not create a workflow task")
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskCompletesEndNodeAndProcess(t *testing.T) {
	processID := 10
	nodeID := 20
	endNodeID := 21
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			Status:          ProcessStatusActive,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "engineering_release_approval",
				NodeType:          ProcessNodeTypeApproval,
				Status:            ProcessNodeStatusActive,
				Version:           3,
			},
			{
				ID:                endNodeID,
				ProcessInstanceID: processID,
				NodeKey:           "engineering_release_end",
				NodeType:          ProcessNodeTypeEnd,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
			Payload: map[string]any{
				"outcome": "APPROVED",
			},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	node, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected linked workflow task completion through end node, got %v", err)
	}
	if node.Status != ProcessNodeStatusCompleted {
		t.Fatalf("expected current node completed, got %#v", node)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != endNodeID {
		t.Fatalf("expected end node activation, got %#v", processRepo.activatedNode)
	}
	if len(processRepo.completedNodes) != 2 {
		t.Fatalf("expected current and end nodes completed, got %#v", processRepo.completedNodes)
	}
	if processRepo.completedNodes[1].ID != endNodeID || processRepo.completedNodes[1].ExpectedVersion != 2 {
		t.Fatalf("expected activated end node completed with fresh version, got %#v", processRepo.completedNodes[1])
	}
	if got := processRepo.nodes[1]; got.Status != ProcessNodeStatusCompleted || got.Outcome == nil || *got.Outcome != ProcessStatusCompleted {
		t.Fatalf("expected end node completed with outcome, got %#v", got)
	}
	if processRepo.completedProcess == nil || processRepo.completedProcess.ID != processID {
		t.Fatalf("expected process instance completed, got %#v", processRepo.completedProcess)
	}
	if processRepo.process == nil || processRepo.process.Status != ProcessStatusCompleted || processRepo.process.CompletedAt == nil {
		t.Fatalf("expected process completed timestamp, got %#v", processRepo.process)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatalf("end node must not create a workflow task")
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskDoesNotSkipNonWaitingNextNode(t *testing.T) {
	processID := 10
	nodeID := 20
	processRepo := &memProcessRuntimeRepo{
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "prepare_engineering_data",
				NodeType:          ProcessNodeTypeHumanTask,
				Status:            ProcessNodeStatusActive,
				Version:           3,
			},
			{
				ID:                21,
				ProcessInstanceID: processID,
				NodeKey:           "engineering_release_approval",
				NodeType:          ProcessNodeTypeApproval,
				Status:            ProcessNodeStatusActive,
				Version:           1,
			},
			{
				ID:                22,
				ProcessInstanceID: processID,
				NodeKey:           "final_review",
				NodeType:          ProcessNodeTypeApproval,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if err != nil {
		t.Fatalf("expected linked workflow task completion, got %v", err)
	}
	if processRepo.activatedNode != nil {
		t.Fatalf("must not skip non-waiting next node, got %#v", processRepo.activatedNode)
	}
	if got := processRepo.nodes[2]; got.Status != ProcessNodeStatusWaiting {
		t.Fatalf("later waiting node must remain waiting, got %#v", got)
	}
}

func TestProcessRuntimeUsecaseExecuteDomainCommandNodeCompletesAndAdvances(t *testing.T) {
	processID := 10
	nodeID := 20
	nextNodeID := 21
	commandKey := "engineering_package.publish"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "publish_engineering_package",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot: map[string]any{
					"command_key": commandKey,
				},
			},
			{
				ID:                nextNodeID,
				ProcessInstanceID: processID,
				NodeKey:           "engineering_release_approval",
				NodeType:          ProcessNodeTypeApproval,
				Attempt:           1,
				Status:            ProcessNodeStatusWaiting,
				OwnerPoolKey:      ptrString("boss_approval"),
				RequiredCapabilityKey: ptrString(
					PermissionWorkflowTaskApprove,
				),
				Version: 1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{
		explanation: &WorkflowTaskCandidateExplanation{
			ConfigRevision:         "yoyoosun-rev-1",
			OwnerPoolKey:           "boss_approval",
			RequiredCapabilities:   []string{PermissionWorkflowTaskApprove},
			CandidateOwnerRoleKeys: []string{BossRoleKey},
			Source:                 "active_customer_config",
		},
	})
	handler := &stubProcessDomainCommandHandler{
		result: &ProcessDomainCommandResult{Outcome: "published"},
	}
	if err := uc.RegisterDomainCommandHandler(commandKey, handler); err != nil {
		t.Fatalf("register domain command handler failed: %v", err)
	}

	node, err := uc.ExecuteDomainCommandNode(context.Background(), &ProcessDomainCommandExecution{
		ProcessInstanceID:     processID,
		ProcessNodeInstanceID: nodeID,
		ExpectedVersion:       3,
		CommandKey:            commandKey,
		IdempotencyKey:        "process:10:node:20:engineering_package.publish",
		Payload: map[string]any{
			"source": "test",
		},
	}, 7)
	if err != nil {
		t.Fatalf("expected domain command execution, got %v", err)
	}
	if handler.calls != 1 || handler.input == nil {
		t.Fatalf("expected handler called once, got calls=%d input=%#v", handler.calls, handler.input)
	}
	if handler.input.ProcessInstance.ID != processID || handler.input.Node.ID != nodeID {
		t.Fatalf("expected handler process and node input, got %#v", handler.input)
	}
	if handler.input.CommandKey != commandKey || handler.input.IdempotencyKey == "" {
		t.Fatalf("expected command key and idempotency input, got %#v", handler.input)
	}
	if node.Status != ProcessNodeStatusCompleted || node.Outcome == nil || *node.Outcome != "published" {
		t.Fatalf("expected completed domain node with outcome, got %#v", node)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.ExpectedVersion != 3 {
		t.Fatalf("expected domain node completed with version guard, got %#v", processRepo.completedNode)
	}
	if node.DomainCommandFingerprint == nil || processRepo.completedNode.DomainCommandFingerprint == nil ||
		*node.DomainCommandFingerprint != *processRepo.completedNode.DomainCommandFingerprint || len(*node.DomainCommandFingerprint) != 64 {
		t.Fatalf("expected atomic domain command fingerprint persistence, node=%#v complete=%#v", node.DomainCommandFingerprint, processRepo.completedNode.DomainCommandFingerprint)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != nextNodeID {
		t.Fatalf("expected next waiting node activation, got %#v", processRepo.activatedNode)
	}
	if workflowRepo.createTaskInput == nil {
		t.Fatalf("expected next approval linked workflow task")
	}
	if workflowRepo.createTaskInput.ProcessNodeInstanceID == nil || *workflowRepo.createTaskInput.ProcessNodeInstanceID != nextNodeID {
		t.Fatalf("expected next node linked task, got %#v", workflowRepo.createTaskInput.ProcessNodeInstanceID)
	}
	if workflowRepo.createTaskInput.OwnerRoleKey != BossRoleKey {
		t.Fatalf("expected next linked task owner resolved from active config, got %q", workflowRepo.createTaskInput.OwnerRoleKey)
	}
}

func TestProcessRuntimeUsecaseExecuteDomainCommandNodeValidatesBeforeClaim(t *testing.T) {
	commandKey := "engineering_package.publish"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, Status: ProcessStatusActive, BusinessRefType: "sales_order", BusinessRefID: 1001},
		node: &ProcessNodeInstance{
			ID: 20, ProcessInstanceID: 10, NodeKey: "publish_engineering_package", NodeType: ProcessNodeTypeDomainCommand,
			Status: ProcessNodeStatusActive, Version: 3, PolicySnapshot: map[string]any{"command_key": commandKey},
		},
	}
	handler := &stubProcessDomainCommandHandler{validateErr: ErrBadParam, result: &ProcessDomainCommandResult{Outcome: "published"}}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
	if err := uc.RegisterDomainCommandHandler(commandKey, handler); err != nil {
		t.Fatalf("register handler failed: %v", err)
	}
	execution := &ProcessDomainCommandExecution{
		ProcessInstanceID: 10, ProcessNodeInstanceID: 20, ExpectedVersion: 3,
		CommandKey: commandKey, IdempotencyKey: "process:10:node:20:publish", Payload: map[string]any{"source": "invalid"},
	}
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), execution, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("invalid command must fail before claim, got %v", err)
	}
	if processRepo.claimCalls != 0 || processRepo.node.DomainCommandFingerprint != nil || handler.calls != 0 {
		t.Fatalf("validation failure must not bind fingerprint or execute side effect, claims=%d node=%#v calls=%d", processRepo.claimCalls, processRepo.node, handler.calls)
	}

	handler.validateErr = nil
	execution.Payload = map[string]any{"source": "corrected"}
	completed, err := uc.ExecuteDomainCommandNode(context.Background(), execution, 7)
	if err != nil {
		t.Fatalf("corrected command should remain executable: %v", err)
	}
	if completed.Status != ProcessNodeStatusCompleted || processRepo.claimCalls != 1 || handler.calls != 1 {
		t.Fatalf("corrected command did not complete exactly once, node=%#v claims=%d calls=%d", completed, processRepo.claimCalls, handler.calls)
	}
}

func TestProcessRuntimeUsecaseExecuteDomainCommandNodeReconcilesNodeSettledDuringClaim(t *testing.T) {
	commandKey := "engineering_package.publish"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, Status: ProcessStatusActive, BusinessRefType: "sales_order", BusinessRefID: 1001},
		node: &ProcessNodeInstance{
			ID: 20, ProcessInstanceID: 10, NodeKey: "publish_engineering_package", NodeType: ProcessNodeTypeDomainCommand,
			Status: ProcessNodeStatusActive, Version: 3, PolicySnapshot: map[string]any{"command_key": commandKey},
		},
		settleDuringClaim: true,
	}
	handler := &stubProcessDomainCommandHandler{result: &ProcessDomainCommandResult{Outcome: "published"}}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
	if err := uc.RegisterDomainCommandHandler(commandKey, handler); err != nil {
		t.Fatalf("register handler failed: %v", err)
	}

	settled, err := uc.ExecuteDomainCommandNode(context.Background(), &ProcessDomainCommandExecution{
		ProcessInstanceID: 10, ProcessNodeInstanceID: 20, ExpectedVersion: 3,
		CommandKey: commandKey, IdempotencyKey: "process:10:node:20:publish", Payload: map[string]any{"source": "same-intent"},
	}, 7)
	if err != nil {
		t.Fatalf("claim returning the same settled intent should reconcile: %v", err)
	}
	if settled.Status != ProcessNodeStatusCompleted || settled.Version != 4 || handler.calls != 0 {
		t.Fatalf("settled claim must not execute the handler again, node=%#v calls=%d", settled, handler.calls)
	}
	if processRepo.claimCalls != 1 || processRepo.completedNode != nil {
		t.Fatalf("settled claim must reuse the terminal node without a second completion, claims=%d complete=%#v", processRepo.claimCalls, processRepo.completedNode)
	}
}

func TestProcessRuntimeUsecaseExecuteDomainCommandNodeReconcilesAdvanceWithoutRepeatingSideEffect(t *testing.T) {
	processID := 10
	nodeID := 20
	nextNodeID := 21
	commandKey := "engineering_package.publish"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: processID, Status: ProcessStatusActive, BusinessRefType: "sales_order", BusinessRefID: 1001, ConfigRevision: "yoyoosun-rev-1"},
		nodes: []*ProcessNodeInstance{
			{ID: nodeID, ProcessInstanceID: processID, NodeKey: "publish_engineering_package", NodeType: ProcessNodeTypeDomainCommand, Status: ProcessNodeStatusActive, Version: 3, PolicySnapshot: map[string]any{"command_key": commandKey}},
			{ID: nextNodeID, ProcessInstanceID: processID, NodeKey: "engineering_release_approval", NodeType: ProcessNodeTypeApproval, Attempt: 1, Status: ProcessNodeStatusWaiting, OwnerPoolKey: ptrString("boss_approval"), RequiredCapabilityKey: ptrString(PermissionWorkflowTaskApprove), Version: 1},
		},
	}
	advanceErr := errors.New("workflow task store unavailable")
	workflowRepo := &retryWorkflowRepo{remainingFailures: 1, failureErr: advanceErr}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo, &stubProcessOwnerRoleResolver{explanation: &WorkflowTaskCandidateExplanation{
		ConfigRevision: "yoyoosun-rev-1", OwnerPoolKey: "boss_approval", RequiredCapabilities: []string{PermissionWorkflowTaskApprove}, CandidateOwnerRoleKeys: []string{BossRoleKey}, Source: "active_customer_config",
	}})
	handler := &stubProcessDomainCommandHandler{result: &ProcessDomainCommandResult{Outcome: "published"}}
	if err := uc.RegisterDomainCommandHandler(commandKey, handler); err != nil {
		t.Fatalf("register handler failed: %v", err)
	}
	execution := &ProcessDomainCommandExecution{
		ProcessInstanceID: processID, ProcessNodeInstanceID: nodeID, ExpectedVersion: 3,
		CommandKey: commandKey, IdempotencyKey: "process:10:node:20:engineering_package.publish", Payload: map[string]any{"source": "test"},
	}
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), execution, 7); !errors.Is(err, advanceErr) {
		t.Fatalf("first execution error = %v, want advance failure", err)
	}
	if handler.calls != 1 || processRepo.nodes[0].Status != ProcessNodeStatusCompleted || processRepo.nodes[1].Status != ProcessNodeStatusActive {
		t.Fatalf("expected committed side effect/node and active next node, calls=%d nodes=%#v", handler.calls, processRepo.nodes)
	}
	changedKey := *execution
	changedKey.IdempotencyKey = execution.IdempotencyKey + ":changed"
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), &changedKey, 7); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("settled recovery with another idempotency key must conflict, got %v", err)
	}
	changedPayload := *execution
	changedPayload.Payload = map[string]any{"source": "changed"}
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), &changedPayload, 7); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("settled recovery with another payload must conflict, got %v", err)
	}
	changedCommand := *execution
	changedCommand.CommandKey = "inventory.post_inbound"
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), &changedCommand, 7); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("settled recovery with another command must conflict, got %v", err)
	}
	if handler.calls != 1 || workflowRepo.createCalls != 1 {
		t.Fatalf("conflicting recovery must not rerun the handler or advance, handler=%d advances=%d", handler.calls, workflowRepo.createCalls)
	}
	reconciled, err := uc.ExecuteDomainCommandNode(context.Background(), execution, 7)
	if err != nil {
		t.Fatalf("retry should reconcile process advance: %v", err)
	}
	if reconciled.Status != ProcessNodeStatusCompleted || handler.calls != 1 {
		t.Fatalf("retry must not repeat domain side effect, node=%#v calls=%d", reconciled, handler.calls)
	}
	if workflowRepo.createCalls != 2 || workflowRepo.createdByCode["PROC-10-NODE-21-A1"] == nil {
		t.Fatalf("expected linked task reconciled on retry, calls=%d tasks=%#v", workflowRepo.createCalls, workflowRepo.createdByCode)
	}
}

func TestProcessDomainCommandFingerprintCanonicalizesPayloadMapOrder(t *testing.T) {
	first, err := processDomainCommandFingerprint("shipment.ship", "ship/42", map[string]any{
		"shipment_id": 42,
		"options": map[string]any{
			"warehouse_id": 3,
			"note":         "ready",
		},
	})
	if err != nil {
		t.Fatalf("first fingerprint failed: %v", err)
	}
	second, err := processDomainCommandFingerprint("shipment.ship", "ship/42", map[string]any{
		"options": map[string]any{
			"note":         "ready",
			"warehouse_id": 3,
		},
		"shipment_id": 42,
	})
	if err != nil {
		t.Fatalf("second fingerprint failed: %v", err)
	}
	if first != second || len(first) != 64 {
		t.Fatalf("canonical payload order must produce one sha256 fingerprint, first=%q second=%q", first, second)
	}
	changed, err := processDomainCommandFingerprint("shipment.ship", "ship/42", map[string]any{"shipment_id": 43})
	if err != nil {
		t.Fatalf("changed fingerprint failed: %v", err)
	}
	if changed == first {
		t.Fatalf("changed business intent must change fingerprint")
	}
}

func TestNormalizeProcessNodeInstanceCreateCanonicalizesDueAtToPostgresPrecision(t *testing.T) {
	dueAt := time.Date(2026, 7, 10, 12, 34, 56, 123456789, time.FixedZone("UTC+8", 8*60*60))
	normalized, err := normalizeProcessNodeInstanceCreate(ProcessNodeInstanceCreate{
		NodeKey: "approval", NodeType: ProcessNodeTypeApproval, Attempt: 1,
		Status: ProcessNodeStatusWaiting, DueAt: &dueAt,
	})
	if err != nil {
		t.Fatalf("normalize process node failed: %v", err)
	}
	expected := dueAt.UTC().Truncate(time.Microsecond)
	if normalized.DueAt == nil || normalized.DueAt.Location() != time.UTC || !normalized.DueAt.Equal(expected) || normalized.DueAt.Nanosecond()%1000 != 0 {
		t.Fatalf("due_at must canonicalize to UTC microseconds, got %#v want %v", normalized.DueAt, expected)
	}
}

func TestProcessRuntimeUsecaseExecuteDomainCommandNodePersistsFingerprintWhenBlocked(t *testing.T) {
	commandKey := "quality_inspection.aggregate_gate"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, Status: ProcessStatusActive, BusinessRefType: "purchase_receipt", BusinessRefID: 1001, ConfigRevision: "yoyoosun-rev-1"},
		node: &ProcessNodeInstance{
			ID: 20, ProcessInstanceID: 10, NodeKey: "incoming_quality_gate", NodeType: ProcessNodeTypeDomainCommand,
			Status: ProcessNodeStatusActive, Version: 3, PolicySnapshot: map[string]any{"command_key": commandKey},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
	handler := &stubProcessDomainCommandHandler{result: &ProcessDomainCommandResult{Outcome: "rejected", BlockReason: "quality_rejected"}}
	if err := uc.RegisterDomainCommandHandler(commandKey, handler); err != nil {
		t.Fatalf("register handler failed: %v", err)
	}
	execution := &ProcessDomainCommandExecution{
		ProcessInstanceID: 10, ProcessNodeInstanceID: 20, ExpectedVersion: 3,
		CommandKey: commandKey, IdempotencyKey: "process:10:node:20:quality_gate", Payload: map[string]any{"receipt_id": 1001},
	}
	blocked, err := uc.ExecuteDomainCommandNode(context.Background(), execution, 7)
	if err != nil {
		t.Fatalf("block domain command failed: %v", err)
	}
	if blocked.Status != ProcessNodeStatusBlocked || blocked.DomainCommandFingerprint == nil || len(*blocked.DomainCommandFingerprint) != 64 {
		t.Fatalf("blocked domain node must persist fingerprint, got %#v", blocked)
	}
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), execution, 7); err != nil {
		t.Fatalf("same blocked command fingerprint should reconcile: %v", err)
	}
	changed := *execution
	changed.Payload = map[string]any{"receipt_id": 1002}
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), &changed, 7); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("changed blocked command intent must conflict, got %v", err)
	}
	if handler.calls != 1 {
		t.Fatalf("blocked reconciliation must not rerun domain side effect, calls=%d", handler.calls)
	}
}

func TestProcessRuntimeUsecaseExecuteDomainCommandNodeRejectsSettledNodeWithoutFingerprint(t *testing.T) {
	commandKey := "engineering_package.publish"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, Status: ProcessStatusActive, BusinessRefType: "sales_order", BusinessRefID: 1001, ConfigRevision: "yoyoosun-rev-1"},
		node: &ProcessNodeInstance{
			ID: 20, ProcessInstanceID: 10, NodeKey: "publish_engineering_package", NodeType: ProcessNodeTypeDomainCommand,
			Status: ProcessNodeStatusCompleted, Version: 4, PolicySnapshot: map[string]any{"command_key": commandKey},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})

	_, err := uc.ExecuteDomainCommandNode(context.Background(), &ProcessDomainCommandExecution{
		ProcessInstanceID: 10, ProcessNodeInstanceID: 20, ExpectedVersion: 3,
		CommandKey: commandKey, IdempotencyKey: "process:10:node:20:engineering_package.publish",
	}, 7)
	if !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("settled node without persisted fingerprint must fail closed, got %v", err)
	}
}

func TestProcessRuntimeUsecaseExecuteDomainCommandNodeReplaysStoredResultAfterNodeCommitFailure(t *testing.T) {
	commandKey := "engineering_package.publish"
	commitErr := errors.New("process node commit unavailable")
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, Status: ProcessStatusActive, BusinessRefType: "sales_order", BusinessRefID: 1001, ConfigRevision: "yoyoosun-rev-1"},
		nodes: []*ProcessNodeInstance{
			{ID: 20, ProcessInstanceID: 10, NodeKey: "publish_engineering_package", NodeType: ProcessNodeTypeDomainCommand, Status: ProcessNodeStatusActive, Version: 3, PolicySnapshot: map[string]any{"command_key": commandKey}},
			{ID: 21, ProcessInstanceID: 10, NodeKey: "done", NodeType: ProcessNodeTypeEnd, Attempt: 1, Status: ProcessNodeStatusWaiting, Version: 1},
		},
		completeNodeFailures: 1,
		completeNodeErr:      commitErr,
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
	handler := &stubProcessDomainCommandHandler{result: &ProcessDomainCommandResult{Outcome: "published"}}
	if err := uc.RegisterDomainCommandHandler(commandKey, handler); err != nil {
		t.Fatalf("register handler failed: %v", err)
	}
	execution := &ProcessDomainCommandExecution{ProcessInstanceID: 10, ProcessNodeInstanceID: 20, ExpectedVersion: 3, CommandKey: commandKey, IdempotencyKey: "process:10:node:20:engineering_package.publish"}
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), execution, 7); !errors.Is(err, commitErr) {
		t.Fatalf("first execution error = %v, want node commit failure", err)
	}
	if processRepo.nodes[0].Status != ProcessNodeStatusActive || processRepo.nodes[0].Version != 3 ||
		processRepo.nodes[0].DomainCommandFingerprint == nil || handler.calls != 1 || processRepo.claimCalls != 1 || processRepo.resultRecordCalls != 1 {
		t.Fatalf("node should remain active after commit failure, node=%#v calls=%d", processRepo.nodes[0], handler.calls)
	}
	changedKey := *execution
	changedKey.IdempotencyKey = execution.IdempotencyKey + ":changed"
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), &changedKey, 7); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("changed key after side effect/node commit split must conflict before handler, got %v", err)
	}
	changedPayload := *execution
	changedPayload.Payload = map[string]any{"source": "changed"}
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), &changedPayload, 7); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("changed payload after side effect/node commit split must conflict before handler, got %v", err)
	}
	if handler.calls != 1 {
		t.Fatalf("conflicting active retries must not rerun handler, calls=%d", handler.calls)
	}
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), execution, 7); err != nil {
		t.Fatalf("retry should replay the stored result and finish: %v", err)
	}
	if handler.calls != 1 || handler.validateCalls != 1 || processRepo.resultRecordCalls != 1 || processRepo.nodes[0].Status != ProcessNodeStatusCompleted || processRepo.process.Status != ProcessStatusCompleted {
		t.Fatalf("unexpected recovered process state, calls=%d node=%#v process=%#v", handler.calls, processRepo.nodes[0], processRepo.process)
	}
}

func TestProcessRuntimeUsecaseStoredCompensationBlocksWithoutReplayingHandler(t *testing.T) {
	commandKey := "shipment.ship"
	commitErr := errors.New("process node commit unavailable")
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, Status: ProcessStatusActive, BusinessRefType: "shipment", BusinessRefID: 88, ConfigRevision: "rev-1"},
		nodes: []*ProcessNodeInstance{
			{ID: 20, ProcessInstanceID: 10, NodeKey: "ship", NodeType: ProcessNodeTypeDomainCommand, Status: ProcessNodeStatusActive, Version: 3, PolicySnapshot: map[string]any{"command_key": commandKey}},
			{ID: 21, ProcessInstanceID: 10, NodeKey: "done", NodeType: ProcessNodeTypeEnd, Attempt: 1, Status: ProcessNodeStatusWaiting, Version: 1},
		},
		completeNodeFailures: 1,
		completeNodeErr:      commitErr,
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
	effectRef := ProcessBusinessRef{RefType: "shipment", RefID: 88}
	handler := &stubProcessDomainCommandHandler{result: &ProcessDomainCommandResult{
		Outcome:     ShipmentProcessCommandOutcomeShipped,
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &effectRef,
	}}
	if err := uc.RegisterDomainCommandHandler(commandKey, handler); err != nil {
		t.Fatalf("register handler: %v", err)
	}
	execution := &ProcessDomainCommandExecution{
		ProcessInstanceID: 10, ProcessNodeInstanceID: 20, ExpectedVersion: 3,
		CommandKey: commandKey, IdempotencyKey: "process:10:node:20:shipment.ship", Payload: map[string]any{"shipment_id": 88},
	}
	if _, err := uc.ExecuteDomainCommandNode(context.Background(), execution, 7); !errors.Is(err, commitErr) {
		t.Fatalf("first execution error = %v, want node commit failure", err)
	}
	stored := processRepo.nodes[0]
	if stored.DomainCommandResultHash == nil || stored.DomainCommandFingerprint == nil {
		t.Fatalf("expected durable result before compensation, got %#v", stored)
	}
	compensation := map[string]any{"reason": "出货单已取消并写入库存冲正", "ref_type": "shipment", "ref_id": 88}
	compensationHash, err := processCanonicalSHA256(compensation)
	if err != nil {
		t.Fatalf("hash compensation: %v", err)
	}
	if _, err := processRepo.MarkProcessNodeDomainCommandCompensated(context.Background(), &ProcessNodeDomainCommandCompensationMark{
		ProcessInstanceID:        10,
		ProcessNodeInstanceID:    20,
		ExpectedVersion:          3,
		DomainCommandFingerprint: *stored.DomainCommandFingerprint,
		ExpectedResultHash:       *stored.DomainCommandResultHash,
		Compensation:             compensation,
		CompensationHash:         compensationHash,
	}, 9); err != nil {
		t.Fatalf("mark compensation: %v", err)
	}
	blocked, err := uc.ExecuteDomainCommandNode(context.Background(), execution, 7)
	if err != nil {
		t.Fatalf("replay compensated result: %v", err)
	}
	if blocked.Status != ProcessNodeStatusBlocked || blocked.Outcome == nil || *blocked.Outcome != "domain_command.compensated" || processRepo.process.Status != ProcessStatusBlocked {
		t.Fatalf("compensated result must block the active process, node=%#v process=%#v", blocked, processRepo.process)
	}
	if handler.calls != 1 || handler.validateCalls != 1 {
		t.Fatalf("compensated recovery must not revalidate or replay handler, validate=%d execute=%d", handler.validateCalls, handler.calls)
	}
}

func TestProcessRuntimeUsecaseCompletedCompensatedCommandFailsClosedWithoutAdvancing(t *testing.T) {
	commandKey := "shipment.ship"
	idempotencyKey := "process:10:node:20:shipment.ship"
	payload := map[string]any{"shipment_id": 88}
	fingerprint, err := processDomainCommandFingerprint(commandKey, idempotencyKey, payload)
	if err != nil {
		t.Fatalf("fingerprint: %v", err)
	}
	protocolVersion := ProcessDomainCommandProtocolVersionCurrent
	effectState := ProcessDomainCommandEffectStateCompensated
	resultHash := strings.Repeat("a", 64)
	compensationHash := strings.Repeat("b", 64)
	outcome := ShipmentProcessCommandOutcomeShipped
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, Status: ProcessStatusActive, BusinessRefType: "shipment", BusinessRefID: 88, ConfigRevision: "rev-1"},
		nodes: []*ProcessNodeInstance{
			{
				ID: 20, ProcessInstanceID: 10, NodeKey: "ship", NodeType: ProcessNodeTypeDomainCommand,
				Status: ProcessNodeStatusCompleted, Version: 4, Outcome: &outcome, PolicySnapshot: map[string]any{"command_key": commandKey},
				DomainCommandFingerprint: &fingerprint, DomainCommandProtocolVersion: &protocolVersion,
				DomainCommandResultHash: &resultHash, DomainCommandEffectState: &effectState,
				DomainCommandCompensationHash: &compensationHash,
			},
			{ID: 21, ProcessInstanceID: 10, NodeKey: "downstream", NodeType: ProcessNodeTypeHumanTask, Attempt: 1, Status: ProcessNodeStatusActive, Version: 1},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
	handler := &stubProcessDomainCommandHandler{}
	if err := uc.RegisterDomainCommandHandler(commandKey, handler); err != nil {
		t.Fatalf("register handler: %v", err)
	}

	_, err = uc.ExecuteDomainCommandNode(context.Background(), &ProcessDomainCommandExecution{
		ProcessInstanceID: 10, ProcessNodeInstanceID: 20, ExpectedVersion: 3,
		CommandKey: commandKey, IdempotencyKey: idempotencyKey, Payload: payload,
	}, 7)
	if !errors.Is(err, ErrProcessDomainCommandRecoveryRequired) {
		t.Fatalf("completed compensated command must fail closed, got %v", err)
	}
	if handler.validateCalls != 0 || handler.calls != 0 || processRepo.completedNode != nil || processRepo.activatedNode != nil {
		t.Fatalf("completed compensated replay must not validate, execute, settle, or advance: handler=%#v completed=%#v activated=%#v", handler, processRepo.completedNode, processRepo.activatedNode)
	}
}

func TestProcessRuntimeUsecaseLegacyClaimedDomainCommandFailsClosedBeforeValidation(t *testing.T) {
	commandKey := "shipment.ship"
	fingerprint, err := processDomainCommandFingerprint(commandKey, "legacy-key", map[string]any{"shipment_id": 88})
	if err != nil {
		t.Fatalf("fingerprint: %v", err)
	}
	legacyProtocol := 0
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, Status: ProcessStatusActive, BusinessRefType: "shipment", BusinessRefID: 88},
		node: &ProcessNodeInstance{
			ID: 20, ProcessInstanceID: 10, NodeKey: "ship", NodeType: ProcessNodeTypeDomainCommand,
			Status: ProcessNodeStatusActive, Version: 3, PolicySnapshot: map[string]any{"command_key": commandKey},
			DomainCommandFingerprint: &fingerprint, DomainCommandProtocolVersion: &legacyProtocol,
		},
	}
	handler := &stubProcessDomainCommandHandler{result: &ProcessDomainCommandResult{Outcome: ShipmentProcessCommandOutcomeShipped}}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
	if err := uc.RegisterDomainCommandHandler(commandKey, handler); err != nil {
		t.Fatalf("register handler: %v", err)
	}
	_, err = uc.ExecuteDomainCommandNode(context.Background(), &ProcessDomainCommandExecution{
		ProcessInstanceID: 10, ProcessNodeInstanceID: 20, ExpectedVersion: 3,
		CommandKey: commandKey, IdempotencyKey: "legacy-key", Payload: map[string]any{"shipment_id": 88},
	}, 7)
	if !errors.Is(err, ErrProcessDomainCommandRecoveryRequired) {
		t.Fatalf("legacy claimed node must fail closed, got %v", err)
	}
	if handler.validateCalls != 0 || handler.calls != 0 || processRepo.claimCalls != 0 {
		t.Fatalf("legacy recovery must stop before validation/claim/execute, validate=%d claim=%d execute=%d", handler.validateCalls, processRepo.claimCalls, handler.calls)
	}
}

func TestProcessRuntimeUsecaseSettledDomainCommandWithoutCurrentDurableResultFailsClosedBeforeReconcile(t *testing.T) {
	commandKey := "shipment.ship"
	idempotencyKey := "process:10:node:20:shipment.ship"
	payload := map[string]any{"shipment_id": 88}
	fingerprint, err := processDomainCommandFingerprint(commandKey, idempotencyKey, payload)
	if err != nil {
		t.Fatalf("fingerprint: %v", err)
	}

	for _, tt := range []struct {
		name            string
		protocolVersion int
	}{
		{name: "legacy protocol", protocolVersion: 0},
		{name: "current protocol missing result", protocolVersion: ProcessDomainCommandProtocolVersionCurrent},
	} {
		t.Run(tt.name, func(t *testing.T) {
			outcome := ShipmentProcessCommandOutcomeShipped
			processRepo := &memProcessRuntimeRepo{
				process: &ProcessInstance{ID: 10, Status: ProcessStatusActive, BusinessRefType: "shipment", BusinessRefID: 88},
				nodes: []*ProcessNodeInstance{
					{
						ID: 20, ProcessInstanceID: 10, NodeKey: "ship", NodeType: ProcessNodeTypeDomainCommand,
						Status: ProcessNodeStatusCompleted, Version: 4, Outcome: &outcome,
						PolicySnapshot:           map[string]any{"command_key": commandKey},
						DomainCommandFingerprint: &fingerprint, DomainCommandProtocolVersion: &tt.protocolVersion,
					},
					{ID: 21, ProcessInstanceID: 10, NodeKey: "done", NodeType: ProcessNodeTypeEnd, Attempt: 1, Status: ProcessNodeStatusWaiting, Version: 1},
				},
			}
			handler := &stubProcessDomainCommandHandler{}
			uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
			if err := uc.RegisterDomainCommandHandler(commandKey, handler); err != nil {
				t.Fatalf("register handler: %v", err)
			}

			_, err := uc.ExecuteDomainCommandNode(context.Background(), &ProcessDomainCommandExecution{
				ProcessInstanceID: 10, ProcessNodeInstanceID: 20, ExpectedVersion: 3,
				CommandKey: commandKey, IdempotencyKey: idempotencyKey, Payload: payload,
			}, 7)
			if !errors.Is(err, ErrProcessDomainCommandRecoveryRequired) {
				t.Fatalf("settled command without current durable result must fail closed, got %v", err)
			}
			if handler.validateCalls != 0 || handler.calls != 0 || processRepo.activatedNode != nil || processRepo.completedProcess != nil {
				t.Fatalf("unsafe settled replay must not validate, execute, activate downstream, or complete process: handler=%#v activated=%#v completed=%#v", handler, processRepo.activatedNode, processRepo.completedProcess)
			}
		})
	}
}

func TestProcessRuntimeUsecaseExecuteDomainCommandNodeRejectsMissingHandler(t *testing.T) {
	commandKey := "engineering_package.publish"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, BusinessRefType: "sales_order", BusinessRefID: 1001, ConfigRevision: "yoyoosun-rev-1"},
		node: &ProcessNodeInstance{
			ID:                20,
			ProcessInstanceID: 10,
			NodeKey:           "publish_engineering_package",
			NodeType:          ProcessNodeTypeDomainCommand,
			Status:            ProcessNodeStatusActive,
			Version:           3,
			PolicySnapshot: map[string]any{
				"command_key": commandKey,
			},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})

	_, err := uc.ExecuteDomainCommandNode(context.Background(), &ProcessDomainCommandExecution{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       3,
		CommandKey:            commandKey,
		IdempotencyKey:        "process:10:node:20:engineering_package.publish",
	}, 7)
	if !errors.Is(err, ErrProcessDomainCommandHandlerNotFound) {
		t.Fatalf("expected missing handler error, got %v", err)
	}
	if processRepo.completedNode != nil {
		t.Fatalf("missing handler must not complete domain command node")
	}
}

func TestProcessRuntimeUsecaseExecuteDomainCommandNodeRejectsCommandMismatch(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, BusinessRefType: "sales_order", BusinessRefID: 1001, ConfigRevision: "yoyoosun-rev-1"},
		node: &ProcessNodeInstance{
			ID:                20,
			ProcessInstanceID: 10,
			NodeKey:           "publish_engineering_package",
			NodeType:          ProcessNodeTypeDomainCommand,
			Status:            ProcessNodeStatusActive,
			Version:           3,
			PolicySnapshot: map[string]any{
				"command_key": "engineering_package.publish",
			},
		},
	}
	handler := &stubProcessDomainCommandHandler{}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
	if err := uc.RegisterDomainCommandHandler("engineering_package.publish", handler); err != nil {
		t.Fatalf("register domain command handler failed: %v", err)
	}

	_, err := uc.ExecuteDomainCommandNode(context.Background(), &ProcessDomainCommandExecution{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       3,
		CommandKey:            "inventory.post_inbound",
		IdempotencyKey:        "process:10:node:20:bad-command",
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected bad param for command mismatch, got %v", err)
	}
	if handler.calls != 0 {
		t.Fatalf("mismatched command must not call handler")
	}
	if processRepo.completedNode != nil {
		t.Fatalf("mismatched command must not complete domain command node")
	}
}

func TestApplyProcessLinkedBusinessRefRejectsMetadataDrift(t *testing.T) {
	refNo := "FIN-001"
	base := &ProcessInstanceLinkedBusinessRefRecord{
		ProcessInstanceID: 10,
		RefType:           "finance_fact",
		RefID:             3001,
		RefNo:             &refNo,
		SourceNodeKey:     "receivable_lead",
		SourceCommandKey:  ProcessDomainCommandFinanceReceivableLead,
	}
	snapshot, err := ApplyProcessLinkedBusinessRefToSnapshot(nil, base)
	if err != nil {
		t.Fatalf("record base linked ref: %v", err)
	}
	if _, err := ApplyProcessLinkedBusinessRefToSnapshot(snapshot, base); err != nil {
		t.Fatalf("exact linked ref replay must remain idempotent: %v", err)
	}
	changed := *base
	changedRefNo := "FIN-CHANGED"
	changed.RefNo = &changedRefNo
	if _, err := ApplyProcessLinkedBusinessRefToSnapshot(snapshot, &changed); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("same linked ref identity with changed metadata must conflict, got %v", err)
	}
	changed = *base
	changed.SourceNodeKey = "another_node"
	if _, err := ApplyProcessLinkedBusinessRefToSnapshot(snapshot, &changed); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("same linked ref identity with changed source must conflict, got %v", err)
	}
}

func TestProcessRuntimeUsecaseWakeProcessWaitEventNodeCompletesAndAdvances(t *testing.T) {
	processID := 10
	nodeID := 20
	endNodeID := 21
	eventKey := "engineering.package.published"
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			Status:          ProcessStatusActive,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                nodeID,
				ProcessInstanceID: processID,
				NodeKey:           "wait_engineering_package",
				NodeType:          ProcessNodeTypeWaitEvent,
				Status:            ProcessNodeStatusActive,
				Version:           3,
				PolicySnapshot: map[string]any{
					"event_key": eventKey,
				},
			},
			{
				ID:                endNodeID,
				ProcessInstanceID: processID,
				NodeKey:           "engineering_release_end",
				NodeType:          ProcessNodeTypeEnd,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	node, err := uc.WakeProcessWaitEventNode(context.Background(), &ProcessWaitEventWakeup{
		ProcessInstanceID:     processID,
		ProcessNodeInstanceID: nodeID,
		ExpectedVersion:       3,
		EventKey:              eventKey,
		IdempotencyKey:        "process:10:node:20:engineering.package.published",
	}, 7)
	if err != nil {
		t.Fatalf("expected wait_event wakeup, got %v", err)
	}
	if node.Status != ProcessNodeStatusCompleted || node.Outcome == nil || *node.Outcome != eventKey {
		t.Fatalf("expected completed wait_event with event outcome, got %#v", node)
	}
	if len(processRepo.completedNodes) < 1 || processRepo.completedNodes[0].ID != nodeID || processRepo.completedNodes[0].ExpectedVersion != 3 {
		t.Fatalf("expected wait_event node completed with version guard, got %#v", processRepo.completedNodes)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != endNodeID {
		t.Fatalf("expected adjacent end node activation, got %#v", processRepo.activatedNode)
	}
	if len(processRepo.completedNodes) != 2 || processRepo.completedNodes[1].ID != endNodeID {
		t.Fatalf("expected end node completed after wait_event, got %#v", processRepo.completedNodes)
	}
	if processRepo.completedProcess == nil || processRepo.completedProcess.ID != processID {
		t.Fatalf("expected process completed after wait_event end, got %#v", processRepo.completedProcess)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatalf("wait_event wakeup must not create a workflow task")
	}
}

func TestProcessRuntimeUsecaseWakeProcessWaitEventNodeRejectsEventMismatch(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, BusinessRefType: "sales_order", BusinessRefID: 1001, ConfigRevision: "yoyoosun-rev-1"},
		node: &ProcessNodeInstance{
			ID:                20,
			ProcessInstanceID: 10,
			NodeKey:           "wait_engineering_package",
			NodeType:          ProcessNodeTypeWaitEvent,
			Status:            ProcessNodeStatusActive,
			Version:           3,
			PolicySnapshot: map[string]any{
				"event_key": "engineering.package.published",
			},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})

	_, err := uc.WakeProcessWaitEventNode(context.Background(), &ProcessWaitEventWakeup{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       3,
		EventKey:              "inventory.posted",
		IdempotencyKey:        "process:10:node:20:bad-event",
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected bad param for wait_event mismatch, got %v", err)
	}
	if processRepo.completedNode != nil {
		t.Fatalf("mismatched event must not complete wait_event node")
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectsUnfinishedTask(t *testing.T) {
	processID := 10
	nodeID := 20
	processRepo := &memProcessRuntimeRepo{
		node: &ProcessNodeInstance{
			ID:                nodeID,
			ProcessInstanceID: processID,
			NodeType:          ProcessNodeTypeApproval,
			Status:            ProcessNodeStatusActive,
			Version:           1,
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "processing",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected bad param for unfinished task, got %v", err)
	}
	if processRepo.completedNode != nil {
		t.Fatalf("unfinished task must not complete process node")
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectsSettledNodeWithDifferentOutcome(t *testing.T) {
	processID := 10
	nodeID := 20
	storedOutcome := "APPROVED"
	processRepo := &memProcessRuntimeRepo{
		node: &ProcessNodeInstance{
			ID:                nodeID,
			ProcessInstanceID: processID,
			NodeType:          ProcessNodeTypeHumanTask,
			Status:            ProcessNodeStatusCompleted,
			Outcome:           &storedOutcome,
			Version:           2,
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
			Payload:               map[string]any{"outcome": "CONFIRMED"},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if !errors.Is(err, ErrProcessNodeInstanceSettled) {
		t.Fatalf("expected settled node error, got %v", err)
	}
}

func TestProcessRuntimeUsecaseBlockProcessNodeInstanceBlocksNodeAndProcess(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			Status:          ProcessStatusActive,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		node: &ProcessNodeInstance{
			ID:                20,
			ProcessInstanceID: 10,
			NodeKey:           "prepare_engineering_data",
			NodeType:          ProcessNodeTypeHumanTask,
			Status:            ProcessNodeStatusActive,
			Version:           3,
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	blockedNode, err := uc.BlockProcessNodeInstance(context.Background(), &ProcessNodeInstanceBlock{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       3,
		Reason:                " 样衣资料缺失 ",
	}, 7)
	if err != nil {
		t.Fatalf("expected process node block, got %v", err)
	}
	if blockedNode.Status != ProcessNodeStatusBlocked || blockedNode.Outcome == nil || *blockedNode.Outcome != "blocked" {
		t.Fatalf("expected blocked node outcome, got %#v", blockedNode)
	}
	if processRepo.blockedNode == nil || processRepo.blockedNode.Reason != "样衣资料缺失" || processRepo.blockedNode.Outcome != "blocked" {
		t.Fatalf("expected normalized block input, got %#v", processRepo.blockedNode)
	}
	if processRepo.blockedProcess == nil || processRepo.blockedProcess.ID != 10 {
		t.Fatalf("expected process instance blocked, got %#v", processRepo.blockedProcess)
	}
	if processRepo.completedNode != nil || processRepo.activatedNode != nil || workflowRepo.createTaskInput != nil {
		t.Fatalf("blocked path must not complete, advance, or create workflow tasks")
	}
}

func TestProcessRuntimeUsecaseEscalateDueProcessNodeBlocksOverdueNode(t *testing.T) {
	dueAt := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			Status:          ProcessStatusActive,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		node: &ProcessNodeInstance{
			ID:                20,
			ProcessInstanceID: 10,
			NodeKey:           "prepare_engineering_data",
			NodeType:          ProcessNodeTypeHumanTask,
			Status:            ProcessNodeStatusActive,
			Version:           4,
			DueAt:             &dueAt,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})

	blockedNode, err := uc.EscalateDueProcessNode(context.Background(), &ProcessNodeDueAtEscalation{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       4,
		Now:                   dueAt.Add(time.Minute),
	}, 7)
	if err != nil {
		t.Fatalf("expected due_at escalation, got %v", err)
	}
	if blockedNode.Status != ProcessNodeStatusBlocked || blockedNode.Outcome == nil || *blockedNode.Outcome != "due_at_overdue" {
		t.Fatalf("expected due_at overdue blocked node, got %#v", blockedNode)
	}
	if processRepo.blockedNode == nil || processRepo.blockedNode.Reason != "due_at reached" || processRepo.blockedNode.Outcome != "due_at_overdue" {
		t.Fatalf("expected due_at block input, got %#v", processRepo.blockedNode)
	}
	if processRepo.blockedProcess == nil || processRepo.blockedProcess.ID != 10 {
		t.Fatalf("expected process blocked by due_at escalation, got %#v", processRepo.blockedProcess)
	}
}

func TestProcessRuntimeUsecaseEscalateDueProcessNodeRejectsBeforeDueAt(t *testing.T) {
	dueAt := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			Status:          ProcessStatusActive,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		node: &ProcessNodeInstance{
			ID:                20,
			ProcessInstanceID: 10,
			NodeKey:           "prepare_engineering_data",
			NodeType:          ProcessNodeTypeHumanTask,
			Status:            ProcessNodeStatusActive,
			Version:           4,
			DueAt:             &dueAt,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})

	_, err := uc.EscalateDueProcessNode(context.Background(), &ProcessNodeDueAtEscalation{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       4,
		Now:                   dueAt.Add(-time.Minute),
	}, 7)
	if !errors.Is(err, ErrProcessNodeDueAtNotReached) {
		t.Fatalf("expected due_at not reached error, got %v", err)
	}
	if processRepo.blockedNode != nil || processRepo.blockedProcess != nil {
		t.Fatalf("not-yet-due node must not be blocked")
	}
}

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectsBlockedNode(t *testing.T) {
	processID := 10
	nodeID := 20
	processRepo := &memProcessRuntimeRepo{
		node: &ProcessNodeInstance{
			ID:                nodeID,
			ProcessInstanceID: processID,
			NodeType:          ProcessNodeTypeHumanTask,
			Status:            ProcessNodeStatusBlocked,
			Version:           2,
		},
	}
	workflowRepo := &stubWorkflowRepo{
		currentTask: &WorkflowTask{
			ID:                    99,
			TaskStatusKey:         "done",
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CompleteLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 99,
	}, 7)
	if !errors.Is(err, ErrProcessNodeInstanceNotActive) {
		t.Fatalf("expected blocked node to reject completion as inactive, got %v", err)
	}
	if processRepo.completedNode != nil {
		t.Fatalf("blocked node must not be completed by linked workflow task")
	}
}
