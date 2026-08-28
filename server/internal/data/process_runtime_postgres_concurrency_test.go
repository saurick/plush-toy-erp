package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/workflowtask"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type postgresBarrierDomainCommandHandler struct {
	entered chan struct{}
	release chan struct{}
	calls   atomic.Int32
}

type postgresProcessClaimBarrierRepo struct {
	*processRuntimeRepo
	targetNodeID int
	entered      chan struct{}
	release      chan struct{}
}

type postgresProcessNodeCompletionBarrierRepo struct {
	*processRuntimeRepo
	targetNodeID int
	entered      chan struct{}
	release      chan struct{}
}

func (r *postgresProcessClaimBarrierRepo) ClaimProcessNodeDomainCommand(
	ctx context.Context,
	in *biz.ProcessNodeDomainCommandClaim,
) (*biz.ProcessNodeInstance, error) {
	if in != nil && in.ProcessNodeInstanceID == r.targetNodeID {
		select {
		case r.entered <- struct{}{}:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		select {
		case <-r.release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return r.processRuntimeRepo.ClaimProcessNodeDomainCommand(ctx, in)
}

func (r *postgresProcessNodeCompletionBarrierRepo) CompleteProcessNodeInstance(
	ctx context.Context,
	in *biz.ProcessNodeInstanceComplete,
	actorID int,
) (*biz.ProcessNodeInstance, error) {
	if in != nil && in.ID == r.targetNodeID {
		select {
		case r.entered <- struct{}{}:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		select {
		case <-r.release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return r.processRuntimeRepo.CompleteProcessNodeInstance(ctx, in, actorID)
}

type postgresFixedProcessOwnerResolver struct {
	revision string
	poolKey  string
	roleKey  string
}

func (r *postgresFixedProcessOwnerResolver) WorkflowCandidateOwnerRoleKeysAtRevision(
	_ context.Context,
	_, revision, ownerPoolKey string,
	requiredCapabilities ...string,
) (*biz.WorkflowTaskCandidateExplanation, error) {
	if revision != r.revision || ownerPoolKey != r.poolKey {
		return &biz.WorkflowTaskCandidateExplanation{
			ConfigRevision:       revision,
			OwnerPoolKey:         ownerPoolKey,
			RequiredCapabilities: requiredCapabilities,
			Source:               "postgres_test_owner_resolver",
		}, nil
	}
	return &biz.WorkflowTaskCandidateExplanation{
		ConfigRevision:         revision,
		OwnerPoolKey:           ownerPoolKey,
		RequiredCapabilities:   requiredCapabilities,
		CandidateOwnerRoleKeys: []string{r.roleKey},
		Source:                 "postgres_test_owner_resolver",
	}, nil
}

func (h *postgresBarrierDomainCommandHandler) ValidateProcessDomainCommand(context.Context, *biz.ProcessDomainCommandInput, int) error {
	return nil
}

func (h *postgresBarrierDomainCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, _ *biz.ProcessDomainCommandInput, _ int) (*biz.ProcessDomainCommandResult, error) {
	h.calls.Add(1)
	select {
	case h.entered <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	select {
	case <-h.release:
		return &biz.ProcessDomainCommandResult{Outcome: "claim_test.posted"}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func TestProcessRuntimePostgresConcurrentDomainCommandClaimHasOneIntent(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	repo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      "domain_command_claim_" + suffix,
		ProcessVersion:  "v1",
		ConfigRevision:  "claim-test-revision",
		DefinitionHash:  "sha256:claim-test-" + suffix,
		BusinessRefType: "claim_test",
		BusinessRefID:   workflowPostgresSourceID(),
		IdempotencyKey:  "claim-test/" + suffix,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{
			NodeKey: "post_fact", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1,
			Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": "claim_test.post"},
		}},
	}, 7)
	if err != nil {
		t.Fatalf("create process runtime claim fixture: %v", err)
	}
	nodes[0] = activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])

	fingerprints := []string{
		"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
	}
	start := make(chan struct{})
	errs := make(chan error, len(fingerprints))
	var wg sync.WaitGroup
	for _, fingerprint := range fingerprints {
		fingerprint := fingerprint
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, claimErr := repo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
				ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version,
				DomainCommandFingerprint: fingerprint,
			})
			errs <- claimErr
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	conflicts := 0
	for claimErr := range errs {
		switch {
		case claimErr == nil:
			successes++
		case errors.Is(claimErr, biz.ErrIdempotencyConflict):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent claim error: %v", claimErr)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("different concurrent intents must have one winner and one idempotency conflict, successes=%d conflicts=%d", successes, conflicts)
	}

	persisted, err := repo.GetProcessNodeInstance(ctx, nodes[0].ID)
	if err != nil {
		t.Fatalf("read claimed process node: %v", err)
	}
	if persisted.Status != biz.ProcessNodeStatusActive || persisted.Version != nodes[0].Version || persisted.DomainCommandFingerprint == nil {
		t.Fatalf("claim must keep the active node version while persisting one fingerprint, got %#v", persisted)
	}
	if *persisted.DomainCommandFingerprint != fingerprints[0] && *persisted.DomainCommandFingerprint != fingerprints[1] {
		t.Fatalf("unexpected winning fingerprint %q", *persisted.DomainCommandFingerprint)
	}
	sameStart := make(chan struct{})
	sameErrs := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-sameStart
			_, claimErr := repo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
				ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version,
				DomainCommandFingerprint: *persisted.DomainCommandFingerprint,
			})
			sameErrs <- claimErr
		}()
	}
	close(sameStart)
	wg.Wait()
	close(sameErrs)
	for claimErr := range sameErrs {
		if claimErr != nil {
			t.Fatalf("same concurrent fingerprint must remain replayable: %v", claimErr)
		}
	}
}

