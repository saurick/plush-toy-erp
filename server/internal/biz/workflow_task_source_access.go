package biz

import "strings"

const (
	WorkflowTaskSourceAccessKindFormalRuntime       = "formal_runtime"
	WorkflowTaskSourceAccessKindProductionOrder     = "production_order"
	WorkflowTaskSourceAccessKindProductionFact      = "production_fact"
	WorkflowTaskSourceAccessKindShipment            = "shipment"
	WorkflowTaskSourceAccessKindProductionException = "production_exception_decision"
	WorkflowTaskSourceAccessKindInventoryOperation  = "inventory_operation"
)

// WorkflowTaskSourceAccessContract describes a source linkage that the server
// can prove. Ordinary task payloads and frontend menu aliases are deliberately
// excluded: only complete ProcessRuntime anchors and signed internal source
// producers may make source access a workflow-action prerequisite.
type WorkflowTaskSourceAccessContract struct {
	Applicable  bool
	Resolved    bool
	Kind        string
	SourceType  string
	RequiredAll []string
	RequiredAny []string
}

type formalWorkflowTaskSourceAccessRule struct {
	SourceType            string
	SourceReadDomain      string
	SourceReadMethod      string
	Kind                  string
	StaticSourceReadRules []string
	StaticSourceReadAny   []string
}

var formalWorkflowTaskSourceAccessRules = []formalWorkflowTaskSourceAccessRule{
	{
		SourceType:       "sales_order",
		SourceReadDomain: "customer_config",
		SourceReadMethod: "start_sales_order_acceptance_process",
	},
	{
		SourceType:       "purchase_order",
		SourceReadDomain: "customer_config",
		SourceReadMethod: "start_material_supply_purchase_order_process",
	},
	{
		SourceType:       "shipment",
		SourceReadDomain: "customer_config",
		SourceReadMethod: "start_finished_goods_delivery_process",
	},
	{
		SourceType:       "sales_return",
		SourceReadDomain: "customer_config",
		SourceReadMethod: "get_sales_return_acceptance_process",
	},
	{
		SourceType:       "finance_payment",
		SourceReadDomain: "customer_config",
		SourceReadMethod: "get_finance_payment_approval_process",
	},
	{
		SourceType:            "inventory_operation",
		SourceReadDomain:      "customer_config",
		SourceReadMethod:      "get_inventory_adjustment_approval_process",
		Kind:                  WorkflowTaskSourceAccessKindInventoryOperation,
		StaticSourceReadRules: []string{PermissionWarehouseInventoryRead},
		StaticSourceReadAny:   []string{PermissionWarehouseAdjustmentCreate, PermissionWarehouseAdjustmentApprove},
	},
	{
		SourceType:       "production_exception_decision",
		SourceReadDomain: "customer_config",
		SourceReadMethod: "get_production_exception_approval_process",
		Kind:             WorkflowTaskSourceAccessKindProductionException,
		// This gate proves access to the primary exception-decision record.
		// Reading its upstream QC/WIP/material evidence remains governed by the
		// conditional source-action contract on the process endpoint.
		StaticSourceReadAny: []string{
			PermissionPMCRiskRead,
			PermissionProductionFactRead,
			PermissionProductionExceptionSubmit,
			PermissionProductionExceptionApprove,
		},
	},
}

