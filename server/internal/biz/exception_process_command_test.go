package biz

import (
	"context"
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestExceptionApprovalBranchPolicyHandlers(t *testing.T) {
	t.Parallel()
	approval := approvalOutcomeBranchPolicyHandler{
		approveNodeKey: "approve_source",
		rejectNodeKey:  "reject_source",
	}
	for _, testCase := range []struct {
		name    string
		input   *ProcessBranchPolicyInput
		want    string
		wantErr error
	}{
		{name: "approved", input: &ProcessBranchPolicyInput{Outcome: "approved"}, want: "approve_source"},
		{name: "confirmed", input: &ProcessBranchPolicyInput{Outcome: "confirmed"}, want: "approve_source"},
		{name: "default approved", input: &ProcessBranchPolicyInput{}, want: "approve_source"},
		{name: "rejected", input: &ProcessBranchPolicyInput{Outcome: "rejected", Reason: "资料不完整"}, want: "reject_source"},
		{name: "rejected without reason", input: &ProcessBranchPolicyInput{Outcome: "rejected"}, wantErr: ErrBadParam},
		{name: "unknown", input: &ProcessBranchPolicyInput{Outcome: "skipped"}, wantErr: ErrBadParam},
		{name: "missing input", input: nil, wantErr: ErrBadParam},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			result, err := approval.ResolveProcessBranch(context.Background(), testCase.input, 7)
			if !errors.Is(err, testCase.wantErr) {
				t.Fatalf("error=%v, want=%v", err, testCase.wantErr)
			}
			if testCase.wantErr == nil && (result == nil || result.NextNodeKey != testCase.want) {
				t.Fatalf("result=%#v, want next node %q", result, testCase.want)
			}
		})
	}

	production := productionExceptionExecutionBranchPolicyHandler{}
	for _, testCase := range []struct {
		outcome string
		want    string
		wantErr error
	}{
		{outcome: ProductionExceptionProcessCommandOutcomeApprovedOverIssue, want: "over_issue_end"},
		{outcome: ProductionExceptionProcessCommandOutcomeApprovedWIP, want: "production_exception_execution"},
		{outcome: ProductionExceptionProcessCommandOutcomeRejected, wantErr: ErrBadParam},
	} {
		result, err := production.ResolveProcessBranch(
			context.Background(),
			&ProcessBranchPolicyInput{Outcome: testCase.outcome},
			7,
		)
		if !errors.Is(err, testCase.wantErr) {
			t.Fatalf("outcome=%q error=%v, want=%v", testCase.outcome, err, testCase.wantErr)
		}
		if testCase.wantErr == nil && (result == nil || result.NextNodeKey != testCase.want) {
			t.Fatalf("outcome=%q result=%#v, want=%q", testCase.outcome, result, testCase.want)
		}
	}
}

