package biz

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

type productModuleCatalogItem struct {
	Name         string
	Layer        string
	Maturity     string
	Dependencies []string
	PageKeys     []string
}

var productModuleCatalog = map[string]productModuleCatalogItem{
	"customers":           {Name: "客户档案", Layer: "MasterData", Maturity: "runtime_v1", PageKeys: []string{"customers"}},
	"suppliers":           {Name: "供应商档案", Layer: "MasterData", Maturity: "runtime_v1", PageKeys: []string{"suppliers"}},
	"products":            {Name: "产品档案", Layer: "MasterData", Maturity: "runtime_v1", PageKeys: []string{"products"}},
	"materials":           {Name: "材料档案", Layer: "MasterData", Maturity: "runtime_v1", PageKeys: []string{"materials"}},
	"processes":           {Name: "加工环节", Layer: "MasterData", Maturity: "runtime_v1", PageKeys: []string{"processes"}},
	"material_bom":        {Name: "BOM 管理", Layer: "MasterData", Maturity: "runtime_v1", Dependencies: []string{"products", "materials"}, PageKeys: []string{"material-bom"}},
	"sales_orders":        {Name: "销售订单", Layer: "SourceDocument", Maturity: "runtime_v1", Dependencies: []string{"customers", "products"}, PageKeys: []string{"sales-orders"}},
	"purchase_orders":     {Name: "采购订单", Layer: "SourceDocument", Maturity: "runtime_v1", Dependencies: []string{"suppliers", "materials"}, PageKeys: []string{"accessories-purchase"}},
	"purchase_receipts":   {Name: "采购入库", Layer: "Fact", Maturity: "runtime_v1", Dependencies: []string{"purchase_orders", "quality_inspections", "inventory"}, PageKeys: []string{"inbound"}},
	"quality_inspections": {Name: "质检", Layer: "Fact", Maturity: "runtime_v1", Dependencies: []string{"inventory"}, PageKeys: []string{"quality-inspections"}},
	"outsourcing_orders":  {Name: "委外订单", Layer: "SourceDocument", Maturity: "runtime_v1", Dependencies: []string{"suppliers", "processes"}, PageKeys: []string{"processing-contracts"}},
	"production_orders":   {Name: "生产订单", Layer: "SourceDocument", Maturity: "runtime_v1", Dependencies: []string{"products", "material_bom"}, PageKeys: []string{"production-orders"}},
	"inventory":           {Name: "库存台账", Layer: "FactReadModel", Maturity: "runtime_v1", PageKeys: []string{"inventory", "inbound", "outbound"}},
	"shipments":           {Name: "出货单", Layer: "Fact", Maturity: "runtime_v1", Dependencies: []string{"sales_orders", "inventory"}, PageKeys: []string{"shipments", "outbound"}},
	"finance":             {Name: "财务业务", Layer: "FactCandidate", Maturity: "workflow_assisted", PageKeys: []string{"finance-dashboard", "payable-reconciliation", "shipment-finance"}},
	"workflow_tasks":      {Name: "协同任务", Layer: "Workflow", Maturity: "runtime_v1", PageKeys: []string{"task-board", "shipping-release"}},
	"production":          {Name: "生产协同", Layer: "Workflow", Maturity: "workflow_assisted", PageKeys: []string{"production-progress"}},
}

