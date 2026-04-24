package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func mustCloseEntClient(t *testing.T, client interface{ Close() error }) {
	t.Helper()
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
}

func TestBusinessRecordRepo_CreateUpdateDeleteRestore(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:business_record_repo?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewBusinessRecordRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	documentNo := "PO-TEST-001"
	supplierName := "联调供应商"
	amount := 128.5
	itemName := "测试辅料"
	quantity := 3.0
	created, err := repo.CreateBusinessRecord(ctx, &biz.BusinessRecordMutation{
		ModuleKey:         "accessories-purchase",
		DocumentNo:        &documentNo,
		Title:             "采购测试单",
		BusinessStatusKey: "procurement_preparing",
		OwnerRoleKey:      "purchasing",
		SupplierName:      &supplierName,
		Amount:            &amount,
		Payload:           map[string]any{"scene": "repo-test"},
		Items: []*biz.BusinessRecordItemMutation{
			{
				LineNo:   1,
				ItemName: &itemName,
				Quantity: &quantity,
				Payload:  map[string]any{"line": "first"},
			},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	if created.ID <= 0 {
		t.Fatalf("expected created id")
	}
	if created.RowVersion != 1 {
		t.Fatalf("expected row_version 1, got %d", created.RowVersion)
	}

	rows, total, err := repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey: "accessories-purchase",
		Keyword:   "联调",
		Limit:     20,
	})
	if err != nil {
		t.Fatalf("list records failed: %v", err)
	}
	if total != 1 || len(rows) != 1 {
		t.Fatalf("expected one record, total=%d len=%d", total, len(rows))
	}
	if len(rows[0].Items) != 1 {
		t.Fatalf("expected one item, got %d", len(rows[0].Items))
	}

	newTitle := "采购测试单-已更新"
	updated, err := repo.UpdateBusinessRecord(ctx, created.ID, &biz.BusinessRecordMutation{
		ModuleKey:          "accessories-purchase",
		DocumentNo:         &documentNo,
		Title:              newTitle,
		BusinessStatusKey:  "procurement_ordered",
		OwnerRoleKey:       "purchasing",
		Payload:            map[string]any{"scene": "repo-test-updated"},
		ExpectedRowVersion: created.RowVersion,
	}, 8)
	if err != nil {
		t.Fatalf("update record failed: %v", err)
	}
	if updated.RowVersion != created.RowVersion+1 {
		t.Fatalf("expected row_version increment, got %d", updated.RowVersion)
	}
	if updated.SupplierName != nil {
		t.Fatalf("expected supplier_name cleared, got %q", *updated.SupplierName)
	}
	if updated.Amount != nil {
		t.Fatalf("expected amount cleared, got %v", *updated.Amount)
	}
	if len(updated.Items) != 0 {
		t.Fatalf("expected items replaced with empty slice, got %d", len(updated.Items))
	}

	_, err = repo.UpdateBusinessRecord(ctx, created.ID, &biz.BusinessRecordMutation{
		ModuleKey:          "accessories-purchase",
		DocumentNo:         &documentNo,
		Title:              newTitle,
		BusinessStatusKey:  "procurement_ordered",
		OwnerRoleKey:       "purchasing",
		Payload:            map[string]any{},
		ExpectedRowVersion: created.RowVersion,
	}, 8)
	if !errors.Is(err, biz.ErrBusinessRecordVersionConflict) {
		t.Fatalf("expected version conflict, got %v", err)
	}

	affected, err := repo.DeleteBusinessRecords(ctx, []int{created.ID}, "repo test", 9)
	if err != nil {
		t.Fatalf("delete record failed: %v", err)
	}
	if affected != 1 {
		t.Fatalf("expected one deleted record, got %d", affected)
	}
	_, total, err = repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey: "accessories-purchase",
		Limit:     20,
	})
	if err != nil {
		t.Fatalf("list after delete failed: %v", err)
	}
	if total != 0 {
		t.Fatalf("expected deleted record hidden, got total=%d", total)
	}
	deletedRows, deletedTotal, err := repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey:   "accessories-purchase",
		DeletedOnly: true,
		Limit:       20,
	})
	if err != nil {
		t.Fatalf("list deleted records failed: %v", err)
	}
	if deletedTotal != 1 || len(deletedRows) != 1 {
		t.Fatalf("expected one deleted record, total=%d len=%d", deletedTotal, len(deletedRows))
	}
	if deletedRows[0].DeletedAt == nil {
		t.Fatalf("expected recycle query to return deleted record")
	}

	restored, err := repo.RestoreBusinessRecord(ctx, created.ID, 10)
	if err != nil {
		t.Fatalf("restore record failed: %v", err)
	}
	if restored.DeletedAt != nil {
		t.Fatalf("expected deleted_at cleared")
	}

	events, err := client.BusinessRecordEvent.Query().All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 4 {
		t.Fatalf("expected 4 business record events, got %d", len(events))
	}
}

