package biz

import (
	"fmt"
	"strings"
)

func activeModulePageReferences(moduleKey string, snapshot map[string]any, candidatePageKeys []string) []string {
	activePages := allowedRuntimePagesFromSnapshot(snapshot)
	if len(activePages) == 0 || len(candidatePageKeys) == 0 {
		return []string{}
	}
	active := map[string]struct{}{}
	for _, key := range activePages {
		active[key] = struct{}{}
	}
	out := []string{}
	for _, key := range normalizeStringList(candidatePageKeys) {
		if _, ok := active[key]; ok {
			out = append(out, key)
		}
	}
	return normalizeStringList(out)
}

func activeModuleProcessReferences(moduleKey string, snapshot map[string]any) []string {
	moduleKey = normalizeModuleKey(moduleKey)
	if moduleKey == "" || len(snapshot) == 0 {
		return []string{}
	}
	out := []string{}
	for _, key := range []string{"workflows", "businessFlows", "stateMachines", "processPolicies"} {
		for _, item := range anyListFromMap(snapshot, key) {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if processReferencesModule(m, moduleKey) {
				out = append(out, getStringFromAnyMap(m, "key"))
			}
		}
	}
	return normalizeStringList(out)
}

func ensureCustomerConfigProcessModulesEnabledForStart(
	processKey string,
	businessRefType string,
	definition map[string]any,
	snapshot map[string]any,
	modules []DeploymentModuleStateInput,
) error {
	requiredModuleKeys := processDefinitionReferencedModuleKeys(processKey, businessRefType, definition, snapshot)
	if len(requiredModuleKeys) == 0 {
		return ErrBadParam
	}
	return ensureCustomerConfigModuleKeysEnabled(requiredModuleKeys, modules)
}

func ensureCustomerConfigModuleKeysEnabled(moduleKeys []string, modules []DeploymentModuleStateInput) error {
	return ensureCustomerConfigModuleKeysInStates(moduleKeys, modules, []string{"enabled"})
}

func ensureCustomerConfigModuleKeysInStates(moduleKeys []string, modules []DeploymentModuleStateInput, allowedStates []string) error {
	moduleStates := map[string]string{}
	for _, item := range modules {
		key := normalizeModuleKey(item.ModuleKey)
		if key == "" {
			continue
		}
		state := strings.TrimSpace(item.State)
		if state == "" {
			state = "enabled"
		}
		moduleStates[key] = state
	}
	for _, moduleKey := range customerConfigModuleDependencyClosure(moduleKeys) {
		if !stringSliceContains(allowedStates, moduleStates[moduleKey]) {
			return ErrBadParam
		}
	}
	return nil
}

func stringSliceContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func processDomainCommandReferencedModuleKeys(commandKey string) []string {
	switch strings.TrimSpace(commandKey) {
	case ProcessDomainCommandSalesOrderSubmit:
		return []string{"sales_orders", "workflow_tasks"}
	case ProcessDomainCommandPurchaseReceiptCreate:
		return []string{"purchase_orders", "purchase_receipts", "quality_inspections", "inventory"}
	case ProcessDomainCommandIncomingQualityGate:
		return []string{"purchase_receipts", "quality_inspections"}
	case ProcessDomainCommandInventoryPostInbound:
		return []string{"purchase_receipts", "inventory"}
	case ProcessDomainCommandFinishedGoodsQualityDecide:
		return []string{"quality_inspections", "shipments"}
	case ProcessDomainCommandShipmentFinanceRelease:
		return []string{"shipments", "finance"}
	case ProcessDomainCommandShipmentShip:
		return []string{"shipments", "inventory", "workflow_tasks"}
	case ProcessDomainCommandFinanceReceivableLead:
		return []string{"shipments", "finance"}
	default:
		return []string{}
	}
}

