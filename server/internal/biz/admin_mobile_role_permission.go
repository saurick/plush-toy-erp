package biz

type AdminMobileRolePermissionOption struct {
	Key   string
	Label string
}

var adminMobileRolePermissionOptions = []AdminMobileRolePermissionOption{
	{Key: "boss", Label: "老板移动端"},
	{Key: BusinessRoleKey, Label: "业务移动端"},
	{Key: "purchasing", Label: "采购移动端"},
	{Key: "production", Label: "生产移动端"},
	{Key: "warehouse", Label: "仓库移动端"},
	{Key: "finance", Label: "财务移动端"},
	{Key: "pmc", Label: "PMC 移动端"},
	{Key: "quality", Label: "品质移动端"},
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

func AllAdminMobileRolePermissions() []string {
	out := make([]string, 0, len(adminMobileRolePermissionOptions))
	for _, item := range adminMobileRolePermissionOptions {
		out = append(out, item.Key)
	}
	return out
}

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

func EffectiveAdminMobileRolePermissions(level AdminLevel, mobileRolePermissions []string) []string {
	if level == AdminLevelSuper {
		return AllAdminMobileRolePermissions()
	}
	return NormalizeAdminMobileRolePermissions(mobileRolePermissions)
}

func AdminHasMobileRolePermission(admin *AdminUser, roleKey string) bool {
	if admin == nil {
		return false
	}
	normalized := NormalizeAdminMobileRolePermissions([]string{roleKey})
	if len(normalized) == 0 {
		return true
	}
	allowed := EffectiveAdminMobileRolePermissions(AdminLevel(admin.Level), admin.MobileRolePermissions)
	for _, item := range allowed {
		if item == normalized[0] {
			return true
		}
	}
	return false
}
