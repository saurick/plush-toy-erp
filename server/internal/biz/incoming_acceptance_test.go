package biz

import (
	"errors"
	"testing"

	"github.com/shopspring/decimal"
	"server/internal/core/qualitycheck"
)

func TestIncomingAcceptanceCheckEvidence(t *testing.T) {
	base := qualitycheck.Item{Name: "自定义克重", Requirement: "约定克重", Observation: "测得与约定一致", Result: "PASS", Scope: "FULL"}
	for _, tt := range []struct {
		name, result string
		change       func(*qualitycheck.Item)
		valid        bool
	}{
		{"custom", "PASS", func(*qualitycheck.Item) {}, true},
		{"unchecked", "PASS", func(i *qualitycheck.Item) { i.Result = "NOT_CHECKED" }, false},
		{"missing requirement", "PASS", func(i *qualitycheck.Item) { i.Requirement = "" }, false},
		{"sample without coverage", "PASS", func(i *qualitycheck.Item) { i.Scope = "SAMPLE" }, false},
		{"sample evidence", "PASS", func(i *qualitycheck.Item) { i.Scope = "SAMPLE"; i.Note = "第 1、3、5 卷各抽一段" }, true},
		{"failed cannot pass", "PASS", func(i *qualitycheck.Item) { i.Result = "FAIL" }, false},
		{"reject", "REJECT", func(i *qualitycheck.Item) { i.Result = "FAIL" }, true},
		{"concession", "CONCESSION", func(i *qualitycheck.Item) { i.Result = "FAIL" }, true},
		{"no actual check", "PASS", func(i *qualitycheck.Item) { i.Result = "NOT_APPLICABLE"; i.Note = "无需该项" }, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			item := base
			tt.change(&item)
			_, err := NormalizeQualityCheckItems([]qualitycheck.Item{item}, tt.result)
			if (err == nil) != tt.valid {
				t.Fatalf("valid=%v err=%v", tt.valid, err)
			}
		})
	}
	failed := base
	failed.Result = "FAIL"
	unchecked := qualitycheck.Item{Name: "后续项目", Result: "NOT_CHECKED"}
	if _, err := NormalizeQualityCheckItems([]qualitycheck.Item{failed, unchecked}, "REJECT"); err != nil {
		t.Fatal(err)
	}
}

func TestIncomingAcceptanceExplicitQuantitiesAndIntent(t *testing.T) {
	base := PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: 1, ReceiptNo: "IQC-1", IdempotencyKey: "arrival-1", Lines: []PurchaseReceiptOrderLine{{PurchaseOrderItemID: 2, WarehouseID: 3, Quantity: decimal.RequireFromString("3.000001")}}}
	normalized, err := normalizePurchaseReceiptFromPurchaseOrderCreate(base)
	if err != nil {
		t.Fatal(err)
	}
	declared := decimal.RequireFromString("4")
	changed := base
	changed.Lines = append([]PurchaseReceiptOrderLine(nil), base.Lines...)
	changed.Lines[0].DeclaredQuantity = &declared
	other, err := normalizePurchaseReceiptFromPurchaseOrderCreate(changed)
	if err != nil || other.IdempotencyPayloadHash == normalized.IdempotencyPayloadHash {
		t.Fatalf("declared quantity must bind replay: %v", err)
	}
	for _, raw := range []string{"0", "-1", "0.0000001", "100000000000000"} {
		changed.Lines[0].Quantity = decimal.RequireFromString(raw)
		if _, err := normalizePurchaseReceiptFromPurchaseOrderCreate(changed); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	base.Lines = nil
	base.WarehouseID = 3
	if _, err := normalizePurchaseReceiptFromPurchaseOrderCreate(base); !errors.Is(err, ErrBadParam) {
		t.Fatalf("missing mode: %v", err)
	}
	base.AllRemaining = true
	if _, err := normalizePurchaseReceiptFromPurchaseOrderCreate(base); err != nil {
		t.Fatal(err)
	}
}