func TestProcessRuntimePostgresConcurrentSameIntentExecutionReconcilesOneTerminalResult(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	repo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      "domain_command_execute_" + suffix,
		ProcessVersion:  "v1",
		ConfigRevision:  "execute-test-revision",
		DefinitionHash:  "sha256:execute-test-" + suffix,
		BusinessRefType: "execute_test",
		BusinessRefID:   workflowPostgresSourceID(),
		IdempotencyKey:  "execute-test/" + suffix,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{
			NodeKey: "post_fact", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1,
			Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": "claim_test.post"},
		}},
	}, 7)
	if err != nil {
		t.Fatalf("create process runtime execution fixture: %v", err)
	}
	nodes[0] = activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	handler := &postgresBarrierDomainCommandHandler{
		entered: make(chan struct{}, 2),
		release: make(chan struct{}),
	}
	uc := biz.NewProcessRuntimeUsecase(repo, nil)
	if err := uc.RegisterDomainCommandHandler("claim_test.post", handler); err != nil {
		t.Fatalf("register process command handler: %v", err)
	}
	execution := &biz.ProcessDomainCommandExecution{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version,
		CommandKey: "claim_test.post", IdempotencyKey: "execute-same/" + suffix, Payload: map[string]any{"source_id": instance.BusinessRefID},
	}
	results := make(chan *biz.ProcessNodeInstance, 2)
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, executeErr := uc.ExecuteDomainCommandNode(ctx, execution, 7)
			results <- result
			errs <- executeErr
		}()
	}
	for range 2 {
		select {
		case <-handler.entered:
		case <-ctx.Done():
			t.Fatalf("both same-intent executions did not reach the handler: %v", ctx.Err())
		}
	}
	close(handler.release)
	wg.Wait()
	close(results)
	close(errs)
	for executeErr := range errs {
		if executeErr != nil {
			t.Fatalf("same-intent concurrent execution must reconcile, got %v", executeErr)
		}
	}
	for result := range results {
		if result == nil || result.Status != biz.ProcessNodeStatusCompleted || result.Outcome == nil || *result.Outcome != "claim_test.posted" {
			t.Fatalf("unexpected reconciled terminal result %#v", result)
		}
	}
	if handler.calls.Load() != 2 {
		t.Fatalf("test must cover concurrent handler replay, calls=%d", handler.calls.Load())
	}
	persisted, err := repo.GetProcessNodeInstance(ctx, nodes[0].ID)
	if err != nil {
		t.Fatalf("read settled process node: %v", err)
	}
	if persisted.Status != biz.ProcessNodeStatusCompleted || persisted.Version != nodes[0].Version+1 || persisted.DomainCommandFingerprint == nil {
		t.Fatalf("expected one persisted terminal transition, got %#v", persisted)
	}
	if persisted.DomainCommandProtocolVersion == nil || *persisted.DomainCommandProtocolVersion != biz.ProcessDomainCommandProtocolVersionCurrent ||
		persisted.DomainCommandResultState == nil || *persisted.DomainCommandResultState != biz.ProcessDomainCommandResultStateSucceeded ||
		persisted.DomainCommandResultHash == nil || persisted.DomainCommandResultRecordedAt == nil {
		t.Fatalf("same-intent concurrency must converge on one durable result, got %#v", persisted)
	}
}

