package biz

import (
	"errors"
	"testing"
)

func TestValidateCustomerConfigProcessNodeRejectsReservedWorkflowTaskGroup(t *testing.T) {
	for _, taskGroup := range workflowSourceTaskGroups {
		if err := validateCustomerConfigProcessNode(
			ProcessKeySalesOrderAcceptance,
			"sales_order",
			taskGroup,
			ProcessNodeTypeHumanTask,
			nil,
		); !errors.Is(err, ErrBadParam) {
			t.Fatalf("task group %q error = %v, want ErrBadParam", taskGroup, err)
		}
	}
}

func TestValidateCustomerProcessContractForPublishRejectsReservedWorkflowTaskGroup(t *testing.T) {
	contract := newSalesOrderAcceptanceContract(CustomerProcessVariantSalesApprovalPMC, false)
	contract.Nodes[1].NodeKey = WorkflowSourceTaskShipmentReleaseGroup

	if err := validateCustomerProcessContractForPublish(contract); !errors.Is(err, ErrBadParam) {
		t.Fatalf("publish validation error = %v, want ErrBadParam", err)
	}
}
