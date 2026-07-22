package biz

import (
	"context"
	"errors"
	"strings"
)

func (uc *CustomerConfigUsecase) GetEffectiveSession(ctx context.Context, customerKey string, admin *AdminUser) (*EffectiveSession, error) {
	return uc.getEffectiveSession(ctx, customerKey, admin, true)
}

// GetEffectiveSessionRequiringActiveRevision is used by a deployment pinned to
// a real customer key. It keeps control-plane repair available while refusing
// to project builtin RBAC as that customer's active configuration.
func (uc *CustomerConfigUsecase) GetEffectiveSessionRequiringActiveRevision(ctx context.Context, customerKey string, admin *AdminUser) (*EffectiveSession, error) {
	return uc.getEffectiveSession(ctx, customerKey, admin, false)
}

func (uc *CustomerConfigUsecase) getEffectiveSession(ctx context.Context, customerKey string, admin *AdminUser, allowBuiltinFallback bool) (*EffectiveSession, error) {
	if uc == nil || uc.repo == nil || admin == nil || admin.Disabled {
		return nil, ErrForbidden
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	roleKeys := AdminRoleKeys(admin)
	if admin.IsSuperAdmin {
		for _, role := range BuiltinRoles() {
			if !role.Disabled {
				roleKeys = append(roleKeys, role.Key)
			}
		}
		roleKeys = NormalizeAdminRoleKeys(roleKeys)
	}
	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		if errors.Is(err, ErrCustomerConfigNotFound) {
			if allowBuiltinFallback {
				return builtinEffectiveSession(customerKey, admin, roleKeys), nil
			}
			return nil, ErrCustomerConfigActiveRevisionRequired
		}
		return nil, err
	}
	modules, err := uc.repo.ListDeploymentModuleStates(ctx, customerKey, active.Revision)
	if err != nil {
		return nil, err
	}
	roleProfiles, err := uc.repo.ListRoleProfiles(ctx, customerKey, active.Revision)
	if err != nil {
		return nil, err
	}
	effectiveRoleKeys := enabledCustomerRoleKeys(roleKeys, roleProfiles)
	entitlements, err := uc.repo.ListAccessEntitlements(ctx, customerKey, active.Revision, effectiveRoleKeys)
	if err != nil {
		return nil, err
	}
	workPools, err := uc.repo.ListWorkPools(ctx, customerKey, active.Revision)
	if err != nil {
		return nil, err
	}
	memberships, err := uc.repo.ListWorkPoolMemberships(ctx, customerKey, active.Revision, effectiveRoleKeys, admin.ID)
	if err != nil {
		return nil, err
	}
	return buildEffectiveSessionFromRevision(customerKey, active, admin, effectiveRoleKeys, modules, roleProfiles, entitlements, workPools, memberships), nil
}

