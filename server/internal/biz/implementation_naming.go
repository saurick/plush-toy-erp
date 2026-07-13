package biz

import (
	"fmt"
	"regexp"
)

var ErrNumberedImplementationStageLabel = fmt.Errorf("%w: numbered implementation stage labels are forbidden", ErrBadParam)

var (
	numberedPhaseLabelPattern = regexp.MustCompile(`(?i)\b` + `phase` + `[[:space:]_-]*[0-9]+[a-z0-9_-]*`)
	abbreviatedStagePattern   = regexp.MustCompile(`(?i)\bP[0-9]+(?:-[0-9]+)+\b|\bP[0-9]+[[:space:]]+(?:phase|stage|milestone|release|goal|chain|loader|handler|command)`)
)

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
