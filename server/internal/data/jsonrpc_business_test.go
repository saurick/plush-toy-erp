package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestJsonrpcData_BusinessDashboardStatsReadsDomainProjection(t *testing.T) {
	j := &JsonrpcData{
		log:               log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.business.test")),
		adminReader:       stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionERPDashboardRead)},
		masterDataUC:      biz.NewMasterDataUsecase(&stubMasterDataJSONRPCRepo{}),
		salesOrderUC:      biz.NewSalesOrderUsecase(&stubSalesOrderJSONRPCRepo{}),
		operationalFactUC: biz.NewOperationalFactUsecase(&stubBusinessDashboardOperationalFactRepo{}),
	}

	_, res, err := j.handleBusiness(workflowJSONRPCAdminContext(), "dashboard_stats", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", res)
	}

	modules, ok := res.Data.AsMap()["modules"].([]any)
	if !ok {
		t.Fatalf("expected modules array, got %#v", res.Data.AsMap()["modules"])
	}
	totalByModule := map[string]float64{}
	for _, item := range modules {
		module, ok := item.(map[string]any)
		if !ok {
			t.Fatalf("expected module map, got %#v", item)
		}
		totalByModule[testStringValue(module["module_key"])] = testNumberValue(module["total"])
	}

	for moduleKey, expectedTotal := range map[string]float64{
		"customers":            1,
		"suppliers":            1,
		"sales-orders":         1,
		"processing-contracts": 2,
		"inventory":            5,
		"outbound":             3,
		"production-progress":  4,
		"reconciliation":       6,
		"accessories-purchase": 0,
		"shipping-release":     0,
		"quality-inspections":  0,
		"receivables":          0,
		"invoices":             0,
	} {
		if totalByModule[moduleKey] != expectedTotal {
			t.Fatalf("expected %s total %.0f, got %.0f", moduleKey, expectedTotal, totalByModule[moduleKey])
		}
	}
}

func testStringValue(value any) string {
	text, _ := value.(string)
	return text
}

func testNumberValue(value any) float64 {
	switch item := value.(type) {
	case float64:
		return item
	case int:
		return float64(item)
	default:
		return 0
	}
}

func TestJsonrpcData_BusinessRecordMethodsAreRetired(t *testing.T) {
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.business.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey})},
	}

	_, res, err := j.handleBusiness(workflowJSONRPCAdminContext(), "list_records", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.UnknownMethod.Code {
		t.Fatalf("expected retired method to be unknown, got %#v", res)
	}
}

type stubBusinessDashboardOperationalFactRepo struct{}

func (s *stubBusinessDashboardOperationalFactRepo) CreateProductionFactDraft(context.Context, *biz.OperationalFactMutation) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) PostProductionFact(context.Context, int) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelPostedProductionFact(context.Context, int) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListProductionFacts(context.Context, biz.OperationalFactFilter) ([]*biz.ProductionFact, int, error) {
	return nil, 4, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateOutsourcingFactDraft(context.Context, *biz.OperationalFactMutation) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) PostOutsourcingFact(context.Context, int) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelPostedOutsourcingFact(context.Context, int) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListOutsourcingFacts(context.Context, biz.OperationalFactFilter) ([]*biz.OutsourcingFact, int, error) {
	return nil, 2, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateShipmentDraft(context.Context, *biz.ShipmentCreate) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) AddShipmentItem(context.Context, *biz.ShipmentItemCreate) (*biz.ShipmentItem, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ShipShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelShippedShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) GetShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListShipments(context.Context, biz.OperationalFactFilter) ([]*biz.Shipment, int, error) {
	return nil, 3, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateStockReservation(context.Context, *biz.StockReservationCreate) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ReleaseStockReservation(context.Context, int) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ConsumeStockReservation(context.Context, int) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListStockReservations(context.Context, biz.OperationalFactFilter) ([]*biz.StockReservation, int, error) {
	return nil, 5, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateFinanceFactDraft(context.Context, *biz.FinanceFactCreate) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) PostFinanceFact(context.Context, int) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) SettleFinanceFact(context.Context, int) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelPostedFinanceFact(context.Context, int) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListFinanceFacts(context.Context, biz.OperationalFactFilter) ([]*biz.FinanceFact, int, error) {
	return nil, 6, nil
}
