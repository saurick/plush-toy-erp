package data

import (
	"context"
	"slices"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/engineeringmaterialrequest"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/workflowtask"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
)

var materialTrackingStatuses = []string{
	biz.MaterialRequestSubmitted, biz.MaterialRequestBossApproved, biz.MaterialRequestRejected,
}

func materialTrackingTasksForRequest(task *entsql.Selector, requestID, orderID string) *entsql.Predicate {
	payload := task.C(workflowtask.FieldPayload)
	source := task.C(workflowtask.FieldSourceID)
	groups := make([]*entsql.Predicate, 0, len(materialTrackingStatuses))
	for _, status := range materialTrackingStatuses {
		group := biz.EngineeringMaterialTaskGroup(status)
		role, capability, _ := biz.EngineeringMaterialTaskResponsibility(group)
		code := entsql.P(func(b *entsql.Builder) {
			b.Ident(task.C(workflowtask.FieldTaskCode)).WriteString(" = ").
				Arg(strings.TrimSuffix(biz.WorkflowSourceTaskCode(group, 0), "0")).
				WriteString(" || CAST(").Ident(source).WriteString(" AS TEXT)")
		})
		groups = append(groups, entsql.And(
			entsql.EQ(task.C(workflowtask.FieldTaskGroup), group),
			entsql.EQ(task.C(workflowtask.FieldOwnerRoleKey), role),
			entsql.EQ(task.C(workflowtask.FieldRequiredCapabilityKey), capability),
			code,
		))
	}
	payloadID := func(key, column string) *entsql.Predicate {
		return entsql.P(func(b *entsql.Builder) {
			runtimeAuditPayloadText(b, payload, []string{key})
			b.WriteString(" = CAST(").Ident(column).WriteString(" AS TEXT)")
		})
	}
	intent := entsql.P(func(b *entsql.Builder) {
		b.WriteString("LENGTH(")
		runtimeAuditPayloadText(b, payload, []string{workflowSourceTaskIntentHashPayloadKey})
		b.WriteString(") = 64 AND ")
		runtimeAuditPayloadText(b, payload, []string{workflowSourceTaskIntentHashPayloadKey})
		if b.Dialect() == dialect.Postgres {
			b.WriteString(" !~ ").Arg("[^0-9a-f]")
		} else {
			b.WriteString(" NOT GLOB ").Arg("*[^0-9a-f]*")
		}
	})
	return entsql.And(
		entsql.EQ(task.C(workflowtask.FieldSourceType), biz.WorkflowMaterialRequestSourceType),
		entsql.ColumnsEQ(source, requestID),
		entsql.IsNull(task.C(workflowtask.FieldConfigRevision)),
		entsql.IsNull(task.C(workflowtask.FieldProcessInstanceID)),
		entsql.IsNull(task.C(workflowtask.FieldProcessNodeInstanceID)),
		sqljson.ValueEQ(payload, biz.WorkflowSourceTaskContractV1, sqljson.Path("source_task_contract")),
		sqljson.ValueEQ(payload, biz.WorkflowMaterialRequestProducer, sqljson.Path("source_task_producer")),
		payloadID("engineering_material_request_id", requestID),
		payloadID("sales_order_id", orderID),
		intent,
		entsql.Or(groups...),
	)
}

func hasMaterialTrackingRequest(task *entsql.Selector) *entsql.Predicate {
	b := entsql.Dialect(task.Dialect())
	request := b.Table(engineeringmaterialrequest.Table).As("tracking_material_request")
	return entsql.Exists(b.Select(request.C(engineeringmaterialrequest.FieldID)).From(request).Where(
		materialTrackingTasksForRequest(task, request.C(engineeringmaterialrequest.FieldID), request.C(engineeringmaterialrequest.FieldSalesOrderID)),
	))
}

func materialTrackingTaskExists(request *entsql.Selector, filters ...predicate.WorkflowTask) *entsql.Predicate {
	b := entsql.Dialect(request.Dialect())
	table := b.Table(workflowtask.Table).As("tracking_material_task")
	task := b.Select(table.C(workflowtask.FieldID)).From(table)
	task.Where(materialTrackingTasksForRequest(task, request.C(engineeringmaterialrequest.FieldID), request.C(engineeringmaterialrequest.FieldSalesOrderID)))
	for _, filter := range filters {
		filter(task)
	}
	return entsql.Exists(task)
}

