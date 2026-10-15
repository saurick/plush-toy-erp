package service

import (
	"context"
	"server/internal/biz"
	"server/internal/errcode"
	"testing"
)

type salesEngineeringJSONRPCRepo struct {
	*stubSalesOrderJSONRPCRepo
	mutation *biz.SalesOrderEngineeringMutation
}

func (r *salesEngineeringJSONRPCRepo) SaveSalesOrderEngineering(_ context.Context, in *biz.SalesOrderEngineeringMutation) (*biz.SalesOrderWithItems, error) {
	r.mutation = in
	return &biz.SalesOrderWithItems{Order: &biz.SalesOrder{ID: in.SalesOrderID, Version: in.ExpectedVersion + 1}}, nil
}

func TestSalesOrderEngineeringRequiresOwnPermissionAndRejectsCommercialFields(t *testing.T) {
	for _, tc := range []struct {
		name, permission string
		extra            bool
		allowed          bool
	}{
		{"engineering", biz.PermissionSalesOrderEngineeringUpdate, false, true},
		{"order editor", biz.PermissionSalesOrderUpdate, false, false},
		{"product editor", biz.PermissionProductUpdate, false, false},
		{"engineering cannot edit prices", biz.PermissionSalesOrderEngineeringUpdate, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			admin := workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, tc.permission)
			base := &stubSalesOrderJSONRPCRepo{}
			d := newSalesOrderJSONRPCTestData(t, base, admin)
			repo := &salesEngineeringJSONRPCRepo{stubSalesOrderJSONRPCRepo: base}
			d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
			item := map[string]any{"id": 3, "product_id": nil, "engineering_status": "PREPARING"}
			if tc.extra {
				item["unit_price"] = "0"
			}
			params := mustJSONRPCStruct(t, map[string]any{"id": 1, "expected_version": 2, "items": []any{item}})
			_, result, err := d.handleSalesOrder(workflowJSONRPCAdminContext(), "save_sales_order_engineering", "engineering", params)
			if err != nil {
				t.Fatal(err)
			}
			if (result.Code == errcode.OK.Code) != tc.allowed {
				t.Fatalf("unexpected result: %+v", result)
			}
			if (repo.mutation != nil) != tc.allowed {
				t.Fatal("unauthorized call reached repository")
			}
			if tc.allowed {
				if repo.mutation.ActorID <= 0 {
					t.Fatal("must capture authenticated actor")
				}
				data := result.Data.AsMap()
				if len(data) != 2 || data["version"] != float64(3) || data["sales_order_id"] != float64(1) {
					t.Fatalf("engineering response should contain only reference and version: %v", data)
				}
			}
		})
	}
	admin := workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionSalesOrderEngineeringUpdate)
	ctx := biz.WithCurrentAdmin(workflowJSONRPCAdminContext(), admin)
	d := &jsonrpcDispatcher{}
	if result := d.requireSensitiveFieldMutationPermission(ctx, "sales_order", "save_sales_order_engineering"); result != nil {
		t.Fatal("engineering update incorrectly requires price visibility")
	}
	if result := d.requireSensitiveFieldMutationPermission(ctx, "sales_order", "save_sales_order_with_items"); result == nil {
		t.Fatal("commercial aggregate save lost its permission guard")
	}
}

func TestSalesOrderDemandParametersPreserveMeaningAndRejectInvalidReferences(t *testing.T) {
	base := func() map[string]any {
		return map[string]any{"line_no": 1, "unit_id": 1, "requested_product_name": "客户需求", "customer_product_no": "CUSTOMER-STYLE", "ordered_quantity": "1000", "pre_shipment_sample_quantity": "12", "order_category": "NEW", "process_requirement": "刺绣", "unit_price": "10"}
	}
	in, ok := salesOrderItemMutationFromParams(base())
	if !ok || in.ProductID != 0 || in.PreShipmentSampleQuantity.String() != "12" || *in.RequestedProductName != "客户需求" {
		t.Fatalf("demand parse: %+v %v", in, ok)
	}
	for _, patch := range []map[string]any{{"product_id": "invalid"}, {"product_id": -1}, {"product_sku_id": -1}, {"product_sku_id": 0}, {"pre_shipment_sample_quantity": "abc"}, {"engineering_status": "CONFIRMED"}} {
		params := base()
		for k, v := range patch {
			params[k] = v
		}
		if _, ok := salesOrderItemMutationFromParams(params); ok {
			t.Fatalf("accepted invalid or unauthorized fields: %v", patch)
		}
	}
}
