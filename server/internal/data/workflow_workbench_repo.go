package data

import (
	"context"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/workflowtask"

	entsql "entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
)

var _ biz.WorkflowWorkbenchRepo = (*workflowRepo)(nil)

func (r *workflowRepo) GetWorkflowWorkbench(ctx context.Context, query biz.WorkflowWorkbenchQuery) (*biz.WorkflowWorkbenchPage, error) {
	if query.SnapshotAt.IsZero() {
		return nil, biz.ErrBadParam
	}
	var page *biz.WorkflowWorkbenchPage
	err := r.readWorkflowSnapshot(ctx, "", func(client *ent.Client) error {
		var err error
		page, err = loadWorkflowWorkbench(ctx, client, query)
		return err
	})
	return page, err
}

func loadWorkflowWorkbench(ctx context.Context, client *ent.Client, query biz.WorkflowWorkbenchQuery) (*biz.WorkflowWorkbenchPage, error) {
	if client == nil {
		return nil, biz.ErrBadParam
	}

	predicates := map[string]predicate.WorkflowTask{
		biz.WorkflowWorkbenchQueueActionable: workflowWorkbenchActionablePredicate(query),
		biz.WorkflowWorkbenchQueueRisk:       workflowWorkbenchRiskPredicate(query),
		biz.WorkflowWorkbenchQueueApproval:   workflowWorkbenchApprovalPredicate(query),
	}
	counts := biz.WorkflowWorkbenchCounts{}
	for _, queueKey := range []string{
		biz.WorkflowWorkbenchQueueActionable,
		biz.WorkflowWorkbenchQueueRisk,
		biz.WorkflowWorkbenchQueueApproval,
	} {
		count, err := client.WorkflowTask.Query().Where(predicates[queueKey]).Count(ctx)
		if err != nil {
			return nil, err
		}
		switch queueKey {
		case biz.WorkflowWorkbenchQueueActionable:
			counts.Actionable = count
		case biz.WorkflowWorkbenchQueueRisk:
			counts.Risk = count
		case biz.WorkflowWorkbenchQueueApproval:
			counts.Approval = count
		}
	}

	total, ok := counts.QueueTotal(query.QueueKey)
	if !ok {
		return nil, biz.ErrBadParam
	}
	direction := entsql.OrderAsc()
	if query.Sort == biz.WorkflowTaskBoardSortTimeDesc {
		direction = entsql.OrderDesc()
	}
	rows, err := client.WorkflowTask.Query().
		Where(predicates[query.QueueKey]).
		Order(
			workflowtask.ByDueAt(direction, entsql.OrderNullsLast()),
			workflowtask.ByTaskName(entsql.OrderAsc()),
			workflowtask.ByID(entsql.OrderDesc()),
		).
		Limit(query.Limit).
		Offset(query.Offset).
		All(ctx)
	if err != nil {
		return nil, err
	}
	items := make([]*biz.WorkflowTask, 0, len(rows))
	for _, row := range rows {
		items = append(items, entWorkflowTaskToBiz(row))
	}
	if err := hydrateWorkflowTaskDisplayContexts(ctx, client, items); err != nil {
		return nil, err
	}
	return &biz.WorkflowWorkbenchPage{
		SnapshotAt: query.SnapshotAt,
		QueueKey:   query.QueueKey,
		Total:      total,
		Limit:      query.Limit,
		Offset:     query.Offset,
		Items:      items,
		Counts:     counts,
	}, nil
}

func workflowWorkbenchActionablePredicate(query biz.WorkflowWorkbenchQuery) predicate.WorkflowTask {
	return workflowtask.And(
		workflowWorkbenchVisibilityPredicate(query.VisibilityScope),
		workflowWorkbenchNonRiskPredicate(query.SnapshotAt),
	)
}

func workflowWorkbenchNonRiskPredicate(snapshotAt time.Time) predicate.WorkflowTask {
	return workflowtask.And(
		workflowtask.TaskStatusKey("ready"),
		workflowtask.Or(workflowtask.DueAtIsNil(), workflowtask.DueAtGTE(snapshotAt)),
		workflowtask.PriorityLT(3),
		workflowtask.CriticalPath(false),
		workflowtask.UrgeCountLTE(0),
		workflowtask.EscalatedAtIsNil(),
		predicate.WorkflowTask(func(selector *entsql.Selector) {
			path := sqljson.Path("critical_path")
			selector.Where(entsql.Or(
				entsql.Not(sqljson.HasKey(workflowtask.FieldPayload, path)),
				sqljson.ValueIsNull(workflowtask.FieldPayload, path),
				sqljson.ValueNEQ(workflowtask.FieldPayload, true, path),
			))
		}),
	)
}

func workflowWorkbenchRiskPredicate(query biz.WorkflowWorkbenchQuery) predicate.WorkflowTask {
	return workflowtask.And(
		workflowWorkbenchVisibilityPredicate(query.RiskVisibilityScope),
		workflowRoleTaskRiskPredicate(query.SnapshotAt),
	)
}

func workflowWorkbenchApprovalPredicate(query biz.WorkflowWorkbenchQuery) predicate.WorkflowTask {
	return workflowtask.And(
		workflowApprovalTaskVisibilityPredicate(query.ApprovalVisibilityScopes, ""),
		workflowtask.TaskStatusKeyIn("ready", "blocked"),
	)
}

func workflowWorkbenchVisibilityPredicate(scope *biz.WorkflowTaskVisibilityScope) predicate.WorkflowTask {
	visibility := workflowTaskRevisionVisibilityPredicate(scope, "")
	if visibility == nil {
		return workflowtask.ID(0)
	}
	return visibility
}
