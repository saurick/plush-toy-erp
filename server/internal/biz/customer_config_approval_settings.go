package biz

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

const (
	ApprovalSettingsSchemaVersion = "approval-settings/v1"

	ApprovalSettingSalesOrder      = "sales_order"
	ApprovalSettingPurchaseOrder   = "purchase_order"
	ApprovalSettingShipmentFinance = "shipment_finance"

	ApprovalMemberStrategyPrimary    = "primary"
	ApprovalMemberStrategyBackup     = "backup"
	ApprovalMemberStrategyEscalation = "escalation"

	approvalResponsibilityFixedByProcessContract = "approval_responsibility_fixed_by_process_contract"
)

type ApprovalSettingMemberInput struct {
	RoleKey  string
	UserID   int
	Strategy string
	Enabled  bool
}

type ApprovalSettingItemInput struct {
	ApprovalKey string
	Enabled     bool
	Members     []ApprovalSettingMemberInput
}

type ApprovalSettingsRevisionInput struct {
	CustomerKey            string
	Revision               string
	ExpectedActiveRevision string
	ExpectedActiveHash     string
	Items                  []ApprovalSettingItemInput
}

type ApprovalSettingMemberExplanation struct {
	RoleKey  string
	UserID   int
	Strategy string
	Priority int
	Enabled  bool
}

type ApprovalSettingItemExplanation struct {
	ApprovalKey       string
	Label             string
	Domain            string
	PoolKey           string
	Configurable      bool
	Configured        bool
	Enabled           bool
	Members           []ApprovalSettingMemberExplanation
	EffectiveRoleKeys []string
	EffectiveStrategy string
	BlockedReasons    []string
	DomainBoundary    string
	FactBoundary      string
}

type ApprovalSettingsExplanation struct {
	CustomerKey    string
	ConfigRevision string
	ConfigHash     string
	ProductVersion string
	SchemaVersion  string
	Source         string
	Items          []ApprovalSettingItemExplanation
	PublishInput   *CustomerConfigPublishInput
}

type approvalSettingCatalogItem struct {
	Key            string
	Label          string
	Domain         string
	PoolKey        string
	ModuleKey      string
	Configurable   bool
	BlockedReasons []string
	DomainBoundary string
	FactBoundary   string
}

var approvalSettingCatalog = []approvalSettingCatalogItem{
	{
		Key: ApprovalSettingSalesOrder, Label: "销售订单审批", Domain: "销售",
		PoolKey: "approval.sales_order", ModuleKey: "sales_orders", Configurable: true,
		DomainBoundary: "审批通过后仅由 SalesOrderUsecase 激活销售订单",
		FactBoundary:   "不写库存、出货或财务事实",
	},
	{
		Key: ApprovalSettingPurchaseOrder, Label: "采购订单审批", Domain: "采购",
		PoolKey: "approval.purchase_order", ModuleKey: "purchase_orders", Configurable: true,
		DomainBoundary: "审批通过后仅由 PurchaseOrderUsecase 批准采购订单",
		FactBoundary:   "不写入库、库存或应付事实",
	},
	{
		Key: ApprovalSettingShipmentFinance, Label: "出货财务放行", Domain: "财务",
		PoolKey: "approval.shipment_finance", ModuleKey: "shipments", Configurable: true,
		DomainBoundary: "审批通过后仅由 Shipment 领域命令记录财务放行",
		FactBoundary:   "不等于 SHIPPED、库存 OUT、应收、开票或收付款",
	},
	{
		Key: "sales_return", Label: "客户退货审批", Domain: "销售 / 仓库",
		Configurable:   false,
		BlockedReasons: []string{approvalResponsibilityFixedByProcessContract},
		DomainBoundary: "已登记客户退货 ProcessRuntime；老板审批后由仓库责任池办理收货，责任池由流程合同固定",
		FactBoundary:   "批准不等于收货；收货才写退回库存",
	},
	{
		Key: "production_exception", Label: "生产异常决定", Domain: "生产 / 品质",
		Configurable:   false,
		BlockedReasons: []string{approvalResponsibilityFixedByProcessContract},
		DomainBoundary: "已登记生产异常 ProcessRuntime；老板决定与生产执行分离，责任池由流程合同固定",
		FactBoundary:   "批准不执行 SCRAP、超领或 WIP 让步",
	},
	{
		Key: "inventory_adjustment", Label: "库存人工调整审批", Domain: "仓库",
		Configurable:   false,
		BlockedReasons: []string{approvalResponsibilityFixedByProcessContract},
		DomainBoundary: "已登记库存人工调整源单与 ProcessRuntime；老板审批后由仓库责任池显式过账",
		FactBoundary:   "批准不等于过账；只有库存领域命令写库存交易和余额",
	},
	{
		Key: "payment", Label: "付款审批", Domain: "财务",
		Configurable:   false,
		BlockedReasons: []string{approvalResponsibilityFixedByProcessContract},
		DomainBoundary: "已登记收付款单与 ProcessRuntime；老板审批后由财务责任池显式过账与核销",
		FactBoundary:   "批准不等于过账；只有财务领域命令写付款、核销或冲正事实",
	},
	{
		Key: "pmc_engineering", Label: "PMC / 工程审批", Domain: "PMC / 工程",
		Configurable:   false,
		BlockedReasons: []string{"formal_approval_gate_missing"},
		DomainBoundary: "BOM、计划和风险动作尚无正式人工审批门禁",
		FactBoundary:   "不能因岗位名称创建虚假审批事实",
	},
}

