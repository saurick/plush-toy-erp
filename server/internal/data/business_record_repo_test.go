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

func TestBusinessRecordRepo_ArchiveListAndMutationDenied(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:business_record_repo?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewBusinessRecordRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	supplierName := "联调供应商"
	created, err := client.BusinessRecord.Create().
		SetModuleKey("accessories-purchase").
		SetDocumentNo("AP-ARCHIVE-001").
		SetTitle("采购测试单").
		SetBusinessStatusKey("project_pending").
		SetOwnerRoleKey("purchase").
		SetSupplierName(supplierName).
		SetPayload(map[string]any{"scene": "archive-fixture"}).
		Save(ctx)
	if err != nil {
		t.Fatalf("create archive fixture failed: %v", err)
	}
	itemName := "测试辅料"
	quantity := 3.0
	if _, err := client.BusinessRecordItem.Create().
		SetRecordID(created.ID).
		SetModuleKey(created.ModuleKey).
		SetLineNo(1).
		SetItemName(itemName).
		SetQuantity(quantity).
		SetPayload(map[string]any{"line": "first"}).
		Save(ctx); err != nil {
		t.Fatalf("create archive item fixture failed: %v", err)
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

	documentNo := "AP-ARCHIVE-002"
	_, err = repo.CreateBusinessRecord(ctx, &biz.BusinessRecordMutation{
		ModuleKey:         "accessories-purchase",
		DocumentNo:        &documentNo,
		Title:             "采购测试单新增",
		BusinessStatusKey: "project_pending",
		OwnerRoleKey:      "purchase",
		Payload:           map[string]any{},
	}, 7)
	if !errors.Is(err, biz.ErrBusinessRecordArchiveReadOnly) {
		t.Fatalf("expected archive create denied, got %v", err)
	}

	_, err = repo.UpdateBusinessRecord(ctx, created.ID, &biz.BusinessRecordMutation{
		ModuleKey:         "accessories-purchase",
		DocumentNo:        &documentNo,
		Title:             "采购测试单-已更新",
		BusinessStatusKey: "project_pending",
		OwnerRoleKey:      "purchase",
		Payload:           map[string]any{},
	}, 8)
	if !errors.Is(err, biz.ErrBusinessRecordArchiveReadOnly) {
		t.Fatalf("expected archive update denied, got %v", err)
	}

	affected, err := repo.DeleteBusinessRecords(ctx, []int{created.ID}, "repo test", 9)
	if !errors.Is(err, biz.ErrBusinessRecordArchiveReadOnly) {
		t.Fatalf("expected archive delete denied, got %v", err)
	}
	if affected != 0 {
		t.Fatalf("expected no archive records deleted, got %d", affected)
	}
	if _, err := client.BusinessRecord.UpdateOneID(created.ID).SetDeletedAt(time.Now()).Save(ctx); err != nil {
		t.Fatalf("mark archive record deleted failed: %v", err)
	}
	_, err = repo.RestoreBusinessRecord(ctx, created.ID, 10)
	if !errors.Is(err, biz.ErrBusinessRecordArchiveReadOnly) {
		t.Fatalf("expected archive restore denied, got %v", err)
	}
}

func TestBusinessRecordRepo_RetiredModulesAreReadOnly(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:business_record_repo_retired?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewBusinessRecordRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	created, err := client.BusinessRecord.Create().
		SetModuleKey("project-orders").
		SetDocumentNo("PO-RETIRED-001").
		SetTitle("旧订单记录").
		SetBusinessStatusKey("project_pending").
		SetOwnerRoleKey("sales").
		SetPayload(map[string]any{}).
		Save(ctx)
	if err != nil {
		t.Fatalf("create retired fixture failed: %v", err)
	}

	rows, total, err := repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey: "project-orders",
		Limit:     20,
	})
	if err != nil {
		t.Fatalf("list retired records failed: %v", err)
	}
	if total != 1 || len(rows) != 1 {
		t.Fatalf("expected retired record remains readable, total=%d len=%d", total, len(rows))
	}

	_, err = repo.UpdateBusinessRecord(ctx, created.ID, &biz.BusinessRecordMutation{
		Title:             "旧订单更新",
		BusinessStatusKey: "project_pending",
		OwnerRoleKey:      "sales",
		Payload:           map[string]any{},
	}, 7)
	if !errors.Is(err, biz.ErrBusinessRecordModuleRetired) {
		t.Fatalf("expected retired module update denied, got %v", err)
	}

	affected, err := repo.DeleteBusinessRecords(ctx, []int{created.ID}, "retired cleanup", 7)
	if !errors.Is(err, biz.ErrBusinessRecordModuleRetired) {
		t.Fatalf("expected retired module delete denied, got %v", err)
	}
	if affected != 0 {
		t.Fatalf("expected no retired records deleted, got %d", affected)
	}

	if _, err := client.BusinessRecord.UpdateOneID(created.ID).SetDeletedAt(time.Now()).Save(ctx); err != nil {
		t.Fatalf("mark retired record deleted failed: %v", err)
	}
	_, err = repo.RestoreBusinessRecord(ctx, created.ID, 7)
	if !errors.Is(err, biz.ErrBusinessRecordModuleRetired) {
		t.Fatalf("expected retired module restore denied, got %v", err)
	}
}

