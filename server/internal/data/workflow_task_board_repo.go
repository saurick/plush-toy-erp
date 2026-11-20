package data

import (
	"context"
	"fmt"
	"sort"

	"server/internal/biz"
	corevalue "server/internal/core/value"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/workflowtask"

	entsql "entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
)

func (r *workflowRepo) GetWorkflowTaskBoard(ctx context.Context, query biz.WorkflowTaskBoardQuery) (*biz.WorkflowTaskBoard, error) {
	if query.SnapshotAt.IsZero() {
		return nil, biz.ErrBadParam
	}
	var board *biz.WorkflowTaskBoard
	err := r.readWorkflowSnapshot(ctx, query.Keyword, func(client *ent.Client) error {
		var err error
		board, err = loadWorkflowTaskBoard(ctx, client, query)
		return err
	})
	return board, err
}

func loadWorkflowTaskBoard(ctx context.Context, client *ent.Client, query biz.WorkflowTaskBoardQuery) (*biz.WorkflowTaskBoard, error) {
	if client == nil {
		return nil, biz.ErrBadParam
	}
	if query.Calendar != nil {
		base, err := applyWorkflowTaskBoardFilters(applyWorkflowTaskBoardVisibility(client.WorkflowTask.Query(), query), query)
		if err != nil {
			return nil, err
		}
		calendar, err := loadWorkflowTaskCalendar(ctx, client, base, query.Calendar, query.Limit, query.SnapshotAt)
		return &biz.WorkflowTaskBoard{Calendar: calendar}, err
	}

	roleFacetFilter := query
	roleFacetFilter.OwnerRoleKey = ""
	roleFacetQuery := client.WorkflowTask.Query()
	roleFacetQuery = applyWorkflowTaskBoardVisibility(roleFacetQuery, roleFacetFilter)
	var ownerRoleRows []struct {
		OwnerRoleKey string `json:"owner_role_key"`
	}
	err := roleFacetQuery.
		Unique(true).
		Order(ent.Asc(workflowtask.FieldOwnerRoleKey)).
		Select(workflowtask.FieldOwnerRoleKey).
		Scan(ctx, &ownerRoleRows)
	if err != nil {
		return nil, err
	}
	ownerRoleKeys := make([]string, 0, len(ownerRoleRows))
	for _, row := range ownerRoleRows {
		ownerRoleKeys = append(ownerRoleKeys, row.OwnerRoleKey)
	}
	ownerRoleKeys = normalizeWorkflowTaskBoardOwnerRoleKeys(ownerRoleKeys)

	visibleQuery := client.WorkflowTask.Query()
	visibleQuery = applyWorkflowTaskBoardVisibility(visibleQuery, query)
	assignees, err := workflowTaskVisiblePeople(ctx, visibleQuery.Clone())
	if err != nil {
		return nil, err
	}
	var sourceRows []struct {
		SourceType string `json:"source_type"`
	}
	err = visibleQuery.Clone().
		Where(workflowtask.SourceTypeNotNil()).
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
	total, counts, err := loadWorkflowTaskBoardCounts(ctx, baseQuery, query)
	if err != nil {
		return nil, err
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
		order, orderErr := workflowTaskBoardOrder(query.Sort, laneKey)
		if orderErr != nil {
			return nil, orderErr
		}
		rows, rowsErr := baseQuery.Clone().
			Where(lanePredicate).
			Order(order...).
			Limit(query.Limit).
			Offset(query.Offset).
			All(ctx)
		if rowsErr != nil {
			return nil, rowsErr
		}
		tasks := make([]*biz.WorkflowTask, 0, len(rows))
		for _, row := range rows {
			task := entWorkflowTaskToBiz(row)
			if task.TaskStatusKey == "done" || task.TaskStatusKey == "rejected" {
				task.BlockedReason = nil
				delete(task.Payload, "blocked_reason")
				delete(task.Payload, "rejected_reason")
			}
			tasks = append(tasks, task)
		}
		lanes = append(lanes, biz.WorkflowTaskBoardLane{
			Key:    laneKey,
			Total:  workflowTaskBoardLaneCount(counts, laneKey),
			Limit:  query.Limit,
			Offset: query.Offset,
			Tasks:  tasks,
		})
	}

	visibleTasks := []*biz.WorkflowTask{}
	for _, lane := range lanes {
		visibleTasks = append(visibleTasks, lane.Tasks...)
	}
	if err := hydrateWorkflowTaskDisplayContexts(ctx, client, visibleTasks); err != nil {
		return nil, err
	}
	return &biz.WorkflowTaskBoard{
		SnapshotAt:    query.SnapshotAt,
		Total:         total,
		Counts:        counts,
		Lanes:         lanes,
		SourceTypes:   sourceTypes,
		OwnerRoleKeys: ownerRoleKeys,
		Assignees:     assignees,
	}, nil
}

