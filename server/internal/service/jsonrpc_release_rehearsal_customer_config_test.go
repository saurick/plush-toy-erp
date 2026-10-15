package service

import (
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/conf"
)

func releaseRehearsalCustomerConfigEnv(overrides map[string]string) func(string) string {
	values := map[string]string{
		biz.CustomerConfigReleaseRehearsalAllowEnv:            "1",
		biz.CustomerConfigReleaseRehearsalIDEnv:               "release_95d64e23_20260729",
		biz.CustomerConfigReleaseRehearsalSystemIdentifierEnv: "1234567890123456789",
	}
	for key, value := range overrides {
		values[key] = value
	}
	return func(key string) string {
		return values[key]
	}
}

func TestResolveCustomerConfigLocalTestGateAllowsExactReleaseRehearsal(t *testing.T) {
	t.Parallel()

	data := &conf.Data{Postgres: &conf.Data_Postgres{
		Dsn: "postgres://postgres:secret@postgres:5432/plush_erp_release_release_95d64e23_20260729?sslmode=disable",
	}}
	enabled, err := resolveCustomerConfigLocalTestGate(data, releaseRehearsalCustomerConfigEnv(nil))
	if err != nil || !enabled {
		t.Fatalf("resolveCustomerConfigLocalTestGate() = %v, %v", enabled, err)
	}
}

func TestResolveCustomerConfigLocalTestGateRejectsReleaseRehearsalEscape(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name      string
		dsn       string
		overrides map[string]string
		want      string
	}{
		{
			name: "target database",
			dsn:  "postgres://postgres:secret@192.168.0.133:5435/plush_erp?sslmode=disable",
			want: "release rehearsal gate",
		},
		{
			name: "missing live cluster identity",
			dsn:  "postgres://postgres:secret@postgres:5432/plush_erp_release_release_95d64e23_20260729?sslmode=disable",
			overrides: map[string]string{
				biz.CustomerConfigReleaseRehearsalSystemIdentifierEnv: "",
			},
			want: biz.CustomerConfigReleaseRehearsalSystemIdentifierEnv,
		},
		{
			name: "local gate cannot escape into rehearsal database",
			dsn:  "postgres://postgres:secret@postgres:5432/plush_erp_release_release_95d64e23_20260729?sslmode=disable",
			overrides: map[string]string{
				biz.CustomerConfigLocalTestAllowEnv: "1",
			},
			want: "customer config local-test gate",
		},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			data := &conf.Data{Postgres: &conf.Data_Postgres{Dsn: test.dsn}}
			enabled, err := resolveCustomerConfigLocalTestGate(
				data,
				releaseRehearsalCustomerConfigEnv(test.overrides),
			)
			if err == nil || enabled || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("resolveCustomerConfigLocalTestGate() = %v, %v, want %q", enabled, err, test.want)
			}
		})
	}
}
