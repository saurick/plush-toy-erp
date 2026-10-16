package biz

import (
	"sort"
	"strings"
)

func runtimePageKeySet() map[string]struct{} {
	out := map[string]struct{}{}
	for _, item := range BuiltinAdminMenus() {
		if key := strings.TrimSpace(item.Key); key != "" {
			out[key] = struct{}{}
		}
	}
	return out
}

func allowedRuntimePagesFromSnapshot(snapshot map[string]any) []string {
	pages := stringSliceFromSnapshot(snapshot, "pages")
	if len(pages) == 0 {
		return []string{}
	}
	allowed := runtimePageKeySet()
	out := make([]string, 0, len(pages))
	for _, pageKey := range pages {
		if _, ok := allowed[pageKey]; ok {
			out = append(out, pageKey)
		}
	}
	return normalizeStringList(out)
}

func compiledSnapshotPagesAreAllowed(snapshot map[string]any) bool {
	if _, exists := snapshot["pages"]; !exists {
		return false
	}
	pages := stringSliceFromSnapshot(snapshot, "pages")
	if len(pages) == 0 {
		return false
	}
	allowed := runtimePageKeySet()
	for _, pageKey := range pages {
		if _, ok := allowed[pageKey]; !ok {
			return false
		}
	}
	return true
}

func compiledSnapshotRolePageProjectionsAreAllowed(snapshot map[string]any, roleProfileKeys map[string]struct{}) bool {
	raw, exists := snapshot["rolePageProjections"]
	if !exists {
		return true
	}
	projections, ok := raw.(map[string]any)
	if !ok {
		return false
	}
	allowedPages := runtimePageKeySet()
	configuredPages := map[string]struct{}{}
	for _, pageKey := range allowedRuntimePagesFromSnapshot(snapshot) {
		configuredPages[pageKey] = struct{}{}
	}
	for rawRoleKey, rawPageKeys := range projections {
		roleKey := NormalizeRoleKey(rawRoleKey)
		if roleKey == "" {
			return false
		}
		if _, exists := roleProfileKeys[roleKey]; !exists {
			return false
		}
		pageKeys, ok := customerConfigStringSlice(rawPageKeys)
		if !ok || len(pageKeys) == 0 {
			return false
		}
		for _, pageKey := range pageKeys {
			if _, allowed := allowedPages[pageKey]; !allowed {
				return false
			}
			if _, configured := configuredPages[pageKey]; !configured {
				return false
			}
		}
	}
	return true
}

func customerConfigStringSlice(value any) ([]string, bool) {
	switch typed := value.(type) {
	case []string:
		return normalizeStringList(typed), true
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			text, ok := item.(string)
			if !ok || strings.TrimSpace(text) == "" {
				return nil, false
			}
			out = append(out, text)
		}
		return normalizeStringList(out), true
	default:
		return nil, false
	}
}

func compiledSnapshotFieldPoliciesAreAllowed(snapshot map[string]any) bool {
	raw, exists := snapshot["fieldPolicies"]
	if !exists {
		return true
	}
	fieldPolicies, ok := raw.(map[string]any)
	if !ok {
		return false
	}
	for rawSurfaceKey, rawSurfaceValue := range fieldPolicies {
		surfaceKey := strings.TrimSpace(rawSurfaceKey)
		allowedFields, ok := runtimeFieldPolicySurfaceKeys[surfaceKey]
		if !ok {
			return false
		}
		surface, ok := rawSurfaceValue.(map[string]any)
		if !ok {
			return false
		}
		for rawFieldKey, rawPolicy := range surface {
			fieldKey := strings.TrimSpace(rawFieldKey)
			if _, ok := allowedFields[fieldKey]; !ok {
				return false
			}
			policy, ok := rawPolicy.(map[string]any)
			if !ok || len(policy) != 1 {
				return false
			}
			if _, ok := policy["visible"].(bool); !ok {
				return false
			}
		}
	}
	return true
}