func approvalSettingCatalogByKey(key string) (approvalSettingCatalogItem, bool) {
	key = strings.TrimSpace(key)
	for _, item := range approvalSettingCatalog {
		if item.Key == key {
			return item, true
		}
	}
	return approvalSettingCatalogItem{}, false
}

func approvalStrategyPriority(strategy string) (int, bool) {
	switch strings.TrimSpace(strategy) {
	case ApprovalMemberStrategyPrimary:
		return 100, true
	case ApprovalMemberStrategyBackup:
		return 200, true
	case ApprovalMemberStrategyEscalation:
		return 300, true
	default:
		return 0, false
	}
}

func approvalSettingPoolKeys() map[string]struct{} {
	out := map[string]struct{}{}
	for _, item := range approvalSettingCatalog {
		if item.Configurable {
			out[item.PoolKey] = struct{}{}
		}
	}
	return out
}

func IsApprovalSettingsPoolKey(poolKey string) bool {
	_, ok := approvalSettingPoolKeys()[strings.TrimSpace(poolKey)]
	return ok
}

func (uc *CustomerConfigUsecase) GetApprovalSettings(ctx context.Context, customerKey string) (*ApprovalSettingsExplanation, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		return nil, err
	}
	memberships, err := uc.repo.ListWorkPoolMembershipsByPools(ctx, customerKey, active.Revision, approvalSettingPoolKeyList())
	if err != nil {
		return nil, err
	}
	return uc.explainApprovalSettingsAtRevision(ctx, active, memberships, nil)
}

func (uc *CustomerConfigUsecase) PreviewApprovalSettingsRevision(ctx context.Context, in ApprovalSettingsRevisionInput) (*ApprovalSettingsExplanation, error) {
	publishInput, active, err := uc.buildApprovalSettingsRevision(ctx, in)
	if err != nil {
		return nil, err
	}
	if _, err := uc.ValidateCustomerConfig(ctx, publishInput); err != nil {
		return nil, err
	}
	explanation, err := uc.explainApprovalSettingsAtRevision(ctx, &CustomerConfigRevision{
		CustomerKey:      publishInput.CustomerKey,
		Revision:         publishInput.Revision,
		ProductVersion:   publishInput.ProductVersion,
		CompiledSnapshot: publishInput.CompiledSnapshot,
		Status:           CustomerConfigStatusPublished,
	}, publishInput.WorkPoolMemberships, &publishInput)
	if err != nil {
		return nil, err
	}
	explanation.Source = "approval_settings_preview"
	explanation.ConfigHash = ""
	explanation.PublishInput = &publishInput
	_ = active
	return explanation, nil
}

