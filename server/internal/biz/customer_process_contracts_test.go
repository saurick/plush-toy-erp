package biz

import (
	"errors"
	"slices"
	"testing"
)

func TestNormalizeCustomerProcessContractsExpandsCanonicalSalesVariants(t *testing.T) {
	tests := []struct {
		name          string
		variant       string
		wantNodeKeys  []string
		wantPoolIndex map[int]string
	}{
		{
			name:         "approval and PMC",
			variant:      CustomerProcessVariantSalesApprovalPMC,
			wantNodeKeys: []string{"submit_sales_order", "order_approval", "activate_sales_order", "order_review", "end", "reject_sales_order", "sales_order_rejected_end"},
			wantPoolIndex: map[int]string{
				1: BossRoleKey,
				3: "order_review",
			},
		},
		{
			name:         "approval engineering and PMC",
			variant:      CustomerProcessVariantSalesApprovalEngineeringPMC,
			wantNodeKeys: []string{"submit_sales_order", "order_approval", "activate_sales_order", "engineering_data", "order_review", "end", "reject_sales_order", "sales_order_rejected_end"},
			wantPoolIndex: map[int]string{
				1: BossRoleKey,
				3: "engineering_data",
				4: "order_review",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			snapshot := runtimeSelectionSnapshot(ProcessKeySalesOrderAcceptance, "v1", tt.variant, "sales_order")
			normalized, err := normalizeCustomerProcessContracts(snapshot)
			if err != nil {
				t.Fatalf("normalizeCustomerProcessContracts error = %v", err)
			}
			definition := normalized["processDefinitions"].(map[string]any)[ProcessKeySalesOrderAcceptance].(map[string]any)
			nodes := definition["nodes"].([]any)
			if len(nodes) != len(tt.wantNodeKeys) {
				t.Fatalf("nodes = %#v", nodes)
			}
			for index, wantNodeKey := range tt.wantNodeKeys {
				node := nodes[index].(map[string]any)
				if node["node_key"] != wantNodeKey {
					t.Fatalf("node %d = %#v, want %s", index, node, wantNodeKey)
				}
				if wantPool, ok := tt.wantPoolIndex[index]; ok && node["owner_pool_key"] != wantPool {
					t.Fatalf("node %d owner pool = %#v, want %s", index, node["owner_pool_key"], wantPool)
				}
			}
		})
	}
}

