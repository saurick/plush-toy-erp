package biz

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"
)

type memCustomerConfigRepo struct {
	activeErr             error
	revisions             map[string]*CustomerConfigRevision
	modules               map[string][]DeploymentModuleStateInput
	roles                 map[string][]RoleProfileInput
	entitlements          map[string][]AccessEntitlementInput
	pools                 map[string][]WorkPoolInput
	memberships           map[string][]WorkPoolMembershipInput
	processCount          map[string]int
	taskCount             map[string]int
	taskFallbackRoleCount map[string]int
	businessCount         map[string]int
}

func newMemCustomerConfigRepo() *memCustomerConfigRepo {
	return &memCustomerConfigRepo{
		revisions:             map[string]*CustomerConfigRevision{},
		modules:               map[string][]DeploymentModuleStateInput{},
		roles:                 map[string][]RoleProfileInput{},
		entitlements:          map[string][]AccessEntitlementInput{},
		pools:                 map[string][]WorkPoolInput{},
		memberships:           map[string][]WorkPoolMembershipInput{},
		processCount:          map[string]int{},
		taskCount:             map[string]int{},
		taskFallbackRoleCount: map[string]int{},
		businessCount:         map[string]int{},
	}
}

func customerRevisionKey(customerKey, revision string) string {
	return customerKey + "/" + revision
}

func (r *memCustomerConfigRepo) GetCustomerConfigRevision(_ context.Context, customerKey, revision string) (*CustomerConfigRevision, error) {
	item := r.revisions[customerRevisionKey(customerKey, revision)]
	if item == nil {
		return nil, ErrCustomerConfigNotFound
	}
	cloned := *item
	return &cloned, nil
}

func (r *memCustomerConfigRepo) GetActiveCustomerConfigRevision(_ context.Context, customerKey string) (*CustomerConfigRevision, error) {
	if r.activeErr != nil {
		return nil, r.activeErr
	}
	for _, item := range r.revisions {
		if item.CustomerKey == customerKey && item.Status == CustomerConfigStatusActive {
			cloned := *item
			return &cloned, nil
		}
	}
	return nil, ErrCustomerConfigNotFound
}

func (r *memCustomerConfigRepo) PublishCustomerConfig(_ context.Context, in CustomerConfigPublishInput, configHash string, publishedBy int, publishedAt time.Time) (*CustomerConfigRevision, error) {
	key := customerRevisionKey(in.CustomerKey, in.Revision)
	if existing := r.revisions[key]; existing != nil {
		if existing.ConfigHash != configHash || existing.ConfigHashVersion != CustomerConfigHashVersion || existing.ProductVersion != in.ProductVersion {
			return nil, ErrCustomerConfigRevisionImmutable
		}
		cloned := *existing
		return &cloned, nil
	}
	item := &CustomerConfigRevision{
		ID:                len(r.revisions) + 1,
		CustomerKey:       in.CustomerKey,
		Revision:          in.Revision,
		ProductVersion:    in.ProductVersion,
		ConfigHash:        configHash,
		ConfigHashVersion: CustomerConfigHashVersion,
		Status:            CustomerConfigStatusPublished,
		CompiledSnapshot:  in.CompiledSnapshot,
		PublishedBy:       &publishedBy,
		PublishedAt:       &publishedAt,
		CreatedAt:         publishedAt,
		UpdatedAt:         publishedAt,
	}
	r.revisions[key] = item
	r.modules[key] = append([]DeploymentModuleStateInput(nil), in.ModuleStates...)
	r.roles[key] = append([]RoleProfileInput(nil), in.RoleProfiles...)
	r.entitlements[key] = append([]AccessEntitlementInput(nil), in.AccessEntitlements...)
	r.pools[key] = append([]WorkPoolInput(nil), in.WorkPools...)
	r.memberships[key] = append([]WorkPoolMembershipInput(nil), in.WorkPoolMemberships...)
	cloned := *item
	return &cloned, nil
}

func (r *memCustomerConfigRepo) ActivateCustomerConfig(_ context.Context, customerKey, revision, expectedConfigHash, expectedProductVersion, expectedActiveRevision string, activatedBy int, activatedAt time.Time) (*CustomerConfigRevision, error) {
	return r.switchActiveCustomerConfigRevision(CustomerConfigTransitionActivate, customerKey, revision, expectedConfigHash, expectedProductVersion, expectedActiveRevision, activatedBy, activatedAt)
}

func (r *memCustomerConfigRepo) RollbackCustomerConfig(_ context.Context, customerKey, targetRevision, expectedConfigHash, expectedProductVersion, expectedActiveRevision string, actorID int, rolledBackAt time.Time) (*CustomerConfigRevision, error) {
	return r.switchActiveCustomerConfigRevision(CustomerConfigTransitionRollback, customerKey, targetRevision, expectedConfigHash, expectedProductVersion, expectedActiveRevision, actorID, rolledBackAt)
}

func (r *memCustomerConfigRepo) switchActiveCustomerConfigRevision(action, customerKey, revision, expectedConfigHash, expectedProductVersion, expectedActiveRevision string, actorID int, activatedAt time.Time) (*CustomerConfigRevision, error) {
	target := r.revisions[customerRevisionKey(customerKey, revision)]
	if target == nil {
		return nil, ErrCustomerConfigNotFound
	}
	activeRevision := ""
	for _, item := range r.revisions {
		if item.CustomerKey == customerKey && item.Status == CustomerConfigStatusActive {
			activeRevision = item.Revision
			break
		}
	}
	if activeRevision != expectedActiveRevision {
		return nil, ErrCustomerConfigActiveRevisionChanged
	}
	if target.ConfigHash != expectedConfigHash {
		return nil, ErrCustomerConfigHashMismatch
	}
	if target.ProductVersion != expectedProductVersion {
		return nil, ErrCustomerConfigProductVersionMismatch
	}
	if err := ValidateCustomerConfigModuleClosure(r.modules[customerRevisionKey(customerKey, revision)]); err != nil {
		return nil, err
	}
	if action == CustomerConfigTransitionActivate && target.Status == CustomerConfigStatusActive && target.ActivatedAt != nil {
		cloned := *target
		return &cloned, nil
	}
	if action == CustomerConfigTransitionRollback && (target.Status != CustomerConfigStatusSuperseded || target.ActivatedAt == nil) {
		return nil, ErrCustomerConfigTransitionBlocked
	}
	if action == CustomerConfigTransitionActivate && target.Status != CustomerConfigStatusPublished {
		return nil, ErrBadParam
	}
	for _, item := range r.revisions {
		if item.CustomerKey == customerKey && item.Status == CustomerConfigStatusActive && item.Revision != revision {
			item.Status = CustomerConfigStatusSuperseded
		}
	}
	target.Status = CustomerConfigStatusActive
	target.ActivatedBy = &actorID
	target.ActivatedAt = &activatedAt
	cloned := *target
	return &cloned, nil
}

func activateCustomerConfigForTest(ctx context.Context, uc *CustomerConfigUsecase, repo *memCustomerConfigRepo, customerKey, revision string, actorID int) (*CustomerConfigRevision, error) {
	item, err := repo.GetCustomerConfigRevision(ctx, customerKey, revision)
	if err != nil {
		return nil, err
	}
	expectedActiveRevision := ""
	if active, activeErr := repo.GetActiveCustomerConfigRevision(ctx, customerKey); activeErr == nil {
		expectedActiveRevision = active.Revision
	} else if !errors.Is(activeErr, ErrCustomerConfigNotFound) {
		return nil, activeErr
	}
	return uc.ActivateCustomerConfig(ctx, customerKey, revision, item.ConfigHash, item.ProductVersion, expectedActiveRevision, actorID)
}

func rollbackCustomerConfigForTest(ctx context.Context, uc *CustomerConfigUsecase, repo *memCustomerConfigRepo, customerKey, revision string, actorID int) (*CustomerConfigRevision, error) {
	item, err := repo.GetCustomerConfigRevision(ctx, customerKey, revision)
	if err != nil {
		return nil, err
	}
	active, err := repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		return nil, err
	}
	return uc.RollbackCustomerConfig(ctx, customerKey, revision, item.ConfigHash, item.ProductVersion, active.Revision, actorID)
}

func (r *memCustomerConfigRepo) ListDeploymentModuleStates(_ context.Context, customerKey, revision string) ([]DeploymentModuleStateInput, error) {
	return append([]DeploymentModuleStateInput(nil), r.modules[customerRevisionKey(customerKey, revision)]...), nil
}

func (r *memCustomerConfigRepo) ListRoleProfiles(_ context.Context, customerKey, revision string) ([]RoleProfileInput, error) {
	return append([]RoleProfileInput(nil), r.roles[customerRevisionKey(customerKey, revision)]...), nil
}

func (r *memCustomerConfigRepo) ListAccessEntitlements(_ context.Context, customerKey, revision string, roleKeys []string) ([]AccessEntitlementInput, error) {
	allowed := map[string]struct{}{}
	for _, key := range NormalizeAdminRoleKeys(roleKeys) {
		allowed[key] = struct{}{}
	}
	out := []AccessEntitlementInput{}
	for _, item := range r.entitlements[customerRevisionKey(customerKey, revision)] {
		if _, ok := allowed[item.RoleKey]; ok {
			out = append(out, item)
		}
	}
	return out, nil
}

func (r *memCustomerConfigRepo) ListWorkPools(_ context.Context, customerKey, revision string) ([]WorkPoolInput, error) {
	return append([]WorkPoolInput(nil), r.pools[customerRevisionKey(customerKey, revision)]...), nil
}

func (r *memCustomerConfigRepo) ListWorkPoolMemberships(_ context.Context, customerKey, revision string, roleKeys []string, userID int) ([]WorkPoolMembershipInput, error) {
	allowed := map[string]struct{}{}
	for _, key := range NormalizeAdminRoleKeys(roleKeys) {
		allowed[key] = struct{}{}
	}
	out := []WorkPoolMembershipInput{}
	for _, item := range r.memberships[customerRevisionKey(customerKey, revision)] {
		_, roleOK := allowed[item.RoleKey]
		if roleOK || (item.UserID > 0 && item.UserID == userID) {
			out = append(out, item)
		}
	}
	return out, nil
}

func (r *memCustomerConfigRepo) ListWorkPoolMembershipsByPools(_ context.Context, customerKey, revision string, poolKeys []string) ([]WorkPoolMembershipInput, error) {
	allowed := map[string]struct{}{}
	for _, key := range normalizeStringList(poolKeys) {
		allowed[key] = struct{}{}
	}
	out := []WorkPoolMembershipInput{}
	for _, item := range r.memberships[customerRevisionKey(customerKey, revision)] {
		if _, ok := allowed[item.PoolKey]; ok {
			out = append(out, item)
		}
	}
	return out, nil
}