func TestBusinessRecordRepo_ListRecordsByStatusKeys(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:business_record_repo_status_keys?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewBusinessRecordRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	createRecord := func(moduleKey string, title string, statusKey string) int {
		t.Helper()
		record, err := client.BusinessRecord.Create().
			SetModuleKey(moduleKey).
			SetTitle(title).
			SetBusinessStatusKey(statusKey).
			SetOwnerRoleKey("sales").
			SetPayload(map[string]any{}).
			Save(ctx)
		if err != nil {
			t.Fatalf("create %s fixture failed: %v", title, err)
		}
		return record.ID
	}

	createRecord("project-orders", "立项待确认", "project_pending")
	createRecord("project-orders", "立项阻塞", "blocked")
	deletedID := createRecord("project-orders", "已删阻塞", "blocked")
	if _, err := client.BusinessRecord.UpdateOneID(deletedID).SetDeletedAt(time.Now()).Save(ctx); err != nil {
		t.Fatalf("mark deleted status fixture failed: %v", err)
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
		_, err := client.BusinessRecord.Create().
			SetModuleKey("project-orders").
			SetTitle(title).
			SetBusinessStatusKey("project_pending").
			SetOwnerRoleKey("sales").
			SetDocumentDate(documentDate).
			SetDueDate(dueDate).
			SetPayload(map[string]any{}).
			Save(ctx)
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

func TestBusinessRecordRepo_ListRecordsByPayloadAndItemPayload(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:business_record_repo_payload_filter?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewBusinessRecordRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	materialName := "长毛绒"
	quantity := 120.0
	record, err := client.BusinessRecord.Create().
		SetModuleKey("material-bom").
		SetTitle("夜樱烬色 BOM").
		SetBusinessStatusKey("engineering_preparing").
		SetOwnerRoleKey("purchase").
		SetPayload(map[string]any{
			"source_date":      "2026-01-19",
			"designer_name":    "成慧怡",
			"product_order_no": "SLO26029",
			"color_card_ref":   "色卡 A",
		}).
		Save(ctx)
	if err != nil {
		t.Fatalf("create payload record failed: %v", err)
	}
	if _, err := client.BusinessRecordItem.Create().
		SetRecordID(record.ID).
		SetModuleKey(record.ModuleKey).
		SetLineNo(1).
		SetMaterialName(materialName).
		SetQuantity(quantity).
		SetPayload(map[string]any{
			"supplier_item_no":     "YS-001",
			"assembly_part":        "耳朵",
			"process_prepare_note": "激光加工",
		}).
		Save(ctx); err != nil {
		t.Fatalf("create payload item fixture failed: %v", err)
	}
	if _, err := client.BusinessRecord.Create().
		SetModuleKey("material-bom").
		SetTitle("抱抱猴子 BOM").
		SetBusinessStatusKey("engineering_preparing").
		SetOwnerRoleKey("purchase").
		SetPayload(map[string]any{
			"source_date":      "2026-04-10",
			"designer_name":    "成慧怡",
			"product_order_no": "SLO26204",
		}).
		Save(ctx); err != nil {
		t.Fatalf("create second payload record failed: %v", err)
	}

	rows, total, err := repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey: "material-bom",
		Keyword:   "YS-001",
		Limit:     20,
	})
	if err != nil {
		t.Fatalf("list by item payload keyword failed: %v", err)
	}
	if total != 1 || len(rows) != 1 || rows[0].Title != "夜樱烬色 BOM" {
		t.Fatalf("expected keyword to match item payload, total=%d rows=%v", total, rows)
	}

	rows, total, err = repo.ListBusinessRecords(ctx, biz.BusinessRecordFilter{
		ModuleKey:      "material-bom",
		DateFilterKey:  "payload.source_date",
		DateRangeStart: "2026-04-01",
		DateRangeEnd:   "2026-04-30",
		Limit:          20,
	})
	if err != nil {
		t.Fatalf("list by payload date failed: %v", err)
	}
	if total != 1 || len(rows) != 1 || rows[0].Title != "抱抱猴子 BOM" {
		t.Fatalf("expected payload date filter to match April record, total=%d rows=%v", total, rows)
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
			SetOwnerRoleKey("sales").
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
