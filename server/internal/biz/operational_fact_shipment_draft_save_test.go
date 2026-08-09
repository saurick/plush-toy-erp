package biz

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

type shipmentDraftSaveRepoStub struct {
	OperationalFactRepo
	calls int
	saved *ShipmentDraftSave
}

func (r *shipmentDraftSaveRepoStub) WarehouseIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentDraftSaveRepoStub) SaveShipmentDraftWithItems(_ context.Context, in *ShipmentDraftSave) (*Shipment, error) {
	r.calls++
	r.saved = in
	return &Shipment{ID: in.ID, ShipmentNo: in.ShipmentNo, Status: ShipmentStatusDraft, Version: in.ExpectedVersion + 1}, nil
}

type shipmentDraftSaveUnsupportedRepo struct {
	OperationalFactRepo
}

func (r *shipmentDraftSaveUnsupportedRepo) WarehouseIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func validShipmentDraftSaveInput() *ShipmentDraftSave {
	salesOrderID := 11
	customerID := 12
	salesOrderItemID := 13
	customerSnapshot := "  前端旧客户快照  "
	note := "   "
	itemNote := "  新明细备注  "
	plannedAt := time.Date(2026, 8, 9, 12, 30, 0, 123456789, time.FixedZone("CST", 8*60*60))
	return &ShipmentDraftSave{
		ID:               7,
		ExpectedVersion:  3,
		ShipmentNo:       "  SHIP-DRAFT-EDIT  ",
		SalesOrderID:     &salesOrderID,
		CustomerID:       &customerID,
		CustomerSnapshot: &customerSnapshot,
		PlannedShipAt:    &plannedAt,
		Note:             &note,
		Items: []*ShipmentItemCreate{{
			SalesOrderItemID: &salesOrderItemID,
			ProductID:        21,
			WarehouseID:      22,
			UnitID:           23,
			Quantity:         decimal.RequireFromString("2.500000"),
			Note:             &itemNote,
		}},
	}
}

func TestOperationalFactUsecaseSaveShipmentDraftNormalizesCompleteAggregate(t *testing.T) {
	repo := &shipmentDraftSaveRepoStub{}
	updated, err := NewOperationalFactUsecase(repo).SaveShipmentDraftWithItems(t.Context(), validShipmentDraftSaveInput())
	if err != nil {
		t.Fatalf("save shipment draft: %v", err)
	}
	if updated.ID != 7 || updated.Version != 4 || repo.calls != 1 {
		t.Fatalf("updated shipment = %#v, calls=%d", updated, repo.calls)
	}
	if repo.saved == nil || repo.saved.ShipmentNo != "SHIP-DRAFT-EDIT" {
		t.Fatalf("normalized shipment = %#v", repo.saved)
	}
	if repo.saved.CustomerSnapshot == nil || *repo.saved.CustomerSnapshot != "前端旧客户快照" {
		t.Fatalf("customer snapshot normalization = %#v", repo.saved.CustomerSnapshot)
	}
	if repo.saved.Note != nil {
		t.Fatalf("blank note must clear persisted note, got %#v", repo.saved.Note)
	}
	if repo.saved.PlannedShipAt == nil || repo.saved.PlannedShipAt.Location() != time.UTC || repo.saved.PlannedShipAt.Nanosecond() != 123456000 {
		t.Fatalf("planned time normalization = %#v", repo.saved.PlannedShipAt)
	}
	if len(repo.saved.Items) != 1 || repo.saved.Items[0].Note == nil || *repo.saved.Items[0].Note != "新明细备注" {
		t.Fatalf("normalized lines = %#v", repo.saved.Items)
	}
}

func TestOperationalFactUsecaseSaveShipmentDraftRejectsIncompleteOrUnsupportedAggregate(t *testing.T) {
	for name, mutate := range map[string]func(*ShipmentDraftSave){
		"missing id":               func(in *ShipmentDraftSave) { in.ID = 0 },
		"missing expected version": func(in *ShipmentDraftSave) { in.ExpectedVersion = 0 },
		"missing shipment number":  func(in *ShipmentDraftSave) { in.ShipmentNo = " " },
		"missing items":            func(in *ShipmentDraftSave) { in.Items = nil },
		"nil item":                 func(in *ShipmentDraftSave) { in.Items = []*ShipmentItemCreate{nil} },
	} {
		t.Run(name, func(t *testing.T) {
			repo := &shipmentDraftSaveRepoStub{}
			in := validShipmentDraftSaveInput()
			mutate(in)
			if _, err := NewOperationalFactUsecase(repo).SaveShipmentDraftWithItems(t.Context(), in); !errors.Is(err, ErrBadParam) {
				t.Fatalf("error=%v, want ErrBadParam", err)
			}
			if repo.calls != 0 {
				t.Fatalf("invalid aggregate reached repository")
			}
		})
	}

	if _, err := NewOperationalFactUsecase(&shipmentDraftSaveUnsupportedRepo{}).SaveShipmentDraftWithItems(t.Context(), validShipmentDraftSaveInput()); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unsupported repository error=%v, want ErrBadParam", err)
	}
}
