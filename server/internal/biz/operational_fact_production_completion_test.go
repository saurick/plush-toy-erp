package biz

import (
	"context"
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestOperationalFactUsecaseCreateProductionCompletionOwnsSourceFields(t *testing.T) {
	skuID := 42
	lotNo := "PF-BIZ-LOT-001"
	repo := &productionCompletionRepoStub{
		source: &ProductionOrderItem{
			ID:                22,
			ProductionOrderID: 21,
			ProductID:         41,
			ProductSKUID:      &skuID,
			UnitID:            43,
		},
	}
	uc := NewOperationalFactUsecase(repo)
	fact, err := uc.CreateProductionCompletionFromOrder(context.Background(), &ProductionCompletionFromOrderCreate{
		FactNo:                " PF-BIZ-001 ",
		ProductionOrderID:     21,
		ProductionOrderItemID: 22,
		WarehouseID:           44,
		NewLotNo:              &lotNo,
		Quantity:              decimal.NewFromInt(3),
		IdempotencyKey:        "pf-biz-001",
	})
	if err != nil {
		t.Fatalf("CreateProductionCompletionFromOrder error = %v", err)
	}
	if fact == nil || repo.created == nil {
		t.Fatalf("completion result=%#v created=%#v", fact, repo.created)
	}
	created := repo.created
	if created.FactNo != "PF-BIZ-001" || created.FactType != ProductionFactFinishedGoodsReceipt || created.SubjectType != InventorySubjectProduct || created.SubjectID != 41 || created.ProductSkuID == nil || *created.ProductSkuID != skuID || created.UnitID != 43 {
		t.Fatalf("source-derived mutation = %#v", created)
	}
	if created.SourceType == nil || *created.SourceType != ProductionOrderSourceType || created.SourceID == nil || *created.SourceID != 21 || created.SourceLineID == nil || *created.SourceLineID != 22 {
		t.Fatalf("source linkage = %#v", created)
	}
	if repo.resolveCalls != 1 {
		t.Fatalf("source resolver calls = %d", repo.resolveCalls)
	}
}

func TestOperationalFactUsecaseCreateProductionCompletionRejectsInvalidSource(t *testing.T) {
	lotNo := "PF-BIZ-BAD-SOURCE-LOT"
	repo := &productionCompletionRepoStub{sourceErr: ErrProductionOrderFactSourceInvalid}
	uc := NewOperationalFactUsecase(repo)
	_, err := uc.CreateProductionCompletionFromOrder(context.Background(), &ProductionCompletionFromOrderCreate{
		FactNo:                "PF-BIZ-BAD-SOURCE",
		ProductionOrderID:     21,
		ProductionOrderItemID: 22,
		WarehouseID:           44,
		NewLotNo:              &lotNo,
		Quantity:              decimal.NewFromInt(1),
		IdempotencyKey:        "pf-biz-bad-source",
	})
	if !errors.Is(err, ErrProductionOrderFactSourceInvalid) || repo.created != nil {
		t.Fatalf("invalid source error=%v created=%#v", err, repo.created)
	}
}

type productionCompletionRepoStub struct {
	source       *ProductionOrderItem
	sourceErr    error
	resolveCalls int
	created      *OperationalFactMutation
}

func (r *productionCompletionRepoStub) ResolveProductionCompletionSource(_ context.Context, productionOrderID, productionOrderItemID int) (*ProductionOrderItem, error) {
	r.resolveCalls++
	if r.sourceErr != nil {
		return nil, r.sourceErr
	}
	return r.source, nil
}

func (r *productionCompletionRepoStub) WarehouseIsActive(context.Context, int) (bool, error) {
	return true, nil
}
func (r *productionCompletionRepoStub) UnitIsActive(context.Context, int) (bool, error) {
	return true, nil
}
func (r *productionCompletionRepoStub) CustomerIsActive(context.Context, int) (bool, error) {
	return true, nil
}
func (r *productionCompletionRepoStub) MaterialIsActive(context.Context, int) (bool, error) {
	return true, nil
}
func (r *productionCompletionRepoStub) ProductIsActive(context.Context, int) (bool, error) {
	return true, nil
}
func (r *productionCompletionRepoStub) ProductSKUIsActive(context.Context, int) (bool, error) {
	return true, nil
}
func (r *productionCompletionRepoStub) SupplierIsActive(context.Context, int) (bool, error) {
	return true, nil
}
func (r *productionCompletionRepoStub) CreateProductionFactDraft(_ context.Context, in *OperationalFactMutation) (*ProductionFact, error) {
	copy := *in
	r.created = &copy
	return &ProductionFact{
		FactNo: in.FactNo, FactType: in.FactType, SubjectType: in.SubjectType, SubjectID: in.SubjectID,
		ProductSkuID: in.ProductSkuID, WarehouseID: in.WarehouseID, UnitID: in.UnitID, Quantity: in.Quantity,
		SourceType: in.SourceType, SourceID: in.SourceID, SourceLineID: in.SourceLineID,
	}, nil
}
func (r *productionCompletionRepoStub) PostProductionFact(context.Context, int) (*ProductionFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) CancelPostedProductionFact(context.Context, int) (*ProductionFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) ListProductionFacts(context.Context, OperationalFactFilter) ([]*ProductionFact, int, error) {
	return nil, 0, nil
}
func (r *productionCompletionRepoStub) CreateOutsourcingFactDraft(context.Context, *OperationalFactMutation) (*OutsourcingFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) PostOutsourcingFact(context.Context, int) (*OutsourcingFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) CancelPostedOutsourcingFact(context.Context, int) (*OutsourcingFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) ListOutsourcingFacts(context.Context, OperationalFactFilter) ([]*OutsourcingFact, int, error) {
	return nil, 0, nil
}
func (r *productionCompletionRepoStub) CreateShipmentDraftWithItems(context.Context, *ShipmentCreateWithItems) (*Shipment, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) ShipShipment(context.Context, int) (*Shipment, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) CancelShippedShipment(context.Context, int) (*Shipment, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) GetShipment(context.Context, int) (*Shipment, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) ListShipments(context.Context, OperationalFactFilter) ([]*Shipment, int, error) {
	return nil, 0, nil
}
func (r *productionCompletionRepoStub) CreateStockReservation(context.Context, *StockReservationCreate) (*StockReservation, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) CreateStockReservationFromSalesOrder(context.Context, *StockReservationFromSalesOrderCreate) (*StockReservation, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) ReleaseStockReservation(context.Context, int) (*StockReservation, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) ListStockReservations(context.Context, OperationalFactFilter) ([]*StockReservation, int, error) {
	return nil, 0, nil
}
func (r *productionCompletionRepoStub) CreateFinanceFactDraft(context.Context, *FinanceFactCreate) (*FinanceFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) PostFinanceFact(context.Context, int) (*FinanceFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) SettleFinanceFact(context.Context, int) (*FinanceFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) CancelPostedFinanceFact(context.Context, int, int, string) (*FinanceFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) ListFinanceFacts(context.Context, OperationalFactFilter) ([]*FinanceFact, int, error) {
	return nil, 0, nil
}
