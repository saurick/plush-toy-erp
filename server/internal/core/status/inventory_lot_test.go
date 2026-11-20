package status

import "testing"

func TestInventoryLotStatusValues(t *testing.T) {
	tests := map[string]string{
		"InventoryLotActive":   InventoryLotActive,
		"InventoryLotHold":     InventoryLotHold,
		"InventoryLotRejected": InventoryLotRejected,
		"InventoryLotDisabled": InventoryLotDisabled,
	}
	want := map[string]string{
		"InventoryLotActive":   "ACTIVE",
		"InventoryLotHold":     "HOLD",
		"InventoryLotRejected": "REJECTED",
		"InventoryLotDisabled": "DISABLED",
	}
	for name, got := range tests {
		if got != want[name] {
			t.Fatalf("%s = %q, want %q", name, got, want[name])
		}
	}
}

func TestIsInventoryLotStatus(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "active", value: InventoryLotActive, want: true},
		{name: "hold", value: InventoryLotHold, want: true},
		{name: "rejected", value: InventoryLotRejected, want: true},
		{name: "disabled", value: InventoryLotDisabled, want: true},
		{name: "normalizes", value: " active ", want: true},
		{name: "empty", value: ""},
		{name: "unknown", value: "WAITING"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsInventoryLotStatus(tt.value); got != tt.want {
				t.Fatalf("valid = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCanChangeInventoryLotStatus(t *testing.T) {
	tests := []struct {
		name               string
		current            string
		target             string
		hasPositiveBalance bool
		want               bool
	}{
		{name: "same active is idempotent", current: InventoryLotActive, target: InventoryLotActive, hasPositiveBalance: true, want: true},
		{name: "same disabled is idempotent even with balance", current: InventoryLotDisabled, target: InventoryLotDisabled, hasPositiveBalance: true, want: true},
		{name: "active to hold", current: InventoryLotActive, target: InventoryLotHold, want: true},
		{name: "active to rejected rejected", current: InventoryLotActive, target: InventoryLotRejected},
		{name: "hold to active", current: InventoryLotHold, target: InventoryLotActive, want: true},
		{name: "hold to rejected", current: InventoryLotHold, target: InventoryLotRejected, want: true},
		{name: "rejected to active", current: InventoryLotRejected, target: InventoryLotActive, want: true},
		{name: "rejected to hold", current: InventoryLotRejected, target: InventoryLotHold, want: true},
		{name: "disabled cannot reopen", current: InventoryLotDisabled, target: InventoryLotActive},
		{name: "active disables with zero balance", current: InventoryLotActive, target: InventoryLotDisabled, want: true},
		{name: "hold disables with zero balance", current: InventoryLotHold, target: InventoryLotDisabled, want: true},
		{name: "rejected disables with zero balance", current: InventoryLotRejected, target: InventoryLotDisabled, want: true},
		{name: "disable with positive balance rejected", current: InventoryLotActive, target: InventoryLotDisabled, hasPositiveBalance: true},
		{name: "invalid current rejected", current: "WAITING", target: InventoryLotActive},
		{name: "invalid target rejected", current: InventoryLotActive, target: "WAITING"},
		{name: "normalizes statuses", current: " active ", target: " hold ", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CanChangeInventoryLotStatus(tt.current, tt.target, tt.hasPositiveBalance)
			if got != tt.want {
				t.Fatalf("allowed = %v, want %v", got, tt.want)
			}
		})
	}
}
