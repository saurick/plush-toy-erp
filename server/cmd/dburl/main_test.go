package main

import (
	"strings"
	"testing"
)

func TestSafePostgresTargetOmitsCredentialsAndUnrelatedQueryValues(t *testing.T) {
	target, err := safePostgresTarget("postgres://fixture-user:private-secret@127.0.0.1:55432/plush_erp_acceptance?sslmode=require&application_name=private-marker")
	if err != nil {
		t.Fatalf("safePostgresTarget() error = %v", err)
	}
	if target != "host=127.0.0.1 port=55432 database=plush_erp_acceptance sslmode=require" {
		t.Fatalf("safePostgresTarget() = %q", target)
	}
	for _, secret := range []string{"fixture-user", "private-secret", "private-marker"} {
		if strings.Contains(target, secret) {
			t.Fatalf("safe target leaked %q: %q", secret, target)
		}
	}
}

func TestSafePostgresTargetUsesNonSecretDefaults(t *testing.T) {
	target, err := safePostgresTarget("postgresql://user:secret@db.internal/plush_erp")
	if err != nil {
		t.Fatalf("safePostgresTarget() error = %v", err)
	}
	if target != "host=db.internal port=5432 database=plush_erp sslmode=disable" {
		t.Fatalf("safePostgresTarget() = %q", target)
	}
}

func TestSafePostgresTargetRejectsLogInjectionThroughSSLMode(t *testing.T) {
	_, err := safePostgresTarget("postgres://user:secret@db.internal/plush_erp?sslmode=require%0Aprivate-marker")
	if err == nil {
		t.Fatal("safePostgresTarget() accepted a non-canonical sslmode")
	}
}