func loadWorkflowTaskBoardCounts(ctx context.Context, base *ent.WorkflowTaskQuery, query biz.WorkflowTaskBoardQuery) (int, biz.WorkflowTaskBoardCounts, error) {
	type laneCount struct {
		key       string
		predicate predicate.WorkflowTask
	}
	lanes := make([]laneCount, 0, len(biz.WorkflowTaskBoardLaneKeys()))
	for _, key := range biz.WorkflowTaskBoardLaneKeys() {
		p, err := workflowTaskBoardLanePredicate(key, query)
		if err != nil {
			return 0, biz.WorkflowTaskBoardCounts{}, err
		}
		lanes = append(lanes, laneCount{key: key, predicate: p})
	}
	var rows []struct {
		Total      int `json:"total"`
		Actionable int `json:"actionable"`
		Exception  int `json:"exception"`
		Due        int `json:"due"`
		Finished   int `json:"finished"`
	}
	// Reuse the page predicates while evaluating the expensive search only once
	// for all counts. Only this single aggregate row crosses the database boundary.
	err := base.Clone().Where(func(s *entsql.Selector) {
		s.Select(entsql.As("COUNT(*)", "total"))
		for _, lane := range lanes {
			condition := entsql.Dialect(s.Dialect()).Select().From(entsql.Table(workflowtask.Table))
			lane.predicate(condition)
			s.AppendSelectExprAs(entsql.ExprFunc(func(b *entsql.Builder) {
				b.WriteString("COALESCE(SUM(CASE WHEN ").Join(condition.P()).WriteString(" THEN 1 ELSE 0 END), 0)")
			}), lane.key)
		}
	}).Select().Scan(ctx, &rows)
	if err != nil {
		return 0, biz.WorkflowTaskBoardCounts{}, err
	}
	if len(rows) != 1 {
		return 0, biz.WorkflowTaskBoardCounts{}, fmt.Errorf("%w: expected one count row, got %d", biz.ErrWorkflowTaskBoardStatus, len(rows))
	}
	row := rows[0]
	return row.Total, biz.WorkflowTaskBoardCounts{Actionable: row.Actionable, Exception: row.Exception, Due: row.Due, Finished: row.Finished}, nil
}

