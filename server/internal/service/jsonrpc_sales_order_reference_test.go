package service

import (
	"reflect"
	"testing"
)

func TestSalesOrderReferenceIDFilter(t *testing.T) {
	filter, ok := salesOrderListFilterFromParams(map[string]any{"ids": []any{float64(17), float64(23)}, "lifecycle_scope": "all"})
	if !ok || !reflect.DeepEqual(filter.IDs, []int{17, 23}) || filter.LifecycleScope != "all" {
		t.Fatalf("selected source filter was lost: %+v %t", filter, ok)
	}
	for _, ids := range []any{[]any{float64(0)}, []any{float64(-1)}, []any{1.5}, "17,23"} {
		if _, ok := salesOrderListFilterFromParams(map[string]any{"ids": ids}); ok {
			t.Fatalf("invalid source IDs accepted: %#v", ids)
		}
	}
}