func TestProcessRuntimePostgresConcurrentSalesActivationReusesWinnerAndRoutesReview(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	baseRepo := NewProcessRuntimeRepo(data, logger)
	workflowRepo := NewWorkflowRepo(data, logger)
	salesRepo := NewSalesOrderRepo(data, logger)
	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "SALES-CONCURRENT-U-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "SALES-CONCURRENT-P-"+suffix)
	customer := createSalesOrderTestCustomer(t, ctx, client, "SALES-CONCURRENT-C-"+suffix, true)
	quantity := decimal.RequireFromString("1.25")
	unitPrice := decimal.NewFromInt(1)
	order := client.SalesOrder.Create().
		SetOrderNo("SO-CONCURRENT-ACTIVATE-" + suffix).
		SetCustomerID(customer.ID).
		SetOrderDate(time.Now().UTC()).
		SetTaxMode(biz.SalesOrderTaxModeNone).
		SetFreightTerms(biz.SalesOrderFreightTermsExcluded).
		SetGoodsAmount(quantity).
		SetTaxAmount(decimal.Zero).
		SetOrderTotal(quantity).
		SetLifecycleStatus(biz.SalesOrderStatusSubmitted).
		SaveX(ctx)
	client.SalesOrderItem.Create().
		SetSalesOrderID(order.ID).
		SetLineNo(1).
		SetProductID(product.ID).
		SetUnitID(unit.ID).
		SetOrderedQuantity(quantity).
		SetUnitPrice(unitPrice).
		SetAmount(quantity).
		SaveX(ctx)
	revision := "sales-concurrent-activation-" + suffix
	ownerPool := "order_review"
	requiredCapability := biz.PermissionWorkflowTaskComplete
	instance, nodes, err := baseRepo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      biz.ProcessKeySalesOrderAcceptance,
		ProcessVersion:  "v1",
		ConfigRevision:  revision,
		DefinitionHash:  "sha256:sales-concurrent-activation-" + suffix,
		BusinessRefType: "sales_order",
		BusinessRefID:   order.ID,
		IdempotencyKey:  "sales-concurrent-activation/" + suffix,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey: "activate_sales_order", NodeType: biz.ProcessNodeTypeDomainCommand,
				Attempt: 1, Status: biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{"command_key": biz.ProcessDomainCommandSalesOrderActivate},
			},
			{
				NodeKey: "order_review", NodeType: biz.ProcessNodeTypeHumanTask,
				Attempt: 1, Status: biz.ProcessNodeStatusWaiting,
				OwnerPoolKey: &ownerPool, RequiredCapabilityKey: &requiredCapability,
			},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create sales activation process: %v", err)
	}
	activationNode := activateProcessNodeForTest(t, ctx, baseRepo, instance, nodes[0])
	barrierRepo := &postgresProcessClaimBarrierRepo{
		processRuntimeRepo: baseRepo,
		targetNodeID:       activationNode.ID,
		entered:            make(chan struct{}, 2),
		release:            make(chan struct{}),
	}
	runtimeUC := biz.NewProcessRuntimeUsecase(barrierRepo, workflowRepo, &postgresFixedProcessOwnerResolver{
		revision: revision, poolKey: ownerPool, roleKey: biz.PMCRoleKey,
	})
	if err := biz.RegisterSalesOrderProcessDomainCommandHandlers(runtimeUC, biz.NewSalesOrderUsecase(salesRepo)); err != nil {
		t.Fatalf("register sales process commands: %v", err)
	}

	results := make(chan *biz.ProcessNodeInstance, 2)
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, executeErr := runtimeUC.ExecuteDomainCommandNode(ctx, &biz.ProcessDomainCommandExecution{
				ProcessInstanceID: instance.ID, ProcessNodeInstanceID: activationNode.ID,
				ExpectedVersion: activationNode.Version, CommandKey: biz.ProcessDomainCommandSalesOrderActivate,
				IdempotencyKey: "sales-concurrent-activation/execute/" + suffix,
				Payload:        map[string]any{"sales_order_id": order.ID},
			}, 7)
			results <- result
			errs <- executeErr
		}()
	}
	for range 2 {
		select {
		case <-barrierRepo.entered:
		case <-ctx.Done():
			t.Fatalf("both sales activation attempts did not reach claim: %v", ctx.Err())
		}
	}
	close(barrierRepo.release)
	wg.Wait()
	close(results)
	close(errs)
	for executeErr := range errs {
		if executeErr != nil {
			t.Fatalf("same-intent sales activation must reuse the durable winner: %v", executeErr)
		}
	}
	for result := range results {
		if result == nil || result.Status != biz.ProcessNodeStatusCompleted || result.Outcome == nil ||
			*result.Outcome != biz.SalesOrderProcessCommandOutcomeActivated {
			t.Fatalf("unexpected reconciled sales activation %#v", result)
		}
	}
	storedOrder := client.SalesOrder.GetX(ctx, order.ID)
	if storedOrder.LifecycleStatus != biz.SalesOrderStatusActive || storedOrder.Version != order.Version+1 {
		t.Fatalf("sales activation must mutate the source exactly once, got status=%s version=%d", storedOrder.LifecycleStatus, storedOrder.Version)
	}
	storedActivation := client.ProcessNodeInstance.GetX(ctx, activationNode.ID)
	if storedActivation.Status != biz.ProcessNodeStatusCompleted || storedActivation.RoutingCompletedAt == nil ||
		storedActivation.DomainCommandResultHash == nil {
		t.Fatalf("activation receipt must be terminal and routed, got %#v", storedActivation)
	}
	storedReview := client.ProcessNodeInstance.GetX(ctx, nodes[1].ID)
	if storedReview.Status != biz.ProcessNodeStatusActive {
		t.Fatalf("order review node must be active, got %#v", storedReview)
	}
	tasks := client.WorkflowTask.Query().Where(workflowtask.ProcessNodeInstanceID(nodes[1].ID)).AllX(ctx)
	if len(tasks) != 1 || tasks[0].TaskStatusKey != "ready" || tasks[0].OwnerRoleKey != biz.PMCRoleKey {
		t.Fatalf("order review must have one ready PMC task, got %#v", tasks)
	}
}

