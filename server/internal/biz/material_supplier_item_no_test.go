package biz

import (
	"errors"
	"strings"
	"testing"
)

func TestMaterialSupplierItemNoNormalization(t *testing.T) {
	for _, value := range []string{"  示例织造AB-001#-02#米白  ", "客供", strings.Repeat("料", 255), "  "} {
		got, err := normalizeMaterialMutation(MaterialMutation{Code: "MAT-1", Name: "面料", DefaultUnitID: 1, SupplierItemNo: &value})
		if err != nil {
			t.Fatal(err)
		}
		if strings.TrimSpace(value) == "" {
			if got.SupplierItemNo != nil {
				t.Fatal("blank supplier item number must clear the field")
			}
		} else if got.SupplierItemNo == nil || *got.SupplierItemNo != strings.TrimSpace(value) {
			t.Fatalf("full supplier reference changed: %#v", got.SupplierItemNo)
		}
	}
	tooLong := strings.Repeat("料", 256)
	if _, err := normalizeMaterialMutation(MaterialMutation{Code: "MAT-1", Name: "面料", DefaultUnitID: 1, SupplierItemNo: &tooLong}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected invalid supplier item length, got %v", err)
	}
}
