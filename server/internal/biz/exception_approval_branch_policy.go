package biz

import (
	"context"
	"strings"
)

const (
	ProcessBranchPolicySalesOrderApproval           = "sales_order.approval_outcome"
	ProcessBranchPolicyPurchaseOrderApproval        = "purchase_order.approval_outcome"
	ProcessBranchPolicyShipmentFinanceApproval      = "shipment.finance_approval_outcome"
	ProcessBranchPolicyFinancePaymentApproval       = "finance_payment.approval_outcome"
	ProcessBranchPolicyInventoryAdjustmentApproval  = "inventory_adjustment.approval_outcome"
	ProcessBranchPolicyProductionExceptionApproval  = "production_exception.approval_outcome"
	ProcessBranchPolicyProductionExceptionExecution = "production_exception.execution_route"
)

var workflowApprovalCapabilityKeys = []string{
	PermissionWorkflowTaskApprove,
	PermissionFinancePaymentApprove,
	PermissionWarehouseAdjustmentApprove,
	PermissionProductionExceptionApprove,
}

func WorkflowApprovalCapabilityKeys() []string {
	out := make([]string, len(workflowApprovalCapabilityKeys))
	copy(out, workflowApprovalCapabilityKeys)
	return out
}

func IsWorkflowApprovalCapabilityKey(capabilityKey string) bool {
	capabilityKey = strings.TrimSpace(capabilityKey)
	for _, candidate := range workflowApprovalCapabilityKeys {
		if capabilityKey == candidate {
			return true
		}
	}
	return false
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

type exceptionApprovalProcessBranchPolicyRegistration struct {
	key          string
	nextNodeKeys []string
	handler      ProcessBranchPolicyHandler
}

func exceptionApprovalProcessBranchPolicyRegistrations() []exceptionApprovalProcessBranchPolicyRegistration {
	return []exceptionApprovalProcessBranchPolicyRegistration{
		{
			key:          ProcessBranchPolicySalesOrderApproval,
			nextNodeKeys: []string{"activate_sales_order", "reject_sales_order"},
			handler: approvalOutcomeBranchPolicyHandler{
				approveNodeKey: "activate_sales_order",
				rejectNodeKey:  "reject_sales_order",
			},
		},
		{
			key:          ProcessBranchPolicyPurchaseOrderApproval,
			nextNodeKeys: []string{"approve_purchase_order", "reject_purchase_order"},
			handler: approvalOutcomeBranchPolicyHandler{
				approveNodeKey: "approve_purchase_order",
				rejectNodeKey:  "reject_purchase_order",
			},
		},
		{
			key:          ProcessBranchPolicyShipmentFinanceApproval,
			nextNodeKeys: []string{"shipment_finance_release", "shipment_finance_reject"},
			handler: approvalOutcomeBranchPolicyHandler{
				approveNodeKey: "shipment_finance_release",
				rejectNodeKey:  "shipment_finance_reject",
			},
		},
		{
			key:          ProcessBranchPolicyFinancePaymentApproval,
			nextNodeKeys: []string{"approve_finance_payment", "reject_finance_payment"},
			handler: approvalOutcomeBranchPolicyHandler{
				approveNodeKey: "approve_finance_payment",
				rejectNodeKey:  "reject_finance_payment",
			},
		},
		{
			key:          ProcessBranchPolicyInventoryAdjustmentApproval,
			nextNodeKeys: []string{"approve_inventory_adjustment", "reject_inventory_adjustment"},
			handler: approvalOutcomeBranchPolicyHandler{
				approveNodeKey: "approve_inventory_adjustment",
				rejectNodeKey:  "reject_inventory_adjustment",
			},
		},
		{
			key:          ProcessBranchPolicyProductionExceptionApproval,
			nextNodeKeys: []string{"approve_production_exception", "reject_production_exception"},
			handler: approvalOutcomeBranchPolicyHandler{
				approveNodeKey: "approve_production_exception",
				rejectNodeKey:  "reject_production_exception",
			},
		},
		{
			key:          ProcessBranchPolicyProductionExceptionExecution,
			nextNodeKeys: []string{"production_exception_execution", "over_issue_end"},
			handler:      productionExceptionExecutionBranchPolicyHandler{},
		},
	}
}

// CanonicalProcessBranchTargets returns the registered next-node set for every
// named ProcessRuntime branch policy. The returned slices are independent
// copies and cannot mutate runtime handlers.
func CanonicalProcessBranchTargets() map[string][]string {
	out := make(map[string][]string)
	for _, registration := range exceptionApprovalProcessBranchPolicyRegistrations() {
		out[registration.key] = append([]string(nil), registration.nextNodeKeys...)
	}
	return out
}

func RegisterExceptionApprovalProcessBranchPolicyHandlers(processRuntimeUC *ProcessRuntimeUsecase) error {
	if processRuntimeUC == nil {
		return ErrBadParam
	}
	for _, item := range exceptionApprovalProcessBranchPolicyRegistrations() {
		if err := processRuntimeUC.RegisterBranchPolicyHandler(item.key, item.handler); err != nil {
			return err
		}
	}
	return nil
}
