package biz

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type shipmentSourceCandidateRepoStub struct {
	OperationalFactRepo
	filter ShipmentSourceCandidateFilter
	calls  int
}

func (r *shipmentSourceCandidateRepoStub) ListShipmentSourceCandidates(
	_ context.Context,
	filter ShipmentSourceCandidateFilter,
) ([]*ShipmentSourceCandidate, int, error) {
	r.calls++
	r.filter = filter
	return []*ShipmentSourceCandidate{{SalesOrderID: 1, SalesOrderItemID: 2}}, 1, nil
}

func TestOperationalFactUsecaseListShipmentSourceCandidatesNormalizesAndDelegates(t *testing.T) {
	repo := &shipmentSourceCandidateRepoStub{}
	uc := NewOperationalFactUsecase(repo)
	items, total, err := uc.ListShipmentSourceCandidates(context.Background(), ShipmentSourceCandidateFilter{
		Keyword:      "  SO-001  ",
		SalesOrderID: 7,
		Limit:        200,
		Offset:       50,
	})
	if err != nil {
		t.Fatalf("list shipment source candidates: %v", err)
	}
	if total != 1 || len(items) != 1 || repo.calls != 1 {
		t.Fatalf("unexpected result: total=%d items=%#v calls=%d", total, items, repo.calls)
	}
	if repo.filter.Keyword != "SO-001" || repo.filter.SalesOrderID != 7 || repo.filter.Limit != 200 || repo.filter.Offset != 50 {
		t.Fatalf("filter not normalized: %#v", repo.filter)
	}
}

func TestOperationalFactUsecaseListShipmentSourceCandidatesRejectsInvalidFilters(t *testing.T) {
	tests := []ShipmentSourceCandidateFilter{
		{Limit: 0},
		{Limit: 201},
		{Limit: 50, Offset: -1},
		{Limit: 50, SalesOrderID: -1},
		{Limit: 50, Keyword: strings.Repeat("界", shipmentSourceCandidateMaxKeywordRunes+1)},
	}
	for _, filter := range tests {
		t.Run(strings.ReplaceAll(filter.Keyword, "界", "x"), func(t *testing.T) {
			repo := &shipmentSourceCandidateRepoStub{}
			uc := NewOperationalFactUsecase(repo)
			if _, _, err := uc.ListShipmentSourceCandidates(context.Background(), filter); !errors.Is(err, ErrBadParam) {
				t.Fatalf("filter %#v error=%v, want ErrBadParam", filter, err)
			}
			if repo.calls != 0 {
				t.Fatalf("invalid filter reached repository: %#v", filter)
			}
		})
	}
}

func TestOperationalFactUsecaseListShipmentSourceCandidatesRequiresCapability(t *testing.T) {
	uc := NewOperationalFactUsecase(&shipmentSourceCandidateRepoWithoutCapability{})
	if _, _, err := uc.ListShipmentSourceCandidates(context.Background(), ShipmentSourceCandidateFilter{Limit: 50}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("missing repository capability error=%v, want ErrBadParam", err)
	}
}

type shipmentSourceCandidateRepoWithoutCapability struct {
	OperationalFactRepo
}
