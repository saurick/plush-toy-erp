package customertrialconfig

import (
	"server/internal/biz"
	"strings"
	"testing"
)

const validDSN = "postgres://postgres:runtime-password@postgres:5432/plush_erp_uat_20260716_v5?sslmode=disable"

func env(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func enabledEnv() func(string) string {
	return env(map[string]string{
		AllowEnv:  "1",
		TargetEnv: ExpectedTarget,
		DebugEnv:  "prod",
	})
}

func TestResolveGateDefaultsClosed(t *testing.T) {
	for _, allow := range []string{"", "0"} {
		enabled, err := ResolveGate("", env(map[string]string{AllowEnv: allow, DebugEnv: "prod"}))
		if err != nil {
			t.Fatalf("ResolveGate(%q) error = %v", allow, err)
		}
		if enabled {
			t.Fatalf("ResolveGate(%q) enabled an unconfigured trial channel", allow)
		}
	}
}

func TestResolveGateAcceptsOnlyRegisteredRuntime(t *testing.T) {
	enabled, err := ResolveGate(validDSN, enabledEnv())
	if err != nil {
		t.Fatalf("ResolveGate() error = %v", err)
	}
	if !enabled {
		t.Fatal("ResolveGate() did not enable the registered trial runtime")
	}
}

func TestResolveGateRejectsEveryPartialOrMismatchedBoundary(t *testing.T) {
	tests := []struct {
		name   string
		dsn    string
		values map[string]string
	}{
		{name: "target without opt in", dsn: validDSN, values: map[string]string{TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "zero opt in with target", dsn: validDSN, values: map[string]string{AllowEnv: "0", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "false-like opt in", dsn: validDSN, values: map[string]string{AllowEnv: "false", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "wrong target", dsn: validDSN, values: map[string]string{AllowEnv: "1", TargetEnv: "customer-trial-local", DebugEnv: "prod"}},
		{name: "production alias is not exact", dsn: validDSN, values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "production"}},
		{name: "local host", dsn: "postgres://postgres:runtime-password@127.0.0.1:5432/plush_erp_uat_20260716_v5?sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "wrong database", dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "wrong port", dsn: "postgres://postgres:runtime-password@postgres:5435/plush_erp_uat_20260716_v5?sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "implicit port", dsn: "postgres://postgres:runtime-password@postgres/plush_erp_uat_20260716_v5?sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "extra query", dsn: validDSN + "&application_name=trial", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "duplicate sslmode", dsn: validDSN + "&sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "tls enabled", dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp_uat_20260716_v5?sslmode=require", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "multi host", dsn: "postgres://postgres:runtime-password@postgres,other:5432/plush_erp_uat_20260716_v5?sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			enabled, err := ResolveGate(tt.dsn, env(tt.values))
			if err == nil {
				t.Fatal("ResolveGate() unexpectedly accepted invalid boundary")
			}
			if enabled {
				t.Fatal("ResolveGate() enabled invalid boundary")
			}
			if strings.Contains(err.Error(), "runtime-password") {
				t.Fatal("ResolveGate() exposed a DSN password")
			}
		})
	}
}

func TestClassifyManifestRequiresAtomicExactMarker(t *testing.T) {
	marker := map[string]any{
		"applyPurpose":   ApplyPurpose,
		"datasetVersion": DatasetVersion,
		"target":         ExpectedTarget,
	}
	trial, err := ClassifyManifest(ExpectedCustomerKey, Revision, ProductVersion, marker)
	if err != nil || !trial {
		t.Fatalf("ClassifyManifest() = (%v, %v), want exact trial marker", trial, err)
	}
	if trial, err := ClassifyManifest(ExpectedCustomerKey, "formal-revision", "formal-product-version", map[string]any{"pages": []any{"sales-orders"}}); err != nil || trial {
		t.Fatalf("ClassifyManifest() changed formal input: (%v, %v)", trial, err)
	}
	if trial, err := ClassifyManifest(
		ExpectedCustomerKey,
		"local-revision",
		biz.CustomerConfigLocalTestProductVersion,
		map[string]any{"applyPurpose": biz.CustomerConfigLocalTestApplyPurpose},
	); err != nil || trial {
		t.Fatalf("ClassifyManifest() changed local test input: (%v, %v)", trial, err)
	}
	if trial, err := ClassifyManifest(
		ExpectedCustomerKey,
		"formal-revision",
		"formal-product-version",
		map[string]any{"datasetVersion": DatasetVersion},
	); err != nil || trial {
		t.Fatalf("ClassifyManifest() reserved a general datasetVersion field: (%v, %v)", trial, err)
	}

	invalid := []struct {
		name           string
		customerKey    string
		revision       string
		productVersion string
		snapshot       map[string]any
	}{
		{name: "wrong customer", customerKey: "other", revision: Revision, productVersion: ProductVersion, snapshot: marker},
		{name: "missing snapshot", customerKey: ExpectedCustomerKey, revision: Revision, productVersion: ProductVersion, snapshot: nil},
		{name: "wrong revision", customerKey: ExpectedCustomerKey, revision: "yoyoosun-customer-trial-133-package-v5.other", productVersion: ProductVersion, snapshot: marker},
		{name: "reserved revision with formal product", customerKey: ExpectedCustomerKey, revision: Revision, productVersion: "formal-product-version", snapshot: map[string]any{"pages": []any{"sales-orders"}}},
		{name: "wrong product version", customerKey: ExpectedCustomerKey, revision: Revision, productVersion: "formal-product-version", snapshot: marker},
		{name: "wrong purpose", customerKey: ExpectedCustomerKey, revision: Revision, productVersion: ProductVersion, snapshot: map[string]any{"applyPurpose": "local_test_apply", "datasetVersion": DatasetVersion, "target": ExpectedTarget}},
		{name: "previous dataset", customerKey: ExpectedCustomerKey, revision: Revision, productVersion: ProductVersion, snapshot: map[string]any{"applyPurpose": ApplyPurpose, "datasetVersion": "2026.07.15-v3", "target": ExpectedTarget}},
		{name: "wrong target", customerKey: ExpectedCustomerKey, revision: Revision, productVersion: ProductVersion, snapshot: map[string]any{"applyPurpose": ApplyPurpose, "datasetVersion": DatasetVersion, "target": "local"}},
		{name: "reserved purpose on formal input", customerKey: ExpectedCustomerKey, revision: "formal-revision", productVersion: "formal-product-version", snapshot: map[string]any{"applyPurpose": ApplyPurpose}},
		{name: "reserved purpose namespace on formal input", customerKey: ExpectedCustomerKey, revision: "formal-revision", productVersion: "formal-product-version", snapshot: map[string]any{"applyPurpose": "customer_trial_unknown"}},
		{name: "reserved target namespace on formal input", customerKey: ExpectedCustomerKey, revision: "formal-revision", productVersion: "formal-product-version", snapshot: map[string]any{"target": "customer-trial-unknown"}},
	}
	for _, tt := range invalid {
		t.Run(tt.name, func(t *testing.T) {
			if trial, err := ClassifyManifest(tt.customerKey, tt.revision, tt.productVersion, tt.snapshot); err == nil || trial {
				t.Fatalf("ClassifyManifest() = (%v, %v), want invalid marker", trial, err)
			}
		})
	}
}

func TestClassifyRevisionProductVersionReservesTrialNamespace(t *testing.T) {
	if trial, err := ClassifyRevisionProductVersion(ExpectedCustomerKey, Revision, ProductVersion); err != nil || !trial {
		t.Fatalf("ClassifyRevisionProductVersion() = (%v, %v), want trial", trial, err)
	}
	if trial, err := ClassifyRevisionProductVersion(ExpectedCustomerKey, "formal-revision", "formal-product-version"); err != nil || trial {
		t.Fatalf("ClassifyRevisionProductVersion() changed formal input: (%v, %v)", trial, err)
	}
	for _, identity := range [][3]string{{ExpectedCustomerKey, "wrong-revision", ProductVersion}, {ExpectedCustomerKey, Revision, "customer-trial-133-test-2026.07.15-v3"}, {"other", Revision, ProductVersion}, {ExpectedCustomerKey, Revision, "formal-product-version"}} {
		if trial, err := ClassifyRevisionProductVersion(identity[0], identity[1], identity[2]); err == nil || trial {
			t.Fatalf("ClassifyRevisionProductVersion() = (%v, %v), want reserved namespace rejection", trial, err)
		}
	}
}
