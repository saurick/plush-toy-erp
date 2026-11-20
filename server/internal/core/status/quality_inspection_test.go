package status

import "testing"

func TestQualityInspectionStatusValues(t *testing.T) {
	for _, value := range []string{"DRAFT", "SUBMITTED", "PASSED", "REJECTED", "CANCELLED", " submitted "} {
		if !IsQualityInspectionStatus(value) {
			t.Fatalf("expected %q to be valid quality inspection status", value)
		}
	}
	for _, value := range []string{"", "POSTED", "HOLD"} {
		if IsQualityInspectionStatus(value) {
			t.Fatalf("expected %q to be invalid quality inspection status", value)
		}
	}
}

func TestSubmitQualityInspectionTransition(t *testing.T) {
	tests := []struct {
		name        string
		current     string
		wantTarget  string
		wantChanged bool
		wantOK      bool
	}{
		{name: "draft submits", current: QualityInspectionDraft, wantTarget: QualityInspectionSubmitted, wantChanged: true, wantOK: true},
		{name: "submitted is idempotent", current: QualityInspectionSubmitted, wantTarget: QualityInspectionSubmitted, wantOK: true},
		{name: "passed cannot submit", current: QualityInspectionPassed},
		{name: "cancelled cannot submit", current: QualityInspectionCancelled},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := SubmitQualityInspection(tt.current)
			assertQualityInspectionTransition(t, got, ok, tt.wantTarget, tt.wantChanged, tt.wantOK)
		})
	}
}

func TestDecideQualityInspectionTransition(t *testing.T) {
	tests := []struct {
		name        string
		current     string
		target      string
		wantTarget  string
		wantChanged bool
		wantOK      bool
	}{
		{name: "submitted passes", current: QualityInspectionSubmitted, target: QualityInspectionPassed, wantTarget: QualityInspectionPassed, wantChanged: true, wantOK: true},
		{name: "submitted rejects", current: QualityInspectionSubmitted, target: QualityInspectionRejected, wantTarget: QualityInspectionRejected, wantChanged: true, wantOK: true},
		{name: "passed is idempotent", current: QualityInspectionPassed, target: QualityInspectionPassed, wantTarget: QualityInspectionPassed, wantOK: true},
		{name: "rejected is idempotent", current: QualityInspectionRejected, target: QualityInspectionRejected, wantTarget: QualityInspectionRejected, wantOK: true},
		{name: "draft cannot decide", current: QualityInspectionDraft, target: QualityInspectionPassed},
		{name: "cancelled cannot decide", current: QualityInspectionCancelled, target: QualityInspectionRejected},
		{name: "invalid target rejected", current: QualityInspectionSubmitted, target: "SUBMITTED"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := DecideQualityInspection(tt.current, tt.target)
			assertQualityInspectionTransition(t, got, ok, tt.wantTarget, tt.wantChanged, tt.wantOK)
		})
	}
}

func TestCancelQualityInspectionTransition(t *testing.T) {
	tests := []struct {
		name        string
		current     string
		wantTarget  string
		wantChanged bool
		wantOK      bool
	}{
		{name: "draft cancels", current: QualityInspectionDraft, wantTarget: QualityInspectionCancelled, wantChanged: true, wantOK: true},
		{name: "submitted cancels", current: QualityInspectionSubmitted, wantTarget: QualityInspectionCancelled, wantChanged: true, wantOK: true},
		{name: "cancelled is idempotent", current: QualityInspectionCancelled, wantTarget: QualityInspectionCancelled, wantOK: true},
		{name: "passed cannot cancel", current: QualityInspectionPassed},
		{name: "rejected cannot cancel", current: QualityInspectionRejected},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := CancelQualityInspection(tt.current)
			assertQualityInspectionTransition(t, got, ok, tt.wantTarget, tt.wantChanged, tt.wantOK)
		})
	}
}

func assertQualityInspectionTransition(t *testing.T, got QualityInspectionTransition, ok bool, wantTarget string, wantChanged bool, wantOK bool) {
	t.Helper()
	if ok != wantOK {
		t.Fatalf("ok = %v, want %v", ok, wantOK)
	}
	if !ok {
		return
	}
	if got.Target != wantTarget || got.Changed != wantChanged {
		t.Fatalf("transition = %+v, want target=%q changed=%v", got, wantTarget, wantChanged)
	}
}
