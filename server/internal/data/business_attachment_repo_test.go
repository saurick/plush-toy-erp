package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"
	modelschema "server/internal/data/model/schema"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func newBusinessAttachmentRepoTest(t *testing.T, name string) (*businessAttachmentRepo, func()) {
	t.Helper()
	dsn := "file:" + name + "?mode=memory&cache=shared&_fk=1"
	client := enttest.Open(t, dialect.SQLite, dsn)
	sqldb, err := stdsql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	repo := NewBusinessAttachmentRepo(&Data{postgres: client, sqldb: sqldb, sqlDialect: "sqlite3"}, log.NewStdLogger(io.Discard))
	return repo, func() {
		_ = sqldb.Close()
		mustCloseEntClient(t, client)
	}
}

func createAttachmentWorkflowTask(t *testing.T, repo *businessAttachmentRepo, status string, version int, assigneeID *int) int {
	t.Helper()
	row, err := repo.data.postgres.WorkflowTask.Create().
		SetTaskCode("ATTACHMENT-TASK").
		SetTaskGroup("generic").
		SetTaskName("附件并发任务").
		SetSourceType("generic").
		SetSourceID(1).
		SetTaskStatusKey(status).
		SetOwnerRoleKey(biz.WarehouseRoleKey).
		SetVersion(version).
		SetNillableAssigneeID(assigneeID).
		Save(context.Background())
	if err != nil {
		t.Fatalf("create workflow task: %v", err)
	}
	return row.ID
}

func workflowAttachmentCreate(taskID int, version int, actorID int, roles ...string) *biz.BusinessAttachmentCreate {
	return &biz.BusinessAttachmentCreate{
		OwnerType:      biz.BusinessAttachmentOwnerWorkflowTask,
		OwnerID:        taskID,
		AttachmentType: "evidence",
		FileName:       "proof.pdf",
		MimeType:       "application/pdf",
		FileSize:       5,
		SHA256:         "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Content:        []byte("proof"),
		WorkflowGuard: &biz.WorkflowAttachmentWriteGuard{
			ExpectedVersion:      version,
			ActorID:              actorID,
			VisibleOwnerRoleKeys: roles,
		},
	}
}

func productImageAttachmentCreate(productID int, slotKey string) *biz.BusinessAttachmentCreate {
	return &biz.BusinessAttachmentCreate{
		OwnerType:      biz.BusinessAttachmentOwnerProduct,
		OwnerID:        productID,
		AttachmentType: biz.BusinessAttachmentTypeProductImage,
		SlotKey:        &slotKey,
		FileName:       "product.png",
		MimeType:       "image/png",
		FileSize:       5,
		SHA256:         "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Content:        []byte("image"),
	}
}

func TestBusinessAttachmentRepoListSelectsMetadataWithoutContent(t *testing.T) {
	repo, closeRepo := newBusinessAttachmentRepoTest(t, "attachment_metadata_list")
	defer closeRepo()
	ctx := context.Background()
	taskID := createAttachmentWorkflowTask(t, repo, "ready", 1, nil)
	large := make([]byte, biz.BusinessAttachmentMaxBytes)
	_, err := repo.data.postgres.BusinessAttachment.Create().
		SetOwnerType(biz.BusinessAttachmentOwnerWorkflowTask).
		SetOwnerID(taskID).
		SetAttachmentType("evidence").
		SetFileName("large.pdf").
		SetMimeType("application/pdf").
		SetFileSize(len(large)).
		SetSha256("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef").
		SetContent(large).
		Save(ctx)
	if err != nil {
		t.Fatalf("create large attachment: %v", err)
	}
	items, err := repo.ListBusinessAttachments(ctx, biz.BusinessAttachmentOwnerWorkflowTask, taskID)
	if err != nil || len(items) != 1 {
		t.Fatalf("list metadata: items=%d err=%v", len(items), err)
	}
	if items[0].FileSize != len(large) || len(items[0].Content) != 0 {
		t.Fatalf("list must retain metadata without loading content: %#v", items[0])
	}
}