func effectiveFieldPoliciesFromSnapshot(snapshot map[string]any) map[string]any {
	raw, ok := snapshot["fieldPolicies"].(map[string]any)
	if !ok {
		return map[string]any{}
	}
	out := map[string]any{}
	for surfaceKey, allowedFields := range runtimeFieldPolicySurfaceKeys {
		rawSurface, ok := raw[surfaceKey].(map[string]any)
		if !ok {
			continue
		}
		surface := map[string]any{}
		for fieldKey := range allowedFields {
			if policy, ok := rawSurface[fieldKey].(map[string]any); ok {
				if visible, ok := policy["visible"].(bool); ok {
					surface[fieldKey] = map[string]any{"visible": visible}
				}
			}
		}
		if len(surface) > 0 {
			out[surfaceKey] = surface
		}
	}
	return out
}

func effectiveFieldPoliciesFromSnapshotForEnabledModules(snapshot map[string]any, enabledModules map[string]struct{}) map[string]any {
	policies := effectiveFieldPoliciesFromSnapshot(snapshot)
	if len(policies) == 0 {
		return policies
	}
	out := map[string]any{}
	for surfaceKey, policy := range policies {
		if customerConfigModulesEnabled(customerConfigModulesForFieldPolicySurface(surfaceKey), enabledModules) {
			out[surfaceKey] = policy
		}
	}
	return out
}

