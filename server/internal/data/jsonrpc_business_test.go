package data

import (
	"context"
	"io"
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestJsonrpcData_BusinessDashboardStatsReadsDomainProjection(t *testing.T) {
	j := &JsonrpcData{
		log:          log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.business.test")),
		adminReader:  stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionERPDashboardRead)},
		masterDataUC: biz.NewMasterDataUsecase(&stubMasterDataJSONRPCRepo{}),
		salesOrderUC: biz.NewSalesOrderUsecase(&stubSalesOrderJSONRPCRepo{}),
		phase8UC:     biz.NewPhase8Usecase(&stubBusinessDashboardPhase8Repo{}),
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

func TestJsonrpcData_BusinessRecordWriteRejectedAsArchiveReadOnly(t *testing.T) {
	repo := &businessJSONRPCRepoSpy{}
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.business.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionBusinessRecordCreate)},
		businessUC:  biz.NewBusinessRecordUsecase(repo),
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"module_key":          "accessories-purchase",
		"title":               "旧业务记录写入",
		"business_status_key": "project_pending",
		"owner_role_key":      "purchase",
		"payload":             map[string]any{},
		"items":               []any{},
	})

	_, res, err := j.handleBusiness(workflowJSONRPCAdminContext(), "create_record", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param archive guard, got %#v", res)
	}
	if !strings.Contains(res.Message, "只读") {
		t.Fatalf("expected read-only message, got %q", res.Message)
	}
	if repo.createCalled {
		t.Fatalf("archive write should not call repo create")
	}
}

type stubBusinessDashboardPhase8Repo struct{}

func (s *stubBusinessDashboardPhase8Repo) CreateProductionFactDraft(context.Context, *biz.Phase8FactMutation) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) PostProductionFact(context.Context, int) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) CancelPostedProductionFact(context.Context, int) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) ListProductionFacts(context.Context, biz.Phase8Filter) ([]*biz.ProductionFact, int, error) {
	return nil, 4, nil
}

func (s *stubBusinessDashboardPhase8Repo) CreateOutsourcingFactDraft(context.Context, *biz.Phase8FactMutation) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) PostOutsourcingFact(context.Context, int) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) CancelPostedOutsourcingFact(context.Context, int) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) ListOutsourcingFacts(context.Context, biz.Phase8Filter) ([]*biz.OutsourcingFact, int, error) {
	return nil, 2, nil
}

func (s *stubBusinessDashboardPhase8Repo) CreateShipmentDraft(context.Context, *biz.ShipmentCreate) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) AddShipmentItem(context.Context, *biz.ShipmentItemCreate) (*biz.ShipmentItem, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) ShipShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) CancelShippedShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) GetShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) ListShipments(context.Context, biz.Phase8Filter) ([]*biz.Shipment, int, error) {
	return nil, 3, nil
}

func (s *stubBusinessDashboardPhase8Repo) CreateStockReservation(context.Context, *biz.StockReservationCreate) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) ReleaseStockReservation(context.Context, int) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) ConsumeStockReservation(context.Context, int) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) ListStockReservations(context.Context, biz.Phase8Filter) ([]*biz.StockReservation, int, error) {
	return nil, 5, nil
}

func (s *stubBusinessDashboardPhase8Repo) CreateFinanceFactDraft(context.Context, *biz.FinanceFactCreate) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) PostFinanceFact(context.Context, int) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) SettleFinanceFact(context.Context, int) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) CancelPostedFinanceFact(context.Context, int) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardPhase8Repo) ListFinanceFacts(context.Context, biz.Phase8Filter) ([]*biz.FinanceFact, int, error) {
	return nil, 6, nil
}

type businessJSONRPCRepoSpy struct {
	createCalled bool
}

func (r *businessJSONRPCRepoSpy) ListBusinessRecords(context.Context, biz.BusinessRecordFilter) ([]*biz.BusinessRecord, int, error) {
	return nil, 0, nil
}

func (r *businessJSONRPCRepoSpy) CreateBusinessRecord(context.Context, *biz.BusinessRecordMutation, int) (*biz.BusinessRecord, error) {
	r.createCalled = true
	return &biz.BusinessRecord{}, nil
}

func (r *businessJSONRPCRepoSpy) UpdateBusinessRecord(context.Context, int, *biz.BusinessRecordMutation, int) (*biz.BusinessRecord, error) {
	return &biz.BusinessRecord{}, nil
}

func (r *businessJSONRPCRepoSpy) DeleteBusinessRecords(context.Context, []int, string, int) (int, error) {
	return 0, nil
}

func (r *businessJSONRPCRepoSpy) RestoreBusinessRecord(context.Context, int, int) (*biz.BusinessRecord, error) {
	return &biz.BusinessRecord{}, nil
}