func processDefinitionReferencedModuleKeys(processKey string, businessRefType string, definition map[string]any, snapshot map[string]any) []string {
	out := []string{}
	addModulesFromMap := func(m map[string]any) {
		if len(m) == 0 {
			return
		}
		for _, key := range []string{"modules", "sourceModules", "targetModules"} {
			out = append(out, stringSliceFromAnyValue(m[key])...)
		}
		for _, key := range []string{"module_key", "moduleKey"} {
			if value := getStringFromAnyMap(m, key); value != "" {
				out = append(out, value)
			}
		}
	}
	addModulesFromMap(definition)
	sourceWorkflowKey := getStringFromAnyMap(definition, "source_workflow_key")
	if sourceWorkflowKey != "" && len(snapshot) > 0 {
		for _, item := range anyListFromMap(snapshot, "workflows") {
			m, ok := item.(map[string]any)
			if !ok || getStringFromAnyMap(m, "key") != sourceWorkflowKey {
				continue
			}
			addModulesFromMap(m)
		}
	}
	for _, raw := range anyListFromMap(definition, "nodes") {
		nodeDefinition, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		addModulesFromMap(nodeDefinition)
		if policy, err := mapFromAnyValue(nodeDefinition["policy_snapshot"]); err == nil {
			addModulesFromMap(policy)
		}
		if contract, err := mapFromAnyValue(nodeDefinition["fact_command_contract"]); err == nil {
			addModulesFromMap(contract)
		}
	}
	out = append(out, defaultProcessReferencedModuleKeys(processKey, businessRefType)...)
	return normalizeStringList(out)
}

func defaultProcessReferencedModuleKeys(processKey string, businessRefType string) []string {
	switch processKey {
	case ProcessKeySalesOrderAcceptance:
		return []string{"sales_orders", "workflow_tasks"}
	case ProcessKeyMaterialSupply:
		if strings.TrimSpace(businessRefType) != "purchase_order" {
			return []string{}
		}
		return []string{"purchase_orders", "purchase_receipts", "quality_inspections", "inventory"}
	case ProcessKeyFinishedGoodsDelivery:
		return []string{"quality_inspections", "shipments", "finance"}
	default:
		return []string{}
	}
}

func customerConfigRuntimeProcessKeysForModule(moduleKey string) []string {
	moduleKey = normalizeModuleKey(moduleKey)
	if moduleKey == "" {
		return []string{}
	}
	processKeys := []string{
		ProcessKeySalesOrderAcceptance,
		ProcessKeyMaterialSupply,
		ProcessKeyFinishedGoodsDelivery,
	}
	out := []string{}
	for _, processKey := range processKeys {
		businessRefTypes := []string{""}
		if processKey == ProcessKeyMaterialSupply {
			businessRefTypes = []string{"purchase_order"}
		}
		for _, businessRefType := range businessRefTypes {
			for _, referencedModuleKey := range defaultProcessReferencedModuleKeys(processKey, businessRefType) {
				if referencedModuleKey == moduleKey {
					out = append(out, processKey)
					break
				}
			}
		}
	}
	return normalizeStringList(out)
}

func customerConfigProcessDefinition(snapshot map[string]any, processKey string) (map[string]any, error) {
	if len(snapshot) == 0 || strings.TrimSpace(processKey) == "" {
		return nil, ErrBadParam
	}
	rawDefinitions, ok := snapshot["processDefinitions"]
	if !ok {
		return nil, ErrBadParam
	}
	definitions, ok := rawDefinitions.(map[string]any)
	if !ok {
		return nil, ErrBadParam
	}
	rawDefinition, ok := definitions[processKey]
	if !ok {
		return nil, ErrBadParam
	}
	definition, ok := rawDefinition.(map[string]any)
	if !ok || len(definition) == 0 {
		return nil, ErrBadParam
	}
	return definition, nil
}

