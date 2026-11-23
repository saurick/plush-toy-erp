package data

import (
	"context"
	"time"

	sql "entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/workflowtask"
)

func progressPredicates(q biz.WorkflowTaskBoardQuery) map[string]predicate.WorkflowTask {
	open := workflowTaskBoardUnsettledStatusPredicate()
	exception, _ := workflowTaskBoardLanePredicate(biz.WorkflowTaskBoardLaneException, q)
	finished, _ := workflowTaskBoardLanePredicate(biz.WorkflowTaskBoardLaneFinished, q)
	return map[string]predicate.WorkflowTask{"open": open, "finished": finished, "exception": exception,
		"due":        workflowtask.And(open, workflowtask.DueAtLTE(q.SnapshotAt.Add(biz.WorkflowTaskBoardDueWindow))),
		"unassigned": workflowtask.And(open, workflowtask.AssigneeIDIsNil())}
}

func loadWorkflowProgress(ctx context.Context, client *ent.Client, q biz.WorkflowTaskBoardQuery) (*biz.WorkflowTaskBoard, error) {
	base := applyWorkflowTaskBoardVisibility(client.WorkflowTask.Query(), q)
	if q.OwnerRoleKey != "" {
		base = base.Where(workflowtask.OwnerRoleKey(q.OwnerRoleKey))
	}
	if q.Keyword != "" {
		base = base.Where(workflowTaskKeywordPredicate(q.Keyword))
	}
	filters := progressPredicates(q)
	page := &biz.WorkflowProgressPage{Counts: map[string]int{}}
	board := &biz.WorkflowTaskBoard{Progress: page, SnapshotAt: q.SnapshotAt}
	// The counters overlap. All are measured before choosing a category.
	var totals []struct{ Open, Finished, Exception, Due, Unassigned int }
	err := base.Clone().Where(func(s *sql.Selector) {
		s.Select()
		for _, key := range []string{"open", "finished", "exception", "due", "unassigned"} {
			condition := sql.Dialect(s.Dialect()).Select().From(sql.Table(workflowtask.Table))
			filters[key](condition)
			s.AppendSelectExprAs(sql.ExprFunc(func(b *sql.Builder) {
				b.WriteString("COALESCE(SUM(CASE WHEN ").Join(condition.P()).WriteString(" THEN 1 ELSE 0 END),0)")
			}), key)
		}
	}).Select().Scan(ctx, &totals)
	if err != nil {
		return nil, err
	}
	t := totals[0]
	page.Counts = map[string]int{"open": t.Open, "finished": t.Finished, "exception": t.Exception, "due": t.Due, "unassigned": t.Unassigned}
	base = base.Where(filters[q.ProgressView])
	var visible []*biz.WorkflowTask
	if q.ProgressAnchor > 0 {
		anchor, err := base.Clone().Where(workflowtask.ID(q.ProgressAnchor)).Only(ctx)
		if ent.IsNotFound(err) {
			return board, nil
		}
		if err != nil {
			return nil, err
		}
		if anchor.SourceID > 0 && anchor.SourceType != "" {
			base = base.Where(workflowtask.SourceIDEQ(anchor.SourceID), workflowtask.SourceTypeIn(biz.WorkflowDocumentSourceTypes(anchor.SourceType)...))
		} else {
			base = base.Where(workflowtask.ID(anchor.ID))
		}
		page.Total, err = base.Clone().Count(ctx)
		if err != nil {
			return nil, err
		}
		order, _ := workflowTaskBoardOrder(biz.WorkflowTaskBoardSortSmart, q.ProgressView)
		rows, err := base.Order(order...).Limit(q.Limit).Offset(q.Offset).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			task := workflowBoardTask(row)
			visible = append(visible, task)
			page.Rows = append(page.Rows, biz.WorkflowProgressRow{Task: task, Count: 1, Date: workflowProgressDate(task, q.ProgressView)})
		}
	} else {
		groups, err := progressGroups(ctx, base, q)
		if err != nil {
			return nil, err
		}
		if len(groups) == 0 && q.Offset > 0 {
			first := q
			first.Offset = 0
			first.Limit = 1
			rows, err := progressGroups(ctx, base, first)
			if err != nil {
				return nil, err
			}
			if len(rows) > 0 {
				page.Total = rows[0].Total
			}
		}
		ids := make([]int, 0, len(groups)*2)
		for _, g := range groups {
			ids = append(ids, g.ID, g.DateID)
			page.Total = g.Total
		}
		if len(ids) > 0 {
			rows, err := client.WorkflowTask.Query().Where(workflowtask.IDIn(ids...)).All(ctx)
			if err != nil {
				return nil, err
			}
			tasks := map[int]*biz.WorkflowTask{}
			for _, row := range rows {
				tasks[row.ID] = workflowBoardTask(row)
			}
			for _, g := range groups {
				task := tasks[g.ID]
				visible = append(visible, task)
				page.Rows = append(page.Rows, biz.WorkflowProgressRow{Task: task, Count: g.TaskCount, Date: workflowProgressDate(tasks[g.DateID], q.ProgressView)})
			}
		}
	}
	if err := hydrateWorkflowTaskDisplayContexts(ctx, client, visible); err != nil {
		return nil, err
	}
	if len(visible) > 0 {
		ids := make([]int, 0, len(visible))
		for _, t := range visible {
			ids = append(ids, t.ID)
		}
		board.Assignees, err = workflowTaskVisiblePeople(ctx, client.WorkflowTask.Query().Where(workflowtask.IDIn(ids...)))
		if err != nil {
			return nil, err
		}
	}
	return board, nil
}

