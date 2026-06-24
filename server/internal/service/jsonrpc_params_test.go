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
