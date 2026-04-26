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

	PermissionERPDashboardRead          = "erp.dashboard.read"
	PermissionERPPrintTemplateRead      = "erp.print_template.read"
	PermissionERPHelpCenterRead         = "erp.help_center.read"
	PermissionERPBusinessChainDebugRead = "erp.business_chain_debug.read"

	PermissionBusinessRecordRead   = "business.record.read"
	PermissionBusinessRecordCreate = "business.record.create"
	PermissionBusinessRecordUpdate = "business.record.update"
	PermissionBusinessRecordDelete = "business.record.delete"

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

	PermissionMobileBossAccess       = "mobile.boss.access"
	PermissionMobileSalesAccess      = "mobile.sales.access"
	PermissionMobilePurchaseAccess   = "mobile.purchase.access"
	PermissionMobileProductionAccess = "mobile.production.access"
	PermissionMobileWarehouseAccess  = "mobile.warehouse.access"
	PermissionMobileQualityAccess    = "mobile.quality.access"
	PermissionMobileFinanceAccess    = "mobile.finance.access"
	PermissionMobilePMCAccess        = "mobile.pmc.access"

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
	{Key: PermissionERPDashboardRead, Name: "查看任务看板", Module: "erp", Action: "read", Resource: "dashboard", Builtin: true},
	{Key: PermissionERPPrintTemplateRead, Name: "查看打印模板", Module: "erp", Action: "read", Resource: "print_template", Builtin: true},
	{Key: PermissionERPHelpCenterRead, Name: "查看帮助中心", Module: "erp", Action: "read", Resource: "help_center", Builtin: true},
	{Key: PermissionERPBusinessChainDebugRead, Name: "查看业务链路调试页", Module: "erp", Action: "read", Resource: "business_chain_debug", Builtin: true},
	{Key: PermissionBusinessRecordRead, Name: "查看业务记录", Module: "business", Action: "read", Resource: "record", Builtin: true},
	{Key: PermissionBusinessRecordCreate, Name: "创建业务记录", Module: "business", Action: "create", Resource: "record", Builtin: true},
	{Key: PermissionBusinessRecordUpdate, Name: "更新业务记录", Module: "business", Action: "update", Resource: "record", Builtin: true},
	{Key: PermissionBusinessRecordDelete, Name: "删除业务记录", Module: "business", Action: "delete", Resource: "record", Builtin: true},
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
	{Key: PermissionMobileBossAccess, Name: "进入老板移动端", Module: "mobile", Action: "access", Resource: BossRoleKey, Builtin: true},
	{Key: PermissionMobileSalesAccess, Name: "进入业务移动端", Module: "mobile", Action: "access", Resource: SalesRoleKey, Builtin: true},
	{Key: PermissionMobilePurchaseAccess, Name: "进入采购移动端", Module: "mobile", Action: "access", Resource: PurchaseRoleKey, Builtin: true},
	{Key: PermissionMobileProductionAccess, Name: "进入生产移动端", Module: "mobile", Action: "access", Resource: ProductionRoleKey, Builtin: true},
	{Key: PermissionMobileWarehouseAccess, Name: "进入仓库移动端", Module: "mobile", Action: "access", Resource: WarehouseRoleKey, Builtin: true},
	{Key: PermissionMobileQualityAccess, Name: "进入品质移动端", Module: "mobile", Action: "access", Resource: QualityRoleKey, Builtin: true},
	{Key: PermissionMobileFinanceAccess, Name: "进入财务移动端", Module: "mobile", Action: "access", Resource: FinanceRoleKey, Builtin: true},
	{Key: PermissionMobilePMCAccess, Name: "进入 PMC 移动端", Module: "mobile", Action: "access", Resource: PMCRoleKey, Builtin: true},
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
	valid := map[string]struct{}{}
	for _, role := range BuiltinRoles() {
		valid[role.Key] = struct{}{}
	}
	selected := make(map[string]struct{}, len(input))
	for _, raw := range input {
		key := NormalizeRoleKey(raw)
		if _, ok := valid[key]; ok {
			selected[key] = struct{}{}
		}
	}
	out := make([]string, 0, len(selected))
	for _, role := range BuiltinRoles() {
		if _, ok := selected[role.Key]; ok {
			out = append(out, role.Key)
		}
	}
	return out
}