func TestProcessRuntimePostgresConcurrentTerminalWorkflowTaskReconcilesOneCompletionAndRoute(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	baseRepo := NewProcessRuntimeRepo(data, logger)
	workflowRepo := NewWorkflowRepo(data, logger)
	suffix := postgresTestSuffix()
	ownerPool := "order_review"
	requiredCapability := biz.PermissionWorkflowTaskComplete
	revision := "workflow-completion-concurrency-" + suffix
	instance, nodes, err := baseRepo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      "workflow_completion_concurrency_" + suffix,
		ProcessVersion:  "v1",
		ConfigRevision:  revision,
		DefinitionHash:  "sha256:workflow-completion-concurrency-" + suffix,
		BusinessRefType: "sales_order",
		BusinessRefID:   workflowPostgresSourceID(),
		IdempotencyKey:  "workflow-completion-concurrency/" + suffix,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey: "order_approval", NodeType: biz.ProcessNodeTypeApproval,
				Attempt: 1, Status: biz.ProcessNodeStatusWaiting,
			},
			{
				NodeKey: "order_review", NodeType: biz.ProcessNodeTypeHumanTask,
				Attempt: 1, Status: biz.ProcessNodeStatusWaiting,
				OwnerPoolKey: &ownerPool, RequiredCapabilityKey: &requiredCapability,
			},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create concurrent workflow completion process: %v", err)
	}
	approvalNode := activateProcessNodeForTest(t, ctx, baseRepo, instance, nodes[0])
	now := time.Now().UTC()
	task := client.WorkflowTask.Create().
		SetTaskCode("WF-CONCURRENT-COMPLETE-" + suffix).
		SetTaskGroup("process_runtime").
		SetTaskName("并发流程完成测试").
		SetSourceType("sales_order").
		SetSourceID(instance.BusinessRefID).
		SetTaskStatusKey("done").
		SetOwnerRoleKey(biz.BossRoleKey).
		SetProcessInstanceID(instance.ID).
		SetProcessNodeInstanceID(approvalNode.ID).
		SetCompletedAt(now).
		SetCreatedBy(7).
		SetUpdatedBy(7).
		SaveX(ctx)
	barrierRepo := &postgresProcessNodeCompletionBarrierRepo{
		processRuntimeRepo: baseRepo,
		targetNodeID:       approvalNode.ID,
		entered:            make(chan struct{}, 2),
		release:            make(chan struct{}),
	}
	runtimeUC := biz.NewProcessRuntimeUsecase(barrierRepo, workflowRepo, &postgresFixedProcessOwnerResolver{
		revision: revision, poolKey: ownerPool, roleKey: biz.PMCRoleKey,
	})

	results := make(chan *biz.ProcessNodeInstance, 2)
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, completeErr := runtimeUC.CompleteLinkedWorkflowTask(ctx, &biz.ProcessLinkedWorkflowTaskCompletion{
				WorkflowTaskID: task.ID,
			}, 7)
			results <- result
			errs <- completeErr
		}()
	}
	for range 2 {
		select {
		case <-barrierRepo.entered:
		case <-ctx.Done():
			t.Fatalf("both terminal task settlements did not reach node completion: %v", ctx.Err())
		}
	}
	close(barrierRepo.release)
	wg.Wait()
	close(results)
	close(errs)
	for completeErr := range errs {
		if completeErr != nil {
			t.Fatalf("concurrent terminal task settlement must reconcile: %v", completeErr)
		}
	}
	for result := range results {
		if result == nil || result.Status != biz.ProcessNodeStatusCompleted || result.Version != approvalNode.Version+1 {
			t.Fatalf("unexpected reconciled workflow node %#v", result)
		}
	}
	storedApproval := client.ProcessNodeInstance.GetX(ctx, approvalNode.ID)
	if storedApproval.Status != biz.ProcessNodeStatusCompleted || storedApproval.RoutingCompletedAt == nil ||
		storedApproval.Version != approvalNode.Version+1 {
		t.Fatalf("terminal workflow task must complete and route once, got %#v", storedApproval)
	}
	storedReview := client.ProcessNodeInstance.GetX(ctx, nodes[1].ID)
	if storedReview.Status != biz.ProcessNodeStatusActive || storedReview.Version != nodes[1].Version+1 {
		t.Fatalf("concurrent completion must activate the review node once, got %#v", storedReview)
	}
	tasks := client.WorkflowTask.Query().Where(workflowtask.ProcessNodeInstanceID(nodes[1].ID)).AllX(ctx)
	if len(tasks) != 1 || tasks[0].TaskStatusKey != "ready" || tasks[0].OwnerRoleKey != biz.PMCRoleKey {
		t.Fatalf("concurrent completion must create one downstream PMC task, got %#v", tasks)
	}
}