func TestNormalizeCustomerProcessContractsKeepsEveryRegisteredCanonicalGraph(t *testing.T) {
	type expectedNode struct {
		key          string
		nodeType     string
		ownerPool    string
		commandKey   string
		branchPolicy string
	}
	tests := []struct {
		processKey      string
		variantKey      string
		businessRefType string
		nodes           []expectedNode
	}{
		{
			processKey: ProcessKeySalesOrderAcceptance, variantKey: CustomerProcessVariantSalesApprovalPMC,
			businessRefType: "sales_order",
			nodes: []expectedNode{
				{key: "submit_sales_order", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandSalesOrderSubmit},
				{key: "order_approval", nodeType: ProcessNodeTypeApproval, ownerPool: BossRoleKey, branchPolicy: ProcessBranchPolicySalesOrderApproval},
				{key: "activate_sales_order", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandSalesOrderActivate},
				{key: "order_review", nodeType: ProcessNodeTypeHumanTask, ownerPool: "order_review"},
				{key: "end", nodeType: ProcessNodeTypeEnd},
				{key: "reject_sales_order", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandSalesOrderReject},
				{key: "sales_order_rejected_end", nodeType: ProcessNodeTypeEnd},
			},
		},
		{
			processKey: ProcessKeySalesOrderAcceptance, variantKey: CustomerProcessVariantSalesApprovalEngineeringPMC,
			businessRefType: "sales_order",
			nodes: []expectedNode{
				{key: "submit_sales_order", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandSalesOrderSubmit},
				{key: "order_approval", nodeType: ProcessNodeTypeApproval, ownerPool: BossRoleKey, branchPolicy: ProcessBranchPolicySalesOrderApproval},
				{key: "activate_sales_order", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandSalesOrderActivate},
				{key: "engineering_data", nodeType: ProcessNodeTypeHumanTask, ownerPool: "engineering_data"},
				{key: "order_review", nodeType: ProcessNodeTypeHumanTask, ownerPool: "order_review"},
				{key: "end", nodeType: ProcessNodeTypeEnd},
				{key: "reject_sales_order", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandSalesOrderReject},
				{key: "sales_order_rejected_end", nodeType: ProcessNodeTypeEnd},
			},
		},
		{
			processKey: ProcessKeyMaterialSupply, variantKey: CustomerProcessVariantPurchaseOrderApproval,
			businessRefType: "purchase_order",
			nodes: []expectedNode{
				{key: "submit_purchase_order", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandPurchaseOrderSubmit},
				{key: "purchase_order_approval", nodeType: ProcessNodeTypeApproval, ownerPool: BossRoleKey, branchPolicy: ProcessBranchPolicyPurchaseOrderApproval},
				{key: "approve_purchase_order", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandPurchaseOrderApprove},
				{key: "end", nodeType: ProcessNodeTypeEnd},
				{key: "reject_purchase_order", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandPurchaseOrderReject},
				{key: "purchase_order_rejected_end", nodeType: ProcessNodeTypeEnd},
			},
		},
		{
			processKey: ProcessKeyFinishedGoodsDelivery, variantKey: CustomerProcessVariantShipmentFinanceApproval,
			businessRefType: "shipment",
			nodes: []expectedNode{
				{key: "shipment_finance_approval", nodeType: ProcessNodeTypeApproval, ownerPool: FinanceRoleKey, branchPolicy: ProcessBranchPolicyShipmentFinanceApproval},
				{key: "shipment_finance_release", nodeType: ProcessNodeTypeDomainCommand, ownerPool: "shipment_finance_release", commandKey: ProcessDomainCommandShipmentFinanceRelease},
				{key: "end", nodeType: ProcessNodeTypeEnd},
				{key: "shipment_finance_reject", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandShipmentFinanceReject},
				{key: "shipment_finance_rejected_end", nodeType: ProcessNodeTypeEnd},
			},
		},
		{
			processKey: ProcessKeyFinancePaymentApproval, variantKey: CustomerProcessVariantFinancePaymentApprovalPost,
			businessRefType: "finance_payment",
			nodes: []expectedNode{
				{key: "finance_payment_approval", nodeType: ProcessNodeTypeApproval, ownerPool: BossRoleKey, branchPolicy: ProcessBranchPolicyFinancePaymentApproval},
				{key: "approve_finance_payment", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandFinancePaymentApprove},
				{key: "finance_payment_execution", nodeType: ProcessNodeTypeHumanTask, ownerPool: FinanceRoleKey},
				{key: "post_finance_payment", nodeType: ProcessNodeTypeDomainCommand, ownerPool: FinanceRoleKey, commandKey: ProcessDomainCommandFinancePaymentPost},
				{key: "end", nodeType: ProcessNodeTypeEnd},
				{key: "reject_finance_payment", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandFinancePaymentReject},
				{key: "rejected_end", nodeType: ProcessNodeTypeEnd},
			},
		},
		{
			processKey: ProcessKeyInventoryAdjustmentApproval, variantKey: CustomerProcessVariantInventoryAdjustmentApproval,
			businessRefType: "inventory_operation",
			nodes: []expectedNode{
				{key: "submit_inventory_adjustment", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandInventoryAdjustmentSubmit},
				{key: "inventory_adjustment_approval", nodeType: ProcessNodeTypeApproval, ownerPool: BossRoleKey, branchPolicy: ProcessBranchPolicyInventoryAdjustmentApproval},
				{key: "approve_inventory_adjustment", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandInventoryAdjustmentApprove},
				{key: "inventory_adjustment_execution", nodeType: ProcessNodeTypeHumanTask, ownerPool: WarehouseRoleKey},
				{key: "post_inventory_adjustment", nodeType: ProcessNodeTypeDomainCommand, ownerPool: WarehouseRoleKey, commandKey: ProcessDomainCommandInventoryAdjustmentPost},
				{key: "end", nodeType: ProcessNodeTypeEnd},
				{key: "reject_inventory_adjustment", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandInventoryAdjustmentReject},
				{key: "rejected_end", nodeType: ProcessNodeTypeEnd},
			},
		},
		{
			processKey: ProcessKeyProductionExceptionApproval, variantKey: CustomerProcessVariantProductionExceptionApproval,
			businessRefType: "production_exception_decision",
			nodes: []expectedNode{
				{key: "production_exception_decision_approval", nodeType: ProcessNodeTypeApproval, ownerPool: BossRoleKey, branchPolicy: ProcessBranchPolicyProductionExceptionApproval},
				{key: "approve_production_exception", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandProductionExceptionApprove, branchPolicy: ProcessBranchPolicyProductionExceptionExecution},
				{key: "production_exception_execution", nodeType: ProcessNodeTypeHumanTask, ownerPool: ProductionRoleKey},
				{key: "execute_production_exception", nodeType: ProcessNodeTypeDomainCommand, ownerPool: ProductionRoleKey, commandKey: ProcessDomainCommandProductionExceptionExecute},
				{key: "end", nodeType: ProcessNodeTypeEnd},
				{key: "reject_production_exception", nodeType: ProcessNodeTypeDomainCommand, commandKey: ProcessDomainCommandProductionExceptionReject},
				{key: "rejected_end", nodeType: ProcessNodeTypeEnd},
				{key: "over_issue_end", nodeType: ProcessNodeTypeEnd},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.processKey+"/"+tt.variantKey, func(t *testing.T) {
			normalized, err := normalizeCustomerProcessContracts(runtimeSelectionSnapshot(
				tt.processKey, "v1", tt.variantKey, tt.businessRefType,
			))
			if err != nil {
				t.Fatalf("normalizeCustomerProcessContracts error = %v", err)
			}
			definition := normalized["processDefinitions"].(map[string]any)[tt.processKey].(map[string]any)
			rawNodes := definition["nodes"].([]any)
			if len(rawNodes) != len(tt.nodes) {
				t.Fatalf("nodes = %#v, want %#v", rawNodes, tt.nodes)
			}
			for index, want := range tt.nodes {
				node := rawNodes[index].(map[string]any)
				gotOwnerPool, _ := node["owner_pool_key"].(string)
				policy, _ := node["policy_snapshot"].(map[string]any)
				gotCommandKey, _ := policy["command_key"].(string)
				gotBranchPolicy, _ := policy["branch_policy_key"].(string)
				if node["node_key"] != want.key ||
					node["node_type"] != want.nodeType ||
					gotOwnerPool != want.ownerPool ||
					gotCommandKey != want.commandKey ||
					gotBranchPolicy != want.branchPolicy {
					t.Fatalf("node %d = %#v, want %#v", index, node, want)
				}
			}
		})
	}
}

func TestNormalizeCustomerProcessContractsKeepsFactActionsOutsideApprovalRuntime(t *testing.T) {
	tests := []struct {
		processKey      string
		variantKey      string
		businessRefType string
		wantNodeKeys    []string
	}{
		{
			processKey: ProcessKeyMaterialSupply, variantKey: CustomerProcessVariantPurchaseOrderApproval,
			businessRefType: "purchase_order",
			wantNodeKeys:    []string{"submit_purchase_order", "purchase_order_approval", "approve_purchase_order", "end", "reject_purchase_order", "purchase_order_rejected_end"},
		},
		{
			processKey: ProcessKeyFinishedGoodsDelivery, variantKey: CustomerProcessVariantShipmentFinanceApproval,
			businessRefType: "shipment",
			wantNodeKeys:    []string{"shipment_finance_approval", "shipment_finance_release", "end", "shipment_finance_reject", "shipment_finance_rejected_end"},
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.processKey, func(t *testing.T) {
			normalized, err := normalizeCustomerProcessContracts(runtimeSelectionSnapshot(
				testCase.processKey, "v1", testCase.variantKey, testCase.businessRefType,
			))
			if err != nil {
				t.Fatalf("normalizeCustomerProcessContracts error = %v", err)
			}
			definition := normalized["processDefinitions"].(map[string]any)[testCase.processKey].(map[string]any)
			rawNodes := definition["nodes"].([]any)
			got := make([]string, 0, len(rawNodes))
			for _, raw := range rawNodes {
				got = append(got, raw.(map[string]any)["node_key"].(string))
			}
			if !slices.Equal(got, testCase.wantNodeKeys) {
				t.Fatalf("node keys = %#v, want %#v", got, testCase.wantNodeKeys)
			}
		})
	}
}

func TestCurrentCustomerConfigProcessStartShapeRejectsApprovalGraphsWithoutRejectedEnd(t *testing.T) {
	nodesFromKeys := func(keys ...string) []ProcessNodeInstanceCreate {
		nodes := make([]ProcessNodeInstanceCreate, 0, len(keys))
		for _, key := range keys {
			nodes = append(nodes, ProcessNodeInstanceCreate{NodeKey: key})
		}
		return nodes
	}
	tests := []struct {
		name       string
		processKey string
		nodes      []ProcessNodeInstanceCreate
		want       bool
	}{
		{
			name:       "sales current graph",
			processKey: ProcessKeySalesOrderAcceptance,
			nodes:      nodesFromKeys("submit_sales_order", "order_approval", "activate_sales_order", "order_review", "end", "reject_sales_order", "sales_order_rejected_end"),
			want:       true,
		},
		{
			name:       "sales legacy graph",
			processKey: ProcessKeySalesOrderAcceptance,
			nodes:      nodesFromKeys("submit_sales_order", "order_approval", "activate_sales_order", "order_review", "end"),
			want:       false,
		},
		{
			name:       "purchase legacy graph",
			processKey: ProcessKeyMaterialSupply,
			nodes:      nodesFromKeys("submit_purchase_order", "purchase_order_approval", "approve_purchase_order", "end"),
			want:       false,
		},
		{
			name:       "shipment legacy graph",
			processKey: ProcessKeyFinishedGoodsDelivery,
			nodes:      nodesFromKeys("shipment_finance_approval", "shipment_finance_release", "end"),
			want:       false,
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			if got := currentCustomerConfigProcessStartShape(testCase.processKey, testCase.nodes); got != testCase.want {
				t.Fatalf("currentCustomerConfigProcessStartShape() = %v, want %v", got, testCase.want)
			}
		})
	}
}