// ResolveWorkflowTaskSourceAccessContract returns only authoritative source
// linkages. An incomplete/unknown formal runtime or a corrupted reserved
// source-task identity remains applicable but unresolved so callers fail
// closed instead of silently treating it as an ordinary task.
func ResolveWorkflowTaskSourceAccessContract(task *WorkflowTask) WorkflowTaskSourceAccessContract {
	if task == nil {
		return WorkflowTaskSourceAccessContract{Resolved: true}
	}
	sourceType := strings.ToLower(strings.TrimSpace(task.SourceType))
	if workflowTaskHasAnyProcessRuntimeAnchor(task) {
		if !workflowTaskHasCompleteProcessRuntimeAnchor(task) || task.SourceID <= 0 || sourceType == "" {
			return unresolvedWorkflowTaskSourceAccessContract(sourceType)
		}
		for _, rule := range formalWorkflowTaskSourceAccessRules {
			if sourceType != rule.SourceType {
				continue
			}
			required := append([]string(nil), rule.StaticSourceReadRules...)
			requiredAny := append([]string(nil), rule.StaticSourceReadAny...)
			if rule.Kind == WorkflowTaskSourceAccessKindProductionException {
				if len(requiredAny) == 0 {
					candidates, ok := SourceActionReadPermissionCandidates(
						rule.SourceReadDomain,
						rule.SourceReadMethod,
					)
					if !ok || len(candidates) == 0 {
						return unresolvedWorkflowTaskSourceAccessContract(sourceType)
					}
					requiredAny = candidates
				}
			} else if len(required) == 0 {
				resolved, ok := SourceActionReadPermissions(rule.SourceReadDomain, rule.SourceReadMethod)
				if !ok || len(resolved) == 0 {
					return unresolvedWorkflowTaskSourceAccessContract(sourceType)
				}
				required = resolved
			}
			kind := rule.Kind
			if kind == "" {
				kind = WorkflowTaskSourceAccessKindFormalRuntime
			}
			return WorkflowTaskSourceAccessContract{
				Applicable:  true,
				Resolved:    true,
				Kind:        kind,
				SourceType:  sourceType,
				RequiredAll: required,
				RequiredAny: requiredAny,
			}
		}
		return unresolvedWorkflowTaskSourceAccessContract(sourceType)
	}

	switch {
	case trustedProductionSchedulingSourceLink(task):
		return WorkflowTaskSourceAccessContract{
			Applicable:  true,
			Resolved:    true,
			Kind:        WorkflowTaskSourceAccessKindProductionOrder,
			SourceType:  sourceType,
			RequiredAny: []string{PermissionPMCPlanRead, PermissionProductionWIPRead},
		}
	case trustedProductionExceptionSourceLink(task):
		return WorkflowTaskSourceAccessContract{
			Applicable:  true,
			Resolved:    true,
			Kind:        WorkflowTaskSourceAccessKindProductionFact,
			SourceType:  sourceType,
			RequiredAll: []string{PermissionProductionFactRead},
		}
	case trustedShipmentReleaseSourceLink(task):
		return WorkflowTaskSourceAccessContract{
			Applicable:  true,
			Resolved:    true,
			Kind:        WorkflowTaskSourceAccessKindShipment,
			SourceType:  sourceType,
			RequiredAll: []string{PermissionShipmentRead},
		}
	case IsReservedWorkflowSourceTaskNamespace(task.TaskGroup, task.TaskCode):
		return unresolvedWorkflowTaskSourceAccessContract(sourceType)
	default:
		return WorkflowTaskSourceAccessContract{Resolved: true, SourceType: sourceType}
	}
}

func unresolvedWorkflowTaskSourceAccessContract(sourceType string) WorkflowTaskSourceAccessContract {
	return WorkflowTaskSourceAccessContract{
		Applicable: true,
		Resolved:   false,
		SourceType: strings.TrimSpace(sourceType),
	}
}

func workflowTaskHasAnyProcessRuntimeAnchor(task *WorkflowTask) bool {
	if task == nil {
		return false
	}
	return task.ConfigRevision != nil ||
		task.ProcessInstanceID != nil ||
		task.ProcessNodeInstanceID != nil
}

func workflowTaskHasCompleteProcessRuntimeAnchor(task *WorkflowTask) bool {
	return task != nil &&
		task.ConfigRevision != nil &&
		strings.TrimSpace(*task.ConfigRevision) != "" &&
		task.ProcessInstanceID != nil &&
		*task.ProcessInstanceID > 0 &&
		task.ProcessNodeInstanceID != nil &&
		*task.ProcessNodeInstanceID > 0
}

func trustedProductionSchedulingSourceLink(task *WorkflowTask) bool {
	if !IsTrustedProductionSchedulingSourceTask(task) ||
		strings.TrimSpace(task.OwnerRoleKey) != PMCRoleKey ||
		!workflowSourceTaskIntentMarkerValid(task.Payload) {
		return false
	}
	sourceID, found, err := processCommandPositiveIntFromPayload(task.Payload, "production_order_id")
	return err == nil && found && sourceID == task.SourceID
}

func trustedProductionExceptionSourceLink(task *WorkflowTask) bool {
	if !IsTrustedProductionExceptionSourceTask(task) ||
		strings.TrimSpace(task.OwnerRoleKey) != ProductionRoleKey ||
		!workflowSourceTaskIntentMarkerValid(task.Payload) {
		return false
	}
	sourceID, found, err := processCommandPositiveIntFromPayload(task.Payload, "production_fact_id")
	return err == nil && found && sourceID == task.SourceID
}

func trustedShipmentReleaseSourceLink(task *WorkflowTask) bool {
	if !IsTrustedShipmentReleaseSourceTask(task) ||
		strings.TrimSpace(task.OwnerRoleKey) != WarehouseRoleKey ||
		!workflowSourceTaskIntentMarkerValid(task.Payload) {
		return false
	}
	sourceID, found, err := processCommandPositiveIntFromPayload(task.Payload, "shipment_id")
	return err == nil && found && sourceID == task.SourceID
}
