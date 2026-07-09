package biz

import "strings"

const (
	PermissionSystemUserRead         = "system.user.read"
	PermissionSystemUserCreate       = "system.user.create"
	PermissionSystemUserUpdate       = "system.user.update"
	PermissionSystemUserDisable      = "system.user.disable"
	PermissionSystemRoleRead         = "system.role.read"
	PermissionSystemRoleCreate       = "system.role.create"
	PermissionSystemRoleUpdate       = "system.role.update"
	PermissionSystemRoleDelete       = "system.role.delete"
	PermissionSystemPermissionRead   = "system.permission.read"
	PermissionSystemPermissionManage = "system.permission.manage"
	PermissionSystemAuditRead        = "system.audit.read"
	PermissionCustomerConfigRead     = "customer_config.read"
	PermissionCustomerConfigPublish  = "customer_config.publish"
	PermissionCustomerConfigActivate = "customer_config.activate"
	PermissionCustomerConfigRollback = "customer_config.rollback"

	PermissionERPDashboardRead          = "erp.dashboard.read"
	PermissionERPPrintTemplateRead      = "erp.print_template.read"
	PermissionERPBusinessChainDebugRead = "erp.business_chain_debug.read"

	PermissionCustomerRead         = "customer.read"
	PermissionCustomerCreate       = "customer.create"
	PermissionCustomerUpdate       = "customer.update"
	PermissionCustomerDisable      = "customer.disable"
	PermissionSupplierRead         = "supplier.read"
	PermissionSupplierCreate       = "supplier.create"
	PermissionSupplierUpdate       = "supplier.update"
	PermissionSupplierDisable      = "supplier.disable"
	PermissionMaterialRead         = "material.read"
	PermissionMaterialCreate       = "material.create"
	PermissionMaterialUpdate       = "material.update"
	PermissionMaterialDisable      = "material.disable"
	PermissionProcessRead          = "process.read"
	PermissionProcessCreate        = "process.create"
	PermissionProcessUpdate        = "process.update"
	PermissionProcessDisable       = "process.disable"
	PermissionProductRead          = "product.read"
	PermissionProductCreate        = "product.create"
	PermissionProductUpdate        = "product.update"
	PermissionProductDisable       = "product.disable"
	PermissionProductSKURead       = "product_sku.read"
	PermissionProductSKUCreate     = "product_sku.create"
	PermissionProductSKUUpdate     = "product_sku.update"
	PermissionProductSKUDisable    = "product_sku.disable"
	PermissionBOMRead              = "bom.read"
	PermissionBOMCreate            = "bom.create"
	PermissionBOMUpdate            = "bom.update"
	PermissionBOMActivate          = "bom.activate"
	PermissionContactRead          = "contact.read"
	PermissionContactCreate        = "contact.create"
	PermissionContactUpdate        = "contact.update"
	PermissionContactDisable       = "contact.disable"
	PermissionContactSetPrimary    = "contact.set_primary"
	PermissionSalesOrderRead       = "sales_order.read"
	PermissionSalesOrderCreate     = "sales_order.create"
	PermissionSalesOrderUpdate     = "sales_order.update"
	PermissionSalesOrderSubmit     = "sales_order.submit"
	PermissionSalesOrderActivate   = "sales_order.activate"
	PermissionSalesOrderClose      = "sales_order.close"
	PermissionSalesOrderCancel     = "sales_order.cancel"
	PermissionSalesOrderItemRead   = "sales_order_item.read"
	PermissionSalesOrderItemCreate = "sales_order_item.create"
	PermissionSalesOrderItemUpdate = "sales_order_item.update"
	PermissionSalesOrderItemCancel = "sales_order_item.cancel"

	PermissionWorkflowTaskRead     = "workflow.task.read"
	PermissionWorkflowTaskCreate   = "workflow.task.create"
	PermissionWorkflowTaskUpdate   = "workflow.task.update"
	PermissionWorkflowTaskAssign   = "workflow.task.assign"
	PermissionWorkflowTaskApprove  = "workflow.task.approve"
	PermissionWorkflowTaskReject   = "workflow.task.reject"
	PermissionWorkflowTaskComplete = "workflow.task.complete"

	PermissionPurchaseOrderRead         = "purchase.order.read"
	PermissionPurchaseOrderCreate       = "purchase.order.create"
	PermissionPurchaseOrderUpdate       = "purchase.order.update"
	PermissionPurchaseOrderApprove      = "purchase.order.approve"
	PermissionOutsourcingOrderRead      = "outsourcing.order.read"
	PermissionOutsourcingOrderCreate    = "outsourcing.order.create"
	PermissionOutsourcingOrderUpdate    = "outsourcing.order.update"
	PermissionOutsourcingOrderConfirm   = "outsourcing.order.confirm"
	PermissionPurchaseReceiptRead       = "purchase.receipt.read"
	PermissionPurchaseReceiptCreate     = "purchase.receipt.create"
	PermissionPurchaseReturnRead        = "purchase.return.read"
	PermissionPurchaseReturnCreate      = "purchase.return.create"
	PermissionWarehouseInventoryRead    = "warehouse.inventory.read"
	PermissionWarehouseInboundRead      = "warehouse.inbound.read"
	PermissionWarehouseInboundConfirm   = "warehouse.inbound.confirm"
	PermissionWarehouseOutboundRead     = "warehouse.outbound.read"
	PermissionWarehouseOutboundConfirm  = "warehouse.outbound.confirm"
	PermissionWarehouseAdjustmentCreate = "warehouse.adjustment.create"
	PermissionShipmentRead              = "shipment.read"
	PermissionShipmentCreate            = "shipment.create"
	PermissionShipmentShip              = "shipment.ship"
	PermissionShipmentCancel            = "shipment.cancel"
	PermissionQualityInspectionRead     = "quality.inspection.read"
	PermissionQualityInspectionCreate   = "quality.inspection.create"
	PermissionQualityInspectionUpdate   = "quality.inspection.update"
	PermissionQualityExceptionHandle    = "quality.exception.handle"
	PermissionFinancePayableRead        = "finance.payable.read"
	PermissionFinancePayableConfirm     = "finance.payable.confirm"
	PermissionFinanceReceivableRead     = "finance.receivable.read"
	PermissionFinanceReceivableConfirm  = "finance.receivable.confirm"
	PermissionFinanceReportRead         = "finance.report.read"
	PermissionPMCPlanRead               = "pmc.plan.read"
	PermissionPMCPlanCreate             = "pmc.plan.create"
	PermissionPMCPlanUpdate             = "pmc.plan.update"
	PermissionPMCRiskRead               = "pmc.risk.read"
	PermissionPMCRiskHandle             = "pmc.risk.handle"

	PermissionMobileBossAccess        = "mobile.boss.access"
	PermissionMobileSalesAccess       = "mobile.sales.access"
	PermissionMobilePurchaseAccess    = "mobile.purchase.access"
	PermissionMobileProductionAccess  = "mobile.production.access"
	PermissionMobileWarehouseAccess   = "mobile.warehouse.access"
	PermissionMobileQualityAccess     = "mobile.quality.access"
	PermissionMobileFinanceAccess     = "mobile.finance.access"
	PermissionMobilePMCAccess         = "mobile.pmc.access"
	PermissionMobileEngineeringAccess = "mobile.engineering.access"

	PermissionDebugSeed              = "debug.seed"
	PermissionDebugCleanup           = "debug.cleanup"
	PermissionDebugBusinessClear     = "debug.business.clear"
	PermissionDebugBusinessChainRun  = "debug.business_chain.run"
	PermissionDebugBusinessChainRead = "debug.business_chain.read"
)

