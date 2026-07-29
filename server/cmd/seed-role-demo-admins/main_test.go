package main

import (
	"strings"
	"testing"

	"server/internal/biz"
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

func TestResolveRoleDemoPasswordPrecedence(t *testing.T) {
	tests := []struct {
		name         string
		flagPassword string
		envPassword  string
		wantPassword string
		wantSource   string
	}{
		{
			name:         "default",
			wantPassword: "12345678",
			wantSource:   "default",
		},
		{
			name:         "environment overrides default",
			envPassword:  "env-demo-password",
			wantPassword: "env-demo-password",
			wantSource:   "ERP_ROLE_DEMO_PASSWORD",
		},
		{
			name:         "flag overrides environment",
			flagPassword: "flag-demo-password",
			envPassword:  "env-demo-password",
			wantPassword: "flag-demo-password",
			wantSource:   "--password",
		},
		{
			name:         "blank explicit values fall back to default",
			flagPassword: "  ",
			envPassword:  "\t",
			wantPassword: "12345678",
			wantSource:   "default",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			password, source := resolveRoleDemoPassword(tt.flagPassword, func(key string) string {
				if key != "ERP_ROLE_DEMO_PASSWORD" {
					t.Fatalf("unexpected environment key %q", key)
				}
				return tt.envPassword
			})
			if password != tt.wantPassword || source != tt.wantSource {
				t.Fatalf("resolveRoleDemoPassword() = (%q, %q), want (%q, %q)", password, source, tt.wantPassword, tt.wantSource)
			}
		})
	}
}

func TestValidateRoleDemoPasswordRequiresExplicitValueWithAllowProd(t *testing.T) {
	if err := validateRoleDemoPassword(defaultRoleDemoPassword, false); err != nil {
		t.Fatalf("local default password must be valid: %v", err)
	}
	if err := validateRoleDemoPassword(defaultRoleDemoPassword, true); err == nil || !strings.Contains(err.Error(), "explicit") {
		t.Fatalf("allow-prod default validation error = %v, want explicit-password failure", err)
	}
	if err := validateRoleDemoPassword("explicit-pass-123", true); err != nil {
		t.Fatalf("explicit allow-prod password must be accepted: %v", err)
	}
	if err := validateRoleDemoPassword(defaultRoleDemoPassword, true); err == nil || !strings.Contains(err.Error(), "non-default") {
		t.Fatalf("allow-prod explicit public default validation error = %v, want non-default failure", err)
	}
	if err := validateRoleDemoPassword("short", false); err == nil || !strings.Contains(err.Error(), "8-20") {
		t.Fatalf("invalid password validation error = %v, want policy failure", err)
	}
}

func TestValidateRoleDemoPasswordTargetRestrictsPublicDefault(t *testing.T) {
	const isolatedDevDSN = "postgres://test_user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable"
	const registeredDevDSN = "postgres://test_user:secret@192.168.0.106:5432/plush_erp?sslmode=disable"
	if err := validateRoleDemoPasswordTarget(defaultRoleDemoPassword, isolatedDevDSN, false, false); err != nil {
		t.Fatalf("registered isolated development database must accept the public default: %v", err)
	}
	if err := validateRoleDemoPasswordTarget(defaultRoleDemoPassword, registeredDevDSN, false, false); err != nil {
		t.Fatalf("registered development database must accept the public default: %v", err)
	}

	tests := []struct {
		name          string
		dsn           string
		includeDebug  bool
		includeManual bool
		wantError     string
	}{
		{
			name:      "unregistered loopback database",
			dsn:       "postgres://test_user:secret@127.0.0.1:5432/plush_erp?sslmode=disable",
			wantError: "registered local development database",
		},
		{
			name:      "remote test database",
			dsn:       "postgres://test_user:secret@192.168.0.133:5435/plush_erp_trial_dev?sslmode=disable",
			wantError: "registered local development database",
		},
		{
			name:         "debug account",
			dsn:          isolatedDevDSN,
			includeDebug: true,
			wantError:    "explicit",
		},
		{
			name:          "manual acceptance accounts",
			dsn:           isolatedDevDSN,
			includeManual: true,
			wantError:     "explicit",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateRoleDemoPasswordTarget(
				defaultRoleDemoPassword,
				tt.dsn,
				tt.includeDebug,
				tt.includeManual,
			)
			if err == nil || !strings.Contains(err.Error(), tt.wantError) {
				t.Fatalf("validateRoleDemoPasswordTarget() error = %v, want %q", err, tt.wantError)
			}
		})
	}

	if err := validateRoleDemoPasswordTarget("explicit-pass-123", "postgres://user:secret@example.test:5432/trial", true, true); err != nil {
		t.Fatalf("non-default explicit password must not use the public-default target guard: %v", err)
	}
}

func TestRoleDemoAccountsForPasswordIncludesDemoAdminAndExcludesDebugByDefault(t *testing.T) {
	defaultAccounts := roleDemoAccountsForPassword(defaultRoleDemoPassword, false)
	if len(defaultAccounts) != 10 {
		t.Fatalf("default role demo account count = %d, want 10 role demo accounts", len(defaultAccounts))
	}
	foundDemoAdmin := false
	for _, account := range defaultAccounts {
		if account.Username == "demo_admin" && account.RoleKey == biz.AdminRoleKey {
			foundDemoAdmin = true
		}
		if account.RoleKey == biz.DebugOperatorRoleKey {
			t.Fatalf("default role demo accounts must not include debug role %q", account.RoleKey)
		}
		switch account.Username {
		case "admin", "demo_debug", "demo_uat_disabled", "demo_uat_sales_purchase", "demo_uat_no_entry":
			t.Fatalf("default role demo accounts must not include protected account %q", account.Username)
		}
	}
	if !foundDemoAdmin {
		t.Fatal("default role demo accounts must include demo_admin with the admin role")
	}

	explicitAccounts := roleDemoAccountsForPassword("explicit-pass-123", true)
	if len(explicitAccounts) != 11 {
		t.Fatalf("explicit role demo account count = %d, want 11 including admin and debug", len(explicitAccounts))
	}
}
