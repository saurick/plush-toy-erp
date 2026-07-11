package status

import "testing"

func TestShipmentStatusValues(t *testing.T) {
	if ShipmentDraft != "DRAFT" {
		t.Fatalf("ShipmentDraft = %q", ShipmentDraft)
	}
	if ShipmentShipped != "SHIPPED" {
		t.Fatalf("ShipmentShipped = %q", ShipmentShipped)
	}
	if ShipmentCancelled != "CANCELLED" {
		t.Fatalf("ShipmentCancelled = %q", ShipmentCancelled)
	}
}

func TestShipShipmentTransition(t *testing.T) {
	tests := []struct {
		name        string
		current     string
		wantTarget  string
		wantChanged bool
		wantOK      bool
	}{
		{name: "draft ships", current: ShipmentDraft, wantTarget: ShipmentShipped, wantChanged: true, wantOK: true},
		{name: "already shipped is idempotent", current: ShipmentShipped, wantTarget: ShipmentShipped, wantOK: true},
		{name: "cancelled cannot ship again", current: ShipmentCancelled},
		{name: "unknown status is rejected", current: "READY"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := ShipShipment(tt.current)
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if !ok {
				return
			}
			if got.Target != tt.wantTarget || got.Changed != tt.wantChanged {
				t.Fatalf("transition = %+v, want target=%q changed=%v", got, tt.wantTarget, tt.wantChanged)
			}
		})
	}
}

func TestCancelShippedShipmentTransition(t *testing.T) {
	tests := []struct {
		name        string
		current     string
		wantTarget  string
		wantChanged bool
		wantOK      bool
	}{
		{name: "shipped cancels", current: ShipmentShipped, wantTarget: ShipmentCancelled, wantChanged: true, wantOK: true},
		{name: "already cancelled is idempotent", current: ShipmentCancelled, wantTarget: ShipmentCancelled, wantOK: true},
		{name: "draft cannot cancel", current: ShipmentDraft},
		{name: "unknown status is rejected", current: "CLOSED"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := CancelShippedShipment(tt.current)
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if !ok {
				return
			}
			if got.Target != tt.wantTarget || got.Changed != tt.wantChanged {
				t.Fatalf("transition = %+v, want target=%q changed=%v", got, tt.wantTarget, tt.wantChanged)
			}
		})
	}
}
