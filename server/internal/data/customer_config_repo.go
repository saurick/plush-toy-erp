package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
)

type customerConfigRepo struct {
	data *Data
	log  *log.Helper
}

func NewCustomerConfigRepo(d *Data, logger log.Logger) *customerConfigRepo {
	return &customerConfigRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.customer_config_repo")),
	}
}

var _ biz.CustomerConfigRepo = (*customerConfigRepo)(nil)

func (r *customerConfigRepo) GetCustomerConfigRevision(ctx context.Context, customerKey, revision string) (*biz.CustomerConfigRevision, error) {
	row := r.data.sqldb.QueryRowContext(ctx, `
SELECT id, customer_key, revision, product_version, config_hash, status, compiled_snapshot,
       published_by, published_at, activated_by, activated_at, created_at, updated_at
FROM customer_config_revisions
WHERE customer_key = $1 AND revision = $2
LIMIT 1`, customerKey, revision)
	item, err := scanCustomerConfigRevision(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, biz.ErrCustomerConfigNotFound
		}
		return nil, err
	}
	return item, nil
}

func (r *customerConfigRepo) GetActiveCustomerConfigRevision(ctx context.Context, customerKey string) (*biz.CustomerConfigRevision, error) {
	row := r.data.sqldb.QueryRowContext(ctx, `
SELECT id, customer_key, revision, product_version, config_hash, status, compiled_snapshot,
       published_by, published_at, activated_by, activated_at, created_at, updated_at
FROM customer_config_revisions
WHERE customer_key = $1 AND status = $2
ORDER BY activated_at DESC NULLS LAST, id DESC
LIMIT 1`, customerKey, biz.CustomerConfigStatusActive)
	item, err := scanCustomerConfigRevision(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, biz.ErrCustomerConfigNotFound
		}
		return nil, err
	}
	return item, nil
}

