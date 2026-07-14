package service

import (
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

const (
	jsonRPCNumeric20Scale6MaxIntegerDigits  = 14
	jsonRPCNumeric20Scale6MaxFractionDigits = 6
	jsonRPCNumeric20Scale6MaxTextBytes      = 1 + jsonRPCNumeric20Scale6MaxIntegerDigits + 1 + jsonRPCNumeric20Scale6MaxFractionDigits
)

func getMap(pm map[string]any, key string) map[string]any {
	raw, ok := pm[key]
	if !ok || raw == nil {
		return map[string]any{}
	}
	if value, ok := raw.(map[string]any); ok {
		return value
	}
	return map[string]any{}
}

func getOptionalPositiveIntPtr(pm map[string]any, key string) *int {
	raw, ok := pm[key]
	if !ok || raw == nil {
		return nil
	}
	value := getInt(pm, key, 0)
	if value <= 0 {
		return nil
	}
	return &value
}

func getRequiredJSONRPCPositiveInt(pm map[string]any, key string) (int, bool) {
	const maxJSONSafeInteger = float64(9007199254740991)
	raw, ok := pm[key]
	if !ok || raw == nil {
		return 0, false
	}
	switch value := raw.(type) {
	case float64:
		if value <= 0 || value > maxJSONSafeInteger || value != float64(int64(value)) {
			return 0, false
		}
		return int(value), true
	case int:
		return value, value > 0
	default:
		return 0, false
	}
}

func getRequiredJSONRPCTime(pm map[string]any, key string) (time.Time, bool) {
	if _, ok := pm[key]; !ok {
		return time.Time{}, false
	}
	return parseJSONRPCTime(pm[key])
}

func getOptionalJSONRPCTime(pm map[string]any, key string) (*time.Time, bool) {
	raw, ok := pm[key]
	if !ok || raw == nil {
		return nil, true
	}
	parsed, ok := parseJSONRPCTime(raw)
	if !ok {
		return nil, false
	}
	return &parsed, true
}

func parseJSONRPCTime(raw any) (time.Time, bool) {
	switch value := raw.(type) {
	case float64:
		if value <= 0 {
			return time.Time{}, false
		}
		return time.Unix(int64(value), 0).UTC(), true
	case int:
		if value <= 0 {
			return time.Time{}, false
		}
		return time.Unix(int64(value), 0).UTC(), true
	case string:
		text := strings.TrimSpace(value)
		if text == "" {
			return time.Time{}, false
		}
		for _, layout := range []string{time.RFC3339, "2006-01-02"} {
			if parsed, err := time.Parse(layout, text); err == nil {
				return parsed, true
			}
		}
		return time.Time{}, false
	default:
		return time.Time{}, false
	}
}

func getRequiredJSONRPCDecimal(pm map[string]any, key string) (decimal.Decimal, bool) {
	if _, ok := pm[key]; !ok {
		return decimal.Zero, false
	}
	return parseJSONRPCDecimal(pm[key])
}

// getRequiredJSONRPCNumeric20Scale6 bounds string inputs before constructing a
// decimal. JSON numbers retain the existing compatibility contract and are
// subsequently validated by the owning usecase.
func getRequiredJSONRPCNumeric20Scale6(pm map[string]any, key string) (decimal.Decimal, bool) {
	raw, ok := pm[key]
	if !ok {
		return decimal.Zero, false
	}
	if value, ok := raw.(string); ok {
		return parseJSONRPCNumeric20Scale6String(value)
	}
	return parseJSONRPCDecimal(raw)
}

func getOptionalJSONRPCDecimal(pm map[string]any, key string) (*decimal.Decimal, bool) {
	raw, ok := pm[key]
	if !ok || raw == nil {
		return nil, true
	}
	parsed, ok := parseJSONRPCDecimal(raw)
	if !ok {
		return nil, false
	}
	return &parsed, true
}

// getOptionalJSONRPCDecimalString preserves decimal precision for fields whose
// public contract is string-or-null. It deliberately rejects JSON numbers.
func getOptionalJSONRPCDecimalString(pm map[string]any, key string) (*decimal.Decimal, bool) {
	raw, ok := pm[key]
	if !ok || raw == nil {
		return nil, true
	}
	text, ok := raw.(string)
	if !ok {
		return nil, false
	}
	parsed, ok := parseJSONRPCNumeric20Scale6String(text)
	if !ok {
		return nil, false
	}
	return &parsed, true
}

func parseJSONRPCNumeric20Scale6String(value string) (decimal.Decimal, bool) {
	if value == "" || len(value) > jsonRPCNumeric20Scale6MaxTextBytes {
		return decimal.Zero, false
	}
	text := strings.TrimSpace(value)
	if text == "" {
		return decimal.Zero, false
	}

	index := 0
	if text[index] == '-' {
		index++
		if index == len(text) {
			return decimal.Zero, false
		}
	}
	integerDigits := 0
	for index < len(text) && text[index] >= '0' && text[index] <= '9' {
		integerDigits++
		index++
	}
	if integerDigits == 0 || integerDigits > jsonRPCNumeric20Scale6MaxIntegerDigits {
		return decimal.Zero, false
	}
	if index < len(text) {
		if text[index] != '.' {
			return decimal.Zero, false
		}
		index++
		fractionDigits := 0
		for index < len(text) && text[index] >= '0' && text[index] <= '9' {
			fractionDigits++
			index++
		}
		if fractionDigits == 0 || fractionDigits > jsonRPCNumeric20Scale6MaxFractionDigits {
			return decimal.Zero, false
		}
	}
	if index != len(text) {
		return decimal.Zero, false
	}
	parsed, err := decimal.NewFromString(text)
	return parsed, err == nil
}

func parseJSONRPCDecimal(raw any) (decimal.Decimal, bool) {
	switch value := raw.(type) {
	case float64:
		return decimal.NewFromFloat(value), true
	case int:
		return decimal.NewFromInt(int64(value)), true
	case string:
		text := strings.TrimSpace(value)
		if text == "" {
			return decimal.Zero, false
		}
		parsed, err := decimal.NewFromString(text)
		return parsed, err == nil
	default:
		return decimal.Zero, false
	}
}

func optionalStringValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func optionalIntValue(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func optionalDecimalString(value *decimal.Decimal) any {
	if value == nil {
		return nil
	}
	return value.String()
}

func optionalTimeUnix(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.Unix()
}

func normalizedLimit(pm map[string]any) int {
	limit := getInt(pm, "limit", 50)
	if limit <= 0 || limit > 200 {
		return 50
	}
	return limit
}

func normalizedOffset(pm map[string]any) int {
	offset := getInt(pm, "offset", 0)
	if offset < 0 {
		return 0
	}
	return offset
}
