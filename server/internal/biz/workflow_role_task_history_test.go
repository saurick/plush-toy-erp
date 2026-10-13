package biz

import (
	"testing"
	"time"
)

func TestWorkflowRoleTaskHistoryDateBounds(t *testing.T) {
	// UTC is still October 11; the business day is October 12.
	now := time.Date(2026, 10, 11, 16, 5, 0, 0, time.UTC)
	for _, tt := range []struct{ period, start string }{
		{"today", "2026-10-11T16:00:00Z"},
		{"7d", "2026-10-05T16:00:00Z"},
		{"30d", "2026-09-12T16:00:00Z"},
	} {
		t.Run(tt.period, func(t *testing.T) {
			from, before, err := WorkflowRoleTaskHistoryDateBounds(tt.period, "", "", now)
			if err != nil || from.UTC().Format(time.RFC3339) != tt.start || before.UTC().Format(time.RFC3339) != "2026-10-12T16:00:00Z" {
				t.Fatalf("incorrect business date bounds: %v, %v, %v", from, before, err)
			}
		})
	}
	from, before, err := WorkflowRoleTaskHistoryDateBounds("custom", "2024-02-29", "2024-02-29", now)
	if err != nil || before.Sub(*from) != 24*time.Hour {
		t.Fatalf("one-day leap range: %v %v %v", from, before, err)
	}
	from, before, err = WorkflowRoleTaskHistoryDateBounds("", "", "", now)
	if err != nil || from != nil || before != nil {
		t.Fatal("all time must include undated records")
	}
	for _, values := range [][3]string{
		{"custom", "2026-02-29", "2026-03-01"}, {"custom", "2026-10-12", "2026-10-11"},
		{"custom", "", "2026-10-12"}, {"custom", "2026-1-01", "2026-10-12"},
		{"today", "2026-10-12", ""}, {"", "", "2026-10-12"}, {"last7", "", ""},
	} {
		if _, _, err := WorkflowRoleTaskHistoryDateBounds(values[0], values[1], values[2], now); err == nil {
			t.Fatalf("accepted invalid dates: %v", values)
		}
	}
}