func (r *memCustomerConfigRepo) ListWorkflowTaskAuthorizationRevisions(_ context.Context, customerKey string) ([]WorkflowTaskAuthorizationRevision, error) {
	out := []WorkflowTaskAuthorizationRevision{}
	for _, revision := range r.revisions {
		if revision.CustomerKey != customerKey || !customerConfigRevisionCanAuthorizeRuntimeTask(revision.Status) {
			continue
		}
		key := customerRevisionKey(customerKey, revision.Revision)
		out = append(out, WorkflowTaskAuthorizationRevision{
			CustomerKey:         customerKey,
			Revision:            revision.Revision,
			Status:              revision.Status,
			RoleProfiles:        append([]RoleProfileInput(nil), r.roles[key]...),
			AccessEntitlements:  append([]AccessEntitlementInput(nil), r.entitlements[key]...),
			WorkPoolMemberships: append([]WorkPoolMembershipInput(nil), r.memberships[key]...),
		})
	}
	return out, nil
}

func (r *memCustomerConfigRepo) CountInFlightProcessInstances(_ context.Context, customerKey, revision string, processKeys []string) (int, error) {
	count := 0
	for _, processKey := range normalizeStringList(processKeys) {
		count += r.processCount[customerRevisionKey(customerKey, revision)+"/"+processKey]
	}
	return count, nil
}

func (r *memCustomerConfigRepo) CountOpenWorkflowTasksByResponsibilities(
	_ context.Context,
	customerKey, revision string,
	poolKeys, fallbackOwnerRoleKeys []string,
) (int, error) {
	count := 0
	for _, poolKey := range normalizeStringList(poolKeys) {
		count += r.taskCount[customerRevisionKey(customerKey, revision)+"/"+poolKey]
	}
	for _, roleKey := range NormalizeAdminRoleKeys(fallbackOwnerRoleKeys) {
		count += r.taskFallbackRoleCount[customerRevisionKey(customerKey, revision)+"/"+roleKey]
	}
	return count, nil
}

func (r *memCustomerConfigRepo) CountOpenBusinessDocumentsByModules(_ context.Context, customerKey string, moduleKeys []string) (int, error) {
	count := 0
	for _, moduleKey := range normalizeStringList(moduleKeys) {
		count += r.businessCount[customerKey+"/"+moduleKey]
	}
	return count, nil
}

func validCustomerConfigInput() CustomerConfigPublishInput {
	return CustomerConfigPublishInput{
		CustomerKey:    "yoyoosun",
		Revision:       "2026.06.28.1",
		ProductVersion: "local-test",
		CompiledSnapshot: map[string]any{
			"customer": map[string]any{"key": "yoyoosun", "name": "永绅"},
			"pages":    []any{"sales-orders", "permission-center"},
			"workflows": []any{
				map[string]any{
					"key":           "sales_order_approval",
					"sourceModules": []any{"sales_orders"},
				},
			},
			"businessFlows": []any{
				map[string]any{
					"key":     "sales_to_production",
					"modules": []any{"sales_orders", "workflow_tasks"},
				},
			},
			"fieldPolicies": map[string]any{
				"sales_orders.default": map[string]any{
					"source_no": map[string]any{"visible": false},
				},
			},
			"printTemplateDefaults": map[string]any{
				"runtime_enabled":                    true,
				"formal_runtime_consumed":            true,
				"sales_order_print_template_enabled": false,
				"templates": []any{
					map[string]any{
						"template_key":              "material-purchase-contract",
						"runtime_consumed":          true,
						"supplier_defaults_allowed": false,
						"party_defaults": map[string]any{
							"buyerCompany": "永绅",
						},
					},
					map[string]any{
						"template_key":              "processing-contract",
						"runtime_consumed":          true,
						"supplier_defaults_allowed": false,
						"party_defaults": map[string]any{
							"buyerCompany": "永绅",
						},
					},
				},
			},
		},
		ModuleStates: []DeploymentModuleStateInput{
			{ModuleKey: "customers", State: "enabled"},
			{ModuleKey: "suppliers", State: "enabled"},
			{ModuleKey: "products", State: "enabled"},
			{ModuleKey: "materials", State: "enabled"},
			{ModuleKey: "material_bom", State: "enabled"},
			{ModuleKey: "sales_orders", State: "enabled"},
			{ModuleKey: "workflow_tasks", State: "enabled"},
			{ModuleKey: "purchase_orders", State: "enabled"},
			{ModuleKey: "purchase_receipts", State: "enabled"},
			{ModuleKey: "quality_inspections", State: "enabled"},
			{ModuleKey: "inventory", State: "enabled"},
			{ModuleKey: "shipments", State: "enabled"},
			{ModuleKey: "finance", State: "enabled"},
			{ModuleKey: "production_orders", State: "enabled"},
			{ModuleKey: "production", State: "read_only"},
		},
		RoleProfiles: []RoleProfileInput{
			{RoleKey: SalesRoleKey, DisplayName: "业务"},
			{RoleKey: FinanceRoleKey, DisplayName: "财务"},
		},
		AccessEntitlements: []AccessEntitlementInput{
			{RoleKey: SalesRoleKey, CapabilityKey: PermissionSalesOrderRead, Enabled: true},
			{RoleKey: FinanceRoleKey, CapabilityKey: PermissionFinancePayableRead, Enabled: true},
		},
		WorkPools: []WorkPoolInput{
			{PoolKey: "sales", ModuleKey: "sales_orders", DisplayName: "业务池"},
			{PoolKey: "finance", ModuleKey: "finance", DisplayName: "财务池"},
		},
		WorkPoolMemberships: []WorkPoolMembershipInput{
			{PoolKey: "sales", RoleKey: SalesRoleKey, Enabled: true},
			{PoolKey: "finance", RoleKey: FinanceRoleKey, Enabled: true},
		},
	}
}

func TestHashCustomerConfigPublishInputCoversFullImmutablePayload(t *testing.T) {
	base := validCustomerConfigInput()
	want, err := HashCustomerConfigPublishInput(base)
	if err != nil {
		t.Fatalf("HashCustomerConfigPublishInput base error = %v", err)
	}

	reordered := validCustomerConfigInput()
	slices.Reverse(reordered.ModuleStates)
	slices.Reverse(reordered.RoleProfiles)
	slices.Reverse(reordered.AccessEntitlements)
	slices.Reverse(reordered.WorkPools)
	slices.Reverse(reordered.WorkPoolMemberships)
	got, err := HashCustomerConfigPublishInput(reordered)
	if err != nil {
		t.Fatalf("HashCustomerConfigPublishInput reordered error = %v", err)
	}
	if got != want {
		t.Fatalf("equivalent list order changed hash: got %s want %s", got, want)
	}

	mutations := []struct {
		name   string
		mutate func(*CustomerConfigPublishInput)
	}{
		{name: "product version", mutate: func(in *CustomerConfigPublishInput) { in.ProductVersion = "next-product" }},
		{name: "compiled snapshot", mutate: func(in *CustomerConfigPublishInput) {
			in.CompiledSnapshot["customer"] = map[string]any{"key": "yoyoosun", "name": "changed"}
		}},
		{name: "module state", mutate: func(in *CustomerConfigPublishInput) { in.ModuleStates[0].Reason = "changed" }},
		{name: "role profile", mutate: func(in *CustomerConfigPublishInput) { in.RoleProfiles[0].DisplayName = "changed" }},
		{name: "access entitlement", mutate: func(in *CustomerConfigPublishInput) { in.AccessEntitlements[0].Enabled = false }},
		{name: "work pool", mutate: func(in *CustomerConfigPublishInput) { in.WorkPools[0].Description = "changed" }},
		{name: "work pool membership", mutate: func(in *CustomerConfigPublishInput) { in.WorkPoolMemberships[0].Priority = 10 }},
	}
	for _, mutation := range mutations {
		t.Run(mutation.name, func(t *testing.T) {
			changed := validCustomerConfigInput()
			mutation.mutate(&changed)
			got, err := HashCustomerConfigPublishInput(changed)
			if err != nil {
				t.Fatalf("HashCustomerConfigPublishInput error = %v", err)
			}
			if got == want {
				t.Fatalf("immutable %s change did not change hash %s", mutation.name, got)
			}
		})
	}
}

func TestValidateCustomerConfigUsesSingleCanonicalHashContract(t *testing.T) {
	in := validCustomerConfigInput()
	wantHash, err := HashCustomerConfigPublishInput(in)
	if err != nil {
		t.Fatalf("HashCustomerConfigPublishInput error = %v", err)
	}
	result, err := NewCustomerConfigUsecase(nil).ValidateCustomerConfig(context.Background(), in)
	if err != nil {
		t.Fatalf("ValidateCustomerConfig error = %v", err)
	}
	if result.ConfigHash != wantHash || result.ConfigHashVersion != CustomerConfigHashVersion {
		t.Fatalf("hash contract = (%s, %d), want (%s, %d)", result.ConfigHash, result.ConfigHashVersion, wantHash, CustomerConfigHashVersion)
	}
	if CustomerConfigHashVersion != 1 {
		t.Fatalf("first formal hash contract version = %d, want 1", CustomerConfigHashVersion)
	}
}

func TestCustomerConfigValidateAndPublishRejectEmptyProductVersion(t *testing.T) {
	in := validCustomerConfigInput()
	in.ProductVersion = "  "
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())
	if _, err := uc.ValidateCustomerConfig(context.Background(), in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("ValidateCustomerConfig error = %v, want ErrBadParam", err)
	}
	if _, err := uc.PublishCustomerConfig(context.Background(), in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("PublishCustomerConfig error = %v, want ErrBadParam", err)
	}
}

func TestCustomerConfigValidateAndPublishRejectSchemaLengthOverflow(t *testing.T) {
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())
	mutations := []struct {
		name   string
		mutate func(*CustomerConfigPublishInput)
	}{
		{name: "customer key", mutate: func(in *CustomerConfigPublishInput) { in.CustomerKey = strings.Repeat("a", 65) }},
		{name: "revision", mutate: func(in *CustomerConfigPublishInput) { in.Revision = strings.Repeat("r", 65) }},
		{name: "product version", mutate: func(in *CustomerConfigPublishInput) { in.ProductVersion = strings.Repeat("p", 129) }},
	}
	for _, mutation := range mutations {
		t.Run(mutation.name, func(t *testing.T) {
			in := validCustomerConfigInput()
			mutation.mutate(&in)
			if _, err := uc.ValidateCustomerConfig(context.Background(), in); !errors.Is(err, ErrBadParam) {
				t.Fatalf("ValidateCustomerConfig error = %v, want ErrBadParam", err)
			}
			if _, err := uc.PublishCustomerConfig(context.Background(), in, 99); !errors.Is(err, ErrBadParam) {
				t.Fatalf("PublishCustomerConfig error = %v, want ErrBadParam", err)
			}
		})
	}
}

