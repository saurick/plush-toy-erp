package manualacceptance

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

const SchemaVersion = "plush.manual-acceptance-contract/v6"

var (
	//go:embed contract.json
	contractJSON []byte
	codePattern  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$`)
	current      = mustParseContract(contractJSON)
)

type SourceNormalization struct {
	TrimWhitespace bool       `json:"trimWhitespace"`
	PreserveCase   bool       `json:"preserveCase"`
	DistinctPairs  [][]string `json:"distinctPairs"`
}

type Unit struct {
	Key         string `json:"key"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	SourceLabel string `json:"sourceLabel"`
	Precision   int    `json:"precision"`
}

type Warehouse struct {
	Key  string `json:"key"`
	Code string `json:"code"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type CustomerTrial133 struct {
	Target                 string `json:"target"`
	DatabaseName           string `json:"databaseName"`
	DatabaseLifecycle      string `json:"databaseLifecycle"`
	MinimumMigration       string `json:"minimumMigration"`
	ConfigRevision         string `json:"configRevision"`
	ConfigProductVersion   string `json:"configProductVersion"`
	PreviousConfigRevision string `json:"previousConfigRevision"`
}

type Contract struct {
	SchemaVersion       string              `json:"schemaVersion"`
	DatasetKey          string              `json:"datasetKey"`
	DataVersion         string              `json:"dataVersion"`
	RunID               string              `json:"runId"`
	AnchorDateUTC       string              `json:"anchorDateUtc"`
	VisiblePrefix       string              `json:"visiblePrefix"`
	SimulatedOnly       bool                `json:"simulatedOnly"`
	RealCustomerImport  bool                `json:"realCustomerImport"`
	SourceNormalization SourceNormalization `json:"sourceNormalization"`
	PrimaryUnitKey      string              `json:"primaryUnitKey"`
	Units               []Unit              `json:"units"`
	Warehouses          []Warehouse         `json:"warehouses"`
	CustomerTrial133    CustomerTrial133    `json:"customerTrial133"`
}

func Current() Contract {
	raw, err := json.Marshal(current)
	if err != nil {
		panic(fmt.Sprintf("marshal manual acceptance contract: %v", err))
	}
	return mustParseContract(raw)
}

func mustParseContract(raw []byte) Contract {
	var contract Contract
	if err := json.Unmarshal(raw, &contract); err != nil {
		panic(fmt.Sprintf("parse manual acceptance contract: %v", err))
	}
	if err := Validate(contract); err != nil {
		panic(fmt.Sprintf("invalid manual acceptance contract: %v", err))
	}
	return contract
}

func Validate(contract Contract) error {
	if contract.SchemaVersion != SchemaVersion ||
		contract.DatasetKey != "yoyoosun-manual-acceptance" ||
		contract.DataVersion != "2026.08.15-v6" ||
		contract.RunID != "20260815-V6" ||
		contract.AnchorDateUTC != "2026-08-15T12:00:00.000Z" ||
		contract.VisiblePrefix != "YS6" ||
		!contract.SimulatedOnly || contract.RealCustomerImport {
		return fmt.Errorf("dataset identity is not the registered V6 simulation")
	}
	if !contract.SourceNormalization.TrimWhitespace ||
		!contract.SourceNormalization.PreserveCase ||
		len(contract.SourceNormalization.DistinctPairs) < 5 {
		return fmt.Errorf("source normalization boundary is incomplete")
	}
	if len(contract.Units) != 11 || len(contract.Warehouses) != 4 {
		return fmt.Errorf("expected 11 units and four warehouses")
	}
	unitKeys := make(map[string]struct{}, len(contract.Units))
	unitCodes := make(map[string]struct{}, len(contract.Units))
	unitLabels := make(map[string]struct{}, len(contract.Units))
	for _, unit := range contract.Units {
		if !codePattern.MatchString(unit.Key) ||
			!strings.HasPrefix(unit.Code, contract.VisiblePrefix+"-DW-") ||
			strings.TrimSpace(unit.Name) == "" || unit.Name != unit.SourceLabel ||
			unit.Precision < 0 || unit.Precision > 6 {
			return fmt.Errorf("invalid unit %q", unit.Key)
		}
		if _, exists := unitKeys[unit.Key]; exists {
			return fmt.Errorf("duplicate unit key %q", unit.Key)
		}
		if _, exists := unitCodes[unit.Code]; exists {
			return fmt.Errorf("duplicate unit code %q", unit.Code)
		}
		if _, exists := unitLabels[unit.SourceLabel]; exists {
			return fmt.Errorf("duplicate source unit label %q", unit.SourceLabel)
		}
		unitKeys[unit.Key] = struct{}{}
		unitCodes[unit.Code] = struct{}{}
		unitLabels[unit.SourceLabel] = struct{}{}
	}
	if _, exists := unitKeys[contract.PrimaryUnitKey]; !exists {
		return fmt.Errorf("primary unit key is missing")
	}
	warehouseKeys := make(map[string]struct{}, len(contract.Warehouses))
	warehouseCodes := make(map[string]struct{}, len(contract.Warehouses))
	for _, warehouse := range contract.Warehouses {
		if !codePattern.MatchString(warehouse.Key) ||
			!strings.HasPrefix(warehouse.Code, contract.VisiblePrefix+"-CK-") ||
			strings.TrimSpace(warehouse.Name) == "" || strings.TrimSpace(warehouse.Type) == "" {
			return fmt.Errorf("invalid warehouse %q", warehouse.Key)
		}
		if _, exists := warehouseKeys[warehouse.Key]; exists {
			return fmt.Errorf("duplicate warehouse key %q", warehouse.Key)
		}
		if _, exists := warehouseCodes[warehouse.Code]; exists {
			return fmt.Errorf("duplicate warehouse code %q", warehouse.Code)
		}
		warehouseKeys[warehouse.Key] = struct{}{}
		warehouseCodes[warehouse.Code] = struct{}{}
	}
	target := contract.CustomerTrial133
	if target.Target != "customer-trial-133" ||
		target.DatabaseName != "plush_erp_uat_20260716_v5" ||
		target.DatabaseLifecycle != "long-lived-registered-target" ||
		!regexp.MustCompile(`^[0-9]{14}$`).MatchString(target.MinimumMigration) ||
		!strings.Contains(target.ConfigRevision, "package-v8") ||
		!strings.HasSuffix(target.ConfigProductVersion, contract.DataVersion) ||
		!strings.Contains(target.PreviousConfigRevision, "package-v7") {
		return fmt.Errorf("customer-trial-133 identity is incomplete")
	}
	return nil
}
