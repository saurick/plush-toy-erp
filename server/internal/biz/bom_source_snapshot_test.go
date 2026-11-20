package biz

import (
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func syntheticBOMSourceSnapshot() map[string]any {
	return map[string]any{
		"file_name": "教学材料.xlsx", "sheet_name": "材料分析明细表", "row_number": 6,
		"material_code": "MAT-EXAMPLE", "material_name": "原表短毛绒", "supplier_item_no": "客供", "material_spec": "51\"", "color": "黑色",
		"quantity_value": "0.0123456789012345", "quantity_label": "单位用量", "quantity_format": "0.000",
		"total_value": "1.358024679135795", "total_label": "总用量 含损耗10%", "total_format": "0.00",
		"total_formula": "F6*G3*1.1", "loss_source": BOMLossSourceHeader, "loss_rate": "0.1", "loss_value": "", "order_quantity": "100",
	}
}

func TestBOMSourceSnapshotRetainsOriginalValuesAndCopiesInput(t *testing.T) {
	source := syntheticBOMSourceSnapshot()
	got, err := normalizeBOMSourceSnapshot(source)
	if err != nil || got["quantity_value"] != "0.0123456789012345" || got["total_value"] != "1.358024679135795" {
		t.Fatalf("source values were not retained: %v", err)
	}
	if got["material_name"] != "原表短毛绒" || got["supplier_item_no"] != "客供" || got["material_spec"] != "51\"" || got["color"] != "黑色" {
		t.Fatal("original material identity was not retained")
	}
	source["material_name"] = "覆盖后的名称"
	if got["material_name"] != "原表短毛绒" {
		t.Fatal("material evidence aliases the caller")
	}
	source["quantity_value"] = "9"
	if got["quantity_value"] != "0.0123456789012345" {
		t.Fatal("source snapshot aliases the caller map")
	}
	item := BOMItemUpdate{Quantity: decimal.RequireFromString("0.0123456789012345"), LossRate: decimal.RequireFromString("0.1"), SourceSnapshot: got}
	order := "100"
	if !BOMSourceTotalIsCurrent(item, &order) {
		t.Fatal("unchanged full-precision quantity must retain the reviewed source total")
	}
	order = "200"
	if BOMSourceTotalIsCurrent(item, &order) {
		t.Fatal("another order quantity must invalidate the source total")
	}
	order = "100"
	item.Quantity = decimal.RequireFromString("0.02")
	if BOMSourceTotalIsCurrent(item, &order) {
		t.Fatal("edited quantity must invalidate the source total")
	}
}

func TestBOMSourceSnapshotBoundsEvidenceAndRejectsInvalidShapes(t *testing.T) {
	for _, mutate := range []func(map[string]any){
		func(v map[string]any) { v["row_number"] = 0 },
		func(v map[string]any) { v["row_number"] = 1.2 },
		func(v map[string]any) { v["extra"] = "unregistered" },
		func(v map[string]any) { v["material_name"] = strings.Repeat("料", BOMSourceMaxTextCharacters+1) },
		func(v map[string]any) { v["material_spec"] = 51 },
		func(v map[string]any) { v["color"] = "黑\x00色" },
		func(v map[string]any) { v["quantity_value"] = strings.Repeat("1", BOMSourceMaxNumberCharacters+1) },
		func(v map[string]any) { v["loss_source"] = "unregistered" },
		func(v map[string]any) { v["total_value"] = map[string]any{} },
	} {
		v := syntheticBOMSourceSnapshot()
		mutate(v)
		if _, err := normalizeBOMSourceSnapshot(v); err == nil {
			t.Fatal("invalid source snapshot was accepted")
		}
	}
	for _, raw := range []string{"-1", "1e99", "未填写"} {
		v := syntheticBOMSourceSnapshot()
		v["quantity_value"] = raw
		got, err := normalizeBOMSourceSnapshot(v)
		if err != nil || got["quantity_value"] != raw {
			t.Fatal("a corrected business input must not erase its invalid source evidence")
		}
		order := "100"
		if BOMSourceTotalIsCurrent(BOMItemUpdate{Quantity: decimal.NewFromInt(1), SourceSnapshot: got}, &order) {
			t.Fatal("invalid source evidence was used as a calculation input")
		}
	}
}

func TestBOMDecimalPreservesFullExcelPrecisionWithoutRounding(t *testing.T) {
	for _, text := range []string{"0.0123456789012345", "0.00000049", "1e-324", "0.12345678901234567890123456789"} {
		got, ok := ParseBOMDecimal(text)
		if !ok || !got.Equal(decimal.RequireFromString(text)) {
			t.Fatalf("full BOM coefficient %q was changed", text)
		}
	}
	for _, text := range []string{"1e-325", "1e999999", "100000000000000", "NaN", "-1", " 1", strings.Repeat("1", BOMSourceMaxNumberCharacters+1)} {
		if _, ok := ParseBOMDecimal(text); ok {
			t.Fatalf("invalid or excessive BOM coefficient accepted: %q", text)
		}
	}
}
