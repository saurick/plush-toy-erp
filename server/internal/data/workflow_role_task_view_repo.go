package data

import (
	"context"
	stdsql "database/sql"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/workflowtask"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
)

var _ biz.WorkflowRoleTaskViewRepo = (*workflowRepo)(nil)

func (r *workflowRepo) ListWorkflowRoleTaskView(ctx context.Context, query biz.WorkflowRoleTaskViewQuery) (*biz.WorkflowRoleTaskViewPage, error) {
	if r == nil || r.data == nil || r.data.postgres == nil {
		return nil, biz.ErrBadParam
	}
	if !query.IncludeCounts {
		return loadWorkflowRoleTaskView(ctx, r.data.postgres, query)
	}
	if r.data.sqldb != nil {
		return r.listWorkflowRoleTaskViewInSQLTx(ctx, query)
	}

	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { rollbackEntTx(ctx, tx, r.log) }()
	page, err := loadWorkflowRoleTaskView(ctx, tx.Client(), query)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return page, nil
}

func (r *workflowRepo) listWorkflowRoleTaskViewInSQLTx(ctx context.Context, query biz.WorkflowRoleTaskViewQuery) (*biz.WorkflowRoleTaskViewPage, error) {
	sqlDialect := r.data.sqlDialect
	if sqlDialect == "" {
		sqlDialect = dialect.Postgres
	}
	txOptions := &stdsql.TxOptions{}
	if sqlDialect == dialect.Postgres {
		txOptions.Isolation = stdsql.LevelRepeatableRead
		txOptions.ReadOnly = true
	}
	sqlTx, err := r.data.sqldb.BeginTx(ctx, txOptions)
	if err != nil {
		return nil, err
	}
	defer func() { _ = sqlTx.Rollback() }()
	client := ent.NewClient(ent.Driver(entsql.NewDriver(sqlDialect, entsql.Conn{ExecQuerier: sqlTx})))
	page, err := loadWorkflowRoleTaskView(ctx, client, query)
	if err != nil {
		return nil, err
	}
	if err := sqlTx.Commit(); err != nil {
		return nil, err
	}
	return page, nil
}

func loadWorkflowRoleTaskView(ctx context.Context, client *ent.Client, query biz.WorkflowRoleTaskViewQuery) (*biz.WorkflowRoleTaskViewPage, error) {
	if client == nil {
		return nil, biz.ErrBadParam
	}
	dbQuery := buildWorkflowRoleTaskEntQuery(client, query, query.ViewKey, query.BeforeID)

	var counts *biz.WorkflowRoleTaskViewCounts
	if query.IncludeCounts {
		var err error
		counts, err = countWorkflowRoleTaskViews(ctx, client, query)
		if err != nil {
			return nil, err
		}
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
		Counts:     counts,
	}, nil
}

func buildWorkflowRoleTaskEntQuery(
	client *ent.Client,
	query biz.WorkflowRoleTaskViewQuery,
	viewKey string,
	beforeID int,
) *ent.WorkflowTaskQuery {
	dbQuery := buildWorkflowRoleTaskVisibilityEntQuery(client, query, viewKey)
	if beforeID > 0 {
		dbQuery = dbQuery.Where(workflowtask.IDLT(beforeID))
	}

	switch viewKey {
	case biz.WorkflowRoleTaskViewTodo:
		dbQuery = dbQuery.Where(workflowtask.TaskStatusKeyIn("ready", "blocked"))
	case biz.WorkflowRoleTaskViewApproval:
		dbQuery = dbQuery.Where(
			workflowtask.TaskStatusKeyIn("ready", "blocked"),
			workflowtask.RequiredCapabilityKeyIn(biz.WorkflowApprovalCapabilityKeys()...),
		)
	case biz.WorkflowRoleTaskViewHistory:
		dbQuery = dbQuery.Where(workflowtask.TaskStatusKeyIn("done", "rejected", "withdrawn"))
	case biz.WorkflowRoleTaskViewRisk:
		dbQuery = dbQuery.Where(workflowRoleTaskRiskPredicate(query.SnapshotAt))
	}
	return dbQuery
}