func TestCustomerConfigLocalTestIdentityMustStayPaired(t *testing.T) {
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())
	for _, mutation := range []func(*CustomerConfigPublishInput){
		func(in *CustomerConfigPublishInput) {
			in.ProductVersion = CustomerConfigLocalTestProductVersion
		},
		func(in *CustomerConfigPublishInput) {
			in.ProductVersion = "local-customer-package-test-unknown"
		},
		func(in *CustomerConfigPublishInput) {
			in.CompiledSnapshot["applyPurpose"] = CustomerConfigLocalTestApplyPurpose
		},
		func(in *CustomerConfigPublishInput) {
			in.ProductVersion = CustomerConfigLocalTestProductVersion
			in.CompiledSnapshot["applyPurpose"] = "local_test_unknown"
		},
		func(in *CustomerConfigPublishInput) {
			in.CompiledSnapshot["applyPurpose"] = "unknown_apply_purpose"
		},
		func(in *CustomerConfigPublishInput) {
			in.CompiledSnapshot["applyPurpose"] = true
		},
		func(in *CustomerConfigPublishInput) {
			in.CompiledSnapshot["applyPurpose"] = "  "
		},
		func(in *CustomerConfigPublishInput) {
			in.ProductVersion = CustomerConfigLocalTestProductVersion
			in.CompiledSnapshot["applyPurpose"] = CustomerConfigLocalTestApplyPurpose
			in.CompiledSnapshot["datasetVersion"] = "2026.07.15-v3"
		},
		func(in *CustomerConfigPublishInput) {
			in.ProductVersion = CustomerConfigLocalTestProductVersion
			in.CompiledSnapshot["applyPurpose"] = CustomerConfigLocalTestApplyPurpose
			in.CompiledSnapshot["target"] = "customer-trial-133"
		},
	} {
		in := validCustomerConfigInput()
		mutation(&in)
		if _, err := uc.ValidateCustomerConfig(context.Background(), in); !errors.Is(err, ErrBadParam) {
			t.Fatalf("ValidateCustomerConfig error = %v, want ErrBadParam", err)
		}
	}

	valid := validCustomerConfigInput()
	valid.ProductVersion = CustomerConfigLocalTestProductVersion
	valid.CompiledSnapshot["applyPurpose"] = CustomerConfigLocalTestApplyPurpose
	if _, err := uc.ValidateCustomerConfig(context.Background(), valid); err != nil {
		t.Fatalf("paired local test identity must remain structurally valid: %v", err)
	}
}

func TestCustomerConfigTrialIdentityMustStayPaired(t *testing.T) {
	const trialRevision = "demo-customer-trial-v5"
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())
	for _, mutation := range []func(*CustomerConfigPublishInput){
		func(in *CustomerConfigPublishInput) {
			in.Revision = "trial-v5"
			in.ProductVersion = CustomerConfigTrialProductVersion
			in.CompiledSnapshot["applyPurpose"] = CustomerConfigTrialApplyPurpose
			in.CompiledSnapshot["datasetVersion"] = CustomerConfigTrialDatasetVersion
			in.CompiledSnapshot["target"] = "customer-trial-133"
		},
		func(in *CustomerConfigPublishInput) {
			in.ProductVersion = CustomerConfigTrialProductVersion
		},
		func(in *CustomerConfigPublishInput) {
			in.ProductVersion = "customer-trial-133-test-2026.07.15-v3"
			in.CompiledSnapshot["applyPurpose"] = CustomerConfigTrialApplyPurpose
		},
		func(in *CustomerConfigPublishInput) {
			in.CompiledSnapshot["applyPurpose"] = CustomerConfigTrialApplyPurpose
		},
		func(in *CustomerConfigPublishInput) {
			in.Revision = trialRevision
		},
		func(in *CustomerConfigPublishInput) {
			in.Revision = trialRevision
			in.ProductVersion = CustomerConfigTrialProductVersion
			in.CompiledSnapshot["applyPurpose"] = CustomerConfigTrialApplyPurpose
			in.CompiledSnapshot["target"] = "customer-trial-133"
		},
		func(in *CustomerConfigPublishInput) {
			in.Revision = trialRevision
			in.ProductVersion = CustomerConfigTrialProductVersion
			in.CompiledSnapshot["applyPurpose"] = CustomerConfigTrialApplyPurpose
			in.CompiledSnapshot["datasetVersion"] = "2026.07.15-v3"
			in.CompiledSnapshot["target"] = "customer-trial-133"
		},
		func(in *CustomerConfigPublishInput) {
			in.Revision = trialRevision
			in.ProductVersion = CustomerConfigTrialProductVersion
			in.CompiledSnapshot["applyPurpose"] = CustomerConfigTrialApplyPurpose
			in.CompiledSnapshot["datasetVersion"] = CustomerConfigTrialDatasetVersion
		},
		func(in *CustomerConfigPublishInput) {
			in.Revision = trialRevision
			in.ProductVersion = CustomerConfigTrialProductVersion
			in.CompiledSnapshot["applyPurpose"] = CustomerConfigTrialApplyPurpose
			in.CompiledSnapshot["datasetVersion"] = CustomerConfigTrialDatasetVersion
			in.CompiledSnapshot["target"] = "customer-trial-other"
		},
	} {
		in := validCustomerConfigInput()
		mutation(&in)
		if _, err := uc.ValidateCustomerConfig(context.Background(), in); !errors.Is(err, ErrBadParam) {
			t.Fatalf("ValidateCustomerConfig error = %v, want ErrBadParam", err)
		}
	}

	valid := validCustomerConfigInput()
	valid.Revision = trialRevision
	valid.ProductVersion = CustomerConfigTrialProductVersion
	valid.CompiledSnapshot["applyPurpose"] = CustomerConfigTrialApplyPurpose
	valid.CompiledSnapshot["datasetVersion"] = CustomerConfigTrialDatasetVersion
	valid.CompiledSnapshot["target"] = "customer-trial-133"
	if _, err := uc.ValidateCustomerConfig(context.Background(), valid); err != nil {
		t.Fatalf("paired customer trial identity must remain structurally valid: %v", err)
	}
}

func addRuntimeProcessSelection(in *CustomerConfigPublishInput, processKey, processVersion, variantKey, businessRefType string) {
	in.CompiledSnapshot["manifest_schema_version"] = CustomerConfigManifestSchemaVersionCurrent
	in.CompiledSnapshot["process_contract_version"] = CustomerProcessContractVersionCurrent
	in.CompiledSnapshot["manifest_status"] = "runtime_compile_ready"
	in.CompiledSnapshot["runtime_enabled"] = true
	in.CompiledSnapshot["publishable"] = true
	in.CompiledSnapshot["runtimeProcessSelections"] = []any{
		map[string]any{
			"process_key":       processKey,
			"process_version":   processVersion,
			"variant_key":       variantKey,
			"business_ref_type": businessRefType,
		},
	}
}