func normalizeStringList(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
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

func builtinEffectiveSession(customerKey string, admin *AdminUser, roleKeys []string) *EffectiveSession {
	return &EffectiveSession{
		ConfigRevision: "",
		ConfigHash:     "",
		Customer: EffectiveSessionCustomer{
			Key:  customerKey,
			Name: customerKey,
		},
		Modules:       map[string]string{},
		Roles:         roleKeys,
		Pages:         adminMenuKeys(admin),
		Actions:       effectiveActionKeys(admin),
		WorkPools:     roleKeys,
		FieldPolicies: map[string]any{},
		Source:        "builtin_rbac_fallback",
	}
}

func buildEffectiveSessionFromRevision(
	customerKey string,
	revision *CustomerConfigRevision,
	admin *AdminUser,
	roleKeys []string,
	modules []DeploymentModuleStateInput,
	roleProfiles []RoleProfileInput,
	entitlements []AccessEntitlementInput,
	workPools []WorkPoolInput,
	memberships []WorkPoolMembershipInput,
) *EffectiveSession {
	compiledSnapshotString := func(key string) string {
		if revision == nil || revision.CompiledSnapshot == nil {
			return ""
		}
		value, _ := revision.CompiledSnapshot[key].(string)
		return strings.TrimSpace(value)
	}
	moduleMap := map[string]string{}
	for _, item := range modules {
		if item.ModuleKey != "" {
			moduleMap[item.ModuleKey] = item.State
		}
	}
	enabledModules := customerConfigModuleSetByStates(modules, "enabled")
	readableModules := customerConfigModuleSetByStates(modules, "enabled", "read_only")
	baseActions := PermissionKeySet(effectiveActionKeys(admin))
	actions := sortedPermissionKeys(customerConfigRoleActionSet(
		baseActions,
		roleKeys,
		roleProfiles,
		entitlements,
		customerKey,
		func(capabilityKey string) bool {
			return customerConfigActionAllowedByModuleState(capabilityKey, enabledModules, readableModules)
		},
	))
	allowedWorkPools := customerConfigWorkPoolEnabledModuleSet(workPools, enabledModules)
	poolSet := map[string]struct{}{}
	for _, item := range memberships {
		if item.Enabled && item.PoolKey != "" && allowedWorkPools[strings.TrimSpace(item.PoolKey)] {
			poolSet[item.PoolKey] = struct{}{}
		}
	}
	pools := make([]string, 0, len(poolSet))
	for key := range poolSet {
		pools = append(pools, key)
	}
	sort.Strings(pools)
	customerName := customerKey
	fieldPolicies := map[string]any{}
	if revision != nil && revision.CompiledSnapshot != nil {
		if customer, ok := revision.CompiledSnapshot["customer"].(map[string]any); ok {
			if name, ok := customer["name"].(string); ok && strings.TrimSpace(name) != "" {
				customerName = strings.TrimSpace(name)
			}
		}
		fieldPolicies = effectiveFieldPoliciesFromSnapshotForEnabledModules(revision.CompiledSnapshot, readableModules)
	}
	printTemplateDefaults := effectivePrintTemplateDefaultsFromSnapshotForEnabledModules(revision.CompiledSnapshot, readableModules)
	// Page projection must follow the already narrowed effective actions. Using the
	// original admin permissions here would keep pages from a customer-disabled
	// role visible even though its actions and work pools were removed.
	pageProjectionAdmin := &AdminUser{Permissions: actions, IsSuperAdmin: admin.IsSuperAdmin}
	pages := effectivePageKeysForEnabledModules(pageProjectionAdmin, revision.CompiledSnapshot, readableModules)
	if !admin.IsSuperAdmin {
		pages = effectivePageKeysForRoles(pages, revision.CompiledSnapshot, roleKeys)
	}
	return &EffectiveSession{
		ConfigRevision:       revision.Revision,
		ConfigHash:           revision.ConfigHash,
		ConfigHashVersion:    revision.ConfigHashVersion,
		ConfigProductVersion: strings.TrimSpace(revision.ProductVersion),
		ConfigApplyPurpose:   compiledSnapshotString("applyPurpose"),
		ConfigDatasetVersion: compiledSnapshotString("datasetVersion"),
		ConfigTarget:         compiledSnapshotString("target"),
		Customer: EffectiveSessionCustomer{
			Key:  customerKey,
			Name: customerName,
		},
		Modules:               moduleMap,
		Roles:                 roleKeys,
		Pages:                 pages,
		Actions:               actions,
		WorkPools:             pools,
		FieldPolicies:         fieldPolicies,
		PrintTemplateDefaults: printTemplateDefaults,
		Source:                "active_customer_config_revision",
	}
}

func customerRoleProfileMap(profiles []RoleProfileInput) map[string]RoleProfileInput {
	out := make(map[string]RoleProfileInput, len(profiles))
	for _, profile := range profiles {
		roleKey := NormalizeRoleKey(profile.RoleKey)
		if roleKey != "" {
			out[roleKey] = profile
		}
	}
	return out
}

func enabledCustomerRoleKeys(roleKeys []string, profiles []RoleProfileInput) []string {
	profileByRole := customerRoleProfileMap(profiles)
	out := make([]string, 0, len(roleKeys))
	for _, roleKey := range NormalizeAdminRoleKeys(roleKeys) {
		profile, exists := profileByRole[roleKey]
		if exists && !profile.Disabled {
			out = append(out, roleKey)
		}
	}
	return out
}

var runtimePrintTemplateModuleKeys = map[string][]string{
	"material-purchase-contract": []string{"purchase_orders"},
	"processing-contract":        []string{"outsourcing_orders"},
}

var runtimePrintPartyDefaultKeys = map[string]struct{}{
	"buyerCompany": {},
	"buyerContact": {},
	"buyerPhone":   {},
	"buyerAddress": {},
	"buyerSigner":  {},
}

func compiledSnapshotPrintTemplateDefaultsAreAllowed(snapshot map[string]any) bool {
	raw, exists := snapshot["printTemplateDefaults"]
	if !exists || raw == nil {
		return true
	}
	defaults, ok := raw.(map[string]any)
	if !ok {
		return false
	}
	if defaults["sales_order_print_template_enabled"] == true {
		return false
	}
	templates, ok := defaults["templates"].([]any)
	if !ok {
		return false
	}
	seen := map[string]struct{}{}
	for _, rawTemplate := range templates {
		item, ok := rawTemplate.(map[string]any)
		if !ok {
			return false
		}
		templateKey, ok := item["template_key"].(string)
		templateKey = strings.TrimSpace(templateKey)
		if !ok || templateKey == "" {
			return false
		}
		if _, allowed := runtimePrintTemplateModuleKeys[templateKey]; !allowed {
			return false
		}
		if _, duplicate := seen[templateKey]; duplicate {
			return false
		}
		seen[templateKey] = struct{}{}
		if item["supplier_defaults_allowed"] == true || item["supplier_defaults"] != nil {
			return false
		}
		partyDefaults, ok := item["party_defaults"].(map[string]any)
		if !ok || len(partyDefaults) == 0 {
			return false
		}
		for key, value := range partyDefaults {
			if _, allowed := runtimePrintPartyDefaultKeys[key]; !allowed {
				return false
			}
			text, ok := value.(string)
			if !ok || strings.TrimSpace(text) == "" {
				return false
			}
		}
	}
	return true
}

func effectivePrintTemplateDefaultsFromSnapshotForEnabledModules(snapshot map[string]any, enabledModules map[string]struct{}) map[string]any {
	if len(snapshot) == 0 {
		return map[string]any{}
	}
	raw, ok := snapshot["printTemplateDefaults"].(map[string]any)
	if !ok || raw["runtime_enabled"] != true || raw["formal_runtime_consumed"] != true {
		return map[string]any{}
	}
	templates, ok := raw["templates"].([]any)
	if !ok {
		return map[string]any{}
	}
	outTemplates := make([]any, 0, len(templates))
	for _, rawTemplate := range templates {
		item, ok := rawTemplate.(map[string]any)
		if !ok {
			continue
		}
		templateKey, ok := item["template_key"].(string)
		templateKey = strings.TrimSpace(templateKey)
		if !ok || templateKey == "" || !printTemplateModulesEnabled(templateKey, enabledModules) {
			continue
		}
		partyDefaults, ok := item["party_defaults"].(map[string]any)
		if !ok || len(partyDefaults) == 0 {
			continue
		}
		cleanDefaults := map[string]any{}
		for key, value := range partyDefaults {
			if _, allowed := runtimePrintPartyDefaultKeys[key]; !allowed {
				continue
			}
			if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
				cleanDefaults[key] = strings.TrimSpace(text)
			}
		}
		if len(cleanDefaults) == 0 {
			continue
		}
		outTemplates = append(outTemplates, map[string]any{
			"template_key":              templateKey,
			"party_defaults":            cleanDefaults,
			"supplier_defaults_allowed": false,
			"source":                    "active_customer_config_revision",
		})
	}
	if len(outTemplates) == 0 {
		return map[string]any{}
	}
	return map[string]any{
		"runtime_enabled":                    true,
		"formal_runtime_consumed":            true,
		"sales_order_print_template_enabled": false,
		"source":                             "active_customer_config_revision",
		"templates":                          outTemplates,
	}
}

