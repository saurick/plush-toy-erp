package biz

import (
	"strconv"
	"strings"
	"testing"

	"server/internal/core/qualitycheck"
	corevalue "server/internal/core/value"

	"github.com/shopspring/decimal"
)

func TestBusinessNoteUsecaseBoundaries(t *testing.T) {
	for _, length := range []int{corevalue.BusinessNoteMaxCharacters, corevalue.BusinessNoteMaxCharacters + 1} {
		note := strings.Repeat("注", length)
		valid := length <= corevalue.BusinessNoteMaxCharacters
		checks := map[string]func() error{
			"production order and line": func() error {
				route := ProductionWIPRoutePlushSewHandV1
				_, _, err := normalizeProductionOrderCommand(ProductionOrderDraft{
					OrderNo: "MO-NOTE", Note: &note,
					Items: []ProductionOrderDraftItem{{LineNo: 1, ProductID: 1, UnitID: 1, PlannedQuantity: decimal.NewFromInt(1), RouteCode: &route, Note: &note}},
				}, 1, "note-limit")
				return err
			},
			"packaging confirmation": func() error {
				version := "PKG-A"
				_, err := normalizeProductionWIPAction(ProductionWIPAction{
					Action:            ProductionWIPActionConfirmPackagingMaterial,
					ProductionOrderID: 1, ProductionOrderItemID: 1, ExpectedVersion: 1, ActorID: 1, IdempotencyKey: "note-limit",
					PackagingVersionSnapshot: &version, Note: &note,
				})
				return err
			},
			"purchase receipt line": func() error {
				_, err := normalizePurchaseReceiptFromPurchaseOrderCreate(PurchaseReceiptFromPurchaseOrderCreate{
					PurchaseOrderID: 1, ReceiptNo: "RC-NOTE", IdempotencyKey: "note-limit",
					Lines: []PurchaseReceiptOrderLine{{PurchaseOrderItemID: 1, WarehouseID: 1, Quantity: decimal.NewFromInt(1), Note: &note}},
				})
				return err
			},
			"quality check evidence": func() error {
				_, err := NormalizeQualityCheckItems([]qualitycheck.Item{{Name: "外观", Requirement: "按样板", Observation: "相符", Result: "PASS", Scope: "SAMPLE", Note: note}}, "PASS")
				return err
			},
		}
		for name, check := range checks {
			t.Run(name+"/"+strconv.Itoa(length), func(t *testing.T) {
				if err := check(); (err == nil) != valid {
					t.Fatalf("length=%d valid=%v error=%v", length, valid, err)
				}
			})
		}
	}
}
