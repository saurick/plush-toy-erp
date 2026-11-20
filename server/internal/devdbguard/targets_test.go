package devdbguard

import "testing"

func TestOrbRuntimeRequiresIndependentCapturedClusterIdentity(t *testing.T) {
	const dsn = "postgres://plush_dev_app:fixture@127.0.0.1:15432/plush_erp?sslmode=disable"
	const identity = "7999999999999999999"
	key := developmentTargets["orb"].SystemIdentifierEnv
	for _, invalid := range []string{"", "0", "invalid", CustomerConfigLocalTestSystemIdentifier} {
		t.Setenv(key, invalid)
		if RequireCustomerConfigLocalTestRuntime(dsn, "plush_erp", identity) == nil {
			t.Fatal("accepted invalid captured identity")
		}
	}
	t.Setenv(key, identity)
	if err := RequireCustomerConfigLocalTestRuntime(dsn, "plush_erp", identity); err != nil {
		t.Fatal(err)
	}
	if RequireCustomerConfigLocalTestRuntime(dsn, "plush_erp", "7888888888888888888") == nil {
		t.Fatal("accepted replacement cluster")
	}
	if RequireCustomerConfigLocalTestRuntime(dsn, "plush_erp_demo_v1", identity) == nil {
		t.Fatal("accepted another database")
	}
	for _, invalid := range []string{
		"postgres://u:p@127.0.0.1:5432/plush_erp?sslmode=disable",
		"postgres://u:p@127.0.0.1:15432/plush_erp_demo_v1?sslmode=disable",
		"postgres://u:p@127.0.0.1:15432/plush_erp?sslmode=disable&host=192.168.0.133&port=5432",
		"host=127.0.0.1,192.168.0.133 port=15432,5432 dbname=plush_erp sslmode=disable",
	} {
		if RequireCustomerConfigLocalTestDSN(invalid) == nil {
			t.Fatal("accepted unregistered or redirected target")
		}
	}
	if err := RequireCustomerConfigLocalTestRuntime("postgres://u:p@192.168.0.133:5432/plush_erp?sslmode=disable", "plush_erp", CustomerConfigLocalTestSystemIdentifier); err != nil {
		t.Fatal(err)
	}
}
