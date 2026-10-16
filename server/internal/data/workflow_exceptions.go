package data

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"strings"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowtask"
)

func workflowExceptionCTE(q biz.WorkflowExceptionQuery) (string, []any) {
	visible, args := progressTaskSQL(biz.BusinessProgressQuery{Access: biz.BusinessProgressAccess{Tasks: true}, TaskVisibility: q.Visibility})
	t := entsql.Dialect(dialect.Postgres).Table("visible_tasks")
	s := entsql.Dialect(dialect.Postgres).Select(t.C("id")).From(t)
	workflowTaskDiscoveryPredicate(q.WorkflowTaskDiscoveryFilter)(s)
	if q.OwnerRoleKey != "" {
		s.Where(entsql.EQ(t.C("owner_role_key"), q.OwnerRoleKey))
	}
	// Scope incidents through their visible tasks, never through a shared order
	// number. Keep the full visible incident chain once an incident is selected.
	if ref := q.TrackingRef; ref != nil {
		switch ref.Kind {
		case "process":
			s.Where(entsql.EQ(t.C("process_instance_id"), ref.ID))
		case "task":
			s.Where(entsql.And(entsql.EQ(t.C("id"), ref.ID), entsql.IsNull(t.C("process_instance_id")), entsql.IsNull(t.C("process_node_instance_id")), entsql.IsNull(t.C("config_revision"))))
		default:
			s.Where(entsql.False())
		}
	}
	// Use the same bind sequence as the visibility query.
	s.SetTotal(len(args))
	filter, filterArgs := s.Query()
	args = append(args, filterArgs...)
	cte := `WITH RECURSIVE visible_tasks AS (` + visible + `), matching_tasks AS (` + filter + `), ` + workflowTaskSourceLinksCTE + `,
quality_roots(id,root_id) AS (
 SELECT id,id FROM quality_inspections WHERE correction_of_inspection_id IS NULL
 UNION ALL SELECT q.id,r.root_id FROM quality_inspections q JOIN quality_roots r ON q.correction_of_inspection_id=r.id
), quality_heads AS (
 SELECT q.*,r.root_id,ROW_NUMBER() OVER(PARTITION BY r.root_id ORDER BY q.id DESC) AS head
 FROM quality_roots r JOIN quality_inspections q ON q.id=r.id WHERE q.status NOT IN ('DRAFT','SUBMITTED','CANCELLED')
), rejected AS (
 SELECT h.*,COALESCE(h.production_wip_batch_id,oo.source_wip_batch_id) AS batch_id
 FROM quality_heads h
 LEFT JOIN outsourcing_facts ofa ON h.source_type='OUTSOURCING_FACT' AND ofa.id=h.source_id
 LEFT JOIN outsourcing_orders oo ON ofa.source_type='OUTSOURCING_ORDER' AND oo.id=ofa.source_id
 WHERE h.head=1 AND EXISTS(SELECT 1 FROM quality_roots r JOIN quality_inspections i ON i.id=r.id WHERE r.root_id=h.root_id AND i.result='REJECT')
), incident_facts AS (
 SELECT 'quality:'||CAST(q.root_id AS TEXT) AS event_key,q.root_id AS quality_root,q.id AS quality_id,0 AS decision_id,
 q.inspection_no AS number,COALESCE(q.decision_note,'') AS reason,q.created_at AS occurred_at,q.batch_id,q.purchase_receipt_id,
 CASE WHEN q.status='PASSED' THEN 'corrected' ELSE 'open' END AS initial_state
 FROM rejected q
 UNION ALL
 SELECT 'decision:'||CAST(e.id AS TEXT),0,0,e.id,e.decision_no,e.reason,e.requested_at,e.production_wip_batch_id,NULL,'open'
 FROM production_exception_decisions e WHERE e.quality_inspection_id IS NULL
), incident_decisions AS (
 SELECT i.event_key,e.* FROM incident_facts i JOIN production_exception_decisions e
 ON e.id=i.decision_id OR EXISTS(SELECT 1 FROM quality_roots qr WHERE qr.root_id=i.quality_root AND qr.id=e.quality_inspection_id)
), incident_purchase_receipts(event_key,receipt_id,active) AS (
 SELECT i.event_key,d.replacement_receipt_id,CASE WHEN d.status='POSTED' THEN 1 ELSE 0 END
 FROM incident_facts i JOIN quality_roots qr ON qr.root_id=i.quality_root
 JOIN purchase_rejection_dispositions d ON d.quality_inspection_id=qr.id WHERE d.replacement_receipt_id IS NOT NULL
 UNION ALL
 SELECT p.event_key,d.replacement_receipt_id,CASE WHEN p.active=1 AND d.status='POSTED' THEN 1 ELSE 0 END
 FROM incident_purchase_receipts p JOIN purchase_rejection_dispositions d ON d.purchase_receipt_id=p.receipt_id WHERE d.replacement_receipt_id IS NOT NULL
), incident_branch_batches(event_key,batch_id) AS (
 SELECT e.event_key,b.id FROM incident_decisions e JOIN production_wip_batches b ON b.origin_exception_decision_id=e.id
 UNION
 SELECT i.event_key,d.result_wip_batch_id FROM incident_facts i JOIN quality_roots qr ON qr.root_id=i.quality_root
 JOIN outsourcing_return_dispositions d ON d.quality_inspection_id=qr.id WHERE d.status='POSTED' AND d.result_wip_batch_id IS NOT NULL
 UNION
 SELECT ib.event_key,b.id FROM incident_branch_batches ib JOIN production_wip_batches b ON b.source_batch_id=ib.batch_id
), incident_batches AS (
 SELECT i.event_key,i.batch_id FROM incident_facts i WHERE i.batch_id IS NOT NULL
 UNION SELECT event_key,batch_id FROM incident_branch_batches
), task_batches AS (
 SELECT t.id AS task_id,` + workflowTaskBatchIDSQL("t.source_type", "t.source_id") + ` AS batch_id FROM visible_tasks t
), incident_tasks AS (
 SELECT i.event_key,t.id AS task_id FROM incident_facts i JOIN quality_roots qr ON qr.root_id=i.quality_root
 JOIN visible_tasks t ON t.source_type='quality_inspection' AND t.source_id=qr.id
 UNION
 SELECT e.event_key,t.id FROM incident_decisions e JOIN visible_tasks t ON t.source_type='production_exception_decision' AND t.source_id=e.id
 UNION
 SELECT i.event_key,t.id FROM incident_facts i JOIN visible_tasks t ON t.source_type='purchase_receipt' AND t.source_id=i.purchase_receipt_id AND t.task_group IN ('handoff_receipt_exception','purchase_quality_exception')
 UNION
 SELECT i.event_key,t.id FROM incident_facts i JOIN quality_roots qr ON qr.root_id=i.quality_root
 JOIN purchase_rejection_dispositions d ON d.quality_inspection_id=qr.id
 JOIN visible_tasks t ON t.source_type='purchase_rejection_disposition' AND t.source_id=d.id
 UNION
 SELECT p.event_key,t.id FROM incident_purchase_receipts p JOIN visible_tasks t ON t.source_type='purchase_receipt' AND t.source_id=p.receipt_id
 UNION
 SELECT p.event_key,t.id FROM incident_purchase_receipts p JOIN quality_inspections q ON q.purchase_receipt_id=p.receipt_id
 JOIN visible_tasks t ON t.source_type='quality_inspection' AND t.source_id=q.id
 UNION
 SELECT p.event_key,t.id FROM incident_purchase_receipts p JOIN purchase_rejection_dispositions d ON d.purchase_receipt_id=p.receipt_id
 JOIN visible_tasks t ON t.source_type='purchase_rejection_disposition' AND t.source_id=d.id
 UNION
 SELECT ib.event_key,t.id FROM incident_batches ib JOIN task_batches tb ON tb.batch_id=ib.batch_id JOIN visible_tasks t ON t.id=tb.task_id JOIN incident_facts i ON i.event_key=ib.event_key
 WHERE tb.batch_id<>i.batch_id OR t.task_group='handoff_production_exception'
), states AS (
 SELECT i.*,COALESCE(b.batch_no,'') AS batch_no,
 COALESCE((SELECT e.decision_type FROM incident_decisions e WHERE e.event_key=i.event_key AND e.status NOT IN ('REJECTED','CANCELLED') ORDER BY e.id DESC LIMIT 1),
 (SELECT d.disposition_type FROM purchase_rejection_dispositions d WHERE d.quality_inspection_id=i.quality_id AND d.status<>'CANCELLED' ORDER BY d.id DESC LIMIT 1),
 (SELECT d.disposition_type FROM outsourcing_return_dispositions d WHERE d.quality_inspection_id=i.quality_id AND d.status<>'CANCELLED' ORDER BY d.id DESC LIMIT 1),'') AS disposition,
 CASE WHEN i.initial_state='corrected' THEN 'corrected'
 WHEN EXISTS(SELECT 1 FROM incident_decisions e WHERE e.event_key=i.event_key AND e.execution_status='APPLIED' AND (
 e.decision_type IN ('SCRAP','WIP_CONCESSION') OR (e.decision_type IN ('REWORK_ORIGINAL','REWORK_SWITCH','REMAKE')
 AND COALESCE((SELECT SUM(rb.quantity) FROM incident_branch_batches ib JOIN production_wip_batches rb ON rb.id=ib.batch_id
 WHERE ib.event_key=i.event_key AND rb.production_order_operation_id=b.production_order_operation_id AND rb.status='ACCEPTED'),0)>=b.quantity))) THEN 'closed'
 WHEN EXISTS(SELECT 1 FROM purchase_receipt_items ri WHERE ri.id=(SELECT purchase_receipt_item_id FROM quality_inspections WHERE id=i.quality_id)
 AND ri.quantity <= COALESCE((SELECT SUM(d.quantity) FROM purchase_rejection_dispositions d WHERE d.quality_inspection_id=i.quality_id AND d.status='POSTED'),0))
 AND NOT EXISTS(SELECT 1 FROM incident_purchase_receipts p JOIN purchase_receipts pr ON pr.id=p.receipt_id
 WHERE p.event_key=i.event_key AND p.active=1 AND pr.status<>'POSTED' AND (pr.status<>'DRAFT'
 OR NOT EXISTS(SELECT 1 FROM purchase_receipt_items ri WHERE ri.receipt_id=pr.id)
 OR EXISTS(SELECT 1 FROM purchase_receipt_items ri WHERE ri.receipt_id=pr.id AND ri.quantity>COALESCE((SELECT SUM(d.quantity) FROM purchase_rejection_dispositions d WHERE d.purchase_receipt_item_id=ri.id AND d.status='POSTED'),0)))) THEN 'closed'
 WHEN EXISTS(SELECT 1 FROM quality_inspections q JOIN outsourcing_facts f ON q.source_type='OUTSOURCING_FACT' AND f.id=q.source_id
 WHERE q.id=i.quality_id AND f.quantity<=COALESCE((SELECT SUM(d.quantity) FROM outsourcing_return_dispositions d
 LEFT JOIN production_wip_batches rb ON rb.id=d.result_wip_batch_id WHERE d.outsourcing_return_fact_id=f.id AND d.status='POSTED'
 AND (d.disposition_type='RETURN_TO_VENDOR' OR rb.status='ACCEPTED')),0)) THEN 'closed'
 WHEN EXISTS(SELECT 1 FROM incident_decisions e WHERE e.event_key=i.event_key AND e.status='APPROVED') THEN 'executing'
 ELSE 'open' END AS state
 FROM incident_facts i LEFT JOIN production_wip_batches b ON b.id=i.batch_id
), scoped_events AS (
 SELECT i.* FROM states i WHERE EXISTS(SELECT 1 FROM incident_tasks it JOIN matching_tasks mt ON mt.id=it.task_id WHERE it.event_key=i.event_key)
`
	if q.Keyword != "" {
		args = append(args, "%"+strings.ToLower(q.Keyword)+"%")
		p := fmt.Sprintf("$%d", len(args))
		cte += ` AND (LOWER(i.number) LIKE ` + p + ` OR LOWER(i.reason) LIKE ` + p + ` OR LOWER(i.batch_no) LIKE ` + p + ` OR EXISTS(SELECT 1 FROM incident_tasks it JOIN visible_tasks t ON t.id=it.task_id WHERE it.event_key=i.event_key AND (LOWER(t.task_name) LIKE ` + p + ` OR LOWER(COALESCE(t.source_no,'')) LIKE ` + p + ` OR EXISTS(SELECT 1 FROM task_sources ts JOIN sales_orders so ON ts.view_key='orders' AND so.id=ts.board_id WHERE ts.task_id=t.id AND LOWER(so.order_no) LIKE ` + p + `))))`
	}
	cte += `), selected_events AS (SELECT * FROM scoped_events`
	if q.State == "open" {
		cte += ` WHERE state IN ('open','executing')`
	}
	if q.State == "closed" {
		cte += ` WHERE state IN ('closed','corrected')`
	}
	return cte + `) `, args
}

