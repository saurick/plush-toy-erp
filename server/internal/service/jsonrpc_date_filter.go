package service

import (
	"strings"
	"time"
)

// A date-only filter selects a business day; repositories receive UTC instants
// and never infer a day range from an otherwise exact midnight timestamp.
func getOptionalJSONRPCDateFilter(pm map[string]any, key string) (*time.Time, bool) {
	if raw, ok := pm[key].(string); ok {
		text := strings.TrimSpace(raw)
		if len(text) == len("2006-01-02") {
			day, err := time.ParseInLocation("2006-01-02", text, time.FixedZone("Asia/Shanghai", 8*3600))
			if err != nil {
				return nil, false
			}
			if key == "date_to" {
				day = day.AddDate(0, 0, 1).Add(-time.Microsecond)
			}
			day = day.UTC()
			return &day, true
		}
	}
	instant, ok := getOptionalJSONRPCTime(pm, key)
	if instant != nil {
		utc := instant.UTC()
		instant = &utc
	}
	return instant, ok
}