type PermissionDefinition struct {
	Key         string
	Name        string
	Description string
	Module      string
	Action      string
	Resource    string
	Builtin     bool
}

type RoleDefinition struct {
	Key         string
	Name        string
	Description string
	Builtin     bool
	Disabled    bool
	SortOrder   int
	Permissions []string
}

type AdminRole struct {
	ID          int
	Key         string
	Name        string
	Description string
	Builtin     bool
	Disabled    bool
	SortOrder   int
	Permissions []string
}

type AdminPermission struct {
	ID          int
	Key         string
	Name        string
	Description string
	Module      string
	Action      string
	Resource    string
	Builtin     bool
}

type AdminMenu struct {
	Key                 string
	Label               string
	Path                string
	RequiredPermissions []string
}

var builtinPermissions = []PermissionDefinition{
	{Key: PermissionSystemUserRead, Name: "查看管理员", Module: "system", Action: "read", Resource: "admin_user", Builtin: true},
	{Key: PermissionSystemUserCreate, Name: "创建管理员", Module: "system", Action: "create", Resource: "admin_user", Builtin: true},
	{Key: PermissionSystemUserUpdate, Name: "更新管理员", Module: "system", Action: "update", Resource: "admin_user", Builtin: true},
	{Key: PermissionSystemUserDisable, Name: "启停管理员", Module: "system", Action: "disable", Resource: "admin_user", Builtin: true},
	{Key: PermissionSystemRoleRead, Name: "查看角色", Module: "system", Action: "read", Resource: "role", Builtin: true},
	{Key: PermissionSystemRoleCreate, Name: "创建角色", Module: "system", Action: "create", Resource: "role", Builtin: true},
	{Key: PermissionSystemRoleUpdate, Name: "更新角色", Module: "system", Action: "update", Resource: "role", Builtin: true},
	{Key: PermissionSystemRoleDelete, Name: "删除角色", Module: "system", Action: "delete", Resource: "role", Builtin: true},
	{Key: PermissionSystemPermissionRead, Name: "查看权限码", Module: "system", Action: "read", Resource: "permission", Builtin: true},
	{Key: PermissionSystemPermissionManage, Name: "管理角色权限", Module: "system", Action: "manage", Resource: "permission", Builtin: true},
	{Key: PermissionSystemAuditRead, Name: "查看系统审计日志", Module: "system", Action: "read", Resource: "audit_log", Builtin: true},
	{Key: PermissionCustomerConfigRead, Name: "查看客户配置版本", Module: "customer_config", Action: "read", Resource: "revision", Builtin: true},
	{Key: PermissionCustomerConfigPublish, Name: "发布客户配置版本", Module: "customer_config", Action: "publish", Resource: "revision", Builtin: true},
	{Key: PermissionCustomerConfigActivate, Name: "激活客户配置版本", Module: "customer_config", Action: "activate", Resource: "revision", Builtin: true},
	{Key: PermissionCustomerConfigRollback, Name: "回滚客户配置版本", Module: "customer_config", Action: "rollback", Resource: "revision", Builtin: true},
	{Key: PermissionERPDashboardRead, Name: "查看任务看板", Module: "erp", Action: "read", Resource: "dashboard", Builtin: true},
	{Key: PermissionERPPrintTemplateRead, Name: "查看打印模板", Module: "erp", Action: "read", Resource: "print_template", Builtin: true},
	{Key: PermissionERPBusinessChainDebugRead, Name: "查看业务链路调试能力", Module: "erp", Action: "read", Resource: "business_chain_debug", Builtin: true},
	{Key: PermissionCustomerRead, Name: "查看客户主数据", Module: "masterdata", Action: "read", Resource: "customer", Builtin: true},
	{Key: PermissionCustomerCreate, Name: "创建客户主数据", Module: "masterdata", Action: "create", Resource: "customer", Builtin: true},
	{Key: PermissionCustomerUpdate, Name: "更新客户主数据", Module: "masterdata", Action: "update", Resource: "customer", Builtin: true},
	{Key: PermissionCustomerDisable, Name: "启停客户主数据", Module: "masterdata", Action: "disable", Resource: "customer", Builtin: true},
	{Key: PermissionSupplierRead, Name: "查看供应商主数据", Module: "masterdata", Action: "read", Resource: "supplier", Builtin: true},
	{Key: PermissionSupplierCreate, Name: "创建供应商主数据", Module: "masterdata", Action: "create", Resource: "supplier", Builtin: true},
	{Key: PermissionSupplierUpdate, Name: "更新供应商主数据", Module: "masterdata", Action: "update", Resource: "supplier", Builtin: true},
	{Key: PermissionSupplierDisable, Name: "启停供应商主数据", Module: "masterdata", Action: "disable", Resource: "supplier", Builtin: true},
	{Key: PermissionMaterialRead, Name: "查看材料主数据", Module: "masterdata", Action: "read", Resource: "material", Builtin: true},
	{Key: PermissionMaterialCreate, Name: "创建材料主数据", Module: "masterdata", Action: "create", Resource: "material", Builtin: true},
	{Key: PermissionMaterialUpdate, Name: "更新材料主数据", Module: "masterdata", Action: "update", Resource: "material", Builtin: true},
	{Key: PermissionMaterialDisable, Name: "启停材料主数据", Module: "masterdata", Action: "disable", Resource: "material", Builtin: true},
	{Key: PermissionProcessRead, Name: "查看工序档案", Module: "masterdata", Action: "read", Resource: "process", Builtin: true},
	{Key: PermissionProcessCreate, Name: "创建工序档案", Module: "masterdata", Action: "create", Resource: "process", Builtin: true},
	{Key: PermissionProcessUpdate, Name: "更新工序档案", Module: "masterdata", Action: "update", Resource: "process", Builtin: true},
	{Key: PermissionProcessDisable, Name: "启停工序档案", Module: "masterdata", Action: "disable", Resource: "process", Builtin: true},
	{Key: PermissionProductRead, Name: "查看产品主数据", Module: "masterdata", Action: "read", Resource: "product", Builtin: true},
	{Key: PermissionProductCreate, Name: "创建产品主数据", Module: "masterdata", Action: "create", Resource: "product", Builtin: true},
	{Key: PermissionProductUpdate, Name: "更新产品主数据", Module: "masterdata", Action: "update", Resource: "product", Builtin: true},
	{Key: PermissionProductDisable, Name: "启停产品主数据", Module: "masterdata", Action: "disable", Resource: "product", Builtin: true},
	{Key: PermissionProductSKURead, Name: "查看 SKU 主数据", Module: "masterdata", Action: "read", Resource: "product_sku", Builtin: true},
	{Key: PermissionProductSKUCreate, Name: "创建 SKU 主数据", Module: "masterdata", Action: "create", Resource: "product_sku", Builtin: true},
	{Key: PermissionProductSKUUpdate, Name: "更新 SKU 主数据", Module: "masterdata", Action: "update", Resource: "product_sku", Builtin: true},
	{Key: PermissionProductSKUDisable, Name: "启停 SKU 主数据", Module: "masterdata", Action: "disable", Resource: "product_sku", Builtin: true},
	{Key: PermissionBOMRead, Name: "查看 BOM", Module: "bom", Action: "read", Resource: "version", Builtin: true},
	{Key: PermissionBOMCreate, Name: "创建 BOM 版本", Module: "bom", Action: "create", Resource: "version", Builtin: true},
	{Key: PermissionBOMUpdate, Name: "维护 BOM 草稿", Module: "bom", Action: "update", Resource: "version", Builtin: true},
	{Key: PermissionBOMActivate, Name: "激活 BOM 版本", Module: "bom", Action: "activate", Resource: "version", Builtin: true},
	{Key: PermissionContactRead, Name: "查看联系人", Module: "masterdata", Action: "read", Resource: "contact", Builtin: true},
	{Key: PermissionContactCreate, Name: "创建联系人", Module: "masterdata", Action: "create", Resource: "contact", Builtin: true},
	{Key: PermissionContactUpdate, Name: "更新联系人", Module: "masterdata", Action: "update", Resource: "contact", Builtin: true},
	{Key: PermissionContactDisable, Name: "停用联系人", Module: "masterdata", Action: "disable", Resource: "contact", Builtin: true},
	{Key: PermissionContactSetPrimary, Name: "设置主联系人", Module: "masterdata", Action: "set_primary", Resource: "contact", Builtin: true},
	{Key: PermissionSalesOrderRead, Name: "查看销售订单", Module: "sales_order", Action: "read", Resource: "order", Builtin: true},
	{Key: PermissionSalesOrderCreate, Name: "创建销售订单", Module: "sales_order", Action: "create", Resource: "order", Builtin: true},
	{Key: PermissionSalesOrderUpdate, Name: "更新销售订单", Module: "sales_order", Action: "update", Resource: "order", Builtin: true},
	{Key: PermissionSalesOrderSubmit, Name: "提交销售订单", Module: "sales_order", Action: "submit", Resource: "order", Builtin: true},
	{Key: PermissionSalesOrderActivate, Name: "生效销售订单", Module: "sales_order", Action: "activate", Resource: "order", Builtin: true},
	{Key: PermissionSalesOrderClose, Name: "关闭销售订单", Module: "sales_order", Action: "close", Resource: "order", Builtin: true},
	{Key: PermissionSalesOrderCancel, Name: "取消销售订单", Module: "sales_order", Action: "cancel", Resource: "order", Builtin: true},
	{Key: PermissionSalesOrderItemRead, Name: "查看销售订单行", Module: "sales_order", Action: "read", Resource: "item", Builtin: true},
	{Key: PermissionSalesOrderItemCreate, Name: "新增销售订单行", Module: "sales_order", Action: "create", Resource: "item", Builtin: true},
	{Key: PermissionSalesOrderItemUpdate, Name: "更新销售订单行", Module: "sales_order", Action: "update", Resource: "item", Builtin: true},
	{Key: PermissionSalesOrderItemCancel, Name: "取消销售订单行", Module: "sales_order", Action: "cancel", Resource: "item", Builtin: true},
	{Key: PermissionWorkflowTaskRead, Name: "查看协同任务", Module: "workflow", Action: "read", Resource: "task", Builtin: true},
	{Key: PermissionWorkflowTaskCreate, Name: "创建协同任务", Module: "workflow", Action: "create", Resource: "task", Builtin: true},
	{Key: PermissionWorkflowTaskUpdate, Name: "更新协同任务", Module: "workflow", Action: "update", Resource: "task", Builtin: true},
	{Key: PermissionWorkflowTaskAssign, Name: "指派协同任务", Module: "workflow", Action: "assign", Resource: "task", Builtin: true},
	{Key: PermissionWorkflowTaskApprove, Name: "审批协同任务", Module: "workflow", Action: "approve", Resource: "task", Builtin: true},
	{Key: PermissionWorkflowTaskReject, Name: "驳回协同任务", Module: "workflow", Action: "reject", Resource: "task", Builtin: true},
	{Key: PermissionWorkflowTaskComplete, Name: "完成协同任务", Module: "workflow", Action: "complete", Resource: "task", Builtin: true},
	{Key: PermissionPurchaseOrderRead, Name: "查看采购", Module: "purchase", Action: "read", Resource: "order", Builtin: true},
	{Key: PermissionPurchaseOrderCreate, Name: "创建采购", Module: "purchase", Action: "create", Resource: "order", Builtin: true},
	{Key: PermissionPurchaseOrderUpdate, Name: "更新采购", Module: "purchase", Action: "update", Resource: "order", Builtin: true},
	{Key: PermissionPurchaseOrderApprove, Name: "审批采购", Module: "purchase", Action: "approve", Resource: "order", Builtin: true},
	{Key: PermissionOutsourcingOrderRead, Name: "查看委外合同", Module: "outsourcing", Action: "read", Resource: "order", Builtin: true},
	{Key: PermissionOutsourcingOrderCreate, Name: "创建委外合同", Module: "outsourcing", Action: "create", Resource: "order", Builtin: true},
	{Key: PermissionOutsourcingOrderUpdate, Name: "更新委外合同", Module: "outsourcing", Action: "update", Resource: "order", Builtin: true},
	{Key: PermissionOutsourcingOrderConfirm, Name: "确认委外下单", Module: "outsourcing", Action: "confirm", Resource: "order", Builtin: true},
	{Key: PermissionPurchaseReceiptRead, Name: "查看采购入库", Module: "purchase", Action: "read", Resource: "receipt", Builtin: true},
	{Key: PermissionPurchaseReceiptCreate, Name: "创建采购入库", Module: "purchase", Action: "create", Resource: "receipt", Builtin: true},
	{Key: PermissionPurchaseReturnRead, Name: "查看采购退货", Module: "purchase", Action: "read", Resource: "return", Builtin: true},
	{Key: PermissionPurchaseReturnCreate, Name: "创建采购退货", Module: "purchase", Action: "create", Resource: "return", Builtin: true},
	{Key: PermissionWarehouseInventoryRead, Name: "查看库存", Module: "warehouse", Action: "read", Resource: "inventory", Builtin: true},
	{Key: PermissionWarehouseInboundRead, Name: "查看入库", Module: "warehouse", Action: "read", Resource: "inbound", Builtin: true},
	{Key: PermissionWarehouseInboundConfirm, Name: "确认入库", Module: "warehouse", Action: "confirm", Resource: "inbound", Builtin: true},
	{Key: PermissionWarehouseOutboundRead, Name: "查看出库", Module: "warehouse", Action: "read", Resource: "outbound", Builtin: true},
	{Key: PermissionWarehouseOutboundConfirm, Name: "确认出库", Module: "warehouse", Action: "confirm", Resource: "outbound", Builtin: true},
	{Key: PermissionWarehouseAdjustmentCreate, Name: "创建库存调整", Module: "warehouse", Action: "create", Resource: "adjustment", Builtin: true},
	{Key: PermissionShipmentRead, Name: "查看出货单", Module: "shipment", Action: "read", Resource: "shipment", Builtin: true},
	{Key: PermissionShipmentCreate, Name: "创建出货单", Module: "shipment", Action: "create", Resource: "shipment", Builtin: true},
	{Key: PermissionShipmentShip, Name: "确认出货", Module: "shipment", Action: "ship", Resource: "shipment", Builtin: true},
	{Key: PermissionShipmentCancel, Name: "取消出货单", Module: "shipment", Action: "cancel", Resource: "shipment", Builtin: true},
	{Key: PermissionQualityInspectionRead, Name: "查看质检", Module: "quality", Action: "read", Resource: "inspection", Builtin: true},
	{Key: PermissionQualityInspectionCreate, Name: "创建质检", Module: "quality", Action: "create", Resource: "inspection", Builtin: true},
	{Key: PermissionQualityInspectionUpdate, Name: "更新质检", Module: "quality", Action: "update", Resource: "inspection", Builtin: true},
	{Key: PermissionQualityExceptionHandle, Name: "处理品质异常", Module: "quality", Action: "handle", Resource: "exception", Builtin: true},
	{Key: PermissionFinancePayableRead, Name: "查看应付", Module: "finance", Action: "read", Resource: "payable", Builtin: true},
	{Key: PermissionFinancePayableConfirm, Name: "确认应付", Module: "finance", Action: "confirm", Resource: "payable", Builtin: true},
	{Key: PermissionFinanceReceivableRead, Name: "查看应收", Module: "finance", Action: "read", Resource: "receivable", Builtin: true},
	{Key: PermissionFinanceReceivableConfirm, Name: "确认应收", Module: "finance", Action: "confirm", Resource: "receivable", Builtin: true},
	{Key: PermissionFinanceReportRead, Name: "查看财务报表", Module: "finance", Action: "read", Resource: "report", Builtin: true},
	{Key: PermissionPMCPlanRead, Name: "查看生产计划", Module: "pmc", Action: "read", Resource: "plan", Builtin: true},
	{Key: PermissionPMCPlanCreate, Name: "创建生产计划", Module: "pmc", Action: "create", Resource: "plan", Builtin: true},
	{Key: PermissionPMCPlanUpdate, Name: "更新生产计划", Module: "pmc", Action: "update", Resource: "plan", Builtin: true},
	{Key: PermissionPMCRiskRead, Name: "查看计划风险", Module: "pmc", Action: "read", Resource: "risk", Builtin: true},
	{Key: PermissionPMCRiskHandle, Name: "处理计划风险", Module: "pmc", Action: "handle", Resource: "risk", Builtin: true},
	{Key: PermissionMobileBossAccess, Name: "进入老板岗位任务端", Module: "mobile", Action: "access", Resource: BossRoleKey, Builtin: true},
	{Key: PermissionMobileSalesAccess, Name: "进入业务岗位任务端", Module: "mobile", Action: "access", Resource: SalesRoleKey, Builtin: true},
	{Key: PermissionMobilePurchaseAccess, Name: "进入采购岗位任务端", Module: "mobile", Action: "access", Resource: PurchaseRoleKey, Builtin: true},
	{Key: PermissionMobileProductionAccess, Name: "进入生产岗位任务端", Module: "mobile", Action: "access", Resource: ProductionRoleKey, Builtin: true},
	{Key: PermissionMobileWarehouseAccess, Name: "进入仓库岗位任务端", Module: "mobile", Action: "access", Resource: WarehouseRoleKey, Builtin: true},
	{Key: PermissionMobileQualityAccess, Name: "进入品质岗位任务端", Module: "mobile", Action: "access", Resource: QualityRoleKey, Builtin: true},
	{Key: PermissionMobileFinanceAccess, Name: "进入财务岗位任务端", Module: "mobile", Action: "access", Resource: FinanceRoleKey, Builtin: true},
	{Key: PermissionMobilePMCAccess, Name: "进入 PMC 岗位任务端", Module: "mobile", Action: "access", Resource: PMCRoleKey, Builtin: true},
	{Key: PermissionMobileEngineeringAccess, Name: "进入工程岗位任务端", Module: "mobile", Action: "access", Resource: EngineeringRoleKey, Builtin: true},
	{Key: PermissionDebugSeed, Name: "生成调试数据", Module: "debug", Action: "seed", Resource: "business_chain", Builtin: true},
	{Key: PermissionDebugCleanup, Name: "清理调试数据", Module: "debug", Action: "cleanup", Resource: "business_chain", Builtin: true},
	{Key: PermissionDebugBusinessClear, Name: "清空业务数据", Module: "debug", Action: "clear", Resource: "business", Builtin: true},
	{Key: PermissionDebugBusinessChainRun, Name: "执行业务链路调试", Module: "debug", Action: "run", Resource: "business_chain", Builtin: true},
	{Key: PermissionDebugBusinessChainRead, Name: "查看业务链路调试能力", Module: "debug", Action: "read", Resource: "business_chain", Builtin: true},
}

