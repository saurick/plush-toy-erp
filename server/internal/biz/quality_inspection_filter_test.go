package biz

import (
	"errors"
	"testing"
)

func TestNormalizeQualityInspectionFilterDefaultsToIncomingMaterialBoundary(t *testing.T) {
	filter, err := normalizeQualityInspectionFilter(QualityInspectionFilter{Limit: 20})
	if err != nil {
		t.Fatalf("normalizeQualityInspectionFilter error = %v", err)
	}
	if filter.SourceType != QualityInspectionSourcePurchaseReceipt ||
		filter.InspectionType != QualityInspectionTypeIncoming ||
		filter.SubjectType != QualityInspectionSubjectMaterial {
		t.Fatalf("incoming boundary = %#v", filter)
	}
}

func TestNormalizeQualityInspectionFilterRejectsProductionWIPFields(t *testing.T) {
	for _, filter := range []QualityInspectionFilter{
		{ProductionWIPBatchID: 1},
		{GateCode: ProductionWIPQualityGateShell},
		{SourceType: QualityInspectionSourceProductionWIP},
		{InspectionType: QualityInspectionTypeProductionStage},
		{SubjectType: QualityInspectionSubjectWIP},
	} {
		if _, err := normalizeQualityInspectionFilter(filter); !errors.Is(err, ErrBadParam) {
			t.Fatalf("filter %#v error = %v, want ErrBadParam", filter, err)
		}
	}
}
