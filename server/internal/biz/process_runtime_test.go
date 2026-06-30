package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

type memProcessRuntimeRepo struct {
	created          *ProcessInstanceCreate
	process          *ProcessInstance
	node             *ProcessNodeInstance
	nodes            []*ProcessNodeInstance
	completedNode    *ProcessNodeInstanceComplete
	completedNodes   []*ProcessNodeInstanceComplete
	completedProcess *ProcessInstanceComplete
	linkedRef        *ProcessInstanceLinkedBusinessRefRecord
	blockedNode      *ProcessNodeInstanceBlock
	blockedProcess   *ProcessInstanceBlock
	activatedNode    *ProcessNodeInstanceActivate
	createdAttempt   *ProcessNodeInstanceAttemptCreate
}

type stubProcessOwnerRoleResolver struct {
	explanation *WorkflowTaskCandidateExplanation
	err         error
}

type stubProcessDomainCommandHandler struct {
	input  *ProcessDomainCommandInput
	result *ProcessDomainCommandResult
	err    error
	calls  int
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

func processTestIntPtr(value int) *int {
	return &value
}

func (s *recordingWorkflowRepo) CreateWorkflowTask(ctx context.Context, in *WorkflowTaskCreate, actorID int) (*WorkflowTask, error) {
	s.createTaskInputs = append(s.createTaskInputs, in)
	return s.stubWorkflowRepo.CreateWorkflowTask(ctx, in, actorID)
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

func (r *memProcessRuntimeRepo) CompleteProcessNodeInstance(ctx context.Context, in *ProcessNodeInstanceComplete, actorID int) (*ProcessNodeInstance, error) {
	r.completedNode = in
	r.completedNodes = append(r.completedNodes, in)
	for index, node := range r.nodes {
		if node == nil || node.ID != in.ID {
			continue
		}
		if node.Version != in.ExpectedVersion {
			return nil, ErrProcessNodeInstanceConflict
		}
		out := *node
		out.Status = ProcessNodeStatusCompleted
		out.Outcome = &in.Outcome
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
	out := *r.node
	out.Status = ProcessNodeStatusCompleted
	out.Outcome = &in.Outcome
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
		out := *node
		out.Status = ProcessNodeStatusBlocked
		out.Outcome = &in.Outcome
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
	out := *r.node
	out.Status = ProcessNodeStatusBlocked
	out.Outcome = &in.Outcome
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

func TestProcessRuntimeUsecaseStartProcessInstanceRejectsNonWaitingFirstNode(t *testing.T) {
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
				Status:            ProcessNodeStatusActive,
				Version:           1,
			},
		},
	}
	uc := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})

	_, err := uc.StartProcessInstance(context.Background(), &ProcessInstanceStart{
		ID: 10,
	}, 7)
	if !errors.Is(err, ErrProcessNodeInstanceConflict) {
		t.Fatalf("expected non-waiting first node conflict, got %v", err)
	}
	if processRepo.activatedNode != nil {
		t.Fatalf("non-waiting first node must not be re-activated")
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

func TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectsSettledNode(t *testing.T) {
	processID := 10
	nodeID := 20
	processRepo := &memProcessRuntimeRepo{
		node: &ProcessNodeInstance{
			ID:                nodeID,
			ProcessInstanceID: processID,
			NodeType:          ProcessNodeTypeHumanTask,
			Status:            ProcessNodeStatusCompleted,
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
