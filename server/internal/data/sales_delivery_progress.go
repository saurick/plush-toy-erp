package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"server/internal/biz"
	"server/internal/data/model/ent/workflowtask"
)

func (r *businessProgressRepo) GetSalesDeliveryProgress(ctx context.Context, q biz.BusinessProgressQuery) (*biz.SalesDeliveryProgress, error) {
	out := &biz.SalesDeliveryProgress{
		OrderID: q.ID, SnapshotAt: q.SnapshotAt, Lines: []*biz.BusinessProgressRow{}, Recent: []biz.SalesDeliveryMilestone{},
	}
	err := r.readProgress(ctx, q, func(tx *sql.Tx) error {
		if err := tx.QueryRowContext(ctx, `SELECT s.order_no,s.lifecycle_status,
 COALESCE(NULLIF(s.customer_snapshot->>'name',''),c.name,''),COALESCE(s.sales_owner,'')
 FROM sales_orders s JOIN customers c ON c.id=s.customer_id WHERE s.id=$1`, q.ID).
			Scan(&out.Label, &out.Status, &out.Customer, &out.Owner); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return biz.ErrSalesOrderNotFound
			}
			return err
		}
		results := &biz.BusinessProgressBoard{Rows: out.Lines}
		if err := loadBusinessProgressDelivery(ctx, tx, q, r.data.sqlDialect, results); err != nil {
			return err
		}
		out.Lines, out.Total = results.Rows, results.Total
		out.TasksAvailable = q.TaskVisibility != nil
		if !out.TasksAvailable {
			return nil
		}
		return loadSalesDeliveryMilestones(ctx, tx, r.data.sqlDialect, q.ID, q.TaskVisibility, out)
	})
	return out, err
}

// Order readers can see the responsibility and status of linked fulfillment
// milestones. Names of manual tasks and event text keep task-level visibility.
func loadSalesDeliveryMilestones(ctx context.Context, tx *sql.Tx, dialect string, orderID int, visibility *biz.WorkflowTaskVisibilityScope, result *biz.SalesDeliveryProgress) error {
	readable, args := workflowTaskVisibilitySQL(visibility, workflowtask.FieldID)
	args = append(args, orderID)
	orderFilter := fmt.Sprintf("$%d", len(args))
	stage := workflowTaskStageSQL(func(column string) string { return "t." + column })
	date := progressDateSQL("CASE WHEN t.task_status_key IN ('ready','blocked') THEN t.due_at ELSE COALESCE(t.completed_at,t.updated_at) END", dialect)
	query := `WITH readable_tasks AS NOT MATERIALIZED (` + readable + `), visible_tasks AS NOT MATERIALIZED (
 SELECT id,source_type,source_id FROM workflow_tasks WHERE source_type IS NOT NULL
), ` + workflowTaskSourceLinksCTE + `
 SELECT ` + stage + `,t.task_status_key,t.owner_role_key,
 CASE WHEN t.assignee_id IS NOT NULL THEN COALESCE(NULLIF(a.display_name,''),'已指定办理人') ELSE '' END,` + date + `,
 CASE WHEN r.id IS NOT NULL THEN t.task_name END,
 CASE WHEN r.id IS NOT NULL AND t.task_status_key='blocked' THEN t.blocked_reason ELSE e.reason END,
 e.event_type,e.payload->'feedback',
 CASE WHEN lower(t.source_type)='sales_order' THEN 1 ELSE 0 END
 FROM task_sources x JOIN workflow_tasks t ON t.id=x.task_id
 LEFT JOIN readable_tasks r ON r.id=t.id LEFT JOIN admin_users a ON a.id=t.assignee_id
 LEFT JOIN workflow_task_events e ON r.id IS NOT NULL AND t.task_status_key IN ('done','rejected','withdrawn')
 AND e.id=(SELECT event.id FROM workflow_task_events event WHERE event.task_id=t.id
  AND event.to_status_key=t.task_status_key ORDER BY event.id DESC LIMIT 1)
 WHERE x.view_key='orders' AND x.board_id=` + orderFilter + `
 ORDER BY CASE WHEN t.task_status_key='blocked' THEN 0 WHEN t.task_status_key='ready' THEN 1 ELSE 2 END,
 CASE WHEN t.task_status_key IN ('ready','blocked') THEN t.due_at END NULLS LAST,
 CASE WHEN t.task_status_key NOT IN ('ready','blocked') THEN COALESCE(t.completed_at,t.updated_at) END DESC NULLS LAST,t.id DESC`
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return err
	}
	stages := make(map[string]biz.WorkflowTaskStage)
	for _, stage := range biz.WorkflowTaskStages() {
		stages[stage.Key] = stage
	}
	for rows.Next() {
		var direct int
		var item biz.SalesDeliveryMilestone
		var stageKey string
		var date, name, reason, eventType sql.NullString
		var rawFeedback []byte
		if err := rows.Scan(&stageKey, &item.Status, &item.Role, &item.Assignee, &date, &name, &reason, &eventType, &rawFeedback, &direct); err != nil {
			return errors.Join(err, rows.Close())
		}
		if !name.Valid && stages[stageKey].Chain != "fulfillment" && direct != 1 {
			continue
		}
		item.Label = name.String
		if !name.Valid {
			item.Label = stages[stageKey].Label
		}
		var feedback string
		if len(rawFeedback) != 0 && json.Unmarshal(rawFeedback, &feedback) != nil {
			feedback = ""
		}
		item.Date = progressDate(date.String)
		item.Reason = workflowEventResultText(eventType.String, item.Status, reason.String, feedback)
		if item.Status == "ready" || item.Status == "blocked" {
			if result.Current == nil {
				result.Current = &item
			}
		} else {
			result.Recent = append(result.Recent, item)
			if len(result.Recent) == 6 {
				break
			}
		}
	}
	return errors.Join(rows.Err(), rows.Close())
}
