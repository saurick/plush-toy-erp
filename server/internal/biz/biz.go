package biz

import "github.com/google/wire"

// ProviderSet is biz providers.
var ProviderSet = wire.NewSet(
	NewAdminAuthUsecase,
	NewAdminManageUsecaseForWire,
	NewWorkflowUsecase,
	wire.Bind(new(ProcessRuntimeOwnerRoleResolver), new(*CustomerConfigUsecase)),
	NewProcessRuntimeUsecaseForWire,
	NewDebugUsecase,
	NewMasterDataUsecase,
	NewSalesOrderUsecase,
	NewPurchaseOrderUsecase,
	NewProductionOrderUsecase,
	NewOutsourcingOrderUsecase,
	NewInventoryUsecase,
	NewOperationalFactUsecase,
	NewBusinessAttachmentUsecase,
	NewCustomerConfigUsecase,
)

func NewProcessRuntimeUsecaseForWire(repo ProcessRuntimeRepo, workflowRepo WorkflowRepo, ownerResolver ProcessRuntimeOwnerRoleResolver) *ProcessRuntimeUsecase {
	return NewProcessRuntimeUsecase(repo, workflowRepo, ownerResolver)
}
