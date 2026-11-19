package commandconfig

import (
	"strings"
	"testing"
)

func TestGuardSeedProduction(t *testing.T) {
	for _, key := range []string{"APP_ENV", "ERP_ENV", "GO_ENV"} {
		t.Setenv(key, "dev")
	}
	for _, tc := range []struct {
		config, key, value string
		allow, wantError   bool
	}{
		{config: "configs/dev.yaml"},
		{config: "configs/prod.yaml", wantError: true},
		{config: "CONFIGS/PROD/app.yaml", allow: true},
		{key: "APP_ENV", value: " PROD ", wantError: true},
		{key: "ERP_ENV", value: "Production", wantError: true},
		{key: "GO_ENV", value: "production", wantError: true},
		{key: "GO_ENV", value: "prod", allow: true},
	} {
		t.Run(tc.config+tc.key+tc.value, func(t *testing.T) {
			if tc.key != "" {
				t.Setenv(tc.key, tc.value)
			}
			err := GuardSeedProduction(tc.config, tc.allow, "seed demo data")
			if (err != nil) != tc.wantError || err != nil && !strings.Contains(err.Error(), "seed demo data") {
				t.Fatalf("unexpected seed guard result: %v", err)
			}
		})
	}
}
