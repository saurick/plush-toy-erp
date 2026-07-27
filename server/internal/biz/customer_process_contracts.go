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
	CustomerProcessVariantPurchaseOrderApproval       = "purchase_order_approval"
	CustomerProcessVariantShipmentFinanceApproval     = "shipment_finance_approval"
	CustomerProcessVariantSalesReturnApprovalReceipt  = "approval_receipt"
	CustomerProcessVariantFinancePaymentApprovalPost  = "approval_post"
	CustomerProcessVariantInventoryAdjustmentApproval = "manual_adjustment_approval"
	CustomerProcessVariantProductionExceptionApproval = "exception_decision_approval"
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
		contract, err = applyApprovalSettingsToCustomerProcessContract(snapshot, contract)
		if err != nil {
			return nil, err
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

func applyApprovalSettingsToCustomerProcessContract(snapshot map[string]any, contract customerProcessContract) (customerProcessContract, error) {
	settings := approvalSettingsEnabledMap(snapshot)
	if len(settings) == 0 {
		return contract, nil
	}
	approvalKey := approvalSettingKeyForProcessKey(contract.Selection.ProcessKey)
	catalog, ok := approvalSettingCatalogByKey(approvalKey)
	if !ok || !catalog.Configurable {
		return contract, nil
	}
	enabled, configured := settings[approvalKey]
	if !configured {
		return customerProcessContract{}, fmt.Errorf("%w: approval setting %s is missing", ErrBadParam, approvalKey)
	}
	for index := range contract.Nodes {
		node := &contract.Nodes[index]
		if node.NodeType != ProcessNodeTypeApproval {
			continue
		}
		poolKey := catalog.PoolKey
		node.OwnerPoolKey = &poolKey
		if node.PolicySnapshot == nil {
			node.PolicySnapshot = map[string]any{}
		}
		node.PolicySnapshot["approval_key"] = approvalKey
		node.PolicySnapshot["approval_enabled"] = enabled
		node.PolicySnapshot["member_resolution"] = "lowest_enabled_priority"
	}
	return contract, nil
}

func approvalSettingKeyForProcessKey(processKey string) string {
	switch strings.TrimSpace(processKey) {
	case ProcessKeySalesOrderAcceptance:
		return ApprovalSettingSalesOrder
	case ProcessKeyMaterialSupply:
		return ApprovalSettingPurchaseOrder
	case ProcessKeyFinishedGoodsDelivery:
		return ApprovalSettingShipmentFinance
	default:
		return ""
	}
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
		newSalesReturnAcceptanceContract(),
		newFinancePaymentApprovalContract(),
		newInventoryAdjustmentApprovalContract(),
		newProductionExceptionApprovalContract(),
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
			VariantKey:      CustomerProcessVariantPurchaseOrderApproval,
			BusinessRefType: "purchase_order",
		},
		DomainBoundary: "source_document_approval_only",
		FactBoundary:   "no_fact_posting",
		Guardrail:      "The ProcessRuntime submits and approves only the purchase source document. Receipt, incoming quality and inbound inventory remain separate formal page actions owned by their domain usecases.",
		Nodes: []ProcessNodeInstanceCreate{
			customerDomainCommandNode(
				"submit_purchase_order",
				"",
				PermissionPurchaseOrderUpdate,
				ProcessDomainCommandPurchaseOrderSubmit,
				"PurchaseOrderUsecase.SubmitPurchaseOrderForProcessCommand",
			),
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
			{NodeKey: "end", NodeType: ProcessNodeTypeEnd},
		},
	}
}

func newFinishedGoodsDeliveryContract() customerProcessContract {
	return customerProcessContract{
		Selection: customerProcessSelection{
			ProcessKey:      ProcessKeyFinishedGoodsDelivery,
			ProcessVersion:  "v1",
			VariantKey:      CustomerProcessVariantShipmentFinanceApproval,
			BusinessRefType: "shipment",
		},
		DomainBoundary: "shipment_finance_approval_only",
		FactBoundary:   "no_fact_posting",
		Guardrail:      "The ProcessRuntime owns only finance approval and the versioned finance-release marker. Finished-goods quality, shipment posting and receivable creation stay on their formal domain pages and transaction boundaries.",
		Nodes: []ProcessNodeInstanceCreate{
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
			{NodeKey: "end", NodeType: ProcessNodeTypeEnd},
		},
	}
}

