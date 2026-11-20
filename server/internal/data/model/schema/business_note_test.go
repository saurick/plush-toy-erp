package schema

import (
	"fmt"
	"strings"
	"testing"

	"entgo.io/ent"
	corevalue "server/internal/core/value"
)

func TestBusinessNoteFieldsCountCharactersInsteadOfBytes(t *testing.T) {
	models := []ent.Interface{
		BOMHeader{},
		BOMItem{},
		BusinessAttachment{},
		Contact{},
		Customer{},
		EngineeringMaterialRequest{},
		FinanceFact{},
		InventoryOperationItem{},
		InventoryTxn{},
		OutsourcingFact{},
		OutsourcingOrder{},
		OutsourcingOrderItem{},
		Process{},
		ProductionFact{},
		ProductionOrder{},
		ProductionOrderItem{},
		ProductionPackagingConfirmation{},
		PurchaseOrder{},
		PurchaseOrderItem{},
		PurchaseReceipt{},
		PurchaseReceiptAdjustment{},
		PurchaseReceiptAdjustmentItem{},
		PurchaseReceiptItem{},
		PurchaseReturn{},
		PurchaseReturnItem{},
		QualityInspection{},
		SalesOrder{},
		SalesOrderItem{},
		Shipment{},
		ShipmentItem{},
		StockReservation{},
		Supplier{},
	}
	names := map[string]bool{"note": true, "decision_note": true, "price_condition_note": true, "review_note": true, "boss_review_note": true, "finance_review_note": true, "finance_release_note": true}
	for _, model := range models {
		for _, f := range model.Fields() {
			desc := f.Descriptor()
			if !names[desc.Name] {
				continue
			}
			t.Run(fmt.Sprintf("%T/%s", model, desc.Name), func(t *testing.T) {
				if len(desc.Validators) == 0 {
					t.Fatal("missing note validation")
				}
				for _, text := range []string{"", "包装要求\n分两批交付", strings.Repeat("注", corevalue.BusinessNoteMaxCharacters), strings.Repeat("a", corevalue.BusinessNoteMaxCharacters), strings.Repeat("😀", corevalue.BusinessNoteMaxCharacters)} {
					for _, raw := range desc.Validators {
						validate, ok := raw.(func(string) error)
						if !ok {
							t.Fatal("unexpected note validator")
						}
						if err := validate(text); err != nil {
							t.Fatalf("valid note rejected: %v", err)
						}
					}
				}
				for _, text := range []string{strings.Repeat("注", corevalue.BusinessNoteMaxCharacters+1), strings.Repeat("a", corevalue.BusinessNoteMaxCharacters+1)} {
					rejected := false
					for _, raw := range desc.Validators {
						rejected = rejected || raw.(func(string) error)(text) != nil
					}
					if !rejected {
						t.Fatal("accepted oversized note")
					}
				}
			})
		}
	}
}
