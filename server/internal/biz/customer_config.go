package biz

import (
	"context"
	"errors"
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
	CountOpenWorkflowTasksByResponsibilities(ctx context.Context, customerKey, revision string, poolKeys, fallbackOwnerRoleKeys []string) (int, error)
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
