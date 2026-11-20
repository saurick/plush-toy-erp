package tasknumber

import (
	"context"
	"fmt"
	"time"

	corevalue "server/internal/core/value"
	"server/internal/data/model/ent"
)

// The caller's Ent client carries the task transaction. One atomic counter row
// per business day serializes concurrent allocations without scanning tasks.
func Allocate(ctx context.Context, client *ent.Client, createdAt time.Time) (string, error) {
	day := corevalue.WorkflowTaskNumberDay(createdAt)
	rows, err := client.QueryContext(ctx, `
INSERT INTO workflow_task_number_counters (id, last_value) VALUES ($1, 1)
ON CONFLICT (id) DO UPDATE SET last_value = workflow_task_number_counters.last_value + 1
RETURNING last_value`, day)
	if err != nil {
		return "", fmt.Errorf("allocate workflow task number: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var sequence int64
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return "", err
		}
		return "", fmt.Errorf("workflow task number allocation returned no value")
	}
	if err := rows.Scan(&sequence); err != nil {
		return "", err
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	if err := rows.Close(); err != nil {
		return "", fmt.Errorf("close workflow task number result: %w", err)
	}
	number := corevalue.FormatWorkflowTaskNumber(day, sequence)
	if err := corevalue.ValidateWorkflowTaskNumber(number); err != nil {
		return "", err
	}
	return number, nil
}
