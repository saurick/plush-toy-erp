package data

import (
	"context"
	"fmt"
	"io"
	"reflect"
	"testing"
	"time"

	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestInventoryOperationListBatchQueriesAndWarehouseScope(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_operation_list_batch")
	f := createInventoryTestFixtures(t, ctx, client)
	to := createTestWarehouse(t, ctx, client, "WH-LIST-TO")
	r := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(r)
	ids := make([]int, 0, 200)
	for i := 0; i < 200; i++ {
		op, err := uc.CreateInventoryOperation(ctx, &biz.InventoryOperationCreate{
			OperationNo: fmt.Sprintf("BATCH-%03d", i), OperationType: biz.InventoryOperationTransfer,
			Reason: "列表回归", IdempotencyKey: fmt.Sprintf("batch-%d", i), CreatedBy: 1,
			Items: []biz.InventoryOperationItemCreate{{LineNo: "1", SubjectType: biz.InventorySubjectMaterial,
				SubjectID: f.materialID, FromWarehouseID: f.warehouseID, ToWarehouseID: &to.ID,
				UnitID: f.unitID, AdjustmentQuantity: decimal.NewFromInt(1)}},
		})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, op.ID)
	}
	// Equal timestamps exercise the documented descending ID tie-breaker.
	client.InventoryOperation.Update().SetUpdatedAt(time.Unix(1700000000, 0)).SaveX(ctx)
	queries := 0
	data.postgres = ent.NewClient(ent.Driver(entsql.OpenDB(data.sqlDialect, data.sqldb)), ent.Debug(), ent.Log(func(...any) { queries++ }))
	for _, size := range []int{1, 50, 200} {
		queries = 0
		rows, total, err := r.ListInventoryOperationsForAccess(ctx, biz.InventoryOperationFilter{Limit: size}, biz.WarehouseDataScope{Mode: biz.DataScopeModeAll})
		if err != nil || len(rows) != size || total != 200 || queries > 4 {
			t.Fatalf("size=%d rows=%d total=%d queries=%d error=%v", size, len(rows), total, queries, err)
		}
		t.Logf("page rows=%d queries=%d", size, queries)
		for i, row := range rows {
			if row.ID != ids[len(ids)-1-i] {
				t.Fatalf("unexpected ordering: %d", row.ID)
			}
			detail, err := inventoryOperationByID(ctx, client, row.ID)
			if err != nil || !reflect.DeepEqual(detail, row) {
				t.Fatalf("list lost detail/category fields: %#v error=%v", row, err)
			}
		}
	}
	assigned := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID}}
	rows, total, err := r.ListInventoryOperationsForAccess(ctx, biz.InventoryOperationFilter{Limit: 50}, assigned)
	if err != nil || total != 0 || len(rows) != 0 {
		t.Fatalf("destination outside scope leaked: total=%d rows=%d error=%v", total, len(rows), err)
	}
	assigned.WarehouseIDs = append(assigned.WarehouseIDs, to.ID)
	rows, total, err = r.ListInventoryOperationsForAccess(ctx, biz.InventoryOperationFilter{Limit: 50, Offset: 50, OperationType: biz.InventoryOperationTransfer, Status: biz.InventoryOperationStatusDraft, CreatedBy: 1}, assigned)
	if err != nil || total != 200 || len(rows) != 50 || rows[0].ID != ids[149] {
		t.Fatalf("scoped pagination: total=%d rows=%d error=%v", total, len(rows), err)
	}
	if _, err := uc.CancelInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: ids[0], ExpectedVersion: 1, ActorID: 1, Reason: "列表过滤验证"}); err != nil {
		t.Fatal(err)
	}
	_, total, err = r.ListInventoryOperationsForAccess(ctx, biz.InventoryOperationFilter{Limit: 1, Status: biz.InventoryOperationStatusDraft}, assigned)
	if err != nil || total != 199 {
		t.Fatalf("status filter total=%d error=%v", total, err)
	}
}
