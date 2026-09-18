package manualacceptance

import (
	"strings"
	"testing"
)

func TestCurrentContractIsExactAndDefensivelyCopied(t *testing.T) {
	contract := Current()
	if err := Validate(contract); err != nil {
		t.Fatalf("Validate(Current()) error = %v", err)
	}
	if len(contract.Units) != 11 || contract.PrimaryUnitKey != "piece" {
		t.Fatalf("unexpected unit contract: %#v", contract)
	}
	if contract.CustomerTrial133.DatabaseLifecycle != "long-lived-registered-target" ||
		contract.CustomerTrial133.DeploymentTarget != "demo-133" ||
		contract.CustomerTrial133.DatabaseName != "plush_erp_demo_v1" ||
		contract.CustomerTrial133.PreviousConfigProductVersion != "customer-trial-133-test-2026.08.15-v6" ||
		contract.CustomerTrial133.PreviousDatasetVersion != "2026.08.15-v6" {
		t.Fatalf("unexpected stable customer-trial database identity: %#v", contract.CustomerTrial133)
	}
	contract.Units[0].Name = "changed"
	if got := Current().Units[0].Name; got != "件" {
		t.Fatalf("Current() returned mutable shared state: %q", got)
	}
	labels := map[string]bool{}
	for _, unit := range Current().Units {
		labels[unit.SourceLabel] = true
	}
	for _, label := range []string{"Y", "套", "PCS", "对", "片", "件", "码", "个", "条", "kg", "块"} {
		if !labels[label] {
			t.Fatalf("source unit %q is missing", label)
		}
	}
}

func TestValidateRejectsMergedOrRealCustomerDataset(t *testing.T) {
	merged := Current()
	merged.Units[1].SourceLabel = merged.Units[6].SourceLabel
	if err := Validate(merged); err == nil {
		t.Fatal("Validate() accepted merged Y and 码 labels")
	}
	realImport := Current()
	realImport.RealCustomerImport = true
	if err := Validate(realImport); err == nil {
		t.Fatal("Validate() accepted a real-customer-import marker")
	}
	previousDrift := Current()
	previousDrift.CustomerTrial133.PreviousDatasetVersion = previousDrift.DataVersion
	if err := Validate(previousDrift); err == nil {
		t.Fatal("Validate() accepted a drifted previous activation identity")
	}
}

func TestValidateAcceptsCoherentNextVersionWithoutCodeChanges(t *testing.T) {
	next := Current()
	next.DataVersion = "2026.10.01-v8"
	next.RunID = "20261001-V8"
	next.AnchorDateUTC = "2026-10-01T12:00:00.000Z"
	next.VisiblePrefix = "YS8"
	for index := range next.Units {
		next.Units[index].Code = strings.Replace(next.Units[index].Code, "YS7-", "YS8-", 1)
	}
	for index := range next.Warehouses {
		next.Warehouses[index].Code = strings.Replace(next.Warehouses[index].Code, "YS7-", "YS8-", 1)
	}
	next.CustomerTrial133.ConfigRevision = "yoyoosun-customer-trial-133-package-v10.runtime-manifest-v1"
	next.CustomerTrial133.ConfigProductVersion = "customer-trial-133-test-2026.10.01-v8"
	next.CustomerTrial133.PreviousConfigRevision = "yoyoosun-customer-trial-133-package-v9.runtime-manifest-v1"
	next.CustomerTrial133.PreviousConfigProductVersion = "customer-trial-133-test-2026.09.16-v7"
	next.CustomerTrial133.PreviousDatasetVersion = "2026.09.16-v7"

	if err := Validate(next); err != nil {
		t.Fatalf("Validate(coherent next version) error = %v", err)
	}
	if next.SchemaVersion != Current().SchemaVersion {
		t.Fatal("data changes must not bump the structural contract version")
	}
	next.DataVersion = "2026.09.16-v8"
	next.RunID = "20260916-V8"
	next.AnchorDateUTC = "2026-09-16T12:00:00.000Z"
	next.CustomerTrial133.ConfigProductVersion = "customer-trial-133-test-2026.09.16-v8"
	next.CustomerTrial133.ConfigRevision = "yoyoosun-customer-trial-133-package-v12.runtime-manifest-v1"
	if err := Validate(next); err != nil {
		t.Fatalf("Validate(same-day batch with unchanged schema) error = %v", err)
	}
	next.CustomerTrial133.PreviousDatasetVersion = "2026.08.15-v6"
	next.CustomerTrial133.PreviousConfigProductVersion = "customer-trial-133-test-2026.08.15-v6"
	if err := Validate(next); err != nil {
		t.Fatalf("Validate(explicit nonconsecutive previous batch) error = %v", err)
	}
	next.RunID = "20261001-V7"
	if err := Validate(next); err == nil {
		t.Fatal("Validate() accepted a run id that drifted from dataVersion")
	}
}