func TestSalesReturnProcessCommandHandlersFailClosedAndExecute(t *testing.T) {
	t.Parallel()
	repo := &exceptionOperationalFactRepoStub{
		salesReturn: &SalesReturn{ID: 41, Status: SalesReturnStatusDraft, CreatedBy: 5},
	}
	uc := NewOperationalFactUsecase(repo)
	approve := &salesReturnProcessCommandHandler{uc: uc, commandKey: ProcessDomainCommandSalesReturnApprove}
	input := exceptionProcessCommandInput(
		ProcessDomainCommandSalesReturnApprove,
		salesReturnProcessBusinessRefType,
		41,
		map[string]any{salesReturnProcessPayloadID: 41, processDecisionPayloadReason: "同意客户退货"},
	)
	result, err := approve.ExecuteProcessDomainCommand(context.Background(), input, 7)
	if err != nil || result.Outcome != SalesReturnProcessCommandOutcomeApproved ||
		repo.salesReturnMutation == nil || repo.salesReturnMutation.actorID != 7 ||
		repo.salesReturnMutation.reason != "同意客户退货" {
		t.Fatalf("result=%#v mutation=%#v err=%v", result, repo.salesReturnMutation, err)
	}

	for _, mutate := range []func(*ProcessDomainCommandInput){
		func(in *ProcessDomainCommandInput) { in.ProcessInstance.BusinessRefID++ },
		func(in *ProcessDomainCommandInput) { in.Payload["status"] = "APPROVED" },
		func(in *ProcessDomainCommandInput) { in.Payload[processDecisionPayloadReason] = "" },
	} {
		invalid := cloneExceptionProcessCommandInput(input)
		mutate(invalid)
		if _, err := approve.ExecuteProcessDomainCommand(context.Background(), invalid, 7); !errors.Is(err, ErrBadParam) {
			t.Fatalf("invalid sales return command error=%v", err)
		}
	}
	if _, err := approve.ExecuteProcessDomainCommand(context.Background(), input, 5); !errors.Is(err, ErrBadParam) {
		t.Fatalf("requester self approval error=%v", err)
	}

	repo.salesReturn = &SalesReturn{ID: 41, Status: SalesReturnStatusApproved, CreatedBy: 5}
	receive := &salesReturnProcessCommandHandler{uc: uc, commandKey: ProcessDomainCommandSalesReturnReceive}
	receiveInput := exceptionProcessCommandInput(
		ProcessDomainCommandSalesReturnReceive,
		salesReturnProcessBusinessRefType,
		41,
		map[string]any{salesReturnProcessPayloadID: 41},
	)
	result, err = receive.ExecuteProcessDomainCommand(context.Background(), receiveInput, 9)
	if err != nil || result.Outcome != SalesReturnProcessCommandOutcomeReceived ||
		repo.salesReturnMutation == nil || repo.salesReturnMutation.commandKey != ProcessDomainCommandSalesReturnReceive {
		t.Fatalf("receive result=%#v mutation=%#v err=%v", result, repo.salesReturnMutation, err)
	}
}

func TestFinancePaymentProcessCommandHandlersCanonicalizeAndExecute(t *testing.T) {
	t.Parallel()
	repo := &exceptionOperationalFactRepoStub{
		financePayment: &FinancePayment{
			ID: 51, Status: FinancePaymentStatusApproved, CreatedBy: 5,
			Amount: decimal.RequireFromString("10"),
		},
	}
	uc := NewOperationalFactUsecase(repo)
	post := &financePaymentProcessCommandHandler{uc: uc, commandKey: ProcessDomainCommandFinancePaymentPost}
	rawPayload := map[string]any{
		financePaymentProcessPayloadID: 51,
		financePaymentProcessPayloadAllocations: []any{
			map[string]any{"finance_fact_id": 12, "amount": "6.000000"},
			map[string]any{"finance_fact_id": 11, "amount": "4.0"},
		},
	}
	normalized, err := post.NormalizeProcessDomainCommandPayload(rawPayload)
	if err != nil {
		t.Fatalf("normalize allocations: %v", err)
	}
	allocations := normalized[financePaymentProcessPayloadAllocations].([]any)
	if allocations[0].(map[string]any)["finance_fact_id"] != 11 ||
		allocations[0].(map[string]any)["amount"] != "4" ||
		allocations[1].(map[string]any)["finance_fact_id"] != 12 ||
		allocations[1].(map[string]any)["amount"] != "6" {
		t.Fatalf("normalized allocations=%#v", allocations)
	}
	for _, amount := range []string{
		"1e1",
		"1.0000000",
		"100000000000000",
		"0",
		"-1",
	} {
		_, normalizeErr := post.NormalizeProcessDomainCommandPayload(map[string]any{
			financePaymentProcessPayloadID: 51,
			financePaymentProcessPayloadAllocations: []any{
				map[string]any{"finance_fact_id": 11, "amount": amount},
			},
		})
		if !errors.Is(normalizeErr, ErrBadParam) {
			t.Fatalf("normalize allocation amount %q error=%v, want ErrBadParam", amount, normalizeErr)
		}
	}
	input := exceptionProcessCommandInput(
		ProcessDomainCommandFinancePaymentPost,
		financePaymentProcessBusinessRefType,
		51,
		normalized,
	)
	result, err := post.ExecuteProcessDomainCommand(context.Background(), input, 8)
	if err != nil || result.Outcome != FinancePaymentProcessCommandOutcomePosted ||
		repo.financePaymentPost == nil || len(repo.financePaymentPost.Allocations) != 2 {
		t.Fatalf("result=%#v post=%#v err=%v", result, repo.financePaymentPost, err)
	}

	for _, payload := range []map[string]any{
		{
			financePaymentProcessPayloadID: 51,
			financePaymentProcessPayloadAllocations: []any{
				map[string]any{"finance_fact_id": 11, "amount": "9"},
			},
		},
		{
			financePaymentProcessPayloadID: 51,
			financePaymentProcessPayloadAllocations: []any{
				map[string]any{"finance_fact_id": 11, "amount": "5"},
				map[string]any{"finance_fact_id": 11, "amount": "5"},
			},
		},
	} {
		invalid := exceptionProcessCommandInput(
			ProcessDomainCommandFinancePaymentPost,
			financePaymentProcessBusinessRefType,
			51,
			payload,
		)
		if _, err := post.ExecuteProcessDomainCommand(context.Background(), invalid, 8); !errors.Is(err, ErrBadParam) {
			t.Fatalf("invalid finance allocation error=%v", err)
		}
	}
}