func normalizeModuleKey(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func productModuleCatalogItemForKey(moduleKey string) (productModuleCatalogItem, bool) {
	item, ok := productModuleCatalog[normalizeModuleKey(moduleKey)]
	return item, ok
}

func missingModuleDependencies(dependencies []string, modules map[string]DeploymentModuleStateInput) []string {
	missing := []string{}
	for _, raw := range dependencies {
		dependency := normalizeModuleKey(raw)
		if dependency == "" {
			continue
		}
		state := strings.TrimSpace(modules[dependency].State)
		if state != "enabled" {
			missing = append(missing, dependency)
		}
	}
	return normalizeStringList(missing)
}

func validateCustomerConfigModuleClosure(modules []DeploymentModuleStateInput) error {
	moduleStates := map[string]string{}
	for _, item := range modules {
		moduleKey := normalizeModuleKey(item.ModuleKey)
		if moduleKey == "" {
			return ErrBadParam
		}
		if _, known := productModuleCatalogItemForKey(moduleKey); !known {
			return ErrBadParam
		}
		if _, duplicate := moduleStates[moduleKey]; duplicate {
			return ErrBadParam
		}
		state := strings.TrimSpace(item.State)
		if state == "" {
			state = "enabled"
		}
		moduleStates[moduleKey] = state
	}
	for moduleKey, state := range moduleStates {
		if state == "disabled" {
			continue
		}
		catalog, _ := productModuleCatalogItemForKey(moduleKey)
		for _, dependency := range catalog.Dependencies {
			dependencyState := moduleStates[normalizeModuleKey(dependency)]
			if state == "enabled" && dependencyState != "enabled" {
				return ErrBadParam
			}
			if state == "read_only" && dependencyState != "enabled" && dependencyState != "read_only" {
				return ErrBadParam
			}
		}
	}
	return nil
}

// ValidateCustomerConfigModuleClosure exposes the pure module dependency rule
// so repository-owned activation transactions can validate the exact rows they
// have locked and read.
func ValidateCustomerConfigModuleClosure(modules []DeploymentModuleStateInput) error {
	return validateCustomerConfigModuleClosure(modules)
}

func normalizeWorkflowTaskRequiredCapabilities(values []string) []string {
	capabilities := normalizeStringList(values)
	if len(capabilities) > 0 {
		return capabilities
	}
	return []string{PermissionWorkflowTaskRead, PermissionWorkflowTaskUpdate}
}

func workflowEligibleRoleKeysWithCapabilities(
	roleKeys []string,
	roleProfiles []RoleProfileInput,
	entitlements []AccessEntitlementInput,
	requiredCapabilities []string,
	customerKey string,
) map[string]struct{} {
	requiredCapabilities = normalizeWorkflowTaskRequiredCapabilities(requiredCapabilities)
	entitledRoleKeys := workflowEntitlementRoleKeysWithCapabilities(entitlements, requiredCapabilities, customerKey)
	profileByRole := customerRoleProfileMap(roleProfiles)
	out := map[string]struct{}{}
	for _, roleKey := range enabledCustomerRoleKeys(roleKeys, roleProfiles) {
		if _, entitled := entitledRoleKeys[roleKey]; !entitled {
			continue
		}
		profile := profileByRole[roleKey]
		if workflowRoleProfileRevokesAny(profile, requiredCapabilities) {
			continue
		}
		out[roleKey] = struct{}{}
	}
	return out
}

func workflowRoleProfileRevokesAny(profile RoleProfileInput, requiredCapabilities []string) bool {
	revoked := PermissionKeySet(profile.Revokes)
	for _, capabilityKey := range requiredCapabilities {
		if _, exists := revoked[strings.TrimSpace(capabilityKey)]; exists {
			return true
		}
	}
	return false
}

func workflowEntitlementRoleKeysWithCapabilities(entitlements []AccessEntitlementInput, requiredCapabilities []string, customerKey string) map[string]struct{} {
	required := map[string]struct{}{}
	for _, capabilityKey := range normalizeWorkflowTaskRequiredCapabilities(requiredCapabilities) {
		required[capabilityKey] = struct{}{}
	}
	customerKey = NormalizeCustomerKey(customerKey)
	byRole := map[string]map[string]struct{}{}
	for _, item := range entitlements {
		if !item.Enabled {
			continue
		}
		roleKey := NormalizeRoleKey(item.RoleKey)
		capabilityKey := strings.TrimSpace(item.CapabilityKey)
		if roleKey == "" || capabilityKey == "" {
			continue
		}
		if !workflowEntitlementScopeMatchesExactCustomer(item, customerKey) {
			continue
		}
		if byRole[roleKey] == nil {
			byRole[roleKey] = map[string]struct{}{}
		}
		byRole[roleKey][capabilityKey] = struct{}{}
	}
	out := map[string]struct{}{}
	for roleKey, capabilities := range byRole {
		missing := false
		for capabilityKey := range required {
			if _, ok := capabilities[capabilityKey]; !ok {
				missing = true
				break
			}
		}
		if !missing {
			out[roleKey] = struct{}{}
		}
	}
	return out
}

func workflowEntitlementScopeMatchesExactCustomer(item AccessEntitlementInput, customerKey string) bool {
	return strings.EqualFold(strings.TrimSpace(item.ScopeType), "customer") &&
		NormalizeCustomerKey(item.ScopeValue) == NormalizeCustomerKey(customerKey)
}

func workflowEntitlementScopeMatchesCustomer(item AccessEntitlementInput, customerKey string) bool {
	scopeType := strings.ToLower(strings.TrimSpace(item.ScopeType))
	scopeValue := strings.ToLower(strings.TrimSpace(item.ScopeValue))
	if scopeType == "" {
		scopeType = "global"
	}
	if scopeValue == "" {
		scopeValue = "*"
	}
	switch scopeType {
	case "global":
		return scopeValue == "*" || scopeValue == "global"
	case "customer":
		return scopeValue == "*" || scopeValue == NormalizeCustomerKey(customerKey)
	default:
		return false
	}
}

func NormalizeCustomerKey(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func hashCanonicalJSON(value map[string]any) (string, error) {
	if len(value) == 0 {
		return "", ErrBadParam
	}
	if containsForbiddenCustomerConfigPayload(value) {
		return "", ErrBadParam
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}

// HashCustomerConfigPublishInput normalizes the caller-owned selection payload
// and fingerprints every immutable part of the resulting canonical revision.
// Customer key and revision identify the record; they are intentionally not
// part of its content hash.
func HashCustomerConfigPublishInput(in CustomerConfigPublishInput) (string, error) {
	normalized, err := normalizeCustomerConfigPublishInput(in)
	if err != nil {
		return "", err
	}
	return hashNormalizedCustomerConfigPublishInput(normalized)
}

func hashNormalizedCustomerConfigPublishInput(in CustomerConfigPublishInput) (string, error) {
	if len(in.CompiledSnapshot) == 0 || containsForbiddenCustomerConfigPayload(in.CompiledSnapshot) {
		return "", ErrBadParam
	}
	moduleStates, err := canonicalCustomerConfigList(in.ModuleStates)
	if err != nil {
		return "", err
	}
	roleProfiles, err := canonicalCustomerConfigList(in.RoleProfiles)
	if err != nil {
		return "", err
	}
	accessEntitlements, err := canonicalCustomerConfigList(in.AccessEntitlements)
	if err != nil {
		return "", err
	}
	workPools, err := canonicalCustomerConfigList(in.WorkPools)
	if err != nil {
		return "", err
	}
	workPoolMemberships, err := canonicalCustomerConfigList(in.WorkPoolMemberships)
	if err != nil {
		return "", err
	}
	payload, err := json.Marshal(struct {
		ProductVersion      string            `json:"product_version"`
		CompiledSnapshot    map[string]any    `json:"compiled_snapshot"`
		ModuleStates        []json.RawMessage `json:"module_states"`
		RoleProfiles        []json.RawMessage `json:"role_profiles"`
		AccessEntitlements  []json.RawMessage `json:"access_entitlements"`
		WorkPools           []json.RawMessage `json:"work_pools"`
		WorkPoolMemberships []json.RawMessage `json:"work_pool_memberships"`
	}{
		ProductVersion:      in.ProductVersion,
		CompiledSnapshot:    in.CompiledSnapshot,
		ModuleStates:        moduleStates,
		RoleProfiles:        roleProfiles,
		AccessEntitlements:  accessEntitlements,
		WorkPools:           workPools,
		WorkPoolMemberships: workPoolMemberships,
	})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}

func canonicalCustomerConfigList[T any](items []T) ([]json.RawMessage, error) {
	out := make([]json.RawMessage, 0, len(items))
	for _, item := range items {
		payload, err := json.Marshal(item)
		if err != nil {
			return nil, err
		}
		out = append(out, payload)
	}
	sort.Slice(out, func(i, j int) bool {
		return string(out[i]) < string(out[j])
	})
	return out, nil
}

func normalizeCustomerConfigHash(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if len(value) != sha256.Size*2 {
		return "", ErrBadParam
	}
	if _, err := hex.DecodeString(value); err != nil {
		return "", ErrBadParam
	}
	return value, nil
}

func normalizeCustomerConfigPublishInput(in CustomerConfigPublishInput) (CustomerConfigPublishInput, error) {
	in.CustomerKey = NormalizeCustomerKey(in.CustomerKey)
	in.Revision = strings.TrimSpace(in.Revision)
	in.ProductVersion = strings.TrimSpace(in.ProductVersion)
	if in.CustomerKey == "" || in.Revision == "" || in.ProductVersion == "" || len(in.CompiledSnapshot) == 0 {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: customer key, revision, product version and compiled snapshot are required", ErrBadParam)
	}
	if len(in.CustomerKey) > 64 || len(in.Revision) > 64 || len(in.ProductVersion) > 128 {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: customer key, revision or product version exceeds schema limits", ErrBadParam)
	}
	applyPurpose := ""
	if rawApplyPurpose, exists := in.CompiledSnapshot["applyPurpose"]; exists {
		text, ok := rawApplyPurpose.(string)
		if !ok {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: compiled snapshot apply purpose is invalid", ErrBadParam)
		}
		applyPurpose = strings.TrimSpace(text)
		if applyPurpose == "" {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: compiled snapshot apply purpose is invalid", ErrBadParam)
		}
	}
	snapshotString := func(key string) string {
		value, _ := in.CompiledSnapshot[key].(string)
		return strings.TrimSpace(value)
	}
	localPurpose := applyPurpose == CustomerConfigLocalTestApplyPurpose
	localProduct := in.ProductVersion == CustomerConfigLocalTestProductVersion
	localCandidate := strings.HasPrefix(in.ProductVersion, "local-customer-package-test-") ||
		strings.HasPrefix(applyPurpose, "local_test_")
	trialDatasetVersion := snapshotString("datasetVersion")
	trialTarget := snapshotString("target")
	trialRevision := strings.Contains(in.Revision, "-customer-trial-")
	trialProduct := strings.HasPrefix(in.ProductVersion, "customer-trial-")
	trialPurpose := strings.HasPrefix(applyPurpose, "customer_trial_")
	trialTargetMarker := strings.HasPrefix(trialTarget, "customer-trial-")
	trialCandidate := trialRevision ||
		trialProduct || trialPurpose || trialTargetMarker
	_, hasDatasetVersion := in.CompiledSnapshot["datasetVersion"]
	_, hasTarget := in.CompiledSnapshot["target"]
	localIdentityHasRemoteMarker := localPurpose && localProduct && (hasDatasetVersion || hasTarget)
	if (localCandidate && (!localPurpose || !localProduct)) || localIdentityHasRemoteMarker ||
		(!localPurpose && applyPurpose != "" && !trialCandidate) {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: test apply purpose and product version must match", ErrBadParam)
	}
	if trialCandidate && (!trialRevision ||
		in.ProductVersion != CustomerConfigTrialProductVersion ||
		applyPurpose != CustomerConfigTrialApplyPurpose ||
		trialDatasetVersion != CustomerConfigTrialDatasetVersion ||
		trialTarget != CustomerConfigTrialTarget) {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: customer trial identity must match the registered dataset", ErrBadParam)
	}
	if containsForbiddenCustomerConfigPayload(in.CompiledSnapshot) {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: compiled snapshot contains forbidden payload", ErrBadParam)
	}
	compiledSnapshot, err := normalizeCustomerProcessContracts(in.CompiledSnapshot)
	if err != nil {
		return CustomerConfigPublishInput{}, err
	}
	in.CompiledSnapshot = compiledSnapshot
	if !compiledSnapshotPagesAreAllowed(in.CompiledSnapshot) {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: compiled snapshot pages are invalid", ErrBadParam)
	}
	if !compiledSnapshotFieldPoliciesAreAllowed(in.CompiledSnapshot) {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: compiled snapshot field policies are invalid", ErrBadParam)
	}
	if !compiledSnapshotPrintTemplateDefaultsAreAllowed(in.CompiledSnapshot) {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: compiled snapshot print template defaults are invalid", ErrBadParam)
	}
	for index := range in.ModuleStates {
		item := &in.ModuleStates[index]
		item.ModuleKey = strings.TrimSpace(item.ModuleKey)
		item.ContractVersion = strings.TrimSpace(item.ContractVersion)
		item.State = strings.TrimSpace(item.State)
		item.Reason = strings.TrimSpace(item.Reason)
		if item.ModuleKey == "" {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: module state key is required", ErrBadParam)
		}
		if item.State == "" {
			item.State = "enabled"
		}
		if item.State != "enabled" && item.State != "read_only" && item.State != "disabled" {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: invalid module state for %s", ErrBadParam, item.ModuleKey)
		}
	}
	if len(in.RoleProfiles) == 0 {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: role profiles are required", ErrBadParam)
	}
	roleProfileKeys := map[string]struct{}{}
	for index := range in.RoleProfiles {
		item := &in.RoleProfiles[index]
		item.RoleKey = NormalizeRoleKey(item.RoleKey)
		item.DisplayName = strings.TrimSpace(item.DisplayName)
		item.BundleKeys = normalizeStringList(item.BundleKeys)
		item.Revokes = normalizeStringList(item.Revokes)
		if item.RoleKey == "" || item.DisplayName == "" {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: role profile key and display name are required", ErrBadParam)
		}
		if _, exists := roleProfileKeys[item.RoleKey]; exists {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: duplicate role profile %s", ErrBadParam, item.RoleKey)
		}
		roleProfileKeys[item.RoleKey] = struct{}{}
	}
	if !compiledSnapshotRolePageProjectionsAreAllowed(in.CompiledSnapshot, roleProfileKeys) {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: compiled snapshot role page projections are invalid", ErrBadParam)
	}
	for index := range in.AccessEntitlements {
		item := &in.AccessEntitlements[index]
		item.RoleKey = NormalizeRoleKey(item.RoleKey)
		item.CapabilityKey = strings.TrimSpace(item.CapabilityKey)
		item.ScopeType = strings.TrimSpace(item.ScopeType)
		item.ScopeValue = strings.TrimSpace(item.ScopeValue)
		if item.ScopeType == "" {
			item.ScopeType = "global"
		}
		if item.ScopeValue == "" {
			item.ScopeValue = "*"
		}
		if item.RoleKey == "" || item.CapabilityKey == "" {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: entitlement role and capability are required", ErrBadParam)
		}
		if _, exists := roleProfileKeys[item.RoleKey]; !exists {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: entitlement role profile %s is missing", ErrBadParam, item.RoleKey)
		}
		if !builtinRoleHasPermission(item.RoleKey, item.CapabilityKey) {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: role %s does not own capability %s", ErrBadParam, item.RoleKey, item.CapabilityKey)
		}
		if item.Constraints == nil {
			item.Constraints = map[string]any{}
		}
	}
	workPoolKeys := map[string]struct{}{}
	for index := range in.WorkPools {
		item := &in.WorkPools[index]
		item.PoolKey = strings.TrimSpace(item.PoolKey)
		item.ModuleKey = strings.TrimSpace(item.ModuleKey)
		item.DisplayName = strings.TrimSpace(item.DisplayName)
		item.Description = strings.TrimSpace(item.Description)
		if item.PoolKey == "" || item.ModuleKey == "" || item.DisplayName == "" {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: work pool key, module and display name are required", ErrBadParam)
		}
		if _, exists := workPoolKeys[item.PoolKey]; exists {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: duplicate work pool %s", ErrBadParam, item.PoolKey)
		}
		workPoolKeys[item.PoolKey] = struct{}{}
	}
	for index := range in.WorkPoolMemberships {
		item := &in.WorkPoolMemberships[index]
		item.PoolKey = strings.TrimSpace(item.PoolKey)
		item.RoleKey = NormalizeRoleKey(item.RoleKey)
		item.Strategy = strings.TrimSpace(item.Strategy)
		if item.Strategy == "" {
			item.Strategy = "role_pool"
		}
		if item.PoolKey == "" || (item.RoleKey == "" && item.UserID <= 0) {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: work pool membership target is required", ErrBadParam)
		}
		if _, exists := workPoolKeys[item.PoolKey]; !exists {
			return CustomerConfigPublishInput{}, fmt.Errorf("%w: membership work pool %s is missing", ErrBadParam, item.PoolKey)
		}
		if item.RoleKey != "" {
			if _, exists := roleProfileKeys[item.RoleKey]; !exists {
				return CustomerConfigPublishInput{}, fmt.Errorf("%w: membership role profile %s is missing", ErrBadParam, item.RoleKey)
			}
		}
	}
	if err := validateCustomerConfigModuleClosure(in.ModuleStates); err != nil {
		return CustomerConfigPublishInput{}, fmt.Errorf("%w: invalid module dependency closure", err)
	}
	return in, nil
}

func builtinRoleHasPermission(roleKey, permissionKey string) bool {
	roleKey = NormalizeRoleKey(roleKey)
	permissionKey = strings.TrimSpace(permissionKey)
	for _, role := range BuiltinRoles() {
		if role.Key == roleKey {
			return PermissionSetHasAny(PermissionKeySet(role.Permissions), permissionKey)
		}
	}
	return false
}

func containsForbiddenCustomerConfigPayload(value any) bool {
	switch typed := value.(type) {
	case map[string]any:
		for key, nested := range typed {
			normalized := strings.ToLower(strings.TrimSpace(key))
			switch normalized {
			case "secret", "secrets", "token", "password", "sql", "go", "js", "rows", "rawrows", "rawvalues", "records":
				return true
			}
			if containsForbiddenCustomerConfigPayload(nested) {
				return true
			}
		}
	case []any:
		for _, nested := range typed {
			if containsForbiddenCustomerConfigPayload(nested) {
				return true
			}
		}
	}
	return false
}
