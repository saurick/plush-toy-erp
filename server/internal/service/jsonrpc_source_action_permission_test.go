package service

import (
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestSourceActionReadPermissionGuardsDenyEveryMissingSourceCapabilityBeforeWrite(t *testing.T) {
	for _, contract := range biz.PublicSourceActionReadPermissionContracts() {
		contract := contract
		conditions := make([]string, 0, len(contract.Rules))
		for _, rule := range contract.Rules {
			if rule.Condition != "" {
				conditions = append(conditions, rule.Condition)
			}
		}
		for _, missingRule := range contract.Rules {
			missingRule := missingRule
			t.Run(contract.Domain+"/"+contract.Method+"/missing/"+missingRule.PermissionKey, func(t *testing.T) {
				permissions := make([]string, 0, len(contract.Rules)-1)
				for _, rule := range contract.Rules {
					if rule.PermissionKey != missingRule.PermissionKey {
						permissions = append(permissions, rule.PermissionKey)
					}
				}
				d := &jsonrpcDispatcher{adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin(nil, permissions...)}}
				ctx := withAdminPermissionCache(workflowJSONRPCAdminContext())
				writeCalls := 0
				if res := d.requireSourceActionReadPermissions(ctx, contract.Domain, contract.Method, conditions...); res == nil || res.Code != errcode.PermissionDenied.Code {
					writeCalls++
					t.Fatalf("missing source permission returned %#v", res)
				}
				if writeCalls != 0 {
					t.Fatalf("write calls=%d, want 0", writeCalls)
				}
			})
		}
	}
}

func TestSourceActionReadPermissionGuardsAllowExactCompleteSet(t *testing.T) {
	for _, contract := range biz.PublicSourceActionReadPermissionContracts() {
		conditions := make([]string, 0, len(contract.Rules))
		permissions := make([]string, 0, len(contract.Rules))
		for _, rule := range contract.Rules {
			permissions = append(permissions, rule.PermissionKey)
			if rule.Condition != "" {
				conditions = append(conditions, rule.Condition)
			}
		}
		d := &jsonrpcDispatcher{adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin(nil, permissions...)}}
		ctx := withAdminPermissionCache(workflowJSONRPCAdminContext())
		if res := d.requireSourceActionReadPermissions(ctx, contract.Domain, contract.Method, conditions...); res != nil {
			t.Errorf("%s.%s complete source permissions rejected: %#v", contract.Domain, contract.Method, res)
		}
	}
}

func TestSourceActionConditionalResolversUseOnlyReferencedDraftSources(t *testing.T) {
	salesID, bomID := 10, 20
	draft := biz.ProductionOrderDraft{Items: []biz.ProductionOrderDraftItem{
		{SalesOrderItemID: &salesID},
		{BOMHeaderID: &bomID},
	}}
	conditions := productionOrderDraftSourceReadConditions(draft)
	if len(conditions) != 2 || conditions[0] != biz.SourceReadConditionProductionSalesOrderItem || conditions[1] != biz.SourceReadConditionProductionBOMHeader {
		t.Fatalf("draft source conditions=%v", conditions)
	}
	if got := productionOrderReferenceSourceReadConditions(biz.ProductionOrderReferenceSalesOrderItem); len(got) != 1 || got[0] != biz.SourceReadConditionProductionSalesOrderItem {
		t.Fatalf("sales reference conditions=%v", got)
	}
	if got := productionOrderReferenceSourceReadConditions(biz.ProductionOrderReferenceActiveBOM); len(got) != 1 || got[0] != biz.SourceReadConditionProductionBOMHeader {
		t.Fatalf("BOM reference conditions=%v", got)
	}
}