func newSalesReturnAcceptanceContract() customerProcessContract {
	approval := customerHumanProcessNode(
		"sales_return_approval",
		ProcessNodeTypeApproval,
		"boss",
		PermissionSalesReturnApprove,
		"sales_return_approval",
		"sales_return_approval",
	)
	approval.PolicySnapshot = map[string]any{
		"branch_policy_key": ProcessBranchPolicySalesReturnApproval,
	}
	return customerProcessContract{
		Selection: customerProcessSelection{
			ProcessKey:      ProcessKeySalesReturnApproval,
			ProcessVersion:  "v1",
			VariantKey:      CustomerProcessVariantSalesReturnApprovalReceipt,
			BusinessRefType: "sales_return",
		},
		DomainBoundary: "explicit_source_and_fact_commands",
		FactBoundary:   "no_fact_posting",
		Guardrail:      "The approval task changes only the sales-return source document. The warehouse receipt task merely activates the explicit receive command; only that command writes return inventory and submits the linked RMA quality inspection.",
		Nodes: []ProcessNodeInstanceCreate{
			approval,
			customerDomainCommandNode(
				"approve_sales_return",
				"",
				PermissionWorkflowTaskApprove,
				ProcessDomainCommandSalesReturnApprove,
				"OperationalFactUsecase.ApproveSalesReturnForProcessCommand",
			),
			customerHumanProcessNode(
				"sales_return_receipt",
				ProcessNodeTypeHumanTask,
				"warehouse",
				PermissionWorkflowTaskComplete,
				"sales_return_receipt",
				"sales_return_receipt",
			),
			customerDomainCommandNode(
				"receive_sales_return",
				"warehouse",
				PermissionSalesReturnReceive,
				ProcessDomainCommandSalesReturnReceive,
				"OperationalFactUsecase.ReceiveSalesReturnForProcessCommand",
			),
			{NodeKey: "end", NodeType: ProcessNodeTypeEnd},
			customerDomainCommandNode(
				"reject_sales_return",
				"",
				PermissionWorkflowTaskReject,
				ProcessDomainCommandSalesReturnReject,
				"OperationalFactUsecase.RejectSalesReturnForProcessCommand",
			),
			{NodeKey: "rejected_end", NodeType: ProcessNodeTypeEnd},
		},
	}
}

func newFinancePaymentApprovalContract() customerProcessContract {
	approval := customerHumanProcessNode(
		"finance_payment_approval",
		ProcessNodeTypeApproval,
		"boss",
		PermissionFinancePaymentApprove,
		"finance_payment_approval",
		"finance_payment_approval",
	)
	approval.PolicySnapshot = map[string]any{
		"branch_policy_key": ProcessBranchPolicyFinancePaymentApproval,
	}
	return customerProcessContract{
		Selection: customerProcessSelection{
			ProcessKey:      ProcessKeyFinancePaymentApproval,
			ProcessVersion:  "v1",
			VariantKey:      CustomerProcessVariantFinancePaymentApprovalPost,
			BusinessRefType: "finance_payment",
		},
		DomainBoundary: "explicit_source_and_fact_commands",
		FactBoundary:   "no_fact_posting",
		Guardrail:      "The approval task changes only the payment source document. The finance execution task merely activates the explicit post command; allocations and settlement read models are written only by that command.",
		Nodes: []ProcessNodeInstanceCreate{
			approval,
			customerDomainCommandNode(
				"approve_finance_payment",
				"",
				PermissionWorkflowTaskApprove,
				ProcessDomainCommandFinancePaymentApprove,
				"OperationalFactUsecase.ApproveFinancePaymentForProcessCommand",
			),
			customerHumanProcessNode(
				"finance_payment_execution",
				ProcessNodeTypeHumanTask,
				"finance",
				PermissionWorkflowTaskComplete,
				"finance_payment_execution",
				"finance_payment_execution",
			),
			customerDomainCommandNode(
				"post_finance_payment",
				"finance",
				PermissionFinancePaymentPost,
				ProcessDomainCommandFinancePaymentPost,
				"OperationalFactUsecase.PostFinancePaymentForProcessCommand",
			),
			{NodeKey: "end", NodeType: ProcessNodeTypeEnd},
			customerDomainCommandNode(
				"reject_finance_payment",
				"",
				PermissionWorkflowTaskReject,
				ProcessDomainCommandFinancePaymentReject,
				"OperationalFactUsecase.RejectFinancePaymentForProcessCommand",
			),
			{NodeKey: "rejected_end", NodeType: ProcessNodeTypeEnd},
		},
	}
}