func processNodesFromCustomerConfigDefinition(processKey string, definition map[string]any) ([]ProcessNodeInstanceCreate, error) {
	rawNodes := anyListFromMap(definition, "nodes")
	if len(rawNodes) == 0 {
		return nil, ErrBadParam
	}
	businessRefType := getStringFromAnyMap(definition, "business_ref_type")
	nodes := make([]ProcessNodeInstanceCreate, 0, len(rawNodes))
	for _, raw := range rawNodes {
		nodeDefinition, ok := raw.(map[string]any)
		if !ok {
			return nil, ErrBadParam
		}
		nodeKey := getStringFromAnyMap(nodeDefinition, "node_key")
		nodeType := getStringFromAnyMap(nodeDefinition, "node_type")
		requiredCapabilityKey := getStringFromAnyMap(nodeDefinition, "required_capability_key")
		if nodeKey == "" || nodeType == "" {
			return nil, ErrBadParam
		}
		if nodeType == ProcessNodeTypeApproval && requiredCapabilityKey != PermissionWorkflowTaskApprove {
			return nil, ErrBadParam
		}
		policySnapshot, err := mapFromAnyValue(nodeDefinition["policy_snapshot"])
		if err != nil {
			return nil, err
		}
		if err := validateCustomerConfigProcessNode(processKey, businessRefType, nodeKey, nodeType, policySnapshot); err != nil {
			return nil, err
		}
		nodes = append(nodes, ProcessNodeInstanceCreate{
			NodeKey:               nodeKey,
			NodeType:              nodeType,
			OwnerPoolKey:          optionalStringPointer(getStringFromAnyMap(nodeDefinition, "owner_pool_key")),
			RequiredCapabilityKey: optionalStringPointer(requiredCapabilityKey),
			FormProfileKey:        optionalStringPointer(getStringFromAnyMap(nodeDefinition, "form_profile_key")),
			ActionSetKey:          optionalStringPointer(getStringFromAnyMap(nodeDefinition, "action_set_key")),
			PolicySnapshot:        policySnapshot,
		})
	}
	if processKey == ProcessKeyMaterialSupply && businessRefType == "purchase_order" {
		if len(nodes) < 3 || nodes[0].NodeKey != "purchase_order_approval" || nodes[1].NodeKey != "approve_purchase_order" || nodes[2].NodeKey != "purchase_receipt_source" {
			return nil, ErrBadParam
		}
	}
	return nodes, nil
}

func validateCustomerConfigProcessNode(processKey, businessRefType, nodeKey, nodeType string, policySnapshot map[string]any) error {
	switch nodeType {
	case ProcessNodeTypeDomainCommand:
		if !customerConfigDomainCommandNodeAllowed(processKey, businessRefType, nodeKey, getStringFromAnyMap(policySnapshot, "command_key")) {
			return ErrBadParam
		}
		if writesFact, err := boolFromProcessDefinition(policySnapshot, "writes_fact"); err != nil || writesFact {
			return ErrBadParam
		}
	case ProcessNodeTypeApproval, ProcessNodeTypeHumanTask:
		if err := ValidateWorkflowSourceTaskReservedNamespace(nodeKey, ""); err != nil {
			return fmt.Errorf("%w: process node %s uses a source-generated workflow task namespace", ErrBadParam, nodeKey)
		}
		return nil
	case ProcessNodeTypeEnd:
		return nil
	default:
		return ErrBadParam
	}
	return nil
}

func customerConfigProcessBusinessRefAllowed(processKey, businessRefType string) bool {
	switch processKey {
	case ProcessKeySalesOrderAcceptance:
		return businessRefType == "sales_order"
	case ProcessKeyMaterialSupply:
		return businessRefType == "purchase_order"
	case ProcessKeyFinishedGoodsDelivery:
		return businessRefType == "shipment"
	default:
		return false
	}
}

func customerConfigDomainCommandNodeAllowed(processKey, businessRefType, nodeKey, commandKey string) bool {
	switch processKey {
	case ProcessKeySalesOrderAcceptance:
		switch nodeKey {
		case "submit_sales_order":
			return commandKey == ProcessDomainCommandSalesOrderSubmit
		case "activate_sales_order":
			return commandKey == ProcessDomainCommandSalesOrderActivate
		default:
			return false
		}
	case ProcessKeyMaterialSupply:
		switch nodeKey {
		case "approve_purchase_order":
			return businessRefType == "purchase_order" && commandKey == ProcessDomainCommandPurchaseOrderApprove
		case "purchase_receipt_source":
			return businessRefType == "purchase_order" && commandKey == ProcessDomainCommandPurchaseReceiptCreate
		case "incoming_qc":
			return businessRefType == "purchase_order" && commandKey == ProcessDomainCommandIncomingQualityGate
		case "warehouse_inbound":
			return businessRefType == "purchase_order" && commandKey == ProcessDomainCommandInventoryPostInbound
		default:
			return false
		}
	case ProcessKeyFinishedGoodsDelivery:
		if businessRefType != "shipment" {
			return false
		}
		switch nodeKey {
		case "finished_goods_quality":
			return commandKey == ProcessDomainCommandFinishedGoodsQualityDecide
		case "shipment_finance_release":
			return commandKey == ProcessDomainCommandShipmentFinanceRelease
		case "shipment_execution":
			return commandKey == ProcessDomainCommandShipmentShip
		case "receivable_lead":
			return commandKey == ProcessDomainCommandFinanceReceivableLead
		default:
			return false
		}
	default:
		return false
	}
}

