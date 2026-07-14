package service

import (
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func TestParseJSONRPCTimeRejectsInvalidCalendarDate(t *testing.T) {
	if _, ok := parseJSONRPCTime("2026-02-31"); ok {
		t.Fatal("expected invalid calendar date to be rejected")
	}
	if _, ok := parseJSONRPCTime("2026-13-01"); ok {
		t.Fatal("expected invalid month to be rejected")
	}
	if _, ok := parseJSONRPCTime("2026-00-10"); ok {
		t.Fatal("expected invalid zero month to be rejected")
	}
}

func TestGetOptionalJSONRPCDecimalStringPreservesPrecisionAndRejectsNumbers(t *testing.T) {
	const maxNetWeight = "99999999999999.999999"
	parsed, ok := getOptionalJSONRPCDecimalString(map[string]any{"weight": maxNetWeight}, "weight")
	if !ok || parsed == nil || !parsed.Equal(decimal.RequireFromString(maxNetWeight)) {
		t.Fatalf("max decimal string parse = %v ok=%t", parsed, ok)
	}

	for _, value := range []any{float64(0.425), float64(99999999999999.99), int(1)} {
		if parsed, ok := getOptionalJSONRPCDecimalString(map[string]any{"weight": value}, "weight"); ok || parsed != nil {
			t.Fatalf("JSON number %T(%v) parse = %v ok=%t, want nil false", value, value, parsed, ok)
		}
	}
	for _, tc := range []struct {
		name  string
		value string
	}{
		{name: "exponent", value: "1e-2147483648"},
		{name: "too-many-integer-digits", value: "100000000000000"},
		{name: "too-many-fraction-digits", value: "1.0000000"},
		{name: "long-coefficient", value: strings.Repeat("9", 1<<20)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if parsed, ok := getOptionalJSONRPCDecimalString(map[string]any{"weight": tc.value}, "weight"); ok || parsed != nil {
				t.Fatalf("bounded decimal parse = %v ok=%t, want nil false", parsed, ok)
			}
		})
	}
	for _, params := range []map[string]any{{}, {"weight": nil}} {
		if parsed, ok := getOptionalJSONRPCDecimalString(params, "weight"); !ok || parsed != nil {
			t.Fatalf("optional null/missing parse = %v ok=%t, want nil true", parsed, ok)
		}
	}
	quantity, ok := getRequiredJSONRPCNumeric20Scale6(map[string]any{"quantity": float64(1.25)}, "quantity")
	if !ok || !quantity.Equal(decimal.RequireFromString("1.25")) {
		t.Fatalf("shipment JSON-number quantity compatibility parse = %s ok=%t", quantity, ok)
	}
}

func TestRedactRPCParamsMasksIdentityAndReasonRecursively(t *testing.T) {
	redacted := redactRPCParams(map[string]any{
		"username": "operator",
		"phone":    "13800138000",
		"reason":   "员工离职",
		"nested": map[string]any{
			"status_reason": "临时停用",
			"items": []any{
				map[string]any{"contact_phone": "13900139000", "label": "保留"},
			},
		},
	}).(map[string]any)

	if redacted["username"] != "<redacted>" || redacted["phone"] != "<redacted>" || redacted["reason"] != "<redacted>" {
		t.Fatalf("top-level redaction = %#v", redacted)
	}
	nested := redacted["nested"].(map[string]any)
	if nested["status_reason"] != "<redacted>" {
		t.Fatalf("nested reason redaction = %#v", nested)
	}
	item := nested["items"].([]any)[0].(map[string]any)
	if item["contact_phone"] != "<redacted>" || item["label"] != "保留" {
		t.Fatalf("nested phone redaction = %#v", item)
	}
}