func TestCustomerConfigUsecasePublishActivateAndEffectiveSession(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)

	published, err := uc.PublishCustomerConfig(ctx, validCustomerConfigInput(), 99)
	if err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if published.Status != CustomerConfigStatusPublished {
		t.Fatalf("published status = %s", published.Status)
	}
	activated, err := activateCustomerConfigForTest(ctx, uc, repo, "yoyoosun", "2026.06.28.1", 99)
	if err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}
	if activated.Status != CustomerConfigStatusActive {
		t.Fatalf("activated status = %s", activated.Status)
	}

	session, err := uc.GetEffectiveSession(ctx, "yoyoosun", &AdminUser{
		ID: 7,
		Roles: []AdminRole{
			{Key: SalesRoleKey},
		},
		Permissions: []string{PermissionSalesOrderRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if session.ConfigRevision != "2026.06.28.1" {
		t.Fatalf("ConfigRevision = %s", session.ConfigRevision)
	}
	if session.ConfigProductVersion != "local-test" {
		t.Fatalf("ConfigProductVersion = %s", session.ConfigProductVersion)
	}
	if session.ConfigApplyPurpose != "" || session.ConfigDatasetVersion != "" || session.ConfigTarget != "" {
		t.Fatalf("unexpected config markers = purpose:%q dataset:%q target:%q", session.ConfigApplyPurpose, session.ConfigDatasetVersion, session.ConfigTarget)
	}
	if session.Customer.Name != "永绅" {
		t.Fatalf("customer name = %s", session.Customer.Name)
	}
	if session.Modules["production"] != "read_only" {
		t.Fatalf("production module state = %s", session.Modules["production"])
	}
	if len(session.Actions) != 1 || session.Actions[0] != PermissionSalesOrderRead {
		t.Fatalf("actions = %#v", session.Actions)
	}
	if len(session.WorkPools) != 1 || session.WorkPools[0] != "sales" {
		t.Fatalf("work pools = %#v", session.WorkPools)
	}
	if len(session.Pages) != 1 || session.Pages[0] != "sales-orders" {
		t.Fatalf("pages must be RBAC and config intersection, got %#v", session.Pages)
	}
	salesOrderPolicies, ok := session.FieldPolicies["sales_orders.default"].(map[string]any)
	if !ok {
		t.Fatalf("sales order field policies missing: %#v", session.FieldPolicies)
	}
	if _, ok := salesOrderPolicies["source_no"]; !ok {
		t.Fatalf("source_no field policy missing: %#v", salesOrderPolicies)
	}
	printDefaults, ok := session.PrintTemplateDefaults["templates"].([]any)
	if !ok || len(printDefaults) != 1 {
		t.Fatalf("print template defaults must include enabled purchase template only, got %#v", session.PrintTemplateDefaults)
	}
	materialDefaults, _ := printDefaults[0].(map[string]any)
	if materialDefaults["template_key"] != "material-purchase-contract" {
		t.Fatalf("print template default = %#v", materialDefaults)
	}
	if materialDefaults["supplier_defaults_allowed"] != false {
		t.Fatalf("supplier defaults must stay disabled: %#v", materialDefaults)
	}
}

func TestCustomerConfigUsecaseReferenceRevisionProjectsSupplierFieldPolicy(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CustomerKey = "reference-customer"
	in.Revision = "reference-customer-package-v1.runtime-manifest-v1"
	in.CompiledSnapshot["customer"] = map[string]any{
		"key":  "reference-customer",
		"name": "标准样例毛绒制造有限公司（工程参考）",
	}
	in.CompiledSnapshot["pages"] = []any{"suppliers"}
	in.CompiledSnapshot["fieldPolicies"] = map[string]any{
		"suppliers.default": map[string]any{
			"supplier_code": map[string]any{"visible": true},
			"supplier_type": map[string]any{"visible": false},
		},
	}
	in.RoleProfiles = []RoleProfileInput{
		{RoleKey: PurchaseRoleKey, DisplayName: "采购"},
	}
	in.AccessEntitlements = []AccessEntitlementInput{
		{RoleKey: PurchaseRoleKey, CapabilityKey: PermissionSupplierRead, Enabled: true},
	}
	in.WorkPools = []WorkPoolInput{
		{PoolKey: "purchase", ModuleKey: "purchase_orders", DisplayName: "采购池"},
	}
	in.WorkPoolMemberships = []WorkPoolMembershipInput{
		{PoolKey: "purchase", RoleKey: PurchaseRoleKey, Enabled: true},
	}

	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	session, err := uc.GetEffectiveSession(ctx, in.CustomerKey, &AdminUser{
		ID:          7,
		Roles:       []AdminRole{{Key: PurchaseRoleKey}},
		Permissions: []string{PermissionSupplierRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if session.ConfigRevision != in.Revision || session.Customer.Key != in.CustomerKey {
		t.Fatalf("effective session identity = %#v", session)
	}
	policies, ok := session.FieldPolicies["suppliers.default"].(map[string]any)
	if !ok {
		t.Fatalf("supplier field policies missing: %#v", session.FieldPolicies)
	}
	supplierType, ok := policies["supplier_type"].(map[string]any)
	if !ok || supplierType["visible"] != false {
		t.Fatalf("supplier_type policy = %#v", policies["supplier_type"])
	}
}

func TestCustomerConfigUsecaseEffectiveSessionAppliesEntitlementAndRoleRevokeWithinRBAC(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.RoleProfiles[0].Revokes = []string{PermissionSalesOrderRead}
	in.AccessEntitlements = append(in.AccessEntitlements, AccessEntitlementInput{
		RoleKey:       SalesRoleKey,
		CapabilityKey: PermissionSalesOrderUpdate,
		Enabled:       true,
	})

	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, "yoyoosun", "2026.06.28.1", 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}
	session, err := uc.GetEffectiveSession(ctx, "yoyoosun", &AdminUser{
		ID:          7,
		Roles:       []AdminRole{{Key: SalesRoleKey}},
		Permissions: []string{PermissionSalesOrderRead, PermissionSalesOrderUpdate},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if len(session.Actions) != 1 || session.Actions[0] != PermissionSalesOrderUpdate {
		t.Fatalf("role revoke must narrow entitlement actions without exceeding RBAC, got %#v", session.Actions)
	}
}

func TestCustomerConfigUsecaseEffectiveActionEntitlementsLeaveModuleStateToDomainGate(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	for index := range in.ModuleStates {
		if in.ModuleStates[index].ModuleKey == "sales_orders" {
			in.ModuleStates[index].State = "read_only"
		}
		if in.ModuleStates[index].ModuleKey == "shipments" {
			in.ModuleStates[index].State = "read_only"
		}
	}
	in.AccessEntitlements = append(in.AccessEntitlements, AccessEntitlementInput{
		RoleKey:       SalesRoleKey,
		CapabilityKey: PermissionSalesOrderUpdate,
		Enabled:       true,
	}, AccessEntitlementInput{
		RoleKey:       SalesRoleKey,
		CapabilityKey: PermissionSalesOrderActivate,
		ScopeType:     "customer",
		ScopeValue:    "other_customer",
		Enabled:       true,
	})
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}
	admin := &AdminUser{
		ID:          7,
		Roles:       []AdminRole{{Key: SalesRoleKey}},
		Permissions: []string{PermissionSalesOrderRead, PermissionSalesOrderUpdate, PermissionSalesOrderActivate},
	}
	entitlements, err := uc.GetEffectiveActionEntitlements(ctx, in.CustomerKey, admin)
	if err != nil {
		t.Fatalf("GetEffectiveActionEntitlements error = %v", err)
	}
	if !PermissionSetHasAll(PermissionKeySet(entitlements), PermissionSalesOrderRead, PermissionSalesOrderUpdate) {
		t.Fatalf("customer role entitlement must retain read/update before module gate, got %#v", entitlements)
	}
	if PermissionSetHasAny(PermissionKeySet(entitlements), PermissionSalesOrderActivate) {
		t.Fatalf("other-customer action entitlement must not cross customer boundary, got %#v", entitlements)
	}
	session, err := uc.GetEffectiveSession(ctx, in.CustomerKey, admin)
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if PermissionSetHasAny(PermissionKeySet(session.Actions), PermissionSalesOrderUpdate) {
		t.Fatalf("read_only effective session must hide update action, got %#v", session.Actions)
	}
}

func TestCustomerConfigUsecaseEffectiveSessionRevokesStayWithinTheirRole(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.RoleProfiles = append(in.RoleProfiles, RoleProfileInput{
		RoleKey:     PurchaseRoleKey,
		DisplayName: "采购",
	})
	in.AccessEntitlements = append(in.AccessEntitlements,
		AccessEntitlementInput{RoleKey: PurchaseRoleKey, CapabilityKey: PermissionPurchaseOrderRead, Enabled: true},
	)
	for index := range in.RoleProfiles {
		if in.RoleProfiles[index].RoleKey == FinanceRoleKey {
			in.RoleProfiles[index].Revokes = []string{PermissionPurchaseOrderRead}
		}
	}

	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, "yoyoosun", "2026.06.28.1", 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}
	session, err := uc.GetEffectiveSession(ctx, "yoyoosun", &AdminUser{
		ID: 7,
		Roles: []AdminRole{
			{Key: FinanceRoleKey},
			{Key: PurchaseRoleKey},
		},
		Permissions: []string{PermissionFinancePayableRead, PermissionPurchaseOrderRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if !PermissionSetHasAny(PermissionKeySet(session.Actions), PermissionPurchaseOrderRead) {
		t.Fatalf("finance revoke must not remove purchase role grant, got %#v", session.Actions)
	}
}

func TestCustomerConfigUsecaseEffectiveSessionDisablesCustomerRoleProjection(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.RoleProfiles[0].Disabled = true

	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, "yoyoosun", "2026.06.28.1", 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}
	session, err := uc.GetEffectiveSession(ctx, "yoyoosun", &AdminUser{
		ID:          7,
		Roles:       []AdminRole{{Key: SalesRoleKey}},
		Permissions: []string{PermissionSalesOrderRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if len(session.Roles) != 0 || len(session.Pages) != 0 || len(session.Actions) != 0 || len(session.WorkPools) != 0 {
		t.Fatalf("disabled customer role must have no effective role/pages/actions/pools, got roles=%#v pages=%#v actions=%#v pools=%#v", session.Roles, session.Pages, session.Actions, session.WorkPools)
	}
}

func TestCustomerConfigUsecaseRejectsEntitlementAboveBackendRole(t *testing.T) {
	ctx := context.Background()
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())

	in := validCustomerConfigInput()
	in.AccessEntitlements = append(in.AccessEntitlements, AccessEntitlementInput{
		RoleKey:       SalesRoleKey,
		CapabilityKey: PermissionFinancePayableRead,
		Enabled:       true,
	})
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("customer entitlement must not exceed backend role RBAC, got %v", err)
	}
}

func TestCustomerConfigUsecaseEffectiveSessionNarrowsReferenceReadsToRolePages(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CompiledSnapshot["pages"] = []any{"materials", "sales-orders"}
	in.CompiledSnapshot["rolePageProjections"] = map[string]any{
		SalesRoleKey:   []any{"sales-orders"},
		FinanceRoleKey: []any{"materials"},
	}
	in.AccessEntitlements = append(in.AccessEntitlements, AccessEntitlementInput{
		RoleKey:       SalesRoleKey,
		CapabilityKey: PermissionMaterialRead,
		ScopeType:     "customer",
		ScopeValue:    "yoyoosun",
		Enabled:       true,
	})
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}
	session, err := uc.GetEffectiveSession(ctx, in.CustomerKey, &AdminUser{
		ID:          7,
		Roles:       []AdminRole{{Key: SalesRoleKey}},
		Permissions: []string{PermissionSalesOrderRead, PermissionMaterialRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if !PermissionSetHasAny(PermissionKeySet(session.Actions), PermissionMaterialRead) {
		t.Fatalf("reference read must remain available to the sales order page, got %#v", session.Actions)
	}
	if len(session.Pages) != 1 || session.Pages[0] != "sales-orders" {
		t.Fatalf("reference read must not expose the materials page, got %#v", session.Pages)
	}
}

func TestCustomerConfigActionContactUsesAnyEnabledOwnerModule(t *testing.T) {
	customersOnly := map[string]struct{}{"customers": {}}
	suppliersOnly := map[string]struct{}{"suppliers": {}}
	readOnlyCustomers := map[string]struct{}{"customers": {}}

	if !customerConfigActionAllowedByModuleState(PermissionContactRead, customersOnly, customersOnly) {
		t.Fatal("contact read must remain available when customers is the only readable owner module")
	}
	if !customerConfigActionAllowedByModuleState(PermissionContactCreate, suppliersOnly, suppliersOnly) {
		t.Fatal("contact create must remain available when suppliers is the only enabled owner module")
	}
	if customerConfigActionAllowedByModuleState(PermissionContactCreate, map[string]struct{}{}, readOnlyCustomers) {
		t.Fatal("contact write must not use a read-only owner module")
	}
	if !customerConfigActionAllowedByModuleState(PermissionContactRead, map[string]struct{}{}, readOnlyCustomers) {
		t.Fatal("contact read must use a read-only owner module")
	}
}

func TestEnsureCustomerConfigModuleKeysEnabledExpandsPurchaseReceiptDependencies(t *testing.T) {
	modules := validCustomerConfigInput().ModuleStates
	if err := ensureCustomerConfigModuleKeysEnabled([]string{"purchase_receipts"}, modules); err != nil {
		t.Fatalf("complete purchase receipt closure must pass, got %v", err)
	}
	for _, missingModuleKey := range []string{"quality_inspections", "inventory"} {
		mutated := append([]DeploymentModuleStateInput(nil), modules...)
		for index := range mutated {
			if mutated[index].ModuleKey == missingModuleKey {
				mutated[index].State = "disabled"
			}
		}
		if err := ensureCustomerConfigModuleKeysEnabled([]string{"purchase_receipts"}, mutated); !errors.Is(err, ErrBadParam) {
			t.Fatalf("purchase receipt action must require %s, got %v", missingModuleKey, err)
		}
	}
}

func TestCustomerConfigUsecaseRejectsDanglingRoleAndWorkPoolReferences(t *testing.T) {
	ctx := context.Background()
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())

	for _, mutate := range []func(*CustomerConfigPublishInput){
		func(in *CustomerConfigPublishInput) {
			in.AccessEntitlements[0].RoleKey = "missing-role"
		},
		func(in *CustomerConfigPublishInput) {
			in.WorkPoolMemberships[0].RoleKey = "missing-role"
		},
		func(in *CustomerConfigPublishInput) {
			in.WorkPoolMemberships[0].PoolKey = "missing-pool"
		},
	} {
		in := validCustomerConfigInput()
		mutate(&in)
		if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
			t.Fatalf("dangling customer config reference error = %v, want ErrBadParam", err)
		}
	}
}

func TestCustomerConfigUsecaseEffectiveSessionFiltersProjectionByEnabledModules(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	for index := range in.ModuleStates {
		if in.ModuleStates[index].ModuleKey == "sales_orders" {
			in.ModuleStates[index].State = "read_only"
		}
		if in.ModuleStates[index].ModuleKey == "shipments" {
			in.ModuleStates[index].State = "read_only"
		}
	}
	in.AccessEntitlements = append(in.AccessEntitlements,
		AccessEntitlementInput{RoleKey: SalesRoleKey, CapabilityKey: PermissionSalesOrderUpdate, Enabled: true},
	)
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, "yoyoosun", "2026.06.28.1", 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	session, err := uc.GetEffectiveSession(ctx, "yoyoosun", &AdminUser{
		ID: 7,
		Roles: []AdminRole{
			{Key: SalesRoleKey},
		},
		Permissions: []string{PermissionSalesOrderRead, PermissionSalesOrderUpdate},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if session.Modules["sales_orders"] != "read_only" {
		t.Fatalf("sales_orders module state = %s", session.Modules["sales_orders"])
	}
	if len(session.Pages) != 1 || session.Pages[0] != "sales-orders" {
		t.Fatalf("read-only business page must remain visible, got %#v", session.Pages)
	}
	if len(session.Actions) != 1 || session.Actions[0] != PermissionSalesOrderRead {
		t.Fatalf("read-only module must retain only its read action, got %#v", session.Actions)
	}
	if len(session.WorkPools) != 0 {
		t.Fatalf("sales work pool must be filtered when sales_orders is read_only, got %#v", session.WorkPools)
	}
	if _, ok := session.FieldPolicies["sales_orders.default"]; !ok {
		t.Fatalf("read-only module must retain field labels and visibility policy: %#v", session.FieldPolicies)
	}
}

func TestWorkflowTaskPagesFollowModuleReadBoundaryTogether(t *testing.T) {
	pages := []string{"task-board", "shipping-release"}
	disabled := map[string]struct{}{}
	readable := map[string]struct{}{"workflow_tasks": {}}
	for _, pageKey := range pages {
		if customerConfigPageAllowedByModules(pageKey, disabled) {
			t.Fatalf("disabled workflow_tasks must hide %s", pageKey)
		}
		if !customerConfigPageAllowedByModules(pageKey, readable) {
			t.Fatalf("readable workflow_tasks must retain %s", pageKey)
		}
	}
	if !customerConfigActionAllowedByModuleState(PermissionWorkflowTaskRead, disabled, readable) {
		t.Fatal("read_only workflow_tasks must retain workflow.task.read")
	}
	if customerConfigActionAllowedByModuleState(PermissionWorkflowTaskComplete, disabled, readable) {
		t.Fatal("read_only workflow_tasks must remove workflow task mutations")
	}
}

func TestCustomerConfigUsecaseRejectsUnsafePrintTemplateDefaults(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	printDefaults := in.CompiledSnapshot["printTemplateDefaults"].(map[string]any)
	templates := printDefaults["templates"].([]any)
	firstTemplate := templates[0].(map[string]any)
	firstTemplate["supplier_defaults_allowed"] = true

	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("PublishCustomerConfig error = %v, want ErrBadParam", err)
	}
}

func TestCustomerConfigUsecaseBuildsProcessInstanceCreateFromActiveProcessDefinition(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	addRuntimeProcessSelection(&in, ProcessKeySalesOrderAcceptance, "v1", CustomerProcessVariantSalesApprovalPMC, "sales_order")
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	refNo := "SO-1001"
	create, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     in.CustomerKey,
		ProcessKey:      ProcessKeySalesOrderAcceptance,
		BusinessRefType: "sales_order",
		BusinessRefID:   1001,
		BusinessRefNo:   &refNo,
		IdempotencyKey:  "sales_order:1001:sales_order_acceptance:v1",
	})
	if err != nil {
		t.Fatalf("BuildProcessInstanceCreateFromActiveCustomerConfig error = %v", err)
	}
	if create.ProcessKey != ProcessKeySalesOrderAcceptance || create.ProcessVersion != "v1" {
		t.Fatalf("process identity = %#v", create)
	}
	if create.ConfigRevision != in.Revision {
		t.Fatalf("config revision = %s", create.ConfigRevision)
	}
	if create.DefinitionHash == "" {
		t.Fatalf("definition hash must be set")
	}
	if create.ModuleContractSnapshot["source"] != "active_customer_config" {
		t.Fatalf("module contract snapshot = %#v", create.ModuleContractSnapshot)
	}
	if len(create.Nodes) != 4 {
		t.Fatalf("nodes = %#v", create.Nodes)
	}
	if create.Nodes[0].NodeKey != "submit_sales_order" ||
		create.Nodes[0].NodeType != ProcessNodeTypeDomainCommand ||
		create.Nodes[0].PolicySnapshot["command_key"] != ProcessDomainCommandSalesOrderSubmit {
		t.Fatalf("submit node = %#v", create.Nodes[0])
	}
	if create.Nodes[1].OwnerPoolKey == nil || *create.Nodes[1].OwnerPoolKey != "order_approval" {
		t.Fatalf("approval owner pool = %#v", create.Nodes[1].OwnerPoolKey)
	}
	if create.Nodes[2].RequiredCapabilityKey == nil || *create.Nodes[2].RequiredCapabilityKey != PermissionWorkflowTaskComplete {
		t.Fatalf("review capability = %#v", create.Nodes[2].RequiredCapabilityKey)
	}

	processRepo := &memProcessRuntimeRepo{}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
	if _, _, err := processRuntimeUC.CreateProcessInstance(ctx, create, 99); err != nil {
		t.Fatalf("CreateProcessInstance from active customer config error = %v", err)
	}
	if processRepo.created == nil || processRepo.created.ConfigRevision != in.Revision {
		t.Fatalf("created process input = %#v", processRepo.created)
	}
}

func TestCustomerConfigUsecaseRejectsUnregisteredMaterialSupplyBusinessRefSelection(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	addRuntimeProcessSelection(&in, ProcessKeyMaterialSupply, "v1", CustomerProcessVariantMaterialReceiptIQCInbound, "purchase_receipt")
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unregistered material supply business ref error = %v, want ErrBadParam", err)
	}
}

func TestCustomerConfigUsecaseBuildsMaterialSupplyPurchaseOrderProcessInstanceCreateFromActiveProcessDefinition(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	addRuntimeProcessSelection(&in, ProcessKeyMaterialSupply, "v1", CustomerProcessVariantMaterialReceiptIQCInbound, "purchase_order")
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	refNo := "PO-5001"
	create, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     in.CustomerKey,
		ProcessKey:      ProcessKeyMaterialSupply,
		BusinessRefType: "purchase_order",
		BusinessRefID:   5001,
		BusinessRefNo:   &refNo,
		IdempotencyKey:  "purchase_order:5001:material_supply:v1",
	})
	if err != nil {
		t.Fatalf("BuildProcessInstanceCreateFromActiveCustomerConfig error = %v", err)
	}
	if create.ProcessKey != ProcessKeyMaterialSupply || create.ProcessVersion != "v1" {
		t.Fatalf("process identity = %#v", create)
	}
	if create.BusinessRefType != "purchase_order" || create.BusinessRefID != 5001 {
		t.Fatalf("business ref = %#v", create)
	}
	if len(create.Nodes) != 4 {
		t.Fatalf("nodes = %#v", create.Nodes)
	}
	if create.Nodes[0].NodeKey != "purchase_receipt_source" ||
		create.Nodes[0].NodeType != ProcessNodeTypeDomainCommand ||
		create.Nodes[0].PolicySnapshot["command_key"] != ProcessDomainCommandPurchaseReceiptCreate {
		t.Fatalf("purchase receipt source node = %#v", create.Nodes[0])
	}
	if create.Nodes[1].NodeKey != "incoming_qc" ||
		create.Nodes[1].PolicySnapshot["command_key"] != ProcessDomainCommandIncomingQualityGate {
		t.Fatalf("incoming qc node = %#v", create.Nodes[1])
	}
	if create.Nodes[2].NodeKey != "warehouse_inbound" ||
		create.Nodes[2].PolicySnapshot["command_key"] != ProcessDomainCommandInventoryPostInbound {
		t.Fatalf("warehouse inbound node = %#v", create.Nodes[2])
	}
}

func TestCustomerConfigUsecaseRejectsCustomerSuppliedProcessDefinitions(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	addRuntimeProcessSelection(&in, ProcessKeySalesOrderAcceptance, "v1", CustomerProcessVariantSalesApprovalPMC, "sales_order")
	in.CompiledSnapshot["processDefinitions"] = map[string]any{
		ProcessKeySalesOrderAcceptance: map[string]any{
			"process_key":     ProcessKeySalesOrderAcceptance,
			"process_version": "v1",
			"variant_key":     CustomerProcessVariantSalesApprovalPMC,
			"nodes":           []any{map[string]any{"node_key": "end", "node_type": ProcessNodeTypeEnd}},
		},
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("customer-supplied process graph error = %v, want ErrBadParam", err)
	}
}

func TestCustomerConfigUsecaseRejectsProcessStartWhenReferencedModuleNotEnabled(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name             string
		mutateModules    func([]DeploymentModuleStateInput) []DeploymentModuleStateInput
		wantBlockedState string
	}{
		{
			name: "referenced source module read only",
			mutateModules: func(items []DeploymentModuleStateInput) []DeploymentModuleStateInput {
				for index := range items {
					if items[index].ModuleKey == "sales_orders" {
						items[index].State = "read_only"
					}
					if items[index].ModuleKey == "shipments" {
						items[index].State = "read_only"
					}
				}
				return items
			},
			wantBlockedState: "read_only",
		},
		{
			name: "workflow module disabled",
			mutateModules: func(items []DeploymentModuleStateInput) []DeploymentModuleStateInput {
				for index := range items {
					if items[index].ModuleKey == "workflow_tasks" {
						items[index].State = "disabled"
					}
				}
				return items
			},
			wantBlockedState: "disabled",
		},
		{
			name: "referenced module missing",
			mutateModules: func(items []DeploymentModuleStateInput) []DeploymentModuleStateInput {
				out := []DeploymentModuleStateInput{}
				for _, item := range items {
					if item.ModuleKey != "sales_orders" && item.ModuleKey != "shipments" {
						out = append(out, item)
					}
				}
				return out
			},
			wantBlockedState: "missing",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newMemCustomerConfigRepo()
			uc := NewCustomerConfigUsecase(repo)
			in := validCustomerConfigInput()
			in.ModuleStates = tt.mutateModules(in.ModuleStates)
			addRuntimeProcessSelection(&in, ProcessKeySalesOrderAcceptance, "v1", CustomerProcessVariantSalesApprovalPMC, "sales_order")
			if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
				t.Fatalf("PublishCustomerConfig error = %v", err)
			}
			if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
				t.Fatalf("ActivateCustomerConfig error = %v", err)
			}
			_, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
				CustomerKey:     in.CustomerKey,
				ProcessKey:      ProcessKeySalesOrderAcceptance,
				BusinessRefType: "sales_order",
				BusinessRefID:   1001,
				IdempotencyKey:  "sales_order:1001:sales_order_acceptance:v1",
			})
			if !errors.Is(err, ErrBadParam) {
				t.Fatalf("expected ErrBadParam for %s module, got %v", tt.wantBlockedState, err)
			}
		})
	}
}

