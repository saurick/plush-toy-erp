package biz

import (
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func TestNormalizeOutsourcingFactFromOrderCreateOwnsOnlyCommandFields(t *testing.T) {
	zeroLot := 0
	note := "  本次回货  "
	at := time.Date(2026, 7, 14, 9, 10, 11, 123456789, time.FixedZone("CST", 8*60*60))
	in, err := normalizeOutsourcingFactFromOrderCreate(&OutsourcingFactFromOrderCreate{
		FactNo:                 "  OUT-SOURCE-001  ",
		OutsourcingOrderID:     10,
		OutsourcingOrderItemID: 11,
		WarehouseID:            12,
		LotID:                  &zeroLot,
		Quantity:               decimal.RequireFromString("3.500000"),
		IdempotencyKey:         "  OUT-SOURCE-001  ",
		OccurredAt:             at,
		Note:                   &note,
	})
	if err != nil {
		t.Fatalf("normalize sourced outsourcing command: %v", err)
	}
	if in.FactNo != "OUT-SOURCE-001" || in.IdempotencyKey != "OUT-SOURCE-001" || in.LotID != nil || in.Note == nil || *in.Note != "本次回货" {
		t.Fatalf("unexpected normalized command: %#v", in)
	}
	if !in.OccurredAtSpecified || !in.OccurredAt.Equal(at.UTC().Truncate(time.Microsecond)) {
		t.Fatalf("occurred_at not normalized: %#v", in)
	}
}

func TestNormalizeOutsourcingFactFromOrderCreateRejectsInvalidSourceOrQuantity(t *testing.T) {
	valid := OutsourcingFactFromOrderCreate{
		FactNo:                 "OUT-SOURCE-VALID",
		OutsourcingOrderID:     10,
		OutsourcingOrderItemID: 11,
		WarehouseID:            12,
		Quantity:               decimal.NewFromInt(1),
		IdempotencyKey:         "OUT-SOURCE-VALID",
	}
	for _, mutate := range []func(*OutsourcingFactFromOrderCreate){
		func(in *OutsourcingFactFromOrderCreate) { in.OutsourcingOrderID = 0 },
		func(in *OutsourcingFactFromOrderCreate) { in.OutsourcingOrderItemID = 0 },
		func(in *OutsourcingFactFromOrderCreate) { in.WarehouseID = 0 },
		func(in *OutsourcingFactFromOrderCreate) { in.Quantity = decimal.Zero },
		func(in *OutsourcingFactFromOrderCreate) { in.IdempotencyKey = "" },
	} {
		candidate := valid
		mutate(&candidate)
		if _, err := normalizeOutsourcingFactFromOrderCreate(&candidate); !errors.Is(err, ErrBadParam) {
			t.Fatalf("invalid command error = %v, want ErrBadParam; command=%#v", err, candidate)
		}
	}
}