func TestInventoryAdjustmentProcessCommandHandlersEnforceOwnerAndState(t *testing.T) {
	t.Parallel()
	repo := &exceptionInventoryRepoStub{
		operation: &InventoryOperation{
			ID: 61, OperationType: InventoryOperationManualAdjustment,
			Status: InventoryOperationStatusDraft, CreatedBy: 7,
		},
	}
	uc := NewInventoryUsecase(repo)
	submit := &inventoryAdjustmentProcessCommandHandler{uc: uc, commandKey: ProcessDomainCommandInventoryAdjustmentSubmit}
	input := exceptionProcessCommandInput(
		ProcessDomainCommandInventoryAdjustmentSubmit,
		inventoryAdjustmentProcessBusinessRefType,
		61,
		map[string]any{inventoryAdjustmentProcessPayloadID: 61},
	)
	result, err := submit.ExecuteProcessDomainCommand(context.Background(), input, 7)
	if err != nil || result.Outcome != InventoryAdjustmentProcessCommandOutcomeSubmitted ||
		repo.mutation == nil || repo.mutation.commandKey != ProcessDomainCommandInventoryAdjustmentSubmit {
		t.Fatalf("submit result=%#v mutation=%#v err=%v", result, repo.mutation, err)
	}
	if _, err := submit.ExecuteProcessDomainCommand(context.Background(), input, 8); !errors.Is(err, ErrBadParam) {
		t.Fatalf("non-owner submit error=%v", err)
	}

	repo.operation = &InventoryOperation{
		ID: 61, OperationType: InventoryOperationManualAdjustment,
		Status: InventoryOperationStatusSubmitted, CreatedBy: 7,
	}
	approve := &inventoryAdjustmentProcessCommandHandler{uc: uc, commandKey: ProcessDomainCommandInventoryAdjustmentApprove}
	approveInput := exceptionProcessCommandInput(
		ProcessDomainCommandInventoryAdjustmentApprove,
		inventoryAdjustmentProcessBusinessRefType,
		61,
		map[string]any{inventoryAdjustmentProcessPayloadID: 61, processDecisionPayloadReason: "盘点差异证据完整"},
	)
	result, err = approve.ExecuteProcessDomainCommand(context.Background(), approveInput, 8)
	if err != nil || result.Outcome != InventoryAdjustmentProcessCommandOutcomeApproved {
		t.Fatalf("approve result=%#v err=%v", result, err)
	}
	if _, err := approve.ExecuteProcessDomainCommand(context.Background(), approveInput, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("creator self approval error=%v", err)
	}
}

