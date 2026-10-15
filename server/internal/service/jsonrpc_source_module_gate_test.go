package service

import (
	"context"
	"io"
	"testing"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

type sourceModuleQualityRepo struct {
	biz.InventoryRepo
	listCalls int
}

func (r *sourceModuleQualityRepo) ListQualityInspections(context.Context, biz.QualityInspectionFilter) ([]*biz.QualityInspection, int, error) {
	r.listCalls++
	return nil, 0, nil
}

func TestSourceModuleGatesRejectBeforeBusinessRepositoryAccess(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	superAdmin := &biz.AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}

	t.Run("reservation requires readable sales orders", func(t *testing.T) {
		repo := &stockReservationModuleGateOperationalFactRepo{}
		d := newOperationalFactJSONRPCTestDataWithRepo(t, superAdmin, repo)
		d.customerConfigUC = sourceModuleGateCustomerConfig(map[string]string{"inventory": "enabled", "sales_orders": "disabled"})
		_, result, err := d.handleOperationalFact(ctx, "create_stock_reservation_from_sales_order", "reservation", stockReservationModuleGateParams(t))
		assertSourceModuleDeniedBeforeCalls(t, result, err, repo.createStockReservationCalls)
	})

	t.Run("finance shipment source requires readable shipments", func(t *testing.T) {
		repo := &financeModuleGateOperationalFactRepo{}
		d := newOperationalFactJSONRPCTestDataWithRepo(t, superAdmin, repo)
		d.customerConfigUC = sourceModuleGateCustomerConfig(map[string]string{"finance": "enabled", "shipments": "disabled"})
		_, result, err := d.handleOperationalFact(ctx, "create_receivable_from_shipment", "finance", financeFactModuleGateParams(t))
		assertSourceModuleDeniedBeforeCalls(t, result, err, repo.createFinanceFactCalls)
	})

	t.Run("production source requires readable production orders", func(t *testing.T) {
		repo := &productionModuleGateOperationalFactRepo{}
		d := newOperationalFactJSONRPCTestDataWithRepo(t, superAdmin, repo)
		d.customerConfigUC = sourceModuleGateCustomerConfig(map[string]string{"production": "enabled", "production_orders": "disabled"})
		_, result, err := d.handleOperationalFact(ctx, "create_production_completion_from_order", "production", productionFactModuleGateParams(t))
		assertSourceModuleDeniedBeforeCalls(t, result, err, repo.createProductionFactCalls)
	})

	qualityMethods := []struct {
		method       string
		sourceModule string
	}{
		{method: "list_finished_goods_quality_inspections", sourceModule: "shipments"},
		{method: "list_outsourcing_return_quality_inspections", sourceModule: "outsourcing_orders"},
		{method: "list_production_stage_quality_inspections", sourceModule: "production_orders"},
	}
	for _, test := range qualityMethods {
		t.Run(test.method+" requires exact readable source module", func(t *testing.T) {
			repo := &sourceModuleQualityRepo{}
			d := &jsonrpcDispatcher{
				log:              log.NewHelper(log.NewStdLogger(io.Discard)),
				adminReader:      stubAdminAccountReader{admin: superAdmin},
				inventoryUC:      biz.NewInventoryUsecase(repo),
				customerConfigUC: sourceModuleGateCustomerConfig(map[string]string{"quality_inspections": "enabled", test.sourceModule: "disabled"}),
			}
			_, result, err := d.handleQuality(ctx, test.method, "quality", mustJSONRPCStruct(t, map[string]any{"limit": float64(20)}))
			assertSourceModuleDeniedBeforeCalls(t, result, err, repo.listCalls)
		})
	}
}

func sourceModuleGateCustomerConfig(overrides map[string]string) *biz.CustomerConfigUsecase {
	states := []biz.DeploymentModuleStateInput{
		{ModuleKey: "customers", State: "enabled"},
		{ModuleKey: "suppliers", State: "enabled"},
		{ModuleKey: "products", State: "enabled"},
		{ModuleKey: "materials", State: "enabled"},
		{ModuleKey: "processes", State: "enabled"},
		{ModuleKey: "material_bom", State: "enabled"},
		{ModuleKey: "sales_orders", State: "enabled"},
		{ModuleKey: "purchase_orders", State: "enabled"},
		{ModuleKey: "purchase_receipts", State: "enabled"},
		{ModuleKey: "quality_inspections", State: "enabled"},
		{ModuleKey: "outsourcing_orders", State: "enabled"},
		{ModuleKey: "production_orders", State: "enabled"},
		{ModuleKey: "inventory", State: "enabled"},
		{ModuleKey: "shipments", State: "enabled"},
		{ModuleKey: "finance", State: "enabled"},
		{ModuleKey: "workflow_tasks", State: "enabled"},
		{ModuleKey: "production", State: "enabled"},
	}
	for index := range states {
		if state := overrides[states[index].ModuleKey]; state != "" {
			states[index].State = state
		}
	}
	repo := newServiceCustomerConfigRepo()
	revision := "source-module-gate"
	key := serviceCustomerConfigKey(biz.DefaultCustomerKey, revision)
	repo.revisions[key] = &biz.CustomerConfigRevision{
		CustomerKey: biz.DefaultCustomerKey,
		Revision:    revision,
		Status:      biz.CustomerConfigStatusActive,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	repo.modules[key] = states
	return biz.NewCustomerConfigUsecase(repo)
}

func assertSourceModuleDeniedBeforeCalls(t *testing.T, result *v1.JsonrpcResult, err error, calls int) {
	t.Helper()
	if err != nil || result == nil || result.GetCode() != errcode.InvalidParam.Code {
		t.Fatalf("source module gate result=%#v err=%v", result, err)
	}
	if calls != 0 {
		t.Fatalf("source module gate reached business repository %d times", calls)
	}
}
