package biz

import "testing"

func TestRoleFlowEveryFulfillmentOwnerCanReadAndPerformSourceAction(t *testing.T) {
	for kind, spec := range fulfillmentTaskSpecs {
		t.Run(spec.Role+"/"+kind, func(t *testing.T) {
			permissions := builtinRolePermissionSet(t, spec.Role)
			assertPermissionSetContains(t, permissions, spec.Capability, spec.ReadCapability)
		})
	}
	assertPermissionSetContains(t, builtinRolePermissionSet(t, SalesRoleKey), PermissionStockReservationCreate, PermissionStockReservationRelease, PermissionCustomerDisable)
	assertPermissionSetContains(t, builtinRolePermissionSet(t, PurchaseRoleKey), PermissionSupplierDisable)
	assertPermissionSetContains(t, builtinRolePermissionSet(t, PMCRoleKey), PermissionProcessRead, PermissionProcessCreate, PermissionProcessUpdate, PermissionProcessDisable)
	assertPermissionSetOmits(t, builtinRolePermissionSet(t, PMCRoleKey), PermissionProductionWIPAssign)
	assertPermissionSetContains(t, builtinRolePermissionSet(t, EngineeringRoleKey), PermissionProcessRead, PermissionProductDisable, PermissionProductSKUDisable)
	assertPermissionSetOmits(t, builtinRolePermissionSet(t, EngineeringRoleKey), PermissionProcessCreate, PermissionProcessUpdate, PermissionProcessDisable, PermissionProductionWIPAssign, PermissionOutsourcingOrderCreate, PermissionOutsourcingOrderUpdate, PermissionSupplierUpdate, PermissionCustomerUpdate, PermissionFieldProcurementCommercialRead, PermissionFieldFinanceSettlementRead)
	assertPermissionSetContains(t, builtinRolePermissionSet(t, FinanceRoleKey), PermissionPMCPlanRead, PermissionProductionWIPRead)
	assertPermissionSetOmits(t, builtinRolePermissionSet(t, FinanceRoleKey), PermissionOutsourcingOrderConfirm, PermissionQualityInspectionUpdate, PermissionQualityExceptionHandle)
}
