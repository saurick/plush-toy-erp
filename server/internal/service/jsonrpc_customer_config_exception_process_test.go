package service

import (
	"context"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/shopspring/decimal"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestCustomerConfigExceptionProcessMethodContractsAreExact(t *testing.T) {
	tests := []struct {
		method          string
		processKey      string
		action          string
		commandKey      string
		businessRefType string
		idParam         string
	}{
		{"start_sales_return_acceptance_process", biz.ProcessKeySalesReturnApproval, "start", "", "sales_return", "sales_return_id"},
		{"get_sales_return_acceptance_process", biz.ProcessKeySalesReturnApproval, "get", "", "sales_return", "sales_return_id"},
		{"execute_sales_return_receive", biz.ProcessKeySalesReturnApproval, "execute", biz.ProcessDomainCommandSalesReturnReceive, "sales_return", "sales_return_id"},
		{"start_finance_payment_approval_process", biz.ProcessKeyFinancePaymentApproval, "start", "", "finance_payment", "finance_payment_id"},
		{"get_finance_payment_approval_process", biz.ProcessKeyFinancePaymentApproval, "get", "", "finance_payment", "finance_payment_id"},
		{"execute_finance_payment_post", biz.ProcessKeyFinancePaymentApproval, "execute", biz.ProcessDomainCommandFinancePaymentPost, "finance_payment", "finance_payment_id"},
		{"start_inventory_adjustment_approval_process", biz.ProcessKeyInventoryAdjustmentApproval, "start", "", "inventory_operation", "inventory_operation_id"},
		{"get_inventory_adjustment_approval_process", biz.ProcessKeyInventoryAdjustmentApproval, "get", "", "inventory_operation", "inventory_operation_id"},
		{"execute_inventory_adjustment_submit", biz.ProcessKeyInventoryAdjustmentApproval, "execute", biz.ProcessDomainCommandInventoryAdjustmentSubmit, "inventory_operation", "inventory_operation_id"},
		{"execute_inventory_adjustment_post", biz.ProcessKeyInventoryAdjustmentApproval, "execute", biz.ProcessDomainCommandInventoryAdjustmentPost, "inventory_operation", "inventory_operation_id"},
		{"start_production_exception_approval_process", biz.ProcessKeyProductionExceptionApproval, "start", "", "production_exception_decision", "production_exception_id"},
		{"get_production_exception_approval_process", biz.ProcessKeyProductionExceptionApproval, "get", "", "production_exception_decision", "production_exception_id"},
		{"execute_production_exception_process", biz.ProcessKeyProductionExceptionApproval, "execute", biz.ProcessDomainCommandProductionExceptionExecute, "production_exception_decision", "production_exception_id"},
	}
	for _, tt := range tests {
		t.Run(tt.method, func(t *testing.T) {
			contract, action, commandKey, ok := customerConfigExceptionProcessContractForMethod(tt.method)
			if !ok {
				t.Fatalf("method %q not registered", tt.method)
			}
			if contract.processKey != tt.processKey ||
				contract.businessRefType != tt.businessRefType ||
				contract.idParam != tt.idParam ||
				action != tt.action ||
				commandKey != tt.commandKey {
				t.Fatalf("contract=%#v action=%q command=%q", contract, action, commandKey)
			}
		})
	}

	for _, method := range []string{
		"start_rma_process",
		"get_rma_process",
		"execute_sales_return_accept",
		"post_finance_payment",
		"execute_inventory_adjustment",
		"approve_production_exception",
		"",
	} {
		t.Run("retired_"+method, func(t *testing.T) {
			if _, _, _, ok := customerConfigExceptionProcessContractForMethod(method); ok {
				t.Fatalf("retired or unknown method %q must fail closed", method)
			}
		})
	}
}

