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
		ProductionWIPBatchID:  23,
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
	if created.ProductionWIPBatchID == nil || *created.ProductionWIPBatchID != 23 {
		t.Fatalf("WIP batch linkage = %#v", created)
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

func TestOperationalFactUsecaseProductionTransitionPolicyUsesRepositoryTruth(t *testing.T) {
	repo := &productionCompletionRepoStub{transitionPolicy: &ProductionFactTransitionPolicy{
		FactType:           ProductionFactFinishedGoodsReceipt,
		Status:             OperationalFactStatusPosted,
		WasPosted:          true,
		RequiresSourceTask: false,
	}}
	policy, err := NewOperationalFactUsecase(repo).GetProductionFactTransitionPolicy(context.Background(), 41)
	if err != nil {
		t.Fatalf("GetProductionFactTransitionPolicy error = %v", err)
	}
	if policy == nil || policy.FactType != ProductionFactFinishedGoodsReceipt || policy.Status != OperationalFactStatusPosted || !policy.WasPosted || policy.RequiresSourceTask {
		t.Fatalf("transition policy = %#v", policy)
	}
	policy.Status = OperationalFactStatusCancelled
	if repo.transitionPolicy.Status != OperationalFactStatusPosted || repo.transitionPolicyID != 41 {
		t.Fatalf("repository transition policy was not treated as immutable: policy=%#v id=%d", repo.transitionPolicy, repo.transitionPolicyID)
	}
}

func TestOperationalFactUsecaseProductionTransitionPolicyFailsClosed(t *testing.T) {
	tests := []struct {
		name   string
		policy *ProductionFactTransitionPolicy
	}{
		{name: "missing policy"},
		{name: "unknown fact type", policy: &ProductionFactTransitionPolicy{FactType: "UNKNOWN", Status: OperationalFactStatusDraft}},
		{name: "unknown status", policy: &ProductionFactTransitionPolicy{FactType: ProductionFactFinishedGoodsReceipt, Status: "UNKNOWN"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			repo := &productionCompletionRepoStub{transitionPolicy: test.policy}
			if _, err := NewOperationalFactUsecase(repo).GetProductionFactTransitionPolicy(context.Background(), 41); !errors.Is(err, ErrBadParam) {
				t.Fatalf("GetProductionFactTransitionPolicy error = %v", err)
			}
		})
	}
}

type productionCompletionRepoStub struct {
	source             *ProductionOrderItem
	sourceErr          error
	resolveCalls       int
	created            *OperationalFactMutation
	transitionPolicy   *ProductionFactTransitionPolicy
	transitionPolicyID int
}

func (r *productionCompletionRepoStub) GetProductionFactTransitionPolicy(_ context.Context, id int) (*ProductionFactTransitionPolicy, error) {
	r.transitionPolicyID = id
	return r.transitionPolicy, nil
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
		ProductionWIPBatchID: in.ProductionWIPBatchID,
	}, nil
}
func (r *productionCompletionRepoStub) PostProductionFact(context.Context, *OperationalFactStatusMutation) (*ProductionFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) CancelPostedProductionFact(context.Context, *OperationalFactStatusMutation) (*ProductionFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) ListProductionFacts(context.Context, OperationalFactFilter) ([]*ProductionFact, int, error) {
	return nil, 0, nil
}
func (r *productionCompletionRepoStub) CreateOutsourcingFactDraft(context.Context, *OperationalFactMutation) (*OutsourcingFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) PostOutsourcingFact(context.Context, *OperationalFactStatusMutation) (*OutsourcingFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) CancelPostedOutsourcingFact(context.Context, *OperationalFactStatusMutation) (*OutsourcingFact, error) {
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
func (r *productionCompletionRepoStub) PostFinanceFact(context.Context, *OperationalFactStatusMutation) (*FinanceFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) SettleFinanceFact(context.Context, *OperationalFactStatusMutation) (*FinanceFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) CancelPostedFinanceFact(context.Context, *OperationalFactStatusMutation) (*FinanceFact, error) {
	return nil, ErrBadParam
}
func (r *productionCompletionRepoStub) ListFinanceFacts(context.Context, OperationalFactFilter) ([]*FinanceFact, int, error) {
	return nil, 0, nil
}