func (uc *CustomerConfigUsecase) ExplainApprovalSettingsPublishInput(
	ctx context.Context,
	in CustomerConfigPublishInput,
) (*ApprovalSettingsExplanation, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeCustomerConfigPublishInput(in)
	if err != nil {
		return nil, err
	}
	explanation, err := uc.explainApprovalSettingsAtRevision(ctx, &CustomerConfigRevision{
		CustomerKey:      normalized.CustomerKey,
		Revision:         normalized.Revision,
		ProductVersion:   normalized.ProductVersion,
		CompiledSnapshot: normalized.CompiledSnapshot,
		Status:           CustomerConfigStatusPublished,
	}, normalized.WorkPoolMemberships, &normalized)
	if err != nil {
		return nil, err
	}
	explanation.Source = "customer_config_publish_preview"
	explanation.PublishInput = &normalized
	return explanation, nil
}

func (uc *CustomerConfigUsecase) PublishApprovalSettingsRevision(ctx context.Context, in ApprovalSettingsRevisionInput, actorID int) (*CustomerConfigRevision, error) {
	preview, err := uc.PreviewApprovalSettingsRevision(ctx, in)
	if err != nil {
		return nil, err
	}
	for _, item := range preview.Items {
		if item.Configurable && item.Enabled && len(item.BlockedReasons) > 0 {
			return nil, ErrCustomerConfigTransitionBlocked
		}
	}
	if preview.PublishInput == nil {
		return nil, ErrBadParam
	}
	return uc.PublishCustomerConfig(ctx, *preview.PublishInput, actorID)
}

func (uc *CustomerConfigUsecase) buildApprovalSettingsRevision(ctx context.Context, in ApprovalSettingsRevisionInput) (CustomerConfigPublishInput, *CustomerConfigRevision, error) {
	if uc == nil || uc.repo == nil {
		return CustomerConfigPublishInput{}, nil, ErrBadParam
	}
	in.CustomerKey = NormalizeCustomerKey(in.CustomerKey)
	if in.CustomerKey == "" {
		in.CustomerKey = DefaultCustomerKey
	}
	in.Revision = strings.TrimSpace(in.Revision)
	in.ExpectedActiveRevision = strings.TrimSpace(in.ExpectedActiveRevision)
	in.ExpectedActiveHash = strings.TrimSpace(in.ExpectedActiveHash)
	if in.Revision == "" || in.ExpectedActiveRevision == "" || in.ExpectedActiveHash == "" {
		return CustomerConfigPublishInput{}, nil, ErrBadParam
	}
	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, in.CustomerKey)
	if err != nil {
		return CustomerConfigPublishInput{}, nil, err
	}
	if active.Revision != in.ExpectedActiveRevision || active.ConfigHash != in.ExpectedActiveHash {
		return CustomerConfigPublishInput{}, nil, ErrCustomerConfigTransitionBlocked
	}
	normalizedItems, err := normalizeApprovalSettingItems(in.Items)
	if err != nil {
		return CustomerConfigPublishInput{}, nil, err
	}
	modules, err := uc.repo.ListDeploymentModuleStates(ctx, in.CustomerKey, active.Revision)
	if err != nil {
		return CustomerConfigPublishInput{}, nil, err
	}
	profiles, err := uc.repo.ListRoleProfiles(ctx, in.CustomerKey, active.Revision)
	if err != nil {
		return CustomerConfigPublishInput{}, nil, err
	}
	roleKeys := make([]string, 0, len(profiles))
	for _, profile := range profiles {
		roleKeys = append(roleKeys, profile.RoleKey)
	}
	entitlements, err := uc.repo.ListAccessEntitlements(ctx, in.CustomerKey, active.Revision, roleKeys)
	if err != nil {
		return CustomerConfigPublishInput{}, nil, err
	}
	pools, err := uc.repo.ListWorkPools(ctx, in.CustomerKey, active.Revision)
	if err != nil {
		return CustomerConfigPublishInput{}, nil, err
	}
	poolKeys := make([]string, 0, len(pools))
	for _, pool := range pools {
		poolKeys = append(poolKeys, pool.PoolKey)
	}
	memberships, err := uc.repo.ListWorkPoolMembershipsByPools(ctx, in.CustomerKey, active.Revision, poolKeys)
	if err != nil {
		return CustomerConfigPublishInput{}, nil, err
	}
	snapshot, err := cloneApprovalSettingsSnapshot(active.CompiledSnapshot)
	if err != nil {
		return CustomerConfigPublishInput{}, nil, err
	}
	delete(snapshot, "processDefinitions")
	snapshot["approval_settings"] = approvalSettingsSnapshot(normalizedItems)

	managedPools := approvalSettingPoolKeys()
	nextPools := make([]WorkPoolInput, 0, len(pools)+len(normalizedItems))
	for _, pool := range pools {
		if _, managed := managedPools[pool.PoolKey]; !managed {
			nextPools = append(nextPools, pool)
		}
	}
	nextMemberships := make([]WorkPoolMembershipInput, 0, len(memberships)+16)
	for _, membership := range memberships {
		if _, managed := managedPools[membership.PoolKey]; !managed {
			nextMemberships = append(nextMemberships, membership)
		}
	}
	requiredApprovalRoles := map[string]struct{}{}
	for _, item := range normalizedItems {
		catalog, _ := approvalSettingCatalogByKey(item.ApprovalKey)
		nextPools = append(nextPools, WorkPoolInput{
			PoolKey: catalog.PoolKey, ModuleKey: catalog.ModuleKey,
			DisplayName: catalog.Label, Description: "固定审批事项责任池；成员按主办、备用、升级顺序解析。",
		})
		for _, member := range item.Members {
			priority, _ := approvalStrategyPriority(member.Strategy)
			nextMemberships = append(nextMemberships, WorkPoolMembershipInput{
				PoolKey: catalog.PoolKey, RoleKey: member.RoleKey, UserID: member.UserID,
				Strategy: member.Strategy, Priority: priority, Enabled: item.Enabled && member.Enabled,
			})
			if member.Enabled {
				requiredApprovalRoles[member.RoleKey] = struct{}{}
			}
		}
	}
	entitlements = ensureApprovalEntitlements(entitlements, requiredApprovalRoles, in.CustomerKey)
	return CustomerConfigPublishInput{
		CustomerKey: in.CustomerKey, Revision: in.Revision, ProductVersion: active.ProductVersion,
		CompiledSnapshot: snapshot, ModuleStates: modules, RoleProfiles: profiles,
		AccessEntitlements: entitlements, WorkPools: nextPools, WorkPoolMemberships: nextMemberships,
	}, active, nil
}

