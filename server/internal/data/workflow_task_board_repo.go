package data

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"sort"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/workflowtask"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
)

func (r *workflowRepo) GetWorkflowTaskBoard(ctx context.Context, query biz.WorkflowTaskBoardQuery) (*biz.WorkflowTaskBoard, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || query.SnapshotAt.IsZero() {
		return nil, biz.ErrBadParam
	}
	if r.data.sqldb != nil {
		return r.getWorkflowTaskBoardInSQLTx(ctx, query)
	}

	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { rollbackEntTx(ctx, tx, r.log) }()
	board, err := loadWorkflowTaskBoard(ctx, tx.Client(), query)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return board, nil
}

func (r *workflowRepo) getWorkflowTaskBoardInSQLTx(ctx context.Context, query biz.WorkflowTaskBoardQuery) (*biz.WorkflowTaskBoard, error) {
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
	board, err := loadWorkflowTaskBoard(ctx, client, query)
	if err != nil {
		return nil, err
	}
	if err := sqlTx.Commit(); err != nil {
		return nil, err
	}
	return board, nil
}

func loadWorkflowTaskBoard(ctx context.Context, client *ent.Client, query biz.WorkflowTaskBoardQuery) (*biz.WorkflowTaskBoard, error) {
	if client == nil {
		return nil, biz.ErrBadParam
	}

	visibleQuery := client.WorkflowTask.Query()
	visibleQuery = applyWorkflowTaskBoardVisibility(visibleQuery, query)
	var sourceRows []struct {
		SourceType string `json:"source_type"`
	}
	err := visibleQuery.Clone().
		Unique(true).
		Order(ent.Asc(workflowtask.FieldSourceType)).
		Select(workflowtask.FieldSourceType).
		Scan(ctx, &sourceRows)
	if err != nil {
		return nil, err
	}
	sourceTypes := make([]string, 0, len(sourceRows))
	for _, row := range sourceRows {
		sourceTypes = append(sourceTypes, row.SourceType)
	}
	sourceTypes = normalizeWorkflowTaskBoardSourceTypes(sourceTypes)

	baseQuery, err := applyWorkflowTaskBoardFilters(visibleQuery.Clone(), query)
	if err != nil {
		return nil, err
	}
	total, err := baseQuery.Clone().Count(ctx)
	if err != nil {
		return nil, err
	}

	counts := biz.WorkflowTaskBoardCounts{}
	for _, laneKey := range biz.WorkflowTaskBoardLaneKeys() {
		lanePredicate, predicateErr := workflowTaskBoardLanePredicate(laneKey, query)
		if predicateErr != nil {
			return nil, predicateErr
		}
		count, countErr := baseQuery.Clone().Where(lanePredicate).Count(ctx)
		if countErr != nil {
			return nil, countErr
		}
		setWorkflowTaskBoardLaneCount(&counts, laneKey, count)
	}
	classifiedTotal := counts.Actionable + counts.Exception + counts.Due + counts.Finished
	if classifiedTotal != total {
		return nil, fmt.Errorf("%w: total=%d classified=%d", biz.ErrWorkflowTaskBoardStatus, total, classifiedTotal)
	}

	laneKeys := biz.WorkflowTaskBoardLaneKeys()
	if query.LaneKey != "" {
		laneKeys = []string{query.LaneKey}
	}
	lanes := make([]biz.WorkflowTaskBoardLane, 0, len(laneKeys))
	for _, laneKey := range laneKeys {
		lanePredicate, predicateErr := workflowTaskBoardLanePredicate(laneKey, query)
		if predicateErr != nil {
			return nil, predicateErr
		}
		rows, rowsErr := baseQuery.Clone().
			Where(lanePredicate).
			Order(ent.Desc(workflowtask.FieldID)).
			Limit(query.Limit).
			Offset(query.Offset).
			All(ctx)
		if rowsErr != nil {
			return nil, rowsErr
		}
		tasks := make([]*biz.WorkflowTask, 0, len(rows))
		for _, row := range rows {
			tasks = append(tasks, entWorkflowTaskToBiz(row))
		}
		lanes = append(lanes, biz.WorkflowTaskBoardLane{
			Key:    laneKey,
			Total:  workflowTaskBoardLaneCount(counts, laneKey),
			Limit:  query.Limit,
			Offset: query.Offset,
			Tasks:  tasks,
		})
	}

	return &biz.WorkflowTaskBoard{
		SnapshotAt:  query.SnapshotAt,
		Total:       total,
		Counts:      counts,
		Lanes:       lanes,
		SourceTypes: sourceTypes,
	}, nil
}

