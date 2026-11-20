package data

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"entgo.io/ent/dialect"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowtask"

	"entgo.io/ent/dialect/sql"
)

// base already contains the calling view's visibility and discovery predicates.
// Counts are computed before pagination, within the caller's read transaction.
func loadWorkflowTaskCalendar(ctx context.Context, client *ent.Client, base *ent.WorkflowTaskQuery, query *biz.WorkflowTaskCalendarQuery, limit int, snapshot time.Time) (*biz.WorkflowTaskCalendar, error) {
	from, before, err := query.Bounds()
	if err != nil || limit < 1 || snapshot.IsZero() {
		return nil, biz.ErrBadParam
	}
	base = base.Clone().Where(workflowtask.TaskStatusKeyIn("ready", "blocked"))
	result := &biz.WorkflowTaskCalendar{
		Month: query.Month, Selection: query.Selection, Days: map[string]int{},
		Offset: query.Offset, Limit: limit, SnapshotAt: snapshot,
	}
	var dates []struct {
		Day   string `json:"day"`
		Count int    `json:"count"`
	}
	err = base.Clone().Where(workflowtask.DueAtGTE(from.UTC()), workflowtask.DueAtLT(before.UTC()), func(s *sql.Selector) {
		day := "date(" + s.C(workflowtask.FieldDueAt) + ", '+8 hours')"
		if s.Dialect() == dialect.Postgres {
			day = "TO_CHAR(" + s.C(workflowtask.FieldDueAt) + " AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')"
		}
		s.Select(sql.As(day, "day"), sql.As("COUNT(*)", "count")).GroupBy("day")
	}).Select().Scan(ctx, &dates)
	if err != nil {
		return nil, err
	}
	for _, date := range dates {
		result.Days[date.Day] = date.Count
	}
	result.Overdue, err = base.Clone().Where(workflowtask.DueAtLT(snapshot)).Count(ctx)
	if err != nil {
		return nil, err
	}
	result.Undated, err = base.Clone().Where(workflowtask.DueAtIsNil()).Count(ctx)
	if err != nil {
		return nil, err
	}
	selected := base.Clone()
	switch query.Selection {
	case "overdue":
		selected = selected.Where(workflowtask.DueAtLT(snapshot))
	case "undated":
		selected = selected.Where(workflowtask.DueAtIsNil())
	default:
		day, _ := time.ParseInLocation("2006-01-02", query.Selection, from.Location())
		selected = selected.Where(workflowtask.DueAtGTE(day.UTC()), workflowtask.DueAtLT(day.AddDate(0, 0, 1).UTC()))
	}
	var revisions []struct {
		Total    int    `json:"total"`
		Revision string `json:"revision"`
	}
	serverHash := false
	err = selected.Clone().Where(func(s *sql.Selector) {
		id, version, due := s.C(workflowtask.FieldID), s.C(workflowtask.FieldVersion), s.C(workflowtask.FieldDueAt)
		item := "CAST(" + id + " AS TEXT) || ':' || CAST(" + version + " AS TEXT) || ':' || COALESCE(CAST(" + due + " AS TEXT),'')"
		revision := "COALESCE(GROUP_CONCAT(" + item + ", char(10) ORDER BY " + id + "),'')"
		if s.Dialect() == dialect.Postgres {
			serverHash = true
			revision = "encode(sha256(convert_to(COALESCE(string_agg(" + item + ", E'\\n' ORDER BY " + id + "),''),'UTF8')),'hex')"
		}
		s.Select(sql.As("COUNT(*)", "total"), sql.As(revision, "revision"))
	}).Select().Scan(ctx, &revisions)
	if err != nil {
		return nil, err
	}
	if len(revisions) != 1 {
		return nil, biz.ErrBadParam
	}
	result.Total, result.Revision = revisions[0].Total, revisions[0].Revision
	// SQLite fixtures do not provide PostgreSQL's native SHA-256 function.
	if !serverHash {
		digest := sha256.Sum256([]byte(result.Revision))
		result.Revision = hex.EncodeToString(digest[:])
	}
	if query.Revision != "" && query.Revision != result.Revision {
		result.Offset = 0
	}
	rows, err := selected.Order(workflowtask.ByDueAt(sql.OrderNullsLast()), ent.Asc(workflowtask.FieldID)).
		Offset(result.Offset).Limit(limit).All(ctx)
	if err != nil {
		return nil, err
	}
	result.Tasks = make([]*biz.WorkflowTask, 0, len(rows))
	for _, row := range rows {
		result.Tasks = append(result.Tasks, entWorkflowTaskToBiz(row))
	}
	if err := hydrateWorkflowTaskDisplayContexts(ctx, client, result.Tasks); err != nil {
		return nil, err
	}
	return result, nil
}
