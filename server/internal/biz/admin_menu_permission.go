package biz

import "strings"

type AdminLevel int8

const (
	AdminLevelSuper    AdminLevel = 0
	AdminLevelStandard AdminLevel = 1
)

type AdminMenuPermissionOption struct {
	Key   string
	Label string
}

var adminMenuPermissionOptions = []AdminMenuPermissionOption{
	{Key: "/erp/dashboard", Label: "全局驾驶舱"},
	{Key: "/erp/flows/overview", Label: "流程总览"},
	{Key: "/erp/source-readiness", Label: "资料与字段真源"},
	{Key: "/erp/print-center", Label: "模板打印中心"},
	{Key: "/erp/help-center", Label: "帮助中心"},
	{Key: "/erp/docs/system-init", Label: "系统初始化说明"},
	{Key: "/erp/docs/operation-playbook", Label: "毛绒 ERP 主流程"},
	{Key: "/erp/docs/field-truth", Label: "字段真源对照"},
	{Key: "/erp/docs/data-model", Label: "首批正式数据模型"},
	{Key: "/erp/docs/import-mapping", Label: "导入映射"},
	{Key: "/erp/docs/mobile-roles", Label: "移动端端口与职责"},
	{Key: "/erp/docs/print-templates", Label: "模板打印与字段口径"},
	{Key: "/erp/changes/current", Label: "本轮变更记录"},
	{Key: "/erp/system/permissions", Label: "权限管理"},
}

var adminMenuPermissionSet = func() map[string]struct{} {
	items := make(map[string]struct{}, len(adminMenuPermissionOptions))
	for _, item := range adminMenuPermissionOptions {
		items[item.Key] = struct{}{}
	}
	return items
}()

func AdminMenuPermissionOptions() []AdminMenuPermissionOption {
	out := make([]AdminMenuPermissionOption, len(adminMenuPermissionOptions))
	copy(out, adminMenuPermissionOptions)
	return out
}

func AllAdminMenuPermissions() []string {
	out := make([]string, 0, len(adminMenuPermissionOptions))
	for _, item := range adminMenuPermissionOptions {
		out = append(out, item.Key)
	}
	return out
}

func DefaultAdminMenuPermissions() []string {
	out := make([]string, 0, len(adminMenuPermissionOptions))
	for _, item := range adminMenuPermissionOptions {
		if item.Key == "/erp/system/permissions" {
			continue
		}
		out = append(out, item.Key)
	}
	return out
}

func NormalizeAdminMenuPermissions(input []string) []string {
	if len(input) == 0 {
		return []string{}
	}

	selected := make(map[string]struct{}, len(input))
	for _, raw := range input {
		key := strings.TrimSpace(raw)
		if key == "" {
			continue
		}
		if _, ok := adminMenuPermissionSet[key]; !ok {
			continue
		}
		selected[key] = struct{}{}
	}

	out := make([]string, 0, len(selected))
	for _, item := range adminMenuPermissionOptions {
		if _, ok := selected[item.Key]; ok {
			out = append(out, item.Key)
		}
	}
	return out
}

func EffectiveAdminMenuPermissions(level AdminLevel, menuPermissions []string) []string {
	if level == AdminLevelSuper {
		return AllAdminMenuPermissions()
	}
	return NormalizeAdminMenuPermissions(menuPermissions)
}