func printTemplateModulesEnabled(templateKey string, enabledModules map[string]struct{}) bool {
	moduleKeys, ok := runtimePrintTemplateModuleKeys[templateKey]
	if !ok || len(moduleKeys) == 0 {
		return false
	}
	for _, moduleKey := range moduleKeys {
		if _, enabled := enabledModules[moduleKey]; !enabled {
			return false
		}
	}
	return true
}

func effectivePageKeys(admin *AdminUser, snapshot map[string]any) []string {
	rbacPages := adminMenuKeys(admin)
	configPages := allowedRuntimePagesFromSnapshot(snapshot)
	if len(configPages) == 0 {
		return []string{}
	}
	allowed := map[string]struct{}{}
	for _, key := range configPages {
		allowed[key] = struct{}{}
	}
	out := make([]string, 0, len(rbacPages))
	for _, key := range rbacPages {
		if _, ok := allowed[key]; ok {
			out = append(out, key)
		}
	}
	return out
}

func effectivePageKeysForEnabledModules(admin *AdminUser, snapshot map[string]any, enabledModules map[string]struct{}) []string {
	pages := effectivePageKeys(admin, snapshot)
	if len(pages) == 0 {
		return []string{}
	}
	out := []string{}
	for _, pageKey := range pages {
		if customerConfigPageAllowedByModules(pageKey, enabledModules) {
			out = append(out, pageKey)
		}
	}
	return normalizeStringList(out)
}

func effectivePageKeysForRoles(pageKeys []string, snapshot map[string]any, roleKeys []string) []string {
	raw, exists := snapshot["rolePageProjections"]
	if !exists {
		return normalizeStringList(pageKeys)
	}
	projections, ok := raw.(map[string]any)
	if !ok {
		return []string{}
	}
	allowed := map[string]struct{}{}
	for _, roleKey := range NormalizeAdminRoleKeys(roleKeys) {
		projected, ok := customerConfigStringSlice(projections[roleKey])
		if !ok {
			continue
		}
		for _, pageKey := range projected {
			allowed[pageKey] = struct{}{}
		}
	}
	out := make([]string, 0, len(pageKeys))
	for _, pageKey := range pageKeys {
		if _, ok := allowed[pageKey]; ok {
			out = append(out, pageKey)
		}
	}
	return normalizeStringList(out)
}