func normalizeApprovalSettingItems(items []ApprovalSettingItemInput) ([]ApprovalSettingItemInput, error) {
	if len(items) == 0 {
		return nil, ErrBadParam
	}
	byKey := map[string]ApprovalSettingItemInput{}
	for _, raw := range items {
		raw.ApprovalKey = strings.TrimSpace(raw.ApprovalKey)
		catalog, ok := approvalSettingCatalogByKey(raw.ApprovalKey)
		if !ok || !catalog.Configurable {
			return nil, fmt.Errorf("%w: approval item %s is not configurable", ErrBadParam, raw.ApprovalKey)
		}
		if _, duplicate := byKey[raw.ApprovalKey]; duplicate {
			return nil, ErrBadParam
		}
		seen := map[string]struct{}{}
		strategySeen := map[string]struct{}{}
		hasEnabledMember := false
		normalizedMembers := make([]ApprovalSettingMemberInput, 0, len(raw.Members))
		for _, member := range raw.Members {
			member.RoleKey = NormalizeRoleKey(member.RoleKey)
			member.Strategy = strings.TrimSpace(member.Strategy)
			if member.RoleKey == "" || member.UserID < 0 {
				return nil, ErrBadParam
			}
			if _, ok := approvalStrategyPriority(member.Strategy); !ok {
				return nil, ErrBadParam
			}
			if IsSystemManagedRole(AdminRole{Key: member.RoleKey, Builtin: true}) || member.RoleKey == DebugOperatorRoleKey {
				return nil, ErrPrivilegedRoleAssignmentForbidden
			}
			if !builtinRoleHasPermission(member.RoleKey, PermissionWorkflowTaskApprove) {
				return nil, fmt.Errorf("%w: role %s cannot approve workflow tasks", ErrBadParam, member.RoleKey)
			}
			identity := fmt.Sprintf("%s:%d", member.RoleKey, member.UserID)
			if _, duplicate := seen[identity]; duplicate {
				return nil, ErrBadParam
			}
			seen[identity] = struct{}{}
			if _, duplicate := strategySeen[member.Strategy]; duplicate {
				return nil, fmt.Errorf("%w: approval strategy %s has multiple members", ErrBadParam, member.Strategy)
			}
			strategySeen[member.Strategy] = struct{}{}
			hasEnabledMember = hasEnabledMember || member.Enabled
			normalizedMembers = append(normalizedMembers, member)
		}
		if raw.Enabled && !hasEnabledMember {
			return nil, fmt.Errorf("%w: enabled approval item %s has no enabled member", ErrBadParam, raw.ApprovalKey)
		}
		sort.Slice(normalizedMembers, func(i, j int) bool {
			pi, _ := approvalStrategyPriority(normalizedMembers[i].Strategy)
			pj, _ := approvalStrategyPriority(normalizedMembers[j].Strategy)
			if pi != pj {
				return pi < pj
			}
			if normalizedMembers[i].RoleKey != normalizedMembers[j].RoleKey {
				return normalizedMembers[i].RoleKey < normalizedMembers[j].RoleKey
			}
			return normalizedMembers[i].UserID < normalizedMembers[j].UserID
		})
		raw.Members = normalizedMembers
		byKey[raw.ApprovalKey] = raw
	}
	out := make([]ApprovalSettingItemInput, 0, len(byKey))
	for _, catalog := range approvalSettingCatalog {
		if !catalog.Configurable {
			continue
		}
		item, ok := byKey[catalog.Key]
		if !ok {
			return nil, fmt.Errorf("%w: approval item %s is required", ErrBadParam, catalog.Key)
		}
		out = append(out, item)
	}
	return out, nil
}

