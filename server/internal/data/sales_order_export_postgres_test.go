package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
)

func cloneSalesExportPostgresFixture(t *testing.T, ctx context.Context, tx *stdsql.Tx, table string, columns []string, id int, overrides map[string]string) {
	t.Helper()
	keys, values := []string{}, []string{}
	for _, column := range columns {
		if column == "id" {
			continue
		}
		quoted := `"` + column + `"`
		keys = append(keys, quoted)
		value := quoted
		if replacement, ok := overrides[column]; ok {
			value = replacement
		}
		values = append(values, value)
	}
	statement := fmt.Sprintf(`INSERT INTO "%s" (%s) SELECT %s FROM "%s" WHERE id=$1`, table, strings.Join(keys, ","), strings.Join(values, ","), table)
	if _, err := tx.ExecContext(ctx, statement, id); err != nil {
		t.Fatal(err)
	}
}

func salesOrderExportPostgresFixture(t *testing.T, count int) (*Data, *ent.Client, *salesOrderRepo, []*ent.SalesOrder) {
	t.Helper()
	data, client := openInventoryPostgresTestData(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("export-%d", time.Now().UnixNano())
	customer := createSalesOrderTestCustomer(t, ctx, client, suffix, true)
	now := time.Unix(1700000000, 0)
	orders := make([]*ent.SalesOrder, 0, count)
	for start := 0; start < count; start += 500 {
		builders := []*ent.SalesOrderCreate{}
		for i := start; i < count && i < start+500; i++ {
			builders = append(builders, client.SalesOrder.Create().SetOrderNo(fmt.Sprintf("%s-%04d", suffix, i)).SetCustomerID(customer.ID).SetCurrency("CNY").SetOrderDate(now).SetUpdatedAt(now).SetLifecycleStatus(biz.SalesOrderStatusDraft))
		}
		rows, err := client.SalesOrder.CreateBulk(builders...).Save(ctx)
		if err != nil {
			t.Fatal(err)
		}
		orders = append(orders, rows...)
	}
	repo := NewSalesOrderRepo(data, log.NewStdLogger(io.Discard))
	return data, client, repo, orders
}

func TestSourceDocumentPostgresSalesOrderExportSnapshot(t *testing.T) {
	data, client, repo, orders := salesOrderExportPostgresFixture(t, 251)
	ctx := context.Background()
	snapshot, err := beginReadSnapshot(ctx, data)
	if err != nil {
		t.Fatal(err)
	}
	var isolation, readOnly string
	if err := snapshot.sqlTx.QueryRowContext(ctx, "SHOW transaction_isolation").Scan(&isolation); err != nil {
		t.Fatal(err)
	}
	if err := snapshot.sqlTx.QueryRowContext(ctx, "SHOW transaction_read_only").Scan(&readOnly); err != nil {
		t.Fatal(err)
	}
	snapshot.Rollback()
	if isolation != "repeatable read" || readOnly != "on" {
		t.Fatalf("isolation=%s readonly=%s", isolation, readOnly)
	}
	unit := createSalesOrderTestUnit(t, ctx, client, orders[0].OrderNo, true)
	item := client.SalesOrderItem.Create().SetSalesOrderID(orders[0].ID).SetLineNo(1).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(1)).SaveX(ctx)
	client.EngineeringMaterialRequest.Create().SetSalesOrderID(orders[0].ID).SetSourceOrderVersion(1).SetOrderNoSnapshot(orders[0].OrderNo).SetSubmittedBy(1).
		SetStatus("REJECTED").SetRejectedBy(1).SetRejectedAt(time.Now()).SetReviewNote("模拟驳回").
		SetSourceSnapshot([]map[string]any{{"history": strings.Repeat("历史", 1<<18)}}).SaveX(ctx)
	request := client.EngineeringMaterialRequest.Create().SetSalesOrderID(orders[0].ID).SetSourceOrderVersion(1).SetOrderNoSnapshot(orders[0].OrderNo).SetSubmittedBy(1).SetSourceSnapshot([]map[string]any{}).SaveX(ctx)
	writerTx, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := writerTx.Rollback(); err != nil && !errors.Is(err, stdsql.ErrTxDone) {
			t.Errorf("rollback export writer: %v", err)
		}
	}()
	if _, err := writerTx.ExecContext(ctx, "LOCK TABLE sales_order_items IN ACCESS EXCLUSIVE MODE"); err != nil {
		t.Fatal(err)
	}
	var blocker int
	if err := writerTx.QueryRowContext(ctx, "SELECT pg_backend_pid()").Scan(&blocker); err != nil {
		t.Fatal(err)
	}
	type outcome struct {
		rows []*biz.SalesOrder
		err  error
	}
	completed := make(chan outcome, 1)
	query := biz.SalesOrderExportQuery{Filter: biz.SalesOrderFilter{CustomerID: orders[0].CustomerID, LifecycleScope: "current", SortBy: "updated_at", SortDirection: "desc"}}
	go func() { rows, err := repo.ExportSalesOrders(ctx, query); completed <- outcome{rows, err} }()
	// The export has read headers and is waiting to read derived item counts.
	// This writer changes membership, header values and aggregates together.
	waitForPostgresSessionBlockedByPID(t, ctx, data.sqldb, blocker)
	if _, err := writerTx.ExecContext(ctx, `UPDATE sales_orders SET order_total=200,lifecycle_status='closed' WHERE id=$1`, orders[0].ID); err != nil {
		t.Fatal(err)
	}
	cloneSalesExportPostgresFixture(t, ctx, writerTx, salesorderitem.Table, salesorderitem.Columns, item.ID, map[string]string{"line_no": "2"})
	if _, err := writerTx.ExecContext(ctx, `UPDATE engineering_material_requests SET status='BOSS_APPROVED',boss_reviewed_by=1,boss_reviewed_at=now() WHERE id=$1`, request.ID); err != nil {
		t.Fatal(err)
	}
	cloneSalesExportPostgresFixture(t, ctx, writerTx, salesorder.Table, salesorder.Columns, orders[0].ID, map[string]string{"order_no": "order_no || '-new'", "lifecycle_status": "'draft'"})
	if err := writerTx.Commit(); err != nil {
		t.Fatal(err)
	}
	var got outcome
	select {
	case got = <-completed:
	case <-time.After(5 * time.Second):
		t.Fatal("snapshot export did not finish")
	}
	if got.err != nil || len(got.rows) != len(orders) {
		t.Fatalf("rows=%d err=%v", len(got.rows), got.err)
	}
	for i, row := range got.rows {
		if row.ID != orders[len(orders)-1-i].ID {
			t.Fatalf("unstable membership/order at %d: %d", i, row.ID)
		}
		if row.ID == orders[0].ID && (row.OrderTotal != nil || row.LifecycleStatus != biz.SalesOrderStatusDraft || row.ItemCount == nil || *row.ItemCount != 1 || row.EngineeringMaterialStatus == nil || *row.EngineeringMaterialStatus != "SUBMITTED") {
			t.Fatalf("mixed snapshot: %+v", row)
		}
	}
	query.ID, query.Filter.LifecycleScope = orders[0].ID, "all"
	rows, err := repo.ExportSalesOrders(ctx, query)
	if err != nil || len(rows) != 1 || rows[0].OrderTotal == nil || !rows[0].OrderTotal.Equal(decimal.NewFromInt(200)) || *rows[0].ItemCount != 2 || *rows[0].EngineeringMaterialStatus != "BOSS_APPROVED" {
		t.Fatalf("subsequent exact snapshot rows=%v err=%v", rows, err)
	}
}