func workflowTaskBoardOrder(sortKey, laneKey string) ([]workflowtask.OrderOption, error) {
	switch sortKey {
	case "", biz.WorkflowTaskBoardSortSmart:
		if laneKey == biz.WorkflowTaskBoardLaneFinished {
			return []workflowtask.OrderOption{
				workflowtask.ByCompletedAt(entsql.OrderDesc(), entsql.OrderNullsLast()),
				workflowtask.ByUpdatedAt(entsql.OrderDesc()),
				ent.Desc(workflowtask.FieldID),
			}, nil
		}
		return []workflowtask.OrderOption{
			workflowtask.ByCriticalPath(entsql.OrderDesc()),
			workflowtask.ByPriority(entsql.OrderDesc()),
			workflowtask.ByDueAt(entsql.OrderAsc(), entsql.OrderNullsLast()),
			ent.Desc(workflowtask.FieldID),
		}, nil
	case biz.WorkflowTaskBoardSortDueSoon:
		return []workflowtask.OrderOption{
			workflowtask.ByDueAt(entsql.OrderAsc(), entsql.OrderNullsLast()),
			workflowtask.ByPriority(entsql.OrderDesc()),
			ent.Desc(workflowtask.FieldID),
		}, nil
	case biz.WorkflowTaskBoardSortNewest:
		return []workflowtask.OrderOption{
			workflowtask.ByCreatedAt(entsql.OrderDesc()),
			ent.Desc(workflowtask.FieldID),
		}, nil
	case biz.WorkflowTaskBoardSortTimeAsc, biz.WorkflowTaskBoardSortTimeDesc:
		// The list shows the deadline of an open task and the actual end time of a closed task.
		return []workflowtask.OrderOption{func(s *entsql.Selector) {
			s.OrderExprFunc(func(b *entsql.Builder) {
				b.WriteString("CASE WHEN ").Ident(s.C(workflowtask.FieldTaskStatusKey)).
					WriteString(" IN ('ready','blocked') THEN ").Ident(s.C(workflowtask.FieldDueAt)).
					WriteString(" ELSE ").Ident(s.C(workflowtask.FieldCompletedAt)).WriteString(" END")
				if sortKey == biz.WorkflowTaskBoardSortTimeDesc {
					b.WriteString(" DESC")
				}
				b.WriteString(" NULLS LAST")
			})
		}, ent.Desc(workflowtask.FieldID)}, nil
	default:
		return nil, biz.ErrBadParam
	}
}