func TestCustomerConfigUsecaseRejectsUnsupportedFieldPolicies(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CompiledSnapshot["fieldPolicies"] = map[string]any{
		"sales_order_items.default": map[string]any{
			"style_no": map[string]any{"visible": true},
		},
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unsupported field policy error = %v", err)
	}

	in = validCustomerConfigInput()
	in.CompiledSnapshot["fieldPolicies"] = map[string]any{
		"sales_orders.default": map[string]any{
			"style_no": map[string]any{"visible": true},
		},
	}
	if _, err := uc.ValidateCustomerConfig(ctx, in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unsupported field key validation error = %v", err)
	}
}

func TestCustomerConfigUsecaseRejectsMissingOrUnknownPages(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	delete(in.CompiledSnapshot, "pages")
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("missing pages error = %v", err)
	}

	in = validCustomerConfigInput()
	in.CompiledSnapshot["pages"] = []any{"sales-orders", "unknown-page"}
	if _, err := uc.ValidateCustomerConfig(ctx, in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unknown page validation error = %v", err)
	}

	in = validCustomerConfigInput()
	in.CompiledSnapshot["pages"] = []any{}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("empty pages error = %v", err)
	}
}

func TestCustomerConfigUsecaseExplainModuleStatus(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	status, err := uc.ExplainModuleStatus(ctx, in.CustomerKey, "sales_orders")
	if err != nil {
		t.Fatalf("ExplainModuleStatus error = %v", err)
	}
	if status.CustomerState != "enabled" {
		t.Fatalf("customer state = %s", status.CustomerState)
	}
	if !status.ProductIncluded || status.ProductLayer != "SourceDocument" {
		t.Fatalf("product catalog fields = %#v", status)
	}
	if !status.DependenciesSatisfied {
		t.Fatalf("dependencies should be satisfied, missing=%#v", status.MissingDependencies)
	}
	if status.CanEnable {
		t.Fatalf("enabled module must not be enable-able")
	}
	if status.CanDisable {
		t.Fatalf("disable must stay blocked until full module enforcement connects")
	}
	if len(status.DisableBlockedReasons) != 1 || status.DisableBlockedReasons[0] != "module_disable_full_enforcement_not_connected" {
		t.Fatalf("disable blocked reasons = %#v", status.DisableBlockedReasons)
	}
	if status.RuntimeCountSource != "process_workflow_business_partial" ||
		status.InFlightProcessCount != 0 ||
		status.OpenTaskCount != 0 ||
		status.OpenBusinessDocCount != 0 {
		t.Fatalf("runtime counts = source:%s process:%d tasks:%d business:%d", status.RuntimeCountSource, status.InFlightProcessCount, status.OpenTaskCount, status.OpenBusinessDocCount)
	}
	if len(status.ReferencedWorkPoolKeys) != 1 || status.ReferencedWorkPoolKeys[0] != "sales" {
		t.Fatalf("work pool refs = %#v", status.ReferencedWorkPoolKeys)
	}
	if len(status.ReferencedRoleKeys) != 1 || status.ReferencedRoleKeys[0] != SalesRoleKey {
		t.Fatalf("role refs = %#v", status.ReferencedRoleKeys)
	}
	if len(status.ReferencedPageKeys) != 1 || status.ReferencedPageKeys[0] != "sales-orders" {
		t.Fatalf("page refs = %#v", status.ReferencedPageKeys)
	}
	processRefs := map[string]bool{}
	for _, key := range status.ReferencedProcessKeys {
		processRefs[key] = true
	}
	if !processRefs["sales_order_approval"] || !processRefs["sales_to_production"] {
		t.Fatalf("process refs = %#v", status.ReferencedProcessKeys)
	}
}

