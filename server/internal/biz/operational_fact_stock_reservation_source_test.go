package biz

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func TestOperationalFactUsecaseCreateStockReservationFromSalesOrderNormalizesPublicIntent(t *testing.T) {
	repo := &stockReservationSourceRepoStub{
		productionCompletionRepoStub: &productionCompletionRepoStub{},
		warehouseActive:              true,
	}
	uc := NewOperationalFactUsecase(repo)
	note := "  按订单预留  "
	created, err := uc.CreateStockReservationFromSalesOrder(context.Background(), &StockReservationFromSalesOrderCreate{
		ReservationNo:    "  RSV-SOURCE-001  ",
		SalesOrderID:     11,
		SalesOrderItemID: 12,
		WarehouseID:      13,
		Quantity:         decimal.NewFromInt(2),
		IdempotencyKey:   "reservation-source-001",
		Note:             &note,
	})
	if err != nil {
		t.Fatalf("CreateStockReservationFromSalesOrder error = %v", err)
	}
	if created == nil || repo.created == nil {
		t.Fatalf("created=%#v repo input=%#v", created, repo.created)
	}
	if repo.created.ReservationNo != "RSV-SOURCE-001" || repo.created.SalesOrderID != 11 || repo.created.SalesOrderItemID != 12 || repo.created.WarehouseID != 13 {
		t.Fatalf("normalized sourced reservation = %#v", repo.created)
	}
	if repo.created.Note == nil || *repo.created.Note != "按订单预留" {
		t.Fatalf("normalized note = %#v", repo.created.Note)
	}
	if repo.created.ReservedAtSpecified || repo.created.ReservedAt.IsZero() {
		t.Fatalf("default reserved time marker/time = %v/%v", repo.created.ReservedAtSpecified, repo.created.ReservedAt)
	}
}

func TestOperationalFactUsecaseCreateStockReservationFromSalesOrderRejectsMissingSourceAndInactiveWarehouse(t *testing.T) {
	valid := &StockReservationFromSalesOrderCreate{
		ReservationNo:    "RSV-SOURCE-INVALID",
		SalesOrderID:     11,
		SalesOrderItemID: 12,
		WarehouseID:      13,
		Quantity:         decimal.NewFromInt(1),
		IdempotencyKey:   "reservation-source-invalid",
	}

	repo := &stockReservationSourceRepoStub{
		productionCompletionRepoStub: &productionCompletionRepoStub{},
		warehouseActive:              true,
	}
	uc := NewOperationalFactUsecase(repo)
	missingSource := *valid
	missingSource.SalesOrderID = 0
	if _, err := uc.CreateStockReservationFromSalesOrder(context.Background(), &missingSource); !errors.Is(err, ErrBadParam) {
		t.Fatalf("missing source error = %v, want ErrBadParam", err)
	}
	if repo.created != nil {
		t.Fatalf("missing source reached repo: %#v", repo.created)
	}

	inactiveRepo := &stockReservationSourceRepoStub{
		productionCompletionRepoStub: &productionCompletionRepoStub{},
		warehouseActive:              false,
	}
	if _, err := NewOperationalFactUsecase(inactiveRepo).CreateStockReservationFromSalesOrder(context.Background(), valid); !errors.Is(err, ErrWarehouseInactive) {
		t.Fatalf("inactive warehouse error = %v, want ErrWarehouseInactive", err)
	}
	if inactiveRepo.created != nil {
		t.Fatalf("inactive warehouse reached repo: %#v", inactiveRepo.created)
	}
}

type stockReservationSourceRepoStub struct {
	*productionCompletionRepoStub
	warehouseActive bool
	created         *StockReservationFromSalesOrderCreate
}

func (r *stockReservationSourceRepoStub) WarehouseIsActive(context.Context, int) (bool, error) {
	return r.warehouseActive, nil
}

func (r *stockReservationSourceRepoStub) CreateStockReservationFromSalesOrder(_ context.Context, in *StockReservationFromSalesOrderCreate) (*StockReservation, error) {
	copy := *in
	r.created = &copy
	return &StockReservation{
		ReservationNo:  in.ReservationNo,
		Status:         StockReservationStatusActive,
		WarehouseID:    in.WarehouseID,
		Quantity:       in.Quantity,
		IdempotencyKey: in.IdempotencyKey,
		ReservedAt:     in.ReservedAt,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}, nil
}
