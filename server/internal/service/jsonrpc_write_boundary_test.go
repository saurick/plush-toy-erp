package service

import (
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestMasterDataActivationRejectsCoercedIdentifiersAndFlags(t *testing.T) {
	repo := &stubMasterDataJSONRPCRepo{}
	admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductDisable)
	admin.IsSuperAdmin = true
	dispatcher := newMasterDataJSONRPCTestData(t, repo, admin)
	ctx := workflowJSONRPCAdminContext()
	for _, method := range []string{
		"set_customer_active", "set_supplier_active", "set_material_active",
		"set_process_active", "set_product_active", "set_product_sku_active",
	} {
		t.Run(method, func(t *testing.T) {
			for _, values := range []map[string]any{
				{"id": 9.8, "active": false},
				{"id": "9", "active": false},
				{"id": 9, "active": "false"},
			} {
				_, result, err := dispatcher.Handle(ctx, "masterdata", "2.0", method, "activation", mustJSONRPCStruct(t, values))
				if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
					t.Fatalf("malformed activation must be rejected: result=%#v err=%v", result, err)
				}
			}
		})
	}
	if repo.customerActiveCalls+repo.supplierActiveCalls+repo.materialActiveCalls+repo.processActiveCalls+repo.productActiveCalls+repo.skuActiveCalls != 0 {
		t.Fatal("malformed activation reached the repository")
	}
	for _, values := range []map[string]any{{"id": 9, "active": false}, {"id": 9}} {
		_, result, err := dispatcher.Handle(ctx, "masterdata", "2.0", "set_product_active", "activation", mustJSONRPCStruct(t, values))
		if err != nil || result == nil || result.Code != errcode.OK.Code {
			t.Fatalf("valid activation: result=%#v err=%v", result, err)
		}
		product := jsonRPCNestedMap(t, result, "product")
		if product["id"] != float64(9) || product["is_active"] != (values["active"] == nil) {
			t.Fatalf("explicit false and omitted defaults must remain distinct: %v", product)
		}
	}
}

func TestSourceWriteParsersRejectFractionalReferences(t *testing.T) {
	if _, ok := financeFactFromPurchaseReceiptCreateFromParams(map[string]any{"purchase_receipt_id": 9.8}); ok {
		t.Fatal("a fractional purchase receipt ID must not select an accounting source")
	}
	if _, ok := financeFactFromOutsourcingReturnCreateFromParams(map[string]any{"outsourcing_fact_id": "9"}); ok {
		t.Fatal("a string outsourcing fact ID must not select an accounting source")
	}
	if _, ok := qualityInspectionFromPurchaseReceiptCreateFromParams(map[string]any{"purchase_receipt_id": 9, "purchase_receipt_item_id": 2.1}); ok {
		t.Fatal("a fractional line ID must not select an inspection source")
	}
}

func TestOKDataRejectsUnserializablePayload(t *testing.T) {
	result := okData(map[string]any{"facts": []string{"invalid structpb array"}})
	if result.Code != errcode.Internal.Code || result.Data != nil {
		t.Fatalf("invalid result payload must not report success: %#v", result)
	}
	result = okData(map[string]any{"facts": []any{}})
	if result.Code != errcode.OK.Code || result.Data == nil {
		t.Fatalf("a valid empty array is a successful read: %#v", result)
	}
}
