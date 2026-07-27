package biz

import (
	"errors"
	"testing"
)

func TestOperationalFactStatusMutationStartsAtPersistedVersionOne(t *testing.T) {
	t.Parallel()

	if _, err := normalizeOperationalFactStatusMutation(&OperationalFactStatusMutation{
		ID:              1,
		ExpectedVersion: 0,
		ActorID:         1,
	}, false); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected_version=0 error=%v, want ErrBadParam", err)
	}

	normalized, err := normalizeOperationalFactStatusMutation(&OperationalFactStatusMutation{
		ID:              1,
		ExpectedVersion: 1,
		ActorID:         1,
	}, false)
	if err != nil || normalized.ExpectedVersion != 1 {
		t.Fatalf("version-one mutation=%#v error=%v", normalized, err)
	}
}