func (uc *CustomerConfigUsecase) BuildProcessInstanceCreateFromActiveCustomerConfig(ctx context.Context, in ProcessInstanceFromCustomerConfigInput) (*ProcessInstanceCreate, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	customerKey := NormalizeCustomerKey(in.CustomerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	processKey := strings.TrimSpace(in.ProcessKey)
	if processKey == "" {
		processKey = ProcessKeySalesOrderAcceptance
	}
	if processKey != ProcessKeySalesOrderAcceptance && processKey != ProcessKeyMaterialSupply && processKey != ProcessKeyFinishedGoodsDelivery {
		return nil, ErrBadParam
	}
	idempotencyKey := strings.TrimSpace(in.IdempotencyKey)
	if in.BusinessRefID <= 0 || idempotencyKey == "" {
		return nil, ErrBadParam
	}
	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		return nil, err
	}
	definition, err := customerConfigProcessDefinition(active.CompiledSnapshot, processKey)
	if err != nil {
		return nil, err
	}
	if ok, err := boolFromProcessDefinition(definition, "runtime_loader_enabled"); err != nil || !ok {
		return nil, ErrBadParam
	}
	if getStringFromAnyMap(definition, "fact_boundary") != "no_fact_posting" {
		return nil, ErrBadParam
	}
	if getStringFromAnyMap(definition, "process_key") != processKey {
		return nil, ErrBadParam
	}
	processVersion := getStringFromAnyMap(definition, "process_version")
	if processVersion == "" {
		return nil, ErrBadParam
	}
	if strings.TrimSpace(in.ProcessVersion) != "" && strings.TrimSpace(in.ProcessVersion) != processVersion {
		return nil, ErrBadParam
	}
	businessRefType := strings.TrimSpace(in.BusinessRefType)
	if businessRefType == "" {
		businessRefType = getStringFromAnyMap(definition, "business_ref_type")
	}
	if businessRefType == "" || businessRefType != getStringFromAnyMap(definition, "business_ref_type") {
		return nil, ErrBadParam
	}
	if !customerConfigProcessBusinessRefAllowed(processKey, businessRefType) {
		return nil, ErrBadParam
	}
	modules, err := uc.repo.ListDeploymentModuleStates(ctx, customerKey, active.Revision)
	if err != nil {
		return nil, err
	}
	if err := ensureCustomerConfigProcessModulesEnabledForStart(processKey, businessRefType, definition, active.CompiledSnapshot, modules); err != nil {
		return nil, err
	}
	definitionHash, err := hashCanonicalJSON(map[string]any{"process_definition": definition})
	if err != nil {
		return nil, err
	}
	nodes, err := processNodesFromCustomerConfigDefinition(processKey, definition)
	if err != nil {
		return nil, err
	}
	var variantKey *string
	if value := getStringFromAnyMap(definition, "variant_key"); value != "" {
		variantKey = &value
	}
	return &ProcessInstanceCreate{
		ProcessKey:      processKey,
		ProcessVersion:  processVersion,
		VariantKey:      variantKey,
		ConfigRevision:  active.Revision,
		DefinitionHash:  definitionHash,
		BusinessRefType: businessRefType,
		BusinessRefID:   in.BusinessRefID,
		BusinessRefNo:   in.BusinessRefNo,
		CorrelationKey:  in.CorrelationKey,
		IdempotencyKey:  idempotencyKey,
		ModuleContractSnapshot: map[string]any{
			"source":                 "active_customer_config",
			"customer_key":           customerKey,
			"config_revision":        active.Revision,
			"process_key":            processKey,
			"process_version":        processVersion,
			"variant_key":            getStringFromAnyMap(definition, "variant_key"),
			"definition_hash_source": getStringFromAnyMap(definition, "definition_hash_source"),
			"domain_boundary":        getStringFromAnyMap(definition, "domain_boundary"),
			"fact_boundary":          getStringFromAnyMap(definition, "fact_boundary"),
		},
		Nodes: nodes,
	}, nil
}

func (uc *CustomerConfigUsecase) EnsureProcessDomainCommandModulesEnabled(ctx context.Context, customerKey string, commandKey string) error {
	moduleKeys := processDomainCommandReferencedModuleKeys(commandKey)
	if len(moduleKeys) == 0 {
		return ErrBadParam
	}
	return uc.EnsureModuleKeysEnabled(ctx, customerKey, moduleKeys...)
}

func (uc *CustomerConfigUsecase) EnsureModuleKeysEnabled(ctx context.Context, customerKey string, moduleKeys ...string) error {
	return uc.ensureModuleKeysInStates(ctx, customerKey, []string{"enabled"}, moduleKeys...)
}

func (uc *CustomerConfigUsecase) EnsureModuleKeysReadable(ctx context.Context, customerKey string, moduleKeys ...string) error {
	return uc.ensureModuleKeysInStates(ctx, customerKey, []string{"enabled", "read_only"}, moduleKeys...)
}

func (uc *CustomerConfigUsecase) ensureModuleKeysInStates(ctx context.Context, customerKey string, allowedStates []string, moduleKeys ...string) error {
	if uc == nil || uc.repo == nil {
		return ErrBadParam
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	requiredModuleKeys := normalizeStringList(moduleKeys)
	if len(requiredModuleKeys) == 0 {
		return ErrBadParam
	}
	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		return err
	}
	modules, err := uc.repo.ListDeploymentModuleStates(ctx, customerKey, active.Revision)
	if err != nil {
		return err
	}
	return ensureCustomerConfigModuleKeysInStates(requiredModuleKeys, modules, allowedStates)
}

