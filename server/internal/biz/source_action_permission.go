package biz

import "strings"

// SourceActionReadPermissionRule describes one source-read capability needed
// by a public action that derives a document, fact, workflow projection, or
// process from an existing business record. An empty Condition means the
// permission is always required; conditional rules are enabled only after the
// service has parsed the request or resolved the authoritative source type.
type SourceActionReadPermissionRule struct {
	PermissionKey string
	Condition     string
}

// SourceActionReadPermissionContract is the single permission truth shared by
// JSON-RPC handlers and the permission usage registry. Domain and Method name
// the public JSON-RPC operation, not an internal repository helper.
type SourceActionReadPermissionContract struct {
	Domain string
	Method string
	Rules  []SourceActionReadPermissionRule
}

const (
	SourceReadConditionProductionSalesOrderItem = "production_sales_order_item"
	SourceReadConditionProductionBOMHeader      = "production_bom_header"
	SourceReadConditionOutsourcedExecution      = "outsourced_execution"
	SourceReadConditionShipmentSalesOrder       = "shipment_sales_order"
	SourceReadConditionFinancePayable           = "finance_payable"
	SourceReadConditionFinanceReceivable        = "finance_receivable"
	SourceReadConditionFinanceInvoice           = "finance_invoice"
)

var publicSourceActionReadPermissionContracts = []SourceActionReadPermissionContract{
	{Domain: "bom", Method: "copy_bom_version", Rules: sourceReadRules(PermissionBOMRead)},
	{Domain: "purchase", Method: "create_purchase_receipt_from_purchase_order", Rules: sourceReadRules(PermissionPurchaseOrderRead)},
	{Domain: "purchase", Method: "add_purchase_receipt_item", Rules: sourceReadRules(PermissionPurchaseOrderRead)},
	{Domain: "purchase", Method: "create_purchase_return_from_receipt", Rules: sourceReadRules(PermissionPurchaseReceiptRead)},
	{Domain: "purchase", Method: "create_purchase_return_from_quality_inspection", Rules: sourceReadRules(PermissionQualityInspectionRead, PermissionPurchaseReceiptRead)},
	{Domain: "purchase", Method: "create_purchase_rejection_disposition", Rules: sourceReadRules(PermissionQualityInspectionRead, PermissionPurchaseReceiptRead)},
	{Domain: "purchase", Method: "create_purchase_receipt_adjustment_from_receipt", Rules: sourceReadRules(PermissionPurchaseReceiptRead)},
	{Domain: "quality", Method: "create_quality_inspection_draft", Rules: sourceReadRules(PermissionPurchaseReceiptRead)},
	{Domain: "quality", Method: "create_quality_inspection_from_outsourcing_return", Rules: sourceReadRules(PermissionOutsourcingFactRead, PermissionOutsourcingOrderRead)},
	{Domain: "quality", Method: "create_finished_goods_quality_inspection_draft", Rules: sourceReadRules(PermissionShipmentRead)},
	{Domain: "quality", Method: "list_outsourcing_return_quality_inspections", Rules: sourceReadRules(PermissionOutsourcingFactRead)},
	{Domain: "quality", Method: "list_finished_goods_quality_inspections", Rules: sourceReadRules(PermissionShipmentRead)},
	{Domain: "quality", Method: "list_production_stage_quality_inspections", Rules: sourceReadRules(PermissionProductionWIPRead)},
	{Domain: "operational_fact", Method: "create_production_completion_from_order", Rules: sourceReadRules(PermissionPMCPlanRead)},
	{Domain: "operational_fact", Method: "create_production_material_issue_from_order", Rules: sourceReadRules(PermissionPMCPlanRead)},
	{Domain: "operational_fact", Method: "create_production_rework_from_completion", Rules: sourceReadRules(PermissionProductionFactRead, PermissionPMCPlanRead)},
	{Domain: "operational_fact", Method: "post_production_fact", Rules: sourceReadRules(PermissionProductionFactRead)},
	{Domain: "operational_fact", Method: "list_production_order_material_requirements", Rules: sourceReadRules(PermissionPMCPlanRead)},
	{Domain: "operational_fact", Method: "create_outsourcing_material_issue_from_order", Rules: sourceReadRules(PermissionOutsourcingOrderRead)},
	{Domain: "operational_fact", Method: "create_outsourcing_return_receipt_from_order", Rules: sourceReadRules(PermissionOutsourcingOrderRead)},
	{Domain: "operational_fact", Method: "create_outsourcing_return_disposition", Rules: sourceReadRules(PermissionQualityInspectionRead, PermissionOutsourcingFactRead)},
	{Domain: "operational_fact", Method: "submit_production_exception", Rules: sourceReadRules(PermissionQualityInspectionRead, PermissionProductionWIPRead)},
	{Domain: "operational_fact", Method: "create_stock_reservation_from_sales_order", Rules: sourceReadRules(PermissionSalesOrderRead, PermissionSalesOrderItemRead)},
	{Domain: "operational_fact", Method: "create_receivable_from_shipment", Rules: sourceReadRules(PermissionShipmentRead)},
	{Domain: "operational_fact", Method: "create_invoice_from_shipment", Rules: sourceReadRules(PermissionShipmentRead)},
	{Domain: "operational_fact", Method: "create_sales_return", Rules: sourceReadRules(PermissionShipmentRead)},
	{Domain: "operational_fact", Method: "create_payable_from_purchase_receipt", Rules: sourceReadRules(PermissionPurchaseReceiptRead, PermissionPurchaseReturnRead, PermissionPurchaseReceiptAdjustmentRead)},
	{Domain: "operational_fact", Method: "create_payable_from_outsourcing_return", Rules: sourceReadRules(PermissionOutsourcingFactRead, PermissionOutsourcingOrderRead, PermissionQualityInspectionRead)},
	{
		Domain: "operational_fact", Method: "create_reconciliation_from_finance_fact",
		Rules: []SourceActionReadPermissionRule{
			{PermissionKey: PermissionFinancePayableRead, Condition: SourceReadConditionFinancePayable},
			{PermissionKey: PermissionFinanceReceivableRead, Condition: SourceReadConditionFinanceReceivable},
			{PermissionKey: PermissionFinanceInvoiceRead, Condition: SourceReadConditionFinanceInvoice},
		},
	},
	{
		Domain: "operational_fact", Method: "list_shipment_source_candidates",
		Rules: sourceReadRules(PermissionSalesOrderRead, PermissionSalesOrderItemRead),
	},
	{
		Domain: "operational_fact", Method: "create_shipment_with_items",
		Rules: []SourceActionReadPermissionRule{
			{PermissionKey: PermissionSalesOrderRead, Condition: SourceReadConditionShipmentSalesOrder},
			{PermissionKey: PermissionSalesOrderItemRead, Condition: SourceReadConditionShipmentSalesOrder},
		},
	},
	{
		Domain: "production_order", Method: "create_production_order",
		Rules: productionOrderSourceReadRules(),
	},
	{
		Domain: "production_order", Method: "save_production_order",
		Rules: productionOrderSourceReadRules(),
	},
	{
		Domain: "production_order", Method: "list_production_order_reference_options",
		Rules: productionOrderSourceReadRules(),
	},
	{Domain: "production_order", Method: "release_production_order", Rules: sourceReadRules(PermissionPMCPlanRead)},
	{
		Domain: "production_wip", Method: "execute_production_wip_action",
		Rules: []SourceActionReadPermissionRule{
			{PermissionKey: PermissionProductionWIPRead},
			{PermissionKey: PermissionOutsourcingOrderRead, Condition: SourceReadConditionOutsourcedExecution},
		},
	},
	{Domain: "customer_config", Method: "start_sales_order_acceptance_process", Rules: sourceReadRules(PermissionSalesOrderRead)},
	{Domain: "customer_config", Method: "execute_sales_order_acceptance_submit", Rules: sourceReadRules(PermissionSalesOrderRead)},
	{Domain: "customer_config", Method: "start_material_supply_purchase_order_process", Rules: sourceReadRules(PermissionPurchaseOrderRead)},
	{Domain: "customer_config", Method: "execute_material_supply_purchase_receipt_create", Rules: sourceReadRules(PermissionPurchaseOrderRead)},
	{Domain: "customer_config", Method: "execute_material_supply_quality_gate", Rules: sourceReadRules(PermissionPurchaseReceiptRead, PermissionQualityInspectionRead)},
	{Domain: "customer_config", Method: "execute_material_supply_post_inbound", Rules: sourceReadRules(PermissionPurchaseReceiptRead)},
	{Domain: "customer_config", Method: "start_finished_goods_delivery_process", Rules: sourceReadRules(PermissionShipmentRead)},
	{Domain: "customer_config", Method: "execute_finished_goods_delivery_quality_decide", Rules: sourceReadRules(PermissionShipmentRead, PermissionQualityInspectionRead)},
	{Domain: "customer_config", Method: "execute_finished_goods_delivery_shipment_ship", Rules: sourceReadRules(PermissionShipmentRead)},
	{Domain: "customer_config", Method: "execute_finished_goods_delivery_receivable_lead", Rules: sourceReadRules(PermissionShipmentRead)},
}

