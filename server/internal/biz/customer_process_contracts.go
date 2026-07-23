package biz

import (
	"fmt"
	"strings"
)

const (
	CustomerConfigManifestSchemaVersionCurrent = "customer-config-manifest/v1"
	CustomerProcessContractVersionCurrent      = "customer-process-contract/v1"

	CustomerProcessVariantSalesApprovalPMC            = "approval_pmc"
	CustomerProcessVariantSalesApprovalEngineeringPMC = "approval_engineering_pmc"
	CustomerProcessVariantMaterialReceiptIQCInbound   = "purchase_receipt_iqc_inbound"
	CustomerProcessVariantFinishedGoodsDelivery       = "quality_finance_ship_receivable"
)

type customerProcessSelection struct {
	ProcessKey      string
	ProcessVersion  string
	VariantKey      string
	BusinessRefType string
}

type customerProcessContract struct {
	Selection      customerProcessSelection
	DomainBoundary string
	FactBoundary   string
	Guardrail      string
	Nodes          []ProcessNodeInstanceCreate
}

// normalizeCustomerProcessContracts keeps the executable graph owned by the
// Product Core. A customer manifest may select a registered variant, but it
// cannot add, remove or reorder nodes or change pools, capabilities or domain
// commands. Preview workflows are deliberately not an input to this function.
func normalizeCustomerProcessContracts(snapshot map[string]any) (map[string]any, error) {
	if len(snapshot) == 0 {
		return nil, ErrBadParam
	}
	if _, suppliedGraph := snapshot["processDefinitions"]; suppliedGraph {
		return nil, fmt.Errorf("%w: customer config input cannot supply runtime process definitions", ErrBadParam)
	}

	selections, err := customerProcessSelectionsFromSnapshot(snapshot)
	if err != nil {
		return nil, err
	}
	if len(selections) == 0 {
		return snapshot, nil
	}

	if strings.TrimSpace(getStringFromAnyMap(snapshot, "manifest_schema_version")) != CustomerConfigManifestSchemaVersionCurrent {
		return nil, fmt.Errorf("%w: unsupported customer config manifest schema version", ErrBadParam)
	}
	if strings.TrimSpace(getStringFromAnyMap(snapshot, "process_contract_version")) != CustomerProcessContractVersionCurrent {
		return nil, fmt.Errorf("%w: unsupported customer process contract version", ErrBadParam)
	}
	if strings.TrimSpace(getStringFromAnyMap(snapshot, "manifest_status")) != "runtime_compile_ready" {
		return nil, fmt.Errorf("%w: runtime process selections require a formal compile manifest", ErrBadParam)
	}
	if runtimeEnabled, ok := snapshot["runtime_enabled"].(bool); !ok || !runtimeEnabled {
		return nil, fmt.Errorf("%w: runtime process selections require runtime_enabled", ErrBadParam)
	}
	if publishable, ok := snapshot["publishable"].(bool); !ok || !publishable {
		return nil, fmt.Errorf("%w: runtime process selections require a publishable manifest", ErrBadParam)
	}

	canonicalDefinitions := make(map[string]any, len(selections))
	canonicalSelections := make([]any, 0, len(selections))
	seen := make(map[string]struct{}, len(selections))
	for _, selection := range selections {
		if _, exists := seen[selection.ProcessKey]; exists {
			return nil, fmt.Errorf("%w: duplicate runtime process selection %s", ErrBadParam, selection.ProcessKey)
		}
		seen[selection.ProcessKey] = struct{}{}

		contract, ok := lookupCustomerProcessContract(selection)
		if !ok {
			return nil, fmt.Errorf(
				"%w: unsupported runtime process selection %s/%s/%s/%s",
				ErrBadParam,
				selection.ProcessKey,
				selection.ProcessVersion,
				selection.VariantKey,
				selection.BusinessRefType,
			)
		}
		if err := validateCustomerProcessContractForPublish(contract); err != nil {
			return nil, err
		}
		canonicalSelections = append(canonicalSelections, customerProcessSelectionMap(selection))
		canonicalDefinitions[selection.ProcessKey] = customerProcessDefinitionFromContract(contract)
	}

	out := make(map[string]any, len(snapshot)+1)
	for key, value := range snapshot {
		out[key] = value
	}
	out["runtimeProcessSelections"] = canonicalSelections
	out["processDefinitions"] = canonicalDefinitions
	return out, nil
}

