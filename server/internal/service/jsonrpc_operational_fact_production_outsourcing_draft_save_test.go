package service

import (
	"testing"

	"server/internal/biz"
)

func TestProductionFactDraftSaveParamsAreStrictAndTypeSpecific(t *testing.T) {
	material, ok := productionFactDraftSaveFromParams(map[string]any{
		"customer_key": "yoyoosun", "id": float64(11), "expected_version": float64(2),
		"warehouse_id": float64(3), "lot_id": float64(4), "quantity": "2.500000",
		"occurred_at": "2026-08-09T10:30:00Z", "note": "修正仓库",
	}, "save_production_material_issue_draft")
	if !ok || material.ID != 11 || material.ExpectedVersion != 2 || material.LotID == nil || *material.LotID != 4 {
		t.Fatalf("material draft params not parsed: ok=%v value=%#v", ok, material)
	}
	if _, ok := productionFactDraftSaveFromParams(map[string]any{
		"id": float64(11), "expected_version": float64(2), "warehouse_id": float64(3),
		"lot_id": float64(4), "quantity": "2.5", "occurred_at": "2026-08-09T10:30:00Z",
		"source_id": float64(99),
	}, "save_production_material_issue_draft"); ok {
		t.Fatal("client-supplied source identity should be rejected")
	}
	rework, ok := productionFactDraftSaveFromParams(map[string]any{
		"id": float64(12), "expected_version": float64(1), "fact_no": "RW-12",
		"quantity": "1.25", "occurred_at": "2026-08-09T11:00:00Z", "reason": "返修车缝",
	}, "save_production_rework_from_intake_draft")
	if !ok || rework.FactNo != "RW-12" || rework.Note == nil || *rework.Note != "返修车缝" {
		t.Fatalf("rework draft params not parsed: ok=%v value=%#v", ok, rework)
	}
}

func TestOutsourcingFactDraftSaveParamsRequireOccurredAtAndLotContract(t *testing.T) {
	in, ok := outsourcingFactDraftSaveFromParams(map[string]any{
		"id": float64(21), "expected_version": float64(4), "warehouse_id": float64(5),
		"new_lot_no": "OUT-RR-21", "quantity": "3", "occurred_at": "2026-08-09T12:00:00Z",
	}, "save_outsourcing_return_receipt_draft")
	if !ok || in.NewLotNo == nil || *in.NewLotNo != "OUT-RR-21" {
		t.Fatalf("return draft params not parsed: ok=%v value=%#v", ok, in)
	}
	if _, ok := outsourcingFactDraftSaveFromParams(map[string]any{
		"id": float64(21), "expected_version": float64(4), "warehouse_id": float64(5),
		"lot_id": float64(6), "quantity": "3",
	}, "save_outsourcing_material_issue_draft"); ok {
		t.Fatal("occurred_at is required for a content-versioned draft save")
	}
}

func TestDraftSaveMethodsHaveExactSourceReadContracts(t *testing.T) {
	expected := map[string][]string{
		"save_production_material_issue_draft":         {biz.PermissionPMCPlanRead},
		"save_production_completion_draft":             {biz.PermissionPMCPlanRead},
		"save_production_rework_from_completion_draft": {biz.PermissionProductionFactRead, biz.PermissionPMCPlanRead},
		"save_production_rework_from_intake_draft":     {biz.PermissionReworkIntakeRead, biz.PermissionPMCPlanRead},
		"save_outsourcing_material_issue_draft":        {biz.PermissionOutsourcingOrderRead},
		"save_outsourcing_return_receipt_draft":        {biz.PermissionOutsourcingOrderRead},
	}
	for method, permissions := range expected {
		resolved, ok := biz.SourceActionReadPermissions("operational_fact", method)
		if !ok || len(resolved) != len(permissions) {
			t.Fatalf("%s source rule count=%d want=%d", method, len(resolved), len(permissions))
		}
		for index, permission := range permissions {
			if resolved[index] != permission {
				t.Errorf("%s rule[%d]=%s want=%s", method, index, resolved[index], permission)
			}
		}
	}
}
