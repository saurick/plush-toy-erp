package data

import (
	"os"
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestOutsourcingDraftSaveImmutableSourceComparisonRejectsDrift(t *testing.T) {
	sourceType := biz.OutsourcingOrderSourceType
	sourceID := 12
	sourceLineID := 13
	supplierID := 14
	supplierName := "加工厂 A"
	row := &ent.OutsourcingFact{
		FactNo: "OUT-MI-12", FactType: biz.OutsourcingFactMaterialIssue,
		SubjectType: biz.InventorySubjectMaterial, SubjectID: 15, UnitID: 16,
		SupplierID: &supplierID, SupplierName: &supplierName,
		SourceType: &sourceType, SourceID: &sourceID, SourceLineID: &sourceLineID,
		IdempotencyKey: "out-mi:12:13",
	}
	mutation := &biz.OperationalFactMutation{
		FactNo: row.FactNo, FactType: row.FactType,
		SubjectType: row.SubjectType, SubjectID: row.SubjectID, UnitID: row.UnitID,
		SupplierID: row.SupplierID, SupplierName: row.SupplierName,
		SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID,
		IdempotencyKey: row.IdempotencyKey,
	}
	if !outsourcingFactImmutableSourceMatches(row, mutation) {
		t.Fatal("matching immutable source identity was rejected")
	}
	driftedLineID := 99
	mutation.SourceLineID = &driftedLineID
	if outsourcingFactImmutableSourceMatches(row, mutation) {
		t.Fatal("source line drift must be rejected")
	}
}

func TestProductionAndOutsourcingDraftSaveSQLIsDraftOnlyCAS(t *testing.T) {
	for _, path := range []string{
		"operational_fact_production_repo.go",
		"operational_fact_outsourcing_repo.go",
	} {
		source, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		text := string(source)
		if !strings.Contains(text, "version = version + 1") ||
			!strings.Contains(text, "AND status = 'DRAFT' AND version = %s") ||
			!strings.Contains(text, "ErrOperationalFactVersionConflict") {
			t.Fatalf("%s draft update lost status/version CAS", path)
		}
	}
}

func TestDraftSaveRepositoriesReResolveServerOwnedSources(t *testing.T) {
	productionSource, err := os.ReadFile("operational_fact_production_repo.go")
	if err != nil {
		t.Fatal(err)
	}
	outsourcingSource, err := os.ReadFile("operational_fact_outsourcing_repo.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{
		"validateProductionOrderMaterialIssueFactRowSource",
		"validateProductionOrderFactSource",
		"resolveProductionReworkRowSource",
	} {
		if !strings.Contains(string(productionSource), required) {
			t.Errorf("production draft save no longer revalidates %s", required)
		}
	}
	if !strings.Contains(string(outsourcingSource), "resolveOutsourcingOrderFactMutation") ||
		!strings.Contains(string(outsourcingSource), "outsourcingFactImmutableSourceMatches") {
		t.Fatal("outsourcing draft save no longer re-resolves and compares source identity")
	}
}
