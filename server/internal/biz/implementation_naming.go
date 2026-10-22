package biz

import (
	"fmt"
	"regexp"
)

var ErrNumberedImplementationStageLabel = fmt.Errorf("%w: numbered implementation stage labels are forbidden", ErrBadParam)

var (
	numberedPhaseLabelPattern = regexp.MustCompile(`(?i)\b` + `phase` + `[[:space:]_-]*[0-9]+[a-z0-9_-]*`)
	abbreviatedStagePattern   = regexp.MustCompile(`(?i)\bP[0-9]+(?:-[0-9]+)+\b|\bP[0-9]+[[:space:]]+(?:phase|stage|milestone|release|goal|chain|loader|handler|command)`)
	seedDataNatureCopyPattern = regexp.MustCompile(`模拟|演示|示例|样例|测试数据`)
)

// Seed values follow ordinary business language; provenance stays in tool receipts.
func ValidateSeedBusinessText(values ...string) error {
	if err := ValidateNoNumberedImplementationStageLabels(values...); err != nil {
		return err
	}
	for _, value := range values {
		if seedDataNatureCopyPattern.MatchString(value) {
			return fmt.Errorf("%w: seed business value contains data-nature copy", ErrBadParam)
		}
	}
	return nil
}

func ValidateSeedBusinessValues(value any) error {
	switch v := value.(type) {
	case string:
		return ValidateSeedBusinessText(v)
	case map[string]any:
		for key, item := range v {
			switch key {
			case "simulated_only", "real_customer_data", "trial_task", "evidence_class", "proves_process_runtime", "acceptance_scenario_key":
				return fmt.Errorf("%w: seed business payload contains a data-nature field", ErrBadParam)
			}
			if err := ValidateSeedBusinessValues(item); err != nil {
				return err
			}
		}
	case []any:
		for _, item := range v {
			if err := ValidateSeedBusinessValues(item); err != nil {
				return err
			}
		}
	}
	return nil
}

func containsNumberedImplementationStageLabel(values ...string) bool {
	for _, value := range values {
		if numberedPhaseLabelPattern.MatchString(value) || abbreviatedStagePattern.MatchString(value) {
			return true
		}
	}
	return false
}

func ValidateNoNumberedImplementationStageLabels(values ...string) error {
	if containsNumberedImplementationStageLabel(values...) {
		return ErrNumberedImplementationStageLabel
	}
	return nil
}

func valueContainsNumberedImplementationStageLabel(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case string:
		return containsNumberedImplementationStageLabel(v)
	case map[string]any:
		for key, item := range v {
			if containsNumberedImplementationStageLabel(key) ||
				valueContainsNumberedImplementationStageLabel(item) {
				return true
			}
		}
	case []any:
		for _, item := range v {
			if valueContainsNumberedImplementationStageLabel(item) {
				return true
			}
		}
	}
	return false
}
