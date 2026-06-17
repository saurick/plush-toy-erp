package biz

import "github.com/google/wire"

// ProviderSet is biz providers.
var ProviderSet = wire.NewSet(
	NewAuthUsecase,
	NewAdminAuthUsecase,
	NewAdminManageUsecase,
	NewUserAdminUsecase,
	NewWorkflowUsecase,
	NewDebugUsecase,
	NewMasterDataUsecase,
	NewSalesOrderUsecase,
	NewPurchaseOrderUsecase,
	NewOutsourcingOrderUsecase,
	NewInventoryUsecase,
	NewOperationalFactUsecase,
)
