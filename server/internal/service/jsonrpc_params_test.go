package service

import "testing"

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
