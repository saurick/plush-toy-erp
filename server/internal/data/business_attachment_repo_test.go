package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
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