func (uc *CustomerConfigUsecase) ExplainModuleStatus(ctx context.Context, customerKey, moduleKey string) (*CustomerModuleStatusExplanation, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	moduleKey = normalizeModuleKey(moduleKey)
	if moduleKey == "" {
		return nil, ErrBadParam
	}

	catalog, productIncluded := productModuleCatalogItemForKey(moduleKey)
	out := &CustomerModuleStatusExplanation{
		CustomerKey:            customerKey,
		ModuleKey:              moduleKey,
		ProductIncluded:        productIncluded,
		ProductName:            catalog.Name,
		ProductLayer:           catalog.Layer,
		ProductMaturity:        catalog.Maturity,
		CustomerState:          "not_configured",
		Dependencies:           normalizeStringList(catalog.Dependencies),
		DependenciesSatisfied:  productIncluded && len(catalog.Dependencies) == 0,
		ReferencedRoleKeys:     []string{},
		ReferencedWorkPoolKeys: []string{},
		ReferencedPageKeys:     []string{},
		ReferencedProcessKeys:  []string{},
		RuntimeCountSource:     "not_connected",
		Source:                 "customer_config.explain_module_status",
	}

	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		if errors.Is(err, ErrCustomerConfigNotFound) {
			out.EnableBlockedReasons = append(out.EnableBlockedReasons, "active_revision_missing")
			out.DisableBlockedReasons = append(out.DisableBlockedReasons, "active_revision_missing")
			out.Source = "no_active_customer_config"
			return out, nil
		}
		return nil, err
	}
	out.ConfigRevision = active.Revision
	out.ConfigHash = active.ConfigHash

	modules, err := uc.repo.ListDeploymentModuleStates(ctx, customerKey, active.Revision)
	if err != nil {
		return nil, err
	}
	moduleStates := map[string]DeploymentModuleStateInput{}
	for _, item := range modules {
		key := normalizeModuleKey(item.ModuleKey)
		if key == "" {
			continue
		}
		moduleStates[key] = item
	}
	if current, ok := moduleStates[moduleKey]; ok {
		out.CustomerState = strings.TrimSpace(current.State)
		if out.CustomerState == "" {
			out.CustomerState = "enabled"
		}
		out.ContractVersion = strings.TrimSpace(current.ContractVersion)
		out.Reason = strings.TrimSpace(current.Reason)
	}
	out.MissingDependencies = missingModuleDependencies(catalog.Dependencies, moduleStates)
	out.DependenciesSatisfied = productIncluded && len(out.MissingDependencies) == 0

	if productIncluded {
		if !out.DependenciesSatisfied {
			out.EnableBlockedReasons = append(out.EnableBlockedReasons, "dependencies_missing")
		}
		if out.CustomerState == "enabled" {
			out.EnableBlockedReasons = append(out.EnableBlockedReasons, "already_enabled")
		}
	} else {
		out.EnableBlockedReasons = append(out.EnableBlockedReasons, "product_module_not_included")
	}
	out.CanEnable = productIncluded && out.DependenciesSatisfied && out.CustomerState != "enabled"

	pools, err := uc.repo.ListWorkPools(ctx, customerKey, active.Revision)
	if err != nil {
		return nil, err
	}
	poolKeys := []string{}
	for _, item := range pools {
		if normalizeModuleKey(item.ModuleKey) == moduleKey {
			poolKeys = append(poolKeys, strings.TrimSpace(item.PoolKey))
		}
	}
	out.ReferencedWorkPoolKeys = normalizeStringList(poolKeys)
	memberships, err := uc.repo.ListWorkPoolMembershipsByPools(ctx, customerKey, active.Revision, out.ReferencedWorkPoolKeys)
	if err != nil {
		return nil, err
	}
	roleKeys := []string{}
	for _, item := range memberships {
		if !item.Enabled {
			continue
		}
		if roleKey := NormalizeRoleKey(item.RoleKey); roleKey != "" {
			roleKeys = append(roleKeys, roleKey)
		}
	}
	out.ReferencedRoleKeys = NormalizeAdminRoleKeys(roleKeys)
	out.ReferencedPageKeys = activeModulePageReferences(moduleKey, active.CompiledSnapshot, catalog.PageKeys)
	out.ReferencedProcessKeys = activeModuleProcessReferences(moduleKey, active.CompiledSnapshot)
	processKeys := customerConfigRuntimeProcessKeysForModule(moduleKey)
	if count, err := uc.repo.CountInFlightProcessInstances(ctx, customerKey, active.Revision, processKeys); err != nil {
		return nil, err
	} else {
		out.InFlightProcessCount = count
	}
	if count, err := uc.repo.CountOpenWorkflowTasksByResponsibilities(
		ctx,
		customerKey,
		active.Revision,
		out.ReferencedWorkPoolKeys,
		out.ReferencedRoleKeys,
	); err != nil {
		return nil, err
	} else {
		out.OpenTaskCount = count
	}
	if count, err := uc.repo.CountOpenBusinessDocumentsByModules(ctx, customerKey, []string{moduleKey}); err != nil {
		return nil, err
	} else {
		out.OpenBusinessDocCount = count
	}
	out.RuntimeCountSource = "process_workflow_business_partial"
	switch out.CustomerState {
	case "enabled", "read_only":
		if out.InFlightProcessCount > 0 {
			out.DisableBlockedReasons = append(out.DisableBlockedReasons, "in_flight_processes_present")
		}
		if out.OpenTaskCount > 0 {
			out.DisableBlockedReasons = append(out.DisableBlockedReasons, "open_workflow_tasks_present")
		}
		if out.OpenBusinessDocCount > 0 {
			out.DisableBlockedReasons = append(out.DisableBlockedReasons, "open_business_documents_present")
		}
		out.DisableBlockedReasons = append(out.DisableBlockedReasons, "module_disable_full_enforcement_not_connected")
	default:
		out.DisableBlockedReasons = append(out.DisableBlockedReasons, "module_not_enabled")
	}
	out.CanDisable = false
	return out, nil
}

