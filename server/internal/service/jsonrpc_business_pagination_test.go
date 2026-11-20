package service

import (
	"context"
	"fmt"
	"io"
	"testing"

	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestBusinessListPaginationReturnsRequestedRowsAndMetadata(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	data, client := openInventoryRepoTestData(t, t.Name())
	unit := createTestUnit(t, ctx, client, "PAGE-UNIT")
	for i := 1; i <= 505; i++ {
		createTestProduct(t, ctx, client, unit.ID, fmt.Sprintf("PAGE-%03d", i))
	}
	logger := log.NewStdLogger(io.Discard)
	d := &jsonrpcDispatcher{
		log:          log.NewHelper(logger),
		adminReader:  stubAdminAccountReader{admin: workflowJSONRPCAdmin(nil, biz.PermissionProductRead)},
		masterDataUC: biz.NewMasterDataUsecase(datarepo.NewMasterDataRepo(data, logger)),
	}
	for _, tc := range []struct{ limit, offset, rows, effectiveLimit int }{
		{50, 0, 50, 50}, {100, 0, 100, 100}, {200, 0, 200, 200},
		{300, 0, 300, 300}, {500, 0, 500, 500}, {500, 500, 5, 500}, {501, 0, 50, 50},
	} {
		t.Run(fmt.Sprintf("%d/%d", tc.limit, tc.offset), func(t *testing.T) {
			_, result, err := d.handleMasterData(ctx, "list_products", "page", mustJSONRPCStruct(t, map[string]any{"limit": tc.limit, "offset": tc.offset}))
			if err != nil || result == nil || result.Code != errcode.OK.Code {
				t.Fatalf("list failed: %v, %v", result, err)
			}
			payload := result.Data.AsMap()
			rows := payload["products"].([]any)
			if len(rows) != tc.rows || payload["total"] != float64(505) || payload["limit"] != float64(tc.effectiveLimit) || payload["offset"] != float64(tc.offset) {
				t.Fatalf("rows=%d total=%v limit=%v offset=%v", len(rows), payload["total"], payload["limit"], payload["offset"])
			}
			wantFirst := fmt.Sprintf("PAGE-%03d", 505-tc.offset)
			if rows[0].(map[string]any)["code"] != wantFirst {
				t.Fatalf("unexpected first row: %v", rows[0])
			}
		})
	}
	_, denied, err := d.handleMasterData(context.Background(), "list_products", "denied", mustJSONRPCStruct(t, map[string]any{"limit": 500}))
	if err != nil || denied == nil || denied.Code == errcode.OK.Code {
		t.Fatalf("large pages must still require authentication: %v, %v", denied, err)
	}
}

func TestBusinessListPaginationParsersPreserveDedicatedLimits(t *testing.T) {
	for _, limit := range []int{200, 300, 500} {
		params := map[string]any{"limit": float64(limit)}
		production, ok := productionOrderFilterFromParams(params)
		if !ok || production.Limit != limit || normalizedBusinessListLimit(params) != limit || getWorkflowTaskLimit(params) != limit {
			t.Fatalf("business list limit %d was not preserved", limit)
		}
	}
	params := map[string]any{"limit": float64(501)}
	if _, ok := productionOrderFilterFromParams(params); ok {
		t.Fatal("production parser accepted 501 rows")
	}
	if normalizedBusinessListLimit(params) != 50 || getWorkflowTaskLimit(params) != 500 {
		t.Fatal("default and clamp behavior changed")
	}
	if normalizedLimit(map[string]any{"limit": float64(300)}) != 50 || getWorkflowLimit(params) != 200 {
		t.Fatal("detail or business-state paging budget changed")
	}
}
