package biz

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestSalesOrderImportSourceValidation(t *testing.T) {
	valid := func() map[string]any {
		return map[string]any{
			"file_name": "订单.xlsx", "file_sha256": strings.Repeat("a", 64), "sheet_name": "订单", "row_number": 5,
			"cells": []any{map[string]any{"column": 6, "label": "产品名称", "value": "模拟产品"}},
		}
	}
	if result, err := normalizeSalesOrderImportSource(valid()); err != nil || result["row_number"] != float64(5) {
		t.Fatalf("valid source: %v %v", result, err)
	}
	for _, patch := range []map[string]any{
		{"file_name": "/private/订单.xlsx"}, {"file_sha256": "invalid"}, {"row_number": 1.5}, {"row_number": 0}, {"cells": []any{}}, {"unknown": "value"},
		{"cells": []any{map[string]any{"column": 6, "label": "产品名称", "value": strings.Repeat("长", 2049)}}},
		{"image_files": []string{"../image.png"}},
	} {
		input := valid()
		for key, value := range patch {
			input[key] = value
		}
		if _, err := normalizeSalesOrderImportSource(input); !errors.Is(err, ErrBadParam) {
			t.Fatalf("accepted invalid source: %v", patch)
		}
	}
	if result, err := normalizeSalesOrderImportSource(nil); err != nil || result != nil {
		t.Fatal("manual orders must not require import evidence")
	}
}

func TestSalesOrderImportSourceMergedRows(t *testing.T) {
	for _, span := range [][]int{{4, 6}, {5, 6}, {4, 5}, nil, {4}, {4, 5, 6}, {0, 5}, {5, 5}, {6, 4}, {6, 7}, {1, 4}, {4, 5001}} {
		cell := map[string]any{"column": 20, "label": "收款说明", "value": "收5000定金", "merged_rows": span}
		source := map[string]any{
			"file_name": "订单.xlsx", "file_sha256": strings.Repeat("a", 64), "sheet_name": "订单", "row_number": 5,
			"cells": []any{cell},
		}
		result, err := normalizeSalesOrderImportSource(source)
		valid := span == nil || (len(span) == 2 && span[0] >= 1 && span[0] < span[1] && span[0] <= 5 && span[1] >= 5 && span[1] <= 5000)
		if !valid {
			if !errors.Is(err, ErrBadParam) {
				t.Fatalf("accepted invalid merge range %v", span)
			}
			continue
		}
		if err != nil {
			t.Fatalf("rejected valid merge range %v: %v", span, err)
		}
		normalized := result["cells"].([]any)[0].(map[string]any)
		if span != nil && !reflect.DeepEqual(normalized["merged_rows"], []any{float64(span[0]), float64(span[1])}) {
			t.Fatalf("lost original merge range: %v", result)
		}
	}
}
