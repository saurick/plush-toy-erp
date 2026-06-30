package biz

import "github.com/google/wire"

// ProviderSet is biz providers.
var ProviderSet = wire.NewSet(
	NewAdminAuthUsecase,
	NewAdminManageUsecase,
	NewWorkflowUsecase,
	NewProcessRuntimeUsecase,
	NewDebugUsecase,
	NewMasterDataUsecase,
	NewSalesOrderUsecase,
	NewPurchaseOrderUsecase,
	NewOutsourcingOrderUsecase,
	NewInventoryUsecase,
	NewOperationalFactUsecase,
	NewBusinessAttachmentUsecase,
	NewCustomerConfigUsecase,
)