func TestProductionExceptionProcessCommandHandlersRouteExactDecision(t *testing.T) {
	t.Parallel()
	repo := &exceptionOperationalFactRepoStub{
		productionException: &ProductionExceptionDecision{
			ID: 71, DecisionType: ProductionExceptionWIPConcession,
			Status: ProductionExceptionSubmitted, ExecutionStatus: ProductionExceptionExecutionPending,
			RequestedBy: 5, RequestedQuantity: decimal.RequireFromString("3"),
		},
	}
	uc := NewOperationalFactUsecase(repo)
	approve := &productionExceptionProcessCommandHandler{uc: uc, commandKey: ProcessDomainCommandProductionExceptionApprove}
	input := exceptionProcessCommandInput(
		ProcessDomainCommandProductionExceptionApprove,
		productionExceptionProcessBusinessRefType,
		71,
		map[string]any{
			productionExceptionProcessPayloadID:               71,
			processDecisionPayloadReason:                      "让步数量与不合格数量一致",
			productionExceptionProcessPayloadApprovedQuantity: "3.000000",
		},
	)
	normalized, err := approve.NormalizeProcessDomainCommandPayload(input.Payload)
	if err != nil || normalized[productionExceptionProcessPayloadApprovedQuantity] != "3" {
		t.Fatalf("normalized=%#v err=%v", normalized, err)
	}
	input.Payload = normalized
	result, err := approve.ExecuteProcessDomainCommand(context.Background(), input, 8)
	if err != nil || result.Outcome != ProductionExceptionProcessCommandOutcomeApprovedWIP ||
		repo.productionMutation == nil || repo.productionMutation.ApprovedQuantity == nil ||
		!repo.productionMutation.ApprovedQuantity.Equal(decimal.RequireFromString("3")) {
		t.Fatalf("result=%#v mutation=%#v err=%v", result, repo.productionMutation, err)
	}
	if _, err := approve.ExecuteProcessDomainCommand(context.Background(), input, 5); !errors.Is(err, ErrBadParam) {
		t.Fatalf("requester self approval error=%v", err)
	}

	repo.productionException = &ProductionExceptionDecision{
		ID: 72, DecisionType: ProductionExceptionOverIssue,
		Status: ProductionExceptionSubmitted, ExecutionStatus: ProductionExceptionExecutionPending,
		RequestedBy: 5, RequestedQuantity: decimal.RequireFromString("5"),
	}
	overIssueInput := exceptionProcessCommandInput(
		ProcessDomainCommandProductionExceptionApprove,
		productionExceptionProcessBusinessRefType,
		72,
		map[string]any{
			productionExceptionProcessPayloadID:               72,
			processDecisionPayloadReason:                      "批准部分超领额度",
			productionExceptionProcessPayloadApprovedQuantity: "2",
		},
	)
	result, err = approve.ExecuteProcessDomainCommand(context.Background(), overIssueInput, 8)
	if err != nil || result.Outcome != ProductionExceptionProcessCommandOutcomeApprovedOverIssue {
		t.Fatalf("over-issue result=%#v err=%v", result, err)
	}
}

type exceptionProcessMutation struct {
	commandKey string
	actorID    int
	reason     string
}

type exceptionOperationalFactRepoStub struct {
	OperationalFactRepo
	SalesReturnRepo
	FinancePaymentRepo
	ProductionExceptionDecisionRepo
	ProductionExceptionExecutionRepo

	salesReturn         *SalesReturn
	financePayment      *FinancePayment
	productionException *ProductionExceptionDecision
	salesReturnMutation *exceptionProcessMutation
	financePaymentPost  *FinancePaymentPost
	productionMutation  *ProductionExceptionMutation
}

