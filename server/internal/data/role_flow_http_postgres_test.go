package data_test

import (
	"server/internal/biz"
	"server/internal/errcode"
	"testing"
)

func TestSourceDocumentPostgresIntegrationEveryRolePermissionBoundary(t *testing.T) {
	f := newIntegrationHTTP(t)
	tests := []struct{ role, readDomain, readMethod, deniedDomain, deniedMethod string }{
		{biz.BossRoleKey, "workflow", "list_tasks", "operational_fact", "create_finance_payment"},
		{biz.SalesRoleKey, "sales_order", "list_sales_orders", "operational_fact", "create_finance_payment"},
		{biz.PurchaseRoleKey, "purchase_order", "list_purchase_orders", "quality", "pass_quality_inspection"},
		{biz.WarehouseRoleKey, "purchase", "list_purchase_receipts", "quality", "pass_quality_inspection"},
		{biz.QualityRoleKey, "quality", "list_quality_inspections", "operational_fact", "create_finance_payment"},
		{biz.FinanceRoleKey, "operational_fact", "list_finance_payments", "quality", "pass_quality_inspection"},
		{biz.PMCRoleKey, "workflow", "list_tasks", "operational_fact", "create_production_material_issue_from_order"},
		{biz.ProductionRoleKey, "workflow", "list_tasks", "operational_fact", "create_production_material_issue_from_order"},
		{biz.EngineeringRoleKey, "workflow", "list_tasks", "quality", "pass_quality_inspection"},
		{biz.AdminRoleKey, "admin", "rbac_options", "quality", "pass_quality_inspection"},
		{biz.DebugOperatorRoleKey, "auth", "me", "quality", "pass_quality_inspection"},
	}
	if len(tests) != len(biz.BuiltinRoles()) {
		t.Fatal("must cover every builtin role")
	}
	for _, test := range tests {
		t.Run(test.role, func(t *testing.T) {
			actor, _ := f.actor(t, test.role)
			if test.readMethod != "" {
				params := map[string]any{"limit": 1, "offset": 0}
				if test.readMethod == "rbac_options" || test.readMethod == "me" {
					params = map[string]any{}
				}
				requireIntegrationCode(t, actor, test.readDomain, test.readMethod, params, errcode.OK.Code)
			}
			requireIntegrationCode(t, actor, test.deniedDomain, test.deniedMethod, map[string]any{}, errcode.PermissionDenied.Code)
		})
	}
}