func workflowProgressDate(t *biz.WorkflowTask, category string) *time.Time {
	if category == "finished" {
		return t.CompletedAt
	}
	return t.DueAt
}

type progressGroup struct {
	ID        int
	DateID    int `json:"date_id"`
	TaskCount int `json:"task_count"`
	Total     int
}

// Window functions choose a representative and a date across the entire visible document before pagination.
func progressGroups(ctx context.Context, base *ent.WorkflowTaskQuery, q biz.WorkflowTaskBoardQuery) ([]progressGroup, error) {
	var groups []progressGroup
	err := base.Clone().Where(func(s *sql.Selector) {
		d := sql.Dialect(s.Dialect())
		src := s.Clone().Select("id", "source_no", "source_id", "source_type", "due_at", "completed_at", "task_status_key", "assignee_id", "priority")
		src.AppendSelectExprAs(sql.ExprFunc(func(b *sql.Builder) {
			b.WriteString("CASE")
			for _, doc := range biz.WorkflowDocumentTypes() {
				if len(doc.Sources) < 2 {
					continue
				}
				values := make([]any, len(doc.Sources))
				for i, source := range doc.Sources {
					values[i] = source
				}
				b.WriteString(" WHEN ").Join(sql.In("source_type", values...)).WriteString(" THEN ").Arg(doc.Key)
			}
			b.WriteString(" ELSE source_type END")
		}), "document_type")
		src.As("source_rows")
		dateCol := "due_at"
		dateDir := " ASC"
		if q.ProgressView == "finished" {
			dateCol = "completed_at"
			dateDir = " DESC"
		}
		partition := "PARTITION BY document_type, source_id, CASE WHEN source_type IS NULL OR source_type='' OR source_id IS NULL OR source_id=0 THEN id ELSE 0 END"
		risk := "CASE WHEN task_status_key='blocked' THEN 0 WHEN assignee_id IS NULL THEN 1 ELSE 2 END"
		if q.ProgressView == "finished" {
			risk = "CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END"
		}
		ranked := d.Select("id", "source_no", dateCol).From(src).
			AppendSelectExprAs(sql.Expr(risk), "risk").
			AppendSelectExprAs(sql.Expr("ROW_NUMBER() OVER ("+partition+" ORDER BY "+risk+","+dateCol+dateDir+" NULLS LAST,priority DESC,id)"), "position").
			AppendSelectExprAs(sql.Expr("FIRST_VALUE(id) OVER ("+partition+" ORDER BY "+dateCol+dateDir+" NULLS LAST,id)"), "date_id").
			AppendSelectExprAs(sql.Expr("FIRST_VALUE("+dateCol+") OVER ("+partition+" ORDER BY "+dateCol+dateDir+" NULLS LAST,id)"), "group_date").
			AppendSelectExprAs(sql.Expr("COUNT(*) OVER ("+partition+")"), "task_count").As("ranked")
		out := d.Select("id", "date_id", "task_count").From(ranked).Where(sql.EQ("position", 1)).AppendSelectExprAs(sql.Expr("COUNT(*) OVER ()"), "total")
		switch q.Sort {
		case "source_asc":
			out.OrderExpr(sql.Expr("source_no ASC NULLS LAST"))
		case "source_desc":
			out.OrderExpr(sql.Expr("source_no DESC NULLS LAST"))
		case biz.WorkflowTaskBoardSortTimeDesc:
			dateDir = " DESC"
		case biz.WorkflowTaskBoardSortTimeAsc:
			dateDir = " ASC"
		default:
			out.OrderBy("risk")
		}
		out.OrderExpr(sql.Expr("group_date" + dateDir + " NULLS LAST")).OrderBy("id").Limit(q.Limit).Offset(q.Offset)
		*s = *out
	}).Select().Scan(ctx, &groups)
	return groups, err
}