func BuiltinRoles() []RoleDefinition {
	readPermissions := []string{
		PermissionERPDashboardRead,
		PermissionERPPrintTemplateRead,
		PermissionERPHelpCenterRead,
		PermissionBusinessRecordRead,
		PermissionWorkflowTaskRead,
		PermissionPurchaseOrderRead,
		PermissionPurchaseReceiptRead,
		PermissionPurchaseReturnRead,
		PermissionWarehouseInventoryRead,
		PermissionWarehouseInboundRead,
		PermissionWarehouseOutboundRead,
		PermissionQualityInspectionRead,
		PermissionFinancePayableRead,
		PermissionFinanceReceivableRead,
		PermissionFinanceReportRead,
		PermissionPMCPlanRead,
		PermissionPMCRiskRead,
	}
	return []RoleDefinition{
		{Key: BossRoleKey, Name: "老板 / 管理层", Description: "查看全局业务、审批和报表，不默认包含高危 debug 清空权限。", Builtin: true, SortOrder: 10, Permissions: append(readPermissions, PermissionWorkflowTaskApprove, PermissionWorkflowTaskReject, PermissionMobileBossAccess)},
		{Key: SalesRoleKey, Name: "业务", Description: "客户、订单、出运跟进，任务处理仍受销售 owner/assignee 约束。", Builtin: true, SortOrder: 20, Permissions: []string{PermissionERPDashboardRead, PermissionERPHelpCenterRead, PermissionERPPrintTemplateRead, PermissionBusinessRecordRead, PermissionBusinessRecordCreate, PermissionBusinessRecordUpdate, PermissionWorkflowTaskRead, PermissionWorkflowTaskCreate, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionMobileSalesAccess}},
		{Key: PurchaseRoleKey, Name: "采购", Description: "采购、收货、退货相关入口，任务处理仍受采购 owner/assignee 约束。", Builtin: true, SortOrder: 30, Permissions: []string{PermissionERPDashboardRead, PermissionERPHelpCenterRead, PermissionERPPrintTemplateRead, PermissionBusinessRecordRead, PermissionBusinessRecordCreate, PermissionBusinessRecordUpdate, PermissionWorkflowTaskRead, PermissionWorkflowTaskCreate, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionPurchaseOrderRead, PermissionPurchaseOrderCreate, PermissionPurchaseOrderUpdate, PermissionPurchaseReceiptRead, PermissionPurchaseReceiptCreate, PermissionPurchaseReturnRead, PermissionPurchaseReturnCreate, PermissionMobilePurchaseAccess}},
		{Key: WarehouseRoleKey, Name: "仓库", Description: "库存、入库、出库、盘点相关入口，任务处理仍受仓库 owner/assignee 约束。", Builtin: true, SortOrder: 40, Permissions: []string{PermissionERPDashboardRead, PermissionERPHelpCenterRead, PermissionBusinessRecordRead, PermissionBusinessRecordUpdate, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionWarehouseInventoryRead, PermissionWarehouseInboundRead, PermissionWarehouseInboundConfirm, PermissionWarehouseOutboundRead, PermissionWarehouseOutboundConfirm, PermissionWarehouseAdjustmentCreate, PermissionMobileWarehouseAccess}},
		{Key: QualityRoleKey, Name: "品质", Description: "检验、异常、返工相关入口，任务处理仍受品质 owner/assignee 约束。", Builtin: true, SortOrder: 50, Permissions: []string{PermissionERPDashboardRead, PermissionERPHelpCenterRead, PermissionBusinessRecordRead, PermissionBusinessRecordUpdate, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionQualityInspectionRead, PermissionQualityInspectionCreate, PermissionQualityInspectionUpdate, PermissionQualityExceptionHandle, PermissionMobileQualityAccess}},
		{Key: FinanceRoleKey, Name: "财务", Description: "应收、应付、收付款和财务报表相关入口，任务处理仍受财务 owner/assignee 约束。", Builtin: true, SortOrder: 60, Permissions: []string{PermissionERPDashboardRead, PermissionERPHelpCenterRead, PermissionERPPrintTemplateRead, PermissionBusinessRecordRead, PermissionBusinessRecordUpdate, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionFinancePayableRead, PermissionFinancePayableConfirm, PermissionFinanceReceivableRead, PermissionFinanceReceivableConfirm, PermissionFinanceReportRead, PermissionMobileFinanceAccess}},
		{Key: PMCRoleKey, Name: "PMC", Description: "生产计划、进度和风险跟进；可查看风险，不等于可代替其他角色完成任务。", Builtin: true, SortOrder: 70, Permissions: []string{PermissionERPDashboardRead, PermissionERPHelpCenterRead, PermissionBusinessRecordRead, PermissionBusinessRecordCreate, PermissionBusinessRecordUpdate, PermissionWorkflowTaskRead, PermissionWorkflowTaskCreate, PermissionWorkflowTaskUpdate, PermissionPMCPlanRead, PermissionPMCPlanCreate, PermissionPMCPlanUpdate, PermissionPMCRiskRead, PermissionPMCRiskHandle, PermissionMobilePMCAccess}},
		{Key: ProductionRoleKey, Name: "生产", Description: "排产、进度、返工和生产异常处理，任务处理仍受生产 owner/assignee 约束。", Builtin: true, SortOrder: 80, Permissions: []string{PermissionERPDashboardRead, PermissionERPHelpCenterRead, PermissionBusinessRecordRead, PermissionBusinessRecordUpdate, PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate, PermissionWorkflowTaskComplete, PermissionPMCPlanRead, PermissionPMCPlanUpdate, PermissionPMCRiskRead, PermissionPMCRiskHandle, PermissionMobileProductionAccess}},
		{Key: AdminRoleKey, Name: "系统管理员", Description: "管理管理员、角色、权限和基础配置，不天然拥有业务事实处理权。", Builtin: true, SortOrder: 90, Permissions: []string{PermissionSystemUserRead, PermissionSystemUserCreate, PermissionSystemUserUpdate, PermissionSystemUserDisable, PermissionSystemRoleRead, PermissionSystemRoleCreate, PermissionSystemRoleUpdate, PermissionSystemRoleDelete, PermissionSystemPermissionRead, PermissionSystemPermissionManage, PermissionERPHelpCenterRead}},
		{Key: DebugOperatorRoleKey, Name: "调试操作员", Description: "仅限 local/dev/test 分配的 debug 操作角色。", Builtin: true, SortOrder: 100, Permissions: []string{PermissionERPBusinessChainDebugRead, PermissionDebugBusinessChainRead, PermissionDebugBusinessChainRun, PermissionDebugSeed, PermissionDebugCleanup, PermissionDebugBusinessClear}},
	}
}