func TestExceptionProcessDomainCommandExecutionParamsAreStrict(t *testing.T) {
	contractByProcess := map[string]customerConfigExceptionProcessContract{}
	for _, contract := range customerConfigExceptionProcessContracts {
		contractByProcess[contract.processKey] = contract
	}
	tests := []struct {
		name       string
		processKey string
		commandKey string
		params     map[string]any
		wantExtra  func(*testing.T, *biz.ProcessDomainCommandExecution)
	}{
		{
			name:       "sales return receive",
			processKey: biz.ProcessKeySalesReturnApproval,
			commandKey: biz.ProcessDomainCommandSalesReturnReceive,
			params:     exceptionProcessExecutionBase("sales_return_id", 31),
		},
		{
			name:       "finance payment allocation canonicalized",
			processKey: biz.ProcessKeyFinancePaymentApproval,
			commandKey: biz.ProcessDomainCommandFinancePaymentPost,
			params: mergeExceptionProcessParams(
				exceptionProcessExecutionBase("finance_payment_id", 32),
				map[string]any{"allocations": []any{
					map[string]any{"finance_fact_id": float64(91), "amount": "10.250000"},
					map[string]any{"finance_fact_id": float64(92), "amount": "2.5"},
				}},
			),
			wantExtra: func(t *testing.T, in *biz.ProcessDomainCommandExecution) {
				t.Helper()
				allocations, ok := in.Payload["allocations"].([]any)
				if !ok || len(allocations) != 2 {
					t.Fatalf("allocations=%#v", in.Payload["allocations"])
				}
				first, _ := allocations[0].(map[string]any)
				second, _ := allocations[1].(map[string]any)
				if first["amount"] != "10.25" || second["amount"] != "2.5" {
					t.Fatalf("allocations must use canonical decimal strings: %#v", allocations)
				}
			},
		},
		{
			name:       "inventory adjustment submit",
			processKey: biz.ProcessKeyInventoryAdjustmentApproval,
			commandKey: biz.ProcessDomainCommandInventoryAdjustmentSubmit,
			params:     exceptionProcessExecutionBase("inventory_operation_id", 33),
		},
		{
			name:       "inventory adjustment post",
			processKey: biz.ProcessKeyInventoryAdjustmentApproval,
			commandKey: biz.ProcessDomainCommandInventoryAdjustmentPost,
			params:     exceptionProcessExecutionBase("inventory_operation_id", 33),
		},
		{
			name:       "production exception reason trimmed",
			processKey: biz.ProcessKeyProductionExceptionApproval,
			commandKey: biz.ProcessDomainCommandProductionExceptionExecute,
			params: mergeExceptionProcessParams(
				exceptionProcessExecutionBase("production_exception_id", 34),
				map[string]any{"reason": "  已确认现场报废  "},
			),
			wantExtra: func(t *testing.T, in *biz.ProcessDomainCommandExecution) {
				t.Helper()
				if in.Payload["reason"] != "已确认现场报废" {
					t.Fatalf("reason=%#v", in.Payload["reason"])
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			contract := contractByProcess[tt.processKey]
			in, ok := exceptionProcessDomainCommandExecutionFromParams(contract, tt.commandKey, tt.params)
			if !ok || in == nil {
				t.Fatalf("params rejected: %#v", tt.params)
			}
			if in.ProcessInstanceID != 11 ||
				in.ProcessNodeInstanceID != 12 ||
				in.ExpectedVersion != 3 ||
				in.CommandKey != tt.commandKey ||
				in.IdempotencyKey != "exception-command-1" {
				t.Fatalf("execution=%#v", in)
			}
			if in.Payload[contract.idParam] != getInt(tt.params, contract.idParam, 0) {
				t.Fatalf("business ref payload=%#v params=%#v", in.Payload, tt.params)
			}
			if tt.wantExtra != nil {
				tt.wantExtra(t, in)
			}
		})
	}

	financeContract := contractByProcess[biz.ProcessKeyFinancePaymentApproval]
	productionContract := contractByProcess[biz.ProcessKeyProductionExceptionApproval]
	invalid := []struct {
		name       string
		contract   customerConfigExceptionProcessContract
		commandKey string
		params     map[string]any
	}{
		{"unknown top level", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 32), map[string]any{"allocations": validExceptionAllocations(), "forged_actor_id": float64(9)})},
		{"zero process", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 32), map[string]any{"process_instance_id": float64(0), "allocations": validExceptionAllocations()})},
		{"zero node", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 32), map[string]any{"process_node_instance_id": float64(0), "allocations": validExceptionAllocations()})},
		{"zero version", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 32), map[string]any{"expected_version": float64(0), "allocations": validExceptionAllocations()})},
		{"zero source", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 0), map[string]any{"allocations": validExceptionAllocations()})},
		{"empty key", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 32), map[string]any{"idempotency_key": " ", "allocations": validExceptionAllocations()})},
		{"missing allocations", financeContract, biz.ProcessDomainCommandFinancePaymentPost, exceptionProcessExecutionBase("finance_payment_id", 32)},
		{"empty allocations", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 32), map[string]any{"allocations": []any{}})},
		{"allocation unknown field", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 32), map[string]any{"allocations": []any{map[string]any{"finance_fact_id": float64(91), "amount": "1", "currency": "CNY"}}})},
		{"allocation zero fact", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 32), map[string]any{"allocations": []any{map[string]any{"finance_fact_id": float64(0), "amount": "1"}}})},
		{"allocation negative", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 32), map[string]any{"allocations": []any{map[string]any{"finance_fact_id": float64(91), "amount": "-1"}}})},
		{"allocation scale overflow", financeContract, biz.ProcessDomainCommandFinancePaymentPost, mergeExceptionProcessParams(exceptionProcessExecutionBase("finance_payment_id", 32), map[string]any{"allocations": []any{map[string]any{"finance_fact_id": float64(91), "amount": "1.0000001"}}})},
		{"production missing reason", productionContract, biz.ProcessDomainCommandProductionExceptionExecute, exceptionProcessExecutionBase("production_exception_id", 34)},
		{"production long reason", productionContract, biz.ProcessDomainCommandProductionExceptionExecute, mergeExceptionProcessParams(exceptionProcessExecutionBase("production_exception_id", 34), map[string]any{"reason": string(make([]rune, 256))})},
	}
	for _, tt := range invalid {
		t.Run("reject_"+tt.name, func(t *testing.T) {
			if in, ok := exceptionProcessDomainCommandExecutionFromParams(tt.contract, tt.commandKey, tt.params); ok || in != nil {
				t.Fatalf("invalid params accepted: %#v -> %#v", tt.params, in)
			}
		})
	}
}