func (r *exceptionOperationalFactRepoStub) GetSalesReturn(_ context.Context, id int) (*SalesReturn, error) {
	if r.salesReturn == nil || r.salesReturn.ID != id {
		return nil, ErrBadParam
	}
	copy := *r.salesReturn
	return &copy, nil
}

func (r *exceptionOperationalFactRepoStub) ApproveSalesReturnForProcessCommand(
	_ context.Context,
	_ int,
	command *ProcessDomainCommandInput,
	_ *ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*SalesReturn, error) {
	r.salesReturnMutation = &exceptionProcessMutation{commandKey: command.CommandKey, actorID: actorID, reason: reason}
	return r.GetSalesReturn(context.Background(), r.salesReturn.ID)
}

func (r *exceptionOperationalFactRepoStub) RejectSalesReturnForProcessCommand(
	ctx context.Context,
	id int,
	command *ProcessDomainCommandInput,
	result *ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*SalesReturn, error) {
	return r.ApproveSalesReturnForProcessCommand(ctx, id, command, result, actorID, reason)
}

func (r *exceptionOperationalFactRepoStub) ReceiveSalesReturnForProcessCommand(
	_ context.Context,
	_ int,
	command *ProcessDomainCommandInput,
	_ *ProcessDomainCommandResult,
	actorID int,
) (*SalesReturn, error) {
	r.salesReturnMutation = &exceptionProcessMutation{commandKey: command.CommandKey, actorID: actorID}
	return r.GetSalesReturn(context.Background(), r.salesReturn.ID)
}

func (r *exceptionOperationalFactRepoStub) GetFinancePayment(_ context.Context, id int) (*FinancePayment, error) {
	if r.financePayment == nil || r.financePayment.ID != id {
		return nil, ErrBadParam
	}
	copy := *r.financePayment
	return &copy, nil
}

func (r *exceptionOperationalFactRepoStub) ApproveFinancePaymentForProcessCommand(
	_ context.Context,
	_ int,
	_ *ProcessDomainCommandInput,
	_ *ProcessDomainCommandResult,
	_ int,
	_ string,
) (*FinancePayment, error) {
	return r.GetFinancePayment(context.Background(), r.financePayment.ID)
}

func (r *exceptionOperationalFactRepoStub) RejectFinancePaymentForProcessCommand(
	ctx context.Context,
	id int,
	command *ProcessDomainCommandInput,
	result *ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*FinancePayment, error) {
	return r.ApproveFinancePaymentForProcessCommand(ctx, id, command, result, actorID, reason)
}

func (r *exceptionOperationalFactRepoStub) PostFinancePaymentForProcessCommand(
	_ context.Context,
	in *FinancePaymentPost,
	_ *ProcessDomainCommandInput,
	_ *ProcessDomainCommandResult,
	_ int,
) (*FinancePayment, error) {
	copy := *in
	copy.Allocations = append([]FinancePaymentAllocationInput(nil), in.Allocations...)
	r.financePaymentPost = &copy
	return r.GetFinancePayment(context.Background(), r.financePayment.ID)
}

func (r *exceptionOperationalFactRepoStub) GetProductionException(_ context.Context, id int) (*ProductionExceptionDecision, error) {
	if r.productionException == nil || r.productionException.ID != id {
		return nil, ErrProductionExceptionNotFound
	}
	copy := *r.productionException
	return &copy, nil
}

func (r *exceptionOperationalFactRepoStub) ApproveProductionExceptionForProcessCommand(
	_ context.Context,
	in *ProductionExceptionMutation,
	_ *ProcessDomainCommandInput,
	_ *ProcessDomainCommandResult,
) (*ProductionExceptionDecision, error) {
	copy := *in
	r.productionMutation = &copy
	return r.GetProductionException(context.Background(), r.productionException.ID)
}

