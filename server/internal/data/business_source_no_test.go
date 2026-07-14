package data

import (
	"testing"

	"server/internal/biz"
)

func TestBusinessSourceNumberRecognizesSupportedSourcesAndLeavesUnknownBlank(t *testing.T) {
	sourceID := 7
	for _, sourceType := range []string{
		biz.ProductionOrderSourceType,
		biz.ProductionFactSourceType,
		biz.OutsourcingOrderSourceType,
		biz.OutsourcingFactSourceType,
		biz.ShipmentSourceType,
		biz.PurchaseReceiptSourceType,
		biz.FinanceFactSourceType,
	} {
		sourceType := sourceType
		key, ok := resolvableBusinessSourceKey(&sourceType, &sourceID)
		if !ok || key.sourceType != sourceType || key.sourceID != sourceID {
			t.Fatalf("supported source key %q = %#v, ok=%t", sourceType, key, ok)
		}
	}

	unknownType := "UNKNOWN_SOURCE"
	if sourceNo := businessSourceNo(map[businessSourceKey]string{}, &unknownType, &sourceID); sourceNo != nil {
		t.Fatalf("unknown source number = %#v, want nil", sourceNo)
	}
	if sourceNo := businessSourceNo(map[businessSourceKey]string{}, nil, &sourceID); sourceNo != nil {
		t.Fatalf("missing source type number = %#v, want nil", sourceNo)
	}
}
