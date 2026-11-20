package service

import "testing"

func TestNormalizeAuthSMSRuntimeConfigProviderEnabled(t *testing.T) {
	got := normalizeAuthSMSRuntimeConfig("provider")
	if !got.Enabled {
		t.Fatalf("provider mode should be enabled: %+v", got)
	}
	if got.MockDelivery {
		t.Fatalf("provider mode must not expose mock delivery: %+v", got)
	}
	if got.DisabledReason != "" {
		t.Fatalf("provider mode should not have disabled reason: %+v", got)
	}
}
