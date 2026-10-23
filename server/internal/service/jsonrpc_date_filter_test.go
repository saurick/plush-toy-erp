package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestBusinessDateFilterBoundaries(t *testing.T) {
	t.Run("stored_UTC_business_day_and_explicit_midnight", func(t *testing.T) {
		ctx := context.Background()
		data, _ := openInventoryRepoTestData(t, "business_date_filter")
		j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionPurchaseReceiptRead))
		start := time.Date(2026, 10, 22, 16, 0, 0, 0, time.UTC)
		for index, delta := range []time.Duration{-time.Microsecond, 0, 8 * time.Hour, 9 * time.Hour, 24*time.Hour - time.Microsecond, 24 * time.Hour} {
			if _, err := j.inventoryUC.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: fmt.Sprintf("DATE-BOUNDARY-%d", index), SupplierName: "模拟供应方", ReceivedAt: start.Add(delta)}); err != nil {
				t.Fatal(err)
			}
		}
		for _, query := range []struct {
			from, to string
			count    int
		}{
			{"2026-10-23", "2026-10-23", 4},
			{"2026-10-23T00:00:00Z", "2026-10-23T00:00:00Z", 1},
			{"2026-10-23T08:00:00+08:00", "2026-10-23T08:00:00+08:00", 1},
		} {
			_, result, err := j.handlePurchase(workflowJSONRPCAdminContext(), "list_purchase_receipts", "date-boundary", mustJSONRPCStruct(t, map[string]any{"date_from": query.from, "date_to": query.to}))
			if err != nil || result == nil || result.Code != errcode.OK.Code || jsonRPCInt(t, result.Data.AsMap(), "total") != query.count {
				t.Fatalf("range %s .. %s returned %v, err=%v", query.from, query.to, result, err)
			}
		}
	})
	for _, day := range []string{"2026-10-23", "2026-12-31", "2028-02-29"} {
		from, ok := getOptionalJSONRPCDateFilter(map[string]any{"date_from": day}, "date_from")
		if !ok || from == nil {
			t.Fatalf("rejected %s", day)
		}
		zone := time.FixedZone("Asia/Shanghai", 8*3600)
		start, _ := time.ParseInLocation("2006-01-02", day, zone)
		if !from.Equal(start) || from.Location() != time.UTC || from.In(zone).Hour() != 0 {
			t.Fatalf("wrong start %v", from)
		}
		if got := from.AddDate(0, 0, 1).Sub(*from); got != 24*time.Hour {
			t.Fatalf("wrong business day %s", got)
		}
		to, ok := getOptionalJSONRPCDateFilter(map[string]any{"date_to": day}, "date_to")
		if !ok || to == nil || !to.Equal(start.AddDate(0, 0, 1).Add(-time.Microsecond)) {
			t.Fatalf("wrong end %v", to)
		}
		for _, hour := range []int{0, 1, 8, 23} {
			candidate := start.Add(time.Duration(hour) * time.Hour)
			if candidate.Before(*from) || candidate.After(*to) {
				t.Fatalf("business hour %d excluded", hour)
			}
		}
		if !start.AddDate(0, 0, 1).After(*to) || !start.Add(-time.Microsecond).Before(*from) {
			t.Fatal("neighbor business day leaked")
		}
	}
	instant := "2026-10-23T12:34:56Z"
	got, ok := getOptionalJSONRPCDateFilter(map[string]any{"date_to": instant}, "date_to")
	if !ok || got.Format(time.RFC3339) != instant {
		t.Fatalf("instant changed %v", got)
	}
	if _, ok := getOptionalJSONRPCDateFilter(map[string]any{"date_from": "2026-02-29"}, "date_from"); ok {
		t.Fatal("invalid day accepted")
	}
	if got, ok := getOptionalJSONRPCDateFilter(map[string]any{}, "date_from"); !ok || got != nil {
		t.Fatal("missing date changed")
	}
}
