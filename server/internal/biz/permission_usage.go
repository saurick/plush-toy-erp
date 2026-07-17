package biz

// PermissionBackendMethod identifies a protected JSON-RPC operation. The
// registry is explanatory metadata; handlers remain the authorization boundary.
type PermissionBackendMethod struct {
	Domain string
	Method string
}

// PermissionUsageSurface describes one business-facing place affected by a
// permission. Ordinary inputs inherit their form's create/update permission and
// are intentionally not registered one by one.
type PermissionUsageSurface struct {
	PageKey        string
	PageLabel      string
	PagePath       string
	SectionKey     string
	SectionLabel   string
	ControlKey     string
	ControlLabel   string
	ControlType    string
	Effect         string
	BackendMethods []PermissionBackendMethod
	RequiredAny    []string
	RequiredAll    []string
	Conditions     []string
}

// PermissionUsage is a read-only explanation of where one permission is used.
// BackendOnly means the permission has no product page entry.
type PermissionUsage struct {
	PermissionKey string
	Surfaces      []PermissionUsageSurface
	BackendOnly   bool
}

const (
	permissionControlPage        = "page"
	permissionControlButton      = "button"
	permissionControlForm        = "form"
	permissionControlSwitch      = "switch"
	permissionControlSection     = "section"
	permissionControlMobileEntry = "mobile_entry"
	permissionControlBackend     = "backend_action"
)

var (
	businessUsageConditions = []string{"仍受客户模块状态、业务状态和数据归属限制"}
	workflowUsageConditions = []string{"仍受任务状态、责任岗位、当前处理人和责任池限制"}
	systemUsageConditions   = []string{"仍受超级管理员保护和账号生命周期规则限制"}
	mobileUsageConditions   = []string{"进入后仍只显示当前岗位或指派给本人的任务"}
	debugUsageConditions    = []string{"仅限明确开启的本地开发环境，其他环境拒绝"}
)

var builtinPermissionUsages = buildBuiltinPermissionUsages()

// BuiltinPermissionUsages returns a defensive copy in permission-definition
// order. Static tests keep this registry exhaustive.
func BuiltinPermissionUsages() []PermissionUsage {
	out := make([]PermissionUsage, 0, len(builtinPermissions))
	for _, definition := range builtinPermissions {
		if usage, ok := builtinPermissionUsages[definition.Key]; ok {
			out = append(out, clonePermissionUsage(usage))
		}
	}
	return out
}

func PermissionUsageFor(permissionKey string) (PermissionUsage, bool) {
	usage, ok := builtinPermissionUsages[permissionKey]
	if !ok {
		return PermissionUsage{}, false
	}
	return clonePermissionUsage(usage), true
}

func clonePermissionUsage(input PermissionUsage) PermissionUsage {
	out := input
	out.Surfaces = make([]PermissionUsageSurface, len(input.Surfaces))
	for i, surface := range input.Surfaces {
		out.Surfaces[i] = surface
		out.Surfaces[i].BackendMethods = append([]PermissionBackendMethod(nil), surface.BackendMethods...)
		out.Surfaces[i].RequiredAny = append([]string(nil), surface.RequiredAny...)
		out.Surfaces[i].RequiredAll = append([]string(nil), surface.RequiredAll...)
		out.Surfaces[i].Conditions = append([]string(nil), surface.Conditions...)
	}
	return out
}

func permissionMethods(domain string, methods ...string) []PermissionBackendMethod {
	out := make([]PermissionBackendMethod, 0, len(methods))
	for _, method := range methods {
		out = append(out, PermissionBackendMethod{Domain: domain, Method: method})
	}
	return out
}

func menuPermissionSurface(
	menuKey string,
	sectionKey string,
	sectionLabel string,
	controlKey string,
	controlLabel string,
	controlType string,
	effect string,
	backendMethods []PermissionBackendMethod,
	conditions []string,
) PermissionUsageSurface {
	for _, menu := range builtinAdminMenus {
		if menu.Key != menuKey {
			continue
		}
		return PermissionUsageSurface{
			PageKey:        menu.Key,
			PageLabel:      menu.Label,
			PagePath:       menu.Path,
			SectionKey:     sectionKey,
			SectionLabel:   sectionLabel,
			ControlKey:     controlKey,
			ControlLabel:   controlLabel,
			ControlType:    controlType,
			Effect:         effect,
			BackendMethods: append([]PermissionBackendMethod(nil), backendMethods...),
			RequiredAny:    append([]string(nil), menu.RequiredAny...),
			RequiredAll:    append([]string(nil), menu.RequiredAll...),
			Conditions:     append([]string(nil), conditions...),
		}
	}
	panic("permission usage references unknown menu: " + menuKey)
}

func explicitPermissionSurface(
	pageKey string,
	pageLabel string,
	pagePath string,
	sectionKey string,
	sectionLabel string,
	controlKey string,
	controlLabel string,
	controlType string,
	effect string,
	backendMethods []PermissionBackendMethod,
	requiredAny []string,
	requiredAll []string,
	conditions []string,
) PermissionUsageSurface {
	return PermissionUsageSurface{
		PageKey:        pageKey,
		PageLabel:      pageLabel,
		PagePath:       pagePath,
		SectionKey:     sectionKey,
		SectionLabel:   sectionLabel,
		ControlKey:     controlKey,
		ControlLabel:   controlLabel,
		ControlType:    controlType,
		Effect:         effect,
		BackendMethods: append([]PermissionBackendMethod(nil), backendMethods...),
		RequiredAny:    append([]string(nil), requiredAny...),
		RequiredAll:    append([]string(nil), requiredAll...),
		Conditions:     append([]string(nil), conditions...),
	}
}

