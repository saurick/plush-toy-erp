package biz

import (
	"context"
	"strings"
)

const (
	ProcessBranchPolicySalesReturnApproval          = "sales_return.approval_outcome"
	ProcessBranchPolicyFinancePaymentApproval       = "finance_payment.approval_outcome"
	ProcessBranchPolicyInventoryAdjustmentApproval  = "inventory_adjustment.approval_outcome"
	ProcessBranchPolicyProductionExceptionApproval  = "production_exception.approval_outcome"
	ProcessBranchPolicyProductionExceptionExecution = "production_exception.execution_route"
)

func IsWorkflowApprovalCapabilityKey(capabilityKey string) bool {
	switch strings.TrimSpace(capabilityKey) {
	case PermissionWorkflowTaskApprove,
		PermissionSalesReturnApprove,
		PermissionFinancePaymentApprove,
		PermissionWarehouseAdjustmentApprove,
		PermissionProductionExceptionApprove:
		return true
	default:
		return false
	}
}

type approvalOutcomeBranchPolicyHandler struct {
	approveNodeKey string
	rejectNodeKey  string
}

func (h approvalOutcomeBranchPolicyHandler) ResolveProcessBranch(
	_ context.Context,
	in *ProcessBranchPolicyInput,
	_ int,
) (*ProcessBranchPolicyResult, error) {
	if in == nil || strings.TrimSpace(h.approveNodeKey) == "" || strings.TrimSpace(h.rejectNodeKey) == "" {
		return nil, ErrBadParam
	}
	switch strings.ToLower(strings.TrimSpace(in.Outcome)) {
	case "rejected":
		if strings.TrimSpace(in.Reason) == "" {
			return nil, ErrBadParam
		}
		return &ProcessBranchPolicyResult{NextNodeKey: h.rejectNodeKey}, nil
	case "", "approved", "confirmed":
		return &ProcessBranchPolicyResult{NextNodeKey: h.approveNodeKey}, nil
	default:
		return nil, ErrBadParam
	}
}

type productionExceptionExecutionBranchPolicyHandler struct{}

func (productionExceptionExecutionBranchPolicyHandler) ResolveProcessBranch(
	_ context.Context,
	in *ProcessBranchPolicyInput,
	_ int,
) (*ProcessBranchPolicyResult, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	switch strings.TrimSpace(in.Outcome) {
	case ProductionExceptionProcessCommandOutcomeApprovedOverIssue:
		return &ProcessBranchPolicyResult{NextNodeKey: "over_issue_end"}, nil
	case ProductionExceptionProcessCommandOutcomeApprovedWIP:
		return &ProcessBranchPolicyResult{NextNodeKey: "production_exception_execution"}, nil
	default:
		return nil, ErrBadParam
	}
}

func RegisterExceptionApprovalProcessBranchPolicyHandlers(processRuntimeUC *ProcessRuntimeUsecase) error {
	if processRuntimeUC == nil {
		return ErrBadParam
	}
	handlers := []struct {
		key     string
		handler ProcessBranchPolicyHandler
	}{
		{
			key: ProcessBranchPolicySalesReturnApproval,
			handler: approvalOutcomeBranchPolicyHandler{
				approveNodeKey: "approve_sales_return",
				rejectNodeKey:  "reject_sales_return",
			},
		},
		{
			key: ProcessBranchPolicyFinancePaymentApproval,
			handler: approvalOutcomeBranchPolicyHandler{
				approveNodeKey: "approve_finance_payment",
				rejectNodeKey:  "reject_finance_payment",
			},
		},
		{
			key: ProcessBranchPolicyInventoryAdjustmentApproval,
			handler: approvalOutcomeBranchPolicyHandler{
				approveNodeKey: "approve_inventory_adjustment",
				rejectNodeKey:  "reject_inventory_adjustment",
			},
		},
		{
			key: ProcessBranchPolicyProductionExceptionApproval,
			handler: approvalOutcomeBranchPolicyHandler{
				approveNodeKey: "approve_production_exception",
				rejectNodeKey:  "reject_production_exception",
			},
		},
		{
			key:     ProcessBranchPolicyProductionExceptionExecution,
			handler: productionExceptionExecutionBranchPolicyHandler{},
		},
	}
	for _, item := range handlers {
		if err := processRuntimeUC.RegisterBranchPolicyHandler(item.key, item.handler); err != nil {
			return err
		}
	}
	return nil
}
