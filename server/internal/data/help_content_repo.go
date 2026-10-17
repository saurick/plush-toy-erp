package data

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"server/internal/biz"
)

type helpContentRepo struct{ data *Data }

func NewHelpContentRepo(data *Data) *helpContentRepo { return &helpContentRepo{data: data} }

var _ biz.HelpContentRepo = (*helpContentRepo)(nil)

const helpPublishedSelect = `SELECT s.document_id, s.published_version, r.markdown, r.source_hash, r.created_at, r.actor_name FROM help_supplements s JOIN help_supplement_revisions r ON r.document_id=s.document_id AND r.version=s.published_version`

func scanHelpPublished(row interface{ Scan(...any) error }) (biz.HelpSupplement, error) {
	var item biz.HelpSupplement
	var at time.Time
	err := row.Scan(&item.DocumentID, &item.PublishedVersion, &item.Markdown, &item.SourceHash, &at, &item.PublishedBy)
	item.Version = item.PublishedVersion
	item.PublishedAt = &at
	return item, err
}

func (r *helpContentRepo) ListPublished(ctx context.Context) ([]biz.HelpSupplement, error) {
	rows, err := r.data.sqldb.QueryContext(ctx, helpPublishedSelect+" ORDER BY s.document_id")
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	items := []biz.HelpSupplement{}
	for rows.Next() {
		item, err := scanHelpPublished(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *helpContentRepo) ReadChapter(ctx context.Context, id string, maintain bool, actor int) (biz.HelpSupplement, []biz.HelpRevision, []biz.HelpFeedback, error) {
	history := []biz.HelpRevision{}
	feedback := []biz.HelpFeedback{}
	item, err := scanHelpPublished(r.data.sqldb.QueryRowContext(ctx, helpPublishedSelect+" WHERE s.document_id=$1", id))
	if errors.Is(err, sql.ErrNoRows) {
		item = biz.HelpSupplement{DocumentID: id}
	} else if err != nil {
		return item, history, feedback, err
	}
	if maintain {
		err = r.data.sqldb.QueryRowContext(ctx, "SELECT version, draft_markdown FROM help_supplements WHERE document_id=$1", id).Scan(&item.Version, &item.DraftMarkdown)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return item, history, feedback, err
		}
		rows, e := r.data.sqldb.QueryContext(ctx, `SELECT version, action, markdown, source_hash, summary, actor_name, restored_from, created_at FROM help_supplement_revisions WHERE document_id=$1 ORDER BY version DESC`, id)
		if e != nil {
			return item, history, feedback, e
		}
		for rows.Next() {
			var rev biz.HelpRevision
			if e := rows.Scan(&rev.Version, &rev.Action, &rev.Markdown, &rev.SourceHash, &rev.Summary, &rev.ActorName, &rev.RestoredFrom, &rev.CreatedAt); e != nil {
				_ = rows.Close()
				return item, history, feedback, e
			}
			history = append(history, rev)
		}
		err = errors.Join(rows.Err(), rows.Close())
		if err != nil {
			return item, history, feedback, err
		}
	}
	query := `SELECT id, document_id, document_title, source_hash, published_version, quote, message, actor_id, actor_name, created_at, response, responded_by, responded_at FROM help_feedbacks WHERE document_id=$1`
	args := []any{id}
	if !maintain {
		query += " AND actor_id=$2"
		args = append(args, actor)
	}
	rows, err := r.data.sqldb.QueryContext(ctx, query+" ORDER BY created_at DESC, id DESC", args...)
	if err != nil {
		return item, history, feedback, err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		value, e := scanHelpFeedback(rows)
		if e != nil {
			return item, history, feedback, e
		}
		feedback = append(feedback, value)
	}
	return item, history, feedback, rows.Err()
}

func (r *helpContentRepo) WriteRevision(ctx context.Context, id string, expected int, rev biz.HelpRevision) (biz.HelpSupplement, error) {
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return biz.HelpSupplement{}, err
	}
	defer func() { _ = tx.Rollback() }()
	now := time.Now().UTC()
	_, err = tx.ExecContext(ctx, `INSERT INTO help_supplements (document_id,version,published_version,draft_markdown,created_at,updated_at) VALUES ($1,0,0,'',$2,$2) ON CONFLICT (document_id) DO NOTHING`, id, now)
	if err != nil {
		return biz.HelpSupplement{}, err
	}
	query := `SELECT version,published_version,draft_markdown FROM help_supplements WHERE document_id=$1`
	if r.data.sqlDialect != "sqlite3" {
		query += " FOR UPDATE"
	}
	var version, published int
	var draft string
	if err = tx.QueryRowContext(ctx, query, id).Scan(&version, &published, &draft); err != nil {
		return biz.HelpSupplement{}, err
	}
	if version != expected {
		return biz.HelpSupplement{}, biz.ErrHelpContentConflict
	}
	switch rev.Action {
	case "publish":
		if version == 0 {
			return biz.HelpSupplement{}, biz.ErrBadParam
		}
		rev.Markdown = draft
		if err = tx.QueryRowContext(ctx, `SELECT source_hash FROM help_supplement_revisions WHERE document_id=$1 AND version=$2`, id, version).Scan(&rev.SourceHash); err != nil {
			return biz.HelpSupplement{}, err
		}
		published = version + 1
	case "restore":
		if err = tx.QueryRowContext(ctx, `SELECT markdown,source_hash FROM help_supplement_revisions WHERE document_id=$1 AND version=$2`, id, rev.RestoredFrom).Scan(&rev.Markdown, &rev.SourceHash); errors.Is(err, sql.ErrNoRows) {
			return biz.HelpSupplement{}, biz.ErrBadParam
		} else if err != nil {
			return biz.HelpSupplement{}, err
		}
	}
	result, err := tx.ExecContext(ctx, `UPDATE help_supplements SET version=$1,published_version=$2,draft_markdown=$3,updated_at=$4 WHERE document_id=$5 AND version=$6`, version+1, published, rev.Markdown, now, id, expected)
	if err != nil {
		return biz.HelpSupplement{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return biz.HelpSupplement{}, err
	}
	if count != 1 {
		return biz.HelpSupplement{}, biz.ErrHelpContentConflict
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO help_supplement_revisions (document_id,version,action,markdown,source_hash,summary,actor_id,actor_name,restored_from,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, id, version+1, rev.Action, rev.Markdown, rev.SourceHash, rev.Summary, rev.ActorID, rev.ActorName, rev.RestoredFrom, now)
	if err != nil {
		return biz.HelpSupplement{}, err
	}
	// The immutable revision is the audit record; no manuscript content is copied into runtime logs.
	if err = tx.Commit(); err != nil {
		return biz.HelpSupplement{}, err
	}
	item, _, _, err := r.ReadChapter(ctx, id, true, rev.ActorID)
	return item, err
}

func scanHelpFeedback(row interface{ Scan(...any) error }) (biz.HelpFeedback, error) {
	var item biz.HelpFeedback
	var at sql.NullTime
	err := row.Scan(&item.ID, &item.DocumentID, &item.DocumentTitle, &item.SourceHash, &item.PublishedVersion, &item.Quote, &item.Message, &item.ActorID, &item.ActorName, &item.CreatedAt, &item.Response, &item.RespondedBy, &at)
	if at.Valid {
		item.RespondedAt = &at.Time
	}
	return item, err
}

func (r *helpContentRepo) CreateFeedback(ctx context.Context, in biz.HelpFeedback) (biz.HelpFeedback, error) {
	if in.PublishedVersion > 0 {
		var count int
		if err := r.data.sqldb.QueryRowContext(ctx, `SELECT COUNT(*) FROM help_supplement_revisions WHERE document_id=$1 AND version=$2 AND action='publish'`, in.DocumentID, in.PublishedVersion).Scan(&count); err != nil {
			return biz.HelpFeedback{}, err
		}
		if count != 1 {
			return biz.HelpFeedback{}, biz.ErrBadParam
		}
	}
	_, err := r.data.sqldb.ExecContext(ctx, `INSERT INTO help_feedbacks (document_id,document_title,source_hash,published_version,quote,message,request_key,actor_id,actor_name,response,responded_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'','',$10) ON CONFLICT (request_key) DO NOTHING`, in.DocumentID, in.DocumentTitle, in.SourceHash, in.PublishedVersion, in.Quote, in.Message, in.RequestKey, in.ActorID, in.ActorName, time.Now().UTC())
	if err != nil {
		return biz.HelpFeedback{}, err
	}
	item, err := scanHelpFeedback(r.data.sqldb.QueryRowContext(ctx, `SELECT id,document_id,document_title,source_hash,published_version,quote,message,actor_id,actor_name,created_at,response,responded_by,responded_at FROM help_feedbacks WHERE request_key=$1`, in.RequestKey))
	if err != nil {
		return biz.HelpFeedback{}, err
	}
	if item.ActorID != in.ActorID || item.DocumentID != in.DocumentID || item.SourceHash != in.SourceHash || item.PublishedVersion != in.PublishedVersion || item.Quote != in.Quote || item.Message != in.Message {
		return biz.HelpFeedback{}, biz.ErrHelpContentConflict
	}
	return item, nil
}

func (r *helpContentRepo) RespondFeedback(ctx context.Context, id string, feedbackID int, response, actor string) error {
	result, err := r.data.sqldb.ExecContext(ctx, `UPDATE help_feedbacks SET response=$1,responded_by=$2,responded_at=$3 WHERE id=$4 AND document_id=$5 AND responded_at IS NULL`, response, actor, time.Now().UTC(), feedbackID, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return biz.ErrHelpContentConflict
	}
	return nil
}
