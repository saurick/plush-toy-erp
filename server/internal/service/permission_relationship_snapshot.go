package service

import "server/internal/biz"

// PermissionRelationshipSnapshot maps a local read-only observation using the
// same DTOs as the formal permission APIs. It registers no HTTP/RPC capability.
func PermissionRelationshipSnapshot(
	accounts []*biz.AdminUser,
	roles []biz.AdminRole,
	permissions []biz.AdminPermission,
	warehouses []*biz.Warehouse,
	access map[string]*biz.RoleEffectiveAccessExplanation,
	approval *biz.ApprovalSettingsExplanation,
) map[string]any {
	accountRows := make([]any, 0, len(accounts))
	for _, account := range accounts {
		if account == nil {
			continue
		}
		// Only identity, lifecycle and role relationships are needed here.
		assigned := make([]any, 0, len(account.Roles))
		for _, role := range account.Roles {
			assigned = append(assigned, map[string]any{"role_key": role.Key, "name": role.Name})
		}
		accountRows = append(accountRows, map[string]any{
			"id": account.ID, "username": account.Username, "display_name": account.DisplayName,
			"account_status": string(account.AccountStatus()), "is_super_admin": account.IsSuperAdmin,
			"roles": assigned,
		})
	}
	roleRows := make([]any, 0, len(roles))
	for _, role := range roles {
		row := adminRoleToMap(role, true)
		row["assignable"] = false
		row["permissions_editable"] = false
		roleRows = append(roleRows, row)
	}
	warehouseRows := make([]any, 0, len(warehouses))
	for _, warehouse := range warehouses {
		warehouseRows = append(warehouseRows, map[string]any{"id": warehouse.ID, "name": warehouse.Name})
	}
	accessRows := make(map[string]any, len(access))
	for key, explanation := range access {
		row := roleEffectiveAccessExplanationToMap(explanation)
		row["is_preview"] = false
		accessRows[key] = row
	}
	approvalRow := approvalSettingsExplanationToMap(approval)
	if approval == nil {
		approvalRow = map[string]any{"items": []any{}, "partial": true}
	}
	return map[string]any{
		"accounts": accountRows, "roles": roleRows, "permissions": permissionOptionsToAny(permissions),
		"warehouse_options": warehouseRows, "access_by_role_key": accessRows, "approval_settings": approvalRow,
	}
}
