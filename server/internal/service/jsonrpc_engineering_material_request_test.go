package service

import (
	"context"
	"server/internal/biz"
	"server/internal/errcode"
	"strings"
	"testing"
)

type engineeringMaterialJSONRPCRepo struct {
	*stubSalesOrderJSONRPCRepo
	review *biz.EngineeringMaterialReview
	submit *biz.EngineeringMaterialSubmit
}

func (r *engineeringMaterialJSONRPCRepo) GetEngineeringMaterialRequest(context.Context, int, bool) (*biz.EngineeringMaterialRequest, error) {
	return &biz.EngineeringMaterialRequest{SalesOrderID: 1, Status: "PREVIEW"}, nil
}
func (r *engineeringMaterialJSONRPCRepo) SubmitEngineeringMaterialRequest(_ context.Context, in *biz.EngineeringMaterialSubmit) (*biz.EngineeringMaterialRequest, error) {
	r.submit = in
	return &biz.EngineeringMaterialRequest{ID: 1, Status: biz.MaterialRequestSubmitted}, nil
}
func (r *engineeringMaterialJSONRPCRepo) ReviewEngineeringMaterialRequest(_ context.Context, in *biz.EngineeringMaterialReview) (*biz.EngineeringMaterialRequest, error) {
	r.review = in
	return &biz.EngineeringMaterialRequest{ID: 1, Status: biz.MaterialRequestApproved}, nil
}

func TestEngineeringMaterialJSONRPCSeparatesReviewersAndRejectsSourceOverrides(t *testing.T) {
	for _, tc := range []struct {
		name, method, action string
		permissions          []string
		extra                map[string]any
		allowed              bool
	}{
		{name: "engineering submit", method: "submit_engineering_material_request", permissions: []string{biz.PermissionEngineeringMaterialSubmit}, allowed: true},
		{name: "sales cannot submit", method: "submit_engineering_material_request", permissions: []string{biz.PermissionSalesOrderUpdate}},
		{name: "boss reviews", method: "boss_review_engineering_material_request", action: "BOSS_APPROVE", permissions: []string{biz.PermissionEngineeringMaterialBossApprove}, allowed: true},
		{name: "boss cannot take finance action", method: "boss_review_engineering_material_request", action: "FINANCE_APPROVE", permissions: []string{biz.PermissionEngineeringMaterialBossApprove}},
		{name: "finance requires readable sources", method: "finance_review_engineering_material_request", action: "FINANCE_APPROVE", permissions: []string{biz.PermissionEngineeringMaterialFinanceApprove, biz.PermissionFieldProcurementCommercialRead}},
		{name: "finance approves with source read", method: "finance_review_engineering_material_request", action: "FINANCE_APPROVE", permissions: []string{biz.PermissionEngineeringMaterialFinanceApprove, biz.PermissionEngineeringMaterialRead, biz.PermissionSalesOrderRead, biz.PermissionFieldProcurementCommercialRead}, allowed: true},
		{name: "cannot override actor", method: "boss_review_engineering_material_request", action: "BOSS_APPROVE", permissions: []string{biz.PermissionEngineeringMaterialBossApprove}, extra: map[string]any{"actor_id": 999}},
		{name: "cannot override required quantity", method: "submit_engineering_material_request", permissions: []string{biz.PermissionEngineeringMaterialSubmit}, extra: map[string]any{"required_quantity": "1"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			role := biz.EngineeringRoleKey
			if strings.HasPrefix(tc.method, "boss_") {
				role = biz.BossRoleKey
			}
			if strings.HasPrefix(tc.method, "finance_") {
				role = biz.FinanceRoleKey
			}
			admin := workflowJSONRPCAdmin([]string{role}, tc.permissions...)
			base := &stubSalesOrderJSONRPCRepo{}
			d := newSalesOrderJSONRPCTestData(t, base, admin)
			repo := &engineeringMaterialJSONRPCRepo{stubSalesOrderJSONRPCRepo: base}
			d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
			pm := map[string]any{"id": 1, "expected_version": 1, "action": tc.action}
			if tc.method == "submit_engineering_material_request" {
				pm = map[string]any{"sales_order_id": 1, "expected_version": 1, "expected_source_hash": strings.Repeat("a", 64)}
			}
			if tc.action == "FINANCE_APPROVE" {
				pm["items"] = []any{map[string]any{"id": 2, "purchase_quantity": "3.5", "unit_price": "10", "expected_arrival_date": "2026-10-01"}}
			}
			for k, v := range tc.extra {
				pm[k] = v
			}
			_, res, err := d.handleSalesOrder(workflowJSONRPCAdminContext(), tc.method, "test", mustJSONRPCStruct(t, pm))
			if err != nil || (res.Code == errcode.OK.Code) != tc.allowed {
				t.Fatalf("result=%+v error=%v", res, err)
			}
			if !tc.allowed && (repo.submit != nil || repo.review != nil) {
				t.Fatal("invalid request reached repository")
			}
			if tc.allowed && repo.review != nil && repo.review.ActorID <= 0 {
				t.Fatal("missing authenticated reviewer")
			}
		})
	}
}

type productionPrepareJSONRPCRepo struct {
	*productionWIPJSONRPCRepo
	input *biz.ProductionOutsourcingPrepare
}

func (r *productionPrepareJSONRPCRepo) PrepareProductionOutsourcing(_ context.Context, in *biz.ProductionOutsourcingPrepare) (*biz.ProductionOutsourcingPrepared, error) {
	r.input = in
	return &biz.ProductionOutsourcingPrepared{OutsourcingOrderID: 1, OutsourcingOrderNo: "OS-WIP-1-1"}, nil
}
func TestProductionOutsourcingPrepareRequiresManagerAndRejectsQuantityOverride(t *testing.T) {
	for _, tc := range []struct {
		name       string
		permission bool
		extra      bool
		allowed    bool
	}{{"manager", true, false, true}, {"reader", false, false, false}, {"cannot override quantity", true, true, false}} {
		t.Run(tc.name, func(t *testing.T) {
			perms := []string{biz.PermissionProductionWIPRead, biz.PermissionSupplierRead, biz.PermissionOutsourcingOrderRead}
			if tc.permission {
				perms = append(perms, biz.PermissionProductionWIPAssign)
			}
			base := &productionWIPJSONRPCRepo{}
			d := newProductionWIPJSONRPCTestDispatcher(t, base, workflowJSONRPCAdmin([]string{biz.ProductionRoleKey}, perms...))
			activateOperationalFactTestCustomerConfig(t, d, customerConfigPublishParamsWithRevisionAndModuleState(t, customerConfigPublishParams(t), "2026.09.09.prepare-outsourcing", "outsourcing_orders", "enabled"))
			r := &productionPrepareJSONRPCRepo{productionWIPJSONRPCRepo: base}
			d.productionOrderUC = biz.NewProductionOrderUsecase(r)
			pm := map[string]any{"production_wip_batch_id": 1, "expected_version": 1, "supplier_id": 1, "expected_return_date": "2026-10-01", "requirement_ids": []any{2}}
			if tc.extra {
				pm["quantity"] = "999"
			}
			res := d.prepareProductionOutsourcing(workflowJSONRPCAdminContext(), mustJSONRPCStruct(t, pm).AsMap())
			if (res.Code == errcode.OK.Code) != tc.allowed {
				t.Fatalf("result=%+v", res)
			}
			if (r.input != nil) != tc.allowed {
				t.Fatal("invalid prepare reached repository")
			}
		})
	}
}