func TestSourceDocumentPostgresSalesOrderExportBudgets(t *testing.T) {
	_, client, repo, orders := salesOrderExportPostgresFixture(t, biz.SalesOrderExportMaxRows+1)
	ctx := context.Background()
	query := biz.SalesOrderExportQuery{Filter: biz.SalesOrderFilter{CustomerID: orders[0].CustomerID, LifecycleScope: "all", SortBy: "updated_at", SortDirection: "desc"}}
	if rows, err := repo.ExportSalesOrders(ctx, query); !errors.Is(err, biz.ErrSalesOrderExportLimit) || rows != nil {
		t.Fatalf("row limit: rows=%d err=%v", len(rows), err)
	}
	client.SalesOrder.DeleteOneID(orders[len(orders)-1].ID).ExecX(ctx)
	rows, err := repo.ExportSalesOrders(ctx, query)
	if err != nil || len(rows) != biz.SalesOrderExportMaxRows {
		t.Fatalf("boundary rows=%d err=%v", len(rows), err)
	}
	// A single growing JSON snapshot must be rejected before it is loaded in Go.
	client.SalesOrder.UpdateOneID(orders[0].ID).SetCustomerSnapshot(map[string]any{"payload": strings.Repeat("中", biz.SalesOrderExportMaxBytes/3+1)}).SaveX(ctx)
	query.ID = orders[0].ID
	if rows, err := repo.ExportSalesOrders(ctx, query); !errors.Is(err, biz.ErrSalesOrderExportLimit) || rows != nil {
		t.Fatalf("stored-byte limit: rows=%d err=%v", len(rows), err)
	}
	query.ID = orders[len(orders)-1].ID
	if _, err := repo.ExportSalesOrders(ctx, query); !errors.Is(err, biz.ErrSalesOrderNotFound) {
		t.Fatalf("missing exact order: %v", err)
	}
	query.ID = 0
	query.Filter.Keyword = "no-matching-sales-export"
	rows, err = repo.ExportSalesOrders(ctx, query)
	if err != nil || rows == nil || len(rows) != 0 {
		t.Fatalf("empty snapshot: rows=%v err=%v", rows, err)
	}
}

func TestSourceDocumentPostgresSalesOrderExportCancelReleasesConnection(t *testing.T) {
	data, _, repo, orders := salesOrderExportPostgresFixture(t, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	locker, err := data.sqldb.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := locker.Rollback(); err != nil && !errors.Is(err, stdsql.ErrTxDone) {
			t.Errorf("rollback export lock: %v", err)
		}
	}()
	if _, err := locker.Exec("LOCK TABLE sales_orders IN ACCESS EXCLUSIVE MODE"); err != nil {
		t.Fatal(err)
	}
	var blocker int
	if err := locker.QueryRow("SELECT pg_backend_pid()").Scan(&blocker); err != nil {
		t.Fatal(err)
	}
	completed := make(chan error, 1)
	go func() {
		_, err := repo.ExportSalesOrders(ctx, biz.SalesOrderExportQuery{ID: orders[0].ID})
		completed <- err
	}()
	waitForPostgresSessionBlockedByPID(t, context.Background(), data.sqldb, blocker)
	cancel()
	select {
	case err := <-completed:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cancel=%v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("canceled read retained its connection")
	}
	if err := locker.Rollback(); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for data.sqldb.Stats().InUse != 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if data.sqldb.Stats().InUse != 0 {
		t.Fatal("canceled snapshot leaked a transaction")
	}
	if _, err := repo.ExportSalesOrders(context.Background(), biz.SalesOrderExportQuery{ID: orders[0].ID}); err != nil {
		t.Fatalf("retry after cancel=%v", err)
	}
}
