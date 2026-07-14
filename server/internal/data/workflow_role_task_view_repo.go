package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/workflowtask"

	"entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
)

var _ biz.WorkflowRoleTaskViewRepo = (*workflowRepo)(nil)

func (r *workflowRepo) ListWorkflowRoleTaskView(ctx context.Context, query biz.WorkflowRoleTaskViewQuery) (*biz.WorkflowRoleTaskViewPage, error) {
	dbQuery := r.data.postgres.WorkflowTask.Query()
	if query.BeforeID > 0 {
		dbQuery = dbQuery.Where(workflowtask.IDLT(query.BeforeID))
	}
	if query.VisibilityScope != nil {
		dbQuery = dbQuery.Where(workflowTaskRoleViewRevisionVisibilityPredicate(
			query.VisibilityScope,
			query.RoleKey,
			query.CrossRoleRiskAllowed && query.ViewKey == biz.WorkflowRoleTaskViewRisk,
		))
	} else if !query.CrossRoleRiskAllowed || query.ViewKey != biz.WorkflowRoleTaskViewRisk {
		visibility := []predicate.WorkflowTask{workflowtask.OwnerRoleKey(query.RoleKey)}
		if query.VisibleAssigneeID != nil && *query.VisibleAssigneeID > 0 {
			visibility = append(visibility, workflowtask.AssigneeID(*query.VisibleAssigneeID))
		}
		dbQuery = dbQuery.Where(workflowtask.Or(visibility...))
	}

	switch query.ViewKey {
	case biz.WorkflowRoleTaskViewTodo:
		dbQuery = dbQuery.Where(workflowtask.TaskStatusKeyIn("ready", "blocked"))
	case biz.WorkflowRoleTaskViewHistory:
		dbQuery = dbQuery.Where(workflowtask.TaskStatusKeyIn("done", "rejected"))
	case biz.WorkflowRoleTaskViewRisk:
		dbQuery = dbQuery.Where(
			workflowtask.TaskStatusKeyIn("ready", "blocked"),
			workflowtask.Or(
				workflowtask.TaskStatusKey("blocked"),
				workflowtask.DueAtLT(query.SnapshotAt),
				workflowtask.PriorityGTE(3),
				workflowtask.CriticalPath(true),
				workflowtask.UrgeCountGT(0),
				workflowtask.EscalatedAtNotNil(),
				predicate.WorkflowTask(func(selector *sql.Selector) {
					selector.Where(sqljson.ValueEQ(workflowtask.FieldPayload, true, sqljson.Path("critical_path")))
				}),
			),
		)
	}

	rows, err := dbQuery.
		Order(ent.Desc(workflowtask.FieldID)).
		Limit(query.Limit + 1).
		All(ctx)
	if err != nil {
		return nil, err
	}
	hasMore := len(rows) > query.Limit
	if hasMore {
		rows = rows[:query.Limit]
	}
	items := make([]*biz.WorkflowTask, 0, len(rows))
	for _, row := range rows {
		items = append(items, entWorkflowTaskToBiz(row))
	}
	nextID := 0
	if hasMore && len(rows) > 0 {
		nextID = rows[len(rows)-1].ID
	}
	return &biz.WorkflowRoleTaskViewPage{
		Items:      items,
		NextID:     nextID,
		HasMore:    hasMore,
		SnapshotAt: query.SnapshotAt,
	}, nil
}
