package main

import (
	"strings"
	"testing"
)

func TestRejectStableAdminReset(t *testing.T) {
	for _, test := range []struct {
		name         string
		requested    bool
		confirmation string
	}{
		{name: "reset flag", requested: true},
		{name: "legacy confirmation", confirmation: resetLocalSuperAdminConfirm},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := rejectStableAdminReset(test.requested, test.confirmation)
			if err == nil || !strings.Contains(err.Error(), "disabled") {
				t.Fatalf("rejectStableAdminReset() error = %v, want disabled failure", err)
			}
		})
	}
	if err := rejectStableAdminReset(false, ""); err != nil {
		t.Fatalf("rejectStableAdminReset(false) error = %v", err)
	}
}