func TestBusinessAttachmentRepoRecognizesProductOwner(t *testing.T) {
	repo, closeRepo := newBusinessAttachmentRepoTest(t, "attachment_product_owner")
	defer closeRepo()
	ctx := context.Background()
	unit := createTestUnit(t, ctx, repo.data.postgres, "ATTACHMENT-PRODUCT-UNIT")
	productRow := createTestProduct(t, ctx, repo.data.postgres, unit.ID, "ATTACHMENT-PRODUCT")

	table, ok := businessAttachmentOwnerTable(biz.BusinessAttachmentOwnerProduct)
	if !ok || table != "products" {
		t.Fatalf("product owner table = %q, ok=%v", table, ok)
	}
	exists, err := repo.BusinessAttachmentOwnerExists(ctx, biz.BusinessAttachmentOwnerProduct, productRow.ID)
	if err != nil || !exists {
		t.Fatalf("product owner must resolve: exists=%v err=%v", exists, err)
	}
}

func TestBusinessAttachmentRepoWorkflowCreateRechecksLockedTask(t *testing.T) {
	cases := []struct {
		name       string
		status     string
		version    int
		assigneeID *int
		guard      *biz.BusinessAttachmentCreate
		wantErr    error
	}{
		{name: "stale version", status: "ready", version: 2, guard: workflowAttachmentCreate(0, 1, 7, biz.WarehouseRoleKey), wantErr: biz.ErrWorkflowTaskConflict},
		{name: "terminal", status: "done", version: 1, guard: workflowAttachmentCreate(0, 1, 7, biz.WarehouseRoleKey), wantErr: biz.ErrWorkflowTaskSettled},
	}
	other := 99
	cases = append(cases, struct {
		name       string
		status     string
		version    int
		assigneeID *int
		guard      *biz.BusinessAttachmentCreate
		wantErr    error
	}{name: "reassigned", status: "ready", version: 1, assigneeID: &other, guard: workflowAttachmentCreate(0, 1, 7, biz.WarehouseRoleKey), wantErr: biz.ErrForbidden})
	for index, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo, closeRepo := newBusinessAttachmentRepoTest(t, fmt.Sprintf("attachment_guard_%d", index))
			defer closeRepo()
			taskID := createAttachmentWorkflowTask(t, repo, tc.status, tc.version, tc.assigneeID)
			tc.guard.OwnerID = taskID
			_, err := repo.CreateBusinessAttachment(context.Background(), tc.guard)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("expected %v, got %v", tc.wantErr, err)
			}
			count, countErr := repo.data.postgres.BusinessAttachment.Query().Count(context.Background())
			if countErr != nil || count != 0 {
				t.Fatalf("rejected workflow upload must insert zero rows: count=%d err=%v", count, countErr)
			}
		})
	}
}

