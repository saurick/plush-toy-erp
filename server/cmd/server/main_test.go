package main

import (
	"context"
	"math"
	"strings"
	"testing"

	"server/internal/admincredential"
	"server/internal/biz"
	"server/internal/conf"
	"server/internal/customertrialconfig"

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

func TestOverrideDevServerPortsAppliesFixedBundle(t *testing.T) {
	t.Parallel()

	cfg := &conf.Server{
		Http: &conf.Server_HTTP{Addr: "0.0.0.0:8300"},
		Grpc: &conf.Server_GRPC{Addr: "[::]:9300"},
	}
	values := map[string]string{
		"DEV_HTTP_PORT": "8310",
		"DEV_GRPC_PORT": "9310",
	}
	if err := overrideDevServerPorts("./configs/dev/config.yaml", cfg, func(key string) string {
		return values[key]
	}); err != nil {
		t.Fatalf("overrideDevServerPorts returned error: %v", err)
	}
	if cfg.Http.Addr != "0.0.0.0:8310" {
		t.Fatalf("http addr = %q, want 0.0.0.0:8310", cfg.Http.Addr)
	}
	if cfg.Grpc.Addr != "[::]:9310" {
		t.Fatalf("grpc addr = %q, want [::]:9310", cfg.Grpc.Addr)
	}
}

func TestOverrideDevServerPortsRecognizesDevConfigDirectory(t *testing.T) {
	t.Parallel()

	cfg := &conf.Server{
		Http: &conf.Server_HTTP{Addr: "0.0.0.0:8300"},
		Grpc: &conf.Server_GRPC{Addr: "[::]:9300"},
	}
	values := map[string]string{
		"DEV_HTTP_PORT": "8310",
		"DEV_GRPC_PORT": "9310",
	}
	if err := overrideDevServerPorts("./server/configs/dev", cfg, func(key string) string {
		return values[key]
	}); err != nil {
		t.Fatalf("overrideDevServerPorts returned error: %v", err)
	}
	if cfg.Http.Addr != "0.0.0.0:8310" || cfg.Grpc.Addr != "[::]:9310" {
		t.Fatalf("development directory override was not applied: %#v", cfg)
	}
}

func TestOverrideDevServerPortsDoesNotChangeProduction(t *testing.T) {
	t.Parallel()

	cfg := &conf.Server{
		Http: &conf.Server_HTTP{Addr: "0.0.0.0:8300"},
		Grpc: &conf.Server_GRPC{Addr: "0.0.0.0:9300"},
	}
	if err := overrideDevServerPorts("./configs/prod/config.yaml", cfg, func(string) string {
		return "8500"
	}); err != nil {
		t.Fatalf("production config returned error: %v", err)
	}
	if cfg.Http.Addr != "0.0.0.0:8300" || cfg.Grpc.Addr != "0.0.0.0:9300" {
		t.Fatalf("production addresses changed: %#v", cfg)
	}
}

func TestOverrideDevServerPortsRejectsInvalidOrDuplicatePorts(t *testing.T) {
	t.Parallel()

	newConfig := func() *conf.Server {
		return &conf.Server{
			Http: &conf.Server_HTTP{Addr: "0.0.0.0:8300"},
			Grpc: &conf.Server_GRPC{Addr: "0.0.0.0:9300"},
		}
	}

	if err := overrideDevServerPorts("./configs/dev/config.yaml", newConfig(), func(key string) string {
		if key == "DEV_HTTP_PORT" {
			return "not-a-port"
		}
		return "9300"
	}); err == nil || !strings.Contains(err.Error(), "DEV_HTTP_PORT") {
		t.Fatalf("expected invalid HTTP port error, got %v", err)
	}

	if err := overrideDevServerPorts("./configs/dev/config.yaml", newConfig(), func(string) string {
		return "8500"
	}); err == nil || !strings.Contains(err.Error(), "duplicates") {
		t.Fatalf("expected duplicate development port error, got %v", err)
	}
}

func productionConfigTestEnv(overrides map[string]string) func(string) string {
	values := map[string]string{
		"ERP_DEBUG_ENV":                    "prod",
		"ERP_DEBUG_SEED_ENABLED":           "false",
		"ERP_DEBUG_CLEANUP_ENABLED":        "false",
		"ERP_DEBUG_BUSINESS_CLEAR_ENABLED": "false",
	}
	for key, value := range overrides {
		values[key] = value
	}
	return func(key string) string {
		return values[key]
	}
}

func productionConfigTestJWTSecret() string {
	return strings.Repeat("unit", 8)
}

func TestApplyLocalAdminCredentialDefaults(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{Postgres: &conf.Data_Postgres{
		Dsn: "postgres://test_user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable",
	}}
	applyLocalAdminCredentialDefaults("./configs/dev/config.yaml", cfg, func(string) string { return "" })
	if cfg.Auth == nil || cfg.Auth.Admin == nil {
		t.Fatal("expected local admin config to be initialized")
	}
	if cfg.Auth.Admin.Username != admincredential.DefaultLocalUsername {
		t.Fatalf("username = %q, want local default", cfg.Auth.Admin.Username)
	}
	if cfg.Auth.Admin.Password != admincredential.DefaultLocalPassword {
		t.Fatal("password did not use the local default")
	}
}

func TestApplyLocalAdminCredentialDefaultsPreservesExplicitValues(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{
			Dsn: "postgres://test_user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable",
		},
		Auth: &conf.Data_Auth{Admin: &conf.Data_Auth_Admin{
			Username: "local-operator",
			Password: "explicit-local-password",
		}},
	}
	applyLocalAdminCredentialDefaults("./configs/dev/config.yaml", cfg, func(string) string { return "" })
	if cfg.Auth.Admin.Username != "local-operator" || cfg.Auth.Admin.Password != "explicit-local-password" {
		t.Fatalf("explicit local credentials were overwritten: %#v", cfg.Auth.Admin)
	}
}

