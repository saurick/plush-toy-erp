package data

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"github.com/google/uuid"
	"server/internal/biz"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/helpsupplementrevision"
	"server/internal/projectmanuals"
)

func newHelpContentFixture(t *testing.T) (*helpContentRepo, *biz.HelpContentUsecase) {
	t.Helper()
	dsn := "file:" + strings.ReplaceAll(t.Name(), "/", "_") + "?mode=memory&cache=shared&_fk=1"
	client := enttest.Open(t, dialect.SQLite, dsn)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close help content database: %v", err)
		}
	})
	repo := NewHelpContentRepo(&Data{postgres: client, sqldb: db, sqlDialect: "sqlite3"})
	return repo, biz.NewHelpContentUsecase(repo, projectmanuals.NewCatalog())
}

func helpActor(permissions ...string) *biz.AdminUser {
	return &biz.AdminUser{ID: 1, Username: "maintainer", Permissions: permissions}
}

func TestHelpContentDraftPublishRestoreAndPermissionBoundaries(t *testing.T) {
	_, uc := newHelpContentFixture(t)
	ctx := context.Background()
	id := "handbook:start"
	reader := helpActor()
	editor := helpActor(biz.PermissionHelpBusinessEdit)
	publisher := helpActor(biz.PermissionHelpBusinessPublish)
	if _, err := uc.Write(ctx, reader, id, "save", 0, "不可写", "说明", 0); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("reader save: %v", err)
	}
	if _, err := uc.Write(ctx, editor, id, "publish", 0, "", "说明", 0); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("editor publish: %v", err)
	}
	if _, err := uc.Write(ctx, publisher, id, "save", 0, "不可写", "说明", 0); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("publisher edit: %v", err)
	}
	if _, err := uc.Write(ctx, editor, id, "save", 0, "本公司操作约定甲", "首次补充", 0); err != nil {
		t.Fatal(err)
	}
	view, err := uc.Read(ctx, reader)
	if err != nil || len(view.Published) != 0 {
		t.Fatalf("draft leaked: %#v %v", view.Published, err)
	}
	chapter, err := uc.Chapter(ctx, reader, id)
	if err != nil || chapter.Supplement.DraftMarkdown != "" || len(chapter.History) != 0 {
		t.Fatalf("private history leaked %#v %v", chapter, err)
	}
	if _, err := uc.Write(ctx, publisher, id, "publish", 1, "", "发布甲", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.Write(ctx, editor, id, "save", 1, "丢失覆盖", "过时写入", 0); !errors.Is(err, biz.ErrHelpContentConflict) {
		t.Fatalf("stale write %v", err)
	}
	if _, err := uc.Write(ctx, editor, id, "save", 2, "未发布乙", "修改草稿", 0); err != nil {
		t.Fatal(err)
	}
	view, err = uc.Read(ctx, reader)
	if err != nil || len(view.Published) != 1 || view.Published[0].Markdown != "本公司操作约定甲" || view.Published[0].DraftMarkdown != "" {
		t.Fatalf("draft replaced published: %#v %v", view.Published, err)
	}
	if _, err := uc.Write(ctx, editor, id, "restore", 3, "", "恢复甲", 1); err != nil {
		t.Fatal(err)
	}
	chapter, err = uc.Chapter(ctx, publisher, id)
	if err != nil || chapter.Supplement.Version != 4 || chapter.Supplement.PublishedVersion != 2 || chapter.Supplement.DraftMarkdown != "本公司操作约定甲" || len(chapter.History) != 4 || chapter.History[0].RestoredFrom != 1 {
		t.Fatalf("restore %#v %v", chapter, err)
	}
	if _, err := uc.Write(ctx, publisher, id, "publish", 4, "", "再次发布", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.Chapter(ctx, editor, "manual:operations:overview"); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("ops scope %v", err)
	}
	// Editing permission does not grant the parent book's read capability.
	if _, err := uc.Chapter(ctx, helpActor(biz.PermissionHelpOperationsEdit), "manual:operations:overview"); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("ops read elevated %v", err)
	}
}

