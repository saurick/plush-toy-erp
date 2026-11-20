package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"time"
)

// TerminalAssigneeBackup identifies a verified backup made before the
// responsibility migration. The command verifies the original dump and receipt;
// the repository additionally compares immutable history inside both databases.
type TerminalAssigneeBackup struct {
	ID               string
	SHA256           string
	MigrationVersion string
	VerifiedAt       time.Time
}

type TerminalAssigneeRecoveryResult struct {
	Applied             bool `json:"applied"`
	Restored            int  `json:"restored"`
	ConfirmedUnassigned int  `json:"confirmed_unassigned"`
}

type terminalAssigneeSnapshot struct {
	ID, Version, SourceID                   int64
	Code, Group, SourceType, Status, Intent string
	CreatedAt                               time.Time
	Assignee                                sql.NullInt64
}

func readTerminalAssigneeSnapshot(ctx context.Context, tx *sql.Tx, id int64) (terminalAssigneeSnapshot, error) {
	var s terminalAssigneeSnapshot
	err := tx.QueryRowContext(ctx, `SELECT id,version,task_code,task_group,source_type,source_id,task_status_key,
created_at,coalesce(payload->>'source_task_intent_hash',''),assignee_id FROM workflow_tasks WHERE id=$1`, id).
		Scan(&s.ID, &s.Version, &s.Code, &s.Group, &s.SourceType, &s.SourceID, &s.Status, &s.CreatedAt, &s.Intent, &s.Assignee)
	return s, err
}

func terminalHistory(ctx context.Context, tx *sql.Tx, id, version int64) (string, error) {
	var history string
	err := tx.QueryRowContext(ctx, `SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.task_version,e.id),'[]'::jsonb)::text
FROM workflow_task_events e WHERE task_id=$1 AND (task_version IS NULL OR task_version<=$2)`, id, version).Scan(&history)
	return history, err
}

// RestoreTerminalTaskAssignees performs a narrow, transactional forward repair.
// It preserves original events and records proven NULL assignments as well as
// restored people. A dry-run exercises the same writes and always rolls back.
func RestoreTerminalTaskAssignees(ctx context.Context, target, historical *sql.DB, proof TerminalAssigneeBackup, apply bool) (*TerminalAssigneeRecoveryResult, error) {
	if target == nil || historical == nil || target == historical ||
		!regexp.MustCompile(`^br-[A-Za-z0-9+_-]+$`).MatchString(proof.ID) ||
		!regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(proof.SHA256) ||
		!regexp.MustCompile(`^[0-9]{14}$`).MatchString(proof.MigrationVersion) ||
		proof.MigrationVersion >= "20261010185222" || proof.VerifiedAt.IsZero() {
		return nil, fmt.Errorf("verified pre-responsibility-migration backup is required")
	}
	history, err := historical.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return nil, err
	}
	defer func() { _ = history.Rollback() }()
	var historicalVersion string
	if err = history.QueryRowContext(ctx, `SELECT max(version) FROM atlas_schema_revisions.atlas_schema_revisions`).Scan(&historicalVersion); err != nil {
		return nil, err
	}
	if historicalVersion != proof.MigrationVersion {
		return nil, fmt.Errorf("restored backup migration does not match its receipt")
	}
	tx, err := target.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	result, err := restoreTerminalTaskAssignees(ctx, tx, history, proof)
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