func sourceReadRules(permissionKeys ...string) []SourceActionReadPermissionRule {
	rules := make([]SourceActionReadPermissionRule, 0, len(permissionKeys))
	for _, permissionKey := range permissionKeys {
		rules = append(rules, SourceActionReadPermissionRule{PermissionKey: permissionKey})
	}
	return rules
}

func productionOrderSourceReadRules() []SourceActionReadPermissionRule {
	return []SourceActionReadPermissionRule{
		{PermissionKey: PermissionSalesOrderRead, Condition: SourceReadConditionProductionSalesOrderItem},
		{PermissionKey: PermissionSalesOrderItemRead, Condition: SourceReadConditionProductionSalesOrderItem},
		{PermissionKey: PermissionBOMRead, Condition: SourceReadConditionProductionBOMHeader},
	}
}

// PublicSourceActionReadPermissionContracts returns a defensive copy so tests,
// service guards, and explanatory metadata cannot mutate the registry.
func PublicSourceActionReadPermissionContracts() []SourceActionReadPermissionContract {
	out := make([]SourceActionReadPermissionContract, len(publicSourceActionReadPermissionContracts))
	for index, contract := range publicSourceActionReadPermissionContracts {
		out[index] = contract
		out[index].Rules = append([]SourceActionReadPermissionRule(nil), contract.Rules...)
	}
	return out
}