func TestCustomerConfigExceptionProcessStartPermissionsFailClosed(t *testing.T) {
	tests := []struct {
		method string
		idKey  string
	}{
		{"start_sales_return_acceptance_process", "sales_return_id"},
		{"start_finance_payment_approval_process", "finance_payment_id"},
		{"start_inventory_adjustment_approval_process", "inventory_operation_id"},
		{"start_production_exception_approval_process", "production_exception_id"},
	}
	for _, tt := range tests {
		t.Run(tt.method, func(t *testing.T) {
			dispatcher := newCustomerConfigTestDispatcher(
				&biz.AdminUser{ID: 1, Username: "engineering", CreatedAt: time.Now(), UpdatedAt: time.Now()},
				[]string{biz.EngineeringRoleKey},
			)
			params := map[string]any{
				"customer_key":    biz.DefaultCustomerKey,
				"idempotency_key": "permission-denied",
				tt.idKey:          float64(1),
			}
			_, result, err := dispatcher.handleCustomerConfig(
				customerConfigAdminCtx(1, "engineering"),
				tt.method,
				"permission-denied",
				mustJSONRPCStruct(t, params),
			)
			if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("result=%#v err=%v", result, err)
			}
		})
	}
}

func TestStartOrReadProcessFirstNodeReturnsSettledHumanNode(t *testing.T) {
	dispatcher := &jsonrpcDispatcher{
		processRuntimeUC: biz.NewProcessRuntimeUsecase(nil, nil),
	}
	instance := &biz.ProcessInstance{ID: 81}
	for _, status := range []string{biz.ProcessNodeStatusCompleted, biz.ProcessNodeStatusBlocked} {
		t.Run(status, func(t *testing.T) {
			first := &biz.ProcessNodeInstance{
				ID:                82,
				ProcessInstanceID: instance.ID,
				NodeType:          biz.ProcessNodeTypeApproval,
				Status:            status,
				Version:           4,
			}
			got, err := dispatcher.startOrReadProcessFirstNode(
				context.Background(),
				instance,
				[]*biz.ProcessNodeInstance{first},
				7,
			)
			if err != nil || got != first {
				t.Fatalf("got=%#v err=%v", got, err)
			}
		})
	}
}

type exceptionProcessServiceOperationalFactRepo struct {
	stubBusinessDashboardOperationalFactRepo
	salesReturn         *biz.SalesReturn
	financePayment      *biz.FinancePayment
	productionException *biz.ProductionExceptionDecision
}