func TestCustomerConfigUsecaseExplainModuleStatusCountsRuntimeGuards(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.WorkPools[0].PoolKey = "sales_approval"
	in.WorkPoolMemberships[0].PoolKey = "sales_approval"
	revisionKey := customerRevisionKey(in.CustomerKey, in.Revision)
	repo.processCount[revisionKey+"/"+ProcessKeySalesOrderAcceptance] = 2
	repo.taskCount[revisionKey+"/sales_approval"] = 2
	repo.taskFallbackRoleCount[revisionKey+"/"+SalesRoleKey] = 1
	repo.businessCount[in.CustomerKey+"/sales_orders"] = 4
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	status, err := uc.ExplainModuleStatus(ctx, in.CustomerKey, "sales_orders")
	if err != nil {
		t.Fatalf("ExplainModuleStatus error = %v", err)
	}
	if status.RuntimeCountSource != "process_workflow_business_partial" {
		t.Fatalf("runtime source = %s", status.RuntimeCountSource)
	}
	if status.InFlightProcessCount != 2 || status.OpenTaskCount != 3 || status.OpenBusinessDocCount != 4 {
		t.Fatalf("runtime counts = %#v", status)
	}
	if len(status.ReferencedWorkPoolKeys) != 1 || status.ReferencedWorkPoolKeys[0] != "sales_approval" ||
		len(status.ReferencedRoleKeys) != 1 || status.ReferencedRoleKeys[0] != SalesRoleKey {
		t.Fatalf("separate responsibility keys = pools:%#v roles:%#v", status.ReferencedWorkPoolKeys, status.ReferencedRoleKeys)
	}
	reasons := map[string]bool{}
	for _, reason := range status.DisableBlockedReasons {
		reasons[reason] = true
	}
	for _, want := range []string{
		"in_flight_processes_present",
		"open_workflow_tasks_present",
		"open_business_documents_present",
		"module_disable_full_enforcement_not_connected",
	} {
		if !reasons[want] {
			t.Fatalf("missing disable reason %q in %#v", want, status.DisableBlockedReasons)
		}
	}
	if status.CanDisable {
		t.Fatalf("module must stay blocked while runtime/business counts are incomplete")
	}
}

func TestCustomerConfigUsecaseExplainProductCoreFinishedGoodsDeliveryDefinition(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	addRuntimeProcessSelection(&in, ProcessKeyFinishedGoodsDelivery, "v1", CustomerProcessVariantFinishedGoodsDelivery, "shipment")
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	explanation, err := uc.ExplainProcessDefinition(ctx, in.CustomerKey, ProcessKeyFinishedGoodsDelivery)
	if err != nil {
		t.Fatalf("ExplainProcessDefinition error = %v", err)
	}
	if explanation.ProcessKey != ProcessKeyFinishedGoodsDelivery ||
		explanation.VariantKey != CustomerProcessVariantFinishedGoodsDelivery ||
		explanation.ManifestStatus != "runtime_loader_ready" {
		t.Fatalf("definition identity = %#v", explanation)
	}
	if !explanation.RuntimeLoaderEnabled || !explanation.CanStartRuntime {
		t.Fatalf("finished_goods_delivery must be runtime-loader ready: %#v", explanation)
	}
	if !explanation.CanExecuteRuntimeCommands {
		t.Fatalf("Product Core registered command contracts must be executable: %#v", explanation)
	}
	if len(explanation.Nodes) != 5 {
		t.Fatalf("nodes = %#v", explanation.Nodes)
	}
	nodeByKey := map[string]CustomerProcessDefinitionNodeExplanation{}
	for _, node := range explanation.Nodes {
		nodeByKey[node.NodeKey] = node
	}
	shipmentNode := nodeByKey["shipment_execution"]
	if shipmentNode.CommandKey != "shipment.ship" ||
		shipmentNode.RuntimeBindingStatus != "process_runtime_handler_registered" ||
		!shipmentNode.ProcessRuntimeHandlerRegistered {
		t.Fatalf("shipment node = %#v", shipmentNode)
	}
	if len(explanation.StartBlockedReasons) != 0 || len(explanation.ExecuteBlockedReasons) != 0 {
		t.Fatalf("canonical Product Core definition blockers: start=%#v execute=%#v", explanation.StartBlockedReasons, explanation.ExecuteBlockedReasons)
	}
}

func TestCustomerConfigUsecaseBuildFinishedGoodsDeliveryProcess(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	addRuntimeProcessSelection(&in, ProcessKeyFinishedGoodsDelivery, "v1", CustomerProcessVariantFinishedGoodsDelivery, "shipment")
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	create, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     in.CustomerKey,
		ProcessKey:      ProcessKeyFinishedGoodsDelivery,
		BusinessRefType: "shipment",
		BusinessRefID:   9001,
		BusinessRefNo:   ptrString("SHIP-9001"),
		IdempotencyKey:  "finished-goods-delivery/SHIP-9001",
	})
	if err != nil {
		t.Fatalf("BuildProcessInstanceCreateFromActiveCustomerConfig error = %v", err)
	}
	if create.ProcessKey != ProcessKeyFinishedGoodsDelivery ||
		create.BusinessRefType != "shipment" ||
		create.BusinessRefID != 9001 {
		t.Fatalf("create = %#v", create)
	}
	if len(create.Nodes) != 5 {
		t.Fatalf("nodes = %#v", create.Nodes)
	}
	if create.Nodes[0].NodeKey != "finished_goods_quality" ||
		create.Nodes[0].PolicySnapshot["command_key"] != ProcessDomainCommandFinishedGoodsQualityDecide {
		t.Fatalf("first node = %#v", create.Nodes[0])
	}
	if create.Nodes[1].PolicySnapshot["command_key"] != ProcessDomainCommandShipmentFinanceRelease ||
		create.Nodes[2].PolicySnapshot["command_key"] != ProcessDomainCommandShipmentShip ||
		create.Nodes[3].PolicySnapshot["command_key"] != ProcessDomainCommandFinanceReceivableLead {
		t.Fatalf("command nodes = %#v", create.Nodes)
	}
	if create.ModuleContractSnapshot["fact_boundary"] != "no_fact_posting" {
		t.Fatalf("module contract snapshot = %#v", create.ModuleContractSnapshot)
	}
}

func TestCustomerConfigUsecasePublishRejectsMissingModuleDependencies(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	moduleStates := []DeploymentModuleStateInput{}
	for _, item := range in.ModuleStates {
		if item.ModuleKey != "customers" && item.ModuleKey != "products" {
			moduleStates = append(moduleStates, item)
		}
	}
	in.ModuleStates = moduleStates
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("publish must reject missing sales order dependencies, got %v", err)
	}
}

func TestCustomerConfigUsecasePublishRejectsReadOnlyDependencyForWritableModule(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	for index := range in.ModuleStates {
		if in.ModuleStates[index].ModuleKey == "customers" {
			in.ModuleStates[index].State = "read_only"
			in.ModuleStates[index].Reason = "historical customer records only"
		}
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("publish must reject read-only dependency for writable sales orders, got %v", err)
	}
}

func TestCustomerConfigUsecasePublishRejectsPurchaseReceiptWithoutQualityOrInventory(t *testing.T) {
	for _, missingModuleKey := range []string{"quality_inspections", "inventory"} {
		t.Run(missingModuleKey, func(t *testing.T) {
			ctx := context.Background()
			repo := newMemCustomerConfigRepo()
			uc := NewCustomerConfigUsecase(repo)
			in := validCustomerConfigInput()
			for index := range in.ModuleStates {
				if in.ModuleStates[index].ModuleKey == missingModuleKey {
					in.ModuleStates[index].State = "disabled"
				}
			}
			if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
				t.Fatalf("publish must reject purchase_receipts without %s, got %v", missingModuleKey, err)
			}
		})
	}
}

func TestCustomerConfigUsecaseExplainModuleStatusWithoutActiveRevision(t *testing.T) {
	status, err := NewCustomerConfigUsecase(newMemCustomerConfigRepo()).ExplainModuleStatus(context.Background(), "", "sales_orders")
	if err != nil {
		t.Fatalf("ExplainModuleStatus error = %v", err)
	}
	if status.Source != "no_active_customer_config" {
		t.Fatalf("source = %s", status.Source)
	}
	if status.CustomerKey != DefaultCustomerKey || status.CustomerState != "not_configured" {
		t.Fatalf("status = %#v", status)
	}
	if len(status.EnableBlockedReasons) != 1 || status.EnableBlockedReasons[0] != "active_revision_missing" {
		t.Fatalf("enable reasons = %#v", status.EnableBlockedReasons)
	}
}