func applyWorkflowTaskBoardVisibility(query *ent.WorkflowTaskQuery, filter biz.WorkflowTaskBoardQuery) *ent.WorkflowTaskQuery {
	if filter.ApprovalOnly && len(filter.ApprovalVisibilityScopes) > 0 {
		return query.Where(workflowApprovalTaskVisibilityPredicate(
			filter.ApprovalVisibilityScopes,
			filter.OwnerRoleKey,
		))
	}
	if filter.VisibilityScope != nil {
		return query.Where(workflowTaskRevisionVisibilityPredicate(filter.VisibilityScope, filter.OwnerRoleKey))
	}
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
	if filter.DueFrom != nil && filter.DueBefore != nil {
		query = query.Where(workflowtask.DueAtGTE(*filter.DueFrom), workflowtask.DueAtLT(*filter.DueBefore))
	}
	if filter.CompletedFrom != nil {
		query = query.Where(workflowtask.CompletedAtGTE(*filter.CompletedFrom))
	}
	if filter.CompletedBefore != nil {
		query = query.Where(workflowtask.CompletedAtLT(*filter.CompletedBefore))
	}
	query = query.Where(workflowTaskDiscoveryPredicate(filter.WorkflowTaskDiscoveryFilter))
	if filter.TodoOnly {
		query = query.Where(workflowTaskBoardUnsettledStatusPredicate())
	}
	if filter.ApprovalOnly {
		query = query.Where(
			workflowtask.TaskStatusKeyIn("ready", "blocked"),
			workflowtask.RequiredCapabilityKeyIn(biz.WorkflowApprovalCapabilityKeys()...),
		)
	}
	if filter.Keyword != "" {
		query = query.Where(workflowTaskKeywordPredicate(filter.Keyword))
	}
	if filter.SourceType != "" {
		query = query.Where(workflowtask.SourceTypeIn(biz.WorkflowDocumentSourceTypes(filter.SourceType)...))
	}
	if filter.SourceSection != "" {
		query = query.Where(workflowtask.SourceTypeIn(biz.WorkflowDocumentSectionSourceTypes(filter.SourceSection)...))
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

func workflowTaskKeywordPredicate(keyword string) predicate.WorkflowTask {
	if number, exact := corevalue.NormalizeWorkflowTaskNumber(keyword); exact {
		return workflowtask.TaskNoEQ(number)
	}
	return workflowtask.Or(
		workflowTaskDiscoveryKeywordPredicate(keyword),
		workflowtask.TaskCodeContainsFold(keyword),
		workflowtask.TaskGroupContainsFold(keyword),
		workflowtask.TaskNameContainsFold(keyword),
		workflowtask.SourceTypeContainsFold(keyword),
		workflowtask.SourceNoContainsFold(keyword),
		workflowtask.BusinessStatusKeyContainsFold(keyword),
		workflowtask.OwnerRoleKeyContainsFold(keyword),
		workflowTaskPayloadKeywordPredicate(keyword, "record_title", "module_title"),
		workflowtask.And(
			workflowtask.Not(workflowTaskHasIdentitySourceBinding()),
			workflowTaskPayloadKeywordPredicate(keyword, "product_name", "product_names", "product_code", "style_no", "material_name", "material_code", "supplier_item_no", "sales_order_no", "production_order_no"),
		),
		workflowTaskSourceIdentityKeywordPredicate(keyword),
		workflowtask.And(
			workflowtask.TaskStatusKeyIn("blocked", "rejected", "withdrawn"),
			workflowtask.Or(
				workflowtask.BlockedReasonContainsFold(keyword),
				workflowTaskPayloadKeywordPredicate(keyword, "blocked_reason", "rejected_reason"),
			),
		),
	)
}

func workflowTaskPayloadKeywordPredicate(keyword string, paths ...string) predicate.WorkflowTask {
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
	case "open":
		return workflowTaskBoardUnsettledStatusPredicate(), nil
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
	case "ready", "blocked", "rejected", "withdrawn", "done":
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
	case biz.WorkflowTaskBoardLaneAll:
		return workflowtask.TaskStatusKeyIn("ready", "blocked", "done", "rejected", "withdrawn"), nil
	case biz.WorkflowTaskBoardLaneException:
		return workflowtask.Or(workflowtask.TaskStatusKey("blocked"), workflowtask.And(workflowtask.TaskStatusKey("ready"), workflowExceptionTaskPredicate())), nil
	case biz.WorkflowTaskBoardLaneFinished:
		return workflowtask.TaskStatusKeyIn("done", "rejected", "withdrawn"), nil
	case biz.WorkflowTaskBoardLaneDue:
		return workflowtask.And(
			workflowtask.TaskStatusKey("ready"),
			workflowtask.Not(workflowExceptionTaskPredicate()),
			workflowtask.DueAtLTE(query.SnapshotAt.Add(biz.WorkflowTaskBoardDueWindow)),
		), nil
	case biz.WorkflowTaskBoardLaneActionable:
		return workflowtask.And(
			workflowtask.TaskStatusKey("ready"),
			workflowtask.Not(workflowExceptionTaskPredicate()),
			workflowtask.Or(
				workflowtask.DueAtIsNil(),
				workflowtask.DueAtGT(query.SnapshotAt.Add(biz.WorkflowTaskBoardDueWindow)),
			),
		), nil
	default:
		return nil, biz.ErrBadParam
	}
}

func workflowExceptionTaskPredicate() predicate.WorkflowTask {
	return workflowtask.Or(
		workflowtask.TaskGroupIn(biz.WorkflowExceptionTaskGroups()...),
		workflowtask.And(workflowtask.SourceTypeNotNil(), workflowtask.SourceTypeIn(biz.WorkflowExceptionSourceTypes()...)),
	)
}

func workflowTaskBoardUnsettledStatusPredicate() predicate.WorkflowTask {
	return workflowtask.TaskStatusKeyIn("ready", "blocked")
}

func workflowTaskBoardLaneCount(counts biz.WorkflowTaskBoardCounts, laneKey string) int {
	switch laneKey {
	case biz.WorkflowTaskBoardLaneAll:
		return counts.Actionable + counts.Exception + counts.Due + counts.Finished
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
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		value = biz.WorkflowDocumentTypeKey(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func normalizeWorkflowTaskBoardOwnerRoleKeys(values []string) []string {
	return biz.NormalizeAdminRoleKeys(values)
}