var builtinMobileRoleAccessPermissions = map[string]string{
	BossRoleKey:       PermissionMobileBossAccess,
	SalesRoleKey:      PermissionMobileSalesAccess,
	PurchaseRoleKey:   PermissionMobilePurchaseAccess,
	ProductionRoleKey: PermissionMobileProductionAccess,
	WarehouseRoleKey:  PermissionMobileWarehouseAccess,
	QualityRoleKey:    PermissionMobileQualityAccess,
	FinanceRoleKey:    PermissionMobileFinanceAccess,
	PMCRoleKey:        PermissionMobilePMCAccess,
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
	{Key: "global-dashboard", Label: "任务看板", Path: "/erp/dashboard", RequiredPermissions: []string{PermissionERPDashboardRead}},
	{Key: "business-dashboard", Label: "业务总览", Path: "/erp/business-dashboard", RequiredPermissions: []string{PermissionBusinessRecordRead}},
	{Key: "print-center", Label: "模板打印中心", Path: "/erp/print-center", RequiredPermissions: []string{PermissionERPPrintTemplateRead}},
	{Key: "project-orders", Label: "客户/款式立项", Path: "/erp/sales/project-orders", RequiredPermissions: []string{PermissionBusinessRecordRead}},
	{Key: "material-bom", Label: "材料 BOM", Path: "/erp/purchase/material-bom", RequiredPermissions: []string{PermissionPurchaseOrderRead}},
	{Key: "accessories-purchase", Label: "辅材/包材采购", Path: "/erp/purchase/accessories", RequiredPermissions: []string{PermissionPurchaseOrderRead}},
	{Key: "processing-contracts", Label: "加工合同/委外下单", Path: "/erp/purchase/processing-contracts", RequiredPermissions: []string{PermissionPurchaseOrderRead}},
	{Key: "inbound", Label: "入库通知/检验/入库", Path: "/erp/warehouse/inbound", RequiredPermissions: []string{PermissionWarehouseInboundRead, PermissionQualityInspectionRead, PermissionPurchaseReceiptRead}},
	{Key: "inventory", Label: "库存", Path: "/erp/warehouse/inventory", RequiredPermissions: []string{PermissionWarehouseInventoryRead}},
	{Key: "shipping-release", Label: "待出货/出货放行", Path: "/erp/warehouse/shipping-release", RequiredPermissions: []string{PermissionWarehouseOutboundRead, PermissionBusinessRecordRead}},
	{Key: "outbound", Label: "出库", Path: "/erp/warehouse/outbound", RequiredPermissions: []string{PermissionWarehouseOutboundRead}},
	{Key: "production-scheduling", Label: "生产排单", Path: "/erp/production/scheduling", RequiredPermissions: []string{PermissionPMCPlanRead}},
	{Key: "production-progress", Label: "生产进度", Path: "/erp/production/progress", RequiredPermissions: []string{PermissionPMCPlanRead}},
	{Key: "production-exceptions", Label: "延期/返工/异常", Path: "/erp/production/exceptions", RequiredPermissions: []string{PermissionPMCRiskRead, PermissionQualityExceptionHandle}},
	{Key: "quality-inspections", Label: "品质检验", Path: "/erp/production/quality-inspections", RequiredPermissions: []string{PermissionQualityInspectionRead}},
	{Key: "reconciliation", Label: "对账/结算", Path: "/erp/finance/reconciliation", RequiredPermissions: []string{PermissionFinanceReportRead}},
	{Key: "payables", Label: "待付款/应付提醒", Path: "/erp/finance/payables", RequiredPermissions: []string{PermissionFinancePayableRead}},
	{Key: "receivables", Label: "应收提醒", Path: "/erp/finance/receivables", RequiredPermissions: []string{PermissionFinanceReceivableRead}},
	{Key: "invoices", Label: "发票/开票异常", Path: "/erp/finance/invoices", RequiredPermissions: []string{PermissionFinanceReceivableRead, PermissionFinancePayableRead}},
	{Key: "help-center", Label: "帮助中心", Path: "/erp/help-center", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-operation-flow-overview", Label: "ERP 流程图总览", Path: "/erp/docs/operation-flow-overview", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-operation-guide", Label: "ERP 操作教程", Path: "/erp/docs/operation-guide", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-role-collaboration-guide", Label: "角色协同链路", Path: "/erp/docs/role-collaboration-guide", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-role-page-document-matrix", Label: "角色权限 / 页面 / 单据矩阵", Path: "/erp/docs/role-page-document-matrix", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-task-document-mapping", Label: "任务 / 单据映射表", Path: "/erp/docs/task-document-mapping", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-workflow-status-guide", Label: "任务 / 业务状态字典", Path: "/erp/docs/workflow-status-guide", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-workflow-schema-draft", Label: "Workflow / Schema 草案", Path: "/erp/docs/workflow-schema-draft", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-task-flow-v1", Label: "工作流主任务树 v1", Path: "/erp/docs/task-flow-v1", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-role-permission-matrix-v1", Label: "角色权限矩阵 v1", Path: "/erp/docs/role-permission-matrix-v1", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-notification-alert-v1", Label: "通知 / 预警 v1", Path: "/erp/docs/notification-alert-v1", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-finance-v1", Label: "财务 v1", Path: "/erp/docs/finance-v1", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-warehouse-quality-v1", Label: "仓库与品质 v1", Path: "/erp/docs/warehouse-quality-v1", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-log-trace-audit-v1", Label: "日志 / 审计 / Trace v1", Path: "/erp/docs/log-trace-audit-v1", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-desktop-role-guide", Label: "桌面端角色流程", Path: "/erp/docs/desktop-role-guide", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-mobile-role-guide", Label: "手机端角色流程", Path: "/erp/docs/mobile-role-guide", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-field-linkage-guide", Label: "ERP 字段联动口径", Path: "/erp/docs/field-linkage-guide", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-calculation-guide", Label: "ERP 计算口径", Path: "/erp/docs/calculation-guide", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-print-snapshot-guide", Label: "打印 / 合同 / 快照口径", Path: "/erp/docs/print-snapshot-guide", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-exception-handling-guide", Label: "异常 / 返工 / 延期处理", Path: "/erp/docs/exception-handling-guide", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "help-current-boundaries", Label: "当前明确不做", Path: "/erp/docs/current-boundaries", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "qa-acceptance-overview", Label: "验收结果总览", Path: "/erp/qa/acceptance-overview", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "qa-business-chain-debug", Label: "业务链路调试", Path: "/erp/qa/business-chain-debug", RequiredPermissions: []string{PermissionERPBusinessChainDebugRead, PermissionDebugBusinessChainRead, PermissionDebugBusinessChainRun}},
	{Key: "qa-workflow-task-debug", Label: "任务可见性调试", Path: "/erp/qa/workflow-task-debug", RequiredPermissions: []string{PermissionWorkflowTaskRead}},
	{Key: "qa-field-linkage-coverage", Label: "字段联动覆盖", Path: "/erp/qa/field-linkage-coverage", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "qa-run-records", Label: "运行记录", Path: "/erp/qa/run-records", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "qa-reports", Label: "专项报告", Path: "/erp/qa/reports", RequiredPermissions: []string{PermissionERPHelpCenterRead}},
	{Key: "permission-center", Label: "权限管理", Path: "/erp/system/permissions", RequiredPermissions: []string{PermissionSystemUserRead, PermissionSystemRoleRead}},
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
