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

func workflowAttachmentWithdraw(attachmentID int, taskID int, version int, actorID int, reason string, roles ...string) *biz.BusinessAttachmentWithdraw {
	return &biz.BusinessAttachmentWithdraw{
		ID:             attachmentID,
		OwnerType:      biz.BusinessAttachmentOwnerWorkflowTask,
		OwnerID:        taskID,
		AttachmentType: "evidence",
		Reason:         reason,
		WithdrawnBy:    actorID,
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

func TestBusinessAttachmentRepoResolvesUploaderUsernameAndKeepsLegacyMissing(t *testing.T) {
	repo, closeRepo := newBusinessAttachmentRepoTest(t, "attachment_uploader_username")
	defer closeRepo()
	ctx := context.Background()
	taskID := createAttachmentWorkflowTask(t, repo, "ready", 1, nil)
	uploader, err := repo.data.postgres.AdminUser.Create().
		SetUsername("demo_boss").
		SetDisplayName("王总").
		SetPasswordHash("test-password-hash").
		SetDisabled(true).
		Save(ctx)
	if err != nil {
		t.Fatalf("create attachment uploader: %v", err)
	}
	withUploader, err := repo.data.postgres.BusinessAttachment.Create().
		SetOwnerType(biz.BusinessAttachmentOwnerWorkflowTask).
		SetOwnerID(taskID).
		SetAttachmentType("evidence").
		SetFileName("with-uploader.pdf").
		SetMimeType("application/pdf").
		SetFileSize(5).
		SetSha256("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef").
		SetContent([]byte("proof")).
		SetUploadedBy(uploader.ID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create attachment with uploader: %v", err)
	}
	_, err = repo.data.postgres.BusinessAttachment.Create().
		SetOwnerType(biz.BusinessAttachmentOwnerWorkflowTask).
		SetOwnerID(taskID).
		SetAttachmentType("evidence").
		SetFileName("legacy.pdf").
		SetMimeType("application/pdf").
		SetFileSize(5).
		SetSha256("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789").
		SetContent([]byte("proof")).
		Save(ctx)
	if err != nil {
		t.Fatalf("create legacy attachment: %v", err)
	}

	items, err := repo.ListBusinessAttachments(ctx, biz.BusinessAttachmentOwnerWorkflowTask, taskID)
	if err != nil || len(items) != 2 {
		t.Fatalf("list attachment uploader metadata: items=%d err=%v", len(items), err)
	}
	itemsByName := make(map[string]*biz.BusinessAttachment, len(items))
	for _, item := range items {
		itemsByName[item.FileName] = item
	}
	named := itemsByName["with-uploader.pdf"]
	if named == nil || named.UploadedBy == nil || *named.UploadedBy != uploader.ID ||
		named.UploadedByUsername == nil || *named.UploadedByUsername != "demo_boss" ||
		named.UploadedByDisplayName == nil || *named.UploadedByDisplayName != "王总" {
		t.Fatalf("attachment uploader username must resolve by immutable account id: %#v", named)
	}
	legacy := itemsByName["legacy.pdf"]
	if legacy == nil || legacy.UploadedBy != nil || legacy.UploadedByUsername != nil || legacy.UploadedByDisplayName != nil {
		t.Fatalf("legacy attachment without uploader must remain explicitly missing: %#v", legacy)
	}

	metadata, err := repo.GetBusinessAttachmentMetadata(ctx, withUploader.ID)
	if err != nil || metadata.UploadedByUsername == nil || *metadata.UploadedByUsername != "demo_boss" ||
		metadata.UploadedByDisplayName == nil || *metadata.UploadedByDisplayName != "王总" {
		t.Fatalf("attachment metadata uploader username: item=%#v err=%v", metadata, err)
	}
}

func TestBusinessAttachmentRepoWithdrawsOnceAndKeepsReadableAuditMetadata(t *testing.T) {
	repo, closeRepo := newBusinessAttachmentRepoTest(t, "attachment_withdrawal")
	defer closeRepo()
	ctx := context.Background()
	actor, err := repo.data.postgres.AdminUser.Create().
		SetUsername("demo_admin").
		SetDisplayName("系统管理员").
		SetPasswordHash("test-password-hash").
		Save(ctx)
	if err != nil {
		t.Fatalf("create withdrawal actor: %v", err)
	}
	taskID := createAttachmentWorkflowTask(t, repo, "ready", 3, nil)
	attachment, err := repo.data.postgres.BusinessAttachment.Create().
		SetOwnerType(biz.BusinessAttachmentOwnerWorkflowTask).
		SetOwnerID(taskID).
		SetAttachmentType("evidence").
		SetFileName("wrong.pdf").
		SetMimeType("application/pdf").
		SetFileSize(5).
		SetSha256("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef").
		SetContent([]byte("proof")).
		SetUploadedBy(actor.ID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create attachment: %v", err)
	}

	in := workflowAttachmentWithdraw(
		attachment.ID,
		taskID,
		3,
		actor.ID,
		"上传了错误版本",
		biz.WarehouseRoleKey,
	)
	withdrawnAt, err := repo.WithdrawBusinessAttachment(ctx, in)
	if err != nil || withdrawnAt.IsZero() {
		t.Fatalf("withdraw attachment: at=%v err=%v", withdrawnAt, err)
	}
	stored, err := repo.data.postgres.BusinessAttachment.Get(ctx, attachment.ID)
	if err != nil || stored.WithdrawnAt == nil || stored.WithdrawnBy == nil || *stored.WithdrawnBy != actor.ID ||
		stored.WithdrawalReason == nil || *stored.WithdrawalReason != "上传了错误版本" {
		t.Fatalf("stored withdrawal audit = %#v, err=%v", stored, err)
	}
	items, err := repo.ListBusinessAttachments(ctx, biz.BusinessAttachmentOwnerWorkflowTask, taskID)
	if err != nil || len(items) != 1 || items[0].WithdrawnByUsername == nil ||
		*items[0].WithdrawnByUsername != "demo_admin" || items[0].WithdrawnByDisplayName == nil ||
		*items[0].WithdrawnByDisplayName != "系统管理员" || items[0].WithdrawalReason == nil {
		t.Fatalf("listed withdrawal audit = %#v, err=%v", items, err)
	}
	if _, err := repo.GetBusinessAttachmentContent(ctx, attachment.ID, biz.BusinessAttachmentOwnerWorkflowTask, taskID); !errors.Is(err, biz.ErrBusinessAttachmentNotFound) {
		t.Fatalf("withdrawn content must fail closed, got %v", err)
	}

	replayedAt, err := repo.WithdrawBusinessAttachment(ctx, in)
	if err != nil || !replayedAt.Equal(withdrawnAt) {
		t.Fatalf("exact withdrawal retry must replay stored time: first=%v replay=%v err=%v", withdrawnAt, replayedAt, err)
	}
	changed := *in
	changed.Reason = "不同的撤销原因"
	if _, err := repo.WithdrawBusinessAttachment(ctx, &changed); !errors.Is(err, biz.ErrBusinessAttachmentWithdrawn) {
		t.Fatalf("changed withdrawal retry must conflict, got %v", err)
	}
	storedAfterConflict, err := repo.data.postgres.BusinessAttachment.Get(ctx, attachment.ID)
	if err != nil || storedAfterConflict.WithdrawalReason == nil || *storedAfterConflict.WithdrawalReason != "上传了错误版本" {
		t.Fatalf("conflicting retry must preserve first audit: row=%#v err=%v", storedAfterConflict, err)
	}
}

func TestBusinessAttachmentRepoWithdrawalRechecksLockedWorkflowTask(t *testing.T) {
	other := 99
	for index, tc := range []struct {
		name       string
		status     string
		version    int
		assigneeID *int
		guard      *biz.BusinessAttachmentWithdraw
		wantErr    error
	}{
		{name: "stale version", status: "ready", version: 2, guard: workflowAttachmentWithdraw(0, 0, 1, 7, "上传错误", biz.WarehouseRoleKey), wantErr: biz.ErrWorkflowTaskConflict},
		{name: "terminal", status: "done", version: 1, guard: workflowAttachmentWithdraw(0, 0, 1, 7, "上传错误", biz.WarehouseRoleKey), wantErr: biz.ErrWorkflowTaskSettled},
		{name: "reassigned", status: "ready", version: 1, assigneeID: &other, guard: workflowAttachmentWithdraw(0, 0, 1, 7, "上传错误", biz.WarehouseRoleKey), wantErr: biz.ErrForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo, closeRepo := newBusinessAttachmentRepoTest(t, fmt.Sprintf("attachment_withdraw_guard_%d", index))
			defer closeRepo()
			ctx := context.Background()
			taskID := createAttachmentWorkflowTask(t, repo, tc.status, tc.version, tc.assigneeID)
			attachment, err := repo.data.postgres.BusinessAttachment.Create().
				SetOwnerType(biz.BusinessAttachmentOwnerWorkflowTask).
				SetOwnerID(taskID).
				SetAttachmentType("evidence").
				SetFileName("proof.pdf").
				SetMimeType("application/pdf").
				SetFileSize(5).
				SetSha256("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef").
				SetContent([]byte("proof")).
				Save(ctx)
			if err != nil {
				t.Fatalf("create attachment: %v", err)
			}
			tc.guard.ID = attachment.ID
			tc.guard.OwnerID = taskID
			_, err = repo.WithdrawBusinessAttachment(ctx, tc.guard)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("expected %v, got %v", tc.wantErr, err)
			}
			stored, readErr := repo.data.postgres.BusinessAttachment.Get(ctx, attachment.ID)
			if readErr != nil || stored.WithdrawnAt != nil {
				t.Fatalf("rejected workflow withdrawal must preserve active attachment: row=%#v err=%v", stored, readErr)
			}
		})
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
	if got := checks["business_attachments_file_size_max"]; got != "file_size <= 5242880" {
		t.Fatalf("file size check changed unexpectedly: %q", got)
	}
	if got := checks["business_attachments_content_size_matches"]; got != "length(content) = file_size" {
		t.Fatalf("content size check changed unexpectedly: %q", got)
	}
	sha256Check := checks["business_attachments_sha256_lower_hex"]
	for _, fragment := range []string{"length(sha256) = 64", "sha256 = lower(sha256)"} {
		if !strings.Contains(sha256Check, fragment) {
			t.Errorf("sha256 check missing portable fragment %q: %q", fragment, sha256Check)
		}
	}
	if strings.Contains(sha256Check, "~") {
		t.Errorf("sha256 check must remain portable across PostgreSQL and SQLite: %q", sha256Check)
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
	withdrawalCheck := checks["business_attachments_withdrawal_contract"]
	for _, fragment := range []string{
		"withdrawn_at IS NULL",
		"withdrawn_by IS NULL",
		"withdrawal_reason IS NULL",
		"withdrawn_at IS NOT NULL",
		"withdrawn_by > 0",
		"length(trim(withdrawal_reason)) BETWEEN 1 AND 255",
		"owner_type <> 'product'",
		"attachment_type <> 'product_image'",
	} {
		if !strings.Contains(withdrawalCheck, fragment) {
			t.Errorf("withdrawal check missing %q: %q", fragment, withdrawalCheck)
		}
	}
}

func TestBusinessAttachmentSchemaRejectsNonCanonicalSHA256InSQLite(t *testing.T) {
	repo, closeRepo := newBusinessAttachmentRepoTest(t, "attachment_sha256_contract")
	defer closeRepo()
	ctx := context.Background()
	taskID := createAttachmentWorkflowTask(t, repo, "ready", 1, nil)

	_, err := repo.data.postgres.BusinessAttachment.Create().
		SetOwnerType(biz.BusinessAttachmentOwnerWorkflowTask).
		SetOwnerID(taskID).
		SetAttachmentType("evidence").
		SetFileName("valid.pdf").
		SetMimeType("application/pdf").
		SetFileSize(5).
		SetSha256(strings.Repeat("a", 64)).
		SetContent([]byte("proof")).
		Save(ctx)
	if err != nil {
		t.Fatalf("valid lowercase sha256 must be accepted: %v", err)
	}
	_, err = repo.data.postgres.BusinessAttachment.Create().
		SetOwnerType(biz.BusinessAttachmentOwnerWorkflowTask).
		SetOwnerID(taskID).
		SetAttachmentType("evidence").
		SetFileName("wrong-size.pdf").
		SetMimeType("application/pdf").
		SetFileSize(4).
		SetSha256(strings.Repeat("a", 64)).
		SetContent([]byte("proof")).
		Save(ctx)
	if err == nil || !strings.Contains(err.Error(), "business_attachments_content_size_matches") {
		t.Fatalf("content size mismatch must be rejected by the database constraint: %v", err)
	}

	for _, tc := range []struct {
		name   string
		sha256 string
	}{
		{name: "uppercase", sha256: strings.Repeat("A", 64)},
		{name: "wrong length", sha256: strings.Repeat("a", 63)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := repo.data.postgres.BusinessAttachment.Create().
				SetOwnerType(biz.BusinessAttachmentOwnerWorkflowTask).
				SetOwnerID(taskID).
				SetAttachmentType("evidence").
				SetFileName(tc.name + ".pdf").
				SetMimeType("application/pdf").
				SetFileSize(5).
				SetSha256(tc.sha256).
				SetContent([]byte("proof")).
				Save(ctx)
			if err == nil {
				t.Fatal("non-canonical sha256 must be rejected")
			}
			if !strings.Contains(err.Error(), "business_attachments_sha256_lower_hex") {
				t.Fatalf("unexpected sha256 constraint error: %v", err)
			}
		})
	}
}
