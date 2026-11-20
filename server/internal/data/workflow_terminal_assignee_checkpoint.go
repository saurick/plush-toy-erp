package data

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
)

// TerminalAssigneeCheckpointResult describes maintenance receipts only. No
// assignment, status, responsibility or business fact is changed.
type TerminalAssigneeCheckpointResult struct {
	Applied         bool `json:"applied"`
	Captured        int  `json:"captured"`
	AlreadyCaptured int  `json:"already_captured"`
}

const terminalAssigneeCheckpointCommand = "checkpoint_terminal_assignee"

// CheckpointTerminalTaskAssignees records the current, independently backed-up
// assignments before the responsibility migration can clear them. It cannot
// recover a target that has already run that migration; use the recovery path.
func CheckpointTerminalTaskAssignees(ctx context.Context, target, historical *sql.DB, proof TerminalAssigneeBackup, actorID int, apply bool) (*TerminalAssigneeCheckpointResult, error) {
	if target == nil || historical == nil || target == historical || actorID <= 0 ||
		proof.ID == "" || len(proof.ID) > 128 || proof.VerifiedAt.IsZero() ||
		!regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(proof.SHA256) ||
		!regexp.MustCompile(`^[0-9]{14}$`).MatchString(proof.MigrationVersion) || proof.MigrationVersion >= "20261010185222" {
		return nil, fmt.Errorf("verified pre-responsibility-migration backup and maintenance actor are required")
	}
	history, err := historical.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return nil, err
	}
	defer func() { _ = history.Rollback() }()
	tx, err := target.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	for _, connection := range []*sql.Tx{tx, history} {
		var version string
		if err = connection.QueryRowContext(ctx, `SELECT max(version) FROM atlas_schema_revisions.atlas_schema_revisions`).Scan(&version); err != nil || version != proof.MigrationVersion {
			return nil, fmt.Errorf("target and restored backup must match the proven pre-upgrade migration")
		}
	}
	result, err := checkpointTerminalTaskAssignees(ctx, tx, history, proof, actorID)
	if err != nil {
		return nil, err
	}
	result.Applied = apply
	if apply {
		if err = tx.Commit(); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func checkpointTerminalTaskAssignees(ctx context.Context, tx, history *sql.Tx, proof TerminalAssigneeBackup, actorID int) (*TerminalAssigneeCheckpointResult, error) {
	for _, connection := range []*sql.Tx{tx, history} {
		if _, err := connection.ExecContext(ctx, `SET LOCAL TIME ZONE 'UTC'`); err != nil {
			return nil, err
		}
	}
	if _, err := tx.ExecContext(ctx, `SET LOCAL lock_timeout='5s'; LOCK TABLE workflow_tasks,workflow_task_events IN SHARE ROW EXCLUSIVE MODE`); err != nil {
		return nil, err
	}
	var actorEnabled bool
	if err := tx.QueryRowContext(ctx, `SELECT is_super_admin AND NOT disabled AND revoked_at IS NULL FROM admin_users WHERE id=$1 FOR SHARE`, actorID).Scan(&actorEnabled); err != nil || !actorEnabled {
		return nil, fmt.Errorf("maintenance actor must be an enabled super administrator")
	}
	var migrated bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM workflow_task_events WHERE payload->>'source'='production_task_responsibility_migration')`).Scan(&migrated); err != nil || migrated {
		return nil, fmt.Errorf("responsibility migration has already run; checkpoint cannot reconstruct earlier assignments")
	}
	rows, err := tx.QueryContext(ctx, `SELECT t.id FROM workflow_tasks t
WHERE t.task_group IN ('handoff_purchase_arrival','handoff_production_completion','handoff_production_exception')
AND t.payload->>'source_task_producer'='fulfillment.source' AND t.payload->>'source_task_contract'='workflow.source-task/v1'
AND t.owner_role_key<>CASE WHEN t.task_group='handoff_production_exception' THEN 'sales' ELSE 'warehouse' END
AND t.task_status_key IN ('done','rejected','withdrawn') ORDER BY t.id`)
	if err != nil {
		return nil, err
	}
	var ids []int
	for rows.Next() {
		var id int
		if err = rows.Scan(&id); err != nil {
			_ = rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	if err = rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	if err = rows.Close(); err != nil {
		return nil, err
	}
	result := &TerminalAssigneeCheckpointResult{}
	for _, id := range ids {
		captured, err := checkpointTerminalTaskAssignee(ctx, tx, history, proof, actorID, id)
		if err != nil {
			return nil, err
		}
		if captured {
			result.Captured++
		} else {
			result.AlreadyCaptured++
		}
	}
	return result, nil
}

func terminalCheckpointRow(ctx context.Context, tx *sql.Tx, id int) (string, error) {
	var row string
	err := tx.QueryRowContext(ctx, `SELECT to_jsonb(t)::text FROM workflow_tasks t WHERE id=$1`, id).Scan(&row)
	return row, err
}

func checkpointTerminalTaskAssignee(ctx context.Context, tx, history *sql.Tx, proof TerminalAssigneeBackup, actorID, id int) (bool, error) {
	current, err := terminalCheckpointRow(ctx, tx, id)
	if err != nil {
		return false, err
	}
	var task workflowTaskMutationResultTaskV1
	if err = json.Unmarshal([]byte(current), &task); err != nil {
		return false, err
	}
	if _, err = task.toBiz(); err != nil {
		return false, fmt.Errorf("task %d current snapshot is invalid", id)
	}
	var existing string
	err = tx.QueryRowContext(ctx, `SELECT mutation_result::text FROM workflow_task_events
WHERE task_id=$1 AND task_version=$2 AND command_key=$3 AND payload->>'backup_sha256'=$4`, id, task.Version, terminalAssigneeCheckpointCommand, proof.SHA256).Scan(&existing)
	if err == nil {
		var envelope workflowTaskMutationResultEnvelopeV1
		if err = json.Unmarshal([]byte(existing), &envelope); err != nil || envelope.Contract != workflowTaskMutationResultContractV1 || envelope.Task == nil {
			return false, fmt.Errorf("task %d checkpoint receipt is invalid", id)
		}
		currentSnapshot, marshalErr := json.Marshal(task)
		receiptSnapshot, receiptErr := json.Marshal(envelope.Task)
		if marshalErr != nil || receiptErr != nil || !bytes.Equal(currentSnapshot, receiptSnapshot) {
			return false, fmt.Errorf("task %d checkpoint receipt is invalid", id)
		}
		return false, nil
	}
	if err != sql.ErrNoRows {
		return false, err
	}
	before, err := terminalCheckpointRow(ctx, history, id)
	if err != nil || before != current {
		return false, fmt.Errorf("task %d differs from the verified backup", id)
	}
	oldHistory, err := terminalHistory(ctx, history, int64(id), int64(task.Version))
	if err != nil {
		return false, err
	}
	currentHistory, err := terminalHistory(ctx, tx, int64(id), int64(task.Version))
	if err != nil {
		return false, err
	}
	if oldHistory == "[]" || oldHistory != currentHistory {
		return false, fmt.Errorf("task %d immutable history differs from the verified backup", id)
	}
	if task.AssigneeID != nil {
		var oldName, currentName string
		if *task.AssigneeID <= 0 {
			return false, fmt.Errorf("task %d assignment is invalid", id)
		}
		if err = history.QueryRowContext(ctx, `SELECT username FROM admin_users WHERE id=$1`, *task.AssigneeID).Scan(&oldName); err != nil {
			return false, fmt.Errorf("task %d backup assignee is missing", id)
		}
		if err = tx.QueryRowContext(ctx, `SELECT username FROM admin_users WHERE id=$1`, *task.AssigneeID).Scan(&currentName); err != nil || oldName != currentName {
			return false, fmt.Errorf("task %d assignee identity differs from backup", id)
		}
	}
	if _, err = tx.ExecContext(ctx, `UPDATE workflow_tasks SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id); err != nil {
		return false, err
	}
	checkpoint, err := terminalCheckpointRow(ctx, tx, id)
	if err != nil {
		return false, err
	}
	if err = json.Unmarshal([]byte(checkpoint), &task); err != nil {
		return false, err
	}
	bizTask, err := task.toBiz()
	if err != nil {
		return false, err
	}
	receipt, err := workflowTaskMutationResultMap(bizTask)
	if err != nil {
		return false, err
	}
	encoded, err := json.Marshal(receipt)
	if err != nil {
		return false, err
	}
	intent := sha256.Sum256(encoded)
	payload, err := json.Marshal(map[string]any{"source": "terminal_task_assignee_checkpoint", "backup_id": proof.ID, "backup_sha256": proof.SHA256, "backup_migration_version": proof.MigrationVersion})
	if err != nil {
		return false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO workflow_task_events(task_id,task_version,event_type,from_status_key,to_status_key,actor_id,reason,payload,created_at,idempotency_key,intent_hash,command_key,mutation_result)
VALUES($1,$2,'source_updated',$3,$3,$4,'升级前按已验证备份保全终态任务办理快照',$5::jsonb,CURRENT_TIMESTAMP,$6,$7,$8,$9::jsonb)`, id, task.Version, task.TaskStatusKey, actorID, string(payload), fmt.Sprintf("terminal-assignee-checkpoint:%d:%d", id, task.Version), hex.EncodeToString(intent[:]), terminalAssigneeCheckpointCommand, string(encoded))
	return err == nil, err
}
