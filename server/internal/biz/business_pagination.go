package biz

import "slices"

const (
	BusinessListDefaultLimit = 50
	BusinessListMaxLimit     = 500
)

// NormalizeBusinessListLimit applies the ordinary business-table limit. Detail
// selectors, dashboards and exports retain their own paging budgets.
func NormalizeBusinessListLimit(limit int) int {
	if limit <= 0 || limit > BusinessListMaxLimit {
		return BusinessListDefaultLimit
	}
	return limit
}

func validBusinessListSort(field, direction string, fields ...string) bool {
	if field == "" {
		return direction == ""
	}
	return slices.Contains(fields, field) && (direction == "" || direction == "asc" || direction == "desc")
}
