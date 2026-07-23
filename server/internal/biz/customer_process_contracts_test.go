package biz

import (
	"errors"
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
			wantNodeKeys: []string{"submit_sales_order", "order_approval", "activate_sales_order", "order_review", "end"},
			wantPoolIndex: map[int]string{
				1: BossRoleKey,
				3: "order_review",
			},
		},
		{
			name:         "approval engineering and PMC",
			variant:      CustomerProcessVariantSalesApprovalEngineeringPMC,
			wantNodeKeys: []string{"submit_sales_order", "order_approval", "activate_sales_order", "engineering_data", "order_review", "end"},
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