func applyWorkflowTaskBoardVisibility(query *ent.WorkflowTaskQuery, filter biz.WorkflowTaskBoardQuery) *ent.WorkflowTaskQuery {
	visibilityFilter := biz.WorkflowTaskFilter{
		OwnerRoleKey:         filter.OwnerRoleKey,
		VisibleOwnerRoleKeys: filter.VisibleOwnerRoleKeys,
		VisibleAssigneeID:    filter.VisibleAssigneeID,
	}
	if scopePredicate := workflowTaskVisibilityPredicate(visibilityFilter); scopePredicate != nil {
		return query.Where(scopePredicate)
	}
	if filter.OwnerRoleKey != "" {
		return query.Where(workflowtask.OwnerRoleKey(filter.OwnerRoleKey))
	}
	return query
}

func applyWorkflowTaskBoardFilters(query *ent.WorkflowTaskQuery, filter biz.WorkflowTaskBoardQuery) (*ent.WorkflowTaskQuery, error) {
	if filter.Keyword != "" {
		query = query.Where(workflowtask.Or(
			workflowtask.TaskCodeContainsFold(filter.Keyword),
			workflowtask.TaskGroupContainsFold(filter.Keyword),
			workflowtask.TaskNameContainsFold(filter.Keyword),
			workflowtask.SourceTypeContainsFold(filter.Keyword),
			workflowtask.SourceNoContainsFold(filter.Keyword),
			workflowtask.BusinessStatusKeyContainsFold(filter.Keyword),
			workflowtask.OwnerRoleKeyContainsFold(filter.Keyword),
			workflowTaskBoardPayloadKeywordPredicate(filter.Keyword, "record_title", "module_title"),
			workflowtask.And(
				workflowtask.TaskStatusKeyIn("blocked", "rejected"),
				workflowtask.Or(
					workflowtask.BlockedReasonContainsFold(filter.Keyword),
					workflowTaskBoardPayloadKeywordPredicate(filter.Keyword, "blocked_reason", "rejected_reason"),
				),
			),
		))
	}
	if filter.SourceType != "" {
		query = query.Where(workflowtask.SourceType(filter.SourceType))
	}
	statusPredicate, err := workflowTaskBoardStatusFilterPredicate(filter)
	if err != nil {
		return nil, err
	}
	if statusPredicate != nil {
		query = query.Where(statusPredicate)
	}
	duePredicate, err := workflowTaskBoardDueFilterPredicate(filter)
	if err != nil {
		return nil, err
	}
	if duePredicate != nil {
		query = query.Where(duePredicate)
	}
	return query, nil
}

func workflowTaskBoardPayloadKeywordPredicate(keyword string, paths ...string) predicate.WorkflowTask {
	return predicate.WorkflowTask(func(selector *entsql.Selector) {
		predicates := make([]*entsql.Predicate, 0, len(paths))
		for _, path := range paths {
			predicates = append(predicates, sqljson.StringContains(workflowtask.FieldPayload, keyword, sqljson.Path(path)))
		}
		selector.Where(entsql.Or(predicates...))
	})
}