func TestHelpFeedbackIdentityReplayPrivacyAndReply(t *testing.T) {
	_, uc := newHelpContentFixture(t)
	ctx := context.Background()
	reader := helpActor()
	id := "handbook:start"
	chapter, err := uc.Chapter(ctx, reader, id)
	if err != nil {
		t.Fatal(err)
	}
	key := uuid.NewString()
	one, err := uc.Feedback(ctx, reader, id, chapter.Document.SourceHash, "原文", "这里需要修正说明", key, 0)
	if err != nil {
		t.Fatal(err)
	}
	two, err := uc.Feedback(ctx, reader, id, chapter.Document.SourceHash, "原文", "这里需要修正说明", key, 0)
	if err != nil || one.ID != two.ID {
		t.Fatalf("replay %v", err)
	}
	if _, err := uc.Feedback(ctx, reader, id, chapter.Document.SourceHash, "原文", "更改同一次提交", key, 0); !errors.Is(err, biz.ErrHelpContentConflict) {
		t.Fatalf("replay changed %v", err)
	}
	other := helpActor()
	other.ID = 2
	chapter, err = uc.Chapter(ctx, other, id)
	if err != nil || len(chapter.Feedback) != 0 {
		t.Fatalf("other feedback leaked %v", err)
	}
	if err := uc.Respond(ctx, reader, id, one.ID, "已处理"); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("reader response %v", err)
	}
	editor := helpActor(biz.PermissionHelpBusinessEdit)
	if err := uc.Respond(ctx, editor, "handbook:roles", one.ID, "串章回复"); !errors.Is(err, biz.ErrHelpContentConflict) {
		t.Fatalf("cross chapter response %v", err)
	}
	if err := uc.Respond(ctx, editor, id, one.ID, "已核对并修正"); err != nil {
		t.Fatal(err)
	}
	if err := uc.Respond(ctx, editor, id, one.ID, "覆盖回复"); !errors.Is(err, biz.ErrHelpContentConflict) {
		t.Fatalf("reply overwritten %v", err)
	}
	chapter, err = uc.Chapter(ctx, reader, id)
	if err != nil || len(chapter.Feedback) != 1 || chapter.Feedback[0].Response != "已核对并修正" {
		t.Fatalf("reply invisible %#v %v", chapter.Feedback, err)
	}
}

func TestHelpRevisionRollbackAndImmutableHistory(t *testing.T) {
	repo, uc := newHelpContentFixture(t)
	ctx := context.Background()
	editor := helpActor(biz.PermissionHelpBusinessEdit)
	id := "handbook:start"
	if _, err := uc.Write(ctx, editor, id, "save", 0, "原草稿", "首次保存", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.data.sqldb.Exec(`ALTER TABLE help_supplement_revisions RENAME TO unavailable_help_revisions`); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.Write(ctx, editor, id, "save", 1, "不可留下", "无法追加历史", 0); err == nil {
		t.Fatal("revision failure accepted")
	}
	if _, err := repo.data.sqldb.Exec(`ALTER TABLE unavailable_help_revisions RENAME TO help_supplement_revisions`); err != nil {
		t.Fatal(err)
	}
	chapter, err := uc.Chapter(ctx, editor, id)
	if err != nil || chapter.Supplement.Version != 1 || chapter.Supplement.DraftMarkdown != "原草稿" || len(chapter.History) != 1 {
		t.Fatalf("partial mutation %#v %v", chapter, err)
	}
	if _, err := repo.data.postgres.HelpSupplementRevision.Delete().Where(helpsupplementrevision.DocumentID(id)).Exec(ctx); err == nil {
		t.Fatal("immutable history deleted")
	}
}

func TestHelpContentInvalidDisabledAndCrossChapterRestore(t *testing.T) {
	_, uc := newHelpContentFixture(t)
	ctx := context.Background()
	editor := helpActor(biz.PermissionHelpBusinessEdit)
	for _, actor := range []*biz.AdminUser{nil, {ID: 1, Disabled: true}} {
		if _, err := uc.Read(ctx, actor); !errors.Is(err, biz.ErrForbidden) {
			t.Fatalf("inactive read %v", err)
		}
	}
	if _, err := uc.Write(ctx, editor, "handbook:start", "save", 0, "", "", 0); !errors.Is(err, biz.ErrBadParam) {
		t.Fatal(err)
	}
	if _, err := uc.Write(ctx, editor, "handbook:start", "restore", 0, "", "恢复不存在内容", 99); !errors.Is(err, biz.ErrBadParam) {
		t.Fatal(err)
	}
	chapter, err := uc.Chapter(ctx, editor, "handbook:start")
	if err != nil || chapter.Supplement.Version != 0 || len(chapter.History) != 0 {
		t.Fatalf("invalid restore left head %#v %v", chapter, err)
	}
}
