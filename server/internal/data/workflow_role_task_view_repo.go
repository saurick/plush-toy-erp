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

	rows, err := orderWorkflowRoleTasks(dbQuery, query.SortKey).
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
	if err := hydrateWorkflowTaskDisplayContexts(ctx, client, items); err != nil {
		return nil, err
	}
	nextID := 0
	var nextTime *time.Time
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		nextID = last.ID
		switch query.SortKey {
		case biz.WorkflowRoleTaskSortNewest, biz.WorkflowRoleTaskSortOldest:
			nextTime = &last.CreatedAt
		case biz.WorkflowRoleTaskSortDue:
			nextTime = last.DueAt
		}
	}
	return &biz.WorkflowRoleTaskViewPage{
		Items:      items,
		NextID:     nextID,
		NextTime:   nextTime,
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
		dbQuery = dbQuery.Where(workflowRoleTaskPageAfter(query, beforeID))
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
	if query.StatusKey != "" {
		dbQuery = dbQuery.Where(workflowtask.TaskStatusKey(query.StatusKey))
	}
	if query.Keyword != "" {
		dbQuery = dbQuery.Where(workflowTaskKeywordPredicate(query.Keyword))
	}
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

func orderWorkflowRoleTasks(query *ent.WorkflowTaskQuery, sortKey string) *ent.WorkflowTaskQuery {
	switch sortKey {
	case biz.WorkflowRoleTaskSortNewest:
		query = query.Order(ent.Desc(workflowtask.FieldCreatedAt))
	case biz.WorkflowRoleTaskSortOldest:
		query = query.Order(ent.Asc(workflowtask.FieldCreatedAt))
	case biz.WorkflowRoleTaskSortDue:
		query = query.Order(workflowtask.ByDueAt(entsql.OrderNullsLast()))
	}
	return query.Order(ent.Desc(workflowtask.FieldID))
}

// The timestamp and ID form a stable cursor, including the final no-deadline bucket.
func workflowRoleTaskPageAfter(query biz.WorkflowRoleTaskViewQuery, beforeID int) predicate.WorkflowTask {
	idAfter := workflowtask.IDLT(beforeID)
	switch query.SortKey {
	case biz.WorkflowRoleTaskSortNewest, biz.WorkflowRoleTaskSortOldest:
		if query.BeforeTime == nil {
			return workflowtask.IDEQ(0)
		}
		afterTime := workflowtask.CreatedAtLT(*query.BeforeTime)
		if query.SortKey == biz.WorkflowRoleTaskSortOldest {
			afterTime = workflowtask.CreatedAtGT(*query.BeforeTime)
		}
		return workflowtask.Or(afterTime, workflowtask.And(workflowtask.CreatedAtEQ(*query.BeforeTime), idAfter))
	case biz.WorkflowRoleTaskSortDue:
		if query.BeforeTime == nil {
			return workflowtask.And(workflowtask.DueAtIsNil(), idAfter)
		}
		return workflowtask.Or(
			workflowtask.DueAtGT(*query.BeforeTime),
			workflowtask.And(workflowtask.DueAtEQ(*query.BeforeTime), idAfter),
			workflowtask.DueAtIsNil(),
		)
	default:
		return idAfter
	}
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