func newInventoryAdjustmentApprovalContract() customerProcessContract {
	approval := customerHumanProcessNode(
		"inventory_adjustment_approval",
		ProcessNodeTypeApproval,
		"boss",
		PermissionWarehouseAdjustmentApprove,
		"inventory_adjustment_approval",
		"inventory_adjustment_approval",
	)
	approval.PolicySnapshot = map[string]any{
		"branch_policy_key": ProcessBranchPolicyInventoryAdjustmentApproval,
	}
	return customerProcessContract{
		Selection: customerProcessSelection{
			ProcessKey:      ProcessKeyInventoryAdjustmentApproval,
			ProcessVersion:  "v1",
			VariantKey:      CustomerProcessVariantInventoryAdjustmentApproval,
			BusinessRefType: "inventory_operation",
		},
		DomainBoundary: "explicit_source_and_fact_commands",
		FactBoundary:   "no_fact_posting",
		Guardrail:      "Submission and approval update only the manual-adjustment source document. The warehouse execution task merely activates the explicit post command; only that command writes inventory transactions and balances.",
		Nodes: []ProcessNodeInstanceCreate{
			customerDomainCommandNode(
				"submit_inventory_adjustment",
				"",
				PermissionWarehouseAdjustmentCreate,
				ProcessDomainCommandInventoryAdjustmentSubmit,
				"InventoryUsecase.SubmitInventoryOperationForProcessCommand",
			),
			approval,
			customerDomainCommandNode(
				"approve_inventory_adjustment",
				"",
				PermissionWorkflowTaskApprove,
				ProcessDomainCommandInventoryAdjustmentApprove,
				"InventoryUsecase.ApproveInventoryOperationForProcessCommand",
			),
			customerHumanProcessNode(
				"inventory_adjustment_execution",
				ProcessNodeTypeHumanTask,
				"warehouse",
				PermissionWorkflowTaskComplete,
				"inventory_adjustment_execution",
				"inventory_adjustment_execution",
			),
			customerDomainCommandNode(
				"post_inventory_adjustment",
				"warehouse",
				PermissionWarehouseAdjustmentCreate,
				ProcessDomainCommandInventoryAdjustmentPost,
				"InventoryUsecase.PostInventoryOperationForProcessCommand",
			),
			{NodeKey: "end", NodeType: ProcessNodeTypeEnd},
			customerDomainCommandNode(
				"reject_inventory_adjustment",
				"",
				PermissionWorkflowTaskReject,
				ProcessDomainCommandInventoryAdjustmentReject,
				"InventoryUsecase.RejectInventoryOperationForProcessCommand",
			),
			{NodeKey: "rejected_end", NodeType: ProcessNodeTypeEnd},
		},
	}
}

func newProductionExceptionApprovalContract() customerProcessContract {
	approval := customerHumanProcessNode(
		"production_exception_decision_approval",
		ProcessNodeTypeApproval,
		"boss",
		PermissionProductionExceptionApprove,
		"production_exception_approval",
		"production_exception_approval",
	)
	approval.PolicySnapshot = map[string]any{
		"branch_policy_key": ProcessBranchPolicyProductionExceptionApproval,
	}
	approve := customerDomainCommandNode(
		"approve_production_exception",
		"",
		PermissionWorkflowTaskApprove,
		ProcessDomainCommandProductionExceptionApprove,
		"OperationalFactUsecase.ApproveProductionExceptionForProcessCommand",
	)
	approve.PolicySnapshot["branch_policy_key"] = ProcessBranchPolicyProductionExceptionExecution
	return customerProcessContract{
		Selection: customerProcessSelection{
			ProcessKey:      ProcessKeyProductionExceptionApproval,
			ProcessVersion:  "v1",
			VariantKey:      CustomerProcessVariantProductionExceptionApproval,
			BusinessRefType: "production_exception_decision",
		},
		DomainBoundary: "explicit_source_and_wip_commands",
		FactBoundary:   "no_fact_posting",
		Guardrail:      "Approval records only the production-exception decision and quantity. Scrap and WIP-concession execution remains a separate production task and explicit command; an over-issue approval is an allowance consumed only by the normal material-issue fact path.",
		Nodes: []ProcessNodeInstanceCreate{
			approval,
			approve,
			customerHumanProcessNode(
				"production_exception_execution",
				ProcessNodeTypeHumanTask,
				"production",
				PermissionWorkflowTaskComplete,
				"production_exception_execution",
				"production_exception_execution",
			),
			customerDomainCommandNode(
				"execute_production_exception",
				"production",
				PermissionProductionFactPost,
				ProcessDomainCommandProductionExceptionExecute,
				"OperationalFactUsecase.ExecuteProductionExceptionForProcessCommand",
			),
			{NodeKey: "end", NodeType: ProcessNodeTypeEnd},
			customerDomainCommandNode(
				"reject_production_exception",
				"",
				PermissionWorkflowTaskReject,
				ProcessDomainCommandProductionExceptionReject,
				"OperationalFactUsecase.RejectProductionExceptionForProcessCommand",
			),
			{NodeKey: "rejected_end", NodeType: ProcessNodeTypeEnd},
			{NodeKey: "over_issue_end", NodeType: ProcessNodeTypeEnd},
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
	if commandKey == ProcessDomainCommandSalesOrderActivate ||
		commandKey == ProcessDomainCommandPurchaseOrderApprove ||
		commandKey == ProcessDomainCommandShipmentFinanceRelease ||
		commandKey == ProcessDomainCommandSalesReturnApprove ||
		commandKey == ProcessDomainCommandSalesReturnReject ||
		commandKey == ProcessDomainCommandFinancePaymentApprove ||
		commandKey == ProcessDomainCommandFinancePaymentReject ||
		commandKey == ProcessDomainCommandInventoryAdjustmentApprove ||
		commandKey == ProcessDomainCommandInventoryAdjustmentReject ||
		commandKey == ProcessDomainCommandProductionExceptionApprove ||
		commandKey == ProcessDomainCommandProductionExceptionReject {
		node.PolicySnapshot["execute_after_approval"] = true
	}
	return node
}