func validateApprovalSettingsPublishInput(in CustomerConfigPublishInput) error {
	rawSnapshot, hasSnapshot := in.CompiledSnapshot["approval_settings"]
	hasManagedPool := false
	poolsByKey := map[string]WorkPoolInput{}
	for _, pool := range in.WorkPools {
		poolsByKey[pool.PoolKey] = pool
		if IsApprovalSettingsPoolKey(pool.PoolKey) {
			hasManagedPool = true
		}
	}
	hasManagedMembership := false
	for _, membership := range in.WorkPoolMemberships {
		if IsApprovalSettingsPoolKey(membership.PoolKey) {
			hasManagedMembership = true
			break
		}
	}
	if !hasSnapshot && !hasManagedPool && !hasManagedMembership {
		return nil
	}
	snapshot, ok := rawSnapshot.(map[string]any)
	if !ok || strings.TrimSpace(getStringFromAnyMap(snapshot, "schema_version")) != ApprovalSettingsSchemaVersion {
		return fmt.Errorf("%w: approval settings snapshot is invalid", ErrBadParam)
	}
	enabledByKey := map[string]bool{}
	for _, rawItem := range anyListFromMap(snapshot, "items") {
		item, ok := rawItem.(map[string]any)
		if !ok {
			return fmt.Errorf("%w: approval settings item is invalid", ErrBadParam)
		}
		key := strings.TrimSpace(getStringFromAnyMap(item, "approval_key"))
		if key == "" {
			return fmt.Errorf("%w: approval settings key is required", ErrBadParam)
		}
		if _, duplicate := enabledByKey[key]; duplicate {
			return fmt.Errorf("%w: duplicate approval settings item %s", ErrBadParam, key)
		}
		enabled, ok := item["enabled"].(bool)
		if !ok {
			return fmt.Errorf("%w: approval settings item %s is missing enabled state", ErrBadParam, key)
		}
		enabledByKey[key] = enabled
	}
	items := make([]ApprovalSettingItemInput, 0, len(enabledByKey))
	for _, catalog := range approvalSettingCatalog {
		if !catalog.Configurable {
			continue
		}
		enabled, exists := enabledByKey[catalog.Key]
		if !exists {
			return fmt.Errorf("%w: approval item %s is required", ErrBadParam, catalog.Key)
		}
		pool, exists := poolsByKey[catalog.PoolKey]
		if !exists && enabled {
			return fmt.Errorf("%w: approval pool %s is invalid", ErrBadParam, catalog.PoolKey)
		}
		if exists && strings.TrimSpace(pool.ModuleKey) != catalog.ModuleKey {
			return fmt.Errorf("%w: approval pool %s is invalid", ErrBadParam, catalog.PoolKey)
		}
		item := ApprovalSettingItemInput{ApprovalKey: catalog.Key, Enabled: enabled}
		if !exists {
			items = append(items, item)
			continue
		}
		for _, membership := range in.WorkPoolMemberships {
			if membership.PoolKey != catalog.PoolKey {
				continue
			}
			expectedPriority, validStrategy := approvalStrategyPriority(membership.Strategy)
			if !validStrategy || membership.Priority != expectedPriority {
				return fmt.Errorf("%w: approval pool %s has invalid responsibility priority", ErrBadParam, catalog.PoolKey)
			}
			item.Members = append(item.Members, ApprovalSettingMemberInput{
				RoleKey:  membership.RoleKey,
				UserID:   membership.UserID,
				Strategy: membership.Strategy,
				Enabled:  membership.Enabled,
			})
		}
		items = append(items, item)
	}
	normalized, err := normalizeApprovalSettingItems(items)
	if err != nil {
		return err
	}
	for _, item := range normalized {
		if !item.Enabled {
			continue
		}
		for _, member := range item.Members {
			if !member.Enabled {
				continue
			}
			entitled := false
			for _, entitlement := range in.AccessEntitlements {
				if entitlement.Enabled &&
					NormalizeRoleKey(entitlement.RoleKey) == member.RoleKey &&
					entitlement.CapabilityKey == PermissionWorkflowTaskApprove &&
					workflowEntitlementScopeMatchesExactCustomer(entitlement, in.CustomerKey) {
					entitled = true
					break
				}
			}
			if !entitled {
				return fmt.Errorf("%w: approval role %s is not entitled", ErrBadParam, member.RoleKey)
			}
		}
	}
	return nil
}