func (uc *CustomerConfigUsecase) ExplainProcessDefinition(ctx context.Context, customerKey, processKey string) (*CustomerProcessDefinitionExplanation, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	processKey = strings.TrimSpace(processKey)
	if processKey == "" {
		return nil, ErrBadParam
	}

	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		return nil, err
	}
	definition, err := customerConfigProcessDefinition(active.CompiledSnapshot, processKey)
	if err != nil {
		return nil, err
	}
	nodes, loaderBlockers, executeBlockers := processDefinitionNodeExplanations(definition)
	out := &CustomerProcessDefinitionExplanation{
		CustomerKey:            customerKey,
		ProcessKey:             getStringFromAnyMap(definition, "process_key"),
		ProcessVersion:         getStringFromAnyMap(definition, "process_version"),
		VariantKey:             getStringFromAnyMap(definition, "variant_key"),
		ConfigRevision:         active.Revision,
		ConfigHash:             active.ConfigHash,
		ManifestStatus:         getStringFromAnyMap(definition, "manifest_status"),
		RuntimeLoaderEnabled:   boolValueFromAny(definition["runtime_loader_enabled"]),
		BusinessRefType:        getStringFromAnyMap(definition, "business_ref_type"),
		DomainBoundary:         getStringFromAnyMap(definition, "domain_boundary"),
		FactBoundary:           getStringFromAnyMap(definition, "fact_boundary"),
		SourceWorkflowKey:      getStringFromAnyMap(definition, "source_workflow_key"),
		SourceStatus:           getStringFromAnyMap(definition, "source_status"),
		Nodes:                  nodes,
		RuntimeLoaderBlockers:  sortedUniqueStrings(loaderBlockers),
		RuntimeExecuteBlockers: sortedUniqueStrings(executeBlockers),
		Source:                 "customer_config.explain_process_definition",
	}
	if out.ProcessKey == "" {
		out.ProcessKey = processKey
	}
	out.StartBlockedReasons = processDefinitionStartBlockedReasons(out)
	out.ExecuteBlockedReasons = processDefinitionExecuteBlockedReasons(out)
	out.CanStartRuntime = len(out.StartBlockedReasons) == 0
	out.CanExecuteRuntimeCommands = len(out.ExecuteBlockedReasons) == 0
	return out, nil
}

func (uc *CustomerConfigUsecase) WorkflowVisibleOwnerRoleKeys(ctx context.Context, customerKey string, admin *AdminUser, requiredCapabilities ...string) ([]string, error) {
	return uc.workflowVisibleOwnerRoleKeys(ctx, customerKey, admin, true, requiredCapabilities...)
}

// WorkflowVisibleOwnerRoleKeysRequiringActiveRevision is the fixed-customer
// runtime variant. It never widens task responsibility back to builtin roles
// when the active customer revision cannot be read.
func (uc *CustomerConfigUsecase) WorkflowVisibleOwnerRoleKeysRequiringActiveRevision(ctx context.Context, customerKey string, admin *AdminUser, requiredCapabilities ...string) ([]string, error) {
	return uc.workflowVisibleOwnerRoleKeys(ctx, customerKey, admin, false, requiredCapabilities...)
}