func validateCustomerProcessContractForPublish(contract customerProcessContract) error {
	for _, node := range contract.Nodes {
		if err := validateCustomerConfigProcessNode(
			contract.Selection.ProcessKey,
			contract.Selection.BusinessRefType,
			node.NodeKey,
			node.NodeType,
			node.PolicySnapshot,
		); err != nil {
			return fmt.Errorf("%w: invalid Product Core process node %s", err, node.NodeKey)
		}
	}
	return nil
}

func customerProcessSelectionsFromSnapshot(snapshot map[string]any) ([]customerProcessSelection, error) {
	rawSelections, exists := snapshot["runtimeProcessSelections"]
	if !exists || rawSelections == nil {
		return []customerProcessSelection{}, nil
	}
	items := anyListValue(rawSelections)
	if len(items) == 0 {
		return []customerProcessSelection{}, nil
	}
	out := make([]customerProcessSelection, 0, len(items))
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%w: runtime process selection must be an object", ErrBadParam)
		}
		selection := customerProcessSelection{
			ProcessKey:      strings.TrimSpace(getStringFromAnyMap(item, "process_key")),
			ProcessVersion:  strings.TrimSpace(getStringFromAnyMap(item, "process_version")),
			VariantKey:      strings.TrimSpace(getStringFromAnyMap(item, "variant_key")),
			BusinessRefType: strings.TrimSpace(getStringFromAnyMap(item, "business_ref_type")),
		}
		if selection.ProcessKey == "" || selection.ProcessVersion == "" || selection.VariantKey == "" || selection.BusinessRefType == "" {
			return nil, fmt.Errorf("%w: runtime process selection identity is incomplete", ErrBadParam)
		}
		out = append(out, selection)
	}
	return out, nil
}

func customerProcessSelectionMap(selection customerProcessSelection) map[string]any {
	return map[string]any{
		"process_key":       selection.ProcessKey,
		"process_version":   selection.ProcessVersion,
		"variant_key":       selection.VariantKey,
		"business_ref_type": selection.BusinessRefType,
	}
}

func lookupCustomerProcessContract(selection customerProcessSelection) (customerProcessContract, bool) {
	for _, contract := range builtinCustomerProcessContracts() {
		if contract.Selection == selection {
			return contract, true
		}
	}
	return customerProcessContract{}, false
}

func customerProcessDefinitionFromContract(contract customerProcessContract) map[string]any {
	nodes := make([]any, 0, len(contract.Nodes))
	for _, node := range contract.Nodes {
		item := map[string]any{
			"node_key":  node.NodeKey,
			"node_type": node.NodeType,
		}
		if node.OwnerPoolKey != nil {
			item["owner_pool_key"] = *node.OwnerPoolKey
		}
		if node.RequiredCapabilityKey != nil {
			item["required_capability_key"] = *node.RequiredCapabilityKey
		}
		if node.FormProfileKey != nil {
			item["form_profile_key"] = *node.FormProfileKey
		}
		if node.ActionSetKey != nil {
			item["action_set_key"] = *node.ActionSetKey
		}
		if len(node.PolicySnapshot) > 0 {
			policy := cloneProcessPolicySnapshot(node.PolicySnapshot)
			item["policy_snapshot"] = policy
			item["fact_command_contract"] = map[string]any{
				"command_key":                        getStringFromAnyMap(policy, "command_key"),
				"runtime_binding_status":             "process_runtime_handler_registered",
				"process_runtime_handler_registered": true,
				"runtime_loader_blockers":            []any{},
				"runtime_execute_blockers":           []any{},
				"writes_fact":                        false,
			}
		}
		nodes = append(nodes, item)
	}
	return map[string]any{
		"process_key":            contract.Selection.ProcessKey,
		"process_version":        contract.Selection.ProcessVersion,
		"variant_key":            contract.Selection.VariantKey,
		"manifest_status":        "runtime_loader_ready",
		"runtime_loader_enabled": true,
		"business_ref_type":      contract.Selection.BusinessRefType,
		"domain_boundary":        contract.DomainBoundary,
		"fact_boundary":          contract.FactBoundary,
		"config_revision_source": "immutable_customer_config_revision",
		"definition_hash_source": "product_core_canonical_contract",
		"source_status":          "product_core_contract",
		"nodes":                  nodes,
		"guardrail":              contract.Guardrail,
	}
}

