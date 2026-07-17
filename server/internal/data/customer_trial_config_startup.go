package data

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"

	"server/internal/biz"
	"server/internal/customertrialconfig"
	"server/internal/devdbguard"
)

type customerTrialConfigQueryRower interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// validateActiveCustomerTrialConfig prevents a test-only active revision from
// surviving after its exact runtime opt-in is removed. It is intentionally a
// startup check: a formal runtime must not consume an already-active local or
// trial projection merely because no new publish or activation request is made.
func validateActiveCustomerTrialConfig(
	ctx context.Context,
	db customerTrialConfigQueryRower,
	trialConfigEnabled bool,
	postgresDSN string,
) error {
	if db == nil {
		return fmt.Errorf("customer trial config startup check requires PostgreSQL")
	}
	var revision, productVersion, applyPurpose, datasetVersion, target string
	var databaseName, systemIdentifier string
	err := db.QueryRowContext(ctx, `
SELECT revision,
       product_version,
	   COALESCE(jsonb_extract_path_text(compiled_snapshot, 'applyPurpose'), ''),
	   COALESCE(jsonb_extract_path_text(compiled_snapshot, 'datasetVersion'), ''),
	   COALESCE(jsonb_extract_path_text(compiled_snapshot, 'target'), ''),
	   current_database(),
	   COALESCE((SELECT system_identifier::text FROM pg_control_system()), '')
FROM customer_config_revisions
WHERE customer_key = $1
  AND status = 'active'
ORDER BY id DESC
LIMIT 1`, customertrialconfig.ExpectedCustomerKey).Scan(
		&revision,
		&productVersion,
		&applyPurpose,
		&datasetVersion,
		&target,
		&databaseName,
		&systemIdentifier,
	)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return fmt.Errorf("customer trial config startup check failed: %w", err)
	}
	local, err := classifyActiveLocalTestCustomerConfig(productVersion, applyPurpose, datasetVersion, target)
	if err != nil {
		return fmt.Errorf("customer trial config startup check failed: %w", err)
	}
	if local {
		if strings.TrimSpace(os.Getenv(biz.CustomerConfigLocalTestAllowEnv)) != "1" {
			return fmt.Errorf("customer trial config startup check failed: active local-test revision requires the exact registered runtime opt-in")
		}
		if devdbguard.RequireCustomerConfigLocalTestRuntime(postgresDSN, databaseName, systemIdentifier) != nil {
			return fmt.Errorf("customer trial config startup check failed: active local-test revision requires the registered local development database family")
		}
	}
	trial, err := customertrialconfig.ClassifyManifest(
		customertrialconfig.ExpectedCustomerKey,
		revision,
		productVersion,
		map[string]any{
			"applyPurpose":   applyPurpose,
			"datasetVersion": datasetVersion,
			"target":         target,
		},
	)
	if err != nil {
		return fmt.Errorf("customer trial config startup check failed: %w", err)
	}
	if trial && !trialConfigEnabled {
		return fmt.Errorf("customer trial config startup check failed: active trial revision requires the exact registered runtime opt-in")
	}
	return nil
}

func classifyActiveLocalTestCustomerConfig(productVersion, applyPurpose, datasetVersion, target string) (bool, error) {
	productVersion = strings.TrimSpace(productVersion)
	applyPurpose = strings.TrimSpace(applyPurpose)
	localProduct := productVersion == biz.CustomerConfigLocalTestProductVersion
	localPurpose := applyPurpose == biz.CustomerConfigLocalTestApplyPurpose
	localCandidate := strings.HasPrefix(productVersion, "local-customer-package-test-") ||
		strings.HasPrefix(applyPurpose, "local_test_")
	if !localCandidate {
		return false, nil
	}
	if !localProduct || !localPurpose || strings.TrimSpace(datasetVersion) != "" || strings.TrimSpace(target) != "" {
		return false, fmt.Errorf("active local-test customer config marker is incomplete or invalid")
	}
	return true, nil
}