func TestProcessRuntimePostgresConcurrentLinkedBusinessRefsAreNotLost(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	repo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	instance, _, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      "linked_ref_cas_" + suffix,
		ProcessVersion:  "v1",
		ConfigRevision:  "linked-ref-test-revision",
		DefinitionHash:  "sha256:linked-ref-test-" + suffix,
		BusinessRefType: "linked_ref_test",
		BusinessRefID:   workflowPostgresSourceID(),
		IdempotencyKey:  "linked-ref-test/" + suffix,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{
			NodeKey: "end", NodeType: biz.ProcessNodeTypeEnd, Attempt: 1,
			Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{},
		}},
	}, 7)
	if err != nil {
		t.Fatalf("create linked ref fixture: %v", err)
	}

	refs := []*biz.ProcessInstanceLinkedBusinessRefRecord{
		{ProcessInstanceID: instance.ID, RefType: "shipment", RefID: workflowPostgresSourceID(), SourceNodeKey: "ship", SourceCommandKey: "shipment.ship"},
		{ProcessInstanceID: instance.ID, RefType: "finance_fact", RefID: workflowPostgresSourceID() + 1, SourceNodeKey: "receivable", SourceCommandKey: "finance.receivable_lead"},
	}
	start := make(chan struct{})
	errs := make(chan error, len(refs))
	var wg sync.WaitGroup
	for _, ref := range refs {
		ref := ref
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, recordErr := repo.RecordProcessInstanceLinkedBusinessRef(ctx, ref, 7)
			errs <- recordErr
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	for recordErr := range errs {
		if recordErr != nil {
			t.Fatalf("record concurrent linked ref: %v", recordErr)
		}
	}

	persisted, err := repo.GetProcessInstance(ctx, instance.ID)
	if err != nil {
		t.Fatalf("read linked ref fixture: %v", err)
	}
	items, ok := persisted.ModuleContractSnapshot["linked_business_refs"].([]any)
	if !ok || len(items) != len(refs) {
		t.Fatalf("all concurrent linked refs must survive, got %#v", persisted.ModuleContractSnapshot["linked_business_refs"])
	}
	wants := map[string]bool{"shipment": false, "finance_fact": false}
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			t.Fatalf("unexpected linked ref payload %#v", raw)
		}
		refType, _ := item["ref_type"].(string)
		if _, exists := wants[refType]; exists {
			wants[refType] = true
		}
	}
	for refType, found := range wants {
		if !found {
			t.Fatalf("missing concurrent linked ref %q in %#v", refType, items)
		}
	}
}

