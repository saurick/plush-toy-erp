package data

import (
	"errors"
	"fmt"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestInventoryPersistenceErrorKeepsDomainAndCause(t *testing.T) {
	for _, conflict := range []error{biz.ErrBOMRecordConflict, biz.ErrPurchaseRecordConflict, biz.ErrQualityInspectionRecordConflict} {
		cause := &ent.ConstraintError{}
		got := mapInventoryPersistenceError(fmt.Errorf("save record: %w", cause), conflict)
		if !errors.Is(got, conflict) || !errors.Is(got, cause) {
			t.Fatalf("lost error contract: %v", got)
		}
		if again := mapInventoryPersistenceError(got, conflict); again != got {
			t.Fatal("conflict classified twice")
		}
	}
	unrelated := errors.New("connection interrupted")
	if got := mapInventoryPersistenceError(unrelated, biz.ErrBOMRecordConflict); got != unrelated {
		t.Fatalf("system error became a record conflict: %v", got)
	}
	if got := mapInventoryPersistenceError(nil, biz.ErrBOMRecordConflict); got != nil {
		t.Fatalf("success became an error: %v", got)
	}
}