func buildBuiltinPermissionUsages() map[string]PermissionUsage {
	out := make(map[string]PermissionUsage, len(builtinPermissions))
	add := func(permissionKey string, surfaces ...PermissionUsageSurface) {
		if _, exists := out[permissionKey]; exists {
			panic("duplicate permission usage: " + permissionKey)
		}
		out[permissionKey] = PermissionUsage{PermissionKey: permissionKey, Surfaces: surfaces}
	}
	addBackend := func(permissionKey string, methods []PermissionBackendMethod, conditions []string) {
		add(permissionKey, PermissionUsageSurface{
			ControlKey:     permissionKey,
			ControlLabel:   "后端受控动作",
			ControlType:    permissionControlBackend,
			Effect:         "允许调用受保护的后端动作",
			BackendMethods: append([]PermissionBackendMethod(nil), methods...),
			Conditions:     append([]string(nil), conditions...),
		})
		usage := out[permissionKey]
		usage.BackendOnly = true
		out[permissionKey] = usage
	}
	addMenu := func(
		permissionKey string,
		menuKey string,
		sectionKey string,
		sectionLabel string,
		controlKey string,
		controlLabel string,
		controlType string,
		effect string,
		methods []PermissionBackendMethod,
		conditions []string,
	) {
		add(permissionKey, menuPermissionSurface(menuKey, sectionKey, sectionLabel, controlKey, controlLabel, controlType, effect, methods, conditions))
	}
	addCRUD := func(
		readKey string,
		createKey string,
		updateKey string,
		disableKey string,
		menuKey string,
		sectionKey string,
		sectionLabel string,
		subject string,
		domain string,
		readMethods []string,
		createMethods []string,
		updateMethods []string,
		disableMethods []string,
	) {
		addMenu(readKey, menuKey, sectionKey, sectionLabel, sectionKey+"-content", subject+"页面和内容", permissionControlPage, "允许进入并查看", permissionMethods(domain, readMethods...), businessUsageConditions)
		addMenu(createKey, menuKey, sectionKey, sectionLabel, sectionKey+"-create", "新建"+subject, permissionControlButton, "显示并允许创建", permissionMethods(domain, createMethods...), businessUsageConditions)
		addMenu(updateKey, menuKey, sectionKey, sectionLabel, sectionKey+"-update", "编辑"+subject+"及表单", permissionControlForm, "显示并允许编辑", permissionMethods(domain, updateMethods...), businessUsageConditions)
		addMenu(disableKey, menuKey, sectionKey, sectionLabel, sectionKey+"-status", "启用或停用"+subject, permissionControlSwitch, "显示并允许切换状态", permissionMethods(domain, disableMethods...), businessUsageConditions)
	}

	// System control plane.
	addMenu(PermissionSystemUserRead, "permission-center", "admin-accounts", "管理员账号", "admin-account-list", "管理员账号列表", permissionControlPage, "允许进入并查看", permissionMethods("admin", "list"), systemUsageConditions)
	addMenu(PermissionSystemUserCreate, "permission-center", "admin-accounts", "管理员账号", "create-admin", "创建管理员", permissionControlButton, "显示并允许创建", permissionMethods("admin", "create"), systemUsageConditions)
	addMenu(PermissionSystemUserUpdate, "permission-center", "admin-accounts", "管理员账号", "edit-admin-profile", "修改账号资料和重置密码", permissionControlForm, "显示并允许修改", permissionMethods("admin", "set_phone", "reset_password"), systemUsageConditions)
	addMenu(PermissionSystemUserRoleAssign, "permission-center", "admin-accounts", "管理员账号", "assign-admin-roles", "分配业务角色", permissionControlForm, "显示并允许分配可委派角色", permissionMethods("admin", "set_roles"), systemUsageConditions)
	addMenu(PermissionSystemUserDisable, "permission-center", "admin-accounts", "管理员账号", "set-admin-disabled", "临时停用或恢复账号", permissionControlSwitch, "显示并允许切换账号状态", permissionMethods("admin", "set_disabled"), systemUsageConditions)
	addMenu(PermissionSystemUserRevoke, "permission-center", "admin-accounts", "管理员账号", "revoke-admin", "离职注销账号", permissionControlButton, "显示并允许正式注销", permissionMethods("admin", "revoke"), systemUsageConditions)
	addMenu(PermissionSystemRoleRead, "permission-center", "role-templates", "角色模板", "role-list", "岗位角色列表", permissionControlPage, "允许进入并查看", permissionMethods("admin", "rbac_options"), systemUsageConditions)
	addMenu(PermissionSystemRolePermissionManage, "permission-center", "role-templates", "角色模板", "save-role-permissions", "保存业务角色权限", permissionControlButton, "显示并允许保存可委派业务权限", permissionMethods("admin", "set_role_permissions"), systemUsageConditions)
	addMenu(PermissionSystemPermissionRead, "permission-center", "role-templates", "角色模板", "permission-list", "功能权限和权限地图", permissionControlPage, "允许进入并查看", permissionMethods("admin", "rbac_options"), systemUsageConditions)
	addMenu(PermissionSystemAuditRead, "system-audit-logs", "audit-events", "审计事件", "audit-event-list", "审计日志列表", permissionControlPage, "允许进入并查看", permissionMethods("admin", "audit_logs"), systemUsageConditions)

	// Customer configuration has no product navigation entry.
	addBackend(PermissionCustomerConfigRead, permissionMethods("customer_config", "validate_customer_config", "get_effective_session", "explain_module_status", "explain_process_definition"), []string{"仍受部署固定客户和 active revision 边界限制"})
	addBackend(PermissionCustomerConfigPublish, permissionMethods("customer_config", "publish_customer_config"), []string{"仍受配置校验和发布版本状态限制"})
	addBackend(PermissionCustomerConfigActivate, permissionMethods("customer_config", "activate_customer_config"), []string{"仍受发布版本状态和部署客户边界限制"})
	addBackend(PermissionCustomerConfigRollback, permissionMethods("customer_config", "rollback_customer_config"), []string{"仍受可回滚 revision 和部署客户边界限制"})

	// Shared ERP entries.
	add(PermissionERPDashboardRead,
		menuPermissionSurface("global-dashboard", "business-overview", "业务总览", "dashboard-content", "工作台内容", permissionControlPage, "允许进入并查看", permissionMethods("business", "dashboard_stats"), businessUsageConditions),
		menuPermissionSurface("business-dashboard", "business-overview", "业务总览", "business-dashboard-content", "业务看板内容", permissionControlPage, "允许进入并查看", permissionMethods("business", "dashboard_stats"), businessUsageConditions),
	)
	addMenu(PermissionERPPrintTemplateRead, "print-center", "print-templates", "打印模板", "print-template-list", "模板打印中心", permissionControlPage, "允许进入并查看", nil, businessUsageConditions)
	addBackend(PermissionERPBusinessChainDebugRead, permissionMethods("debug", "capabilities", "config"), debugUsageConditions)

	// Master data. Method names are explicit; no permission suffix inference is used.
	addCRUD(PermissionCustomerRead, PermissionCustomerCreate, PermissionCustomerUpdate, PermissionCustomerDisable, "customers", "customers", "客户档案", "客户", "masterdata", []string{"get_customer", "list_customers"}, []string{"create_customer", "save_customer_with_contacts"}, []string{"update_customer", "save_customer_with_contacts"}, []string{"set_customer_active"})
	addCRUD(PermissionSupplierRead, PermissionSupplierCreate, PermissionSupplierUpdate, PermissionSupplierDisable, "suppliers", "suppliers", "供应商档案", "供应商", "masterdata", []string{"get_supplier", "list_suppliers"}, []string{"create_supplier", "save_supplier_with_contacts"}, []string{"update_supplier", "save_supplier_with_contacts"}, []string{"set_supplier_active"})
	addCRUD(PermissionMaterialRead, PermissionMaterialCreate, PermissionMaterialUpdate, PermissionMaterialDisable, "materials", "materials", "材料档案", "材料", "masterdata", []string{"get_material", "list_materials"}, []string{"create_material"}, []string{"update_material"}, []string{"set_material_active"})
	addCRUD(PermissionProcessRead, PermissionProcessCreate, PermissionProcessUpdate, PermissionProcessDisable, "processes", "processes", "工序档案", "工序", "masterdata", []string{"get_process", "list_processes"}, []string{"create_process"}, []string{"update_process"}, []string{"set_process_active"})
	addCRUD(PermissionProductRead, PermissionProductCreate, PermissionProductUpdate, PermissionProductDisable, "products", "products", "产品档案", "产品", "masterdata", []string{"get_product", "list_products"}, []string{"create_product"}, []string{"update_product"}, []string{"set_product_active"})
	addCRUD(PermissionProductSKURead, PermissionProductSKUCreate, PermissionProductSKUUpdate, PermissionProductSKUDisable, "products", "product-skus", "产品规格", "产品规格", "masterdata", []string{"get_product_sku", "list_product_skus"}, []string{"create_product_sku"}, []string{"update_product_sku"}, []string{"set_product_sku_active"})

	addMenu(PermissionBOMRead, "material-bom", "bom-versions", "BOM 版本", "bom-version-list", "BOM 版本和明细", permissionControlPage, "允许进入并查看", permissionMethods("bom", "list_bom_versions", "get_bom_version"), businessUsageConditions)
	addMenu(PermissionBOMCreate, "material-bom", "bom-versions", "BOM 版本", "create-bom", "新建或复制 BOM 版本", permissionControlButton, "显示并允许创建", permissionMethods("bom", "save_bom_with_items", "copy_bom_version"), businessUsageConditions)
	addMenu(PermissionBOMUpdate, "material-bom", "bom-versions", "BOM 版本", "edit-bom", "维护 BOM 草稿和明细", permissionControlForm, "显示并允许编辑", permissionMethods("bom", "save_bom_with_items", "archive_bom_version"), businessUsageConditions)
	addMenu(PermissionBOMActivate, "material-bom", "bom-versions", "BOM 版本", "activate-bom", "激活 BOM 版本", permissionControlButton, "显示并允许激活", permissionMethods("bom", "activate_bom_version"), businessUsageConditions)

	contactSurface := func(menuKey string, controlKey string, controlLabel string, controlType string, effect string, methods []PermissionBackendMethod) PermissionUsageSurface {
		return menuPermissionSurface(menuKey, "contacts", "联系人", controlKey, controlLabel, controlType, effect, methods, businessUsageConditions)
	}
	add(PermissionContactRead,
		contactSurface("customers", "customer-contacts", "客户联系人", permissionControlSection, "允许查看", permissionMethods("masterdata", "get_contact", "list_contacts_by_owner")),
		contactSurface("suppliers", "supplier-contacts", "供应商联系人", permissionControlSection, "允许查看", permissionMethods("masterdata", "get_contact", "list_contacts_by_owner")),
	)
	add(PermissionContactCreate,
		contactSurface("customers", "create-customer-contact", "新增客户联系人", permissionControlButton, "显示并允许创建", permissionMethods("masterdata", "create_contact")),
		contactSurface("suppliers", "create-supplier-contact", "新增供应商联系人", permissionControlButton, "显示并允许创建", permissionMethods("masterdata", "create_contact")),
	)
	add(PermissionContactUpdate,
		contactSurface("customers", "edit-customer-contact", "编辑客户联系人", permissionControlForm, "显示并允许编辑", permissionMethods("masterdata", "update_contact")),
		contactSurface("suppliers", "edit-supplier-contact", "编辑供应商联系人", permissionControlForm, "显示并允许编辑", permissionMethods("masterdata", "update_contact")),
	)
	add(PermissionContactDisable,
		contactSurface("customers", "disable-customer-contact", "停用客户联系人", permissionControlButton, "显示并允许停用", permissionMethods("masterdata", "disable_contact")),
		contactSurface("suppliers", "disable-supplier-contact", "停用供应商联系人", permissionControlButton, "显示并允许停用", permissionMethods("masterdata", "disable_contact")),
	)
	add(PermissionContactSetPrimary,
		contactSurface("customers", "primary-customer-contact", "设置客户主联系人", permissionControlButton, "显示并允许设置", permissionMethods("masterdata", "set_primary_contact")),
		contactSurface("suppliers", "primary-supplier-contact", "设置供应商主联系人", permissionControlButton, "显示并允许设置", permissionMethods("masterdata", "set_primary_contact")),
	)

	// Sales orders.
	add(PermissionSalesOrderRead,
		menuPermissionSurface("sales-orders", "sales-orders", "销售订单", "sales-order-list", "销售订单列表和详情", permissionControlPage, "允许进入并查看", permissionMethods("sales_order", "get_sales_order", "list_sales_orders"), businessUsageConditions),
		menuPermissionSurface("shipping-release", "sales-order-release-context", "销售订单", "sales-order-release-reference", "出货放行的订单依据", permissionControlSection, "允许查看", permissionMethods("sales_order", "get_sales_order", "list_sales_orders"), businessUsageConditions),
	)
	addMenu(PermissionSalesOrderCreate, "sales-orders", "sales-orders", "销售订单", "create-sales-order", "新建销售订单和表单", permissionControlButton, "显示并允许创建", permissionMethods("sales_order", "save_sales_order_with_items"), businessUsageConditions)
	addMenu(PermissionSalesOrderUpdate, "sales-orders", "sales-orders", "销售订单", "edit-sales-order", "编辑销售订单和表单", permissionControlForm, "显示并允许编辑", permissionMethods("sales_order", "save_sales_order_with_items"), businessUsageConditions)
	salesOrderSubmitMethods := append(permissionMethods("sales_order", "submit_sales_order"), permissionMethods("customer_config", "execute_sales_order_acceptance_submit")...)
	addMenu(PermissionSalesOrderSubmit, "sales-orders", "sales-order-actions", "订单动作", "submit-sales-order", "提交销售订单", permissionControlButton, "显示并允许提交", salesOrderSubmitMethods, businessUsageConditions)
	addMenu(PermissionSalesOrderActivate, "sales-orders", "sales-order-actions", "订单动作", "activate-sales-order", "生效销售订单", permissionControlButton, "显示并允许生效", permissionMethods("sales_order", "activate_sales_order"), businessUsageConditions)
	addMenu(PermissionSalesOrderClose, "sales-orders", "sales-order-actions", "订单动作", "close-sales-order", "关闭销售订单", permissionControlButton, "显示并允许关闭", permissionMethods("sales_order", "close_sales_order"), businessUsageConditions)
	addMenu(PermissionSalesOrderCancel, "sales-orders", "sales-order-actions", "订单动作", "cancel-sales-order", "取消销售订单", permissionControlButton, "显示并允许取消", permissionMethods("sales_order", "cancel_sales_order"), businessUsageConditions)
	addMenu(PermissionSalesOrderItemRead, "sales-orders", "sales-order-items", "订单明细", "sales-order-item-list", "销售订单明细", permissionControlSection, "允许查看", permissionMethods("sales_order", "list_sales_order_items"), businessUsageConditions)

	// Workflow tasks.
	workflowSurfaces := func(controlKey string, controlLabel string, controlType string, effect string, methods []PermissionBackendMethod) []PermissionUsageSurface {
		return []PermissionUsageSurface{
			menuPermissionSurface("task-board", "task-actions", "协同任务", controlKey, controlLabel, controlType, effect, methods, workflowUsageConditions),
			menuPermissionSurface("exception-flow", "task-actions", "异常与阻塞", "exception-"+controlKey, controlLabel, controlType, effect, methods, workflowUsageConditions),
		}
	}
	add(PermissionWorkflowTaskRead, workflowSurfaces("task-list", "任务列表、看板和详情", permissionControlPage, "允许进入并查看", permissionMethods("workflow", "list_tasks", "get_task_board", "metadata", "list_business_states", "explain_action_access", "explain_task_assignment"))...)
	add(PermissionWorkflowTaskCreate, workflowSurfaces("create-task", "创建协同任务", permissionControlButton, "显示并允许创建", permissionMethods("workflow", "create_task"))...)
	add(PermissionWorkflowTaskUpdate, workflowSurfaces("update-task", "更新、阻塞和恢复任务", permissionControlForm, "显示并允许更新", permissionMethods("workflow", "block_task_action", "resume_task_action", "urge_task"))...)
	add(PermissionWorkflowTaskAssign, workflowSurfaces("assign-task", "指派协同任务", permissionControlButton, "显示并允许指派", permissionMethods("workflow", "explain_task_assignment"))...)
	add(PermissionWorkflowTaskApprove, workflowSurfaces("approve-task", "审批协同任务", permissionControlButton, "显示并允许审批", permissionMethods("workflow", "complete_task_action"))...)
	add(PermissionWorkflowTaskReject, workflowSurfaces("reject-task", "驳回协同任务", permissionControlButton, "显示并允许驳回", permissionMethods("workflow", "reject_task_action"))...)
	add(PermissionWorkflowTaskComplete, workflowSurfaces("complete-task", "完成协同任务", permissionControlButton, "显示并允许完成", permissionMethods("workflow", "complete_task_action"))...)

	// Purchase, outsourcing and inbound.
	addMenu(PermissionPurchaseOrderRead, "accessories-purchase", "purchase-orders", "采购订单", "purchase-order-list", "采购订单列表和详情", permissionControlPage, "允许进入并查看", permissionMethods("purchase_order", "get_purchase_order", "list_purchase_orders", "list_purchase_order_items"), businessUsageConditions)
	addMenu(PermissionPurchaseOrderCreate, "accessories-purchase", "purchase-orders", "采购订单", "create-purchase-order", "新建采购订单和表单", permissionControlButton, "显示并允许创建", permissionMethods("purchase_order", "save_purchase_order_with_items"), businessUsageConditions)
	addMenu(PermissionPurchaseOrderUpdate, "accessories-purchase", "purchase-orders", "采购订单", "edit-purchase-order", "编辑采购订单和表单", permissionControlForm, "显示并允许编辑", permissionMethods("purchase_order", "save_purchase_order_with_items", "submit_purchase_order", "close_purchase_order", "cancel_purchase_order"), businessUsageConditions)
	addMenu(PermissionPurchaseOrderApprove, "accessories-purchase", "purchase-order-actions", "订单动作", "approve-purchase-order", "审批采购订单", permissionControlButton, "显示并允许审批", permissionMethods("purchase_order", "approve_purchase_order"), businessUsageConditions)

	addMenu(PermissionOutsourcingOrderRead, "processing-contracts", "outsourcing-orders", "委外订单", "outsourcing-order-list", "委外订单列表和详情", permissionControlPage, "允许进入并查看", permissionMethods("outsourcing_order", "get_outsourcing_order", "list_outsourcing_orders", "list_outsourcing_order_items"), businessUsageConditions)
	addMenu(PermissionOutsourcingOrderCreate, "processing-contracts", "outsourcing-orders", "委外订单", "create-outsourcing-order", "新建委外订单和表单", permissionControlButton, "显示并允许创建", permissionMethods("outsourcing_order", "save_outsourcing_order_with_items"), businessUsageConditions)
	addMenu(PermissionOutsourcingOrderUpdate, "processing-contracts", "outsourcing-orders", "委外订单", "edit-outsourcing-order", "编辑委外订单和表单", permissionControlForm, "显示并允许编辑", permissionMethods("outsourcing_order", "save_outsourcing_order_with_items", "submit_outsourcing_order", "close_outsourcing_order", "cancel_outsourcing_order"), businessUsageConditions)
	addMenu(PermissionOutsourcingOrderConfirm, "processing-contracts", "outsourcing-order-actions", "订单动作", "confirm-outsourcing-order", "确认委外下单", permissionControlButton, "显示并允许确认", permissionMethods("outsourcing_order", "confirm_outsourcing_order"), businessUsageConditions)
	addMenu(PermissionOutsourcingFactRead, "processing-contracts", "outsourcing-related-records", "关联委外记录", "outsourcing-fact-list", "委外发料和回货记录", permissionControlSection, "允许查看", permissionMethods("operational_fact", "list_outsourcing_facts"), businessUsageConditions)
	addMenu(PermissionOutsourcingMaterialIssueCreate, "processing-contracts", "outsourcing-fact-actions", "委外动作", "create-outsourcing-material-issue", "登记委外发料", permissionControlButton, "显示并允许登记", permissionMethods("operational_fact", "create_outsourcing_material_issue_from_order"), businessUsageConditions)
	addMenu(PermissionOutsourcingReturnReceiptCreate, "processing-contracts", "outsourcing-fact-actions", "委外动作", "create-outsourcing-return-receipt", "登记委外回货", permissionControlButton, "显示并允许登记", permissionMethods("operational_fact", "create_outsourcing_return_receipt_from_order"), businessUsageConditions)
	addMenu(PermissionOutsourcingFactPost, "processing-contracts", "outsourcing-fact-actions", "委外动作", "post-outsourcing-fact", "确认委外记录", permissionControlButton, "显示并允许确认", permissionMethods("operational_fact", "post_outsourcing_fact"), businessUsageConditions)
	addMenu(PermissionOutsourcingFactCancel, "processing-contracts", "outsourcing-fact-actions", "委外动作", "cancel-outsourcing-fact", "取消委外记录", permissionControlButton, "显示并允许取消", permissionMethods("operational_fact", "cancel_outsourcing_fact"), businessUsageConditions)

	addMenu(PermissionPurchaseReceiptRead, "inbound", "purchase-receipts", "采购入库", "purchase-receipt-list", "采购入库列表和详情", permissionControlPage, "允许进入并查看", permissionMethods("purchase", "get_purchase_receipt", "list_purchase_receipts"), businessUsageConditions)
	addMenu(PermissionPurchaseReceiptCreate, "inbound", "purchase-receipts", "采购入库", "create-purchase-receipt", "创建和维护采购入库", permissionControlForm, "显示并允许创建和维护", permissionMethods("purchase", "create_purchase_receipt_draft", "create_purchase_receipt_with_items", "create_purchase_receipt_from_purchase_order", "add_purchase_receipt_item", "post_purchase_receipt", "cancel_purchase_receipt"), businessUsageConditions)
	addBackend(PermissionPurchaseReceiptAdjustmentRead, permissionMethods("purchase", "get_purchase_receipt_adjustment", "list_purchase_receipt_adjustments"), businessUsageConditions)
	addMenu(PermissionPurchaseReceiptAdjustmentCreate, "inbound", "purchase-receipt-adjustments", "采购入库调整", "create-purchase-receipt-adjustment", "登记入库调整", permissionControlButton, "显示并允许登记", permissionMethods("purchase", "create_purchase_receipt_adjustment_from_receipt"), businessUsageConditions)
	addMenu(PermissionPurchaseReceiptAdjustmentPost, "inbound", "purchase-receipt-adjustments", "采购入库调整", "post-purchase-receipt-adjustment", "确认入库调整", permissionControlButton, "显示并允许确认", permissionMethods("purchase", "post_purchase_receipt_adjustment"), businessUsageConditions)
	addMenu(PermissionPurchaseReceiptAdjustmentCancel, "inbound", "purchase-receipt-adjustments", "采购入库调整", "cancel-purchase-receipt-adjustment", "取消入库调整", permissionControlButton, "显示并允许取消", permissionMethods("purchase", "cancel_purchase_receipt_adjustment"), businessUsageConditions)
	addBackend(PermissionPurchaseReturnRead, permissionMethods("purchase", "get_purchase_return", "list_purchase_returns"), businessUsageConditions)
	add(PermissionPurchaseReturnCreate,
		menuPermissionSurface("inbound", "purchase-returns", "采购退货", "create-purchase-return", "从采购入库生成退货", permissionControlButton, "显示并允许生成", permissionMethods("purchase", "create_purchase_return_from_receipt"), businessUsageConditions),
		menuPermissionSurface("quality-inspections", "quality-actions", "质检动作", "create-purchase-return-from-quality-inspection", "退供应商", permissionControlButton, "显示并允许生成采购退货", permissionMethods("purchase", "create_purchase_return_from_quality_inspection"), businessUsageConditions),
	)
	addMenu(PermissionPurchaseReturnPost, "inbound", "purchase-returns", "采购退货", "post-purchase-return", "确认采购退货", permissionControlButton, "显示并允许确认", permissionMethods("purchase", "post_purchase_return"), businessUsageConditions)
	addMenu(PermissionPurchaseReturnCancel, "inbound", "purchase-returns", "采购退货", "cancel-purchase-return", "取消采购退货", permissionControlButton, "显示并允许取消", permissionMethods("purchase", "cancel_purchase_return"), businessUsageConditions)

	// Warehouse and shipment.
	inventoryReadMethods := append(permissionMethods("inventory", "list_inventory_balances", "list_inventory_lots", "list_inventory_txns"), permissionMethods("operational_fact", "list_stock_reservations")...)
	addMenu(PermissionWarehouseInventoryRead, "inventory", "inventory-ledger", "库存台账", "inventory-ledger-content", "库存余额、批次和流水", permissionControlPage, "允许进入并查看", inventoryReadMethods, businessUsageConditions)
	addMenu(PermissionWarehouseInboundRead, "inbound", "purchase-receipts", "采购入库", "warehouse-inbound-list", "入库列表和详情", permissionControlPage, "允许进入并查看", permissionMethods("purchase", "get_purchase_receipt", "list_purchase_receipts"), businessUsageConditions)
	inboundConfirmMethods := append(permissionMethods("purchase", "post_purchase_receipt", "cancel_purchase_receipt"), permissionMethods("customer_config", "execute_material_supply_post_inbound")...)
	addMenu(PermissionWarehouseInboundConfirm, "inbound", "purchase-receipt-actions", "入库动作", "confirm-inbound", "确认或取消入库", permissionControlButton, "显示并允许确认", inboundConfirmMethods, businessUsageConditions)
	add(PermissionWarehouseOutboundRead,
		menuPermissionSurface("shipping-release", "shipping-release", "出货放行", "shipping-release-content", "出货放行内容", permissionControlPage, "允许进入并查看", nil, businessUsageConditions),
		menuPermissionSurface("outbound", "warehouse-outbound", "出库管理", "outbound-content", "出库内容", permissionControlPage, "允许进入并查看", nil, businessUsageConditions),
	)
	addMenu(PermissionWarehouseOutboundConfirm, "outbound", "warehouse-outbound", "出库管理", "confirm-outbound", "确认出库", permissionControlButton, "显示并允许确认", nil, businessUsageConditions)
	addBackend(PermissionWarehouseAdjustmentCreate, nil, []string{"通用库存调整尚无正式业务入口"})
	add(PermissionStockReservationCreate,
		menuPermissionSurface("sales-orders", "inventory-reservations", "库存预留", "create-stock-reservation", "为销售订单预留库存", permissionControlButton, "显示并允许创建", permissionMethods("operational_fact", "create_stock_reservation_from_sales_order"), businessUsageConditions),
	)
	add(PermissionStockReservationRelease,
		menuPermissionSurface("sales-orders", "inventory-reservations", "库存预留", "release-sales-order-reservation", "释放销售订单库存预留", permissionControlButton, "显示并允许释放", permissionMethods("operational_fact", "release_stock_reservation"), businessUsageConditions),
		menuPermissionSurface("outbound", "warehouse-outbound", "出库管理", "release-stock-reservation", "释放库存预留", permissionControlButton, "显示并允许释放", permissionMethods("operational_fact", "release_stock_reservation"), businessUsageConditions),
	)

	addMenu(PermissionShipmentRead, "shipments", "shipments", "出货单", "shipment-list", "出货单列表", permissionControlPage, "允许进入并查看", permissionMethods("operational_fact", "list_shipments"), businessUsageConditions)
	addMenu(PermissionShipmentCreate, "shipments", "shipments", "出货单", "create-shipment", "创建出货单或提交出货放行", permissionControlButton, "显示并允许办理", permissionMethods("operational_fact", "create_shipment_with_items", "submit_shipment_release"), businessUsageConditions)
	addMenu(PermissionShipmentShip, "shipments", "shipment-actions", "出货动作", "ship-shipment", "确认出货", permissionControlButton, "显示并允许确认出货", permissionMethods("operational_fact", "ship_shipment"), businessUsageConditions)
	addMenu(PermissionShipmentCancel, "shipments", "shipment-actions", "出货动作", "cancel-shipment", "取消出货单", permissionControlButton, "显示并允许取消", permissionMethods("operational_fact", "cancel_shipment"), businessUsageConditions)

	// Quality.
	qualityInspectionReadMethods := permissionMethods("quality", "get_quality_inspection", "list_quality_inspections", "list_finished_goods_quality_inspections")
	add(PermissionQualityInspectionRead,
		menuPermissionSurface("quality-inspections", "quality-inspections", "质量检验", "quality-inspection-list", "质检列表和详情", permissionControlPage, "允许进入并查看", qualityInspectionReadMethods, businessUsageConditions),
		menuPermissionSurface("production-exceptions", "quality-exceptions", "品质异常", "quality-exception-list", "品质异常和检验依据", permissionControlSection, "允许查看", qualityInspectionReadMethods, businessUsageConditions),
		menuPermissionSurface("processing-contracts", "outsourcing-related-records", "委外订单", "outsourcing-return-quality-list", "查看委外回货质检", permissionControlSection, "允许查看", permissionMethods("quality", "list_outsourcing_return_quality_inspections"), businessUsageConditions),
	)
	add(PermissionQualityInspectionCreate,
		menuPermissionSurface("quality-inspections", "quality-inspections", "质量检验", "create-quality-inspection", "创建质检单", permissionControlButton, "显示并允许创建", permissionMethods("quality", "create_quality_inspection_draft"), businessUsageConditions),
		menuPermissionSurface("shipments", "shipment-actions", "出货单", "create-shipment-finished-goods-quality-inspection", "发起出货前成品检验", permissionControlButton, "显示并允许创建", permissionMethods("quality", "create_finished_goods_quality_inspection_draft"), businessUsageConditions),
		menuPermissionSurface("processing-contracts", "outsourcing-related-records", "委外订单", "create-outsourcing-return-quality-inspection", "发起委外回货质检", permissionControlButton, "显示并允许创建", permissionMethods("quality", "create_quality_inspection_from_outsourcing_return"), businessUsageConditions),
	)
	addMenu(PermissionQualityInspectionUpdate, "quality-inspections", "quality-actions", "质检动作", "decide-quality-inspection", "提交、判定或取消质检", permissionControlButton, "显示并允许处理", permissionMethods("quality", "submit_quality_inspection", "pass_quality_inspection", "reject_quality_inspection", "cancel_quality_inspection"), businessUsageConditions)
	addMenu(PermissionQualityExceptionHandle, "production-exceptions", "quality-exceptions", "品质异常", "handle-quality-exception", "处理品质异常", permissionControlButton, "显示并允许处理", nil, businessUsageConditions)

	// Finance.
	addMenu(PermissionFinancePayableRead, "payables", "payables", "应付管理", "payable-list", "应付列表和详情", permissionControlPage, "允许进入并查看", permissionMethods("operational_fact", "list_finance_facts"), businessUsageConditions)
	add(PermissionFinancePayableConfirm,
		menuPermissionSurface("payables", "payable-actions", "应付动作", "confirm-payable", "确认、结算或取消应付", permissionControlButton, "显示并允许处理", permissionMethods("operational_fact", "post_finance_fact", "settle_finance_fact", "cancel_finance_fact"), businessUsageConditions),
		menuPermissionSurface("inbound", "purchase-receipts", "采购入库", "create-purchase-receipt-payable", "从采购入库生成应付", permissionControlButton, "显示并允许创建", permissionMethods("operational_fact", "create_payable_from_purchase_receipt"), businessUsageConditions),
		menuPermissionSurface("processing-contracts", "outsourcing-related-records", "委外订单", "create-outsourcing-return-payable", "从委外回货生成应付", permissionControlButton, "显示并允许创建", permissionMethods("operational_fact", "create_payable_from_outsourcing_return"), businessUsageConditions),
	)
	addMenu(PermissionFinanceInvoiceRead, "invoices", "invoices", "发票管理", "invoice-list", "发票列表和详情", permissionControlPage, "允许进入并查看", permissionMethods("operational_fact", "list_finance_facts"), businessUsageConditions)
	addMenu(PermissionFinanceInvoiceConfirm, "invoices", "invoice-actions", "发票动作", "confirm-invoice", "生成、确认或取消发票业务记录", permissionControlButton, "显示并允许处理", permissionMethods("operational_fact", "create_invoice_from_shipment", "post_finance_fact", "cancel_finance_fact"), businessUsageConditions)
	add(PermissionFinanceReceivableRead,
		menuPermissionSurface("receivables", "receivables", "应收管理", "receivable-list", "应收列表和详情", permissionControlPage, "允许进入并查看", permissionMethods("operational_fact", "list_finance_facts"), businessUsageConditions),
		menuPermissionSurface("shipping-release", "finance-release", "财务放行", "receivable-release", "应收放行区域", permissionControlSection, "允许查看", nil, businessUsageConditions),
	)
	addMenu(PermissionFinanceReceivableConfirm, "receivables", "receivable-actions", "应收动作", "confirm-receivable", "生成、确认、结清或取消应收", permissionControlButton, "显示并允许处理", permissionMethods("operational_fact", "create_receivable_from_shipment", "post_finance_fact", "settle_finance_fact", "cancel_finance_fact"), businessUsageConditions)
	addMenu(PermissionFinanceReconciliationRead, "reconciliation", "reconciliation", "对账管理", "reconciliation-list", "对账列表和详情", permissionControlPage, "允许进入并查看", permissionMethods("operational_fact", "list_finance_facts"), businessUsageConditions)
	addMenu(PermissionFinanceReconciliationConfirm, "reconciliation", "reconciliation-actions", "对账动作", "confirm-reconciliation", "从已过账财务记录生成、确认、完成或取消单笔核对", permissionControlButton, "显示并允许处理", permissionMethods("operational_fact", "create_reconciliation_from_finance_fact", "post_finance_fact", "settle_finance_fact", "cancel_finance_fact"), businessUsageConditions)
	addBackend(PermissionFinanceReportRead, permissionMethods("operational_fact", "list_finance_facts"), businessUsageConditions)

	// PMC and production.
	add(PermissionPMCPlanRead,
		menuPermissionSurface("production-orders", "production-orders", "生产订单", "production-order-list", "生产订单列表和详情", permissionControlPage, "允许进入并查看", permissionMethods("production_order", "get_production_order", "list_production_orders", "list_production_order_reference_options"), businessUsageConditions),
		menuPermissionSurface("production-scheduling", "production-planning", "生产排程", "production-schedule", "生产排程内容", permissionControlPage, "允许进入并查看", nil, businessUsageConditions),
		menuPermissionSurface("production-progress", "production-progress", "生产进度", "production-progress-content", "生产进度内容", permissionControlPage, "允许进入并查看", nil, businessUsageConditions),
	)
	addMenu(PermissionPMCPlanCreate, "production-orders", "production-orders", "生产订单", "create-production-order", "新建生产订单", permissionControlButton, "显示并允许创建", permissionMethods("production_order", "create_production_order"), businessUsageConditions)
	addMenu(PermissionPMCPlanUpdate, "production-orders", "production-order-actions", "生产动作", "update-production-order", "编辑、发布、关闭或取消生产订单", permissionControlForm, "显示并允许处理", permissionMethods("production_order", "save_production_order", "release_production_order", "close_production_order", "cancel_production_order"), businessUsageConditions)
	add(PermissionProductionFactRead,
		menuPermissionSurface("production-orders", "production-related-records", "关联生产记录", "production-fact-reference", "查看订单关联生产记录", permissionControlSection, "允许查看", permissionMethods("operational_fact", "list_production_facts"), businessUsageConditions),
		menuPermissionSurface("production-progress", "production-progress", "生产进度", "production-fact-list", "生产记录列表", permissionControlPage, "允许进入并查看", permissionMethods("operational_fact", "list_production_facts"), businessUsageConditions),
	)
	productionWIPReadMethods := append(
		permissionMethods("production_order", "get_production_order", "list_production_orders"),
		permissionMethods("production_wip", "get_production_wip")...,
	)
	addMenu(PermissionProductionWIPRead, "production-orders", "production-wip", "工序办理", "view-production-wip", "查看生产订单、路线、在制批次和质量关口", permissionControlSection, "允许查看", productionWIPReadMethods, businessUsageConditions)
	addMenu(PermissionProductionWIPAssign, "production-orders", "production-wip", "工序办理", "assign-production-wip", "拆分批次并安排本厂或外发", permissionControlButton, "显示并允许安排", permissionMethods("production_wip", "initialize_production_wip", "execute_production_wip_action"), businessUsageConditions)
	addMenu(PermissionProductionWIPExecute, "production-orders", "production-wip", "工序办理", "execute-production-wip", "开始、完工、外发回仓和车间移交", permissionControlButton, "显示并允许办理", permissionMethods("production_wip", "execute_production_wip_action"), businessUsageConditions)
	addMenu(PermissionProductionWIPRework, "production-orders", "production-wip", "工序办理", "rework-production-wip", "选择目标工序并安排返工", permissionControlButton, "显示并允许返工", permissionMethods("production_wip", "execute_production_wip_action"), businessUsageConditions)
	addMenu(PermissionPackagingMaterialConfirm, "production-orders", "production-wip", "工序办理", "confirm-packaging-material", "确认包材版面与包装版本", permissionControlButton, "显示并允许业务确认", permissionMethods("production_wip", "execute_production_wip_action"), businessUsageConditions)
	addMenu(PermissionProductionCompletionCreate, "production-orders", "production-order-actions", "生产动作", "create-production-completion", "登记完工入库", permissionControlButton, "显示并允许登记", permissionMethods("operational_fact", "create_production_completion_from_order"), businessUsageConditions)
	addMenu(PermissionProductionMaterialIssueCreate, "production-orders", "production-order-actions", "生产动作", "create-production-material-issue", "登记生产领料", permissionControlButton, "显示并允许登记", permissionMethods("operational_fact", "create_production_material_issue_from_order"), businessUsageConditions)
	addMenu(PermissionProductionReworkCreate, "production-progress", "production-fact-actions", "生产记录动作", "create-production-rework", "发起返工", permissionControlButton, "显示并允许发起", permissionMethods("operational_fact", "create_production_rework_from_completion"), businessUsageConditions)
	addMenu(PermissionProductionFactPost, "production-progress", "production-fact-actions", "生产记录动作", "post-production-fact", "确认生产记录", permissionControlButton, "显示并允许确认", permissionMethods("operational_fact", "post_production_fact"), businessUsageConditions)
	addMenu(PermissionProductionFactCancel, "production-progress", "production-fact-actions", "生产记录动作", "cancel-production-fact", "取消生产记录", permissionControlButton, "显示并允许取消", permissionMethods("operational_fact", "cancel_production_fact"), businessUsageConditions)
	addMenu(PermissionPMCRiskRead, "production-exceptions", "production-risks", "生产风险", "production-risk-list", "生产风险和异常", permissionControlPage, "允许进入并查看", nil, businessUsageConditions)
	addMenu(PermissionPMCRiskHandle, "production-exceptions", "production-risks", "生产风险", "handle-production-risk", "处理生产风险", permissionControlButton, "显示并允许处理", nil, businessUsageConditions)

	// Mobile role entry permissions use explicit routes, not string-derived paths.
	addMobile := func(permissionKey string, roleKey string, pageLabel string, path string) {
		add(permissionKey, explicitPermissionSurface("mobile-"+roleKey+"-tasks", pageLabel, path, "mobile-tasks", "岗位任务", "mobile-task-entry", pageLabel, permissionControlMobileEntry, "允许进入岗位任务端", permissionMethods("workflow", "list_tasks", "get_task_board", "explain_action_access"), []string{permissionKey}, nil, mobileUsageConditions))
	}
	addMobile(PermissionMobileBossAccess, BossRoleKey, "老板岗位任务端", "/m/boss/tasks")
	addMobile(PermissionMobileSalesAccess, SalesRoleKey, "业务岗位任务端", "/m/sales/tasks")
	addMobile(PermissionMobilePurchaseAccess, PurchaseRoleKey, "采购岗位任务端", "/m/purchase/tasks")
	addMobile(PermissionMobileProductionAccess, ProductionRoleKey, "生产岗位任务端", "/m/production/tasks")
	addMobile(PermissionMobileWarehouseAccess, WarehouseRoleKey, "仓库岗位任务端", "/m/warehouse/tasks")
	addMobile(PermissionMobileQualityAccess, QualityRoleKey, "品质岗位任务端", "/m/quality/tasks")
	addMobile(PermissionMobileFinanceAccess, FinanceRoleKey, "财务岗位任务端", "/m/finance/tasks")
	addMobile(PermissionMobilePMCAccess, PMCRoleKey, "PMC 岗位任务端", "/m/pmc/tasks")
	addMobile(PermissionMobileEngineeringAccess, EngineeringRoleKey, "工程岗位任务端", "/m/engineering/tasks")

	// Debug permissions never advertise a production product entry.
	addBackend(PermissionDebugSeed, permissionMethods("debug", "rebuild_business_chain_scenario", "seed_business_chain_scenario"), debugUsageConditions)
	addBackend(PermissionDebugCleanup, permissionMethods("debug", "clear_business_chain_scenario", "cleanup_business_chain_scenario"), debugUsageConditions)
	addBackend(PermissionDebugBusinessClear, permissionMethods("debug", "clear_business_data"), debugUsageConditions)
	addBackend(PermissionDebugBusinessChainRun, permissionMethods("debug", "rebuild_business_chain_scenario", "seed_business_chain_scenario", "clear_business_chain_scenario", "cleanup_business_chain_scenario"), debugUsageConditions)
	addBackend(PermissionDebugBusinessChainRead, permissionMethods("debug", "capabilities", "config"), debugUsageConditions)

	return out
}