func restoreTerminalTaskAssignees(ctx context.Context, tx, history *sql.Tx, proof TerminalAssigneeBackup) (*TerminalAssigneeRecoveryResult, error) {
	if _, err := tx.ExecContext(ctx, `SET LOCAL lock_timeout='5s'; LOCK TABLE workflow_tasks,workflow_task_events IN SHARE ROW EXCLUSIVE MODE`); err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT t.id,m.id,m.task_version,m.created_at FROM workflow_tasks t
JOIN workflow_task_events m ON m.task_id=t.id AND m.payload->>'source'='production_task_responsibility_migration'
WHERE t.assignee_id IS NULL AND t.task_status_key IN ('done','rejected','withdrawn') AND m.to_status_key=t.task_status_key
AND NOT EXISTS(SELECT 1 FROM workflow_task_events r WHERE r.task_id=t.id AND r.payload->>'source'='terminal_task_assignee_restoration')
ORDER BY t.id`)
	if err != nil {
		return nil, err
	}
	type affected struct {
		id, eventID, version int64
		at                   time.Time
	}
	var tasks []affected
	for rows.Next() {
		var a affected
		if err = rows.Scan(&a.id, &a.eventID, &a.version, &a.at); err != nil {
			_ = rows.Close()
			return nil, err
		}
		tasks = append(tasks, a)
	}
	if err = rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	if err = rows.Close(); err != nil {
		return nil, err
	}
	result := &TerminalAssigneeRecoveryResult{}
	for _, a := range tasks {
		current, err := readTerminalAssigneeSnapshot(ctx, tx, a.id)
		if err != nil {
			return nil, err
		}
		original, err := readTerminalAssigneeSnapshot(ctx, history, a.id)
		if err != nil {
			return nil, fmt.Errorf("task %d is missing from the restored backup", a.id)
		}
		if current.Version != a.version || original.Version != a.version-1 ||
			current.Code != original.Code || current.Group != original.Group || current.SourceType != original.SourceType ||
			current.SourceID != original.SourceID || current.Status != original.Status || current.Intent == "" || current.Intent != original.Intent ||
			!current.CreatedAt.Equal(original.CreatedAt) || !proof.VerifiedAt.Before(a.at) {
			return nil, fmt.Errorf("task %d does not exactly match its pre-migration backup", a.id)
		}
		before, err := terminalHistory(ctx, history, a.id, original.Version)
		if err != nil {
			return nil, err
		}
		after, err := terminalHistory(ctx, tx, a.id, original.Version)
		if err != nil {
			return nil, err
		}
		if before == "[]" || before != after {
			return nil, fmt.Errorf("task %d immutable history differs from the backup", a.id)
		}
		if original.Assignee.Valid {
			var oldUser, newUser string
			if original.Assignee.Int64 <= 0 {
				return nil, fmt.Errorf("task %d backup assignment is invalid", a.id)
			}
			if err = history.QueryRowContext(ctx, `SELECT username FROM admin_users WHERE id=$1`, original.Assignee.Int64).Scan(&oldUser); err != nil {
				return nil, fmt.Errorf("task %d backup assignee is missing", a.id)
			}
			if err = tx.QueryRowContext(ctx, `SELECT username FROM admin_users WHERE id=$1`, original.Assignee.Int64).Scan(&newUser); err != nil || oldUser != newUser {
				return nil, fmt.Errorf("task %d assignee identity changed", a.id)
			}
		}
		var assignee any
		if original.Assignee.Valid {
			assignee = original.Assignee.Int64
		}
		payload, err := json.Marshal(map[string]any{"source": "terminal_task_assignee_restoration", "assignee_id": assignee,
			"backup_id": proof.ID, "backup_sha256": proof.SHA256, "backup_migration_version": proof.MigrationVersion, "responsibility_event_id": a.eventID})
		if err != nil {
			return nil, err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE workflow_tasks SET assignee_id=$1,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$2`, assignee, a.id); err != nil {
			return nil, err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO workflow_task_events(task_id,task_version,event_type,from_status_key,to_status_key,reason,payload,created_at)
VALUES($1,$2,'source_updated',$3,$3,'按已验证的升级前备份核对终态任务原办理人',$4::jsonb,CURRENT_TIMESTAMP)`, a.id, current.Version+1, current.Status, string(payload)); err != nil {
			return nil, err
		}
		if original.Assignee.Valid {
			result.Restored++
		} else {
			result.ConfirmedUnassigned++
		}
	}
	return result, nil
}
