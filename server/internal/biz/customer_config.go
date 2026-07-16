package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	DefaultCustomerKey = "demo"
	// CustomerConfigHashVersion identifies SHA-256 over the complete normalized
	// publish payload. This is the first and only formal hash contract.
	CustomerConfigHashVersion = 1

	CustomerConfigStatusPublished  = "published"
	CustomerConfigStatusActive     = "active"
	CustomerConfigStatusSuperseded = "superseded"

	CustomerConfigLocalTestApplyPurpose   = "local_test_apply"
	CustomerConfigLocalTestProductVersion = "local-customer-package-test-apply"
	CustomerConfigLocalTestAllowEnv       = "ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG"

	CustomerConfigTrialApplyPurpose   = "customer_trial_test_apply"
	CustomerConfigTrialDatasetVersion = "2026.07.16-v5"
	CustomerConfigTrialProductVersion = "customer-trial-133-test-2026.07.16-v5"
	CustomerConfigTrialTarget         = "customer-trial-133"
)

var (
	ErrCustomerConfigNotFound               = errors.New("customer config not found")
	ErrCustomerConfigRevisionImmutable      = errors.New("customer config revision is immutable")
	ErrCustomerConfigHashMismatch           = errors.New("customer config hash mismatch")
	ErrCustomerConfigActiveRevisionRequired = errors.New("customer config active revision required")
)

var runtimeFieldPolicySurfaceKeys = map[string]map[string]struct{}{
	"customers.default": {
		"customer_code": {},
		"display_name":  {},
	},
	"suppliers.default": {
		"supplier_code": {},
		"supplier_type": {},
	},
	"sales_orders.default": {
		"order_no":           {},
		"source_no":          {},
		"expected_ship_date": {},
	},
}