func countWorkflowRoleTaskViews(
	ctx context.Context,
	client *ent.Client,
	query biz.WorkflowRoleTaskViewQuery,
) (*biz.WorkflowRoleTaskViewCounts, error) {
	var groupedStatuses []struct {
		TaskStatusKey string `json:"task_status_key"`
		Count         int    `json:"count"`
	}
	if err := buildWorkflowRoleTaskVisibilityEntQuery(
		client, query, biz.WorkflowRoleTaskViewTodo,
	).
		Where(workflowtask.TaskStatusKeyIn("ready", "blocked", "done", "rejected", "withdrawn")).
		GroupBy(workflowtask.FieldTaskStatusKey).
		Aggregate(ent.Count()).
		Scan(ctx, &groupedStatuses); err != nil {
		return nil, err
	}
	counts := &biz.WorkflowRoleTaskViewCounts{}
	for _, grouped := range groupedStatuses {
		switch grouped.TaskStatusKey {
		case "ready":
			counts.Ready = grouped.Count
		case "blocked":
			counts.Blocked = grouped.Count
		case "done":
			counts.Done = grouped.Count
		case "rejected":
			counts.Rejected = grouped.Count
		case "withdrawn":
			counts.Withdrawn = grouped.Count
		}
	}
	counts.Todo = counts.Ready + counts.Blocked
	counts.History = counts.Done + counts.Rejected + counts.Withdrawn
	counts.Total = counts.Todo + counts.History

	approval, err := buildWorkflowRoleTaskEntQuery(
		client, query, biz.WorkflowRoleTaskViewApproval, 0,
	).Count(ctx)
	if err != nil {
		return nil, err
	}
	counts.Approval = approval
	risk, err := buildWorkflowRoleTaskEntQuery(
		client, query, biz.WorkflowRoleTaskViewRisk, 0,
	).Count(ctx)
	if err != nil {
		return nil, err
	}
	counts.Risk = risk
	overdue, err := buildWorkflowRoleTaskVisibilityEntQuery(
		client, query, biz.WorkflowRoleTaskViewRisk,
	).Where(
		workflowtask.TaskStatusKeyIn("ready", "blocked"),
		workflowtask.DueAtLT(query.SnapshotAt),
	).Count(ctx)
	if err != nil {
		return nil, err
	}
	counts.Overdue = overdue
	if !counts.IsConserved() {
		return nil, biz.ErrBadParam
	}
	return counts, nil
}

func buildWorkflowRoleTaskVisibilityEntQuery(
	client *ent.Client,
	query biz.WorkflowRoleTaskViewQuery,
	viewKey string,
) *ent.WorkflowTaskQuery {
	dbQuery := client.WorkflowTask.Query()
	if viewKey == biz.WorkflowRoleTaskViewApproval {
		return dbQuery.Where(workflowApprovalRoleTaskVisibilityPredicate(
			query.ApprovalVisibilityScopes,
			query.RoleKey,
		))
	}
	if query.VisibilityScope != nil {
		return dbQuery.Where(workflowTaskRoleViewRevisionVisibilityPredicate(
			query.VisibilityScope,
			query.RoleKey,
			query.CrossRoleRiskAllowed && viewKey == biz.WorkflowRoleTaskViewRisk,
		))
	}
	if query.CrossRoleRiskAllowed && viewKey == biz.WorkflowRoleTaskViewRisk {
		return dbQuery
	}
	visibility := []predicate.WorkflowTask{workflowtask.OwnerRoleKey(query.RoleKey)}
	if query.VisibleAssigneeID != nil && *query.VisibleAssigneeID > 0 {
		visibility = append(visibility, workflowtask.AssigneeID(*query.VisibleAssigneeID))
	}
	return dbQuery.Where(workflowtask.Or(visibility...))
}

func workflowRoleTaskRiskPredicate(snapshotAt time.Time) predicate.WorkflowTask {
	return workflowtask.And(
		workflowtask.TaskStatusKeyIn("ready", "blocked"),
		workflowtask.Or(
			workflowtask.TaskStatusKey("blocked"),
			workflowtask.DueAtLT(snapshotAt),
			workflowtask.PriorityGTE(3),
			workflowtask.CriticalPath(true),
			workflowtask.UrgeCountGT(0),
			workflowtask.EscalatedAtNotNil(),
			predicate.WorkflowTask(func(selector *entsql.Selector) {
				selector.Where(sqljson.ValueEQ(workflowtask.FieldPayload, true, sqljson.Path("critical_path")))
			}),
		),
	)
}
