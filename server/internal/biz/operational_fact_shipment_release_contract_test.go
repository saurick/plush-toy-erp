package biz

import (
	"context"
	"errors"
	"testing"
)

type shipmentReleaseValidationProbe struct {
	OperationalFactRepo
	calls int
	err   error
}

func (r *shipmentReleaseValidationProbe) ValidateShipmentReleaseForShipping(context.Context, int) error {
	r.calls++
	return r.err
}
func TestShipmentReleaseValidationUsesRequiredRepositoryContract(t *testing.T) {
	repo := &shipmentReleaseValidationProbe{err: ErrShipmentReleaseRejected}
	uc := NewOperationalFactUsecase(repo)
	if err := uc.ValidateShipmentReleaseForShipping(t.Context(), 1); !errors.Is(err, ErrShipmentReleaseRejected) {
		t.Fatalf("release rejection lost: %v", err)
	}
	repo.err = nil
	if err := uc.ValidateShipmentReleaseForShipping(t.Context(), 1); err != nil {
		t.Fatal(err)
	}
	if err := uc.ValidateShipmentReleaseForShipping(t.Context(), 0); !errors.Is(err, ErrBadParam) || repo.calls != 2 {
		t.Fatalf("invalid id reached repo: calls=%d err=%v", repo.calls, err)
	}
}
