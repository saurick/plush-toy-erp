package data

import (
	"context"
	stdsql "database/sql"
	"fmt"

	"server/internal/biz"
)

func (r *workflowRepo) GetWorkflowHandlingChain(ctx context.Context, taskID int, view biz.WorkflowHandlingChainView, scope *biz.WorkflowTaskVisibilityScope) (*biz.WorkflowHandlingChain, error) {
	return r.GetWorkflowHandlingChainPage(ctx, taskID, view, scope, 0)
}

func (r *workflowRepo) GetWorkflowHandlingChainPage(ctx context.Context, taskID int, view biz.WorkflowHandlingChainView, scope *biz.WorkflowTaskVisibilityScope, offset int) (*biz.WorkflowHandlingChain, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil || taskID <= 0 || offset < 0 || scope == nil || (view != biz.WorkflowHandlingChainTaskView && view != biz.WorkflowHandlingChainOrderView && view != biz.WorkflowHandlingChainLinkView) {
		return nil, biz.ErrBadParam
	}
	result := &biz.WorkflowHandlingChain{Items: []biz.WorkflowHandlingChainItem{}}
	reader := &businessProgressRepo{data: r.data}
	err := reader.read(ctx, func(tx *stdsql.Tx) error {
		visible, args := progressTaskSQL(biz.BusinessProgressQuery{Access: biz.BusinessProgressAccess{Tasks: true}, TaskVisibility: scope})
		args = append(args, taskID)
		anchor := fmt.Sprintf("$%d", len(args))
		contextTasks := "SELECT * FROM visible_tasks"
		if view == biz.WorkflowHandlingChainLinkView {
			contextTasks += " UNION SELECT * FROM workflow_tasks WHERE id=" + anchor
		}
		// Task detail follows the exact source, batch or exception identity. Sharing
		// a sales order is only sufficient in the explicitly requested order view.
		relation := `CASE
 WHEN a.task_group='business_followup' OR t.task_group='business_followup' THEN t.id=a.id
 WHEN a.chain_exception_id>0 THEN t.chain_exception_id=a.chain_exception_id
 WHEN a.chain_rework_id>0 THEN t.chain_rework_id=a.chain_rework_id
 WHEN a.process_instance_id>0 THEN t.process_instance_id=a.process_instance_id
 WHEN a.chain_batch_id>0 THEN t.chain_batch_id=a.chain_batch_id
 WHEN a.chain_receipt_id>0 THEN t.chain_receipt_id=a.chain_receipt_id
 ELSE t.source_type=a.source_type AND t.source_id=a.source_id END`
		if view == biz.WorkflowHandlingChainOrderView {
			relation = `t.source_type=a.source_type AND t.source_id=a.source_id
 OR EXISTS(SELECT 1 FROM task_sources s JOIN task_sources x ON x.view_key=s.view_key AND x.board_id=s.board_id
 WHERE s.task_id=t.id AND x.task_id=a.id AND (x.view_key='orders' OR NOT EXISTS(SELECT 1 FROM task_sources z WHERE z.task_id=a.id AND z.view_key='orders')))`
		}
		query := "WITH RECURSIVE visible_tasks AS (" + visible + "),context_tasks AS (" + contextTasks + ")," + workflowTaskSourceLinksCTE + `,
receipt_roots(receipt_id,root_id) AS (
 SELECT p.id,p.id FROM purchase_receipts p WHERE NOT EXISTS(SELECT 1 FROM purchase_rejection_dispositions d WHERE d.replacement_receipt_id=p.id)
 UNION ALL SELECT d.replacement_receipt_id,r.root_id FROM receipt_roots r JOIN purchase_rejection_dispositions d ON d.purchase_receipt_id=r.receipt_id WHERE d.replacement_receipt_id IS NOT NULL
),
task_batches AS (
 SELECT t.id AS task_id,b.id AS batch_id FROM context_tasks t JOIN production_wip_batches b ON t.source_type='production_wip_batch' AND t.source_id=b.id
 UNION SELECT t.id,q.production_wip_batch_id FROM context_tasks t JOIN quality_inspections q ON t.source_type='quality_inspection' AND t.source_id=q.id WHERE q.production_wip_batch_id IS NOT NULL
 UNION SELECT t.id,f.production_wip_batch_id FROM context_tasks t JOIN production_facts f ON t.source_type IN ('production_fact','production-progress') AND t.source_id=f.id WHERE f.production_wip_batch_id IS NOT NULL
 UNION SELECT t.id,o.source_wip_batch_id FROM context_tasks t JOIN outsourcing_orders o ON t.source_type='outsourcing_order' AND t.source_id=o.id WHERE o.source_wip_batch_id IS NOT NULL
 UNION SELECT t.id,e.production_wip_batch_id FROM context_tasks t JOIN production_exception_decisions e ON t.source_type='production_exception_decision' AND t.source_id=e.id WHERE e.production_wip_batch_id IS NOT NULL
 UNION SELECT t.id,o.source_wip_batch_id FROM context_tasks t JOIN outsourcing_facts f ON t.source_type='outsourcing_fact' AND t.source_id=f.id JOIN outsourcing_orders o ON f.source_type='OUTSOURCING_ORDER' AND o.id=f.source_id WHERE o.source_wip_batch_id IS NOT NULL
 UNION SELECT t.id,o.source_wip_batch_id FROM context_tasks t JOIN quality_inspections q ON t.source_type='quality_inspection' AND t.source_id=q.id JOIN outsourcing_facts f ON q.source_type='OUTSOURCING_FACT' AND q.source_id=f.id JOIN outsourcing_orders o ON f.source_type='OUTSOURCING_ORDER' AND o.id=f.source_id WHERE o.source_wip_batch_id IS NOT NULL
), task_context AS (
 SELECT t.*,b.id AS chain_batch_id,COALESCE(b.batch_no,'') AS chain_batch_no,COALESCE(o.operation_code,'') AS chain_operation_code,
 COALESCE(e.id,0) AS chain_exception_id,COALESCE(e.decision_no,'') AS chain_exception_no,COALESCE(eo.operation_code,'') AS chain_exception_operation_code,
 COALESCE(CASE WHEN f.fact_type='REWORK' THEN f.id END,b.origin_rework_fact_id,0) AS chain_rework_id,
 COALESCE(rr.root_id,0) AS chain_receipt_id
 FROM context_tasks t LEFT JOIN task_batches x ON x.task_id=t.id
 LEFT JOIN production_wip_batches b ON b.id=x.batch_id LEFT JOIN production_order_operations o ON o.id=b.production_order_operation_id
 LEFT JOIN production_facts f ON t.source_type IN ('production_fact','production-progress') AND t.source_id=f.id
 LEFT JOIN quality_inspections q ON t.source_type='quality_inspection' AND t.source_id=q.id
 LEFT JOIN purchase_receipt_items ri ON ri.id=q.purchase_receipt_item_id
 LEFT JOIN purchase_rejection_dispositions pd ON t.source_type='purchase_rejection_disposition' AND t.source_id=pd.id
 LEFT JOIN receipt_roots rr ON rr.receipt_id=COALESCE(CASE WHEN t.source_type='purchase_receipt' THEN t.source_id END,ri.receipt_id,pd.purchase_receipt_id)
 LEFT JOIN production_exception_decisions e ON e.id=COALESCE(CASE WHEN t.source_type='production_exception_decision' THEN t.source_id END,b.origin_exception_decision_id,
 CASE WHEN t.task_group='handoff_production_exception' THEN (SELECT d.id FROM production_exception_decisions d WHERE d.production_wip_batch_id=b.id ORDER BY d.id DESC LIMIT 1) END)
 LEFT JOIN production_wip_batches eb ON eb.id=e.production_wip_batch_id LEFT JOIN production_order_operations eo ON eo.id=eb.production_order_operation_id
), chain_tasks AS (
 SELECT DISTINCT t.* FROM task_context t WHERE t.id IN (SELECT id FROM visible_tasks) AND EXISTS(SELECT 1 FROM task_context a WHERE a.id=` + anchor + ` AND (t.id=a.id OR (` + relation + `)))
)
 SELECT t.id,t.task_name,t.task_group,t.task_status_key,t.owner_role_key,t.source_type,COALESCE(t.source_no,''),
 COALESCE(t.process_instance_id,0),t.chain_operation_code,t.chain_batch_no,t.chain_exception_id,t.chain_exception_no,t.chain_exception_operation_code,
 ` + workflowTaskStageSQL(func(name string) string { return "t." + name }) + `,COALESCE(t.assignee_id,0),COALESCE((SELECT COALESCE(NULLIF(display_name,''),username) FROM admin_users WHERE id=t.assignee_id),'')
 FROM chain_tasks t
 ORDER BY CASE WHEN t.id=` + anchor + ` THEN 0 WHEN t.task_status_key IN ('ready','blocked') THEN 1 ELSE 2 END,t.created_at,t.id LIMIT 101 OFFSET ` + fmt.Sprint(offset)
		rows, err := tx.QueryContext(ctx, query, args...)
		if err != nil {
			return err
		}
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var item biz.WorkflowHandlingChainItem
			var stageKey, assigneeName string
			if err := rows.Scan(&item.ID, &item.Name, &item.Group, &item.Status, &item.OwnerRoleKey, &item.SourceType, &item.SourceNo, &item.ProcessInstanceID, &item.OperationCode, &item.BatchNo, &item.ExceptionID, &item.ExceptionNo, &item.ExceptionOperationCode, &stageKey, &item.AssigneeID, &assigneeName); err != nil {
				return err
			}
			if len(result.Items) == 100 {
				result.Truncated = true
				continue
			}
			item.Discovery = biz.WorkflowTaskDiscoveryFor(stageKey, assigneeName)
			result.Items = append(result.Items, item)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		if len(result.Items) == 0 && offset == 0 {
			return biz.ErrWorkflowTaskNotFound
		}
		return nil
	})
	return result, err
}