func customerConfigModuleSetByStates(modules []DeploymentModuleStateInput, allowedStates ...string) map[string]struct{} {
	out := map[string]struct{}{}
	allowed := map[string]struct{}{}
	for _, raw := range allowedStates {
		if state := strings.TrimSpace(raw); state != "" {
			allowed[state] = struct{}{}
		}
	}
	for _, item := range modules {
		key := normalizeModuleKey(item.ModuleKey)
		if key == "" {
			continue
		}
		state := strings.TrimSpace(item.State)
		if state == "" {
			state = "enabled"
		}
		if _, ok := allowed[state]; ok {
			out[key] = struct{}{}
		}
	}
	return out
}

func customerConfigWorkPoolEnabledModuleSet(workPools []WorkPoolInput, enabledModules map[string]struct{}) map[string]bool {
	out := map[string]bool{}
	for _, pool := range workPools {
		poolKey := strings.TrimSpace(pool.PoolKey)
		moduleKey := normalizeModuleKey(pool.ModuleKey)
		if poolKey == "" || moduleKey == "" {
			continue
		}
		if _, ok := enabledModules[moduleKey]; ok {
			out[poolKey] = true
		}
	}
	return out
}

func customerConfigPageAllowedByModules(pageKey string, enabledModules map[string]struct{}) bool {
	moduleKeys := customerConfigModulesForPage(pageKey)
	if len(moduleKeys) == 0 {
		return true
	}
	return customerConfigModulesEnabled(moduleKeys, enabledModules)
}

func customerConfigActionAllowedByModuleState(actionKey string, enabledModules, readableModules map[string]struct{}) bool {
	actionKey = strings.TrimSpace(actionKey)
	if actionKey == "" {
		return false
	}
	if strings.HasPrefix(actionKey, "page.") && strings.HasSuffix(actionKey, ".read") {
		pageKey := strings.TrimSuffix(strings.TrimPrefix(actionKey, "page."), ".read")
		return customerConfigPageAllowedByModules(pageKey, readableModules)
	}
	if strings.HasPrefix(actionKey, "contact.") {
		moduleSet := enabledModules
		if customerConfigActionIsReadOnly(actionKey) {
			moduleSet = readableModules
		}
		return customerConfigAnyModuleEnabled([]string{"customers", "suppliers"}, moduleSet)
	}
	moduleKeys := customerConfigModulesForAction(actionKey)
	if len(moduleKeys) == 0 {
		return true
	}
	moduleKeys = customerConfigModuleDependencyClosure(moduleKeys)
	if customerConfigActionIsReadOnly(actionKey) {
		return customerConfigModulesEnabled(moduleKeys, readableModules)
	}
	return customerConfigModulesEnabled(moduleKeys, enabledModules)
}

func customerConfigAnyModuleEnabled(moduleKeys []string, modules map[string]struct{}) bool {
	for _, raw := range moduleKeys {
		if _, ok := modules[normalizeModuleKey(raw)]; ok {
			return true
		}
	}
	return false
}

func customerConfigModuleDependencyClosure(moduleKeys []string) []string {
	seen := map[string]struct{}{}
	var add func(string)
	add = func(raw string) {
		moduleKey := normalizeModuleKey(raw)
		if moduleKey == "" {
			return
		}
		if _, exists := seen[moduleKey]; exists {
			return
		}
		seen[moduleKey] = struct{}{}
		if catalog, ok := productModuleCatalogItemForKey(moduleKey); ok {
			for _, dependency := range catalog.Dependencies {
				add(dependency)
			}
		}
	}
	for _, moduleKey := range moduleKeys {
		add(moduleKey)
	}
	out := make([]string, 0, len(seen))
	for moduleKey := range seen {
		out = append(out, moduleKey)
	}
	return normalizeStringList(out)
}

func customerConfigActionIsReadOnly(actionKey string) bool {
	actionKey = strings.TrimSpace(actionKey)
	for _, permission := range BuiltinPermissions() {
		if permission.Key == actionKey {
			return permission.Action == "read"
		}
	}
	return false
}