func (r *workflowRepo) ListWorkflowExceptions(ctx context.Context, q biz.WorkflowExceptionQuery) (*biz.WorkflowExceptionBoard, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil {
		return nil, biz.ErrBadParam
	}
	result := &biz.WorkflowExceptionBoard{Items: []biz.WorkflowExceptionItem{}, Limit: q.Limit, Offset: q.Offset}
	err := (&businessProgressRepo{data: r.data}).read(ctx, func(tx *stdsql.Tx) error {
		cte, args := workflowExceptionCTE(q)
		if err := tx.QueryRowContext(ctx, cte+`SELECT COUNT(*),COALESCE(SUM(CASE WHEN state IN ('open','executing') THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN state IN ('closed','corrected') THEN 1 ELSE 0 END),0) FROM scoped_events`, args...).Scan(&result.Total, &result.Open, &result.Closed); err != nil {
			return err
		}
		if err := tx.QueryRowContext(ctx, cte+`SELECT COUNT(DISTINCT t.id) FROM selected_events e JOIN incident_tasks it ON it.event_key=e.event_key JOIN visible_tasks t ON t.id=it.task_id WHERE t.task_status_key IN ('ready','blocked')`, args...).Scan(&result.PendingTasks); err != nil {
			return err
		}
		if err := tx.QueryRowContext(ctx, cte+`SELECT COUNT(DISTINCT s.board_id) FROM selected_events e JOIN incident_tasks it ON it.event_key=e.event_key JOIN task_sources s ON s.task_id=it.task_id WHERE s.view_key='orders'`, args...).Scan(&result.AffectedOrders); err != nil {
			return err
		}
		if q.State == "open" {
			result.Total = result.Open
		}
		if q.State == "closed" {
			result.Total = result.Closed
		}
		pageArgs := append(append([]any{}, args...), q.Limit, q.Offset)
		result.ViewTotal = result.Total
		if q.View == "tasks" || q.View == "orders" {
			if q.View == "orders" {
				result.ViewTotal = result.AffectedOrders
				rows, err := tx.QueryContext(ctx, cte+fmt.Sprintf(`SELECT DISTINCT so.id,so.order_no FROM selected_events e JOIN incident_tasks it ON it.event_key=e.event_key JOIN task_sources s ON s.task_id=it.task_id AND s.view_key='orders' JOIN sales_orders so ON so.id=s.board_id ORDER BY so.id DESC LIMIT $%d OFFSET $%d`, len(args)+1, len(args)+2), pageArgs...)
				if err != nil {
					return err
				}
				defer func() { _ = rows.Close() }()
				for rows.Next() {
					var order biz.WorkflowExceptionOrder
					if err = rows.Scan(&order.ID, &order.Number); err != nil {
						return err
					}
					result.Orders = append(result.Orders, order)
				}
				return rows.Err()
			}
			result.ViewTotal = result.PendingTasks
			rows, err := tx.QueryContext(ctx, cte+fmt.Sprintf(`SELECT DISTINCT t.id FROM selected_events e JOIN incident_tasks it ON it.event_key=e.event_key JOIN visible_tasks t ON t.id=it.task_id WHERE t.task_status_key IN ('ready','blocked') ORDER BY t.id DESC LIMIT $%d OFFSET $%d`, len(args)+1, len(args)+2), pageArgs...)
			if err != nil {
				return err
			}
			ids := []int{}
			for rows.Next() {
				var id int
				if err = rows.Scan(&id); err != nil {
					_ = rows.Close()
					return err
				}
				ids = append(ids, id)
			}
			err = rows.Err()
			_ = rows.Close()
			if err != nil {
				return err
			}
			driver := r.data.sqlDialect
			if driver == "" {
				driver = dialect.Postgres
			}
			client := newBusinessEntClient(ent.Driver(entsql.NewDriver(driver, entsql.Conn{ExecQuerier: tx})))
			entities, err := client.WorkflowTask.Query().Where(workflowtask.IDIn(ids...)).Order(ent.Desc(workflowtask.FieldID)).All(ctx)
			if err != nil {
				return err
			}
			for _, entity := range entities {
				result.Tasks = append(result.Tasks, entWorkflowTaskToBiz(entity))
			}
			return hydrateWorkflowTaskDiscovery(ctx, client, result.Tasks)
		}
		rows, err := tx.QueryContext(ctx, cte+fmt.Sprintf(`SELECT event_key,number,reason,state,disposition,batch_no,CAST(occurred_at AS TEXT) FROM selected_events ORDER BY occurred_at DESC,event_key LIMIT $%d OFFSET $%d`, len(args)+1, len(args)+2), pageArgs...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var item biz.WorkflowExceptionItem
			if err = rows.Scan(&item.Key, &item.Number, &item.Reason, &item.State, &item.Disposition, &item.BatchNo, &item.OccurredAt); err != nil {
				_ = rows.Close()
				return err
			}
			item.TaskIDs = []int{}
			item.Orders = []biz.WorkflowExceptionOrder{}
			result.Items = append(result.Items, item)
		}
		err = rows.Err()
		_ = rows.Close()
		if err != nil {
			return err
		}

		if len(result.Items) == 0 {
			return nil
		}
		eventArgs := append([]any{}, args...)
		slots := []string{}
		byKey := map[string]*biz.WorkflowExceptionItem{}
		for index := range result.Items {
			item := &result.Items[index]
			byKey[item.Key] = item
			eventArgs = append(eventArgs, item.Key)
			slots = append(slots, fmt.Sprintf("$%d", len(eventArgs)))
		}
		pageEvents := strings.Join(slots, ",")
		rows, err = tx.QueryContext(ctx, cte+`SELECT it.event_key,it.task_id FROM incident_tasks it JOIN visible_tasks t ON t.id=it.task_id WHERE it.event_key IN (`+pageEvents+`) ORDER BY CASE WHEN t.task_status_key IN ('ready','blocked') THEN 0 ELSE 1 END,t.id`, eventArgs...)
		if err != nil {
			return err
		}
		allIDs := map[int]bool{}
		for rows.Next() {
			var key string
			var id int
			if err = rows.Scan(&key, &id); err != nil {
				_ = rows.Close()
				return err
			}
			item := byKey[key]
			item.TaskIDs = append(item.TaskIDs, id)
			if len(item.TaskIDs) <= 100 {
				allIDs[id] = true
			}
		}
		err = rows.Err()
		_ = rows.Close()
		if err != nil {
			return err
		}
		ids := make([]int, 0, len(allIDs))
		for id := range allIDs {
			ids = append(ids, id)
		}
		driver := r.data.sqlDialect
		if driver == "" {
			driver = dialect.Postgres
		}
		client := newBusinessEntClient(ent.Driver(entsql.NewDriver(driver, entsql.Conn{ExecQuerier: tx})))
		entities, err := client.WorkflowTask.Query().Where(workflowtask.IDIn(ids...)).All(ctx)
		if err != nil {
			return err
		}
		summaries := make([]*biz.WorkflowTask, 0, len(entities))
		taskByID := map[int]*biz.WorkflowTask{}
		for _, entity := range entities {
			task := entWorkflowTaskToBiz(entity)
			summaries = append(summaries, task)
			taskByID[task.ID] = task
		}
		if err = hydrateWorkflowTaskDiscovery(ctx, client, summaries); err != nil {
			return err
		}
		for index := range result.Items {
			item := &result.Items[index]
			for position, id := range item.TaskIDs {
				if position == 100 {
					break
				}
				item.Tasks = append(item.Tasks, taskByID[id])
			}
		}
		rows, err = tx.QueryContext(ctx, cte+`SELECT DISTINCT it.event_key,so.id,so.order_no FROM incident_tasks it JOIN task_sources s ON s.task_id=it.task_id AND s.view_key='orders' JOIN sales_orders so ON so.id=s.board_id WHERE it.event_key IN (`+pageEvents+`) ORDER BY it.event_key,so.id`, eventArgs...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var key string
			var order biz.WorkflowExceptionOrder
			if err = rows.Scan(&key, &order.ID, &order.Number); err != nil {
				_ = rows.Close()
				return err
			}
			byKey[key].Orders = append(byKey[key].Orders, order)
		}
		err = rows.Err()
		_ = rows.Close()
		if err != nil {
			return err
		}

		return nil
	})
	return result, err
}