func processDefinitionNodeExplanations(definition map[string]any) ([]CustomerProcessDefinitionNodeExplanation, []string, []string) {
	rawNodes := anyListFromMap(definition, "nodes")
	nodes := make([]CustomerProcessDefinitionNodeExplanation, 0, len(rawNodes))
	loaderBlockers := []string{}
	executeBlockers := []string{}
	for _, raw := range rawNodes {
		nodeDefinition, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		policySnapshot, _ := mapFromAnyValue(nodeDefinition["policy_snapshot"])
		commandKey := getStringFromAnyMap(policySnapshot, "command_key")
		writesFact := boolValueFromAny(policySnapshot["writes_fact"])
		contract, _ := mapFromAnyValue(nodeDefinition["fact_command_contract"])
		contractLoaderBlockers := stringSliceFromAnyValue(contract["runtime_loader_blockers"])
		contractExecuteBlockers := stringSliceFromAnyValue(contract["runtime_execute_blockers"])
		loaderBlockers = append(loaderBlockers, contractLoaderBlockers...)
		executeBlockers = append(executeBlockers, contractExecuteBlockers...)
		if contractCommandKey := getStringFromAnyMap(contract, "command_key"); contractCommandKey != "" {
			commandKey = contractCommandKey
		}
		if value, ok := contract["writes_fact"]; ok {
			writesFact = boolValueFromAny(value)
		}
		node := CustomerProcessDefinitionNodeExplanation{
			NodeKey:                         getStringFromAnyMap(nodeDefinition, "node_key"),
			NodeType:                        getStringFromAnyMap(nodeDefinition, "node_type"),
			OwnerPoolKey:                    getStringFromAnyMap(nodeDefinition, "owner_pool_key"),
			RequiredCapabilityKey:           getStringFromAnyMap(nodeDefinition, "required_capability_key"),
			CommandKey:                      commandKey,
			RuntimeBindingStatus:            getStringFromAnyMap(contract, "runtime_binding_status"),
			ProcessRuntimeHandlerRegistered: boolValueFromAny(contract["process_runtime_handler_registered"]),
			RuntimeLoaderBlockers:           sortedUniqueStrings(contractLoaderBlockers),
			RuntimeExecuteBlockers:          sortedUniqueStrings(contractExecuteBlockers),
			WritesFact:                      writesFact,
		}
		nodes = append(nodes, node)
	}
	return nodes, loaderBlockers, executeBlockers
}

func processDefinitionStartBlockedReasons(explanation *CustomerProcessDefinitionExplanation) []string {
	if explanation == nil {
		return []string{}
	}
	reasons := []string{}
	if !explanation.RuntimeLoaderEnabled {
		reasons = append(reasons, "runtime_loader_disabled")
	}
	if !customerConfigProcessManifestCanStart(explanation.ManifestStatus) {
		reasons = append(reasons, "manifest_status_not_runtime_loader_ready")
	}
	if !customerConfigRuntimeBuilderRegistered(explanation.ProcessKey) {
		reasons = append(reasons, "runtime_builder_not_registered")
	}
	reasons = append(reasons, explanation.RuntimeLoaderBlockers...)
	return sortedUniqueStrings(reasons)
}

func processDefinitionExecuteBlockedReasons(explanation *CustomerProcessDefinitionExplanation) []string {
	if explanation == nil {
		return []string{}
	}
	reasons := []string{}
	reasons = append(reasons, explanation.RuntimeExecuteBlockers...)
	for _, node := range explanation.Nodes {
		if node.NodeType == ProcessNodeTypeDomainCommand && !node.ProcessRuntimeHandlerRegistered {
			reasons = append(reasons, "domain_command_handler_not_registered")
		}
		if node.WritesFact {
			reasons = append(reasons, "fact_posting_contract_not_allowed")
		}
	}
	return sortedUniqueStrings(reasons)
}

func customerConfigProcessManifestCanStart(status string) bool {
	switch strings.TrimSpace(status) {
	case "runtime_loader_ready", "runtime_loader_start_ready":
		return true
	default:
		return false
	}
}

func customerConfigRuntimeBuilderRegistered(processKey string) bool {
	switch processKey {
	case ProcessKeySalesOrderAcceptance, ProcessKeyMaterialSupply, ProcessKeyFinishedGoodsDelivery:
		return true
	default:
		return false
	}
}