// WorkflowVisibleOwnerRoleKeysAtRevision resolves task responsibility from the
// immutable revision stored on a formal ProcessRuntime task. It never consults
// the current active revision and never falls back to builtin roles.
func (uc *CustomerConfigUsecase) WorkflowVisibleOwnerRoleKeysAtRevision(ctx context.Context, customerKey, revision string, admin *AdminUser, requiredCapabilities ...string) ([]string, error) {
	if admin == nil || admin.Disabled || uc == nil || uc.repo == nil {
		return []string{}, ErrForbidden
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	revision = strings.TrimSpace(revision)
	if revision == "" {
		return []string{}, ErrBadParam
	}
	stored, err := uc.repo.GetCustomerConfigRevision(ctx, customerKey, revision)
	if err != nil {
		return []string{}, err
	}
	if stored == nil || stored.CustomerKey != customerKey || stored.Revision != revision ||
		!customerConfigRevisionCanAuthorizeRuntimeTask(stored.Status) {
		return []string{}, ErrCustomerConfigNotFound
	}
	return uc.workflowVisibleOwnerRoleKeysAtRevision(ctx, customerKey, revision, admin, requiredCapabilities...)
}

func (uc *CustomerConfigUsecase) workflowVisibleOwnerRoleKeys(ctx context.Context, customerKey string, admin *AdminUser, allowBuiltinFallback bool, requiredCapabilities ...string) ([]string, error) {
	if admin == nil || admin.Disabled {
		return []string{}, ErrForbidden
	}
	baseRoleKeys := AdminRoleKeys(admin)
	if uc == nil || uc.repo == nil {
		if allowBuiltinFallback {
			return NormalizeAdminRoleKeys(baseRoleKeys), nil
		}
		return []string{}, ErrCustomerConfigActiveRevisionRequired
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		if errors.Is(err, ErrCustomerConfigNotFound) {
			if allowBuiltinFallback {
				return NormalizeAdminRoleKeys(baseRoleKeys), nil
			}
			return []string{}, ErrCustomerConfigActiveRevisionRequired
		}
		return []string{}, err
	}
	return uc.workflowVisibleOwnerRoleKeysAtRevision(ctx, customerKey, active.Revision, admin, requiredCapabilities...)
}

func (uc *CustomerConfigUsecase) workflowVisibleOwnerRoleKeysAtRevision(ctx context.Context, customerKey, revision string, admin *AdminUser, requiredCapabilities ...string) ([]string, error) {
	baseRoleKeys := AdminRoleKeys(admin)
	roleProfiles, err := uc.repo.ListRoleProfiles(ctx, customerKey, revision)
	if err != nil {
		return []string{}, err
	}
	enabledBaseRoleKeys := enabledCustomerRoleKeys(baseRoleKeys, roleProfiles)
	memberships, err := uc.repo.ListWorkPoolMemberships(ctx, customerKey, revision, enabledBaseRoleKeys, admin.ID)
	if err != nil {
		return []string{}, err
	}
	membershipRoleKeys := []string{}
	for _, item := range memberships {
		if !item.Enabled {
			continue
		}
		if roleKey := NormalizeRoleKey(item.RoleKey); roleKey != "" {
			membershipRoleKeys = append(membershipRoleKeys, roleKey)
		}
	}
	requiredCapabilities = normalizeWorkflowTaskRequiredCapabilities(requiredCapabilities)
	candidateRoleKeys := enabledCustomerRoleKeys(append(enabledBaseRoleKeys, membershipRoleKeys...), roleProfiles)
	entitlements, err := uc.repo.ListAccessEntitlements(ctx, customerKey, revision, candidateRoleKeys)
	if err != nil {
		return []string{}, err
	}
	eligibleRoles := workflowEligibleRoleKeysWithCapabilities(candidateRoleKeys, roleProfiles, entitlements, requiredCapabilities, customerKey)
	visibleRoleKeys := make([]string, 0, len(candidateRoleKeys))
	for _, roleKey := range candidateRoleKeys {
		if _, ok := eligibleRoles[roleKey]; ok {
			visibleRoleKeys = append(visibleRoleKeys, roleKey)
		}
	}
	return NormalizeAdminRoleKeys(visibleRoleKeys), nil
}

type WorkflowTaskCandidateExplanation struct {
	CustomerKey            string
	ConfigRevision         string
	OwnerPoolKey           string
	RequiredCapabilities   []string
	MembershipRoleKeys     []string
	EntitledRoleKeys       []string
	CandidateOwnerRoleKeys []string
	Source                 string
}

func (uc *CustomerConfigUsecase) WorkflowCandidateOwnerRoleKeys(ctx context.Context, customerKey string, ownerPoolKey string, requiredCapabilities ...string) (*WorkflowTaskCandidateExplanation, error) {
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	if uc == nil || uc.repo == nil {
		return &WorkflowTaskCandidateExplanation{
			CustomerKey:          customerKey,
			OwnerPoolKey:         strings.TrimSpace(ownerPoolKey),
			RequiredCapabilities: normalizeWorkflowTaskRequiredCapabilities(requiredCapabilities),
			Source:               "customer_config_unavailable",
		}, nil
	}
	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		if errors.Is(err, ErrCustomerConfigNotFound) {
			return &WorkflowTaskCandidateExplanation{
				CustomerKey:          customerKey,
				OwnerPoolKey:         strings.TrimSpace(ownerPoolKey),
				RequiredCapabilities: normalizeWorkflowTaskRequiredCapabilities(requiredCapabilities),
				Source:               "no_active_customer_config",
			}, nil
		}
		return nil, err
	}
	return uc.workflowCandidateOwnerRoleKeysAtRevision(ctx, customerKey, active.Revision, ownerPoolKey, "active_customer_config", requiredCapabilities...)
}