func TestBusinessRecordRepo_CountBusinessRecordsByModuleAndStatus(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:business_record_repo_dashboard?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewBusinessRecordRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	createRecord := func(moduleKey string, title string, statusKey string) int {
		t.Helper()
		record, err := repo.CreateBusinessRecord(ctx, &biz.BusinessRecordMutation{
			ModuleKey:         moduleKey,
			Title:             title,
			BusinessStatusKey: statusKey,
			OwnerRoleKey:      "merchandiser",
		}, 7)
		if err != nil {
			t.Fatalf("create %s failed: %v", title, err)
		}
		return record.ID
	}

	createRecord("project-orders", "立项待确认", "project_pending")
	createRecord("project-orders", "立项阻塞", "blocked")
	deletedID := createRecord("accessories-purchase", "已删采购", "blocked")
	if _, err := repo.DeleteBusinessRecords(ctx, []int{deletedID}, "dashboard test", 8); err != nil {
		t.Fatalf("delete dashboard record failed: %v", err)
	}

	rows, err := repo.CountBusinessRecordsByModuleAndStatus(ctx)
	if err != nil {
		t.Fatalf("count dashboard stats failed: %v", err)
	}
	counts := map[string]int{}
	for _, row := range rows {
		counts[row.ModuleKey+"|"+row.BusinessStatusKey] = row.Count
	}
	if counts["project-orders|project_pending"] != 1 {
		t.Fatalf("expected project pending count 1, got %d", counts["project-orders|project_pending"])
	}
	if counts["project-orders|blocked"] != 1 {
		t.Fatalf("expected project blocked count 1, got %d", counts["project-orders|blocked"])
	}
	if counts["accessories-purchase|blocked"] != 0 {
		t.Fatalf("deleted record should not be counted, got %d", counts["accessories-purchase|blocked"])
	}

	filteredRows, total, err := repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey:          "project-orders",
		BusinessStatusKeys: []string{"project_pending", "blocked"},
		Limit:              20,
	})
	if err != nil {
		t.Fatalf("list by status keys failed: %v", err)
	}
	if total != 2 || len(filteredRows) != 2 {
		t.Fatalf("expected two records by status keys, total=%d len=%d", total, len(filteredRows))
	}
}

func TestBusinessRecordRepo_ListRecordsByDateRange(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:business_record_repo_date_range?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewBusinessRecordRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	makeRecord := func(title string, documentDate string, dueDate string) {
		t.Helper()
		_, err := repo.CreateBusinessRecord(ctx, &biz.BusinessRecordMutation{
			ModuleKey:         "project-orders",
			Title:             title,
			BusinessStatusKey: "project_pending",
			OwnerRoleKey:      "merchandiser",
			DocumentDate:      &documentDate,
			DueDate:           &dueDate,
		}, 7)
		if err != nil {
			t.Fatalf("create %s failed: %v", title, err)
		}
	}

	makeRecord("四月交期", "2026-04-01", "2026-04-20")
	makeRecord("五月交期", "2026-05-01", "2026-05-10")
	makeRecord("六月交期", "2026-06-01", "2026-06-18")

	rows, total, err := repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey:      "project-orders",
		DateFilterKey:  "due_date",
		DateRangeStart: "2026-05-01",
		DateRangeEnd:   "2026-05-31",
		Limit:          20,
	})
	if err != nil {
		t.Fatalf("list by due_date range failed: %v", err)
	}
	if total != 1 || len(rows) != 1 || rows[0].Title != "五月交期" {
		t.Fatalf("expected only May record, total=%d rows=%v", total, rows)
	}

	rows, total, err = repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey:     "project-orders",
		DateFilterKey: "document_date",
		DateRangeEnd:  "2026-04-30",
		Limit:         20,
	})
	if err != nil {
		t.Fatalf("list by document_date end failed: %v", err)
	}
	if total != 1 || len(rows) != 1 || rows[0].Title != "四月交期" {
		t.Fatalf("expected only April document record, total=%d rows=%v", total, rows)
	}
}

func TestBusinessRecordRepo_ListBusinessRecordsSortOrder(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:business_record_repo_sort?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewBusinessRecordRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	baseTime := time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC)
	recordIDs := make([]int, 0, 3)
	for _, item := range []struct {
		no        string
		title     string
		createdAt time.Time
	}{
		{no: "PO-SORT-001", title: "较早记录", createdAt: baseTime},
		{no: "PO-SORT-002", title: "较晚记录", createdAt: baseTime.Add(2 * time.Hour)},
		{no: "PO-SORT-003", title: "同时间较大 ID", createdAt: baseTime.Add(2 * time.Hour)},
	} {
		created, err := client.BusinessRecord.Create().
			SetModuleKey("project-orders").
			SetDocumentNo(item.no).
			SetTitle(item.title).
			SetBusinessStatusKey("project_pending").
			SetOwnerRoleKey("merchandiser").
			SetPayload(map[string]any{}).
			SetCreatedAt(item.createdAt).
			Save(ctx)
		if err != nil {
			t.Fatalf("create sorted record %s failed: %v", item.no, err)
		}
		recordIDs = append(recordIDs, created.ID)
	}

	descRows, total, err := repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey: "project-orders",
		SortOrder: "desc",
		Limit:     20,
	})
	if err != nil {
		t.Fatalf("list desc records failed: %v", err)
	}
	if total != 3 || len(descRows) != 3 {
		t.Fatalf("expected three desc rows, total=%d len=%d", total, len(descRows))
	}
	assertBusinessRecordIDs(t, descRows, []int{
		recordIDs[2],
		recordIDs[1],
		recordIDs[0],
	})

	ascRows, total, err := repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey: "project-orders",
		SortOrder: "asc",
		Limit:     20,
	})
	if err != nil {
		t.Fatalf("list asc records failed: %v", err)
	}
	if total != 3 || len(ascRows) != 3 {
		t.Fatalf("expected three asc rows, total=%d len=%d", total, len(ascRows))
	}
	assertBusinessRecordIDs(t, ascRows, []int{
		recordIDs[0],
		recordIDs[1],
		recordIDs[2],
	})
}

func assertBusinessRecordIDs(t *testing.T, records []*biz.BusinessRecord, want []int) {
	t.Helper()
	if len(records) != len(want) {
		t.Fatalf("record length = %d, want %d", len(records), len(want))
	}
	for index, record := range records {
		if record.ID != want[index] {
			t.Fatalf("record[%d].ID = %d, want %d", index, record.ID, want[index])
		}
	}
}