var builtinPermissionKeySet = func() map[string]struct{} {
	out := make(map[string]struct{}, len(builtinPermissions))
	for _, item := range builtinPermissions {
		out[item.Key] = struct{}{}
	}
	return out
}()

func BuiltinPermissions() []PermissionDefinition {
	out := make([]PermissionDefinition, len(builtinPermissions))
	copy(out, builtinPermissions)
	return out
}

func AllPermissionKeys() []string {
	out := make([]string, 0, len(builtinPermissions))
	for _, item := range builtinPermissions {
		out = append(out, item.Key)
	}
	return out
}

func NormalizePermissionKeys(input []string) []string {
	if len(input) == 0 {
		return []string{}
	}
	selected := make(map[string]struct{}, len(input))
	for _, raw := range input {
		key := strings.TrimSpace(raw)
		if _, ok := builtinPermissionKeySet[key]; ok {
			selected[key] = struct{}{}
		}
	}
	out := make([]string, 0, len(selected))
	for _, item := range builtinPermissions {
		if _, ok := selected[item.Key]; ok {
			out = append(out, item.Key)
		}
	}
	return out
}

func PermissionKeySet(keys []string) map[string]struct{} {
	out := make(map[string]struct{}, len(keys))
	for _, key := range NormalizePermissionKeys(keys) {
		out[key] = struct{}{}
	}
	return out
}