func TestCustomerConfigUsecaseEffectiveSessionFiltersLegacyFieldPolicies(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	key := customerRevisionKey(in.CustomerKey, in.Revision)
	repo.revisions[key].CompiledSnapshot["fieldPolicies"] = map[string]any{
		"sales_orders.default": map[string]any{
			"source_no": map[string]any{"visible": false},
			"style_no":  map[string]any{"visible": true},
		},
		"sales_order_items.default": map[string]any{
			"style_no": map[string]any{"visible": true},
		},
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	session, err := uc.GetEffectiveSession(ctx, in.CustomerKey, &AdminUser{
		ID:          7,
		Roles:       []AdminRole{{Key: SalesRoleKey}},
		Permissions: []string{PermissionSalesOrderRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if _, ok := session.FieldPolicies["sales_order_items.default"]; ok {
		t.Fatalf("sales_order_items field policy must be filtered: %#v", session.FieldPolicies)
	}
	salesOrderPolicies, ok := session.FieldPolicies["sales_orders.default"].(map[string]any)
	if !ok {
		t.Fatalf("sales order field policies missing: %#v", session.FieldPolicies)
	}
	if _, ok := salesOrderPolicies["source_no"]; !ok {
		t.Fatalf("source_no policy missing: %#v", salesOrderPolicies)
	}
	if _, ok := salesOrderPolicies["style_no"]; ok {
		t.Fatalf("unsupported field policy must be filtered: %#v", salesOrderPolicies)
	}
}

func TestCustomerConfigUsecaseEffectiveSessionDoesNotFallbackToRBACWhenLegacyPagesMissing(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	key := customerRevisionKey(in.CustomerKey, in.Revision)
	delete(repo.revisions[key].CompiledSnapshot, "pages")
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	session, err := uc.GetEffectiveSession(ctx, in.CustomerKey, &AdminUser{
		ID:          7,
		Roles:       []AdminRole{{Key: SalesRoleKey}},
		Permissions: []string{PermissionSalesOrderRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if len(session.Pages) != 0 {
		t.Fatalf("legacy active revision without pages must not fallback to RBAC pages, got %#v", session.Pages)
	}
}

func TestCustomerConfigUsecaseRejectsForbiddenPayloadAndRevisionMutation(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CompiledSnapshot["secret"] = "bad"
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("forbidden payload error = %v", err)
	}

	in = validCustomerConfigInput()
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}
	original, err := repo.GetCustomerConfigRevision(ctx, in.CustomerKey, in.Revision)
	if err != nil {
		t.Fatalf("GetCustomerConfigRevision error = %v", err)
	}
	replayed, err := uc.PublishCustomerConfig(ctx, in, 100)
	if err != nil {
		t.Fatalf("same revision replay error = %v", err)
	}
	if replayed.ID != original.ID || replayed.Status != CustomerConfigStatusActive || replayed.PublishedBy == nil || original.PublishedBy == nil || *replayed.PublishedBy != *original.PublishedBy || replayed.PublishedAt == nil || original.PublishedAt == nil || !replayed.PublishedAt.Equal(*original.PublishedAt) {
		t.Fatalf("same revision replay must return original record: original=%#v replayed=%#v", original, replayed)
	}

	changed := validCustomerConfigInput()
	changed.CompiledSnapshot["customer"] = map[string]any{"key": "yoyoosun", "name": "永绅新名称"}
	if _, err := uc.PublishCustomerConfig(ctx, changed, 100); !errors.Is(err, ErrCustomerConfigRevisionImmutable) {
		t.Fatalf("immutable revision error = %v", err)
	}
}

func TestCustomerConfigUsecaseRollbackActivatesTargetRevision(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)

	first := validCustomerConfigInput()
	first.Revision = "2026.06.28.1"
	second := validCustomerConfigInput()
	second.Revision = "2026.06.28.2"
	second.CompiledSnapshot = map[string]any{
		"customer": map[string]any{"key": "yoyoosun", "name": "永绅"},
		"pages":    []any{"permission-center"},
	}

	if _, err := uc.PublishCustomerConfig(ctx, first, 99); err != nil {
		t.Fatalf("PublishCustomerConfig first error = %v", err)
	}
	if _, err := uc.PublishCustomerConfig(ctx, second, 99); err != nil {
		t.Fatalf("PublishCustomerConfig second error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, first.CustomerKey, first.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig first error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, second.CustomerKey, second.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	rolledBack, err := rollbackCustomerConfigForTest(ctx, uc, repo, first.CustomerKey, first.Revision, 99)
	if err != nil {
		t.Fatalf("RollbackCustomerConfig error = %v", err)
	}
	if rolledBack.Revision != first.Revision || rolledBack.Status != CustomerConfigStatusActive {
		t.Fatalf("rolledBack = %#v", rolledBack)
	}
	oldActive, err := uc.repo.GetCustomerConfigRevision(ctx, second.CustomerKey, second.Revision)
	if err != nil {
		t.Fatalf("GetCustomerConfigRevision old active error = %v", err)
	}
	if oldActive.Status != CustomerConfigStatusSuperseded {
		t.Fatalf("old active status = %s", oldActive.Status)
	}
}

func TestCustomerConfigUsecaseFallsBackWhenNoActiveRevision(t *testing.T) {
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())
	admin := &AdminUser{
		ID:          1,
		Roles:       []AdminRole{{Key: AdminRoleKey}},
		Permissions: []string{PermissionSystemUserRead, PermissionSalesOrderRead},
	}
	session, err := uc.GetEffectiveSession(context.Background(), "", admin)
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if session.Source != "builtin_rbac_fallback" {
		t.Fatalf("source = %s", session.Source)
	}
	if session.Customer.Key != DefaultCustomerKey {
		t.Fatalf("customer key = %s", session.Customer.Key)
	}
	if _, err := uc.GetEffectiveSessionRequiringActiveRevision(context.Background(), "yoyoosun", admin); !errors.Is(err, ErrCustomerConfigActiveRevisionRequired) {
		t.Fatalf("strict effective session error = %v, want ErrCustomerConfigActiveRevisionRequired", err)
	}
	fallbackActions, err := uc.GetEffectiveActionEntitlements(context.Background(), "yoyoosun", admin)
	if err != nil || !PermissionSetHasAny(PermissionKeySet(fallbackActions), PermissionSalesOrderRead) {
		t.Fatalf("unfixed runtime fallback actions = %#v, err=%v", fallbackActions, err)
	}
	strictActions, err := uc.GetEffectiveActionEntitlementsRequiringActiveRevision(context.Background(), "yoyoosun", admin)
	if err != nil {
		t.Fatalf("strict action entitlements error = %v", err)
	}
	if len(strictActions) != 0 {
		t.Fatalf("fixed runtime without active revision must expose no business actions, got %#v", strictActions)
	}
}

func TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysIncludesWorkPoolMembership(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.RoleProfiles = append(in.RoleProfiles, RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库"})
	in.WorkPools = append(in.WorkPools, WorkPoolInput{PoolKey: "warehouse", ModuleKey: "inventory", DisplayName: "仓库池"})
	in.WorkPoolMemberships = append(in.WorkPoolMemberships, WorkPoolMembershipInput{
		PoolKey:  "warehouse",
		RoleKey:  WarehouseRoleKey,
		UserID:   7,
		Strategy: "direct_user_pool",
		Enabled:  true,
	})
	in.AccessEntitlements = append(in.AccessEntitlements,
		AccessEntitlementInput{RoleKey: SalesRoleKey, CapabilityKey: PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
		AccessEntitlementInput{RoleKey: SalesRoleKey, CapabilityKey: PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
		AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
		AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
	)
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	roleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(ctx, "yoyoosun", &AdminUser{
		ID:    7,
		Roles: []AdminRole{{Key: SalesRoleKey}},
	})
	if err != nil {
		t.Fatalf("WorkflowVisibleOwnerRoleKeys error = %v", err)
	}
	got := map[string]bool{}
	for _, roleKey := range roleKeys {
		got[roleKey] = true
	}
	if !got[SalesRoleKey] || !got[WarehouseRoleKey] {
		t.Fatalf("expected sales and warehouse visibility, got %#v", roleKeys)
	}
	if got[FinanceRoleKey] {
		t.Fatalf("finance must not be visible without matching role or membership: %#v", roleKeys)
	}

	completeRoleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(ctx, "yoyoosun", &AdminUser{
		ID:    7,
		Roles: []AdminRole{{Key: SalesRoleKey}},
	}, PermissionWorkflowTaskComplete)
	if err != nil {
		t.Fatalf("WorkflowVisibleOwnerRoleKeys complete error = %v", err)
	}
	completeGot := map[string]bool{}
	for _, roleKey := range completeRoleKeys {
		completeGot[roleKey] = true
	}
	if completeGot[WarehouseRoleKey] {
		t.Fatalf("warehouse must not be visible for complete without same-role entitlement: %#v", completeRoleKeys)
	}
}

func TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysRequiresTaskEntitlement(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.RoleProfiles = append(in.RoleProfiles, RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库"})
	in.WorkPools = append(in.WorkPools, WorkPoolInput{PoolKey: "warehouse", ModuleKey: "inventory", DisplayName: "仓库池"})
	in.WorkPoolMemberships = append(in.WorkPoolMemberships, WorkPoolMembershipInput{
		PoolKey:  "warehouse",
		RoleKey:  WarehouseRoleKey,
		UserID:   7,
		Strategy: "direct_user_pool",
		Enabled:  true,
	})
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	roleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(ctx, "yoyoosun", &AdminUser{
		ID:    7,
		Roles: []AdminRole{{Key: SalesRoleKey}},
	}, PermissionWorkflowTaskRead)
	if err != nil {
		t.Fatalf("WorkflowVisibleOwnerRoleKeys error = %v", err)
	}
	got := map[string]bool{}
	for _, roleKey := range roleKeys {
		got[roleKey] = true
	}
	if got[WarehouseRoleKey] {
		t.Fatalf("warehouse must not be visible without workflow task entitlement: %#v", roleKeys)
	}
}

func TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysRequiresMatchingEntitlementScope(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.RoleProfiles = append(in.RoleProfiles, RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库"})
	in.WorkPools = append(in.WorkPools, WorkPoolInput{PoolKey: "warehouse", ModuleKey: "inventory", DisplayName: "仓库池"})
	in.WorkPoolMemberships = append(in.WorkPoolMemberships, WorkPoolMembershipInput{
		PoolKey:  "warehouse",
		RoleKey:  WarehouseRoleKey,
		UserID:   7,
		Strategy: "direct_user_pool",
		Enabled:  true,
	})
	in.AccessEntitlements = append(in.AccessEntitlements,
		AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "other_customer", Enabled: true},
		AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
	)
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	roleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(ctx, "yoyoosun", &AdminUser{
		ID:    7,
		Roles: []AdminRole{{Key: SalesRoleKey}},
	}, PermissionWorkflowTaskRead)
	if err != nil {
		t.Fatalf("WorkflowVisibleOwnerRoleKeys error = %v", err)
	}
	got := map[string]bool{}
	for _, roleKey := range roleKeys {
		got[roleKey] = true
	}
	if got[WarehouseRoleKey] {
		t.Fatalf("warehouse must not be visible when workflow.task.read only matches another customer scope: %#v", roleKeys)
	}
	if got[SalesRoleKey] {
		t.Fatalf("base admin role must also require same-role same-customer workflow entitlement, got %#v", roleKeys)
	}
}

func TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysComposesProfilesEntitlementsAndRevokes(t *testing.T) {
	tests := []struct {
		name             string
		warehouseProfile RoleProfileInput
		warehouseGrant   *AccessEntitlementInput
		wantWarehouse    bool
	}{
		{
			name:             "sales entitlement cannot qualify warehouse membership",
			warehouseProfile: RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库"},
		},
		{
			name:             "matching warehouse profile and entitlement allow membership",
			warehouseProfile: RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库"},
			warehouseGrant:   &AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
			wantWarehouse:    true,
		},
		{
			name:             "disabled warehouse profile denies matching entitlement",
			warehouseProfile: RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库", Disabled: true},
			warehouseGrant:   &AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
		},
		{
			name:             "warehouse profile revoke denies matching entitlement",
			warehouseProfile: RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库", Revokes: []string{PermissionWorkflowTaskComplete}},
			warehouseGrant:   &AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			repo := newMemCustomerConfigRepo()
			uc := NewCustomerConfigUsecase(repo)
			in := validCustomerConfigInput()
			in.RoleProfiles = append(in.RoleProfiles, tt.warehouseProfile)
			in.WorkPools = append(in.WorkPools, WorkPoolInput{PoolKey: "warehouse", ModuleKey: "inventory", DisplayName: "仓库池"})
			in.WorkPoolMemberships = append(in.WorkPoolMemberships, WorkPoolMembershipInput{
				PoolKey:  "warehouse",
				RoleKey:  WarehouseRoleKey,
				UserID:   7,
				Strategy: "direct_user_pool",
				Enabled:  true,
			})
			in.AccessEntitlements = append(in.AccessEntitlements, AccessEntitlementInput{
				RoleKey:       SalesRoleKey,
				CapabilityKey: PermissionWorkflowTaskComplete,
				ScopeType:     "customer",
				ScopeValue:    "yoyoosun",
				Enabled:       true,
			})
			if tt.warehouseGrant != nil {
				in.AccessEntitlements = append(in.AccessEntitlements, *tt.warehouseGrant)
			}
			if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
				t.Fatalf("PublishCustomerConfig error = %v", err)
			}
			if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
				t.Fatalf("ActivateCustomerConfig error = %v", err)
			}

			roleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(ctx, "yoyoosun", &AdminUser{
				ID:    7,
				Roles: []AdminRole{{Key: SalesRoleKey}},
			}, PermissionWorkflowTaskComplete)
			if err != nil {
				t.Fatalf("WorkflowVisibleOwnerRoleKeys error = %v", err)
			}
			got := map[string]bool{}
			for _, roleKey := range roleKeys {
				got[roleKey] = true
			}
			if !got[SalesRoleKey] {
				t.Fatalf("sales base role with matching profile and entitlement must remain eligible: %#v", roleKeys)
			}
			if got[WarehouseRoleKey] != tt.wantWarehouse {
				t.Fatalf("warehouse eligible = %v, want %v; roles=%#v", got[WarehouseRoleKey], tt.wantWarehouse, roleKeys)
			}
		})
	}
}

func TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysFixedCustomerFailsClosed(t *testing.T) {
	admin := &AdminUser{ID: 7, Roles: []AdminRole{{Key: WarehouseRoleKey}}}
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)

	fallbackRoleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(context.Background(), DefaultCustomerKey, admin, PermissionWorkflowTaskRead)
	if err != nil {
		t.Fatalf("demo fallback error = %v", err)
	}
	if len(fallbackRoleKeys) != 1 || fallbackRoleKeys[0] != WarehouseRoleKey {
		t.Fatalf("demo fallback roles = %#v", fallbackRoleKeys)
	}

	strictRoleKeys, err := uc.WorkflowVisibleOwnerRoleKeysRequiringActiveRevision(context.Background(), "yoyoosun", admin, PermissionWorkflowTaskRead)
	if !errors.Is(err, ErrCustomerConfigActiveRevisionRequired) || len(strictRoleKeys) != 0 {
		t.Fatalf("fixed missing revision roles=%#v err=%v", strictRoleKeys, err)
	}

	repoErr := errors.New("role projection repo unavailable")
	repo.activeErr = repoErr
	strictRoleKeys, err = uc.WorkflowVisibleOwnerRoleKeysRequiringActiveRevision(context.Background(), "yoyoosun", admin, PermissionWorkflowTaskRead)
	if !errors.Is(err, repoErr) || len(strictRoleKeys) != 0 {
		t.Fatalf("fixed repo error roles=%#v err=%v", strictRoleKeys, err)
	}
}

func TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysAtStoredRevisionIgnoresNewActiveRevision(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)

	first := validCustomerConfigInput()
	first.Revision = "2026.06.28.r1"
	first.RoleProfiles = append(first.RoleProfiles, RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库"})
	first.AccessEntitlements = append(first.AccessEntitlements, AccessEntitlementInput{
		RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: first.CustomerKey, Enabled: true,
	})
	second := validCustomerConfigInput()
	second.Revision = "2026.06.28.r2"
	second.RoleProfiles = append(second.RoleProfiles, RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库"})

	if _, err := uc.PublishCustomerConfig(ctx, first, 99); err != nil {
		t.Fatalf("publish R1: %v", err)
	}
	if _, err := uc.PublishCustomerConfig(ctx, second, 99); err != nil {
		t.Fatalf("publish R2: %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, first.CustomerKey, first.Revision, 99); err != nil {
		t.Fatalf("activate R1: %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, second.CustomerKey, second.Revision, 99); err != nil {
		t.Fatalf("activate R2: %v", err)
	}

	admin := &AdminUser{ID: 7, Roles: []AdminRole{{Key: WarehouseRoleKey}}}
	activeRoleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(ctx, second.CustomerKey, admin, PermissionWorkflowTaskRead)
	if err != nil {
		t.Fatalf("resolve active R2: %v", err)
	}
	if len(activeRoleKeys) != 0 {
		t.Fatalf("active R2 must not inherit R1 entitlement, got %#v", activeRoleKeys)
	}
	storedRoleKeys, err := uc.WorkflowVisibleOwnerRoleKeysAtRevision(ctx, first.CustomerKey, first.Revision, admin, PermissionWorkflowTaskRead)
	if err != nil {
		t.Fatalf("resolve stored R1: %v", err)
	}
	if len(storedRoleKeys) != 1 || storedRoleKeys[0] != WarehouseRoleKey {
		t.Fatalf("stored R1 responsibility = %#v, want warehouse", storedRoleKeys)
	}
}

func TestCustomerConfigUsecaseAtRevisionAuthorizationRejectsNeverActivatedRevision(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.Revision = "2026.06.28.published-only"
	in.RoleProfiles = append(in.RoleProfiles, RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库"})
	in.WorkPools = append(in.WorkPools, WorkPoolInput{PoolKey: "warehouse", ModuleKey: "inventory", DisplayName: "仓库池"})
	in.WorkPoolMemberships = append(in.WorkPoolMemberships, WorkPoolMembershipInput{PoolKey: "warehouse", RoleKey: WarehouseRoleKey, Enabled: true})
	in.AccessEntitlements = append(in.AccessEntitlements, AccessEntitlementInput{
		RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: in.CustomerKey, Enabled: true,
	})
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("publish: %v", err)
	}
	admin := &AdminUser{ID: 7, Roles: []AdminRole{{Key: WarehouseRoleKey}}}

	for _, status := range []string{CustomerConfigStatusPublished, "preview"} {
		repo.revisions[customerRevisionKey(in.CustomerKey, in.Revision)].Status = status
		roleKeys, err := uc.WorkflowVisibleOwnerRoleKeysAtRevision(ctx, in.CustomerKey, in.Revision, admin, PermissionWorkflowTaskRead)
		if !errors.Is(err, ErrCustomerConfigNotFound) || len(roleKeys) != 0 {
			t.Fatalf("status %s role visibility=%#v err=%v", status, roleKeys, err)
		}
		explanation, err := uc.WorkflowCandidateOwnerRoleKeysAtRevision(ctx, in.CustomerKey, in.Revision, "warehouse", PermissionWorkflowTaskRead)
		if !errors.Is(err, ErrCustomerConfigNotFound) || explanation != nil {
			t.Fatalf("status %s candidate=%#v err=%v", status, explanation, err)
		}
	}
}

func TestCustomerConfigUsecaseWorkflowCandidateOwnerRoleKeysRequiresCapabilityAndScope(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.RoleProfiles = append(in.RoleProfiles, RoleProfileInput{RoleKey: WarehouseRoleKey, DisplayName: "仓库"})
	in.WorkPools = append(in.WorkPools, WorkPoolInput{PoolKey: "warehouse", ModuleKey: "inventory", DisplayName: "仓库池"})
	in.WorkPoolMemberships = append(in.WorkPoolMemberships,
		WorkPoolMembershipInput{PoolKey: "warehouse", RoleKey: WarehouseRoleKey, UserID: 7, Strategy: "direct_user_pool", Enabled: true},
		WorkPoolMembershipInput{PoolKey: "warehouse", RoleKey: FinanceRoleKey, UserID: 0, Strategy: "role_pool", Enabled: true},
	)
	in.AccessEntitlements = append(in.AccessEntitlements,
		AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
		AccessEntitlementInput{RoleKey: FinanceRoleKey, CapabilityKey: PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "other_customer", Enabled: true},
		AccessEntitlementInput{RoleKey: FinanceRoleKey, CapabilityKey: PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
	)
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	explanation, err := uc.WorkflowCandidateOwnerRoleKeys(ctx, "yoyoosun", "warehouse", PermissionWorkflowTaskComplete)
	if err != nil {
		t.Fatalf("WorkflowCandidateOwnerRoleKeys error = %v", err)
	}
	if explanation.Source != "active_customer_config" {
		t.Fatalf("source = %s", explanation.Source)
	}
	if explanation.ConfigRevision != in.Revision {
		t.Fatalf("config revision = %s", explanation.ConfigRevision)
	}
	if len(explanation.MembershipRoleKeys) != 2 || explanation.MembershipRoleKeys[0] != WarehouseRoleKey || explanation.MembershipRoleKeys[1] != FinanceRoleKey {
		t.Fatalf("membership role keys = %#v", explanation.MembershipRoleKeys)
	}
	if len(explanation.EntitledRoleKeys) != 1 || explanation.EntitledRoleKeys[0] != WarehouseRoleKey {
		t.Fatalf("entitled role keys = %#v", explanation.EntitledRoleKeys)
	}
	if len(explanation.CandidateOwnerRoleKeys) != 1 || explanation.CandidateOwnerRoleKeys[0] != WarehouseRoleKey {
		t.Fatalf("candidate owner role keys = %#v", explanation.CandidateOwnerRoleKeys)
	}
}

func TestCustomerConfigUsecaseWorkflowCandidateOwnerRoleKeysNoActiveConfig(t *testing.T) {
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())
	explanation, err := uc.WorkflowCandidateOwnerRoleKeys(context.Background(), "yoyoosun", "warehouse", PermissionWorkflowTaskComplete)
	if err != nil {
		t.Fatalf("WorkflowCandidateOwnerRoleKeys error = %v", err)
	}
	if explanation.Source != "no_active_customer_config" {
		t.Fatalf("source = %s", explanation.Source)
	}
	if len(explanation.CandidateOwnerRoleKeys) != 0 {
		t.Fatalf("candidate owner role keys = %#v", explanation.CandidateOwnerRoleKeys)
	}
}
