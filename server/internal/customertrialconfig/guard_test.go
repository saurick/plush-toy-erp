package customertrialconfig

import (
	"server/internal/biz"
	"strings"
	"testing"
)

const Revision = "yoyoosun-customer-trial-133.0123456789abcdef01234567"

const validDSN = "postgres://postgres:runtime-password@postgres:5432/plush_erp_demo_v1?sslmode=disable"

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
		{name: "local host", dsn: "postgres://postgres:runtime-password@127.0.0.1:5432/plush_erp_demo_v1?sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "wrong database", dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "wrong port", dsn: "postgres://postgres:runtime-password@postgres:5435/plush_erp_demo_v1?sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "implicit port", dsn: "postgres://postgres:runtime-password@postgres/plush_erp_demo_v1?sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "extra query", dsn: validDSN + "&application_name=trial", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "duplicate sslmode", dsn: validDSN + "&sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "tls enabled", dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp_demo_v1?sslmode=require", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
		{name: "multi host", dsn: "postgres://postgres:runtime-password@postgres,other:5432/plush_erp_demo_v1?sslmode=disable", values: map[string]string{AllowEnv: "1", TargetEnv: ExpectedTarget, DebugEnv: "prod"}},
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

func TestClassifyActiveManifestUsesPersistedIdentityWithoutVersionWindow(t *testing.T) {
	for _, revision := range []string{
		Revision,
		"yoyoosun-customer-trial-133-package-v10.runtime-manifest-v1",
		"yoyoosun-customer-trial-133-package-v9.runtime-manifest-v1",
		"published-content-before-this-build",
	} {
		for _, dataset := range []string{DatasetVersion, "2026.09.16-v7"} {
			marker := map[string]any{"applyPurpose": ApplyPurpose, "datasetVersion": dataset, "target": ExpectedTarget}
			product := ExpectedTarget + "-test-" + dataset
			if trial, err := ClassifyActiveManifest(ExpectedCustomerKey, revision, product, marker); err != nil || !trial {
				t.Fatalf("active %s/%s rejected: %v", revision, dataset, err)
			}
			if revision != Revision || dataset != DatasetVersion {
				if trial, err := ClassifyManifest(ExpectedCustomerKey, revision, product, marker); err == nil || trial {
					t.Fatalf("readback identity became a new-write alias: %s/%s", revision, dataset)
				}
			}
		}
	}
}

func TestClassifyActiveManifestRejectsIncompleteBoundary(t *testing.T) {
	for _, mutate := range []func(map[string]any){
		func(m map[string]any) { delete(m, "datasetVersion") },
		func(m map[string]any) { m["datasetVersion"] = "2026.02.30-v8" },
		func(m map[string]any) { m["datasetVersion"] = "2026.09.16-v7" },
		func(m map[string]any) { m["target"] = "customer-trial-other" },
		func(m map[string]any) { m["applyPurpose"] = "local_test_apply" },
	} {
		marker := map[string]any{"applyPurpose": ApplyPurpose, "datasetVersion": DatasetVersion, "target": ExpectedTarget}
		mutate(marker)
		if trial, err := ClassifyActiveManifest(ExpectedCustomerKey, Revision, ProductVersion, marker); err == nil || trial {
			t.Fatalf("incomplete active boundary accepted: %v", marker)
		}
	}
	for _, revision := range []string{"", strings.Repeat("a", 65)} {
		marker := map[string]any{"applyPurpose": ApplyPurpose, "datasetVersion": DatasetVersion, "target": ExpectedTarget}
		if _, err := ClassifyActiveManifest(ExpectedCustomerKey, revision, ProductVersion, marker); err == nil {
			t.Fatal("invalid immutable identity accepted")
		}
	}
}

func TestClassifyRevisionProductVersionReservesTrialNamespace(t *testing.T) {
	for _, revision := range []string{Revision, "yoyoosun-customer-trial-133-package-v10.runtime-manifest-v1", "published-content-before-this-build"} {
		for _, dataset := range []string{DatasetVersion} {
			if trial, err := ClassifyRevisionProductVersion(ExpectedCustomerKey, revision, ExpectedTarget+"-test-"+dataset); err != nil || !trial {
				t.Fatalf("persisted transition identity %s/%s rejected: %v", revision, dataset, err)
			}
		}
	}
	if trial, err := ClassifyRevisionProductVersion(ExpectedCustomerKey, "formal-revision", "formal-product-version"); err != nil || trial {
		t.Fatalf("formal identity changed: (%v, %v)", trial, err)
	}
	for _, identity := range [][3]string{
		{ExpectedCustomerKey, "", ProductVersion},
		{ExpectedCustomerKey, strings.Repeat("x", 65), ProductVersion},
		{ExpectedCustomerKey, Revision, "customer-trial-other-test-2026.09.16-v7"},
		{ExpectedCustomerKey, Revision, "customer-trial-133-test-2026.09.16-v7"},
		{ExpectedCustomerKey, Revision, "customer-trial-133-test-2026.02.30-v8"},
		{"other", Revision, ProductVersion},
		{ExpectedCustomerKey, Revision, "formal-product-version"},
	} {
		if trial, err := ClassifyRevisionProductVersion(identity[0], identity[1], identity[2]); err == nil || trial {
			t.Fatalf("invalid transition identity accepted: %#v", identity)
		}
	}
}