func TestApplyLocalAdminCredentialDefaultsSkipsProduction(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{Postgres: &conf.Data_Postgres{
		Dsn: "postgres://test_user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable",
	}}
	applyLocalAdminCredentialDefaults("./configs/prod/config.yaml", cfg, productionConfigTestEnv(nil))
	if cfg.Auth != nil {
		t.Fatalf("production config unexpectedly received local defaults: %#v", cfg.Auth)
	}
}

func TestApplyLocalAdminCredentialDefaultsSkipsRemoteTarget(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{Postgres: &conf.Data_Postgres{
		Dsn: "postgres://postgres:secret@192.168.0.133:5435/plush_erp_uat_20260716_v5?sslmode=disable",
	}}
	applyLocalAdminCredentialDefaults("./configs/dev/config.yaml", cfg, func(string) string { return "" })
	if cfg.Auth != nil {
		t.Fatalf("remote target unexpectedly received local defaults: %#v", cfg.Auth)
	}
}

func TestApplyLocalAdminCredentialDefaultsSkipsProductionEnvironment(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{Postgres: &conf.Data_Postgres{
		Dsn: "postgres://test_user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable",
	}}
	applyLocalAdminCredentialDefaults("./configs/dev/config.yaml", cfg, productionConfigTestEnv(nil))
	if cfg.Auth != nil {
		t.Fatalf("production environment unexpectedly received local defaults: %#v", cfg.Auth)
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
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(nil)); err == nil {
		t.Fatal("expected production placeholder config to be rejected")
	}
}

func TestValidateProductionBootstrapConfigAllowsBlankBootstrapAdminPassword(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: ""},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(nil)); err != nil {
		t.Fatalf("expected production config with blank bootstrap admin password to pass, got %v", err)
	}
}

func TestValidateProductionBootstrapConfigRejectsLocalTestCustomerConfigFlag(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: ""},
		},
	}
	err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(map[string]string{
		biz.CustomerConfigLocalTestAllowEnv: "1",
	}))
	if err == nil || !strings.Contains(err.Error(), biz.CustomerConfigLocalTestAllowEnv) {
		t.Fatalf("expected production local-test flag to be rejected, got %v", err)
	}
}

func TestValidateCustomerConfigLocalTestDatabaseBindsSharedDevelopmentDatabase(t *testing.T) {
	t.Parallel()

	enabled := func(key string) string {
		if key == biz.CustomerConfigLocalTestAllowEnv {
			return "1"
		}
		return ""
	}
	valid := &conf.Data{Postgres: &conf.Data_Postgres{
		Dsn: "postgres://test_user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable",
	}}
	if err := validateCustomerConfigLocalTestDatabase(valid, enabled); err != nil {
		t.Fatalf("expected shared development database to pass, got %v", err)
	}

	target := &conf.Data{Postgres: &conf.Data_Postgres{
		Dsn: "postgres://postgres:secret@192.168.0.133:5435/plush_erp?sslmode=disable",
	}}
	if err := validateCustomerConfigLocalTestDatabase(target, enabled); err == nil {
		t.Fatal("expected target database to fail when local-test gate is enabled")
	}
	if err := validateCustomerConfigLocalTestDatabase(target, func(string) string { return "" }); err != nil {
		t.Fatalf("disabled local-test gate must leave target database handling to release config, got %v", err)
	}
}

func TestValidateProductionBootstrapConfigRequiresOnceFlagForAdminPassword(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: "runtime-admin-password"},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(nil)); err == nil {
		t.Fatal("expected production bootstrap admin password without once flag to be rejected")
	}
}

func TestValidateProductionBootstrapConfigRequiresAdminPasswordWhenOnceEnabled(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: ""},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(map[string]string{
		"BOOTSTRAP_ADMIN_ONCE": "true",
	})); err == nil {
		t.Fatal("expected BOOTSTRAP_ADMIN_ONCE=true without password to be rejected")
	}
}

func TestValidateProductionBootstrapConfigAllowsAdminPasswordWithOnceFlag(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: "runtime-admin-password"},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(map[string]string{
		"BOOTSTRAP_ADMIN_ONCE": "true",
	})); err != nil {
		t.Fatalf("expected once bootstrap admin password to pass, got %v", err)
	}
}

