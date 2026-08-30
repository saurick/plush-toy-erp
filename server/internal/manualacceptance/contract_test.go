package manualacceptance

import "testing"

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
		contract.CustomerTrial133.PreviousConfigProductVersion != "customer-trial-133-test-2026.07.16-v5" ||
		contract.CustomerTrial133.PreviousDatasetVersion != "2026.07.16-v5" {
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
