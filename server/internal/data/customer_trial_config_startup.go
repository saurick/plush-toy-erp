package data

import (
	"context"
	"database/sql"
	"fmt"

	"server/internal/customertrialconfig"
)

type customerTrialConfigQueryRower interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// validateActiveCustomerTrialConfig prevents a test-only active revision from
// surviving after its exact runtime opt-in is removed. It is intentionally a
// startup check: a formal runtime must not consume an already-active trial
// projection merely because no new publish or activation request is made.
func validateActiveCustomerTrialConfig(
	ctx context.Context,
	db customerTrialConfigQueryRower,
	trialConfigEnabled bool,
) error {
	if db == nil {
		return fmt.Errorf("customer trial config startup check requires PostgreSQL")
	}
	var productVersion string
	err := db.QueryRowContext(ctx, `
SELECT product_version
FROM customer_config_revisions
WHERE customer_key = $1
  AND status = 'active'
ORDER BY id DESC
LIMIT 1`, customertrialconfig.ExpectedCustomerKey).Scan(&productVersion)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return fmt.Errorf("customer trial config startup check failed: %w", err)
	}
	trial, err := customertrialconfig.ClassifyProductVersion(productVersion)
	if err != nil {
		return fmt.Errorf("customer trial config startup check failed: %w", err)
	}
	if trial && !trialConfigEnabled {
		return fmt.Errorf("customer trial config startup check failed: active trial revision requires the exact registered runtime opt-in")
	}
	return nil
}