func TestNormalizeCustomerProcessContractsRejectsUnregisteredSelection(t *testing.T) {
	tests := []struct {
		name            string
		processKey      string
		processVersion  string
		variantKey      string
		businessRefType string
	}{
		{name: "unknown process", processKey: "customer_process", processVersion: "v1", variantKey: "default", businessRefType: "sales_order"},
		{name: "unknown version", processKey: ProcessKeySalesOrderAcceptance, processVersion: "v2", variantKey: CustomerProcessVariantSalesApprovalPMC, businessRefType: "sales_order"},
		{name: "unknown variant", processKey: ProcessKeySalesOrderAcceptance, processVersion: "v1", variantKey: "skip_approval", businessRefType: "sales_order"},
		{name: "wrong business ref", processKey: ProcessKeySalesOrderAcceptance, processVersion: "v1", variantKey: CustomerProcessVariantSalesApprovalPMC, businessRefType: "shipment"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := normalizeCustomerProcessContracts(runtimeSelectionSnapshot(tt.processKey, tt.processVersion, tt.variantKey, tt.businessRefType))
			if !errors.Is(err, ErrBadParam) {
				t.Fatalf("error = %v, want ErrBadParam", err)
			}
		})
	}
}

func TestNormalizeCustomerProcessContractsRejectsClientOwnedGraph(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(map[string]any, []any)
	}{
		{
			name: "only end",
			mutate: func(definition map[string]any, nodes []any) {
				definition["nodes"] = []any{nodes[len(nodes)-1]}
			},
		},
		{
			name: "remove approval",
			mutate: func(definition map[string]any, nodes []any) {
				definition["nodes"] = append([]any{nodes[0]}, nodes[2:]...)
			},
		},
		{
			name: "reorder",
			mutate: func(_ map[string]any, nodes []any) {
				nodes[1], nodes[2] = nodes[2], nodes[1]
			},
		},
		{
			name: "wrong pool",
			mutate: func(_ map[string]any, nodes []any) {
				nodes[1].(map[string]any)["owner_pool_key"] = "sales"
			},
		},
		{
			name: "wrong capability",
			mutate: func(_ map[string]any, nodes []any) {
				nodes[1].(map[string]any)["required_capability_key"] = PermissionWorkflowTaskComplete
			},
		},
		{
			name: "wrong command",
			mutate: func(_ map[string]any, nodes []any) {
				nodes[0].(map[string]any)["policy_snapshot"].(map[string]any)["command_key"] = ProcessDomainCommandShipmentShip
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fresh, freshErr := normalizeCustomerProcessContracts(runtimeSelectionSnapshot(
				ProcessKeySalesOrderAcceptance,
				"v1",
				CustomerProcessVariantSalesApprovalEngineeringPMC,
				"sales_order",
			))
			if freshErr != nil {
				t.Fatalf("normalize canonical error = %v", freshErr)
			}
			freshDefinition := fresh["processDefinitions"].(map[string]any)[ProcessKeySalesOrderAcceptance].(map[string]any)
			nodes := freshDefinition["nodes"].([]any)
			tt.mutate(freshDefinition, nodes)
			input := runtimeSelectionSnapshot(
				ProcessKeySalesOrderAcceptance,
				"v1",
				CustomerProcessVariantSalesApprovalEngineeringPMC,
				"sales_order",
			)
			input["processDefinitions"] = map[string]any{ProcessKeySalesOrderAcceptance: freshDefinition}
			if _, gotErr := normalizeCustomerProcessContracts(input); !errors.Is(gotErr, ErrBadParam) {
				t.Fatalf("error = %v, want ErrBadParam", gotErr)
			}
		})
	}
}