func (r *exceptionOperationalFactRepoStub) RejectProductionExceptionForProcessCommand(
	ctx context.Context,
	in *ProductionExceptionMutation,
	command *ProcessDomainCommandInput,
	result *ProcessDomainCommandResult,
) (*ProductionExceptionDecision, error) {
	return r.ApproveProductionExceptionForProcessCommand(ctx, in, command, result)
}

func (r *exceptionOperationalFactRepoStub) ExecuteProductionExceptionForProcessCommand(
	ctx context.Context,
	in *ProductionExceptionMutation,
	command *ProcessDomainCommandInput,
	result *ProcessDomainCommandResult,
) (*ProductionExceptionDecision, error) {
	return r.ApproveProductionExceptionForProcessCommand(ctx, in, command, result)
}

type exceptionInventoryRepoStub struct {
	InventoryRepo
	InventoryOperationRepo

	operation *InventoryOperation
	mutation  *exceptionProcessMutation
}

func (r *exceptionInventoryRepoStub) GetInventoryOperation(_ context.Context, id int) (*InventoryOperation, error) {
	if r.operation == nil || r.operation.ID != id {
		return nil, ErrInventoryOperationNotFound
	}
	copy := *r.operation
	return &copy, nil
}

func (r *exceptionInventoryRepoStub) record(
	command *ProcessDomainCommandInput,
	actorID int,
	reason string,
) (*InventoryOperation, error) {
	r.mutation = &exceptionProcessMutation{commandKey: command.CommandKey, actorID: actorID, reason: reason}
	return r.GetInventoryOperation(context.Background(), r.operation.ID)
}

func (r *exceptionInventoryRepoStub) SubmitInventoryOperationForProcessCommand(
	_ context.Context,
	_ int,
	command *ProcessDomainCommandInput,
	_ *ProcessDomainCommandResult,
	actorID int,
) (*InventoryOperation, error) {
	return r.record(command, actorID, "")
}

func (r *exceptionInventoryRepoStub) ApproveInventoryOperationForProcessCommand(
	_ context.Context,
	_ int,
	command *ProcessDomainCommandInput,
	_ *ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*InventoryOperation, error) {
	return r.record(command, actorID, reason)
}

func (r *exceptionInventoryRepoStub) RejectInventoryOperationForProcessCommand(
	ctx context.Context,
	id int,
	command *ProcessDomainCommandInput,
	result *ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*InventoryOperation, error) {
	return r.ApproveInventoryOperationForProcessCommand(ctx, id, command, result, actorID, reason)
}

func (r *exceptionInventoryRepoStub) PostInventoryOperationForProcessCommand(
	_ context.Context,
	_ int,
	command *ProcessDomainCommandInput,
	_ *ProcessDomainCommandResult,
	actorID int,
) (*InventoryOperation, error) {
	return r.record(command, actorID, "")
}

func exceptionProcessCommandInput(
	commandKey string,
	businessRefType string,
	businessRefID int,
	payload map[string]any,
) *ProcessDomainCommandInput {
	return &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{
			ID:              101,
			ProcessKey:      "test_exception_process",
			BusinessRefType: businessRefType,
			BusinessRefID:   businessRefID,
		},
		Node:           &ProcessNodeInstance{ID: 201, ProcessInstanceID: 101, NodeType: ProcessNodeTypeDomainCommand},
		CommandKey:     commandKey,
		IdempotencyKey: "test-exception-command",
		Payload:        payload,
	}
}

func cloneExceptionProcessCommandInput(in *ProcessDomainCommandInput) *ProcessDomainCommandInput {
	copy := *in
	instance := *in.ProcessInstance
	node := *in.Node
	copy.ProcessInstance = &instance
	copy.Node = &node
	copy.Payload = make(map[string]any, len(in.Payload))
	for key, value := range in.Payload {
		copy.Payload[key] = value
	}
	return &copy
}
