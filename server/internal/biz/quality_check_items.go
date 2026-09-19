package biz

import (
	"strings"
	"unicode/utf8"

	"server/internal/core/qualitycheck"
)

// NormalizeQualityCheckItems validates operator evidence independently of the
// material category. Missing requirements and unfinished checks cannot pass.
func NormalizeQualityCheckItems(items []qualitycheck.Item, result string) ([]qualitycheck.Item, error) {
	if len(items) > 50 {
		return nil, ErrBadParam
	}
	if len(items) == 0 {
		return nil, nil
	}
	out := make([]qualitycheck.Item, len(items))
	checked, failed := 0, 0
	for i, item := range items {
		item.Name = strings.TrimSpace(item.Name)
		item.Requirement = strings.TrimSpace(item.Requirement)
		item.Observation = strings.TrimSpace(item.Observation)
		item.Note = strings.TrimSpace(item.Note)
		item.Result = strings.TrimSpace(item.Result)
		item.Scope = strings.TrimSpace(item.Scope)
		if item.Name == "" || utf8.RuneCountInString(item.Name) > 80 || utf8.RuneCountInString(item.Requirement) > 255 || utf8.RuneCountInString(item.Observation) > 255 || utf8.RuneCountInString(item.Note) > 500 {
			return nil, ErrBadParam
		}
		switch item.Result {
		case "PASS", "FAIL":
			if item.Requirement == "" || item.Observation == "" || (item.Scope != "FULL" && item.Scope != "SAMPLE") || (item.Scope == "SAMPLE" && item.Note == "") {
				return nil, ErrBadParam
			}
			checked++
			if item.Result == "FAIL" {
				failed++
			}
		case "NOT_APPLICABLE":
			if item.Note == "" {
				return nil, ErrBadParam
			}
			item.Scope = ""
		case "NOT_CHECKED":
			if result != QualityInspectionResultReject {
				return nil, ErrBadParam
			}
			item.Scope = ""
		default:
			return nil, ErrBadParam
		}
		out[i] = item
	}
	if checked == 0 || (result == QualityInspectionResultPass && failed > 0) || ((result == QualityInspectionResultReject || result == QualityInspectionResultConcession) && failed == 0) {
		return nil, ErrBadParam
	}
	return out, nil
}
