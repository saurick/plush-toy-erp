package data

import (
	"context"
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
		DueAt time.Time `json:"due_at"`
		Count int       `json:"count"`
	}
	err = base.Clone().Where(workflowtask.DueAtGTE(from.UTC()), workflowtask.DueAtLT(before.UTC())).
		GroupBy(workflowtask.FieldDueAt).Aggregate(ent.Count()).Scan(ctx, &dates)
	if err != nil {
		return nil, err
	}
	for _, date := range dates {
		result.Days[date.DueAt.In(from.Location()).Format("2006-01-02")] += date.Count
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
	result.Total, err = selected.Clone().Count(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := selected.Order(workflowtask.ByDueAt(sql.OrderNullsLast()), ent.Asc(workflowtask.FieldID)).
		Offset(query.Offset).Limit(limit).All(ctx)
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