func materialTrackingOrderActive(request *entsql.Selector) *entsql.Predicate {
	b := entsql.Dialect(request.Dialect())
	order := b.Table(salesorder.Table).As("tracking_material_order")
	return entsql.Exists(b.Select(order.C(salesorder.FieldID)).From(order).Where(entsql.And(
		entsql.ColumnsEQ(order.C(salesorder.FieldID), request.C(engineeringmaterialrequest.FieldSalesOrderID)),
		entsql.EQ(order.C(salesorder.FieldLifecycleStatus), biz.SalesOrderStatusActive),
	)))
}

func materialTrackingActive(request *entsql.Selector) *entsql.Predicate {
	status := request.C(engineeringmaterialrequest.FieldStatus)
	return entsql.And(materialTrackingOrderActive(request), entsql.Or(
		entsql.In(status, biz.MaterialRequestSubmitted, biz.MaterialRequestBossApproved),
		entsql.And(entsql.EQ(status, biz.MaterialRequestRejected), materialTrackingTaskExists(request,
			workflowtask.TaskGroup(biz.WorkflowMaterialRevisionGroup), workflowtask.TaskStatusKeyIn("ready", "blocked"),
		)),
	))
}

func materialTrackingCurrentTask(request *entsql.Selector, q biz.WorkflowTrackingQuery) *entsql.Predicate {
	filters := append(trackingCurrentTaskFilter(q), func(task *entsql.Selector) {
		stages := make([]*entsql.Predicate, 0, len(materialTrackingStatuses))
		for _, status := range materialTrackingStatuses {
			stages = append(stages, entsql.And(
				entsql.EQ(request.C(engineeringmaterialrequest.FieldStatus), status),
				entsql.EQ(task.C(workflowtask.FieldTaskGroup), biz.EngineeringMaterialTaskGroup(status)),
			))
		}
		task.Where(entsql.Or(stages...))
	})
	return entsql.And(materialTrackingOrderActive(request), materialTrackingTaskExists(request, filters...))
}

func trackingMaterialReviewPredicates(q biz.WorkflowTrackingQuery) []predicate.EngineeringMaterialRequest {
	if q.RecordType == "task" || q.SourceType != "" && !slices.Contains(trackingSourceTypes(q), biz.WorkflowMaterialRequestSourceType) {
		return []predicate.EngineeringMaterialRequest{func(s *entsql.Selector) { s.Where(entsql.ExprP("FALSE")) }}
	}
	filters := []predicate.EngineeringMaterialRequest{func(s *entsql.Selector) {
		// Source identity alone does not make a request visible. Follow the
		// existing tracking scope of its formally produced Workflow tasks.
		started := entsql.EQ(s.C(engineeringmaterialrequest.FieldSubmittedBy), q.ActorID)
		participated := materialTrackingTaskExists(s, trackingTaskParticipation(q.ActorID))
		switch q.Scope {
		case "started":
			s.Where(entsql.And(started, materialTrackingTaskExists(s)))
		case "participated":
			s.Where(participated)
		default:
			visibility := workflowTaskRevisionVisibilityPredicate(q.VisibilityScope, "")
			if visibility == nil {
				s.Where(entsql.Or(entsql.And(started, materialTrackingTaskExists(s)), participated))
			} else {
				s.Where(entsql.Or(entsql.And(started, materialTrackingTaskExists(s)), participated, materialTrackingTaskExists(s, visibility)))
			}
		}
		if q.Keyword != "" {
			s.Where(entsql.Or(entsql.ContainsFold(s.C(engineeringmaterialrequest.FieldOrderNoSnapshot), q.Keyword),
				materialTrackingTaskExists(s, workflowTaskKeywordPredicate(q.Keyword))))
		}
		switch q.Status {
		case "active":
			s.Where(materialTrackingActive(s))
		case "completed":
			s.Where(entsql.Not(materialTrackingActive(s)))
		}
		if q.OwnerRoleKey != "" || q.Attention != "" {
			s.Where(materialTrackingCurrentTask(s, q))
		}
	}}
	if q.SourceID > 0 {
		filters = append(filters, engineeringmaterialrequest.ID(q.SourceID))
	}
	if q.DateFrom != nil {
		filters = append(filters, engineeringmaterialrequest.SubmittedAtGTE(*q.DateFrom))
	}
	if q.DateTo != nil {
		filters = append(filters, engineeringmaterialrequest.SubmittedAtLTE(*q.DateTo))
	}
	return filters
}

