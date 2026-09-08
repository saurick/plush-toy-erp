package service

import (
	"testing"

	"server/internal/biz"
)

func TestMaterialSupplierItemNoTransport(t *testing.T) {
	const ref = "示例织造AB-001#-02#米白"
	in := materialMutationFromParams(map[string]any{"code": "MAT-001", "name": "面料", "supplier_item_no": ref, "default_unit_id": 1})
	if in.SupplierItemNo == nil || *in.SupplierItemNo != ref {
		t.Fatalf("mutation lost supplier item number: %#v", in)
	}
	material := materialToMap(&biz.Material{Code: in.Code, SupplierItemNo: in.SupplierItemNo})
	if material["supplier_item_no"] != ref || material["code"] != "MAT-001" {
		t.Fatalf("serialized material=%#v", material)
	}
	for _, value := range []any{nil, "", "   "} {
		cleared := materialMutationFromParams(map[string]any{"supplier_item_no": value})
		if cleared.SupplierItemNo != nil {
			t.Fatalf("empty field did not clear: %#v", cleared)
		}
	}
	projection := workflowTaskDisplayContextToMap(&biz.WorkflowTaskDisplayContext{Available: true, Items: []biz.WorkflowTaskDisplayItem{{Kind: "material", Code: "MAT-001", SupplierItemNo: ref}}}).(map[string]any)
	if projection["items"].([]any)[0].(map[string]any)["supplier_item_no"] != ref {
		t.Fatalf("task serialization lost supplier item number: %#v", projection)
	}
}
