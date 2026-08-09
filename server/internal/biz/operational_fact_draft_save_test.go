package biz

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func TestNormalizeProductionFactDraftSaveKeepsSourceIdentityOutOfOperatorFields(t *testing.T) {
	lotID := 7
	input := &ProductionFactDraftSave{
		ID: 11, ExpectedVersion: 2, WarehouseID: 3, LotID: &lotID,
		Quantity:   decimal.RequireFromString("2.500000"),
		OccurredAt: time.Date(2026, 8, 9, 10, 0, 0, 123456789, time.FixedZone("CST", 8*60*60)),
	}
	got, err := normalizeProductionFactDraftSave(input, ProductionFactMaterialIssue, ProductionOrderSourceType)
	if err != nil {
		t.Fatalf("normalize material issue draft: %v", err)
	}
	if got.FactType != ProductionFactMaterialIssue || got.SourceType != ProductionOrderSourceType {
		t.Fatalf("type-specific usecase identity was not applied: %#v", got)
	}
	if got.OccurredAt.Location() != time.UTC || got.OccurredAt.Nanosecond()%1000 != 0 {
		t.Fatalf("occurred_at was not canonicalized to UTC microseconds: %s", got.OccurredAt)
	}
	if got.FactNo != "" || got.NewLotNo != nil {
		t.Fatalf("material issue accepted unsupported operator fields: %#v", got)
	}
}

func TestNormalizeProductionReworkDraftRejectsWarehouseAndRequiresReason(t *testing.T) {
	valid := &ProductionFactDraftSave{
		ID: 12, ExpectedVersion: 1, FactNo: " RW-12 ",
		Quantity: decimal.NewFromInt(1), OccurredAt: time.Now(),
	}
	if _, err := normalizeProductionFactDraftSave(valid, ProductionFactRework, ProductionFactSourceType); err == nil {
		t.Fatal("rework draft without reason should be rejected")
	}
	reason := "返修车缝"
	valid.Note = &reason
	valid.WarehouseID = 9
	if _, err := normalizeProductionFactDraftSave(valid, ProductionFactRework, ProductionFactSourceType); err == nil {
		t.Fatal("rework draft must not accept a client-supplied warehouse")
	}
	valid.WarehouseID = 0
	got, err := normalizeProductionFactDraftSave(valid, ProductionFactRework, ProductionFactSourceType)
	if err != nil {
		t.Fatalf("normalize rework draft: %v", err)
	}
	if got.FactNo != "RW-12" || got.Note == nil || *got.Note != reason {
		t.Fatalf("rework operator fields were not normalized: %#v", got)
	}
}

func TestNormalizeOutsourcingDraftEnforcesInboundLotChoice(t *testing.T) {
	lotID := 5
	base := &OutsourcingFactDraftSave{
		ID: 4, ExpectedVersion: 3, WarehouseID: 2,
		Quantity: decimal.NewFromInt(6), OccurredAt: time.Now(),
	}
	if _, err := normalizeOutsourcingFactDraftSave(base, OutsourcingFactReturnReceipt); err == nil {
		t.Fatal("return receipt without a lot choice should be rejected")
	}
	base.LotID = &lotID
	if _, err := normalizeOutsourcingFactDraftSave(base, OutsourcingFactReturnReceipt); err != nil {
		t.Fatalf("existing return lot should be accepted: %v", err)
	}
	newLot := "OUT-RR-NEW"
	base.NewLotNo = &newLot
	if _, err := normalizeOutsourcingFactDraftSave(base, OutsourcingFactReturnReceipt); err == nil {
		t.Fatal("existing and new lot together should be rejected")
	}
}
