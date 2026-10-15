package biz

import (
	"strings"
	"testing"
)

func TestResolveWorkflowTaskSourceAccessContract(t *testing.T) {
	processID := 12
	nodeID := 13
	revision := "rev-a"
	tests := []struct {
		name           string
		task           *WorkflowTask
		wantApplicable bool
		wantResolved   bool
		wantKind       string
		wantAll        []string
		wantAny        []string
	}{
		{
			name:         "ordinary task source labels are not authoritative",
			task:         &WorkflowTask{SourceType: "sales_order", SourceID: 1},
			wantResolved: true,
		},
		{
			name: "formal sales order uses source action read truth",
			task: &WorkflowTask{
				SourceType:            "sales_order",
				SourceID:              8,
				ConfigRevision:        &revision,
				ProcessInstanceID:     &processID,
				ProcessNodeInstanceID: &nodeID,
			},
			wantApplicable: true,
			wantResolved:   true,
			wantKind:       WorkflowTaskSourceAccessKindFormalRuntime,
			wantAll:        []string{PermissionSalesOrderRead},
		},
		{
			name: "formal inventory operation requires actual record entry capability",
			task: &WorkflowTask{
				SourceType:            "inventory_operation",
				SourceID:              8,
				ConfigRevision:        &revision,
				ProcessInstanceID:     &processID,
				ProcessNodeInstanceID: &nodeID,
			},
			wantApplicable: true,
			wantResolved:   true,
			wantKind:       WorkflowTaskSourceAccessKindInventoryOperation,
			wantAll:        []string{PermissionWarehouseInventoryRead},
			wantAny:        []string{PermissionWarehouseAdjustmentCreate, PermissionWarehouseAdjustmentApprove},
		},
		{
			name: "formal production exception defers to authoritative decision type",
			task: &WorkflowTask{
				SourceType:            "production_exception_decision",
				SourceID:              8,
				ConfigRevision:        &revision,
				ProcessInstanceID:     &processID,
				ProcessNodeInstanceID: &nodeID,
			},
			wantApplicable: true,
			wantResolved:   true,
			wantKind:       WorkflowTaskSourceAccessKindProductionException,
			wantAny: []string{
				PermissionPMCRiskRead,
				PermissionProductionFactRead,
				PermissionProductionExceptionSubmit,
				PermissionProductionExceptionApprove,
			},
		},
		{
			name: "formal runtime with unknown source fails closed",
			task: &WorkflowTask{
				SourceType:            "future_formal_source",
				SourceID:              8,
				ConfigRevision:        &revision,
				ProcessInstanceID:     &processID,
				ProcessNodeInstanceID: &nodeID,
			},
			wantApplicable: true,
		},
		{
			name: "formal runtime with incomplete source fails closed",
			task: &WorkflowTask{
				SourceType:        "sales_order",
				ConfigRevision:    &revision,
				ProcessInstanceID: &processID,
			},
			wantApplicable: true,
		},
		{
			name: "signed production scheduling task requires plan read",
			task: &WorkflowTask{
				TaskGroup:    WorkflowSourceTaskProductionSchedulingGroup,
				TaskCode:     WorkflowSourceTaskCode(WorkflowSourceTaskProductionSchedulingGroup, 8),
				SourceType:   WorkflowSourceTaskProductionOrderSourceType,
				SourceID:     8,
				OwnerRoleKey: PMCRoleKey,
				Payload: map[string]any{
					"source_task_contract":    WorkflowSourceTaskContractV1,
					"source_task_producer":    WorkflowSourceTaskProductionOrderReleaseProducer,
					"source_task_intent_hash": strings.Repeat("a", 64),
					"production_order_id":     8,
				},
			},
			wantApplicable: true,
			wantResolved:   true,
			wantKind:       WorkflowTaskSourceAccessKindProductionOrder,
			wantAny:        []string{PermissionPMCPlanRead, PermissionProductionWIPRead},
		},
		{
			name: "corrupted reserved source task fails closed",
			task: &WorkflowTask{
				TaskGroup:  WorkflowSourceTaskShipmentReleaseGroup,
				TaskCode:   WorkflowSourceTaskCode(WorkflowSourceTaskShipmentReleaseGroup, 8),
				SourceType: WorkflowSourceTaskShipmentSourceType,
				SourceID:   8,
			},
			wantApplicable: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ResolveWorkflowTaskSourceAccessContract(tt.task)
			if got.Applicable != tt.wantApplicable ||
				got.Resolved != tt.wantResolved ||
				got.Kind != tt.wantKind ||
				!sameStringSlice(got.RequiredAll, tt.wantAll) ||
				!sameStringSlice(got.RequiredAny, tt.wantAny) {
				t.Fatalf("contract=%#v, want applicable=%v resolved=%v kind=%q all=%v any=%v", got, tt.wantApplicable, tt.wantResolved, tt.wantKind, tt.wantAll, tt.wantAny)
			}
		})
	}
}

func TestFormalWorkflowTaskSourceAccessRulesStayBoundToSourceActionRegistry(t *testing.T) {
	seenSourceTypes := map[string]struct{}{}
	for _, rule := range formalWorkflowTaskSourceAccessRules {
		if rule.SourceType == "" || rule.SourceReadDomain == "" || rule.SourceReadMethod == "" {
			t.Errorf("incomplete formal workflow source rule: %#v", rule)
			continue
		}
		if _, duplicate := seenSourceTypes[rule.SourceType]; duplicate {
			t.Errorf("duplicate formal workflow source type %q", rule.SourceType)
		}
		seenSourceTypes[rule.SourceType] = struct{}{}
		if _, ok := SourceActionReadPermissionCandidates(rule.SourceReadDomain, rule.SourceReadMethod); !ok {
			t.Errorf("formal workflow source %q has no source-action read contract", rule.SourceType)
		}
	}
}