func (r *customerConfigRepo) PublishCustomerConfig(
	ctx context.Context,
	in biz.CustomerConfigPublishInput,
	configHash string,
	publishedBy int,
	publishedAt time.Time,
) (*biz.CustomerConfigRevision, error) {
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer rollbackSQLTx(ctx, tx, r.log)

	snapshotJSON, err := json.Marshal(in.CompiledSnapshot)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	if _, err := tx.ExecContext(ctx, `
INSERT INTO customer_config_revisions
  (customer_key, revision, product_version, config_hash, status, compiled_snapshot, published_by, published_at, created_at, updated_at)
VALUES
  ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
ON CONFLICT (customer_key, revision) DO UPDATE SET
  product_version = EXCLUDED.product_version,
  config_hash = EXCLUDED.config_hash,
  status = EXCLUDED.status,
  compiled_snapshot = EXCLUDED.compiled_snapshot,
  published_by = EXCLUDED.published_by,
  published_at = EXCLUDED.published_at,
  updated_at = EXCLUDED.updated_at`,
		in.CustomerKey,
		in.Revision,
		in.ProductVersion,
		configHash,
		biz.CustomerConfigStatusPublished,
		string(snapshotJSON),
		publishedBy,
		publishedAt,
		now,
		now,
	); err != nil {
		return nil, err
	}

	if err := replaceCustomerConfigCompiledRows(ctx, tx, in, now); err != nil {
		return nil, err
	}
	if err := writeCustomerConfigAudit(ctx, tx, "customer_config.publish", in.CustomerKey, in.Revision, publishedBy, map[string]any{
		"status":            biz.CustomerConfigStatusPublished,
		"product_version":   in.ProductVersion,
		"config_hash":       configHash,
		"module_count":      len(in.ModuleStates),
		"role_count":        len(in.RoleProfiles),
		"entitlement_count": len(in.AccessEntitlements),
		"work_pool_count":   len(in.WorkPools),
		"membership_count":  len(in.WorkPoolMemberships),
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return r.GetCustomerConfigRevision(ctx, in.CustomerKey, in.Revision)
}

func replaceCustomerConfigCompiledRows(ctx context.Context, tx *sql.Tx, in biz.CustomerConfigPublishInput, now time.Time) error {
	for _, tableName := range []string{
		"deployment_module_states",
		"role_profiles",
		"access_entitlements",
		"work_pools",
		"work_pool_memberships",
	} {
		if _, err := tx.ExecContext(ctx,
			"DELETE FROM "+tableName+" WHERE customer_key = $1 AND config_revision = $2",
			in.CustomerKey,
			in.Revision,
		); err != nil {
			return err
		}
	}
	for _, item := range in.ModuleStates {
		if _, err := tx.ExecContext(ctx, `
INSERT INTO deployment_module_states
  (customer_key, config_revision, module_key, contract_version, state, reason, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			in.CustomerKey, in.Revision, item.ModuleKey, item.ContractVersion, item.State, item.Reason, now, now,
		); err != nil {
			return err
		}
	}
	for _, item := range in.RoleProfiles {
		bundles, err := json.Marshal(item.BundleKeys)
		if err != nil {
			return err
		}
		grants, err := json.Marshal(item.Grants)
		if err != nil {
			return err
		}
		revokes, err := json.Marshal(item.Revokes)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO role_profiles
  (customer_key, config_revision, role_key, display_name, disabled, bundle_keys, grants, revokes, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)`,
			in.CustomerKey, in.Revision, item.RoleKey, item.DisplayName, item.Disabled, string(bundles), string(grants), string(revokes), now, now,
		); err != nil {
			return err
		}
	}
	for _, item := range in.AccessEntitlements {
		constraints, err := json.Marshal(item.Constraints)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO access_entitlements
  (customer_key, config_revision, role_key, capability_key, scope_type, scope_value, constraints, enabled, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
			in.CustomerKey, in.Revision, item.RoleKey, item.CapabilityKey, item.ScopeType, item.ScopeValue, string(constraints), item.Enabled, now, now,
		); err != nil {
			return err
		}
	}
	for _, item := range in.WorkPools {
		if _, err := tx.ExecContext(ctx, `
INSERT INTO work_pools
  (customer_key, config_revision, pool_key, module_key, display_name, description, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			in.CustomerKey, in.Revision, item.PoolKey, item.ModuleKey, item.DisplayName, item.Description, now, now,
		); err != nil {
			return err
		}
	}
	for _, item := range in.WorkPoolMemberships {
		if _, err := tx.ExecContext(ctx, `
INSERT INTO work_pool_memberships
  (customer_key, config_revision, pool_key, role_key, user_id, strategy, priority, enabled, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			in.CustomerKey, in.Revision, item.PoolKey, item.RoleKey, item.UserID, item.Strategy, item.Priority, item.Enabled, now, now,
		); err != nil {
			return err
		}
	}
	return nil
}

func (r *customerConfigRepo) ActivateCustomerConfig(
	ctx context.Context,
	customerKey, revision string,
	activatedBy int,
	activatedAt time.Time,
) (*biz.CustomerConfigRevision, error) {
	return r.switchActiveCustomerConfigRevision(ctx, customerKey, revision, activatedBy, activatedAt, "customer_config.activate")
}

func (r *customerConfigRepo) RollbackCustomerConfig(
	ctx context.Context,
	customerKey, targetRevision string,
	actorID int,
	rolledBackAt time.Time,
) (*biz.CustomerConfigRevision, error) {
	return r.switchActiveCustomerConfigRevision(ctx, customerKey, targetRevision, actorID, rolledBackAt, "customer_config.rollback")
}

func (r *customerConfigRepo) switchActiveCustomerConfigRevision(
	ctx context.Context,
	customerKey, revision string,
	actorID int,
	activatedAt time.Time,
	auditAction string,
) (*biz.CustomerConfigRevision, error) {
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer rollbackSQLTx(ctx, tx, r.log)

	var targetID int
	if err := tx.QueryRowContext(ctx, `
SELECT id
FROM customer_config_revisions
WHERE customer_key = $1 AND revision = $2
LIMIT 1`, customerKey, revision).Scan(&targetID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, biz.ErrCustomerConfigNotFound
		}
		return nil, err
	}
	now := time.Now()
	if _, err := tx.ExecContext(ctx, `
UPDATE customer_config_revisions
SET status = $3, updated_at = $4
WHERE customer_key = $1 AND status = $2 AND revision <> $5`,
		customerKey,
		biz.CustomerConfigStatusActive,
		biz.CustomerConfigStatusSuperseded,
		now,
		revision,
	); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `
UPDATE customer_config_revisions
SET status = $3, activated_by = $4, activated_at = $5, updated_at = $6
WHERE customer_key = $1 AND revision = $2`,
		customerKey,
		revision,
		biz.CustomerConfigStatusActive,
		actorID,
		activatedAt,
		now,
	); err != nil {
		return nil, err
	}
	after := map[string]any{
		"status": biz.CustomerConfigStatusActive,
	}
	if auditAction == "customer_config.rollback" {
		after["rollback_target_revision"] = revision
	}
	if err := writeCustomerConfigAudit(ctx, tx, auditAction, customerKey, revision, actorID, after); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return r.GetCustomerConfigRevision(ctx, customerKey, revision)
}

func writeCustomerConfigAudit(ctx context.Context, tx *sql.Tx, action, customerKey, revision string, actorUserID int, after map[string]any) error {
	payload := map[string]any{
		"action": action,
		"actor": map[string]any{
			"id": actorUserID,
		},
		"target": map[string]any{
			"type": "customer_config_revision",
			"key":  customerKey + "/" + revision,
		},
		"after": after,
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(
		ctx,
		"INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)",
		"customer_config_control_plane",
		action,
		"customer_config",
		string(payloadJSON),
		time.Now(),
	)
	return err
}

func (r *customerConfigRepo) ListDeploymentModuleStates(ctx context.Context, customerKey, revision string) ([]biz.DeploymentModuleStateInput, error) {
	rows, err := r.data.sqldb.QueryContext(ctx, `
SELECT module_key, contract_version, state, reason
FROM deployment_module_states
WHERE customer_key = $1 AND config_revision = $2
ORDER BY module_key ASC`, customerKey, revision)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := []biz.DeploymentModuleStateInput{}
	for rows.Next() {
		var item biz.DeploymentModuleStateInput
		if err := rows.Scan(&item.ModuleKey, &item.ContractVersion, &item.State, &item.Reason); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *customerConfigRepo) ListRoleProfiles(ctx context.Context, customerKey, revision string) ([]biz.RoleProfileInput, error) {
	rows, err := r.data.sqldb.QueryContext(ctx, `
SELECT role_key, display_name, disabled, bundle_keys, grants, revokes
FROM role_profiles
WHERE customer_key = $1 AND config_revision = $2
ORDER BY role_key ASC`, customerKey, revision)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := []biz.RoleProfileInput{}
	for rows.Next() {
		var item biz.RoleProfileInput
		var bundlesRaw, grantsRaw, revokesRaw []byte
		if err := rows.Scan(&item.RoleKey, &item.DisplayName, &item.Disabled, &bundlesRaw, &grantsRaw, &revokesRaw); err != nil {
			return nil, err
		}
		item.BundleKeys = decodeStringListJSON(bundlesRaw)
		item.Grants = decodeStringListJSON(grantsRaw)
		item.Revokes = decodeStringListJSON(revokesRaw)
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *customerConfigRepo) ListAccessEntitlements(ctx context.Context, customerKey, revision string, roleKeys []string) ([]biz.AccessEntitlementInput, error) {
	roleKeys = biz.NormalizeAdminRoleKeys(roleKeys)
	if len(roleKeys) == 0 {
		return []biz.AccessEntitlementInput{}, nil
	}
	roleClause, args := buildStringInClause(3, roleKeys)
	query := `
SELECT role_key, capability_key, scope_type, scope_value, constraints, enabled
FROM access_entitlements
WHERE customer_key = $1 AND config_revision = $2 AND role_key IN (` + roleClause + `) AND enabled = TRUE
ORDER BY role_key ASC, capability_key ASC`
	queryArgs := append([]any{customerKey, revision}, args...)
	rows, err := r.data.sqldb.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := []biz.AccessEntitlementInput{}
	for rows.Next() {
		var item biz.AccessEntitlementInput
		var constraintsRaw []byte
		if err := rows.Scan(&item.RoleKey, &item.CapabilityKey, &item.ScopeType, &item.ScopeValue, &constraintsRaw, &item.Enabled); err != nil {
			return nil, err
		}
		item.Constraints = decodeMapJSON(constraintsRaw)
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *customerConfigRepo) ListWorkPools(ctx context.Context, customerKey, revision string) ([]biz.WorkPoolInput, error) {
	rows, err := r.data.sqldb.QueryContext(ctx, `
SELECT pool_key, module_key, display_name, description
FROM work_pools
WHERE customer_key = $1 AND config_revision = $2
ORDER BY pool_key ASC`, customerKey, revision)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := []biz.WorkPoolInput{}
	for rows.Next() {
		var item biz.WorkPoolInput
		if err := rows.Scan(&item.PoolKey, &item.ModuleKey, &item.DisplayName, &item.Description); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *customerConfigRepo) ListWorkPoolMemberships(ctx context.Context, customerKey, revision string, roleKeys []string, userID int) ([]biz.WorkPoolMembershipInput, error) {
	roleKeys = biz.NormalizeAdminRoleKeys(roleKeys)
	roleClause, args := buildStringInClause(4, roleKeys)
	query := `
SELECT pool_key, role_key, user_id, strategy, priority, enabled
FROM work_pool_memberships
WHERE customer_key = $1
  AND config_revision = $2
  AND enabled = TRUE
  AND (
    (role_key <> '' AND role_key IN (` + roleClause + `))
    OR (user_id > 0 AND user_id = $3)
  )
ORDER BY priority ASC, pool_key ASC`
	queryArgs := append([]any{customerKey, revision, userID}, args...)
	rows, err := r.data.sqldb.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := []biz.WorkPoolMembershipInput{}
	for rows.Next() {
		var item biz.WorkPoolMembershipInput
		if err := rows.Scan(&item.PoolKey, &item.RoleKey, &item.UserID, &item.Strategy, &item.Priority, &item.Enabled); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *customerConfigRepo) ListWorkPoolMembershipsByPools(ctx context.Context, customerKey, revision string, poolKeys []string) ([]biz.WorkPoolMembershipInput, error) {
	poolKeys = normalizeDataStringList(poolKeys)
	if len(poolKeys) == 0 {
		return []biz.WorkPoolMembershipInput{}, nil
	}
	poolClause, args := buildStringInClause(3, poolKeys)
	query := `
SELECT pool_key, role_key, user_id, strategy, priority, enabled
FROM work_pool_memberships
WHERE customer_key = $1
  AND config_revision = $2
  AND pool_key IN (` + poolClause + `)
  AND enabled = TRUE
ORDER BY priority ASC, pool_key ASC, role_key ASC, user_id ASC`
	queryArgs := append([]any{customerKey, revision}, args...)
	rows, err := r.data.sqldb.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := []biz.WorkPoolMembershipInput{}
	for rows.Next() {
		var item biz.WorkPoolMembershipInput
		if err := rows.Scan(&item.PoolKey, &item.RoleKey, &item.UserID, &item.Strategy, &item.Priority, &item.Enabled); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *customerConfigRepo) CountInFlightProcessInstances(ctx context.Context, customerKey, revision string, processKeys []string) (int, error) {
	processKeys = normalizeDataStringList(processKeys)
	revision = strings.TrimSpace(revision)
	if revision == "" || len(processKeys) == 0 {
		return 0, nil
	}
	processClause, args := buildStringInClause(2, processKeys)
	queryArgs := append([]any{revision}, args...)
	var count int
	if err := r.data.sqldb.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM process_instances
WHERE config_revision = $1
  AND process_key IN (`+processClause+`)
  AND status IN ('active', 'blocked')`, queryArgs...).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (r *customerConfigRepo) CountOpenWorkflowTasksByPools(ctx context.Context, customerKey, revision string, poolKeys []string) (int, error) {
	poolKeys = normalizeDataStringList(poolKeys)
	revision = strings.TrimSpace(revision)
	if revision == "" || len(poolKeys) == 0 {
		return 0, nil
	}
	poolClause, args := buildStringInClause(2, poolKeys)
	queryArgs := append([]any{revision}, args...)
	var count int
	if err := r.data.sqldb.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM workflow_tasks
WHERE config_revision = $1
  AND owner_pool_key IN (`+poolClause+`)
  AND task_status_key NOT IN ('done', 'cancelled', 'closed')`, queryArgs...).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (r *customerConfigRepo) CountOpenBusinessDocumentsByModules(ctx context.Context, customerKey string, moduleKeys []string) (int, error) {
	moduleKeys = normalizeDataStringList(moduleKeys)
	if len(moduleKeys) == 0 {
		return 0, nil
	}
	total := 0
	for _, moduleKey := range moduleKeys {
		queries := customerConfigOpenBusinessDocumentCountQueries(moduleKey)
		for _, query := range queries {
			var count int
			if err := r.data.sqldb.QueryRowContext(ctx, query).Scan(&count); err != nil {
				return 0, err
			}
			total += count
		}
	}
	return total, nil
}

func customerConfigOpenBusinessDocumentCountQueries(moduleKey string) []string {
	switch strings.TrimSpace(moduleKey) {
	case "sales_orders":
		return []string{`SELECT COUNT(*) FROM sales_orders WHERE lifecycle_status NOT IN ('closed', 'canceled')`}
	case "purchase_orders":
		return []string{`SELECT COUNT(*) FROM purchase_orders WHERE lifecycle_status NOT IN ('closed', 'canceled')`}
	case "purchase_receipts":
		return []string{`SELECT COUNT(*) FROM purchase_receipts WHERE status = 'DRAFT'`}
	case "quality_inspections":
		return []string{`SELECT COUNT(*) FROM quality_inspections WHERE status IN ('DRAFT', 'SUBMITTED')`}
	case "outsourcing_orders":
		return []string{`SELECT COUNT(*) FROM outsourcing_orders WHERE lifecycle_status NOT IN ('closed', 'canceled')`}
	case "shipments":
		return []string{`SELECT COUNT(*) FROM shipments WHERE status = 'DRAFT'`}
	case "finance":
		return []string{`SELECT COUNT(*) FROM finance_facts WHERE status NOT IN ('POSTED', 'SETTLED', 'CANCELLED')`}
	case "production":
		return []string{`SELECT COUNT(*) FROM production_facts WHERE status = 'DRAFT'`}
	case "inventory":
		return []string{
			`SELECT COUNT(*) FROM purchase_receipts WHERE status = 'DRAFT'`,
			`SELECT COUNT(*) FROM shipments WHERE status = 'DRAFT'`,
			`SELECT COUNT(*) FROM production_facts WHERE status = 'DRAFT'`,
			`SELECT COUNT(*) FROM outsourcing_facts WHERE status = 'DRAFT'`,
			`SELECT COUNT(*) FROM stock_reservations WHERE status = 'ACTIVE'`,
		}
	default:
		return []string{}
	}
}

type customerConfigRevisionScanner interface {
	Scan(dest ...any) error
}

func scanCustomerConfigRevision(row customerConfigRevisionScanner) (*biz.CustomerConfigRevision, error) {
	var item biz.CustomerConfigRevision
	var snapshotRaw []byte
	if err := row.Scan(
		&item.ID,
		&item.CustomerKey,
		&item.Revision,
		&item.ProductVersion,
		&item.ConfigHash,
		&item.Status,
		&snapshotRaw,
		&item.PublishedBy,
		&item.PublishedAt,
		&item.ActivatedBy,
		&item.ActivatedAt,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return nil, err
	}
	item.CompiledSnapshot = decodeMapJSON(snapshotRaw)
	return &item, nil
}

func decodeMapJSON(raw []byte) map[string]any {
	if len(raw) == 0 {
		return map[string]any{}
	}
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func decodeStringListJSON(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}
	out := []string{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return []string{}
	}
	return out
}

func buildStringInClause(startIndex int, values []string) (string, []any) {
	if len(values) == 0 {
		return "''", []any{}
	}
	placeholders := make([]string, 0, len(values))
	args := make([]any, 0, len(values))
	for index, value := range values {
		placeholders = append(placeholders, "$"+strconv.Itoa(startIndex+index))
		args = append(args, value)
	}
	return strings.Join(placeholders, ", "), args
}

func normalizeDataStringList(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := map[string]struct{}{}
	out := []string{}
	for _, raw := range values {
		value := strings.TrimSpace(raw)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}
