package biz

import (
	"slices"
	"testing"
)

func TestWorkflowDocumentCatalogIdentityAndNames(t *testing.T) {
	labels, sources := map[string]bool{}, map[string]bool{}
	for _, document := range workflowTaskDiscoveryCatalog.Documents {
		if document.Key == "" || document.Label == "" || document.SectionKey == "" || !slices.Contains(document.Sources, document.Key) || labels[document.Label] {
			t.Fatalf("ambiguous document definition: %+v", document)
		}
		labels[document.Label] = true
		for _, source := range document.Sources {
			if sources[source] || WorkflowDocumentTypeKey(source) != document.Key {
				t.Fatalf("source has multiple document identities: %s", source)
			}
			sources[source] = true
		}
	}
	for source, label := range map[string]string{
		"production-progress": "生产记录", "production_fact": "生产记录",
		"purchase_rejection_disposition": "采购拒收处置单",
		"engineering_material_request":   "工程用料申请", "finance_payment": "收付款单",
		"inventory_operation": "库存作业单", "production_packaging_confirmation": "包装确认记录",
	} {
		document, ok := WorkflowDocumentTypeFor(source)
		if !ok || document.Label != label {
			t.Fatalf("source %s has wrong name: %+v", source, document)
		}
	}
	if WorkflowDocumentTypeKey("not-registered") != "not-registered" {
		t.Fatal("unknown sources must not be relabeled as an unrelated business record")
	}
	for kind, spec := range fulfillmentTaskSpecs {
		if _, ok := WorkflowDocumentTypeFor(spec.SourceType); !ok {
			t.Fatalf("source task %s has no registered document type: %s", kind, spec.SourceType)
		}
	}
}

func TestWorkflowDocumentSectionsKeepSourceOwnership(t *testing.T) {
	production := WorkflowDocumentSectionSourceTypes("production")
	for _, source := range []string{"production_fact", "production-progress", "production_wip_batch", "production_order", "production_exception_decision", "production_packaging_confirmation"} {
		if !slices.Contains(production, source) {
			t.Fatalf("production section omitted %s", source)
		}
	}
	if slices.Contains(production, "purchase_receipt") || slices.Contains(production, "inventory_operation") {
		t.Fatal("handling an inbound task does not change its document ownership")
	}
	for _, fixture := range []struct {
		section, source string
		valid           bool
	}{
		{"production", "", true}, {"production", "production-progress", true},
		{"purchase", "purchase_receipt", true}, {"warehouse", "inventory_operation", true},
		{"production", "purchase_receipt", false}, {"unknown", "", false},
	} {
		_, err := normalizeWorkflowTaskBoardQuery(WorkflowTaskBoardQuery{SourceSection: fixture.section, SourceType: fixture.source})
		if (err == nil) != fixture.valid {
			t.Fatalf("section=%q source=%q valid=%t err=%v", fixture.section, fixture.source, fixture.valid, err)
		}
	}
}
