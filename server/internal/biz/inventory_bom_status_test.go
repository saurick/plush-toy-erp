package biz

import "testing"

func TestBOMStatusContractOnlyKnowsCurrentLifecycle(t *testing.T) {
	for _, status := range []string{BOMStatusDraft, BOMStatusActive, BOMStatusArchived} {
		if !IsKnownBOMStatus(status) {
			t.Fatalf("current BOM status %q must be known", status)
		}
	}

	for _, status := range []string{"", "DISABLED", "UNKNOWN"} {
		if IsKnownBOMStatus(status) || IsValidBOMStatus(status) || IsCreatableBOMStatus(status) {
			t.Fatalf("removed or unknown BOM status %q must stay outside the lifecycle contract", status)
		}
		for _, target := range []string{BOMStatusDraft, BOMStatusActive, BOMStatusArchived} {
			if CanTransitionBOMStatus(status, target) {
				t.Fatalf("removed or unknown BOM status %q must not transition to %q", status, target)
			}
		}
	}
}
