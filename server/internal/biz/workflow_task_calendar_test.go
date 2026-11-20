package biz

import "testing"

func TestWorkflowTaskCalendarBounds(t *testing.T) {
	for _, selection := range []string{"2024-02-29", "overdue", "undated"} {
		q := &WorkflowTaskCalendarQuery{Month: "2024-02", Selection: selection}
		from, before, err := q.Bounds()
		if err != nil || from.UTC().Format("2006-01-02 15:04") != "2024-01-31 16:00" || before.UTC().Format("2006-01-02 15:04") != "2024-02-29 16:00" {
			t.Fatalf("business month: %v %v %v", from, before, err)
		}
	}
	for _, q := range []*WorkflowTaskCalendarQuery{nil, {}, {Month: "2026-02", Selection: "2026-02-29"}, {Month: "2026-02", Selection: "2026-03-01"}, {Month: "2026-2", Selection: "overdue"}, {Month: "2026-02", Selection: "overdue", Offset: -1}, {Month: "9999-12", Selection: "undated"}} {
		if _, _, err := q.Bounds(); err == nil {
			t.Fatalf("accepted invalid query: %+v", q)
		}
	}
}
