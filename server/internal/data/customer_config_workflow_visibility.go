package data

import (
	"context"
	"sort"
	"strings"

	"server/internal/biz"
)

func (r *customerConfigRepo) ListWorkflowTaskAuthorizationRevisions(
	ctx context.Context,
	customerKey string,
) ([]biz.WorkflowTaskAuthorizationRevision, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil {
		return nil, biz.ErrBadParam
	}
	customerKey = biz.NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		return nil, biz.ErrBadParam
	}

	revisionRows, err := r.data.sqldb.QueryContext(ctx, `
SELECT customer_key, revision, status
FROM customer_config_revisions
WHERE customer_key = $1 AND status IN ($2, $3)
ORDER BY revision ASC`,
		customerKey,
		biz.CustomerConfigStatusActive,
		biz.CustomerConfigStatusSuperseded,
	)
	if err != nil {
		return nil, err
	}
	revisions := map[string]*biz.WorkflowTaskAuthorizationRevision{}
	for revisionRows.Next() {
		item := &biz.WorkflowTaskAuthorizationRevision{}
		if err := revisionRows.Scan(&item.CustomerKey, &item.Revision, &item.Status); err != nil {
			_ = revisionRows.Close()
			return nil, err
		}
		item.Revision = strings.TrimSpace(item.Revision)
		if item.Revision != "" {
			revisions[item.Revision] = item
		}
	}
	if err := revisionRows.Err(); err != nil {
		_ = revisionRows.Close()
		return nil, err
	}
	if err := revisionRows.Close(); err != nil {
		return nil, err
	}
	if len(revisions) == 0 {
		return []biz.WorkflowTaskAuthorizationRevision{}, nil
	}

	roleRows, err := r.data.sqldb.QueryContext(ctx, `
SELECT config_revision, role_key, display_name, disabled, bundle_keys, revokes
FROM role_profiles
WHERE customer_key = $1
ORDER BY config_revision ASC, role_key ASC`, customerKey)
	if err != nil {
		return nil, err
	}
	for roleRows.Next() {
		var revision string
		var item biz.RoleProfileInput
		var bundlesRaw, revokesRaw []byte
		if err := roleRows.Scan(&revision, &item.RoleKey, &item.DisplayName, &item.Disabled, &bundlesRaw, &revokesRaw); err != nil {
			_ = roleRows.Close()
			return nil, err
		}
		if target := revisions[strings.TrimSpace(revision)]; target != nil {
			item.BundleKeys = decodeStringListJSON(bundlesRaw)
			item.Revokes = decodeStringListJSON(revokesRaw)
			target.RoleProfiles = append(target.RoleProfiles, item)
		}
	}
	if err := roleRows.Err(); err != nil {
		_ = roleRows.Close()
		return nil, err
	}
	if err := roleRows.Close(); err != nil {
		return nil, err
	}

	entitlementRows, err := r.data.sqldb.QueryContext(ctx, `
SELECT config_revision, role_key, capability_key, scope_type, scope_value, constraints, enabled
FROM access_entitlements
WHERE customer_key = $1
ORDER BY config_revision ASC, role_key ASC, capability_key ASC`, customerKey)
	if err != nil {
		return nil, err
	}
	for entitlementRows.Next() {
		var revision string
		var item biz.AccessEntitlementInput
		var constraintsRaw []byte
		if err := entitlementRows.Scan(
			&revision,
			&item.RoleKey,
			&item.CapabilityKey,
			&item.ScopeType,
			&item.ScopeValue,
			&constraintsRaw,
			&item.Enabled,
		); err != nil {
			_ = entitlementRows.Close()
			return nil, err
		}
		if target := revisions[strings.TrimSpace(revision)]; target != nil {
			item.Constraints = decodeMapJSON(constraintsRaw)
			target.AccessEntitlements = append(target.AccessEntitlements, item)
		}
	}
	if err := entitlementRows.Err(); err != nil {
		_ = entitlementRows.Close()
		return nil, err
	}
	if err := entitlementRows.Close(); err != nil {
		return nil, err
	}

	membershipRows, err := r.data.sqldb.QueryContext(ctx, `
SELECT config_revision, pool_key, role_key, user_id, strategy, priority, enabled
FROM work_pool_memberships
WHERE customer_key = $1
ORDER BY config_revision ASC, priority ASC, pool_key ASC, role_key ASC, user_id ASC`, customerKey)
	if err != nil {
		return nil, err
	}
	for membershipRows.Next() {
		var revision string
		var item biz.WorkPoolMembershipInput
		if err := membershipRows.Scan(
			&revision,
			&item.PoolKey,
			&item.RoleKey,
			&item.UserID,
			&item.Strategy,
			&item.Priority,
			&item.Enabled,
		); err != nil {
			_ = membershipRows.Close()
			return nil, err
		}
		if target := revisions[strings.TrimSpace(revision)]; target != nil {
			target.WorkPoolMemberships = append(target.WorkPoolMemberships, item)
		}
	}
	if err := membershipRows.Err(); err != nil {
		_ = membershipRows.Close()
		return nil, err
	}
	if err := membershipRows.Close(); err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(revisions))
	for revision := range revisions {
		keys = append(keys, revision)
	}
	sort.Strings(keys)
	out := make([]biz.WorkflowTaskAuthorizationRevision, 0, len(keys))
	for _, revision := range keys {
		out = append(out, *revisions[revision])
	}
	return out, nil
}
