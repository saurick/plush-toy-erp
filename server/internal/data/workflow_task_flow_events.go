package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"strings"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminuser"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"
)

func (r *workflowRepo) ListWorkflowTaskFlowEvents(ctx context.Context, taskID, limit, beforeEventID int, scope *biz.WorkflowTaskVisibilityScope) ([]*biz.WorkflowTaskFlowEvent, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil || taskID <= 0 || limit < 1 || limit > biz.WorkflowTaskEventPageMaxLimit+1 || beforeEventID < 0 || scope == nil {
		return nil, biz.ErrBadParam
	}
	result := []*biz.WorkflowTaskFlowEvent{}
	reader := &businessProgressRepo{data: r.data}
	err := reader.read(ctx, func(tx *stdsql.Tx) error {
		cte, args := workflowHandlingChainSQL(taskID, biz.WorkflowHandlingChainTaskView, scope)
		var anchorID int
		if err := tx.QueryRowContext(ctx, cte+fmt.Sprintf(" SELECT id FROM visible_tasks WHERE id=$%d", len(args)), args...).Scan(&anchorID); err != nil {
			if errors.Is(err, stdsql.ErrNoRows) {
				return biz.ErrWorkflowTaskNotFound
			}
			return err
		}
		query := cte + " SELECT e.id FROM workflow_task_events e JOIN chain_tasks t ON t.id=e.task_id"
		if beforeEventID > 0 {
			args = append(args, beforeEventID)
			query += fmt.Sprintf(" WHERE e.id<$%d", len(args))
		}
		args = append(args, limit)
		query += fmt.Sprintf(" ORDER BY e.id DESC LIMIT $%d", len(args))
		rows, err := tx.QueryContext(ctx, query, args...)
		if err != nil {
			return err
		}
		ids := make([]int, 0, limit)
		for rows.Next() {
			var id int
			if err := rows.Scan(&id); err != nil {
				_ = rows.Close()
				return err
			}
			ids = append(ids, id)
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return err
		}
		if err := rows.Close(); err != nil {
			return err
		}
		if len(ids) == 0 {
			return nil
		}
		d := r.data.sqlDialect
		if d == "" {
			d = dialect.Postgres
		}
		client := newBusinessEntClient(ent.Driver(entsql.NewDriver(d, entsql.Conn{ExecQuerier: tx})))
		events, err := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.IDIn(ids...)).
			WithTask(func(q *ent.WorkflowTaskQuery) {
				q.Select(workflowtask.FieldID, workflowtask.FieldTaskName, workflowtask.FieldTaskGroup, workflowtask.FieldOwnerRoleKey, workflowtask.FieldRequiredCapabilityKey, workflowtask.FieldSourceType, workflowtask.FieldSourceID)
			}).Order(ent.Desc(workflowtaskevent.FieldID)).All(ctx)
		if err != nil {
			return err
		}
		actorIDs := map[int]bool{}
		for _, event := range events {
			if event.ActorID != nil && *event.ActorID > 0 {
				actorIDs[*event.ActorID] = true
			}
		}
		people := map[int]*ent.AdminUser{}
		if len(actorIDs) > 0 {
			ids := make([]int, 0, len(actorIDs))
			for id := range actorIDs {
				ids = append(ids, id)
			}
			actors, err := client.AdminUser.Query().Where(adminuser.IDIn(ids...)).Select(adminuser.FieldID, adminuser.FieldUsername, adminuser.FieldDisplayName).All(ctx)
			if err != nil {
				return err
			}
			for _, actor := range actors {
				people[actor.ID] = actor
			}
		}
		for _, row := range events {
			if row.Edges.Task == nil {
				return biz.ErrWorkflowTaskNotFound
			}
			event := &biz.WorkflowTaskEvent{ID: row.ID, TaskID: row.TaskID, TaskVersion: row.TaskVersion, EventType: row.EventType, FromStatusKey: row.FromStatusKey, ToStatusKey: row.ToStatusKey, ActorRoleKey: row.ActorRoleKey, Reason: row.Reason, CreatedAt: row.CreatedAt}
			if row.ActorID != nil {
				if actor := people[*row.ActorID]; actor != nil {
					event.ActorUsername = strings.TrimSpace(actor.Username)
					event.ActorDisplayName = strings.TrimSpace(stringValue(actor.DisplayName))
				}
			}
			// Task snapshots and command receipts are not part of a cross-role record.
			event.Payload = map[string]any{}
			for _, key := range []string{"from_business_status_key", "to_business_status_key", "feedback"} {
				if value, ok := row.Payload[key].(string); ok {
					event.Payload[key] = value
				}
			}
			result = append(result, &biz.WorkflowTaskFlowEvent{Event: event, Task: entWorkflowTaskToBiz(row.Edges.Task)})
		}
		return nil
	})
	return result, err
}