func workflowTaskBoardStatusFilterPredicate(filter biz.WorkflowTaskBoardQuery) (predicate.WorkflowTask, error) {
	switch filter.Status {
	case "", "all":
		return nil, nil
	case "pending":
		return workflowtask.TaskStatusKeyIn("pending", "ready"), nil
	case "overdue":
		return workflowtask.And(
			workflowTaskBoardUnsettledStatusPredicate(),
			workflowtask.DueAtLT(filter.SnapshotAt),
		), nil
	case "dueSoon":
		return workflowtask.And(
			workflowTaskBoardUnsettledStatusPredicate(),
			workflowtask.DueAtGTE(filter.SnapshotAt),
			workflowtask.DueAtLTE(filter.SnapshotAt.Add(biz.WorkflowTaskBoardDueWindow)),
		), nil
	case "ready", "processing", "blocked", "rejected", "done", "closed", "cancelled":
		return workflowtask.TaskStatusKey(filter.Status), nil
	default:
		return nil, biz.ErrBadParam
	}
}

func workflowTaskBoardDueFilterPredicate(filter biz.WorkflowTaskBoardQuery) (predicate.WorkflowTask, error) {
	switch filter.Due {
	case "", "all":
		return nil, nil
	case "overdue":
		return workflowtask.And(
			workflowTaskBoardUnsettledStatusPredicate(),
			workflowtask.DueAtLT(filter.SnapshotAt),
		), nil
	case "dueSoon":
		return workflowtask.And(
			workflowTaskBoardUnsettledStatusPredicate(),
			workflowtask.DueAtGTE(filter.SnapshotAt),
			workflowtask.DueAtLTE(filter.SnapshotAt.Add(biz.WorkflowTaskBoardDueWindow)),
		), nil
	case "noDue":
		return workflowtask.DueAtIsNil(), nil
	default:
		return nil, biz.ErrBadParam
	}
}

func workflowTaskBoardLanePredicate(laneKey string, query biz.WorkflowTaskBoardQuery) (predicate.WorkflowTask, error) {
	switch laneKey {
	case biz.WorkflowTaskBoardLaneException:
		return workflowtask.TaskStatusKeyIn("blocked", "rejected"), nil
	case biz.WorkflowTaskBoardLaneFinished:
		return workflowtask.TaskStatusKeyIn("done", "closed", "cancelled"), nil
	case biz.WorkflowTaskBoardLaneDue:
		return workflowtask.And(
			workflowtask.TaskStatusKeyIn("pending", "ready", "processing"),
			workflowtask.DueAtLTE(query.SnapshotAt.Add(biz.WorkflowTaskBoardDueWindow)),
		), nil
	case biz.WorkflowTaskBoardLaneActionable:
		return workflowtask.And(
			workflowtask.TaskStatusKeyIn("pending", "ready", "processing"),
			workflowtask.Or(
				workflowtask.DueAtIsNil(),
				workflowtask.DueAtGT(query.SnapshotAt.Add(biz.WorkflowTaskBoardDueWindow)),
			),
		), nil
	default:
		return nil, biz.ErrBadParam
	}
}

func workflowTaskBoardUnsettledStatusPredicate() predicate.WorkflowTask {
	return workflowtask.TaskStatusKeyIn("pending", "ready", "processing", "blocked")
}

func setWorkflowTaskBoardLaneCount(counts *biz.WorkflowTaskBoardCounts, laneKey string, count int) {
	if counts == nil {
		return
	}
	switch laneKey {
	case biz.WorkflowTaskBoardLaneActionable:
		counts.Actionable = count
	case biz.WorkflowTaskBoardLaneException:
		counts.Exception = count
	case biz.WorkflowTaskBoardLaneDue:
		counts.Due = count
	case biz.WorkflowTaskBoardLaneFinished:
		counts.Finished = count
	}
}

func workflowTaskBoardLaneCount(counts biz.WorkflowTaskBoardCounts, laneKey string) int {
	switch laneKey {
	case biz.WorkflowTaskBoardLaneActionable:
		return counts.Actionable
	case biz.WorkflowTaskBoardLaneException:
		return counts.Exception
	case biz.WorkflowTaskBoardLaneDue:
		return counts.Due
	case biz.WorkflowTaskBoardLaneFinished:
		return counts.Finished
	default:
		return 0
	}
}

func normalizeWorkflowTaskBoardSourceTypes(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}