func ensureApprovalEntitlements(items []AccessEntitlementInput, roles map[string]struct{}, customerKey string) []AccessEntitlementInput {
	out := append([]AccessEntitlementInput(nil), items...)
	for roleKey := range roles {
		found := false
		for index := range out {
			item := &out[index]
			if NormalizeRoleKey(item.RoleKey) == roleKey &&
				item.CapabilityKey == PermissionWorkflowTaskApprove &&
				workflowEntitlementScopeMatchesExactCustomer(*item, customerKey) {
				item.Enabled = true
				found = true
			}
		}
		if !found {
			out = append(out, AccessEntitlementInput{
				RoleKey: roleKey, CapabilityKey: PermissionWorkflowTaskApprove,
				ScopeType: "customer", ScopeValue: customerKey, Constraints: map[string]any{}, Enabled: true,
			})
		}
	}
	return out
}

func cloneApprovalSettingsSnapshot(snapshot map[string]any) (map[string]any, error) {
	payload, err := json.Marshal(snapshot)
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	if err := json.Unmarshal(payload, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func approvalSettingsSnapshot(items []ApprovalSettingItemInput) map[string]any {
	rawItems := make([]any, 0, len(items))
	for _, item := range items {
		rawItems = append(rawItems, map[string]any{
			"approval_key": item.ApprovalKey,
			"enabled":      item.Enabled,
		})
	}
	return map[string]any{"schema_version": ApprovalSettingsSchemaVersion, "items": rawItems}
}

func approvalSettingPoolKeyList() []string {
	out := []string{}
	for key := range approvalSettingPoolKeys() {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

func approvalSettingsEnabledMap(snapshot map[string]any) map[string]bool {
	out := map[string]bool{}
	raw, _ := snapshot["approval_settings"].(map[string]any)
	for _, item := range anyListFromMap(raw, "items") {
		value, ok := item.(map[string]any)
		if !ok {
			continue
		}
		key := getStringFromAnyMap(value, "approval_key")
		enabled, _ := value["enabled"].(bool)
		out[key] = enabled
	}
	return out
}

func (uc *CustomerConfigUsecase) explainApprovalSettingsAtRevision(
	ctx context.Context,
	revision *CustomerConfigRevision,
	memberships []WorkPoolMembershipInput,
	preview *CustomerConfigPublishInput,
) (*ApprovalSettingsExplanation, error) {
	if revision == nil {
		return nil, ErrBadParam
	}
	enabled := approvalSettingsEnabledMap(revision.CompiledSnapshot)
	out := &ApprovalSettingsExplanation{
		CustomerKey: revision.CustomerKey, ConfigRevision: revision.Revision,
		ConfigHash: revision.ConfigHash, ProductVersion: revision.ProductVersion,
		SchemaVersion: ApprovalSettingsSchemaVersion, Source: "active_customer_config",
	}
	for _, catalog := range approvalSettingCatalog {
		item := ApprovalSettingItemExplanation{
			ApprovalKey: catalog.Key, Label: catalog.Label, Domain: catalog.Domain,
			PoolKey: catalog.PoolKey, Configurable: catalog.Configurable,
			DomainBoundary: catalog.DomainBoundary, FactBoundary: catalog.FactBoundary,
			BlockedReasons: append([]string(nil), catalog.BlockedReasons...),
		}
		if catalog.Configurable {
			item.Enabled, item.Configured = enabled[catalog.Key]
			if !item.Configured {
				item.BlockedReasons = append(item.BlockedReasons, "approval_settings_not_published")
			}
			for _, membership := range memberships {
				if membership.PoolKey != catalog.PoolKey {
					continue
				}
				item.Members = append(item.Members, ApprovalSettingMemberExplanation{
					RoleKey: membership.RoleKey, UserID: membership.UserID, Strategy: membership.Strategy,
					Priority: membership.Priority, Enabled: membership.Enabled,
				})
			}
			if preview != nil {
				item.EffectiveRoleKeys, item.EffectiveStrategy = previewApprovalCandidates(
					preview.RoleProfiles,
					preview.AccessEntitlements,
					memberships,
					catalog.PoolKey,
					revision.CustomerKey,
				)
			} else {
				explanation, err := uc.workflowCandidateOwnerRoleKeysAtRevision(
					ctx, revision.CustomerKey, revision.Revision, catalog.PoolKey,
					"approval_settings_revision", PermissionWorkflowTaskApprove,
				)
				if err != nil {
					return nil, err
				}
				item.EffectiveRoleKeys = explanation.CandidateOwnerRoleKeys
				item.EffectiveStrategy = explanation.SelectedStrategy
			}
			if item.Configured && !item.Enabled {
				item.BlockedReasons = append(item.BlockedReasons, "approval_disabled")
			}
			if item.Enabled && len(item.EffectiveRoleKeys) == 0 {
				item.BlockedReasons = append(item.BlockedReasons, "no_eligible_approver")
			}
		}
		item.BlockedReasons = normalizeStringList(item.BlockedReasons)
		out.Items = append(out.Items, item)
	}
	return out, nil
}

func previewApprovalCandidates(
	profiles []RoleProfileInput,
	entitlements []AccessEntitlementInput,
	memberships []WorkPoolMembershipInput,
	poolKey, customerKey string,
) ([]string, string) {
	rolePriorities := map[string]int{}
	roleStrategies := map[string]string{}
	for _, membership := range memberships {
		if !membership.Enabled || membership.PoolKey != poolKey {
			continue
		}
		roleKey := NormalizeRoleKey(membership.RoleKey)
		if roleKey == "" {
			continue
		}
		priority := membership.Priority
		if priority <= 0 {
			priority = 100
		}
		if current, exists := rolePriorities[roleKey]; !exists || priority < current {
			rolePriorities[roleKey] = priority
			roleStrategies[roleKey] = membership.Strategy
		}
	}
	roleKeys := make([]string, 0, len(rolePriorities))
	for roleKey := range rolePriorities {
		roleKeys = append(roleKeys, roleKey)
	}
	roleKeys = enabledCustomerRoleKeys(roleKeys, profiles)
	eligible := workflowEligibleRoleKeysWithCapabilities(
		roleKeys, profiles, entitlements, []string{PermissionWorkflowTaskApprove}, customerKey,
	)
	selectedPriority := 0
	selected := []string{}
	for _, roleKey := range roleKeys {
		if _, ok := eligible[roleKey]; !ok {
			continue
		}
		priority := rolePriorities[roleKey]
		if selectedPriority == 0 || priority < selectedPriority {
			selectedPriority = priority
			selected = []string{roleKey}
		} else if priority == selectedPriority {
			selected = append(selected, roleKey)
		}
	}
	selected = NormalizeAdminRoleKeys(selected)
	strategy := ""
	for _, roleKey := range selected {
		if strategy == "" {
			strategy = roleStrategies[roleKey]
		} else if strategy != roleStrategies[roleKey] {
			strategy = "mixed"
		}
	}
	return selected, strategy
}