// SourceActionReadPermissions resolves the exact all-of permission set for one
// public source action after its applicable conditions are known.
func SourceActionReadPermissions(domain, method string, enabledConditions ...string) ([]string, bool) {
	contract, ok := sourceActionReadPermissionContract(domain, method)
	if !ok {
		return nil, false
	}
	enabled := make(map[string]struct{}, len(enabledConditions))
	for _, condition := range enabledConditions {
		condition = strings.TrimSpace(condition)
		if condition != "" {
			enabled[condition] = struct{}{}
		}
	}
	permissions := make([]string, 0, len(contract.Rules))
	seen := make(map[string]struct{}, len(contract.Rules))
	for _, rule := range contract.Rules {
		if rule.Condition != "" {
			if _, applies := enabled[rule.Condition]; !applies {
				continue
			}
		}
		if _, duplicate := seen[rule.PermissionKey]; duplicate {
			continue
		}
		seen[rule.PermissionKey] = struct{}{}
		permissions = append(permissions, rule.PermissionKey)
	}
	return permissions, true
}

// SourceActionReadPermissionCandidates returns every distinct permission that
// can satisfy a conditional contract. Dynamic source-type actions use this to
// deny callers with no source visibility before resolving the source record,
// then apply SourceActionReadPermissions again for the exact authoritative
// source type.
func SourceActionReadPermissionCandidates(domain, method string) ([]string, bool) {
	contract, ok := sourceActionReadPermissionContract(domain, method)
	if !ok {
		return nil, false
	}
	permissions := make([]string, 0, len(contract.Rules))
	seen := make(map[string]struct{}, len(contract.Rules))
	for _, rule := range contract.Rules {
		if _, duplicate := seen[rule.PermissionKey]; duplicate {
			continue
		}
		seen[rule.PermissionKey] = struct{}{}
		permissions = append(permissions, rule.PermissionKey)
	}
	return permissions, true
}

func sourceActionReadPermissionContract(domain, method string) (SourceActionReadPermissionContract, bool) {
	domain = strings.TrimSpace(domain)
	method = strings.TrimSpace(method)
	for _, contract := range publicSourceActionReadPermissionContracts {
		if contract.Domain == domain && contract.Method == method {
			return contract, true
		}
	}
	return SourceActionReadPermissionContract{}, false
}

// FinanceSourceReadCondition selects the one read capability matching the
// authoritative source finance fact type. It never grants a broad any-of read.
func FinanceSourceReadCondition(factType string) (string, bool) {
	switch strings.ToUpper(strings.TrimSpace(factType)) {
	case FinanceFactPayable:
		return SourceReadConditionFinancePayable, true
	case FinanceFactReceivable:
		return SourceReadConditionFinanceReceivable, true
	case FinanceFactInvoice:
		return SourceReadConditionFinanceInvoice, true
	default:
		return "", false
	}
}