func trackingMaterialReviews(client *ent.Client, q biz.WorkflowTrackingQuery) *ent.EngineeringMaterialRequestQuery {
	return client.EngineeringMaterialRequest.Query().Where(trackingMaterialReviewPredicates(q)...)
}

func trackingMaterialReviewEntries(ctx context.Context, query *ent.EngineeringMaterialRequestQuery) ([]*biz.WorkflowTrackingEntry, error) {
	rows, err := query.Select(
		engineeringmaterialrequest.FieldID, engineeringmaterialrequest.FieldSalesOrderID, engineeringmaterialrequest.FieldOrderNoSnapshot,
		engineeringmaterialrequest.FieldStatus, engineeringmaterialrequest.FieldSubmittedBy, engineeringmaterialrequest.FieldSubmittedAt,
		engineeringmaterialrequest.FieldBossReviewedBy, engineeringmaterialrequest.FieldBossReviewedAt,
		engineeringmaterialrequest.FieldFinanceReviewedBy, engineeringmaterialrequest.FieldFinanceReviewedAt,
		engineeringmaterialrequest.FieldRejectedBy, engineeringmaterialrequest.FieldRejectedAt,
	).WithSalesOrder(func(q *ent.SalesOrderQuery) { q.Select(salesorder.FieldID, salesorder.FieldLifecycleStatus) }).All(ctx)
	if err != nil {
		return nil, err
	}
	entries := make([]*biz.WorkflowTrackingEntry, 0, len(rows))
	for _, row := range rows {
		if row.Edges.SalesOrder == nil {
			return nil, biz.ErrBadParam
		}
		entries = append(entries, &biz.WorkflowTrackingEntry{
			Ref: biz.WorkflowTrackingRef{Kind: biz.WorkflowTrackingMaterialReviewKind, ID: row.ID},
			MaterialRequest: &biz.EngineeringMaterialRequest{
				ID: row.ID, SalesOrderID: row.SalesOrderID, OrderNo: row.OrderNoSnapshot,
				Status: row.Status, OrderStatus: row.Edges.SalesOrder.LifecycleStatus,
				SubmittedBy: row.SubmittedBy, SubmittedAt: &row.SubmittedAt,
				BossReviewedBy: row.BossReviewedBy, BossReviewedAt: row.BossReviewedAt,
				FinanceReviewedBy: row.FinanceReviewedBy, FinanceReviewedAt: row.FinanceReviewedAt,
				RejectedBy: row.RejectedBy, RejectedAt: row.RejectedAt,
			},
		})
	}
	return entries, nil
}

func loadTrackingMaterialTasks(ctx context.Context, client *ent.Client, entries map[int]*biz.WorkflowTrackingEntry) error {
	if len(entries) == 0 {
		return nil
	}
	ids := make([]int, 0, len(entries))
	for id := range entries {
		ids = append(ids, id)
	}
	rows, err := client.WorkflowTask.Query().Where(workflowtask.SourceIDIn(ids...), func(s *entsql.Selector) {
		s.Where(hasMaterialTrackingRequest(s))
	}).Order(ent.Asc(workflowtask.FieldID)).All(ctx)
	if err != nil {
		return err
	}
	for _, row := range rows {
		task := entWorkflowTaskToBiz(row)
		if !biz.IsTrustedEngineeringMaterialTask(task) {
			return biz.ErrBadParam
		}
		entry := entries[row.SourceID]
		entry.Tasks = append(entry.Tasks, task)
		if entry.Task == nil {
			entry.Task = task
		}
	}
	for _, entry := range entries {
		if entry.Task == nil {
			return biz.ErrBadParam
		}
	}
	return nil
}
