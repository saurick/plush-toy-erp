package biz

import "strings"

const (
	PermissionSystemUserRead             = "system.user.read"
	PermissionSystemUserCreate           = "system.user.create"
	PermissionSystemUserUpdate           = "system.user.update"
	PermissionSystemUserRoleAssign       = "system.user.role.assign"
	PermissionSystemUserDisable          = "system.user.disable"
	PermissionSystemUserRevoke           = "system.user.revoke"
	PermissionSystemRoleRead             = "system.role.read"
	PermissionSystemRolePermissionManage = "system.role.permission.manage"
	PermissionSystemPermissionRead       = "system.permission.read"
	PermissionSystemAuditRead            = "system.audit.read"
	PermissionCustomerConfigRead         = "customer_config.read"
	PermissionCustomerConfigPublish      = "customer_config.publish"
	PermissionCustomerConfigActivate     = "customer_config.activate"
	PermissionCustomerConfigRollback     = "customer_config.rollback"
	PermissionProcessRuntimeRecover      = "process_runtime.recover"

	PermissionERPWorkbenchRead          = "erp.workbench.read"
	PermissionERPBusinessDashboardRead  = "erp.business_dashboard.read"
	PermissionERPPrintTemplateRead      = "erp.print_template.read"
	PermissionERPBusinessChainDebugRead = "erp.business_chain_debug.read"

	PermissionFieldPartyPrivateRead          = "field.party_private.read"
	PermissionFieldSalesCommercialRead       = "field.sales_commercial.read"
	PermissionFieldProcurementCommercialRead = "field.procurement_commercial.read"
	PermissionFieldFinanceSettlementRead     = "field.finance_settlement.read"

	PermissionCustomerRead       = "customer.read"
	PermissionCustomerCreate     = "customer.create"
	PermissionCustomerUpdate     = "customer.update"
	PermissionCustomerDisable    = "customer.disable"
	PermissionSupplierRead       = "supplier.read"
	PermissionSupplierCreate     = "supplier.create"
	PermissionSupplierUpdate     = "supplier.update"
	PermissionSupplierDisable    = "supplier.disable"
	PermissionMaterialRead       = "material.read"
	PermissionMaterialCreate     = "material.create"
	PermissionMaterialUpdate     = "material.update"
	PermissionMaterialDisable    = "material.disable"
	PermissionProcessRead        = "process.read"
	PermissionProcessCreate      = "process.create"
	PermissionProcessUpdate      = "process.update"
	PermissionProcessDisable     = "process.disable"
	PermissionProductRead        = "product.read"
	PermissionProductCreate      = "product.create"
	PermissionProductUpdate      = "product.update"
	PermissionProductDisable     = "product.disable"
	PermissionProductSKURead     = "product_sku.read"
	PermissionProductSKUCreate   = "product_sku.create"
	PermissionProductSKUUpdate   = "product_sku.update"
	PermissionProductSKUDisable  = "product_sku.disable"
	PermissionBOMRead            = "bom.read"
	PermissionBOMCreate          = "bom.create"
	PermissionBOMUpdate          = "bom.update"
	PermissionBOMActivate        = "bom.activate"
	PermissionContactRead        = "contact.read"
	PermissionContactCreate      = "contact.create"
	PermissionContactUpdate      = "contact.update"
	PermissionContactDisable     = "contact.disable"
	PermissionContactSetPrimary  = "contact.set_primary"
	PermissionSalesOrderRead     = "sales_order.read"
	PermissionSalesOrderCreate   = "sales_order.create"
	PermissionSalesOrderUpdate   = "sales_order.update"
	PermissionSalesOrderSubmit   = "sales_order.submit"
	PermissionSalesOrderActivate = "sales_order.activate"
	PermissionSalesOrderClose    = "sales_order.close"
	PermissionSalesOrderCancel   = "sales_order.cancel"
	PermissionSalesOrderItemRead = "sales_order_item.read"

	PermissionWorkflowTaskRead      = "workflow.task.read"
	PermissionWorkflowTaskSupervise = "workflow.task.supervise"
	PermissionWorkflowTaskCreate    = "workflow.task.create"
	PermissionWorkflowTaskUpdate    = "workflow.task.update"
	PermissionWorkflowTaskAssign    = "workflow.task.assign"
	PermissionWorkflowTaskApprove   = "workflow.task.approve"
	PermissionWorkflowTaskReject    = "workflow.task.reject"
	PermissionWorkflowTaskComplete  = "workflow.task.complete"

	PermissionPurchaseOrderRead               = "purchase.order.read"
	PermissionPurchaseOrderCreate             = "purchase.order.create"
	PermissionPurchaseOrderUpdate             = "purchase.order.update"
	PermissionPurchaseOrderApprove            = "purchase.order.approve"
	PermissionOutsourcingOrderRead            = "outsourcing.order.read"
	PermissionOutsourcingOrderCreate          = "outsourcing.order.create"
	PermissionOutsourcingOrderUpdate          = "outsourcing.order.update"
	PermissionOutsourcingOrderConfirm         = "outsourcing.order.confirm"
	PermissionOutsourcingFactRead             = "outsourcing.fact.read"
	PermissionOutsourcingMaterialIssueCreate  = "outsourcing.material_issue.create"
	PermissionOutsourcingReturnReceiptCreate  = "outsourcing.return_receipt.create"
	PermissionOutsourcingFactPost             = "outsourcing.fact.post"
	PermissionOutsourcingFactCancel           = "outsourcing.fact.cancel"
	PermissionPurchaseReceiptRead             = "purchase.receipt.read"
	PermissionPurchaseReceiptCreate           = "purchase.receipt.create"
	PermissionPurchaseReceiptAdjustmentRead   = "purchase.receipt.adjustment.read"
	PermissionPurchaseReceiptAdjustmentCreate = "purchase.receipt.adjustment.create"
	PermissionPurchaseReceiptAdjustmentPost   = "purchase.receipt.adjustment.post"
	PermissionPurchaseReceiptAdjustmentCancel = "purchase.receipt.adjustment.cancel"
	PermissionPurchaseReturnRead              = "purchase.return.read"
	PermissionPurchaseReturnCreate            = "purchase.return.create"
	PermissionPurchaseReturnPost              = "purchase.return.post"
	PermissionPurchaseReturnCancel            = "purchase.return.cancel"
	PermissionWarehouseInventoryRead          = "warehouse.inventory.read"
	PermissionWarehouseInboundRead            = "warehouse.inbound.read"
	PermissionWarehouseInboundConfirm         = "warehouse.inbound.confirm"
	PermissionWarehouseOutboundRead           = "warehouse.outbound.read"
	PermissionWarehouseOutboundConfirm        = "warehouse.outbound.confirm"
	PermissionWarehouseAdjustmentCreate       = "warehouse.adjustment.create"
	PermissionStockReservationCreate          = "stock.reservation.create"
	PermissionStockReservationRelease         = "stock.reservation.release"
	PermissionShipmentRead                    = "shipment.read"
	PermissionShipmentCreate                  = "shipment.create"
	PermissionShipmentShip                    = "shipment.ship"
	PermissionShipmentCancel                  = "shipment.cancel"
	PermissionSalesReturnRead                 = "sales_return.read"
	PermissionSalesReturnCreate               = "sales_return.create"
	PermissionSalesReturnApprove              = "sales_return.approve"
	PermissionSalesReturnReceive              = "sales_return.receive"
	PermissionSalesReturnCancel               = "sales_return.cancel"
	PermissionQualityInspectionRead           = "quality.inspection.read"
	PermissionQualityInspectionCreate         = "quality.inspection.create"
	PermissionQualityInspectionUpdate         = "quality.inspection.update"
	PermissionQualityExceptionHandle          = "quality.exception.handle"
	PermissionFinancePayableRead              = "finance.payable.read"
	PermissionFinancePayableConfirm           = "finance.payable.confirm"
	PermissionFinanceInvoiceRead              = "finance.invoice.read"
	PermissionFinanceInvoiceConfirm           = "finance.invoice.confirm"
	PermissionFinanceReceivableRead           = "finance.receivable.read"
	PermissionFinanceReceivableConfirm        = "finance.receivable.confirm"
	PermissionFinanceReconciliationRead       = "finance.reconciliation.read"
	PermissionFinanceReconciliationConfirm    = "finance.reconciliation.confirm"
	PermissionFinanceReportRead               = "finance.report.read"
	PermissionFinancePaymentRead              = "finance.payment.read"
	PermissionFinancePaymentCreate            = "finance.payment.create"
	PermissionFinancePaymentPost              = "finance.payment.post"
	PermissionFinancePaymentReverse           = "finance.payment.reverse"
	PermissionFinanceCreditNoteCreate         = "finance.credit_note.create"
	PermissionFinanceCreditNoteReverse        = "finance.credit_note.reverse"
	PermissionProductionFactRead              = "production.fact.read"
	PermissionProductionWIPRead               = "production.wip.read"
	PermissionProductionWIPAssign             = "production.wip.assign"
	PermissionProductionWIPExecute            = "production.wip.execute"
	PermissionProductionWIPRework             = "production.wip.rework"
	PermissionPackagingMaterialConfirm        = "production.packaging_material.confirm"
	PermissionProductionCompletionCreate      = "production.completion.create"
	PermissionProductionMaterialIssueCreate   = "production.material_issue.create"
	PermissionProductionReworkCreate          = "production.rework.create"
	PermissionProductionFactPost              = "production.fact.post"
	PermissionProductionFactCancel            = "production.fact.cancel"
	PermissionPMCPlanRead                     = "pmc.plan.read"
	PermissionPMCPlanCreate                   = "pmc.plan.create"
	PermissionPMCPlanUpdate                   = "pmc.plan.update"
	PermissionPMCRiskRead                     = "pmc.risk.read"
	PermissionPMCRiskHandle                   = "pmc.risk.handle"

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

type PermissionClass string

const (
	PermissionClassBusiness     PermissionClass = "business"
	PermissionClassControlPlane PermissionClass = "control_plane"
	PermissionClassDebug        PermissionClass = "debug"
)

type RoleType string

const (
	RoleTypeSystem          RoleType = "system"
	RoleTypeBusinessDefault RoleType = "business_default"
	RoleTypeCustom          RoleType = "custom"
)

type PermissionDefinition struct {
	Key               string
	Name              string
	Description       string
	Module            string
	Action            string
	Resource          string
	Builtin           bool
	Class             PermissionClass
	Assignable        bool
	NonProductionOnly bool
}

type RoleDefinition struct {
	Key         string
	Name        string
	Description string
	Builtin     bool
	Disabled    bool
	SortOrder   int
	Type        RoleType
	Version     int
	Permissions []string
}

type AdminRole struct {
	ID               int
	Key              string
	Name             string
	Description      string
	Builtin          bool
	Disabled         bool
	SortOrder        int
	Type             RoleType
	Version          int
	NavigationMode   RoleNavigationMode
	PrimaryMenuPaths []string
	Permissions      []string
	DataScopes       []RoleDataScope
}

type AdminPermission struct {
	ID                int
	Key               string
	Name              string
	Description       string
	Module            string
	Action            string
	Resource          string
	Builtin           bool
	Class             PermissionClass
	Assignable        bool
	NonProductionOnly bool
}

type AdminMenu struct {
	Key         string
	Label       string
	Path        string
	RequiredAny []string
	RequiredAll []string
}

var builtinPermissions = withBuiltinPermissionMetadata([]PermissionDefinition{
	{Key: PermissionSystemUserRead, Name: "查看管理员", Module: "system", Action: "read", Resource: "admin_user", Builtin: true},
	{Key: PermissionSystemUserCreate, Name: "创建管理员", Module: "system", Action: "create", Resource: "admin_user", Builtin: true},
	{Key: PermissionSystemUserUpdate, Name: "更新管理员", Module: "system", Action: "update", Resource: "admin_user", Builtin: true},
	{Key: PermissionSystemUserRoleAssign, Name: "分配管理员角色", Description: "只允许分配可委派的业务角色；系统角色仍由超级管理员边界保护。", Module: "system", Action: "assign", Resource: "admin_user_role", Builtin: true},
	{Key: PermissionSystemUserDisable, Name: "启停管理员", Module: "system", Action: "disable", Resource: "admin_user", Builtin: true},
	{Key: PermissionSystemUserRevoke, Name: "注销管理员账号", Description: "用于员工离职等正式退出场景；保留历史身份并退回未完成个人待办。", Module: "system", Action: "revoke", Resource: "admin_user", Builtin: true},
	{Key: PermissionSystemRoleRead, Name: "查看角色", Module: "system", Action: "read", Resource: "role", Builtin: true},
	{Key: PermissionSystemRolePermissionManage, Name: "维护业务角色权限", Description: "只允许维护业务默认或自定义角色中的可委派业务权限。", Module: "system", Action: "manage", Resource: "role_permission", Builtin: true},
	{Key: PermissionSystemPermissionRead, Name: "查看权限码", Module: "system", Action: "read", Resource: "permission", Builtin: true},
	{Key: PermissionSystemAuditRead, Name: "查看系统审计日志", Module: "system", Action: "read", Resource: "audit_log", Builtin: true},
	{Key: PermissionCustomerConfigRead, Name: "查看客户配置版本", Module: "customer_config", Action: "read", Resource: "revision", Builtin: true},
	{Key: PermissionCustomerConfigPublish, Name: "发布客户配置版本", Module: "customer_config", Action: "publish", Resource: "revision", Builtin: true},
	{Key: PermissionCustomerConfigActivate, Name: "激活客户配置版本", Module: "customer_config", Action: "activate", Resource: "revision", Builtin: true},
	{Key: PermissionCustomerConfigRollback, Name: "回滚客户配置版本", Module: "customer_config", Action: "rollback", Resource: "revision", Builtin: true},
	{Key: PermissionProcessRuntimeRecover, Name: "恢复异常流程运行实例", Module: "process_runtime", Action: "recover", Resource: "domain_command", Builtin: true},
	{Key: PermissionERPWorkbenchRead, Name: "查看岗位工作台", Description: "查看本岗位待办、风险、阻塞和来源单据入口；任务读写仍由 workflow.task.* 单独控制。", Module: "erp", Action: "read", Resource: "workbench", Builtin: true},
	{Key: PermissionERPBusinessDashboardRead, Name: "查看业务看板", Description: "查看跨部门业务统计；不授予来源单据编辑权。", Module: "erp", Action: "read", Resource: "business_dashboard", Builtin: true},
	{Key: PermissionERPPrintTemplateRead, Name: "查看打印模板", Module: "erp", Action: "read", Resource: "print_template", Builtin: true},
	{Key: PermissionERPBusinessChainDebugRead, Name: "查看业务链路调试能力", Module: "erp", Action: "read", Resource: "business_chain_debug", Builtin: true},
	{Key: PermissionFieldPartyPrivateRead, Name: "查看往来单位隐私字段", Description: "查看客户、供应商和联系人中的电话、地址、税号及账户等隐私字段。", Module: "field", Action: "read", Resource: "party_private", Builtin: true},
	{Key: PermissionFieldSalesCommercialRead, Name: "查看销售商业字段", Description: "查看销售单价、折扣和销售金额等商业字段。", Module: "field", Action: "read", Resource: "sales_commercial", Builtin: true},
	{Key: PermissionFieldProcurementCommercialRead, Name: "查看采购商业字段", Description: "查看采购或委外单价、折扣和金额等商业字段。", Module: "field", Action: "read", Resource: "procurement_commercial", Builtin: true},
	{Key: PermissionFieldFinanceSettlementRead, Name: "查看财务结算字段", Description: "查看应收、应付、开票、核销、收付款和账户等结算字段。", Module: "field", Action: "read", Resource: "finance_settlement", Builtin: true},
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
	{Key: PermissionWorkflowTaskRead, Name: "查看协同任务", Module: "workflow", Action: "read", Resource: "task", Builtin: true},
	{Key: PermissionWorkflowTaskSupervise, Name: "监督跨岗位协同任务", Description: "只读查看其他责任岗位的协同任务；不授予代办、转派或完成权限。", Module: "workflow", Action: "supervise", Resource: "task", Builtin: true},
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
	{Key: PermissionOutsourcingFactRead, Name: "查看委外记录", Module: "outsourcing", Action: "read", Resource: "fact", Builtin: true},
	{Key: PermissionOutsourcingMaterialIssueCreate, Name: "登记委外发料", Module: "outsourcing", Action: "create", Resource: "material_issue", Builtin: true},
	{Key: PermissionOutsourcingReturnReceiptCreate, Name: "登记委外回货", Module: "outsourcing", Action: "create", Resource: "return_receipt", Builtin: true},
	{Key: PermissionOutsourcingFactPost, Name: "确认委外记录", Module: "outsourcing", Action: "post", Resource: "fact", Builtin: true},
	{Key: PermissionOutsourcingFactCancel, Name: "取消委外记录", Module: "outsourcing", Action: "cancel", Resource: "fact", Builtin: true},
	{Key: PermissionPurchaseReceiptRead, Name: "查看采购入库", Module: "purchase", Action: "read", Resource: "receipt", Builtin: true},
	{Key: PermissionPurchaseReceiptCreate, Name: "创建采购入库", Module: "purchase", Action: "create", Resource: "receipt", Builtin: true},
	{Key: PermissionPurchaseReceiptAdjustmentRead, Name: "查看入库调整", Module: "purchase", Action: "read", Resource: "receipt_adjustment", Builtin: true},
	{Key: PermissionPurchaseReceiptAdjustmentCreate, Name: "创建入库调整", Module: "purchase", Action: "create", Resource: "receipt_adjustment", Builtin: true},
	{Key: PermissionPurchaseReceiptAdjustmentPost, Name: "确认入库调整", Module: "purchase", Action: "post", Resource: "receipt_adjustment", Builtin: true},
	{Key: PermissionPurchaseReceiptAdjustmentCancel, Name: "取消入库调整", Module: "purchase", Action: "cancel", Resource: "receipt_adjustment", Builtin: true},
	{Key: PermissionPurchaseReturnRead, Name: "查看采购退货", Module: "purchase", Action: "read", Resource: "return", Builtin: true},
	{Key: PermissionPurchaseReturnCreate, Name: "创建采购退货", Module: "purchase", Action: "create", Resource: "return", Builtin: true},
	{Key: PermissionPurchaseReturnPost, Name: "确认采购退货", Module: "purchase", Action: "post", Resource: "return", Builtin: true},
	{Key: PermissionPurchaseReturnCancel, Name: "取消采购退货", Module: "purchase", Action: "cancel", Resource: "return", Builtin: true},
	{Key: PermissionWarehouseInventoryRead, Name: "查看库存", Module: "warehouse", Action: "read", Resource: "inventory", Builtin: true},
	{Key: PermissionWarehouseInboundRead, Name: "查看入库", Module: "warehouse", Action: "read", Resource: "inbound", Builtin: true},
	{Key: PermissionWarehouseInboundConfirm, Name: "确认入库", Module: "warehouse", Action: "confirm", Resource: "inbound", Builtin: true},
	{Key: PermissionWarehouseOutboundRead, Name: "查看出库", Module: "warehouse", Action: "read", Resource: "outbound", Builtin: true},
	{Key: PermissionWarehouseOutboundConfirm, Name: "确认出库", Module: "warehouse", Action: "confirm", Resource: "outbound", Builtin: true},
	{Key: PermissionWarehouseAdjustmentCreate, Name: "创建库存调整", Module: "warehouse", Action: "create", Resource: "adjustment", Builtin: true},
	{Key: PermissionStockReservationCreate, Name: "创建库存预留", Module: "warehouse", Action: "create", Resource: "stock_reservation", Builtin: true},
	{Key: PermissionStockReservationRelease, Name: "释放库存预留", Module: "warehouse", Action: "release", Resource: "stock_reservation", Builtin: true},
	{Key: PermissionShipmentRead, Name: "查看出货单", Module: "shipment", Action: "read", Resource: "shipment", Builtin: true},
	{Key: PermissionShipmentCreate, Name: "创建出货单", Module: "shipment", Action: "create", Resource: "shipment", Builtin: true},
	{Key: PermissionShipmentShip, Name: "确认出货", Module: "shipment", Action: "ship", Resource: "shipment", Builtin: true},
	{Key: PermissionShipmentCancel, Name: "取消出货单", Module: "shipment", Action: "cancel", Resource: "shipment", Builtin: true},
	{Key: PermissionSalesReturnRead, Name: "查看客户退货", Module: "sales_return", Action: "read", Resource: "return", Builtin: true},
	{Key: PermissionSalesReturnCreate, Name: "发起客户退货", Module: "sales_return", Action: "create", Resource: "return", Builtin: true},
	{Key: PermissionSalesReturnApprove, Name: "审批客户退货", Module: "sales_return", Action: "approve", Resource: "return", Builtin: true},
	{Key: PermissionSalesReturnReceive, Name: "确认客户退货入库", Module: "sales_return", Action: "receive", Resource: "return", Builtin: true},
	{Key: PermissionSalesReturnCancel, Name: "取消客户退货", Module: "sales_return", Action: "cancel", Resource: "return", Builtin: true},
	{Key: PermissionQualityInspectionRead, Name: "查看质检", Module: "quality", Action: "read", Resource: "inspection", Builtin: true},
	{Key: PermissionQualityInspectionCreate, Name: "创建质检", Module: "quality", Action: "create", Resource: "inspection", Builtin: true},
	{Key: PermissionQualityInspectionUpdate, Name: "更新质检", Module: "quality", Action: "update", Resource: "inspection", Builtin: true},
	{Key: PermissionQualityExceptionHandle, Name: "处理品质异常", Module: "quality", Action: "handle", Resource: "exception", Builtin: true},
	{Key: PermissionFinancePayableRead, Name: "查看应付", Module: "finance", Action: "read", Resource: "payable", Builtin: true},
	{Key: PermissionFinancePayableConfirm, Name: "确认应付", Module: "finance", Action: "confirm", Resource: "payable", Builtin: true},
	{Key: PermissionFinanceInvoiceRead, Name: "查看发票", Module: "finance", Action: "read", Resource: "invoice", Builtin: true},
	{Key: PermissionFinanceInvoiceConfirm, Name: "确认发票", Module: "finance", Action: "confirm", Resource: "invoice", Builtin: true},
	{Key: PermissionFinanceReceivableRead, Name: "查看应收", Module: "finance", Action: "read", Resource: "receivable", Builtin: true},
	{Key: PermissionFinanceReceivableConfirm, Name: "确认应收", Module: "finance", Action: "confirm", Resource: "receivable", Builtin: true},
	{Key: PermissionFinanceReconciliationRead, Name: "查看对账", Module: "finance", Action: "read", Resource: "reconciliation", Builtin: true},
	{Key: PermissionFinanceReconciliationConfirm, Name: "处理对账", Module: "finance", Action: "confirm", Resource: "reconciliation", Builtin: true},
	{Key: PermissionFinanceReportRead, Name: "查看财务报表", Module: "finance", Action: "read", Resource: "report", Builtin: true},
	{Key: PermissionFinancePaymentRead, Name: "查看收付款", Module: "finance", Action: "read", Resource: "payment", Builtin: true},
	{Key: PermissionFinancePaymentCreate, Name: "登记收付款", Module: "finance", Action: "create", Resource: "payment", Builtin: true},
	{Key: PermissionFinancePaymentPost, Name: "确认并核销收付款", Module: "finance", Action: "post", Resource: "payment", Builtin: true},
	{Key: PermissionFinancePaymentReverse, Name: "冲销收付款", Module: "finance", Action: "reverse", Resource: "payment", Builtin: true},
	{Key: PermissionFinanceCreditNoteCreate, Name: "创建财务红冲", Module: "finance", Action: "create", Resource: "credit_note", Builtin: true},
	{Key: PermissionFinanceCreditNoteReverse, Name: "撤销财务红冲", Module: "finance", Action: "reverse", Resource: "credit_note", Builtin: true},
	{Key: PermissionProductionFactRead, Name: "查看生产记录", Module: "production", Action: "read", Resource: "fact", Builtin: true},
	{Key: PermissionProductionWIPRead, Name: "查看在制路线", Module: "production", Action: "read", Resource: "wip", Builtin: true},
	{Key: PermissionProductionWIPAssign, Name: "安排在制加工", Module: "production", Action: "assign", Resource: "wip", Builtin: true},
	{Key: PermissionProductionWIPExecute, Name: "办理在制移交", Module: "production", Action: "execute", Resource: "wip", Builtin: true},
	{Key: PermissionProductionWIPRework, Name: "安排在制返工", Module: "production", Action: "rework", Resource: "wip", Builtin: true},
	{Key: PermissionPackagingMaterialConfirm, Name: "确认包材版面", Module: "production", Action: "confirm", Resource: "packaging_material", Builtin: true},
	{Key: PermissionProductionCompletionCreate, Name: "登记生产完工", Module: "production", Action: "create", Resource: "completion", Builtin: true},
	{Key: PermissionProductionMaterialIssueCreate, Name: "登记生产领料", Module: "production", Action: "create", Resource: "material_issue", Builtin: true},
	{Key: PermissionProductionReworkCreate, Name: "发起生产返工", Module: "production", Action: "create", Resource: "rework", Builtin: true},
	{Key: PermissionProductionFactPost, Name: "确认生产记录", Module: "production", Action: "post", Resource: "fact", Builtin: true},
	{Key: PermissionProductionFactCancel, Name: "取消生产记录", Module: "production", Action: "cancel", Resource: "fact", Builtin: true},
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
})

func withBuiltinPermissionMetadata(items []PermissionDefinition) []PermissionDefinition {
	for index := range items {
		item := &items[index]
		switch {
		case item.Module == "debug" || item.Key == PermissionERPBusinessChainDebugRead:
			item.Class = PermissionClassDebug
			item.Assignable = false
			item.NonProductionOnly = true
		case item.Module == "system" || item.Module == "customer_config":
			item.Class = PermissionClassControlPlane
			item.Assignable = false
		default:
			item.Class = PermissionClassBusiness
			item.Assignable = true
		}
	}
	return items
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

func AllPermissionDefinitions() []PermissionDefinition {
	return BuiltinPermissions()
}

func PermissionDefinitionByKey(permissionKey string) (PermissionDefinition, bool) {
	permissionKey = strings.TrimSpace(permissionKey)
	for _, item := range builtinPermissions {
		if item.Key == permissionKey {
			return item, true
		}
	}
	return PermissionDefinition{}, false
}

func ValidateAssignablePermissionKeys(permissionKeys []string) error {
	normalized, err := NormalizePermissionKeysStrict(permissionKeys)
	if err != nil {
		return err
	}
	for _, key := range normalized {
		definition, ok := PermissionDefinitionByKey(key)
		if !ok {
			return ErrPermissionNotFound
		}
		if definition.Class != PermissionClassBusiness || !definition.Assignable || definition.NonProductionOnly {
			return ErrPermissionNotDelegable
		}
	}
	return nil
}

func NormalizeRoleType(value RoleType, roleKey string, builtin bool) RoleType {
	roleKey = NormalizeRoleKey(roleKey)
	if roleKey == AdminRoleKey || roleKey == DebugOperatorRoleKey {
		return RoleTypeSystem
	}
	switch RoleType(strings.ToLower(strings.TrimSpace(string(value)))) {
	case RoleTypeSystem:
		return RoleTypeSystem
	case RoleTypeBusinessDefault:
		return RoleTypeBusinessDefault
	case RoleTypeCustom:
		return RoleTypeCustom
	}
	if builtin {
		return RoleTypeBusinessDefault
	}
	return RoleTypeCustom
}

func IsSystemManagedRole(role AdminRole) bool {
	return NormalizeRoleType(role.Type, role.Key, role.Builtin) == RoleTypeSystem
}

func IsDebugRole(role AdminRole) bool {
	return NormalizeRoleKey(role.Key) == DebugOperatorRoleKey
}

func AdminHasSystemManagedRole(admin *AdminUser) bool {
	if admin == nil {
		return false
	}
	for _, role := range admin.Roles {
		if IsSystemManagedRole(role) {
			return true
		}
	}
	return false
}

// ValidateAdminControlTarget protects system-managed identities at the business boundary.
// Repositories repeat this check after locking the target so stale reads cannot bypass it.
func ValidateAdminControlTarget(operator, target *AdminUser) error {
	if operator == nil || target == nil {
		return ErrBadParam
	}
	if target.IsSuperAdmin {
		return ErrNoPermission
	}
	if !operator.IsSuperAdmin && AdminHasSystemManagedRole(target) {
		return ErrPrivilegedAdminTargetForbidden
	}
	return nil
}

func RoleAssignmentEnvironmentAllowsDebug(environment string) bool {
	environment = normalizeDebugEnvironment(environment)
	return environment == "local" || environment == "dev"
}

func ValidateRoleAssignment(role AdminRole, operatorIsSuperAdmin bool, environment string) error {
	if role.Disabled || NormalizeRoleKey(role.Key) == "" {
		return ErrRoleNotFound
	}
	if IsSystemManagedRole(role) {
		if !operatorIsSuperAdmin {
			return ErrPrivilegedRoleAssignmentForbidden
		}
		if IsDebugRole(role) && !RoleAssignmentEnvironmentAllowsDebug(environment) {
			return ErrDebugRoleProductionForbidden
		}
		return nil
	}
	return ValidateAssignablePermissionKeys(role.Permissions)
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

func NormalizePermissionKeysStrict(input []string) ([]string, error) {
	for _, raw := range input {
		key := strings.TrimSpace(raw)
		if key == "" {
			continue
		}
		if _, ok := builtinPermissionKeySet[key]; !ok {
			return nil, ErrPermissionNotFound
		}
	}
	return NormalizePermissionKeys(input), nil
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
		PermissionERPWorkbenchRead,
		PermissionERPBusinessDashboardRead,
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
		PermissionOutsourcingFactRead,
		PermissionPurchaseReceiptRead,
		PermissionPurchaseReceiptAdjustmentRead,
		PermissionPurchaseReturnRead,
		PermissionWarehouseInventoryRead,
		PermissionWarehouseInboundRead,
		PermissionWarehouseOutboundRead,
		PermissionShipmentRead,
		PermissionSalesReturnRead,
		PermissionQualityInspectionRead,
		PermissionFinancePayableRead,
		PermissionFinanceInvoiceRead,
		PermissionFinanceReceivableRead,
		PermissionFinanceReconciliationRead,
		PermissionFinanceReportRead,
		PermissionFinancePaymentRead,
		PermissionProductionFactRead,
		PermissionProductionWIPRead,
		PermissionPMCPlanRead,
		PermissionPMCRiskRead,
	}
	roles := []RoleDefinition{
		{Key: BossRoleKey, Name: "老板 / 管理层", Description: "查看全局业务、审批和报表，不默认包含高危 debug 清空权限。", Builtin: true, SortOrder: 10, Permissions: append(readPermissions, PermissionFieldPartyPrivateRead, PermissionFieldSalesCommercialRead, PermissionFieldProcurementCommercialRead, PermissionFieldFinanceSettlementRead, PermissionProductionFactRead, PermissionWorkflowTaskSupervise, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskApprove, PermissionWorkflowTaskReject, PermissionPurchaseOrderApprove, PermissionSalesReturnApprove, PermissionSalesReturnCancel, PermissionMobileBossAccess)},
		{Key: SalesRoleKey, Name: "业务", Description: "客户、订单、出运跟进，任务处理仍受销售 责任岗位和当前处理人 约束。", Builtin: true, SortOrder: 20, Permissions: []string{PermissionERPWorkbenchRead, PermissionERPPrintTemplateRead, PermissionFieldPartyPrivateRead, PermissionFieldSalesCommercialRead, PermissionCustomerRead, PermissionCustomerCreate, PermissionCustomerUpdate, PermissionCustomerDisable, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionProductCreate, PermissionProductUpdate, PermissionProductDisable, PermissionProductSKURead, PermissionProductSKUCreate, PermissionProductSKUUpdate, PermissionProductSKUDisable, PermissionBOMRead, PermissionContactRead, PermissionContactCreate, PermissionContactUpdate, PermissionContactDisable, PermissionContactSetPrimary, PermissionSalesOrderRead, PermissionSalesOrderCreate, PermissionSalesOrderUpdate, PermissionSalesOrderSubmit, PermissionSalesOrderActivate, PermissionSalesOrderClose, PermissionSalesOrderCancel, PermissionSalesOrderItemRead, PermissionWarehouseInventoryRead, PermissionStockReservationCreate, PermissionStockReservationRelease, PermissionShipmentRead, PermissionShipmentCreate, PermissionSalesReturnRead, PermissionSalesReturnCreate, PermissionProductionWIPRead, PermissionPackagingMaterialConfirm, PermissionWorkflowTaskRead, PermissionWorkflowTaskCreate, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionMobileSalesAccess}},
		{Key: PurchaseRoleKey, Name: "采购", Description: "采购、收货、退货相关入口，任务处理仍受采购 责任岗位和当前处理人 约束。", Builtin: true, SortOrder: 30, Permissions: []string{PermissionERPWorkbenchRead, PermissionERPPrintTemplateRead, PermissionFieldPartyPrivateRead, PermissionFieldProcurementCommercialRead, PermissionSupplierRead, PermissionSupplierCreate, PermissionSupplierUpdate, PermissionSupplierDisable, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionMaterialCreate, PermissionMaterialUpdate, PermissionMaterialDisable, PermissionProductSKURead, PermissionBOMRead, PermissionContactRead, PermissionContactCreate, PermissionContactUpdate, PermissionContactDisable, PermissionContactSetPrimary, PermissionWorkflowTaskRead, PermissionWorkflowTaskCreate, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionPurchaseOrderRead, PermissionPurchaseOrderCreate, PermissionPurchaseOrderUpdate, PermissionOutsourcingOrderRead, PermissionOutsourcingOrderCreate, PermissionOutsourcingOrderUpdate, PermissionOutsourcingOrderConfirm, PermissionOutsourcingFactRead, PermissionOutsourcingReturnReceiptCreate, PermissionPurchaseReceiptRead, PermissionPurchaseReceiptCreate, PermissionPurchaseReceiptAdjustmentRead, PermissionPurchaseReceiptAdjustmentCreate, PermissionPurchaseReceiptAdjustmentPost, PermissionPurchaseReceiptAdjustmentCancel, PermissionPurchaseReturnRead, PermissionPurchaseReturnCreate, PermissionPurchaseReturnPost, PermissionPurchaseReturnCancel, PermissionWarehouseInventoryRead, PermissionMobilePurchaseAccess}},
		{Key: WarehouseRoleKey, Name: "仓库", Description: "库存、入库、出库、盘点相关入口，任务处理仍受仓库 责任岗位和当前处理人 约束。", Builtin: true, SortOrder: 40, Permissions: []string{PermissionERPWorkbenchRead, PermissionCustomerRead, PermissionSupplierRead, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionProductSKURead, PermissionSalesOrderRead, PermissionSalesOrderItemRead, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionPurchaseReceiptRead, PermissionPurchaseReceiptAdjustmentRead, PermissionPurchaseReceiptAdjustmentCreate, PermissionPurchaseReceiptAdjustmentPost, PermissionPurchaseReceiptAdjustmentCancel, PermissionPurchaseReturnRead, PermissionPurchaseReturnCreate, PermissionPurchaseReturnPost, PermissionPurchaseReturnCancel, PermissionOutsourcingFactRead, PermissionOutsourcingMaterialIssueCreate, PermissionOutsourcingReturnReceiptCreate, PermissionOutsourcingFactPost, PermissionOutsourcingFactCancel, PermissionWarehouseInventoryRead, PermissionWarehouseInboundRead, PermissionWarehouseInboundConfirm, PermissionWarehouseOutboundRead, PermissionWarehouseOutboundConfirm, PermissionWarehouseAdjustmentCreate, PermissionStockReservationCreate, PermissionStockReservationRelease, PermissionShipmentRead, PermissionShipmentCreate, PermissionShipmentShip, PermissionShipmentCancel, PermissionSalesReturnRead, PermissionSalesReturnReceive, PermissionMobileWarehouseAccess}},
		{Key: QualityRoleKey, Name: "品质", Description: "检验、异常、返工相关入口，任务处理仍受品质 责任岗位和当前处理人 约束。", Builtin: true, SortOrder: 50, Permissions: []string{PermissionERPWorkbenchRead, PermissionCustomerRead, PermissionSupplierRead, PermissionContactRead, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionProductSKURead, PermissionSalesOrderRead, PermissionSalesOrderItemRead, PermissionOutsourcingOrderRead, PermissionOutsourcingFactRead, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionPurchaseReceiptRead, PermissionPurchaseReturnRead, PermissionPurchaseReturnCreate, PermissionWarehouseInventoryRead, PermissionShipmentRead, PermissionSalesReturnRead, PermissionProductionWIPRead, PermissionQualityInspectionRead, PermissionQualityInspectionCreate, PermissionQualityInspectionUpdate, PermissionQualityExceptionHandle, PermissionMobileQualityAccess}},
		{Key: FinanceRoleKey, Name: "财务", Description: "应收、应付、发票、对账、收付款和财务报表相关入口，任务处理仍受财务 责任岗位和当前处理人 约束。", Builtin: true, SortOrder: 60, Permissions: []string{PermissionERPWorkbenchRead, PermissionERPPrintTemplateRead, PermissionFieldPartyPrivateRead, PermissionFieldSalesCommercialRead, PermissionFieldProcurementCommercialRead, PermissionFieldFinanceSettlementRead, PermissionCustomerRead, PermissionSupplierRead, PermissionContactRead, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionProductSKURead, PermissionOutsourcingOrderRead, PermissionOutsourcingFactRead, PermissionPurchaseReceiptRead, PermissionPurchaseReceiptAdjustmentRead, PermissionPurchaseReturnRead, PermissionQualityInspectionRead, PermissionSalesOrderRead, PermissionSalesOrderItemRead, PermissionWarehouseInventoryRead, PermissionShipmentRead, PermissionSalesReturnRead, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionFinancePayableRead, PermissionFinancePayableConfirm, PermissionFinanceInvoiceRead, PermissionFinanceInvoiceConfirm, PermissionFinanceReceivableRead, PermissionFinanceReceivableConfirm, PermissionFinanceReconciliationRead, PermissionFinanceReconciliationConfirm, PermissionFinanceReportRead, PermissionFinancePaymentRead, PermissionFinancePaymentCreate, PermissionFinancePaymentPost, PermissionFinancePaymentReverse, PermissionFinanceCreditNoteCreate, PermissionFinanceCreditNoteReverse, PermissionMobileFinanceAccess}},
		{Key: PMCRoleKey, Name: "PMC", Description: "生产计划、进度和风险跟进；可查看风险，不等于可代替其他角色完成任务。", Builtin: true, SortOrder: 70, Permissions: []string{PermissionERPWorkbenchRead, PermissionMaterialRead, PermissionProcessRead, PermissionProcessCreate, PermissionProcessUpdate, PermissionProcessDisable, PermissionProductRead, PermissionMaterialCreate, PermissionMaterialUpdate, PermissionProductCreate, PermissionProductUpdate, PermissionProductDisable, PermissionProductSKURead, PermissionProductSKUCreate, PermissionProductSKUUpdate, PermissionProductSKUDisable, PermissionBOMRead, PermissionBOMCreate, PermissionBOMUpdate, PermissionBOMActivate, PermissionShipmentRead, PermissionWorkflowTaskRead, PermissionWorkflowTaskSupervise, PermissionWorkflowTaskCreate, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionProductionFactRead, PermissionProductionWIPRead, PermissionPMCPlanRead, PermissionPMCPlanCreate, PermissionPMCPlanUpdate, PermissionPMCRiskRead, PermissionPMCRiskHandle, PermissionMobilePMCAccess}},
		{Key: ProductionRoleKey, Name: "生产", Description: "排产、委外加工、进度、返工和生产异常处理，任务处理仍受生产 责任岗位和当前处理人 约束。", Builtin: true, SortOrder: 80, Permissions: []string{PermissionERPWorkbenchRead, PermissionERPPrintTemplateRead, PermissionFieldPartyPrivateRead, PermissionFieldProcurementCommercialRead, PermissionSupplierRead, PermissionMaterialRead, PermissionProcessRead, PermissionProductRead, PermissionProductSKURead, PermissionContactRead, PermissionOutsourcingOrderRead, PermissionOutsourcingOrderCreate, PermissionOutsourcingOrderUpdate, PermissionOutsourcingOrderConfirm, PermissionOutsourcingFactRead, PermissionOutsourcingMaterialIssueCreate, PermissionOutsourcingReturnReceiptCreate, PermissionOutsourcingFactPost, PermissionOutsourcingFactCancel, PermissionWarehouseInventoryRead, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionProductionFactRead, PermissionProductionWIPRead, PermissionProductionWIPAssign, PermissionProductionWIPExecute, PermissionProductionWIPRework, PermissionProductionCompletionCreate, PermissionProductionMaterialIssueCreate, PermissionProductionReworkCreate, PermissionProductionFactPost, PermissionProductionFactCancel, PermissionPMCPlanRead, PermissionPMCPlanUpdate, PermissionPMCRiskRead, PermissionPMCRiskHandle, PermissionMobileProductionAccess}},
		{Key: EngineeringRoleKey, Name: "工程", Description: "产品资料、材料、工艺、BOM 和工程资料任务入口，任务处理仍受工程 责任岗位和当前处理人 约束。", Builtin: true, SortOrder: 90, Permissions: []string{PermissionERPWorkbenchRead, PermissionERPPrintTemplateRead, PermissionMaterialRead, PermissionMaterialCreate, PermissionMaterialUpdate, PermissionMaterialDisable, PermissionProcessRead, PermissionProcessCreate, PermissionProcessUpdate, PermissionProcessDisable, PermissionProductRead, PermissionProductCreate, PermissionProductUpdate, PermissionProductSKURead, PermissionProductSKUCreate, PermissionProductSKUUpdate, PermissionBOMRead, PermissionBOMCreate, PermissionBOMUpdate, PermissionBOMActivate, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionMobileEngineeringAccess}},
		{Key: AdminRoleKey, Name: "系统管理员", Description: "管理管理员、角色权限和基础配置，不天然拥有业务事实处理权。", Builtin: true, SortOrder: 100, Permissions: []string{PermissionSystemUserRead, PermissionSystemUserCreate, PermissionSystemUserUpdate, PermissionSystemUserRoleAssign, PermissionSystemUserDisable, PermissionSystemUserRevoke, PermissionSystemRoleRead, PermissionSystemRolePermissionManage, PermissionSystemPermissionRead, PermissionSystemAuditRead, PermissionCustomerConfigRead, PermissionCustomerConfigPublish, PermissionCustomerConfigActivate, PermissionCustomerConfigRollback, PermissionProcessRuntimeRecover}},
		{Key: DebugOperatorRoleKey, Name: "调试操作员", Description: "仅限明确开启的本地开发环境分配和使用的调试角色。", Builtin: true, SortOrder: 110, Permissions: []string{PermissionERPBusinessChainDebugRead, PermissionDebugBusinessChainRead, PermissionDebugBusinessChainRun, PermissionDebugSeed, PermissionDebugCleanup, PermissionDebugBusinessClear}},
	}
	for index := range roles {
		switch roles[index].Key {
		case FinanceRoleKey:
			roles[index].Permissions = append(roles[index].Permissions, PermissionWorkflowTaskApprove)
		}
		if roles[index].Key == PMCRoleKey {
			roles[index].Permissions = append(roles[index].Permissions, PermissionERPBusinessDashboardRead)
		}
		roles[index].Version = 1
		roles[index].Type = NormalizeRoleType("", roles[index].Key, roles[index].Builtin)
	}
	return roles
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
	if !admin.IsActive() {
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
	if normalized == "" || !admin.IsActive() {
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
	if admin != nil && admin.IsSuperAdmin {
		return AdminHasRole(admin, roleKey)
	}
	return AdminHasPermission(admin, permissionKey)
}

var builtinAdminMenus = []AdminMenu{
	{Key: "global-dashboard", Label: "工作台", Path: "/erp/dashboard", RequiredAny: []string{PermissionERPWorkbenchRead}},
	{Key: "task-board", Label: "任务看板", Path: "/erp/task-board", RequiredAny: []string{PermissionWorkflowTaskRead}},
	{Key: "business-dashboard", Label: "业务看板", Path: "/erp/business-dashboard", RequiredAny: []string{PermissionERPBusinessDashboardRead}},
	{Key: "customers", Label: "客户档案", Path: "/erp/master/partners/customers", RequiredAny: []string{PermissionCustomerRead}},
	{Key: "suppliers", Label: "供应商档案", Path: "/erp/master/partners/suppliers", RequiredAny: []string{PermissionSupplierRead}},
	{Key: "products", Label: "产品档案", Path: "/erp/master/products", RequiredAny: []string{PermissionProductRead, PermissionProductSKURead}},
	{Key: "materials", Label: "材料档案", Path: "/erp/master/materials", RequiredAny: []string{PermissionMaterialRead}},
	{Key: "processes", Label: "工序档案", Path: "/erp/engineering/processes", RequiredAny: []string{PermissionProcessRead}},
	{Key: "sales-orders", Label: "销售订单", Path: "/erp/sales/project-orders/sales-orders", RequiredAny: []string{PermissionSalesOrderRead}},
	{Key: "material-bom", Label: "BOM 管理", Path: "/erp/purchase/material-bom", RequiredAny: []string{PermissionBOMRead}},
	{Key: "accessories-purchase", Label: "采购订单", Path: "/erp/purchase/accessories", RequiredAny: []string{PermissionPurchaseOrderRead}},
	{Key: "inbound", Label: "入库管理", Path: "/erp/warehouse/inbound", RequiredAny: []string{PermissionWarehouseInboundRead, PermissionPurchaseReceiptRead}},
	{Key: "quality-inspections", Label: "质量检验", Path: "/erp/production/quality-inspections", RequiredAny: []string{PermissionQualityInspectionRead}},
	{Key: "inventory", Label: "库存台账", Path: "/erp/warehouse/inventory", RequiredAny: []string{PermissionWarehouseInventoryRead}},
	{Key: "processing-contracts", Label: "委外订单", Path: "/erp/purchase/processing-contracts", RequiredAny: []string{PermissionOutsourcingOrderRead}},
	{Key: "production-orders", Label: "生产订单", Path: "/erp/production/orders", RequiredAny: []string{PermissionPMCPlanRead, PermissionProductionWIPRead}},
	{Key: "production-scheduling", Label: "生产排程", Path: "/erp/production/scheduling", RequiredAny: []string{PermissionPMCPlanRead}},
	{Key: "production-progress", Label: "生产进度", Path: "/erp/production/progress", RequiredAny: []string{PermissionPMCPlanRead}},
	{Key: "production-exceptions", Label: "生产异常", Path: "/erp/production/exceptions", RequiredAny: []string{PermissionPMCRiskRead, PermissionQualityInspectionRead}},
	{Key: "shipping-release", Label: "出货放行", Path: "/erp/warehouse/shipping-release", RequiredAny: []string{PermissionWarehouseOutboundRead, PermissionFinanceReceivableRead, PermissionSalesOrderRead}},
	{Key: "outbound", Label: "出库管理", Path: "/erp/warehouse/outbound", RequiredAny: []string{PermissionWarehouseOutboundRead}},
	{Key: "shipments", Label: "出货单", Path: "/erp/warehouse/shipments", RequiredAny: []string{PermissionShipmentRead}},
	{Key: "sales-returns", Label: "客户退货", Path: "/erp/sales/customer-returns", RequiredAny: []string{PermissionSalesReturnRead}},
	{Key: "reconciliation", Label: "对账管理", Path: "/erp/finance/reconciliation", RequiredAny: []string{PermissionFinanceReconciliationRead}},
	{Key: "payables", Label: "应付管理", Path: "/erp/finance/payables", RequiredAny: []string{PermissionFinancePayableRead}},
	{Key: "receivables", Label: "应收管理", Path: "/erp/finance/receivables", RequiredAny: []string{PermissionFinanceReceivableRead}},
	{Key: "invoices", Label: "发票管理", Path: "/erp/finance/invoices", RequiredAny: []string{PermissionFinanceInvoiceRead}},
	{Key: "finance-payments", Label: "收付款与核销", Path: "/erp/finance/payments", RequiredAny: []string{PermissionFinancePaymentRead}},
	{Key: "print-center", Label: "模板打印中心", Path: "/erp/print-center", RequiredAny: []string{PermissionERPPrintTemplateRead}},
	{Key: "permission-center", Label: "权限管理", Path: "/erp/system/permissions", RequiredAny: []string{PermissionSystemUserRead, PermissionSystemRoleRead}},
	{Key: "system-audit-logs", Label: "审计日志", Path: "/erp/system/audit-logs", RequiredAny: []string{PermissionSystemAuditRead}},
}

func BuiltinAdminMenus() []AdminMenu {
	out := make([]AdminMenu, 0, len(builtinAdminMenus))
	for _, item := range builtinAdminMenus {
		cloned := item
		cloned.RequiredAny = append([]string(nil), item.RequiredAny...)
		cloned.RequiredAll = append([]string(nil), item.RequiredAll...)
		out = append(out, cloned)
	}
	return out
}

func AdminVisibleMenus(admin *AdminUser) []AdminMenu {
	if !admin.IsActive() {
		return []AdminMenu{}
	}
	if admin.IsSuperAdmin {
		return BuiltinAdminMenus()
	}
	permissionSet := PermissionKeySet(admin.Permissions)
	out := make([]AdminMenu, 0, len(builtinAdminMenus))
	for _, item := range builtinAdminMenus {
		if AdminMenuRequirementsSatisfied(permissionSet, item) {
			cloned := item
			cloned.RequiredAny = append([]string(nil), item.RequiredAny...)
			cloned.RequiredAll = append([]string(nil), item.RequiredAll...)
			out = append(out, cloned)
		}
	}
	return out
}

func AdminMenuRequirementsSatisfied(permissionSet map[string]struct{}, menu AdminMenu) bool {
	hasAny := len(menu.RequiredAny) == 0 || PermissionSetHasAny(permissionSet, menu.RequiredAny...)
	hasAll := PermissionSetHasAll(permissionSet, menu.RequiredAll...)
	return hasAny && hasAll
}
