package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestBusinessQuickCountsExceptionHandlingProjection(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "quick_counts_exceptions")
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	for i, key := range []string{"SUBMITTED:PENDING", "APPROVED:PENDING", "APPROVED:APPLIED", "APPROVED:REVERSED", "REJECTED:PENDING", "CANCELLED:PENDING"} {
		parts := strings.Split(key, ":")
		no := fmt.Sprintf("QUICK-EX-%d", i)
		create := client.ProductionExceptionDecision.Create().SetDecisionNo(no).SetDecisionType(biz.ProductionExceptionScrap).SetProductionOrderID(1).SetProductionOrderItemID(1).
			SetProductionWipBatchID(i + 1).SetQualityInspectionID(i + 1).SetRequestedQuantity(decimal.NewFromInt(1)).SetReason("模拟统计").SetIdempotencyKey(no).SetIdempotencyPayloadHash(strings.Repeat("a", 64)).SetRequestedBy(1).SetStatus(parts[0]).SetExecutionStatus(parts[1])
		if parts[1] != "PENDING" {
			create.SetExecutedAt(time.Now()).SetExecutedBy(1).SetExecutionReason("模拟办理")
		}
		if parts[1] == "REVERSED" {
			create.SetReversedAt(time.Now()).SetReversedBy(1).SetReverseReason("模拟冲正")
		}
		create.SaveX(ctx)
	}
	filter := biz.ProductionExceptionFilter{HandlingStatus: "APPROVED:PENDING", ProductionOrderID: 1, Limit: 1, Offset: 100}
	got, err := uc.CountProductionExceptionsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"SUBMITTED": 1, "APPROVED:PENDING": 1, "APPROVED:APPLIED": 1, "APPROVED:REVERSED": 1, "REJECTED": 1, "CANCELLED": 1})
	filter.Offset = 0
	rows, total, err := uc.ListProductionExceptions(ctx, filter)
	if err != nil || total != 1 || len(rows) != 1 || rows[0].Status != "APPROVED" || rows[0].ExecutionStatus != "PENDING" {
		t.Fatalf("handling result=%v total=%d err=%v", rows, total, err)
	}
	for _, key := range []string{"SUBMITTED", "APPROVED:PENDING", "APPROVED:APPLIED", "APPROVED:REVERSED", "REJECTED", "CANCELLED"} {
		rows, total, err := uc.ListProductionExceptions(ctx, biz.ProductionExceptionFilter{HandlingStatus: key, ProductionOrderID: 1, Limit: 1})
		if err != nil || total != 1 || len(rows) != 1 {
			t.Fatalf("handling %s rows=%v total=%d err=%v", key, rows, total, err)
		}
		actual := rows[0].Status
		if actual == biz.ProductionExceptionApproved {
			actual += ":" + rows[0].ExecutionStatus
		}
		if actual != key {
			t.Fatalf("handling %s returned %s", key, actual)
		}
	}
	for _, excluded := range []biz.ProductionExceptionFilter{
		{HandlingStatus: "APPROVED:PENDING", ProductionOrderID: 2},
		{HandlingStatus: "APPROVED:PENDING", ProductionOrderID: 1, DecisionType: biz.ProductionExceptionOverIssue},
	} {
		got, err = uc.CountProductionExceptionsByStatus(ctx, excluded)
		assertBusinessCounts(t, got, err, map[string]int{})
		rows, total, err := uc.ListProductionExceptions(ctx, excluded)
		if err != nil || total != 0 || len(rows) != 0 {
			t.Fatalf("excluded scope rows=%v total=%d err=%v", rows, total, err)
		}
	}
	cleared := biz.ProductionExceptionFilter{ProductionOrderID: 1, Limit: 1, Offset: 1}
	rows, total, err = uc.ListProductionExceptions(ctx, cleared)
	if err != nil || total != 6 || len(rows) != 1 {
		t.Fatalf("cleared handling rows=%v total=%d err=%v", rows, total, err)
	}
	filter.Status = "APPROVED"
	got, err = uc.CountProductionExceptionsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"APPROVED:PENDING": 1, "APPROVED:APPLIED": 1, "APPROVED:REVERSED": 1})
	filter.ExecutionStatus = "APPLIED"
	got, err = uc.CountProductionExceptionsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"APPROVED:APPLIED": 1})
	filter.HandlingStatus = "APPROVED:unknown"
	if _, err := uc.CountProductionExceptionsByStatus(ctx, filter); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("invalid handling error=%v", err)
	}
}