func TestValidateProductionBootstrapConfigRejectsKnownLocalAdminPassword(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Admin:     &conf.Data_Auth_Admin{Username: admincredential.DefaultLocalUsername, Password: admincredential.DefaultLocalPassword},
		},
	}
	err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(map[string]string{
		"BOOTSTRAP_ADMIN_ONCE": "true",
	}))
	if err == nil || !strings.Contains(err.Error(), "known local development default") {
		t.Fatalf("expected production local-default password rejection, got %v", err)
	}
}

func TestValidateProductionBootstrapConfigRejectsMockSMS(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Sms:       &conf.Data_Auth_SMS{Mode: "mock"},
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: ""},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(nil)); err == nil {
		t.Fatal("expected production mock sms mode to be rejected")
	}
}

func TestValidateProductionBootstrapConfigRejectsUnknownSMSMode(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Sms:       &conf.Data_Auth_SMS{Mode: "providre"},
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: ""},
		},
	}
	err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(nil))
	if err == nil || !strings.Contains(err.Error(), "must be disabled or provider") {
		t.Fatalf("expected unknown production sms mode to fail closed, got %v", err)
	}
}

func TestValidateProductionBootstrapConfigRequiresAliyunProviderSecrets(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Sms:       &conf.Data_Auth_SMS{Mode: "provider"},
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: ""},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(nil)); err == nil {
		t.Fatal("expected production sms provider without secrets to be rejected")
	}
}

func TestValidateProductionBootstrapConfigAllowsAliyunProviderSecrets(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Sms:       &conf.Data_Auth_SMS{Mode: "provider"},
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: ""},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(map[string]string{
		"APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID":     "LTAI-example",
		"APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET": "runtime-secret",
		"APP_AUTH_SMS_ALIYUN_SIGN_NAME":         "速通互联验证码",
		"APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE":     "100001",
	})); err != nil {
		t.Fatalf("expected production sms provider config to pass, got %v", err)
	}
}

func TestValidateProductionBootstrapConfigRequiresDebugMutationFlagsDisabled(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{
		Postgres: &conf.Data_Postgres{Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable"},
		Auth: &conf.Data_Auth{
			JwtSecret: productionConfigTestJWTSecret(),
			Sms:       &conf.Data_Auth_SMS{Mode: "disabled"},
			Admin:     &conf.Data_Auth_Admin{Username: "admin", Password: ""},
		},
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(map[string]string{
		"ERP_DEBUG_SEED_ENABLED": "true",
	})); err == nil {
		t.Fatal("expected production debug seed to be rejected")
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(map[string]string{
		"ERP_DEBUG_CLEANUP_ENABLED": "true",
	})); err == nil {
		t.Fatal("expected production debug cleanup to be rejected")
	}
	if err := validateProductionBootstrapConfig("./configs/prod/config.yaml", cfg, productionConfigTestEnv(map[string]string{
		"ERP_DEBUG_BUSINESS_CLEAR_ENABLED": "true",
	})); err == nil {
		t.Fatal("expected production business data clear to be rejected")
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

func TestValidateCustomerTrialConfigRuntimeDefaultsClosed(t *testing.T) {
	t.Parallel()

	getenv := func(key string) string {
		switch key {
		case customertrialconfig.AllowEnv:
			return "0"
		case customertrialconfig.DebugEnv:
			return "prod"
		default:
			return ""
		}
	}
	if err := validateCustomerTrialConfigRuntime(nil, getenv); err != nil {
		t.Fatalf("disabled customer trial config gate returned error: %v", err)
	}
}

func TestValidateCustomerTrialConfigRuntimeAcceptsRegisteredTarget(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{Postgres: &conf.Data_Postgres{
		Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp_uat_20260716_v5?sslmode=disable",
	}}
	getenv := func(key string) string {
		switch key {
		case customertrialconfig.AllowEnv:
			return "1"
		case customertrialconfig.TargetEnv:
			return customertrialconfig.ExpectedTarget
		case customertrialconfig.DebugEnv:
			return "prod"
		default:
			return ""
		}
	}
	if err := validateCustomerTrialConfigRuntime(cfg, getenv); err != nil {
		t.Fatalf("registered customer trial config gate returned error: %v", err)
	}
}

func TestValidateCustomerTrialConfigRuntimeRejectsPartialOptIn(t *testing.T) {
	t.Parallel()

	cfg := &conf.Data{Postgres: &conf.Data_Postgres{
		Dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp_uat_20260716_v5?sslmode=disable",
	}}
	getenv := func(key string) string {
		if key == customertrialconfig.TargetEnv {
			return customertrialconfig.ExpectedTarget
		}
		if key == customertrialconfig.DebugEnv {
			return "prod"
		}
		return ""
	}
	if err := validateCustomerTrialConfigRuntime(cfg, getenv); err == nil {
		t.Fatal("partial customer trial config opt-in was accepted")
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
