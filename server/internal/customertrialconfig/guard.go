package customertrialconfig

import (
	"fmt"
	"net/url"
	"server/internal/biz"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

const (
	AllowEnv            = "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG"
	TargetEnv           = "ERP_CUSTOMER_TRIAL_TARGET"
	DebugEnv            = "ERP_DEBUG_ENV"
	ExpectedTarget      = "customer-trial-133"
	ExpectedCustomerKey = "yoyoosun"

	ProductVersion = biz.CustomerConfigTrialProductVersion
	ApplyPurpose   = biz.CustomerConfigTrialApplyPurpose
	DatasetVersion = biz.CustomerConfigTrialDatasetVersion
	Revision       = "yoyoosun-customer-trial-133-package-v5.runtime-manifest-v1"

	expectedDatabase = "plush_erp_uat_20260716_v5"
	expectedHost     = "postgres"
	expectedPort     = "5432"
)

// ResolveGate validates the complete runtime boundary and reports whether the
// customer trial config channel is enabled. Leaving both trial-specific env
// variables unset is the only disabled state; partial or malformed opt-in is
// rejected so startup cannot silently fall back to a wider environment.
func ResolveGate(dsn string, getenv func(string) string) (bool, error) {
	if getenv == nil {
		return false, boundaryError("environment reader is required")
	}
	allow := strings.TrimSpace(getenv(AllowEnv))
	target := strings.TrimSpace(getenv(TargetEnv))
	if (allow == "" || allow == "0") && target == "" {
		return false, nil
	}
	if allow != "1" {
		return false, boundaryError(AllowEnv + " must equal 1 when the trial target is configured")
	}
	if target != ExpectedTarget {
		return false, boundaryError(TargetEnv + " does not match the registered trial target")
	}
	if strings.TrimSpace(getenv(DebugEnv)) != "prod" {
		return false, boundaryError(DebugEnv + " must equal prod")
	}
	if err := validateDSN(dsn); err != nil {
		return false, err
	}
	return true, nil
}

// ClassifyManifest reserves the trial marker fields as one atomic identity.
// A payload carrying any reserved marker must carry every exact marker value.
func ClassifyManifest(customerKey, revision, productVersion string, compiledSnapshot map[string]any) (bool, error) {
	customerKey = strings.TrimSpace(customerKey)
	revision = strings.TrimSpace(revision)
	productVersion = strings.TrimSpace(productVersion)
	applyPurpose, _ := compiledSnapshot["applyPurpose"].(string)
	target, _ := compiledSnapshot["target"].(string)
	candidate := strings.HasPrefix(revision, "yoyoosun-customer-trial-") ||
		strings.HasPrefix(productVersion, "customer-trial-") ||
		strings.HasPrefix(strings.TrimSpace(applyPurpose), "customer_trial_") ||
		strings.HasPrefix(strings.TrimSpace(target), "customer-trial-")
	if !candidate {
		return false, nil
	}
	if customerKey != ExpectedCustomerKey ||
		revision != Revision ||
		productVersion != ProductVersion ||
		!exactSnapshotString(compiledSnapshot, "applyPurpose", ApplyPurpose) ||
		!exactSnapshotString(compiledSnapshot, "datasetVersion", DatasetVersion) ||
		!exactSnapshotString(compiledSnapshot, "target", ExpectedTarget) {
		return false, fmt.Errorf("customer trial config marker is incomplete or invalid")
	}
	return true, nil
}

// ClassifyProductVersion applies the transition-operation subset of the
// marker contract. Transition CAS still verifies the stored product version.
func ClassifyRevisionProductVersion(customerKey, revision, productVersion string) (bool, error) {
	customerKey = strings.TrimSpace(customerKey)
	revision = strings.TrimSpace(revision)
	productVersion = strings.TrimSpace(productVersion)
	if !strings.HasPrefix(revision, "yoyoosun-customer-trial-") &&
		!strings.HasPrefix(productVersion, "customer-trial-") {
		return false, nil
	}
	if customerKey != ExpectedCustomerKey || revision != Revision || productVersion != ProductVersion {
		return false, fmt.Errorf("customer trial config revision or product version is invalid")
	}
	return true, nil
}

func validateDSN(raw string) error {
	raw = strings.TrimSpace(raw)
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil {
		return boundaryError("PostgreSQL DSN is invalid")
	}
	if (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") ||
		parsed.Opaque != "" || parsed.Fragment != "" ||
		parsed.Hostname() != expectedHost || parsed.Port() != expectedPort ||
		parsed.Path != "/"+expectedDatabase {
		return boundaryError("PostgreSQL target does not match the registered trial database")
	}
	query := parsed.Query()
	sslModes, ok := query["sslmode"]
	if len(query) != 1 || !ok || len(sslModes) != 1 || sslModes[0] != "disable" {
		return boundaryError("PostgreSQL query must contain only sslmode=disable")
	}

	config, err := pgconn.ParseConfig(raw)
	if err != nil || config == nil {
		return boundaryError("PostgreSQL DSN cannot be resolved")
	}
	if strings.TrimSpace(config.Host) != expectedHost ||
		fmt.Sprintf("%d", config.Port) != expectedPort ||
		strings.TrimSpace(config.Database) != expectedDatabase ||
		len(config.Fallbacks) != 0 || config.TLSConfig != nil {
		return boundaryError("resolved PostgreSQL config is not the single registered trial database")
	}
	return nil
}

func exactSnapshotString(snapshot map[string]any, key, expected string) bool {
	value, ok := snapshot[key].(string)
	return ok && value == expected
}

func boundaryError(reason string) error {
	return fmt.Errorf("customer trial config startup gate failed: %s", reason)
}