func builtinCustomerProcessContracts() []customerProcessContract {
	return []customerProcessContract{
		newSalesOrderAcceptanceContract(CustomerProcessVariantSalesApprovalPMC, false),
		newSalesOrderAcceptanceContract(CustomerProcessVariantSalesApprovalEngineeringPMC, true),
		newMaterialSupplyContract(),
		newFinishedGoodsDeliveryContract(),
	}
}

func newSalesOrderAcceptanceContract(variantKey string, includeEngineering bool) customerProcessContract {
	nodes := []ProcessNodeInstanceCreate{
		customerDomainCommandNode(
			"submit_sales_order",
			"",
			PermissionSalesOrderSubmit,
			ProcessDomainCommandSalesOrderSubmit,
			"SalesOrderUsecase.SubmitSalesOrder",
		),
		customerHumanProcessNode(
			"order_approval",
			ProcessNodeTypeApproval,
			"boss",
			PermissionWorkflowTaskApprove,
			"sales_order_approval.default",
			"sales_order_approval",
		),
		customerDomainCommandNode(
			"activate_sales_order",
			"",
			PermissionWorkflowTaskApprove,
			ProcessDomainCommandSalesOrderActivate,
			"SalesOrderUsecase.ActivateSalesOrderForProcessCommand",
		),
	}
	if includeEngineering {
		nodes = append(nodes, customerHumanProcessNode(
			"engineering_data",
			ProcessNodeTypeHumanTask,
			"engineering_data",
			PermissionWorkflowTaskComplete,
			"engineering_data.default",
			"engineering_data",
		))
	}
	nodes = append(nodes,
		customerHumanProcessNode(
			"order_review",
			ProcessNodeTypeHumanTask,
			"order_review",
			PermissionWorkflowTaskComplete,
			"sales_order_review.default",
			"sales_order_review",
		),
		ProcessNodeInstanceCreate{NodeKey: "end", NodeType: ProcessNodeTypeEnd},
	)
	return customerProcessContract{
		Selection: customerProcessSelection{
			ProcessKey:      ProcessKeySalesOrderAcceptance,
			ProcessVersion:  "v1",
			VariantKey:      variantKey,
			BusinessRefType: "sales_order",
		},
		DomainBoundary: "source_document_command_only",
		FactBoundary:   "no_fact_posting",
		Guardrail:      "The Product Core submits the sales source document and creates only the approved responsibility tasks; Workflow completion never posts inventory, shipment or finance facts.",
		Nodes:          nodes,
	}
}

func newMaterialSupplyContract() customerProcessContract {
	return customerProcessContract{
		Selection: customerProcessSelection{
			ProcessKey:      ProcessKeyMaterialSupply,
			ProcessVersion:  "v1",
			VariantKey:      CustomerProcessVariantMaterialReceiptIQCInbound,
			BusinessRefType: "purchase_order",
		},
		DomainBoundary: "explicit_fact_command_api",
		FactBoundary:   "no_fact_posting",
		Guardrail:      "The Product Core creates the receipt source document, evaluates formal line quality decisions and posts inbound inventory only through registered domain usecases.",
		Nodes: []ProcessNodeInstanceCreate{
			customerHumanProcessNode(
				"purchase_order_approval",
				ProcessNodeTypeApproval,
				"boss",
				PermissionWorkflowTaskApprove,
				"purchase_order_approval.default",
				"purchase_order_approval",
			),
			customerDomainCommandNode(
				"approve_purchase_order",
				"",
				PermissionWorkflowTaskApprove,
				ProcessDomainCommandPurchaseOrderApprove,
				"PurchaseOrderUsecase.ApprovePurchaseOrder",
			),
			customerDomainCommandNode(
				"purchase_receipt_source",
				"purchase_receipt_source",
				PermissionPurchaseReceiptCreate,
				ProcessDomainCommandPurchaseReceiptCreate,
				"InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder",
			),
			customerDomainCommandNode(
				"incoming_qc",
				"incoming_qc",
				PermissionQualityInspectionUpdate,
				ProcessDomainCommandIncomingQualityGate,
				"InventoryUsecase.EvaluatePurchaseReceiptQualityGate",
			),
			customerDomainCommandNode(
				"warehouse_inbound",
				"warehouse_inbound",
				PermissionWarehouseInboundConfirm,
				ProcessDomainCommandInventoryPostInbound,
				"InventoryUsecase.PostPurchaseReceipt",
			),
			{NodeKey: "end", NodeType: ProcessNodeTypeEnd},
		},
	}
}