func (r *exceptionProcessServiceOperationalFactRepo) GetSalesReturn(_ context.Context, id int) (*biz.SalesReturn, error) {
	if r.salesReturn == nil || r.salesReturn.ID != id {
		return nil, biz.ErrBadParam
	}
	item := *r.salesReturn
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) CreateSalesReturn(
	context.Context,
	*biz.SalesReturnCreate,
	int,
	string,
) (*biz.SalesReturn, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) ApproveSalesReturn(
	context.Context,
	*biz.SalesReturnTransition,
	int,
) (*biz.SalesReturn, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *exceptionProcessServiceOperationalFactRepo) ReceiveSalesReturn(
	context.Context,
	*biz.SalesReturnTransition,
	int,
) (*biz.SalesReturn, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *exceptionProcessServiceOperationalFactRepo) CancelSalesReturn(
	context.Context,
	*biz.SalesReturnTransition,
	int,
) (*biz.SalesReturn, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) ReverseSalesReturn(
	context.Context,
	*biz.SalesReturnTransition,
	int,
) (*biz.SalesReturn, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) ListSalesReturns(
	context.Context,
	biz.SalesReturnFilter,
) ([]*biz.SalesReturn, int, error) {
	if r.salesReturn == nil {
		return nil, 0, nil
	}
	item := *r.salesReturn
	return []*biz.SalesReturn{&item}, 1, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) ApproveSalesReturnForProcessCommand(
	_ context.Context,
	id int,
	_ *biz.ProcessDomainCommandInput,
	_ *biz.ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*biz.SalesReturn, error) {
	if r.salesReturn == nil || r.salesReturn.ID != id {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	r.salesReturn.Status = biz.SalesReturnStatusApproved
	r.salesReturn.ApprovedAt = &now
	r.salesReturn.ApprovedBy = &actorID
	r.salesReturn.RejectReason = nil
	r.salesReturn.Version++
	item := *r.salesReturn
	_ = reason
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) RejectSalesReturnForProcessCommand(
	_ context.Context,
	id int,
	_ *biz.ProcessDomainCommandInput,
	_ *biz.ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*biz.SalesReturn, error) {
	if r.salesReturn == nil || r.salesReturn.ID != id {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	r.salesReturn.Status = biz.SalesReturnStatusRejected
	r.salesReturn.RejectedAt = &now
	r.salesReturn.RejectedBy = &actorID
	r.salesReturn.RejectReason = &reason
	r.salesReturn.Version++
	item := *r.salesReturn
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) ReceiveSalesReturnForProcessCommand(
	_ context.Context,
	id int,
	_ *biz.ProcessDomainCommandInput,
	_ *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.SalesReturn, error) {
	if r.salesReturn == nil || r.salesReturn.ID != id {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	r.salesReturn.Status = biz.SalesReturnStatusReceived
	r.salesReturn.ReceivedAt = &now
	r.salesReturn.ReceivedBy = &actorID
	r.salesReturn.Version++
	item := *r.salesReturn
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) GetFinancePayment(_ context.Context, id int) (*biz.FinancePayment, error) {
	if r.financePayment == nil || r.financePayment.ID != id {
		return nil, biz.ErrBadParam
	}
	item := *r.financePayment
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) CreateFinancePayment(
	context.Context,
	*biz.FinancePaymentCreate,
	int,
	string,
) (*biz.FinancePayment, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) CancelFinancePayment(
	context.Context,
	*biz.FinancePaymentTransition,
	int,
) (*biz.FinancePayment, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) PostFinancePayment(
	context.Context,
	*biz.FinancePaymentPost,
	int,
) (*biz.FinancePayment, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *exceptionProcessServiceOperationalFactRepo) ReverseFinancePayment(
	context.Context,
	*biz.FinancePaymentReverse,
	int,
) (*biz.FinancePayment, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) CreateFinanceCreditNote(
	context.Context,
	*biz.FinanceCreditNoteCreate,
	int,
	string,
) (*biz.FinanceCreditNote, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) ReverseFinanceCreditNote(
	context.Context,
	*biz.FinanceCreditNoteReverse,
	int,
	string,
) (*biz.FinanceCreditNote, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) GetFinanceCreditNote(
	context.Context,
	int,
) (*biz.FinanceCreditNote, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) ListFinanceCreditNotes(
	context.Context,
	biz.FinanceCreditNoteFilter,
) ([]*biz.FinanceCreditNote, int, error) {
	return nil, 0, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) ListFinancePayments(
	context.Context,
	biz.FinancePaymentFilter,
) ([]*biz.FinancePayment, int, error) {
	if r.financePayment == nil {
		return nil, 0, nil
	}
	item := *r.financePayment
	return []*biz.FinancePayment{&item}, 1, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) ApproveFinancePaymentForProcessCommand(
	_ context.Context,
	id int,
	_ *biz.ProcessDomainCommandInput,
	_ *biz.ProcessDomainCommandResult,
	actorID int,
	_ string,
) (*biz.FinancePayment, error) {
	if r.financePayment == nil || r.financePayment.ID != id {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	r.financePayment.Status = biz.FinancePaymentStatusApproved
	r.financePayment.ApprovedAt = &now
	r.financePayment.ApprovedBy = &actorID
	r.financePayment.Version++
	item := *r.financePayment
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) RejectFinancePaymentForProcessCommand(
	_ context.Context,
	id int,
	_ *biz.ProcessDomainCommandInput,
	_ *biz.ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*biz.FinancePayment, error) {
	if r.financePayment == nil || r.financePayment.ID != id {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	r.financePayment.Status = biz.FinancePaymentStatusRejected
	r.financePayment.RejectedAt = &now
	r.financePayment.RejectedBy = &actorID
	r.financePayment.RejectReason = &reason
	r.financePayment.Version++
	item := *r.financePayment
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) PostFinancePaymentForProcessCommand(
	_ context.Context,
	in *biz.FinancePaymentPost,
	_ *biz.ProcessDomainCommandInput,
	_ *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.FinancePayment, error) {
	if r.financePayment == nil || in == nil || r.financePayment.ID != in.ID {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	r.financePayment.Status = biz.FinancePaymentStatusPosted
	r.financePayment.PostedAt = &now
	r.financePayment.PostedBy = &actorID
	r.financePayment.Version++
	item := *r.financePayment
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) GetProductionException(_ context.Context, id int) (*biz.ProductionExceptionDecision, error) {
	if r.productionException == nil || r.productionException.ID != id {
		return nil, biz.ErrProductionExceptionNotFound
	}
	item := *r.productionException
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) SubmitProductionException(
	context.Context,
	*biz.ProductionExceptionSubmit,
	string,
) (*biz.ProductionExceptionDecision, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) ApproveProductionException(
	context.Context,
	*biz.ProductionExceptionMutation,
) (*biz.ProductionExceptionDecision, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *exceptionProcessServiceOperationalFactRepo) RejectProductionException(
	context.Context,
	*biz.ProductionExceptionMutation,
) (*biz.ProductionExceptionDecision, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *exceptionProcessServiceOperationalFactRepo) CancelProductionException(
	context.Context,
	*biz.ProductionExceptionMutation,
) (*biz.ProductionExceptionDecision, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) ExecuteProductionException(
	context.Context,
	*biz.ProductionExceptionMutation,
) (*biz.ProductionExceptionDecision, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *exceptionProcessServiceOperationalFactRepo) ReverseProductionException(
	context.Context,
	*biz.ProductionExceptionMutation,
) (*biz.ProductionExceptionDecision, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceOperationalFactRepo) ListProductionExceptions(
	context.Context,
	biz.ProductionExceptionFilter,
) ([]*biz.ProductionExceptionDecision, int, error) {
	if r.productionException == nil {
		return nil, 0, nil
	}
	item := *r.productionException
	return []*biz.ProductionExceptionDecision{&item}, 1, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) ApproveProductionExceptionForProcessCommand(
	_ context.Context,
	in *biz.ProductionExceptionMutation,
	_ *biz.ProcessDomainCommandInput,
	_ *biz.ProcessDomainCommandResult,
) (*biz.ProductionExceptionDecision, error) {
	if r.productionException == nil || in == nil || r.productionException.ID != in.ID {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	approved := r.productionException.RequestedQuantity
	if in.ApprovedQuantity != nil {
		approved = *in.ApprovedQuantity
	}
	r.productionException.Status = biz.ProductionExceptionApproved
	r.productionException.ApprovedQuantity = &approved
	r.productionException.DecidedAt = &now
	r.productionException.DecidedBy = &in.ActorID
	r.productionException.DecisionReason = &in.Reason
	r.productionException.Version++
	item := *r.productionException
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) RejectProductionExceptionForProcessCommand(
	_ context.Context,
	in *biz.ProductionExceptionMutation,
	_ *biz.ProcessDomainCommandInput,
	_ *biz.ProcessDomainCommandResult,
) (*biz.ProductionExceptionDecision, error) {
	if r.productionException == nil || in == nil || r.productionException.ID != in.ID {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	r.productionException.Status = biz.ProductionExceptionRejected
	r.productionException.DecidedAt = &now
	r.productionException.DecidedBy = &in.ActorID
	r.productionException.DecisionReason = &in.Reason
	r.productionException.Version++
	item := *r.productionException
	return &item, nil
}

func (r *exceptionProcessServiceOperationalFactRepo) ExecuteProductionExceptionForProcessCommand(
	_ context.Context,
	in *biz.ProductionExceptionMutation,
	_ *biz.ProcessDomainCommandInput,
	_ *biz.ProcessDomainCommandResult,
) (*biz.ProductionExceptionDecision, error) {
	if r.productionException == nil || in == nil || r.productionException.ID != in.ID {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	r.productionException.ExecutionStatus = biz.ProductionExceptionExecutionApplied
	r.productionException.ExecutedAt = &now
	r.productionException.ExecutedBy = &in.ActorID
	r.productionException.ExecutionReason = &in.Reason
	r.productionException.Version++
	item := *r.productionException
	return &item, nil
}

type exceptionProcessServiceInventoryRepo struct {
	*serviceMaterialSupplyInventoryRepo
	operation *biz.InventoryOperation
}

func (r *exceptionProcessServiceInventoryRepo) GetInventoryOperation(_ context.Context, id int) (*biz.InventoryOperation, error) {
	if r.operation == nil || r.operation.ID != id {
		return nil, biz.ErrInventoryOperationNotFound
	}
	item := *r.operation
	item.Items = append([]*biz.InventoryOperationItem(nil), r.operation.Items...)
	return &item, nil
}

func (r *exceptionProcessServiceInventoryRepo) CreateInventoryOperation(
	context.Context,
	*biz.InventoryOperationCreate,
	string,
) (*biz.InventoryOperation, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceInventoryRepo) SubmitInventoryOperation(
	context.Context,
	*biz.InventoryOperationMutation,
) (*biz.InventoryOperation, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *exceptionProcessServiceInventoryRepo) ApproveInventoryOperation(
	context.Context,
	*biz.InventoryOperationMutation,
) (*biz.InventoryOperation, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *exceptionProcessServiceInventoryRepo) RejectInventoryOperation(
	context.Context,
	*biz.InventoryOperationMutation,
) (*biz.InventoryOperation, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *exceptionProcessServiceInventoryRepo) PostInventoryOperation(
	context.Context,
	*biz.InventoryOperationMutation,
) (*biz.InventoryOperation, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *exceptionProcessServiceInventoryRepo) CancelInventoryOperation(
	context.Context,
	*biz.InventoryOperationMutation,
) (*biz.InventoryOperation, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceInventoryRepo) ListInventoryOperationsForAccess(
	context.Context,
	biz.InventoryOperationFilter,
	biz.WarehouseDataScope,
) ([]*biz.InventoryOperation, int, error) {
	if r.operation == nil {
		return nil, 0, nil
	}
	item := *r.operation
	return []*biz.InventoryOperation{&item}, 1, nil
}

func (r *exceptionProcessServiceInventoryRepo) SubmitInventoryOperationForProcessCommand(
	_ context.Context,
	id int,
	_ *biz.ProcessDomainCommandInput,
	_ *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.InventoryOperation, error) {
	if r.operation == nil || r.operation.ID != id ||
		r.operation.OperationType != biz.InventoryOperationManualAdjustment ||
		r.operation.Status != biz.InventoryOperationStatusDraft ||
		r.operation.CreatedBy != actorID {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	r.operation.Status = biz.InventoryOperationStatusSubmitted
	r.operation.SubmittedAt = &now
	r.operation.SubmittedBy = &actorID
	r.operation.Version++
	item := *r.operation
	return &item, nil
}

func (r *exceptionProcessServiceInventoryRepo) ApproveInventoryOperationForProcessCommand(
	context.Context,
	int,
	*biz.ProcessDomainCommandInput,
	*biz.ProcessDomainCommandResult,
	int,
	string,
) (*biz.InventoryOperation, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceInventoryRepo) RejectInventoryOperationForProcessCommand(
	context.Context,
	int,
	*biz.ProcessDomainCommandInput,
	*biz.ProcessDomainCommandResult,
	int,
	string,
) (*biz.InventoryOperation, error) {
	return nil, biz.ErrBadParam
}

func (r *exceptionProcessServiceInventoryRepo) PostInventoryOperationForProcessCommand(
	context.Context,
	int,
	*biz.ProcessDomainCommandInput,
	*biz.ProcessDomainCommandResult,
	int,
) (*biz.InventoryOperation, error) {
	return nil, biz.ErrBadParam
}

func TestCustomerConfigExceptionProcessesStartReadAndReplay(t *testing.T) {
	now := time.Now()
	repo := &exceptionProcessServiceOperationalFactRepo{
		salesReturn: &biz.SalesReturn{
			ID: 101, ReturnNo: "RMA-101", ShipmentID: 901, CustomerID: 501,
			Status: biz.SalesReturnStatusDraft, Reason: "客户退货",
			Version: 1, CreatedBy: 2, CreatedAt: now, UpdatedAt: now,
		},
		financePayment: &biz.FinancePayment{
			ID: 102, PaymentNo: "PAY-102", Direction: biz.FinancePaymentDirectionReceipt,
			Status: biz.FinancePaymentStatusDraft, CounterpartyType: biz.FinanceCounterpartyCustomer,
			CounterpartyID: 501, Amount: decimal.RequireFromString("88.50"), Currency: "CNY",
			Version: 1, CreatedBy: 2, OccurredAt: now, CreatedAt: now, UpdatedAt: now,
		},
		productionException: &biz.ProductionExceptionDecision{
			ID: 103, DecisionNo: "PEX-103", DecisionType: biz.ProductionExceptionScrap,
			Status: biz.ProductionExceptionSubmitted, ExecutionStatus: biz.ProductionExceptionExecutionPending,
			RequestedQuantity: decimal.RequireFromString("3"), RequestedBy: 2,
			RequestedAt: now, Version: 1,
		},
	}
	tests := []struct {
		name            string
		processKey      string
		variantKey      string
		businessRefType string
		startMethod     string
		getMethod       string
		idParam         string
		businessRefID   int
		wantNodeCount   int
	}{
		{"sales return", biz.ProcessKeySalesReturnApproval, biz.CustomerProcessVariantSalesReturnApprovalReceipt, "sales_return", "start_sales_return_acceptance_process", "get_sales_return_acceptance_process", "sales_return_id", 101, 7},
		{"finance payment", biz.ProcessKeyFinancePaymentApproval, biz.CustomerProcessVariantFinancePaymentApprovalPost, "finance_payment", "start_finance_payment_approval_process", "get_finance_payment_approval_process", "finance_payment_id", 102, 7},
		{"production exception", biz.ProcessKeyProductionExceptionApproval, biz.CustomerProcessVariantProductionExceptionApproval, "production_exception_decision", "start_production_exception_approval_process", "get_production_exception_approval_process", "production_exception_id", 103, 8},
	}
	for index, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dispatcher, runtimeRepo := newCustomerConfigTestDispatcherWithOperationalFactAndRuntimeRepo(
				&biz.AdminUser{
					ID: 1, Username: "super-admin", IsSuperAdmin: true,
					CreatedAt: now, UpdatedAt: now,
				},
				[]string{biz.BossRoleKey},
				repo,
			)
			revision := "2026.07.26.exception-" + string(rune('1'+index))
			publishAndActivateCustomerConfigUsecaseForTest(
				t,
				dispatcher,
				customerConfigPublishParamsWithExceptionProcess(
					t,
					revision,
					tt.processKey,
					tt.variantKey,
					tt.businessRefType,
				),
				1,
			)
			ctx := customerConfigAdminCtx(1, "super-admin")
			contract, _, _, ok := customerConfigExceptionProcessContractForMethod(tt.startMethod)
			if !ok {
				t.Fatalf("missing process contract for %s", tt.startMethod)
			}
			if result := dispatcher.requireExceptionProcessSourceRead(
				ctx,
				tt.startMethod,
				contract,
				tt.businessRefID,
			); result != nil {
				t.Fatalf("source read permission result=%#v", result)
			}
			if _, result := dispatcher.exceptionProcessSourceReadback(ctx, contract, tt.businessRefID); result != nil {
				t.Fatalf("source readback result=%#v", result)
			}
			built, err := dispatcher.customerConfigUC.BuildProcessInstanceCreateFromActiveCustomerConfig(
				ctx,
				biz.ProcessInstanceFromCustomerConfigInput{
					CustomerKey:     biz.DefaultCustomerKey,
					ProcessKey:      tt.processKey,
					ProcessVersion:  "v1",
					BusinessRefType: tt.businessRefType,
					BusinessRefID:   tt.businessRefID,
					IdempotencyKey:  tt.processKey + "/start/1",
				},
			)
			if err != nil {
				t.Fatalf("build process create: %v", err)
			}
			for nodeIndex, node := range built.Nodes {
				if _, err := biz.NormalizeProcessNodeInstanceCreateForRepo(node); err != nil {
					t.Fatalf("normalize node %d %#v: %v", nodeIndex, node, err)
				}
			}
			t.Logf(
				"built process key=%q version=%q revision=%q hash=%q ref=%q/%d idempotency=%q status=%q nodes=%d",
				built.ProcessKey,
				built.ProcessVersion,
				built.ConfigRevision,
				built.DefinitionHash,
				built.BusinessRefType,
				built.BusinessRefID,
				built.IdempotencyKey,
				built.Status,
				len(built.Nodes),
			)
			startParams := mustJSONRPCStruct(t, map[string]any{
				"customer_key":    biz.DefaultCustomerKey,
				tt.idParam:        float64(tt.businessRefID),
				"process_version": "v1",
				"idempotency_key": tt.processKey + "/start/1",
			})
			_, started, err := dispatcher.handleCustomerConfig(ctx, tt.startMethod, "start", startParams)
			if err != nil || started == nil || started.Code != errcode.OK.Code {
				t.Fatalf(
					"start result=%#v err=%v processes=%#v nodes=%#v",
					started,
					err,
					runtimeRepo.processes,
					runtimeRepo.nodes,
				)
			}
			startedData := started.Data.AsMap()
			instance, ok := startedData["process_instance"].(map[string]any)
			if !ok || instance["process_key"] != tt.processKey ||
				instance["business_ref_type"] != tt.businessRefType ||
				jsonRPCInt(t, instance, "business_ref_id") != tt.businessRefID {
				t.Fatalf("process instance=%#v", startedData["process_instance"])
			}
			nodes, ok := startedData["nodes"].([]any)
			if !ok || len(nodes) != tt.wantNodeCount {
				t.Fatalf("nodes=%#v", startedData["nodes"])
			}
			if len(runtimeRepo.processes) != 1 {
				t.Fatalf("process count=%d", len(runtimeRepo.processes))
			}

			_, replayed, err := dispatcher.handleCustomerConfig(ctx, tt.startMethod, "replay", startParams)
			if err != nil || replayed == nil || replayed.Code != errcode.OK.Code {
				t.Fatalf("replay result=%#v err=%v", replayed, err)
			}
			replayedInstance := jsonRPCNestedMap(t, replayed, "process_instance")
			if jsonRPCInt(t, replayedInstance, "id") != jsonRPCInt(t, instance, "id") ||
				len(runtimeRepo.processes) != 1 {
				t.Fatalf("replay created another process: first=%#v replay=%#v count=%d", instance, replayedInstance, len(runtimeRepo.processes))
			}

			_, read, err := dispatcher.handleCustomerConfig(
				ctx,
				tt.getMethod,
				"get",
				mustJSONRPCStruct(t, map[string]any{
					"customer_key": biz.DefaultCustomerKey,
					tt.idParam:     float64(tt.businessRefID),
				}),
			)
			if err != nil || read == nil || read.Code != errcode.OK.Code {
				t.Fatalf("get result=%#v err=%v", read, err)
			}
			processContext := jsonRPCNestedMap(t, read, "process_context")
			readInstance, ok := processContext["process_instance"].(map[string]any)
			if !ok || jsonRPCInt(t, readInstance, "id") != jsonRPCInt(t, instance, "id") {
				t.Fatalf("read process context=%#v", processContext)
			}
			if read.Data.AsMap()["source_readback"] == nil {
				t.Fatalf("source readback missing: %#v", read.Data.AsMap())
			}
		})
	}
}

func TestCustomerConfigInventoryAdjustmentStartExecutesSubmitOnceAndReplays(t *testing.T) {
	now := time.Now()
	inventoryRepo := &exceptionProcessServiceInventoryRepo{
		serviceMaterialSupplyInventoryRepo: &serviceMaterialSupplyInventoryRepo{},
		operation: &biz.InventoryOperation{
			ID: 104, OperationNo: "ADJ-104",
			OperationType: biz.InventoryOperationManualAdjustment,
			Status:        biz.InventoryOperationStatusDraft,
			Reason:        "盘盈调整",
			Version:       1,
			CreatedBy:     1,
			CreatedAt:     now,
			UpdatedAt:     now,
			Items: []*biz.InventoryOperationItem{{
				ID: 105, OperationID: 104, LineNo: "1",
				SubjectType: "MATERIAL", SubjectID: 11,
				FromWarehouseID: 1, UnitID: 1,
				AdjustmentQuantity: decimal.RequireFromString("2"),
			}},
		},
	}
	dispatcher, runtimeRepo := newCustomerConfigTestDispatcherWithReposAndRuntimeRepo(
		&biz.AdminUser{
			ID: 1, Username: "super-admin", IsSuperAdmin: true,
			CreatedAt: now, UpdatedAt: now,
		},
		nil,
		newDefaultServiceSalesOrderRepo(),
		inventoryRepo,
		&exceptionProcessServiceOperationalFactRepo{},
	)
	publishAndActivateCustomerConfigUsecaseForTest(
		t,
		dispatcher,
		customerConfigPublishParamsWithExceptionProcess(
			t,
			"2026.07.26.exception-inventory",
			biz.ProcessKeyInventoryAdjustmentApproval,
			biz.CustomerProcessVariantInventoryAdjustmentApproval,
			"inventory_operation",
		),
		1,
	)
	ctx := customerConfigAdminCtx(1, "super-admin")
	contract, _, _, ok := customerConfigExceptionProcessContractForMethod(
		"start_inventory_adjustment_approval_process",
	)
	if !ok {
		t.Fatal("inventory adjustment process contract missing")
	}
	if result := dispatcher.requireExceptionProcessSourceRead(
		ctx,
		"start_inventory_adjustment_approval_process",
		contract,
		104,
	); result != nil {
		t.Fatalf("inventory source read permission result=%#v", result)
	}
	if _, result := dispatcher.exceptionProcessSourceReadback(ctx, contract, 104); result != nil {
		t.Fatalf("inventory source readback result=%#v", result)
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"customer_key":           biz.DefaultCustomerKey,
		"inventory_operation_id": float64(104),
		"process_version":        "v1",
		"idempotency_key":        "inventory-adjustment/start/104",
	})
	_, started, err := dispatcher.handleCustomerConfig(
		ctx,
		"start_inventory_adjustment_approval_process",
		"start",
		params,
	)
	if err != nil || started == nil || started.Code != errcode.OK.Code {
		t.Fatalf(
			"start result=%#v err=%v processes=%#v nodes=%#v",
			started,
			err,
			runtimeRepo.processes,
			runtimeRepo.nodes,
		)
	}
	startedSource := jsonRPCNestedMap(t, started, "source_readback")
	if startedSource["status"] != biz.InventoryOperationStatusDraft ||
		jsonRPCInt(t, startedSource, "version") != 1 {
		t.Fatalf("start must not imply source submission: %#v", startedSource)
	}
	startedContext := jsonRPCNestedMap(t, started, "process_context")
	startedActiveNodes, ok := startedContext["active_nodes"].([]any)
	if !ok || len(startedActiveNodes) != 1 {
		t.Fatalf("started active nodes=%#v", startedContext["active_nodes"])
	}
	submitNode, _ := startedActiveNodes[0].(map[string]any)
	if submitNode["node_key"] != "submit_inventory_adjustment" ||
		submitNode["node_type"] != biz.ProcessNodeTypeDomainCommand {
		t.Fatalf("submit node=%#v", submitNode)
	}
	instance := jsonRPCNestedMap(t, started, "process_instance")
	executeParams := mustJSONRPCStruct(t, map[string]any{
		"customer_key":             biz.DefaultCustomerKey,
		"process_instance_id":      float64(jsonRPCInt(t, instance, "id")),
		"process_node_instance_id": float64(jsonRPCInt(t, submitNode, "id")),
		"expected_version":         float64(jsonRPCInt(t, submitNode, "version")),
		"inventory_operation_id":   float64(104),
		"idempotency_key":          "inventory-adjustment/submit/104",
	})
	for attempt := 1; attempt <= 2; attempt++ {
		_, executed, err := dispatcher.handleCustomerConfig(
			ctx,
			"execute_inventory_adjustment_submit",
			"execute",
			executeParams,
		)
		if err != nil || executed == nil || executed.Code != errcode.OK.Code {
			t.Fatalf("execute attempt %d result=%#v err=%v", attempt, executed, err)
		}
		executedSource := jsonRPCNestedMap(t, executed, "source_readback")
		if executedSource["status"] != biz.InventoryOperationStatusSubmitted ||
			jsonRPCInt(t, executedSource, "version") != 2 {
			t.Fatalf("execute attempt %d source=%#v", attempt, executedSource)
		}
		executedContext := jsonRPCNestedMap(t, executed, "process_context")
		activeNodes, ok := executedContext["active_nodes"].([]any)
		if !ok || len(activeNodes) != 1 {
			t.Fatalf("execute attempt %d active nodes=%#v", attempt, executedContext["active_nodes"])
		}
		active, _ := activeNodes[0].(map[string]any)
		if active["node_key"] != "inventory_adjustment_approval" {
			t.Fatalf("execute attempt %d active node=%#v", attempt, active)
		}
	}
	_, replayedStart, err := dispatcher.handleCustomerConfig(
		ctx,
		"start_inventory_adjustment_approval_process",
		"replay-start",
		params,
	)
	if err != nil || replayedStart == nil || replayedStart.Code != errcode.OK.Code {
		t.Fatalf("replayed start result=%#v err=%v", replayedStart, err)
	}
	if len(runtimeRepo.processes) != 1 ||
		inventoryRepo.operation.Status != biz.InventoryOperationStatusSubmitted ||
		inventoryRepo.operation.Version != 2 {
		t.Fatalf("replay mutated source twice: processes=%d operation=%#v", len(runtimeRepo.processes), inventoryRepo.operation)
	}
}

func customerConfigPublishParamsWithExceptionProcess(
	t *testing.T,
	revision string,
	processKey string,
	variantKey string,
	businessRefType string,
) *structpb.Struct {
	t.Helper()
	params := customerConfigPublishParamsForRevision(t, revision)
	payload := params.AsMap()
	if _, ok := payload["compiled_snapshot"].(map[string]any); !ok {
		t.Fatalf("compiled_snapshot missing: %#v", payload)
	}
	setFormalRuntimeProcessSelection(payload, processKey, "v1", variantKey, businessRefType)
	moduleStates, ok := payload["module_states"].([]any)
	if !ok {
		t.Fatalf("module_states missing: %#v", payload)
	}
	moduleStates = append(moduleStates,
		map[string]any{"module_key": "sales_returns", "state": "enabled"},
		map[string]any{"module_key": "production", "state": "enabled"},
	)
	payload["module_states"] = moduleStates
	out, err := structpb.NewStruct(payload)
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}
	return out
}

func exceptionProcessExecutionBase(idParam string, businessRefID int) map[string]any {
	return map[string]any{
		"customer_key":             biz.DefaultCustomerKey,
		"process_instance_id":      float64(11),
		"process_node_instance_id": float64(12),
		"expected_version":         float64(3),
		idParam:                    float64(businessRefID),
		"idempotency_key":          " exception-command-1 ",
	}
}

func mergeExceptionProcessParams(base map[string]any, extra map[string]any) map[string]any {
	out := make(map[string]any, len(base)+len(extra))
	for key, value := range base {
		out[key] = value
	}
	for key, value := range extra {
		out[key] = value
	}
	return out
}

func validExceptionAllocations() []any {
	return []any{map[string]any{"finance_fact_id": float64(91), "amount": "1"}}
}
