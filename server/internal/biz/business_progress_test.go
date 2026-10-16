package biz

import (
	"errors"
	"testing"
)

func TestBusinessProgressQueryValidation(t *testing.T) {
	valid := BusinessProgressQuery{Access: BusinessProgressAccess{Sales: true, Production: true}}
	for _, change := range []func(*BusinessProgressQuery){
		func(q *BusinessProgressQuery) { q.View = "unknown" }, func(q *BusinessProgressQuery) { q.Limit = 101 },
		func(q *BusinessProgressQuery) { q.Offset = -1 }, func(q *BusinessProgressQuery) { q.Risk = "x" },
		func(q *BusinessProgressQuery) { q.Scope = "x" }, func(q *BusinessProgressQuery) { q.DateFrom = "2026-02-30" },
		func(q *BusinessProgressQuery) { q.DateFrom = "2026-10-01"; q.DateTo = "2026-09-01" },
	} {
		q := valid
		change(&q)
		if _, err := normalizeBusinessProgressQuery(q); !errors.Is(err, ErrBadParam) {
			t.Fatalf("q=%+v err=%v", q, err)
		}
	}
	for _, q := range []BusinessProgressQuery{{}, {View: "production", Access: BusinessProgressAccess{Sales: true}}, {Access: BusinessProgressAccess{Sales: true, Tasks: true}}} {
		if _, err := normalizeBusinessProgressQuery(q); !errors.Is(err, ErrForbidden) {
			t.Fatalf("expected denied: %+v %v", q, err)
		}
	}
	q, err := normalizeBusinessProgressQuery(valid)
	if err != nil || q.Limit != 20 || q.Scope != "active" || q.SnapshotAt.IsZero() {
		t.Fatalf("normalized=%+v %v", q, err)
	}
}