func newFinishedGoodsDeliveryContract() customerProcessContract {
	return customerProcessContract{
		Selection: customerProcessSelection{
			ProcessKey:      ProcessKeyFinishedGoodsDelivery,
			ProcessVersion:  "v1",
			VariantKey:      CustomerProcessVariantFinishedGoodsDelivery,
			BusinessRefType: "shipment",
		},
		DomainBoundary: "explicit_fact_command_api",
		FactBoundary:   "no_fact_posting",
		Guardrail:      "Quality, finance release, shipment and receivable facts remain owned by registered Product Core domain usecases and their transaction and idempotency rules.",
		Nodes: []ProcessNodeInstanceCreate{
			customerDomainCommandNode(
				"finished_goods_quality",
				"finished_goods_quality",
				PermissionQualityInspectionUpdate,
				ProcessDomainCommandFinishedGoodsQualityDecide,
				"InventoryUsecase.PassQualityInspection/RejectQualityInspection",
			),
			customerHumanProcessNode(
				"shipment_finance_approval",
				ProcessNodeTypeApproval,
				"finance",
				PermissionWorkflowTaskApprove,
				"shipment_finance_approval.default",
				"shipment_finance_approval",
			),
			customerDomainCommandNode(
				"shipment_finance_release",
				"shipment_finance_release",
				PermissionFinanceReceivableConfirm,
				ProcessDomainCommandShipmentFinanceRelease,
				"OperationalFactUsecase.RecordShipmentFinanceRelease",
			),
			customerDomainCommandNode(
				"shipment_execution",
				"shipment_execution",
				PermissionShipmentShip,
				ProcessDomainCommandShipmentShip,
				"OperationalFactUsecase.ShipShipment",
			),
			customerDomainCommandNode(
				"receivable_lead",
				"receivable_lead",
				PermissionFinanceReceivableConfirm,
				ProcessDomainCommandFinanceReceivableLead,
				"OperationalFactUsecase.CreateFinanceFactDraft",
			),
			{NodeKey: "end", NodeType: ProcessNodeTypeEnd},
		},
	}
}

func customerHumanProcessNode(nodeKey, nodeType, ownerPoolKey, capabilityKey, formProfileKey, actionSetKey string) ProcessNodeInstanceCreate {
	return ProcessNodeInstanceCreate{
		NodeKey:               nodeKey,
		NodeType:              nodeType,
		OwnerPoolKey:          optionalStringPointer(ownerPoolKey),
		RequiredCapabilityKey: optionalStringPointer(capabilityKey),
		FormProfileKey:        optionalStringPointer(formProfileKey),
		ActionSetKey:          optionalStringPointer(actionSetKey),
	}
}

func customerDomainCommandNode(nodeKey, ownerPoolKey, capabilityKey, commandKey, handler string) ProcessNodeInstanceCreate {
	node := ProcessNodeInstanceCreate{
		NodeKey:               nodeKey,
		NodeType:              ProcessNodeTypeDomainCommand,
		OwnerPoolKey:          optionalStringPointer(ownerPoolKey),
		RequiredCapabilityKey: optionalStringPointer(capabilityKey),
		PolicySnapshot: map[string]any{
			"command_key":              commandKey,
			"handler":                  handler,
			"idempotency_key_required": true,
			"writes_fact":              false,
		},
	}
	if commandKey == ProcessDomainCommandSalesOrderActivate || commandKey == ProcessDomainCommandPurchaseOrderApprove || commandKey == ProcessDomainCommandShipmentFinanceRelease {
		node.PolicySnapshot["execute_after_approval"] = true
	}
	return node
}