func PermissionSetHasAny(permissionSet map[string]struct{}, keys ...string) bool {
	for _, key := range keys {
		if _, ok := permissionSet[strings.TrimSpace(key)]; ok {
			return true
		}
	}
	return false
}

func PermissionSetHasAll(permissionSet map[string]struct{}, keys ...string) bool {
	for _, key := range keys {
		if _, ok := permissionSet[strings.TrimSpace(key)]; !ok {
			return false
		}
	}
	return true
}

func NormalizeAdminRoleKeys(input []string) []string {
	if len(input) == 0 {
		return []string{}
	}
	selected := make(map[string]struct{}, len(input))
	out := make([]string, 0, len(input))
	for _, raw := range input {
		key := NormalizeRoleKey(raw)
		if key == "" {
			continue
		}
		if _, ok := selected[key]; ok {
			continue
		}
		selected[key] = struct{}{}
		out = append(out, key)
	}
	return out
}

func BuiltinRoles() []RoleDefinition {
	readPermissions := []string{
		PermissionERPDashboardRead,
		PermissionERPPrintTemplateRead,
		PermissionWorkflowTaskRead,
		PermissionCustomerRead,
		PermissionSupplierRead,
		PermissionMaterialRead,
		PermissionProcessRead,
		PermissionProductRead,
		PermissionProductSKURead,
		PermissionBOMRead,
		PermissionContactRead,
		PermissionSalesOrderRead,
		PermissionSalesOrderItemRead,
		PermissionPurchaseOrderRead,
		PermissionOutsourcingOrderRead,
		PermissionPurchaseReceiptRead,
		PermissionPurchaseReturnRead,
		PermissionWarehouseInventoryRead,
		PermissionWarehouseInboundRead,
		PermissionWarehouseOutboundRead,
		PermissionShipmentRead,
		PermissionQualityInspectionRead,
		PermissionFinancePayableRead,
		PermissionFinanceReceivableRead,
		PermissionFinanceReportRead,
		PermissionPMCPlanRead,
		PermissionPMCRiskRead,
	}
	return []RoleDefinition{
		{Key: BossRoleKey, Name: "老板 / 管理层", Description: "查看全局业务、审批和报表，不默认包含高危 debug 清空权限。", Builtin: true, SortOrder: 10, Permissions: append(readPermissions, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskApprove, PermissionWorkflowTaskReject, PermissionMobileBossAccess)},
		{Key: SalesRoleKey, Name: "业务", Description: "客户、订单、出运跟进，任务处理仍受销售 owner/assignee 约束。", Builtin: true, SortOrder: 20, Permissions: []string{PermissionERPDashboardRead, PermissionERPPrintTemplateRead, PermissionCustomerRead, PermissionCustomerCreate, PermissionCustomerUpdate, PermissionCustomerDisable, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionProductCreate, PermissionProductUpdate, PermissionProductDisable, PermissionProductSKURead, PermissionProductSKUCreate, PermissionProductSKUUpdate, PermissionProductSKUDisable, PermissionBOMRead, PermissionContactRead, PermissionContactCreate, PermissionContactUpdate, PermissionContactDisable, PermissionContactSetPrimary, PermissionSalesOrderRead, PermissionSalesOrderCreate, PermissionSalesOrderUpdate, PermissionSalesOrderSubmit, PermissionSalesOrderActivate, PermissionSalesOrderClose, PermissionSalesOrderCancel, PermissionSalesOrderItemRead, PermissionSalesOrderItemCreate, PermissionSalesOrderItemUpdate, PermissionSalesOrderItemCancel, PermissionShipmentRead, PermissionShipmentCreate, PermissionWorkflowTaskRead, PermissionWorkflowTaskCreate, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionMobileSalesAccess}},
		{Key: PurchaseRoleKey, Name: "采购", Description: "采购、收货、退货相关入口，任务处理仍受采购 owner/assignee 约束。", Builtin: true, SortOrder: 30, Permissions: []string{PermissionERPDashboardRead, PermissionERPPrintTemplateRead, PermissionSupplierRead, PermissionSupplierCreate, PermissionSupplierUpdate, PermissionSupplierDisable, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionMaterialCreate, PermissionMaterialUpdate, PermissionMaterialDisable, PermissionProductSKURead, PermissionBOMRead, PermissionContactRead, PermissionContactCreate, PermissionContactUpdate, PermissionContactDisable, PermissionContactSetPrimary, PermissionWorkflowTaskRead, PermissionWorkflowTaskCreate, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionPurchaseOrderRead, PermissionPurchaseOrderCreate, PermissionPurchaseOrderUpdate, PermissionOutsourcingOrderRead, PermissionOutsourcingOrderCreate, PermissionOutsourcingOrderUpdate, PermissionOutsourcingOrderConfirm, PermissionPurchaseReceiptRead, PermissionPurchaseReceiptCreate, PermissionPurchaseReturnRead, PermissionPurchaseReturnCreate, PermissionMobilePurchaseAccess}},
		{Key: WarehouseRoleKey, Name: "仓库", Description: "库存、入库、出库、盘点相关入口，任务处理仍受仓库 owner/assignee 约束。", Builtin: true, SortOrder: 40, Permissions: []string{PermissionERPDashboardRead, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionProductSKURead, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionWarehouseInventoryRead, PermissionWarehouseInboundRead, PermissionWarehouseInboundConfirm, PermissionWarehouseOutboundRead, PermissionWarehouseOutboundConfirm, PermissionWarehouseAdjustmentCreate, PermissionShipmentRead, PermissionShipmentCreate, PermissionShipmentShip, PermissionShipmentCancel, PermissionMobileWarehouseAccess}},
		{Key: QualityRoleKey, Name: "品质", Description: "检验、异常、返工相关入口，任务处理仍受品质 owner/assignee 约束。", Builtin: true, SortOrder: 50, Permissions: []string{PermissionERPDashboardRead, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionProductSKURead, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionQualityInspectionRead, PermissionQualityInspectionCreate, PermissionQualityInspectionUpdate, PermissionQualityExceptionHandle, PermissionMobileQualityAccess}},
		{Key: FinanceRoleKey, Name: "财务", Description: "应收、应付、收付款和财务报表相关入口，任务处理仍受财务 owner/assignee 约束。", Builtin: true, SortOrder: 60, Permissions: []string{PermissionERPDashboardRead, PermissionERPPrintTemplateRead, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionProductSKURead, PermissionShipmentRead, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionFinancePayableRead, PermissionFinancePayableConfirm, PermissionFinanceReceivableRead, PermissionFinanceReceivableConfirm, PermissionFinanceReportRead, PermissionMobileFinanceAccess}},
		{Key: PMCRoleKey, Name: "PMC", Description: "生产计划、进度和风险跟进；可查看风险，不等于可代替其他角色完成任务。", Builtin: true, SortOrder: 70, Permissions: []string{PermissionERPDashboardRead, PermissionMaterialRead, PermissionProcessRead, PermissionProcessCreate, PermissionProcessUpdate, PermissionProcessDisable, PermissionProductRead, PermissionMaterialCreate, PermissionMaterialUpdate, PermissionProductCreate, PermissionProductUpdate, PermissionProductDisable, PermissionProductSKURead, PermissionProductSKUCreate, PermissionProductSKUUpdate, PermissionProductSKUDisable, PermissionBOMRead, PermissionBOMCreate, PermissionBOMUpdate, PermissionBOMActivate, PermissionShipmentRead, PermissionWorkflowTaskRead, PermissionWorkflowTaskCreate, PermissionWorkflowTaskUpdate, PermissionPMCPlanRead, PermissionPMCPlanCreate, PermissionPMCPlanUpdate, PermissionPMCRiskRead, PermissionPMCRiskHandle, PermissionMobilePMCAccess}},
		{Key: ProductionRoleKey, Name: "生产", Description: "排产、进度、返工和生产异常处理，任务处理仍受生产 owner/assignee 约束。", Builtin: true, SortOrder: 80, Permissions: []string{PermissionERPDashboardRead, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionProductSKURead, PermissionOutsourcingOrderRead, PermissionOutsourcingOrderCreate, PermissionOutsourcingOrderUpdate, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionPMCPlanRead, PermissionPMCPlanUpdate, PermissionPMCRiskRead, PermissionPMCRiskHandle, PermissionMobileProductionAccess}},
		{Key: EngineeringRoleKey, Name: "工程", Description: "产品资料、工艺、BOM 和工程资料任务入口，任务处理仍受工程 owner/assignee 约束。", Builtin: true, SortOrder: 90, Permissions: []string{PermissionERPDashboardRead, PermissionMaterialRead, PermissionProcessRead, PermissionProcessCreate, PermissionProcessUpdate, PermissionProcessDisable, PermissionProductRead, PermissionProductCreate, PermissionProductUpdate, PermissionProductSKURead, PermissionProductSKUCreate, PermissionProductSKUUpdate, PermissionBOMRead, PermissionBOMCreate, PermissionBOMUpdate, PermissionBOMActivate, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionMobileEngineeringAccess}},
		{Key: AdminRoleKey, Name: "系统管理员", Description: "管理管理员、角色、权限和基础配置，不天然拥有业务事实处理权。", Builtin: true, SortOrder: 100, Permissions: []string{PermissionSystemUserRead, PermissionSystemUserCreate, PermissionSystemUserUpdate, PermissionSystemUserDisable, PermissionSystemRoleRead, PermissionSystemRoleCreate, PermissionSystemRoleUpdate, PermissionSystemRoleDelete, PermissionSystemPermissionRead, PermissionSystemPermissionManage, PermissionSystemAuditRead, PermissionCustomerConfigRead, PermissionCustomerConfigPublish, PermissionCustomerConfigActivate, PermissionCustomerConfigRollback}},
		{Key: DebugOperatorRoleKey, Name: "调试操作员", Description: "仅限 local/dev/test 分配的 debug 操作角色。", Builtin: true, SortOrder: 110, Permissions: []string{PermissionERPBusinessChainDebugRead, PermissionDebugBusinessChainRead, PermissionDebugBusinessChainRun, PermissionDebugSeed, PermissionDebugCleanup, PermissionDebugBusinessClear}},
	}
}