func (uc *CustomerConfigUsecase) WorkflowCandidateOwnerRoleKeysAtRevision(ctx context.Context, customerKey, revision, ownerPoolKey string, requiredCapabilities ...string) (*WorkflowTaskCandidateExplanation, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	revision = strings.TrimSpace(revision)
	if revision == "" {
		return nil, ErrBadParam
	}
	stored, err := uc.repo.GetCustomerConfigRevision(ctx, customerKey, revision)
	if err != nil {
		return nil, err
	}
	if stored == nil || stored.CustomerKey != customerKey || stored.Revision != revision ||
		!customerConfigRevisionCanAuthorizeRuntimeTask(stored.Status) {
		return nil, ErrCustomerConfigNotFound
	}
	return uc.workflowCandidateOwnerRoleKeysAtRevision(ctx, customerKey, revision, ownerPoolKey, "customer_config_revision", requiredCapabilities...)
}

func (uc *CustomerConfigUsecase) workflowCandidateOwnerRoleKeysAtRevision(ctx context.Context, customerKey, revision, ownerPoolKey, source string, requiredCapabilities ...string) (*WorkflowTaskCandidateExplanation, error) {
	ownerPoolKey = strings.TrimSpace(ownerPoolKey)
	out := &WorkflowTaskCandidateExplanation{
		CustomerKey:          customerKey,
		ConfigRevision:       revision,
		OwnerPoolKey:         ownerPoolKey,
		RequiredCapabilities: normalizeWorkflowTaskRequiredCapabilities(requiredCapabilities),
		Source:               source,
	}
	if ownerPoolKey == "" {
		out.Source = "missing_owner_pool_key"
		return out, nil
	}
	roleProfiles, err := uc.repo.ListRoleProfiles(ctx, customerKey, revision)
	if err != nil {
		out.Source = "customer_config_error"
		return out, err
	}
	memberships, err := uc.repo.ListWorkPoolMembershipsByPools(ctx, customerKey, revision, []string{ownerPoolKey})
	if err != nil {
		out.Source = "customer_config_error"
		return out, err
	}
	membershipRoleKeys := []string{}
	for _, item := range memberships {
		if !item.Enabled {
			continue
		}
		if roleKey := NormalizeRoleKey(item.RoleKey); roleKey != "" {
			membershipRoleKeys = append(membershipRoleKeys, roleKey)
		}
	}
	out.MembershipRoleKeys = enabledCustomerRoleKeys(membershipRoleKeys, roleProfiles)
	entitlements, err := uc.repo.ListAccessEntitlements(ctx, customerKey, revision, out.MembershipRoleKeys)
	if err != nil {
		out.Source = "customer_config_error"
		return out, err
	}
	entitledRoleKeys := workflowEligibleRoleKeysWithCapabilities(out.MembershipRoleKeys, roleProfiles, entitlements, out.RequiredCapabilities, customerKey)
	for roleKey := range entitledRoleKeys {
		out.EntitledRoleKeys = append(out.EntitledRoleKeys, roleKey)
	}
	out.EntitledRoleKeys = NormalizeAdminRoleKeys(out.EntitledRoleKeys)
	candidateRoleKeys := []string{}
	for _, roleKey := range out.MembershipRoleKeys {
		if _, ok := entitledRoleKeys[roleKey]; ok {
			candidateRoleKeys = append(candidateRoleKeys, roleKey)
		}
	}
	out.CandidateOwnerRoleKeys = NormalizeAdminRoleKeys(candidateRoleKeys)
	return out, nil
}
