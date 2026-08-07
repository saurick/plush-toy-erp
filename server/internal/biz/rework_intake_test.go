package biz

import (
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func TestNormalizeReworkIntakeCreateCanonicalizesIntentWithoutMutatingCaller(t *testing.T) {
	note := "  拆线返工  "
	input := ReworkIntakeCreate{
		IntakeNo:         "  HCF-001  ",
		SourceShipmentID: 7,
		Reason:           "  客户产品回厂返工  ",
		IdempotencyKey:   "  rework-intake-001  ",
		Items: []ReworkIntakeItemCreate{
			{SourceShipmentItemID: 22, TargetProductionOrderItemID: 202, Quantity: decimal.RequireFromString("2.500000"), Note: &note},
			{SourceShipmentItemID: 11, TargetProductionOrderItemID: 101, Quantity: decimal.RequireFromString("1")},
		},
	}

	normalized, hash, err := normalizeReworkIntakeCreate(input)
	if err != nil {
		t.Fatalf("normalize rework intake: %v", err)
	}
	if input.Items[0].SourceShipmentItemID != 22 {
		t.Fatalf("caller item order was mutated: %#v", input.Items)
	}
	if normalized.IntakeNo != "HCF-001" || normalized.Reason != "客户产品回厂返工" || normalized.IdempotencyKey != "rework-intake-001" {
		t.Fatalf("header was not canonicalized: %#v", normalized)
	}
	if len(hash) != 64 || normalized.Items[0].SourceShipmentItemID != 11 || normalized.Items[1].Note == nil || *normalized.Items[1].Note != "拆线返工" {
		t.Fatalf("items/hash were not canonicalized: items=%#v hash=%q", normalized.Items, hash)
	}

	equivalent := input
	equivalent.Items = []ReworkIntakeItemCreate{input.Items[1], input.Items[0]}
	equivalentNormalized, equivalentHash, err := normalizeReworkIntakeCreate(equivalent)
	if err != nil {
		t.Fatalf("normalize equivalent rework intake: %v", err)
	}
	if equivalentHash != hash || equivalentNormalized.Items[0].SourceShipmentItemID != 11 {
		t.Fatalf("equivalent item order changed intent: first=%q second=%q", hash, equivalentHash)
	}
}

func TestNormalizeReworkIntakeCreateRejectsInvalidOrDuplicateQuantityIntent(t *testing.T) {
	base := ReworkIntakeCreate{
		IntakeNo: "HCF-002", SourceShipmentID: 7, Reason: "返工", IdempotencyKey: "rework-intake-002",
		Items: []ReworkIntakeItemCreate{{SourceShipmentItemID: 11, TargetProductionOrderItemID: 101, Quantity: decimal.NewFromInt(1)}},
	}
	for _, quantity := range []decimal.Decimal{
		decimal.Zero,
		decimal.RequireFromString("1.0000001"),
		decimal.RequireFromString("100000000000000"),
	} {
		candidate := base
		candidate.Items = append([]ReworkIntakeItemCreate(nil), base.Items...)
		candidate.Items[0].Quantity = quantity
		if _, _, err := normalizeReworkIntakeCreate(candidate); !errors.Is(err, ErrBadParam) {
			t.Fatalf("quantity %s error=%v, want ErrBadParam", quantity, err)
		}
	}
	duplicate := base
	duplicate.Items = append(append([]ReworkIntakeItemCreate(nil), base.Items...), ReworkIntakeItemCreate{
		SourceShipmentItemID: 11, TargetProductionOrderItemID: 202, Quantity: decimal.NewFromInt(1),
	})
	if _, _, err := normalizeReworkIntakeCreate(duplicate); !errors.Is(err, ErrBadParam) {
		t.Fatalf("duplicate source line error=%v, want ErrBadParam", err)
	}
}

func TestNormalizeProductionReworkFromIntakeCreateCanonicalizesTime(t *testing.T) {
	local := time.Date(2026, 8, 5, 10, 20, 30, 987654321, time.FixedZone("UTC+8", 8*60*60))
	normalized, err := normalizeProductionReworkFromIntakeCreate(ProductionReworkFromIntakeCreate{
		FactNo: "  FG-001  ", ReworkIntakeItemID: 11, Quantity: decimal.RequireFromString("1.25"),
		IdempotencyKey: "  production-rework-001  ", OccurredAt: local, OccurredAtSpecified: true, Reason: "  拆线返工  ",
	})
	if err != nil {
		t.Fatalf("normalize production rework: %v", err)
	}
	if normalized.FactNo != "FG-001" || normalized.IdempotencyKey != "production-rework-001" || normalized.Reason != "拆线返工" {
		t.Fatalf("production rework strings were not canonicalized: %#v", normalized)
	}
	want := local.UTC().Truncate(time.Microsecond)
	if !normalized.OccurredAt.Equal(want) || normalized.OccurredAt.Location() != time.UTC {
		t.Fatalf("occurred_at=%s, want %s UTC", normalized.OccurredAt, want)
	}
}

func TestNormalizeReworkReshipmentCreateSortsAndSeparatesCallerIntent(t *testing.T) {
	planned := time.Date(2026, 8, 6, 9, 0, 0, 123456789, time.FixedZone("UTC+8", 8*60*60))
	input := ReworkReshipmentCreate{
		ShipmentNo: "  BF-001  ", ReworkIntakeID: 9, IdempotencyKey: "  reship-001  ", PlannedShipAt: &planned,
		Items: []ReworkReshipmentItemCreate{
			{ReworkCompletionFactID: 22, Quantity: decimal.NewFromInt(2)},
			{ReworkCompletionFactID: 11, Quantity: decimal.NewFromInt(1)},
		},
	}
	normalized, err := normalizeReworkReshipmentCreate(input)
	if err != nil {
		t.Fatalf("normalize rework reshipment: %v", err)
	}
	if input.Items[0].ReworkCompletionFactID != 22 || normalized.Items[0].ReworkCompletionFactID != 11 {
		t.Fatalf("reshipment sort mutated caller or failed: input=%#v normalized=%#v", input.Items, normalized.Items)
	}
	if normalized.PlannedShipAt == nil || normalized.PlannedShipAt.Location() != time.UTC || normalized.PlannedShipAt.Nanosecond()%1000 != 0 {
		t.Fatalf("planned_ship_at was not canonicalized: %#v", normalized.PlannedShipAt)
	}
}