var builtinMobileRoleAccessPermissions = map[string]string{
	BossRoleKey:        PermissionMobileBossAccess,
	SalesRoleKey:       PermissionMobileSalesAccess,
	PurchaseRoleKey:    PermissionMobilePurchaseAccess,
	ProductionRoleKey:  PermissionMobileProductionAccess,
	WarehouseRoleKey:   PermissionMobileWarehouseAccess,
	QualityRoleKey:     PermissionMobileQualityAccess,
	FinanceRoleKey:     PermissionMobileFinanceAccess,
	PMCRoleKey:         PermissionMobilePMCAccess,
	EngineeringRoleKey: PermissionMobileEngineeringAccess,
}

func MobileRoleAccessPermission(roleKey string) string {
	return builtinMobileRoleAccessPermissions[NormalizeRoleKey(roleKey)]
}

func AdminHasPermission(admin *AdminUser, permissionKey string) bool {
	if admin == nil || admin.Disabled {
		return false
	}
	permissionKey = strings.TrimSpace(permissionKey)
	if permissionKey == "" {
		return false
	}
	if admin.IsSuperAdmin {
		return true
	}
	for _, item := range admin.Permissions {
		if item == permissionKey {
			return true
		}
	}
	return false
}

func AdminHasAnyPermission(admin *AdminUser, permissionKeys ...string) bool {
	for _, key := range permissionKeys {
		if AdminHasPermission(admin, key) {
			return true
		}
	}
	return false
}

