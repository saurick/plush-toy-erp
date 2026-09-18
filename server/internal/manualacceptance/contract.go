package manualacceptance

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	//go:embed contract.json
	contractJSON          []byte
	codePattern           = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$`)
	schemaVersionPattern  = regexp.MustCompile(`^plush\.manual-acceptance-contract/v([1-9][0-9]*)$`)
	datasetVersionPattern = regexp.MustCompile(
		`^([0-9]{4})\.([0-9]{2})\.([0-9]{2})-v([1-9][0-9]*)$`,
	)
	configRevisionPattern = regexp.MustCompile(
		`^yoyoosun-customer-trial-133-package-v([1-9][0-9]*)\.runtime-manifest-v1$`,
	)
	migrationVersionPattern = regexp.MustCompile(`^[0-9]{14}$`)
	current                 = mustParseContract(contractJSON)
)

type datasetIdentity struct {
	compactDate string
	isoDate     string
	sequence    int
}

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
	Target                       string `json:"target"`
	DeploymentTarget             string `json:"deploymentTarget"`
	DatabaseName                 string `json:"databaseName"`
	DatabaseLifecycle            string `json:"databaseLifecycle"`
	MinimumMigration             string `json:"minimumMigration"`
	ConfigRevision               string `json:"configRevision"`
	ConfigProductVersion         string `json:"configProductVersion"`
	PreviousConfigRevision       string `json:"previousConfigRevision"`
	PreviousConfigProductVersion string `json:"previousConfigProductVersion"`
	PreviousDatasetVersion       string `json:"previousDatasetVersion"`
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

func parseDatasetVersion(value string) (datasetIdentity, bool) {
	match := datasetVersionPattern.FindStringSubmatch(value)
	if match == nil {
		return datasetIdentity{}, false
	}
	isoDate := fmt.Sprintf("%s-%s-%s", match[1], match[2], match[3])
	parsedDate, err := time.Parse("2006-01-02", isoDate)
	if err != nil || parsedDate.Format("2006-01-02") != isoDate {
		return datasetIdentity{}, false
	}
	sequence, err := strconv.Atoi(match[4])
	if err != nil {
		return datasetIdentity{}, false
	}
	return datasetIdentity{
		compactDate: match[1] + match[2] + match[3],
		isoDate:     isoDate,
		sequence:    sequence,
	}, true
}

func parseConfigPackage(value string) (int, bool) {
	match := configRevisionPattern.FindStringSubmatch(value)
	if match == nil {
		return 0, false
	}
	sequence, err := strconv.Atoi(match[1])
	return sequence, err == nil
}

func Validate(contract Contract) error {
	schemaMatch := schemaVersionPattern.FindStringSubmatch(contract.SchemaVersion)
	dataset, datasetOK := parseDatasetVersion(contract.DataVersion)
	if schemaMatch == nil || !datasetOK ||
		contract.DatasetKey != "yoyoosun-manual-acceptance" ||
		contract.RunID != fmt.Sprintf("%s-V%d", dataset.compactDate, dataset.sequence) ||
		contract.AnchorDateUTC != dataset.isoDate+"T12:00:00.000Z" ||
		contract.VisiblePrefix != fmt.Sprintf("YS%d", dataset.sequence) ||
		!contract.SimulatedOnly || contract.RealCustomerImport {
		return fmt.Errorf("dataset identity is not a registered simulation contract")
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
	previousDataset, previousDatasetOK := parseDatasetVersion(target.PreviousDatasetVersion)
	configPackage, configPackageOK := parseConfigPackage(target.ConfigRevision)
	previousConfigPackage, previousConfigPackageOK := parseConfigPackage(target.PreviousConfigRevision)
	if target.Target != "customer-trial-133" ||
		target.DeploymentTarget != "demo-133" ||
		target.DatabaseName != "plush_erp_demo_v1" ||
		target.DatabaseLifecycle != "long-lived-registered-target" ||
		!migrationVersionPattern.MatchString(target.MinimumMigration) ||
		!configPackageOK || !previousConfigPackageOK ||
		configPackage <= previousConfigPackage ||
		target.ConfigProductVersion != "customer-trial-133-test-"+contract.DataVersion ||
		!previousDatasetOK || previousDataset.sequence >= dataset.sequence ||
		previousDataset.isoDate > dataset.isoDate ||
		target.PreviousConfigProductVersion != "customer-trial-133-test-"+target.PreviousDatasetVersion {
		return fmt.Errorf("customer-trial-133 identity is incomplete")
	}
	return nil
}
