package biz

import "github.com/google/wire"

// ProviderSet is biz providers.
var ProviderSet = wire.NewSet(
	NewAdminAuthUsecase,
	NewAdminManageUsecase,
	NewWorkflowUsecase,
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

func NewProcessRuntimeUsecaseForWire(repo ProcessRuntimeRepo, workflowRepo WorkflowRepo) *ProcessRuntimeUsecase {
	return NewProcessRuntimeUsecase(repo, workflowRepo)
}
