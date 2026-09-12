package biz

import (
	"errors"
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