func AdminRoleKeys(admin *AdminUser) []string {
	if admin == nil {
		return []string{}
	}
	out := make([]string, 0, len(admin.Roles))
	seen := map[string]struct{}{}
	for _, role := range admin.Roles {
		key := NormalizeRoleKey(role.Key)
		if key == "" || role.Disabled {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, key)
	}
	return out
}

func AdminHasRole(admin *AdminUser, roleKey string) bool {
	normalized := NormalizeRoleKey(roleKey)
	if normalized == "" || admin == nil || admin.Disabled {
		return false
	}
	for _, item := range AdminRoleKeys(admin) {
		if item == normalized {
			return true
		}
	}
	return false
}

func AdminCanAccessMobileRole(admin *AdminUser, roleKey string) bool {
	permissionKey := MobileRoleAccessPermission(roleKey)
	if permissionKey == "" {
		return true
	}
	return AdminHasPermission(admin, permissionKey)
}

var builtinAdminMenus = []AdminMenu{
	{Key: "global-dashboard", Label: "工作台", Path: "/erp/dashboard", RequiredPermissions: []string{PermissionERPDashboardRead}},
	{Key: "task-board", Label: "任务看板", Path: "/erp/task-board", RequiredPermissions: []string{PermissionWorkflowTaskRead}},
	{Key: "business-dashboard", Label: "业务看板", Path: "/erp/business-dashboard", RequiredPermissions: []string{PermissionERPDashboardRead}},
	{Key: "customers", Label: "客户档案", Path: "/erp/master/partners/customers", RequiredPermissions: []string{PermissionCustomerRead}},
	{Key: "suppliers", Label: "供应商档案", Path: "/erp/master/partners/suppliers", RequiredPermissions: []string{PermissionSupplierRead}},
	{Key: "products", Label: "产品档案", Path: "/erp/master/products", RequiredPermissions: []string{PermissionProductRead, PermissionProductSKURead}},
	{Key: "materials", Label: "材料档案", Path: "/erp/master/materials", RequiredPermissions: []string{PermissionMaterialRead}},
	{Key: "processes", Label: "工序档案", Path: "/erp/engineering/processes", RequiredPermissions: []string{PermissionProcessRead}},
	{Key: "sales-orders", Label: "销售订单", Path: "/erp/sales/project-orders/sales-orders", RequiredPermissions: []string{PermissionSalesOrderRead}},
	{Key: "material-bom", Label: "BOM 管理", Path: "/erp/purchase/material-bom", RequiredPermissions: []string{PermissionBOMRead}},
	{Key: "accessories-purchase", Label: "采购订单", Path: "/erp/purchase/accessories", RequiredPermissions: []string{PermissionPurchaseOrderRead}},
	{Key: "inbound", Label: "入库管理", Path: "/erp/warehouse/inbound", RequiredPermissions: []string{PermissionWarehouseInboundRead, PermissionPurchaseReceiptRead}},
	{Key: "quality-inspections", Label: "来料质检", Path: "/erp/production/quality-inspections", RequiredPermissions: []string{PermissionQualityInspectionRead}},
	{Key: "inventory", Label: "库存台账", Path: "/erp/warehouse/inventory", RequiredPermissions: []string{PermissionWarehouseInventoryRead}},
	{Key: "processing-contracts", Label: "委外订单", Path: "/erp/purchase/processing-contracts", RequiredPermissions: []string{PermissionOutsourcingOrderRead}},
	{Key: "production-scheduling", Label: "生产排程", Path: "/erp/production/scheduling", RequiredPermissions: []string{PermissionPMCPlanRead}},
	{Key: "production-progress", Label: "生产进度", Path: "/erp/production/progress", RequiredPermissions: []string{PermissionPMCPlanRead}},
	{Key: "production-exceptions", Label: "生产异常", Path: "/erp/production/exceptions", RequiredPermissions: []string{PermissionPMCRiskRead, PermissionQualityInspectionRead}},
	{Key: "shipping-release", Label: "出货放行", Path: "/erp/warehouse/shipping-release", RequiredPermissions: []string{PermissionWarehouseOutboundRead, PermissionFinanceReceivableRead, PermissionSalesOrderRead}},
	{Key: "outbound", Label: "出库管理", Path: "/erp/warehouse/outbound", RequiredPermissions: []string{PermissionWarehouseOutboundRead}},
	{Key: "shipments", Label: "出货单", Path: "/erp/warehouse/shipments", RequiredPermissions: []string{PermissionShipmentRead}},
	{Key: "reconciliation", Label: "对账管理", Path: "/erp/finance/reconciliation", RequiredPermissions: []string{PermissionFinanceReportRead, PermissionFinancePayableRead, PermissionFinanceReceivableRead}},
	{Key: "payables", Label: "应付管理", Path: "/erp/finance/payables", RequiredPermissions: []string{PermissionFinancePayableRead}},
	{Key: "receivables", Label: "应收管理", Path: "/erp/finance/receivables", RequiredPermissions: []string{PermissionFinanceReceivableRead}},
	{Key: "invoices", Label: "发票管理", Path: "/erp/finance/invoices", RequiredPermissions: []string{PermissionFinanceReceivableRead, PermissionFinancePayableRead}},
	{Key: "print-center", Label: "模板打印中心", Path: "/erp/print-center", RequiredPermissions: []string{PermissionERPPrintTemplateRead}},
	{Key: "exception-flow", Label: "异常 / 阻塞闭环", Path: "/erp/operations/exceptions", RequiredPermissions: []string{PermissionWorkflowTaskRead}},
	{Key: "permission-center", Label: "权限管理", Path: "/erp/system/permissions", RequiredPermissions: []string{PermissionSystemUserRead, PermissionSystemRoleRead}},
	{Key: "system-audit-logs", Label: "审计日志", Path: "/erp/system/audit-logs", RequiredPermissions: []string{PermissionSystemAuditRead}},
}

func BuiltinAdminMenus() []AdminMenu {
	out := make([]AdminMenu, 0, len(builtinAdminMenus))
	for _, item := range builtinAdminMenus {
		cloned := item
		cloned.RequiredPermissions = append([]string(nil), item.RequiredPermissions...)
		out = append(out, cloned)
	}
	return out
}

func AdminVisibleMenus(admin *AdminUser) []AdminMenu {
	if admin == nil || admin.Disabled {
		return []AdminMenu{}
	}
	if admin.IsSuperAdmin {
		return BuiltinAdminMenus()
	}
	permissionSet := PermissionKeySet(admin.Permissions)
	out := make([]AdminMenu, 0, len(builtinAdminMenus))
	for _, item := range builtinAdminMenus {
		if PermissionSetHasAny(permissionSet, item.RequiredPermissions...) {
			cloned := item
			cloned.RequiredPermissions = append([]string(nil), item.RequiredPermissions...)
			out = append(out, cloned)
		}
	}
	return out
}
