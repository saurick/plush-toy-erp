package biz

import "github.com/google/wire"

// ProviderSet is biz providers.
var ProviderSet = wire.NewSet(
	NewAdminAuthUsecase,
	NewAdminManageUsecase,
	NewWorkflowUsecase,
	NewDebugUsecase,
	NewMasterDataUsecase,
	NewSalesOrderUsecase,
	NewPurchaseOrderUsecase,
	NewOutsourcingOrderUsecase,
	NewInventoryUsecase,
	NewOperationalFactUsecase,
	NewBusinessAttachmentUsecase,
)
