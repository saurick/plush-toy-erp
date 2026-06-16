package main

import (
	"context"
	"math"
	"testing"

	"server/internal/conf"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	oteltrace "go.opentelemetry.io/otel/trace"
)

func TestNormalizeTraceRatio(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		input float64
		want  float64
	}{
		{name: "nan falls back to zero", input: math.NaN(), want: 0},
		{name: "negative clamps to zero", input: -0.5, want: 0},
		{name: "zero keeps zero", input: 0, want: 0},
		{name: "fraction keeps ratio", input: 0.25, want: 0.25},
		{name: "one keeps one", input: 1, want: 1},
		{name: "above one clamps to one", input: 3, want: 1},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := normalizeTraceRatio(tc.input); got != tc.want {
				t.Fatalf("normalizeTraceRatio(%v) = %v, want %v", tc.input, got, tc.want)
			}
		})
	}
}

func TestResolveTraceEnvOverrides(t *testing.T) {
	t.Parallel()

	getenv := func(key string) string {
		switch key {
		case "TRACE_ENDPOINT":
			return " jaeger:4318 "
		case "TRACE_RATIO":
			return "0.05"
		default:
			return ""
		}
	}
	endpoint, ratio, err := resolveTraceEnvOverrides("127.0.0.1:4318", 1, getenv)
	if err != nil {
		t.Fatalf("resolveTraceEnvOverrides returned error: %v", err)
	}
	if endpoint != "jaeger:4318" {
		t.Fatalf("endpoint = %q, want jaeger:4318", endpoint)
	}
	if ratio != 0.05 {
		t.Fatalf("ratio = %v, want 0.05", ratio)
	}
}

func TestResolveTraceEnvOverridesRejectsInvalidRatio(t *testing.T) {
	t.Parallel()

	endpoint, ratio, err := resolveTraceEnvOverrides("127.0.0.1:4318", 0.1, func(key string) string {
		if key == "TRACE_RATIO" {
			return "not-a-number"
		}
		return ""
	})
	if err == nil {
		t.Fatal("expected invalid TRACE_RATIO error")
	}
	if endpoint != "127.0.0.1:4318" {
		t.Fatalf("endpoint = %q, want original endpoint", endpoint)
	}
	if ratio != 0.1 {
		t.Fatalf("ratio = %v, want original ratio", ratio)
	}
}

func TestValidateProductionBootstrapConfigRejectsPlaceholders(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:change-this-prod-postgres-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: "change-this-prod-jwt-secret",
			Admin:     &conf.Data_Auth_Admin{Password: ""},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, func(string) string { return "" }); err == nil {
		t.Fatal("expected production placeholder config to be rejected")
	}
}

func TestValidateProductionBootstrapConfigAllowsBlankBootstrapAdminPassword(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: "0123456789abcdef0123456789abcdef",
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: ""},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, func(string) string { return "" }); err != nil {
		t.Fatalf("expected production config with blank bootstrap admin password to pass, got %v", err)
	}
}

func TestValidateProductionBootstrapConfigRequiresOnceFlagForAdminPassword(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: "0123456789abcdef0123456789abcdef",
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: "runtime-admin-password"},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, func(string) string { return "" }); err == nil {
		t.Fatal("expected production bootstrap admin password without once flag to be rejected")
	}
}

func TestValidateProductionBootstrapConfigRequiresAdminPasswordWhenOnceEnabled(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: "0123456789abcdef0123456789abcdef",
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: ""},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, func(key string) string {
		if key == "BOOTSTRAP_ADMIN_ONCE" {
			return "true"
		}
		return ""
	}); err == nil {
		t.Fatal("expected BOOTSTRAP_ADMIN_ONCE=true without password to be rejected")
	}
}

func TestValidateProductionBootstrapConfigAllowsAdminPasswordWithOnceFlag(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: "0123456789abcdef0123456789abcdef",
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: "runtime-admin-password"},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, func(key string) string {
		if key == "BOOTSTRAP_ADMIN_ONCE" {
			return "true"
		}
		return ""
	}); err != nil {
		t.Fatalf("expected once bootstrap admin password to pass, got %v", err)
	}
}

func TestValidateProductionBootstrapConfigSkipsDevConfig(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:change-this-dev-password@127.0.0.1:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: "change-this-dev-jwt-secret",
			Admin:     &conf.Data_Auth_Admin{Password: "change-this-dev-admin-password"},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/dev/config.yaml", cfg, func(string) string { return "" }); err != nil {
		t.Fatalf("expected dev config to skip production gate, got %v", err)
	}
}

func TestBuildTraceSamplerHonorsParentDecision(t *testing.T) {
	t.Parallel()

	traceID := oteltrace.TraceID{1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}
	sampledParent := oteltrace.NewSpanContext(oteltrace.SpanContextConfig{
		TraceID:    traceID,
		SpanID:     oteltrace.SpanID{2, 2, 2, 2, 2, 2, 2, 2},
		TraceFlags: oteltrace.FlagsSampled,
		Remote:     true,
	})
	unsampledParent := oteltrace.NewSpanContext(oteltrace.SpanContextConfig{
		TraceID: traceID,
		SpanID:  oteltrace.SpanID{3, 3, 3, 3, 3, 3, 3, 3},
		Remote:  true,
	})

	cases := []struct {
		name   string
		ratio  float64
		parent oteltrace.SpanContext
		want   sdktrace.SamplingDecision
	}{
		{
			name:   "zero ratio drops root spans",
			ratio:  0,
			parent: oteltrace.SpanContext{},
			want:   sdktrace.Drop,
		},
		{
			name:   "full ratio samples root spans",
			ratio:  1,
			parent: oteltrace.SpanContext{},
			want:   sdktrace.RecordAndSample,
		},
		{
			name:   "sampled parent still wins when local ratio is zero",
			ratio:  0,
			parent: sampledParent,
			want:   sdktrace.RecordAndSample,
		},
		{
			name:   "unsampled parent stays unsampled",
			ratio:  1,
			parent: unsampledParent,
			want:   sdktrace.Drop,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			ctx := context.Background()
			if tc.parent.IsValid() {
				ctx = oteltrace.ContextWithSpanContext(ctx, tc.parent)
			}
			got := buildTraceSampler(tc.ratio).ShouldSample(sdktrace.SamplingParameters{
				ParentContext: ctx,
				TraceID:       traceID,
				Name:          "test-operation",
				Kind:          oteltrace.SpanKindServer,
			}).Decision
			if got != tc.want {
				t.Fatalf("buildTraceSampler(%v) decision = %v, want %v", tc.ratio, got, tc.want)
			}
		})
	}
}