func TestNormalizeCustomerProcessContractsRejectsCanonicalLookingInputGraph(t *testing.T) {
	selectionOnly := runtimeSelectionSnapshot(
		ProcessKeySalesOrderAcceptance,
		"v1",
		CustomerProcessVariantSalesApprovalPMC,
		"sales_order",
	)
	canonical, err := normalizeCustomerProcessContracts(selectionOnly)
	if err != nil {
		t.Fatalf("normalize selection-only input error = %v", err)
	}
	withGraph := runtimeSelectionSnapshot(
		ProcessKeySalesOrderAcceptance,
		"v1",
		CustomerProcessVariantSalesApprovalPMC,
		"sales_order",
	)
	withGraph["processDefinitions"] = canonical["processDefinitions"]
	if _, err := normalizeCustomerProcessContracts(withGraph); !errors.Is(err, ErrBadParam) {
		t.Fatalf("canonical-looking input graph error = %v, want ErrBadParam", err)
	}
}

func TestNormalizeCustomerProcessContractsRejectsPreviewDerivedDefinitionsAndVersions(t *testing.T) {
	previewOnly := map[string]any{
		"processDefinitions": map[string]any{
			ProcessKeySalesOrderAcceptance: map[string]any{
				"nodes": []any{map[string]any{"node_key": "end", "node_type": ProcessNodeTypeEnd}},
			},
		},
	}
	if _, err := normalizeCustomerProcessContracts(previewOnly); !errors.Is(err, ErrBadParam) {
		t.Fatalf("preview-derived definition error = %v, want ErrBadParam", err)
	}

	wrongVersion := runtimeSelectionSnapshot(
		ProcessKeySalesOrderAcceptance,
		"v1",
		CustomerProcessVariantSalesApprovalPMC,
		"sales_order",
	)
	wrongVersion["manifest_schema_version"] = "customer-config-manifest/v2"
	if _, err := normalizeCustomerProcessContracts(wrongVersion); !errors.Is(err, ErrBadParam) {
		t.Fatalf("wrong version error = %v, want ErrBadParam", err)
	}

	previewSelection := runtimeSelectionSnapshot(
		ProcessKeySalesOrderAcceptance,
		"v1",
		CustomerProcessVariantSalesApprovalPMC,
		"sales_order",
	)
	previewSelection["manifest_status"] = "preview_only"
	previewSelection["runtime_enabled"] = false
	previewSelection["publishable"] = false
	if _, err := normalizeCustomerProcessContracts(previewSelection); !errors.Is(err, ErrBadParam) {
		t.Fatalf("preview selection error = %v, want ErrBadParam", err)
	}
}

func runtimeSelectionSnapshot(processKey, processVersion, variantKey, businessRefType string) map[string]any {
	return map[string]any{
		"manifest_schema_version":  CustomerConfigManifestSchemaVersionCurrent,
		"process_contract_version": CustomerProcessContractVersionCurrent,
		"manifest_status":          "runtime_compile_ready",
		"runtime_enabled":          true,
		"publishable":              true,
		"runtimeProcessSelections": []any{
			map[string]any{
				"process_key":       processKey,
				"process_version":   processVersion,
				"variant_key":       variantKey,
				"business_ref_type": businessRefType,
			},
		},
	}
}