type CustomerConfigRevision struct {
	ID                int
	CustomerKey       string
	Revision          string
	ProductVersion    string
	ConfigHash        string
	ConfigHashVersion int
	Status            string
	CompiledSnapshot  map[string]any
	PublishedBy       *int
	PublishedAt       *time.Time
	ActivatedBy       *int
	ActivatedAt       *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type DeploymentModuleStateInput struct {
	ModuleKey       string
	ContractVersion string
	State           string
	Reason          string
}

type RoleProfileInput struct {
	RoleKey     string
	DisplayName string
	Disabled    bool
	BundleKeys  []string
	Revokes     []string
}

type AccessEntitlementInput struct {
	RoleKey       string
	CapabilityKey string
	ScopeType     string
	ScopeValue    string
	Constraints   map[string]any
	Enabled       bool
}

type WorkPoolInput struct {
	PoolKey     string
	ModuleKey   string
	DisplayName string
	Description string
}

type WorkPoolMembershipInput struct {
	PoolKey  string
	RoleKey  string
	UserID   int
	Strategy string
	Priority int
	Enabled  bool
}

type CustomerConfigPublishInput struct {
	CustomerKey         string
	Revision            string
	ProductVersion      string
	CompiledSnapshot    map[string]any
	ModuleStates        []DeploymentModuleStateInput
	RoleProfiles        []RoleProfileInput
	AccessEntitlements  []AccessEntitlementInput
	WorkPools           []WorkPoolInput
	WorkPoolMemberships []WorkPoolMembershipInput
}

type CustomerConfigValidationResult struct {
	CustomerKey        string
	Revision           string
	ConfigHash         string
	ConfigHashVersion  int
	ModuleStateCount   int
	RoleProfileCount   int
	EntitlementCount   int
	WorkPoolCount      int
	MembershipCount    int
	ForbiddenKeyCount  int
	CompiledSnapshotOK bool
}

type EffectiveSession struct {
	ConfigRevision        string
	ConfigHash            string
	ConfigHashVersion     int
	ConfigProductVersion  string
	ConfigApplyPurpose    string
	ConfigDatasetVersion  string
	ConfigTarget          string
	Customer              EffectiveSessionCustomer
	Modules               map[string]string
	Roles                 []string
	Pages                 []string
	Actions               []string
	WorkPools             []string
	FieldPolicies         map[string]any
	PrintTemplateDefaults map[string]any
	Source                string
}

type EffectiveSessionCustomer struct {
	Key  string
	Name string
}

type CustomerModuleStatusExplanation struct {
	CustomerKey            string
	ModuleKey              string
	ProductIncluded        bool
	ProductName            string
	ProductLayer           string
	ProductMaturity        string
	ConfigRevision         string
	ConfigHash             string
	CustomerState          string
	ContractVersion        string
	Reason                 string
	Dependencies           []string
	MissingDependencies    []string
	DependenciesSatisfied  bool
	ReferencedRoleKeys     []string
	ReferencedWorkPoolKeys []string
	ReferencedPageKeys     []string
	ReferencedProcessKeys  []string
	InFlightProcessCount   int
	OpenTaskCount          int
	OpenBusinessDocCount   int
	RuntimeCountSource     string
	CanEnable              bool
	CanDisable             bool
	EnableBlockedReasons   []string
	DisableBlockedReasons  []string
	Source                 string
}

type CustomerProcessDefinitionExplanation struct {
	CustomerKey               string
	ProcessKey                string
	ProcessVersion            string
	VariantKey                string
	ConfigRevision            string
	ConfigHash                string
	ManifestStatus            string
	RuntimeLoaderEnabled      bool
	BusinessRefType           string
	DomainBoundary            string
	FactBoundary              string
	SourceWorkflowKey         string
	SourceStatus              string
	Nodes                     []CustomerProcessDefinitionNodeExplanation
	RuntimeLoaderBlockers     []string
	RuntimeExecuteBlockers    []string
	StartBlockedReasons       []string
	ExecuteBlockedReasons     []string
	CanStartRuntime           bool
	CanExecuteRuntimeCommands bool
	Source                    string
}

type CustomerProcessDefinitionNodeExplanation struct {
	NodeKey                         string
	NodeType                        string
	OwnerPoolKey                    string
	RequiredCapabilityKey           string
	CommandKey                      string
	RuntimeBindingStatus            string
	ProcessRuntimeHandlerRegistered bool
	RuntimeLoaderBlockers           []string
	RuntimeExecuteBlockers          []string
	WritesFact                      bool
}

type CustomerConfigRepo interface {
	GetCustomerConfigRevision(ctx context.Context, customerKey, revision string) (*CustomerConfigRevision, error)
	GetActiveCustomerConfigRevision(ctx context.Context, customerKey string) (*CustomerConfigRevision, error)
	PublishCustomerConfig(ctx context.Context, in CustomerConfigPublishInput, configHash string, publishedBy int, publishedAt time.Time) (*CustomerConfigRevision, error)
	ActivateCustomerConfig(ctx context.Context, customerKey, revision, expectedConfigHash, expectedProductVersion, expectedActiveRevision string, activatedBy int, activatedAt time.Time) (*CustomerConfigRevision, error)
	RollbackCustomerConfig(ctx context.Context, customerKey, targetRevision, expectedConfigHash, expectedProductVersion, expectedActiveRevision string, actorID int, rolledBackAt time.Time) (*CustomerConfigRevision, error)
	ListDeploymentModuleStates(ctx context.Context, customerKey, revision string) ([]DeploymentModuleStateInput, error)
	ListRoleProfiles(ctx context.Context, customerKey, revision string) ([]RoleProfileInput, error)
	ListAccessEntitlements(ctx context.Context, customerKey, revision string, roleKeys []string) ([]AccessEntitlementInput, error)
	ListWorkPools(ctx context.Context, customerKey, revision string) ([]WorkPoolInput, error)
	ListWorkPoolMemberships(ctx context.Context, customerKey, revision string, roleKeys []string, userID int) ([]WorkPoolMembershipInput, error)
	ListWorkPoolMembershipsByPools(ctx context.Context, customerKey, revision string, poolKeys []string) ([]WorkPoolMembershipInput, error)
	ListWorkflowTaskAuthorizationRevisions(ctx context.Context, customerKey string) ([]WorkflowTaskAuthorizationRevision, error)
	CountInFlightProcessInstances(ctx context.Context, customerKey, revision string, processKeys []string) (int, error)
	CountOpenWorkflowTasksByPools(ctx context.Context, customerKey, revision string, poolKeys []string) (int, error)
	CountOpenBusinessDocumentsByModules(ctx context.Context, customerKey string, moduleKeys []string) (int, error)
}

type CustomerConfigUsecase struct {
	repo CustomerConfigRepo
}

func NewCustomerConfigUsecase(repo CustomerConfigRepo) *CustomerConfigUsecase {
	return &CustomerConfigUsecase{repo: repo}
}

func (uc *CustomerConfigUsecase) ValidateCustomerConfig(_ context.Context, in CustomerConfigPublishInput) (*CustomerConfigValidationResult, error) {
	normalized, err := normalizeCustomerConfigPublishInput(in)
	if err != nil {
		return nil, err
	}
	hash, err := hashNormalizedCustomerConfigPublishInput(normalized)
	if err != nil {
		return nil, err
	}
	return &CustomerConfigValidationResult{
		CustomerKey:        normalized.CustomerKey,
		Revision:           normalized.Revision,
		ConfigHash:         hash,
		ConfigHashVersion:  CustomerConfigHashVersion,
		ModuleStateCount:   len(normalized.ModuleStates),
		RoleProfileCount:   len(normalized.RoleProfiles),
		EntitlementCount:   len(normalized.AccessEntitlements),
		WorkPoolCount:      len(normalized.WorkPools),
		MembershipCount:    len(normalized.WorkPoolMemberships),
		CompiledSnapshotOK: true,
	}, nil
}

func (uc *CustomerConfigUsecase) PublishCustomerConfig(ctx context.Context, in CustomerConfigPublishInput, publishedBy int) (*CustomerConfigRevision, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeCustomerConfigPublishInput(in)
	if err != nil {
		return nil, err
	}
	if publishedBy <= 0 {
		return nil, ErrBadParam
	}
	hash, err := hashNormalizedCustomerConfigPublishInput(normalized)
	if err != nil {
		return nil, err
	}
	return uc.repo.PublishCustomerConfig(ctx, normalized, hash, publishedBy, time.Now())
}

func (uc *CustomerConfigUsecase) ActivateCustomerConfig(ctx context.Context, customerKey, revision, expectedConfigHash, expectedProductVersion, expectedActiveRevision string, activatedBy int) (*CustomerConfigRevision, error) {
	if activatedBy <= 0 {
		return nil, ErrBadParam
	}
	check, err := uc.CheckCustomerConfigTransition(ctx, CustomerConfigTransitionCheckInput{
		Action:                 CustomerConfigTransitionActivate,
		CustomerKey:            customerKey,
		TargetRevision:         revision,
		ExpectedConfigHash:     expectedConfigHash,
		ExpectedProductVersion: expectedProductVersion,
		ExpectedActiveRevision: expectedActiveRevision,
	})
	if err != nil {
		return nil, err
	}
	if !check.Allowed {
		return nil, ErrCustomerConfigTransitionBlocked
	}
	return uc.repo.ActivateCustomerConfig(
		ctx,
		check.CustomerKey,
		check.TargetRevision,
		check.TargetConfigHash,
		check.TargetProductVersion,
		check.ExpectedActiveRevision,
		activatedBy,
		time.Now(),
	)
}

func (uc *CustomerConfigUsecase) RollbackCustomerConfig(ctx context.Context, customerKey, targetRevision, expectedConfigHash, expectedProductVersion, expectedActiveRevision string, actorID int) (*CustomerConfigRevision, error) {
	if actorID <= 0 {
		return nil, ErrBadParam
	}
	check, err := uc.CheckCustomerConfigTransition(ctx, CustomerConfigTransitionCheckInput{
		Action:                 CustomerConfigTransitionRollback,
		CustomerKey:            customerKey,
		TargetRevision:         targetRevision,
		ExpectedConfigHash:     expectedConfigHash,
		ExpectedProductVersion: expectedProductVersion,
		ExpectedActiveRevision: expectedActiveRevision,
	})
	if err != nil {
		return nil, err
	}
	if !check.Allowed {
		return nil, ErrCustomerConfigTransitionBlocked
	}
	return uc.repo.RollbackCustomerConfig(
		ctx,
		check.CustomerKey,
		check.TargetRevision,
		check.TargetConfigHash,
		check.TargetProductVersion,
		check.ExpectedActiveRevision,
		actorID,
		time.Now(),
	)
}

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
	if count, err := uc.repo.CountOpenWorkflowTasksByPools(ctx, customerKey, active.Revision, out.ReferencedWorkPoolKeys); err != nil {
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
	"workflow_tasks":      {Name: "协同任务", Layer: "Workflow", Maturity: "runtime_v1", PageKeys: []string{"task-board", "shipping-release", "exception-flow"}},
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

func activeModulePageReferences(moduleKey string, snapshot map[string]any, candidatePageKeys []string) []string {
	activePages := allowedRuntimePagesFromSnapshot(snapshot)
	if len(activePages) == 0 || len(candidatePageKeys) == 0 {
		return []string{}
	}
	active := map[string]struct{}{}
	for _, key := range activePages {
		active[key] = struct{}{}
	}
	out := []string{}
	for _, key := range normalizeStringList(candidatePageKeys) {
		if _, ok := active[key]; ok {
			out = append(out, key)
		}
	}
	return normalizeStringList(out)
}

func activeModuleProcessReferences(moduleKey string, snapshot map[string]any) []string {
	moduleKey = normalizeModuleKey(moduleKey)
	if moduleKey == "" || len(snapshot) == 0 {
		return []string{}
	}
	out := []string{}
	for _, key := range []string{"workflows", "businessFlows", "stateMachines", "processPolicies"} {
		for _, item := range anyListFromMap(snapshot, key) {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if processReferencesModule(m, moduleKey) {
				out = append(out, getStringFromAnyMap(m, "key"))
			}
		}
	}
	return normalizeStringList(out)
}

func ensureCustomerConfigProcessModulesEnabledForStart(
	processKey string,
	businessRefType string,
	definition map[string]any,
	snapshot map[string]any,
	modules []DeploymentModuleStateInput,
) error {
	requiredModuleKeys := processDefinitionReferencedModuleKeys(processKey, businessRefType, definition, snapshot)
	if len(requiredModuleKeys) == 0 {
		return ErrBadParam
	}
	return ensureCustomerConfigModuleKeysEnabled(requiredModuleKeys, modules)
}

func ensureCustomerConfigModuleKeysEnabled(moduleKeys []string, modules []DeploymentModuleStateInput) error {
	return ensureCustomerConfigModuleKeysInStates(moduleKeys, modules, []string{"enabled"})
}

func ensureCustomerConfigModuleKeysInStates(moduleKeys []string, modules []DeploymentModuleStateInput, allowedStates []string) error {
	moduleStates := map[string]string{}
	for _, item := range modules {
		key := normalizeModuleKey(item.ModuleKey)
		if key == "" {
			continue
		}
		state := strings.TrimSpace(item.State)
		if state == "" {
			state = "enabled"
		}
		moduleStates[key] = state
	}
	for _, moduleKey := range customerConfigModuleDependencyClosure(moduleKeys) {
		if !stringSliceContains(allowedStates, moduleStates[moduleKey]) {
			return ErrBadParam
		}
	}
	return nil
}

func stringSliceContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func processDomainCommandReferencedModuleKeys(commandKey string) []string {
	switch strings.TrimSpace(commandKey) {
	case ProcessDomainCommandSalesOrderSubmit:
		return []string{"sales_orders", "workflow_tasks"}
	case ProcessDomainCommandPurchaseReceiptCreate:
		return []string{"purchase_orders", "purchase_receipts", "quality_inspections", "inventory"}
	case ProcessDomainCommandIncomingQualityGate:
		return []string{"purchase_receipts", "quality_inspections"}
	case ProcessDomainCommandInventoryPostInbound:
		return []string{"purchase_receipts", "inventory"}
	case ProcessDomainCommandFinishedGoodsQualityDecide:
		return []string{"quality_inspections", "shipments"}
	case ProcessDomainCommandShipmentFinanceRelease:
		return []string{"shipments", "finance"}
	case ProcessDomainCommandShipmentShip:
		return []string{"shipments", "inventory"}
	case ProcessDomainCommandFinanceReceivableLead:
		return []string{"shipments", "finance"}
	default:
		return []string{}
	}
}

func processDefinitionReferencedModuleKeys(processKey string, businessRefType string, definition map[string]any, snapshot map[string]any) []string {
	out := []string{}
	addModulesFromMap := func(m map[string]any) {
		if len(m) == 0 {
			return
		}
		for _, key := range []string{"modules", "sourceModules", "targetModules"} {
			out = append(out, stringSliceFromAnyValue(m[key])...)
		}
		for _, key := range []string{"module_key", "moduleKey"} {
			if value := getStringFromAnyMap(m, key); value != "" {
				out = append(out, value)
			}
		}
	}
	addModulesFromMap(definition)
	sourceWorkflowKey := getStringFromAnyMap(definition, "source_workflow_key")
	if sourceWorkflowKey != "" && len(snapshot) > 0 {
		for _, item := range anyListFromMap(snapshot, "workflows") {
			m, ok := item.(map[string]any)
			if !ok || getStringFromAnyMap(m, "key") != sourceWorkflowKey {
				continue
			}
			addModulesFromMap(m)
		}
	}
	for _, raw := range anyListFromMap(definition, "nodes") {
		nodeDefinition, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		addModulesFromMap(nodeDefinition)
		if policy, err := mapFromAnyValue(nodeDefinition["policy_snapshot"]); err == nil {
			addModulesFromMap(policy)
		}
		if contract, err := mapFromAnyValue(nodeDefinition["fact_command_contract"]); err == nil {
			addModulesFromMap(contract)
		}
	}
	out = append(out, defaultProcessReferencedModuleKeys(processKey, businessRefType)...)
	return normalizeStringList(out)
}

func defaultProcessReferencedModuleKeys(processKey string, businessRefType string) []string {
	switch processKey {
	case ProcessKeySalesOrderAcceptance:
		return []string{"sales_orders", "workflow_tasks"}
	case ProcessKeyMaterialSupply:
		if strings.TrimSpace(businessRefType) == "purchase_order" {
			return []string{"purchase_orders", "purchase_receipts", "quality_inspections", "inventory"}
		}
		return []string{"purchase_receipts", "quality_inspections", "inventory"}
	case ProcessKeyFinishedGoodsDelivery:
		return []string{"quality_inspections", "shipments", "finance"}
	default:
		return []string{}
	}
}

func customerConfigRuntimeProcessKeysForModule(moduleKey string) []string {
	moduleKey = normalizeModuleKey(moduleKey)
	if moduleKey == "" {
		return []string{}
	}
	processKeys := []string{
		ProcessKeySalesOrderAcceptance,
		ProcessKeyMaterialSupply,
		ProcessKeyFinishedGoodsDelivery,
	}
	out := []string{}
	for _, processKey := range processKeys {
		businessRefTypes := []string{""}
		if processKey == ProcessKeyMaterialSupply {
			businessRefTypes = []string{"purchase_order", "purchase_receipt"}
		}
		for _, businessRefType := range businessRefTypes {
			for _, referencedModuleKey := range defaultProcessReferencedModuleKeys(processKey, businessRefType) {
				if referencedModuleKey == moduleKey {
					out = append(out, processKey)
					break
				}
			}
		}
	}
	return normalizeStringList(out)
}

func customerConfigProcessDefinition(snapshot map[string]any, processKey string) (map[string]any, error) {
	if len(snapshot) == 0 || strings.TrimSpace(processKey) == "" {
		return nil, ErrBadParam
	}
	rawDefinitions, ok := snapshot["processDefinitions"]
	if !ok {
		return nil, ErrBadParam
	}
	definitions, ok := rawDefinitions.(map[string]any)
	if !ok {
		return nil, ErrBadParam
	}
	rawDefinition, ok := definitions[processKey]
	if !ok {
		return nil, ErrBadParam
	}
	definition, ok := rawDefinition.(map[string]any)
	if !ok || len(definition) == 0 {
		return nil, ErrBadParam
	}
	return definition, nil
}

func processNodesFromCustomerConfigDefinition(processKey string, definition map[string]any) ([]ProcessNodeInstanceCreate, error) {
	rawNodes := anyListFromMap(definition, "nodes")
	if len(rawNodes) == 0 {
		return nil, ErrBadParam
	}
	businessRefType := getStringFromAnyMap(definition, "business_ref_type")
	nodes := make([]ProcessNodeInstanceCreate, 0, len(rawNodes))
	for _, raw := range rawNodes {
		nodeDefinition, ok := raw.(map[string]any)
		if !ok {
			return nil, ErrBadParam
		}
		nodeKey := getStringFromAnyMap(nodeDefinition, "node_key")
		nodeType := getStringFromAnyMap(nodeDefinition, "node_type")
		if nodeKey == "" || nodeType == "" {
			return nil, ErrBadParam
		}
		policySnapshot, err := mapFromAnyValue(nodeDefinition["policy_snapshot"])
		if err != nil {
			return nil, err
		}
		if err := validateCustomerConfigProcessNode(processKey, businessRefType, nodeKey, nodeType, policySnapshot); err != nil {
			return nil, err
		}
		nodes = append(nodes, ProcessNodeInstanceCreate{
			NodeKey:               nodeKey,
			NodeType:              nodeType,
			OwnerPoolKey:          optionalStringPointer(getStringFromAnyMap(nodeDefinition, "owner_pool_key")),
			RequiredCapabilityKey: optionalStringPointer(getStringFromAnyMap(nodeDefinition, "required_capability_key")),
			FormProfileKey:        optionalStringPointer(getStringFromAnyMap(nodeDefinition, "form_profile_key")),
			ActionSetKey:          optionalStringPointer(getStringFromAnyMap(nodeDefinition, "action_set_key")),
			PolicySnapshot:        policySnapshot,
		})
	}
	if processKey == ProcessKeyMaterialSupply && businessRefType == "purchase_order" {
		if len(nodes) == 0 || nodes[0].NodeKey != "purchase_receipt_source" {
			return nil, ErrBadParam
		}
	}
	return nodes, nil
}

func validateCustomerConfigProcessNode(processKey, businessRefType, nodeKey, nodeType string, policySnapshot map[string]any) error {
	switch nodeType {
	case ProcessNodeTypeDomainCommand:
		if !customerConfigDomainCommandNodeAllowed(processKey, businessRefType, nodeKey, getStringFromAnyMap(policySnapshot, "command_key")) {
			return ErrBadParam
		}
		if writesFact, err := boolFromProcessDefinition(policySnapshot, "writes_fact"); err != nil || writesFact {
			return ErrBadParam
		}
	case ProcessNodeTypeApproval, ProcessNodeTypeHumanTask, ProcessNodeTypeEnd:
		return nil
	default:
		return ErrBadParam
	}
	return nil
}

func customerConfigProcessBusinessRefAllowed(processKey, businessRefType string) bool {
	switch processKey {
	case ProcessKeySalesOrderAcceptance:
		return businessRefType == "sales_order"
	case ProcessKeyMaterialSupply:
		return businessRefType == "purchase_receipt" || businessRefType == "purchase_order"
	case ProcessKeyFinishedGoodsDelivery:
		return businessRefType == "shipment"
	default:
		return false
	}
}

func customerConfigDomainCommandNodeAllowed(processKey, businessRefType, nodeKey, commandKey string) bool {
	switch processKey {
	case ProcessKeySalesOrderAcceptance:
		return nodeKey == "submit_sales_order" && commandKey == ProcessDomainCommandSalesOrderSubmit
	case ProcessKeyMaterialSupply:
		switch nodeKey {
		case "purchase_receipt_source":
			return businessRefType == "purchase_order" && commandKey == ProcessDomainCommandPurchaseReceiptCreate
		case "incoming_qc":
			return (businessRefType == "purchase_order" || businessRefType == "purchase_receipt") && commandKey == ProcessDomainCommandIncomingQualityGate
		case "warehouse_inbound":
			return (businessRefType == "purchase_order" || businessRefType == "purchase_receipt") && commandKey == ProcessDomainCommandInventoryPostInbound
		default:
			return false
		}
	case ProcessKeyFinishedGoodsDelivery:
		if businessRefType != "shipment" {
			return false
		}
		switch nodeKey {
		case "finished_goods_quality":
			return commandKey == ProcessDomainCommandFinishedGoodsQualityDecide
		case "shipment_finance_release":
			return commandKey == ProcessDomainCommandShipmentFinanceRelease
		case "shipment_execution":
			return commandKey == ProcessDomainCommandShipmentShip
		case "receivable_lead":
			return commandKey == ProcessDomainCommandFinanceReceivableLead
		default:
			return false
		}
	default:
		return false
	}
}

func processDefinitionNodeExplanations(definition map[string]any) ([]CustomerProcessDefinitionNodeExplanation, []string, []string) {
	rawNodes := anyListFromMap(definition, "nodes")
	nodes := make([]CustomerProcessDefinitionNodeExplanation, 0, len(rawNodes))
	loaderBlockers := []string{}
	executeBlockers := []string{}
	for _, raw := range rawNodes {
		nodeDefinition, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		policySnapshot, _ := mapFromAnyValue(nodeDefinition["policy_snapshot"])
		commandKey := getStringFromAnyMap(policySnapshot, "command_key")
		writesFact := boolValueFromAny(policySnapshot["writes_fact"])
		contract, _ := mapFromAnyValue(nodeDefinition["fact_command_contract"])
		contractLoaderBlockers := stringSliceFromAnyValue(contract["runtime_loader_blockers"])
		contractExecuteBlockers := stringSliceFromAnyValue(contract["runtime_execute_blockers"])
		loaderBlockers = append(loaderBlockers, contractLoaderBlockers...)
		executeBlockers = append(executeBlockers, contractExecuteBlockers...)
		if contractCommandKey := getStringFromAnyMap(contract, "command_key"); contractCommandKey != "" {
			commandKey = contractCommandKey
		}
		if value, ok := contract["writes_fact"]; ok {
			writesFact = boolValueFromAny(value)
		}
		node := CustomerProcessDefinitionNodeExplanation{
			NodeKey:                         getStringFromAnyMap(nodeDefinition, "node_key"),
			NodeType:                        getStringFromAnyMap(nodeDefinition, "node_type"),
			OwnerPoolKey:                    getStringFromAnyMap(nodeDefinition, "owner_pool_key"),
			RequiredCapabilityKey:           getStringFromAnyMap(nodeDefinition, "required_capability_key"),
			CommandKey:                      commandKey,
			RuntimeBindingStatus:            getStringFromAnyMap(contract, "runtime_binding_status"),
			ProcessRuntimeHandlerRegistered: boolValueFromAny(contract["process_runtime_handler_registered"]),
			RuntimeLoaderBlockers:           sortedUniqueStrings(contractLoaderBlockers),
			RuntimeExecuteBlockers:          sortedUniqueStrings(contractExecuteBlockers),
			WritesFact:                      writesFact,
		}
		nodes = append(nodes, node)
	}
	return nodes, loaderBlockers, executeBlockers
}

func processDefinitionStartBlockedReasons(explanation *CustomerProcessDefinitionExplanation) []string {
	if explanation == nil {
		return []string{}
	}
	reasons := []string{}
	if !explanation.RuntimeLoaderEnabled {
		reasons = append(reasons, "runtime_loader_disabled")
	}
	if !customerConfigProcessManifestCanStart(explanation.ManifestStatus) {
		reasons = append(reasons, "manifest_status_not_runtime_loader_ready")
	}
	if !customerConfigRuntimeBuilderRegistered(explanation.ProcessKey) {
		reasons = append(reasons, "runtime_builder_not_registered")
	}
	reasons = append(reasons, explanation.RuntimeLoaderBlockers...)
	return sortedUniqueStrings(reasons)
}

func processDefinitionExecuteBlockedReasons(explanation *CustomerProcessDefinitionExplanation) []string {
	if explanation == nil {
		return []string{}
	}
	reasons := []string{}
	reasons = append(reasons, explanation.RuntimeExecuteBlockers...)
	for _, node := range explanation.Nodes {
		if node.NodeType == ProcessNodeTypeDomainCommand && !node.ProcessRuntimeHandlerRegistered {
			reasons = append(reasons, "domain_command_handler_not_registered")
		}
		if node.WritesFact {
			reasons = append(reasons, "fact_posting_contract_not_allowed")
		}
	}
	return sortedUniqueStrings(reasons)
}

func customerConfigProcessManifestCanStart(status string) bool {
	switch strings.TrimSpace(status) {
	case "runtime_loader_ready", "runtime_loader_start_ready":
		return true
	default:
		return false
	}
}

func customerConfigRuntimeBuilderRegistered(processKey string) bool {
	switch processKey {
	case ProcessKeySalesOrderAcceptance, ProcessKeyMaterialSupply, ProcessKeyFinishedGoodsDelivery:
		return true
	default:
		return false
	}
}

func boolValueFromAny(value any) bool {
	typed, ok := value.(bool)
	return ok && typed
}

func sortedUniqueStrings(values []string) []string {
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

func mapFromAnyValue(value any) (map[string]any, error) {
	if value == nil {
		return map[string]any{}, nil
	}
	out, ok := value.(map[string]any)
	if !ok {
		return nil, ErrBadParam
	}
	return cloneProcessPolicySnapshot(out), nil
}

func boolFromProcessDefinition(definition map[string]any, key string) (bool, error) {
	value, ok := definition[key]
	if !ok {
		return false, ErrBadParam
	}
	typed, ok := value.(bool)
	if !ok {
		return false, ErrBadParam
	}
	return typed, nil
}

func optionalStringPointer(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func processReferencesModule(m map[string]any, moduleKey string) bool {
	for _, key := range []string{"modules", "sourceModules", "targetModules"} {
		for _, item := range stringSliceFromAnyValue(m[key]) {
			if normalizeModuleKey(item) == moduleKey {
				return true
			}
		}
	}
	return false
}

func anyListFromMap(m map[string]any, key string) []any {
	if len(m) == 0 {
		return []any{}
	}
	return anyListValue(m[key])
}

func anyListValue(value any) []any {
	if value == nil {
		return []any{}
	}
	if items, ok := value.([]any); ok {
		return items
	}
	if items, ok := value.([]map[string]any); ok {
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out
	}
	return []any{}
}

func stringSliceFromAnyValue(value any) []string {
	switch typed := value.(type) {
	case []string:
		return normalizeStringList(typed)
	case []any:
		out := []string{}
		for _, item := range typed {
			if text, ok := item.(string); ok {
				out = append(out, text)
			}
		}
		return normalizeStringList(out)
	default:
		return []string{}
	}
}

func getStringFromAnyMap(m map[string]any, key string) string {
	if len(m) == 0 {
		return ""
	}
	if text, ok := m[key].(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}

func stringSliceFromSnapshot(snapshot map[string]any, key string) []string {
	if len(snapshot) == 0 {
		return nil
	}
	raw, ok := snapshot[key]
	if !ok {
		return nil
	}
	switch typed := raw.(type) {
	case []string:
		return normalizeStringList(typed)
	case []any:
		out := make([]string, 0, len(typed))
		for _, value := range typed {
			if text, ok := value.(string); ok {
				out = append(out, text)
			}
		}
		return normalizeStringList(out)
	default:
		return nil
	}
}

func adminMenuKeys(admin *AdminUser) []string {
	menus := AdminVisibleMenus(admin)
	out := make([]string, 0, len(menus))
	for _, menu := range menus {
		out = append(out, menu.Key)
	}
	return out
}

func effectiveActionKeys(admin *AdminUser) []string {
	if admin == nil {
		return []string{}
	}
	if admin.IsSuperAdmin {
		return AllPermissionKeys()
	}
	return NormalizePermissionKeys(admin.Permissions)
}