func TestProcessRuntimePostgresAtomicBlockRollsBackNodeWhenProcessSettled(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      "atomic_block_rollback_" + suffix,
		ProcessVersion:  "v1",
		ConfigRevision:  "atomic-block-revision",
		DefinitionHash:  "sha256:atomic-block-" + suffix,
		BusinessRefType: "atomic_block_test",
		BusinessRefID:   workflowPostgresSourceID(),
		IdempotencyKey:  "atomic-block/" + suffix,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{
			NodeKey: "human_review", NodeType: biz.ProcessNodeTypeHumanTask, Attempt: 1,
			Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{},
		}},
	}, 7)
	if err != nil {
		t.Fatalf("create atomic block fixture: %v", err)
	}
	activeNode := activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	// Build the concurrent stale-state fixture below the guarded repository API:
	// CompleteProcessInstance now correctly refuses to settle while a node is
	// active, but BlockProcessNodeAndInstance must still roll back if another
	// writer has already settled the process between reads.
	if err := client.ProcessInstance.UpdateOneID(instance.ID).
		SetStatus(biz.ProcessStatusCompleted).
		SetCompletedAt(time.Now().UTC()).
		Exec(ctx); err != nil {
		t.Fatalf("settle process fixture before atomic block: %v", err)
	}

	if _, err := repo.BlockProcessNodeAndInstance(ctx, &biz.ProcessNodeInstanceBlock{
		ProcessInstanceID:     instance.ID,
		ProcessNodeInstanceID: activeNode.ID,
		ExpectedVersion:       activeNode.Version,
		BlockKind:             biz.ProcessBlockKindManual,
		ReasonCode:            "process_node_blocked",
		Reason:                "must roll back",
		Outcome:               "blocked",
	}, 7); !errors.Is(err, biz.ErrProcessInstanceSettled) {
		t.Fatalf("atomic block against settled process must fail: %v", err)
	}

	persistedNode, err := repo.GetProcessNodeInstance(ctx, activeNode.ID)
	if err != nil {
		t.Fatalf("reload process node after rollback: %v", err)
	}
	persistedProcess, err := repo.GetProcessInstance(ctx, instance.ID)
	if err != nil {
		t.Fatalf("reload process after rollback: %v", err)
	}
	if persistedNode.Status != biz.ProcessNodeStatusActive || persistedNode.Version != activeNode.Version || persistedNode.Outcome != nil {
		t.Fatalf("PostgreSQL transaction did not roll back node mutation: before=%#v after=%#v", activeNode, persistedNode)
	}
	if persistedProcess.Status != biz.ProcessStatusCompleted {
		t.Fatalf("settled process status changed during failed block: %#v", persistedProcess)
	}
}