func TestBusinessAttachmentRepoProductImageWriteSerializesAndReplacesSlot(t *testing.T) {
	cases := []struct {
		name         string
		dialect      string
		ownerQuery   string
		deleteQuery  string
		insertMarker string
	}{
		{
			name:         "postgres row lock",
			dialect:      "postgres",
			ownerQuery:   "SELECT id FROM products WHERE id = $1 FOR UPDATE",
			deleteQuery:  "DELETE FROM business_attachments WHERE owner_type = 'product' AND owner_id = $1 AND attachment_type = 'product_image' AND slot_key = $2",
			insertMarker: "INSERT INTO business_attachments",
		},
		{
			name:         "sqlite write lock",
			dialect:      "sqlite3",
			ownerQuery:   "UPDATE products SET id = id WHERE id = ? RETURNING id",
			deleteQuery:  "DELETE FROM business_attachments WHERE owner_type = 'product' AND owner_id = ? AND attachment_type = 'product_image' AND slot_key = ?",
			insertMarker: "INSERT INTO business_attachments",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("sqlmock.New: %v", err)
			}
			defer func() { _ = db.Close() }()
			repo := NewBusinessAttachmentRepo(&Data{sqldb: db, sqlDialect: tc.dialect}, log.NewStdLogger(io.Discard))
			createdAt := time.Date(2026, 7, 16, 10, 0, 0, 0, time.UTC)
			in := productImageAttachmentCreate(7, biz.BusinessAttachmentProductImageSlotPrimary)

			mock.ExpectBegin()
			mock.ExpectQuery(regexp.QuoteMeta(tc.ownerQuery)).
				WithArgs(7).
				WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(7))
			mock.ExpectExec(regexp.QuoteMeta(tc.deleteQuery)).
				WithArgs(7, biz.BusinessAttachmentProductImageSlotPrimary).
				WillReturnResult(sqlmock.NewResult(0, 1))
			mock.ExpectQuery(tc.insertMarker).
				WithArgs(
					biz.BusinessAttachmentOwnerProduct,
					7,
					biz.BusinessAttachmentTypeProductImage,
					biz.BusinessAttachmentProductImageSlotPrimary,
					"product.png",
					"image/png",
					5,
					in.SHA256,
					[]byte("image"),
					nil,
					nil,
				).
				WillReturnRows(sqlmock.NewRows([]string{"id", "created_at"}).AddRow(101, createdAt))
			mock.ExpectCommit()

			item, err := repo.CreateBusinessAttachment(context.Background(), in)
			if err != nil {
				t.Fatalf("create product image: %v", err)
			}
			if item.ID != 101 || item.SlotKey == nil || *item.SlotKey != biz.BusinessAttachmentProductImageSlotPrimary {
				t.Fatalf("unexpected product image: %#v", item)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("product image replacement transaction mismatch: %v", err)
			}
		})
	}
}

func TestBusinessAttachmentRepoClearProductImageLocksOwnerAndDeletesExactSlot(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer func() { _ = db.Close() }()
	repo := NewBusinessAttachmentRepo(&Data{sqldb: db, sqlDialect: "postgres"}, log.NewStdLogger(io.Discard))

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id FROM products WHERE id = $1 FOR UPDATE")).
		WithArgs(7).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(7))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM business_attachments WHERE owner_type = 'product' AND owner_id = $1 AND attachment_type = 'product_image' AND slot_key = $2")).
		WithArgs(7, biz.BusinessAttachmentProductImageSlotSecondary).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := repo.ClearProductImage(context.Background(), 7, " SECONDARY "); err != nil {
		t.Fatalf("clear product image: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("clear product image transaction mismatch: %v", err)
	}
}

func TestBusinessAttachmentSchemaDefinesProductImageContract(t *testing.T) {
	annotations := (modelschema.BusinessAttachment{}).Annotations()
	checks := map[string]string{}
	for _, annotation := range annotations {
		if sqlAnnotation, ok := annotation.(entsql.Annotation); ok {
			for name, check := range sqlAnnotation.Checks {
				checks[name] = check
			}
		}
	}
	ownerCheck := checks["business_attachments_owner_type_allowed"]
	if !strings.Contains(ownerCheck, "'product'") {
		t.Fatalf("owner type check must include product: %q", ownerCheck)
	}
	productImageCheck := checks["business_attachments_product_image_contract"]
	for _, fragment := range []string{
		"owner_type = 'product'",
		"attachment_type = 'product_image'",
		"slot_key IS NOT NULL",
		"'primary'",
		"'secondary'",
		"'image/png'",
		"'image/jpeg'",
		"'image/webp'",
		"owner_type <> 'product'",
		"attachment_type <> 'product_image'",
	} {
		if !strings.Contains(productImageCheck, fragment) {
			t.Errorf("product image check missing %q: %q", fragment, productImageCheck)
		}
	}
}
