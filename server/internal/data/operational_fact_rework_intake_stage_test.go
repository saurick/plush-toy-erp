package data

import (
	"testing"

	"server/internal/biz"

	"github.com/shopspring/decimal"
)

func TestDeriveReworkIntakeItemStageClosesOnlyAfterActualReshipment(t *testing.T) {
	quantity := decimal.NewFromInt(3)
	tests := []struct {
		name   string
		status string
		item   *biz.ReworkIntakeItem
		want   string
	}{
		{name: "draft", status: biz.ReworkIntakeStatusDraft, item: &biz.ReworkIntakeItem{Quantity: quantity}, want: biz.ReworkIntakeStageWaitingReceive},
		{name: "waiting rework", status: biz.ReworkIntakeStatusReceived, item: &biz.ReworkIntakeItem{Quantity: quantity}, want: biz.ReworkIntakeStageWaitingRework},
		{name: "reworking", status: biz.ReworkIntakeStatusReceived, item: &biz.ReworkIntakeItem{Quantity: quantity, ActiveReworkQuantity: quantity, CompletedQuantity: decimal.NewFromInt(2)}, want: biz.ReworkIntakeStageReworking},
		{name: "waiting reship", status: biz.ReworkIntakeStatusReceived, item: &biz.ReworkIntakeItem{Quantity: quantity, ActiveReworkQuantity: quantity, CompletedQuantity: quantity}, want: biz.ReworkIntakeStageWaitingReship},
		{name: "draft reshipment", status: biz.ReworkIntakeStatusReceived, item: &biz.ReworkIntakeItem{Quantity: quantity, ActiveReworkQuantity: quantity, CompletedQuantity: quantity, ActiveReshipmentQuantity: quantity}, want: biz.ReworkIntakeStageReshipped},
		{name: "actual reshipment", status: biz.ReworkIntakeStatusReceived, item: &biz.ReworkIntakeItem{Quantity: quantity, ActiveReworkQuantity: quantity, CompletedQuantity: quantity, ActiveReshipmentQuantity: quantity, ReshippedQuantity: quantity}, want: biz.ReworkIntakeStageClosed},
		{name: "cancelled", status: biz.ReworkIntakeStatusCancelled, item: &biz.ReworkIntakeItem{Quantity: quantity}, want: biz.ReworkIntakeStageClosed},
		{name: "reversed", status: biz.ReworkIntakeStatusReversed, item: &biz.ReworkIntakeItem{Quantity: quantity}, want: biz.ReworkIntakeStageClosed},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := deriveReworkIntakeItemStage(tt.status, tt.item); got != tt.want {
				t.Fatalf("stage=%s, want %s", got, tt.want)
			}
		})
	}
}
