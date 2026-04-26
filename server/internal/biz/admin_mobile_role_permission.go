package biz

type AdminMobileRolePermissionOption struct {
	Key   string
	Label string
}

var adminMobileRolePermissionOptions = []AdminMobileRolePermissionOption{
	{Key: BossRoleKey, Label: "老板移动端"},
	{Key: SalesRoleKey, Label: "业务移动端"},
	{Key: PurchaseRoleKey, Label: "采购移动端"},
	{Key: ProductionRoleKey, Label: "生产移动端"},
	{Key: WarehouseRoleKey, Label: "仓库移动端"},
	{Key: FinanceRoleKey, Label: "财务移动端"},
	{Key: PMCRoleKey, Label: "PMC 移动端"},
	{Key: QualityRoleKey, Label: "品质移动端"},
}

var adminMobileRolePermissionSet = func() map[string]struct{} {
	items := make(map[string]struct{}, len(adminMobileRolePermissionOptions))
	for _, item := range adminMobileRolePermissionOptions {
		items[item.Key] = struct{}{}
	}
	return items
}()

func AdminMobileRolePermissionOptions() []AdminMobileRolePermissionOption {
	out := make([]AdminMobileRolePermissionOption, len(adminMobileRolePermissionOptions))
	copy(out, adminMobileRolePermissionOptions)
	return out
}

// Deprecated: mobile entry access is derived from RBAC permission codes.
func AllAdminMobileRolePermissions() []string {
	out := make([]string, 0, len(adminMobileRolePermissionOptions))
	for _, item := range adminMobileRolePermissionOptions {
		out = append(out, item.Key)
	}
	return out
}

// Deprecated: mobile entry access is derived from RBAC permission codes.
func NormalizeAdminMobileRolePermissions(input []string) []string {
	if len(input) == 0 {
		return []string{}
	}

	selected := make(map[string]struct{}, len(input))
	for _, raw := range input {
		key := NormalizeRoleKey(raw)
		if key == "" {
			continue
		}
		if _, ok := adminMobileRolePermissionSet[key]; !ok {
			continue
		}
		selected[key] = struct{}{}
	}

	out := make([]string, 0, len(selected))
	for _, item := range adminMobileRolePermissionOptions {
		if _, ok := selected[item.Key]; ok {
			out = append(out, item.Key)
		}
	}
	return out
}

func AdminHasMobileRolePermission(admin *AdminUser, roleKey string) bool {
	return AdminCanAccessMobileRole(admin, roleKey)
}
