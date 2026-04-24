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
	{Key: "/erp/dashboard", Label: "任务看板"},
	{Key: "/erp/print-center", Label: "模板打印中心"},
	{Key: "/erp/sales/project-orders", Label: "客户/款式立项"},
	{Key: "/erp/purchase/material-bom", Label: "材料 BOM"},
	{Key: "/erp/purchase/accessories", Label: "辅材/包材采购"},
	{Key: "/erp/purchase/processing-contracts", Label: "加工合同/委外下单"},
	{Key: "/erp/warehouse/inbound", Label: "入库通知/检验/入库"},
	{Key: "/erp/warehouse/inventory", Label: "库存"},
	{Key: "/erp/warehouse/shipping-release", Label: "待出货/出货放行"},
	{Key: "/erp/warehouse/outbound", Label: "出库"},
	{Key: "/erp/production/scheduling", Label: "生产排单"},
	{Key: "/erp/production/progress", Label: "生产进度"},
	{Key: "/erp/production/exceptions", Label: "延期/返工/异常"},
	{Key: "/erp/finance/reconciliation", Label: "对账/结算"},
	{Key: "/erp/finance/payables", Label: "待付款/应付提醒"},
	{Key: "/erp/docs/operation-flow-overview", Label: "ERP 流程图总览"},
	{Key: "/erp/docs/operation-guide", Label: "ERP 操作教程"},
	{Key: "/erp/docs/role-collaboration-guide", Label: "角色协同链路"},
	{Key: "/erp/docs/role-page-document-matrix", Label: "角色权限 / 页面 / 单据矩阵"},
	{Key: "/erp/docs/task-document-mapping", Label: "任务 / 单据映射表"},
	{Key: "/erp/docs/workflow-status-guide", Label: "任务 / 业务状态字典"},
	{Key: "/erp/docs/workflow-schema-draft", Label: "Workflow / Schema 草案"},
	{Key: "/erp/docs/desktop-role-guide", Label: "桌面端角色流程"},
	{Key: "/erp/docs/mobile-role-guide", Label: "手机端角色流程"},
	{Key: "/erp/docs/field-linkage-guide", Label: "ERP 字段联动口径"},
	{Key: "/erp/docs/calculation-guide", Label: "ERP 计算口径"},
	{Key: "/erp/docs/print-snapshot-guide", Label: "打印 / 合同 / 快照口径"},
	{Key: "/erp/docs/exception-handling-guide", Label: "异常 / 返工 / 延期处理"},
	{Key: "/erp/docs/current-boundaries", Label: "当前明确不做"},
	{Key: "/erp/qa/acceptance-overview", Label: "验收结果总览"},
	{Key: "/erp/qa/business-chain-debug", Label: "业务链路调试"},
	{Key: "/erp/qa/field-linkage-coverage", Label: "字段联动覆盖"},
	{Key: "/erp/qa/run-records", Label: "运行记录"},
	{Key: "/erp/qa/reports", Label: "专项报告"},
	{Key: "/erp/system/permissions", Label: "权限管理"},
}

var adminMenuPermissionAliases = map[string]string{
	"/erp/flows/overview":          "/erp/docs/operation-flow-overview",
	"/erp/source-readiness":        "/erp/docs/field-linkage-guide",
	"/erp/mobile-workbenches":      "/erp/docs/operation-guide",
	"/erp/help-center":             "/erp/docs/operation-flow-overview",
	"/erp/docs/system-init":        "/erp/docs/operation-guide",
	"/erp/docs/operation-playbook": "/erp/docs/operation-flow-overview",
	"/erp/docs/field-truth":        "/erp/docs/field-linkage-guide",
	"/erp/docs/data-model":         "/erp/docs/calculation-guide",
	"/erp/docs/import-mapping":     "/erp/docs/field-linkage-guide",
	"/erp/docs/mobile-roles":       "/erp/docs/mobile-role-guide",
	"/erp/docs/print-templates":    "/erp/docs/print-snapshot-guide",
	"/erp/changes/current":         "/erp/docs/operation-guide",
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
		if normalized, ok := adminMenuPermissionAliases[key]; ok {
			key = normalized
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
