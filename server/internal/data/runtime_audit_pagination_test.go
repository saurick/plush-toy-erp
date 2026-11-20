package data

import (
	"fmt"
	"testing"

	"server/internal/biz"
)

func TestRuntimeAuditPaginationSupports500RowsAndTail(t *testing.T) {
	f := newAdminManageAtomicFixture(t)
	for i := 0; i < 505; i++ {
		f.client.RuntimeAuditEvent.Create().SetEventType("pagination.read").SetEventKey(fmt.Sprint(i)).SaveX(f.ctx)
	}
	for _, tc := range []struct{ limit, offset, rows, effectiveLimit int }{
		{0, 0, 50, 50}, {200, 0, 200, 200}, {300, 0, 300, 300},
		{500, 0, 500, 500}, {500, 500, 5, 500}, {501, 0, 500, 500},
	} {
		result, err := f.repo.ListRuntimeAuditEvents(f.ctx, biz.RuntimeAuditEventListFilter{EventType: "pagination.read", Limit: tc.limit, Offset: tc.offset})
		if err != nil || len(result.Events) != tc.rows || result.Total != 505 || result.Limit != tc.effectiveLimit || result.Offset != tc.offset {
			t.Fatalf("limit=%d offset=%d: rows=%d total=%d limit=%d offset=%d err=%v", tc.limit, tc.offset, len(result.Events), result.Total, result.Limit, result.Offset, err)
		}
	}
}