func customerConfigModulesEnabled(moduleKeys []string, enabledModules map[string]struct{}) bool {
	for _, raw := range moduleKeys {
		moduleKey := normalizeModuleKey(raw)
		if moduleKey == "" {
			continue
		}
		if _, ok := enabledModules[moduleKey]; !ok {
			return false
		}
	}
	return true
}

func customerConfigModulesForPage(pageKey string) []string {
	pageKey = strings.TrimSpace(pageKey)
	if pageKey == "" {
		return []string{}
	}
	moduleKeys := []string{}
	for moduleKey, item := range productModuleCatalog {
		for _, candidate := range item.PageKeys {
			if strings.TrimSpace(candidate) == pageKey {
				moduleKeys = append(moduleKeys, moduleKey)
			}
		}
	}
	return normalizeStringList(moduleKeys)
}

func customerConfigModulesForFieldPolicySurface(surfaceKey string) []string {
	switch strings.TrimSpace(surfaceKey) {
	case "customers.default":
		return []string{"customers"}
	case "suppliers.default":
		return []string{"suppliers"}
	case "sales_orders.default":
		return []string{"sales_orders"}
	default:
		return []string{}
	}
}

func customerConfigModulesForAction(actionKey string) []string {
	switch {
	case strings.HasPrefix(actionKey, "customer."):
		return []string{"customers"}
	case strings.HasPrefix(actionKey, "supplier."):
		return []string{"suppliers"}
	case strings.HasPrefix(actionKey, "material."):
		return []string{"materials"}
	case strings.HasPrefix(actionKey, "process."):
		return []string{"processes"}
	case strings.HasPrefix(actionKey, "product."), strings.HasPrefix(actionKey, "product_sku."):
		return []string{"products"}
	case strings.HasPrefix(actionKey, "bom."):
		return []string{"material_bom"}
	case strings.HasPrefix(actionKey, "contact."):
		return []string{"customers", "suppliers"}
	case strings.HasPrefix(actionKey, "sales_order."), strings.HasPrefix(actionKey, "sales_order_item."):
		return []string{"sales_orders"}
	case strings.HasPrefix(actionKey, "workflow.task."):
		return []string{"workflow_tasks"}
	case strings.HasPrefix(actionKey, "purchase.order."):
		return []string{"purchase_orders"}
	case strings.HasPrefix(actionKey, "outsourcing.order."):
		return []string{"outsourcing_orders"}
	case strings.HasPrefix(actionKey, "purchase.receipt."), strings.HasPrefix(actionKey, "purchase.return."):
		return []string{"purchase_receipts"}
	case strings.HasPrefix(actionKey, "warehouse.inventory."), strings.HasPrefix(actionKey, "warehouse.inbound."), strings.HasPrefix(actionKey, "warehouse.outbound."), strings.HasPrefix(actionKey, "warehouse.adjustment."):
		return []string{"inventory"}
	case strings.HasPrefix(actionKey, "stock.reservation."):
		return []string{"inventory"}
	case strings.HasPrefix(actionKey, "shipment."):
		return []string{"shipments"}
	case strings.HasPrefix(actionKey, "quality."):
		return []string{"quality_inspections"}
	case strings.HasPrefix(actionKey, "finance."):
		return []string{"finance"}
	case strings.HasPrefix(actionKey, "pmc."):
		return []string{"production"}
	case strings.HasPrefix(actionKey, "production."):
		return []string{"production"}
	case actionKey == PermissionMobileSalesAccess:
		return []string{"sales_orders"}
	case actionKey == PermissionMobilePurchaseAccess:
		return []string{"purchase_orders", "purchase_receipts"}
	case actionKey == PermissionMobileProductionAccess:
		return []string{"production"}
	case actionKey == PermissionMobileWarehouseAccess:
		return []string{"inventory"}
	case actionKey == PermissionMobileQualityAccess:
		return []string{"quality_inspections"}
	case actionKey == PermissionMobileFinanceAccess:
		return []string{"finance"}
	case actionKey == PermissionMobilePMCAccess:
		return []string{"production"}
	case actionKey == PermissionMobileEngineeringAccess:
		return []string{"products", "processes", "material_bom"}
	default:
		return []string{}
	}
}
