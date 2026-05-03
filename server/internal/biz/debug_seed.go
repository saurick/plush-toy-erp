package biz

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	ErrDebugSeedDisabled              = errors.New("debug seed disabled")
	ErrDebugCleanupDisabled           = errors.New("debug cleanup disabled")
	ErrDebugBusinessDataClearDisabled = errors.New("debug business data clear disabled")
	ErrDebugScenarioNotFound          = errors.New("debug scenario not found")
	ErrDebugRunIDRequired             = errors.New("debug run id required")
	ErrDebugCleanupScopeInvalid       = errors.New("debug cleanup scope invalid")
	ErrDebugPayloadMarkerMissing      = errors.New("debug payload marker missing")
)

const (
	DebugDefaultCleanupScope = "debug_run"
	debugDocumentPrefix      = "DBG"
	debugSeedVersion         = "business-chain-v1"
)

var debugRunIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{6,64}$`)

type DebugSafetyConfig struct {
	Environment    string
	SeedEnabled    bool
	CleanupEnabled bool
	CleanupScope   string
}

type DebugCapabilities struct {
	Environment                     string
	SeedEnabled                     bool
	SeedAllowed                     bool
	SeedDisabledReason              string
	CleanupEnabled                  bool
	CleanupAllowed                  bool
	CleanupDisabledReason           string
	BusinessDataClearEnabled        bool
	BusinessDataClearAllowed        bool
	BusinessDataClearDisabledReason string
	CleanupScope                    string
	SupportedScenarios              []DebugScenarioSummary
}

type DebugScenarioSummary struct {
	Key             string
	Title           string
	ScenarioCode    string
	CoverageStatus  string
	Partial         bool
	Warnings        []string
	NextCheckpoints []DebugCheckpoint
}

type DebugCheckpoint struct {
	Label  string
	Path   string
	Query  string
	Reason string
}

type DebugBusinessChainSeedInput struct {
	ScenarioKey string
	DebugRunID  string
}

type DebugBusinessChainSeedResult struct {
	ScenarioKey     string
	DebugRunID      string
	CoverageStatus  string
	Partial         bool
	CreatedRecords  []DebugCreatedRecord
	CreatedTasks    []DebugCreatedTask
	NextCheckpoints []DebugCheckpoint
	CleanupToken    string
	Warnings        []string
}

type DebugCreatedRecord struct {
	ID                int
	ModuleKey         string
	DocumentNo        string
	Title             string
	BusinessStatusKey string
	OwnerRoleKey      string
}

type DebugCreatedTask struct {
	ID                int
	TaskCode          string
	TaskGroup         string
	TaskName          string
	SourceType        string
	SourceID          int
	SourceNo          string
	BusinessStatusKey string
	TaskStatusKey     string
	OwnerRoleKey      string
}

type DebugBusinessChainCleanupInput struct {
	DebugRunID  string
	ScenarioKey string
	DryRun      bool
	Force       bool
}

type DebugBusinessChainCleanupResult struct {
	DebugRunID            string
	ScenarioKey           string
	DryRun                bool
	MatchedRecords        []DebugMatchedRecord
	MatchedTasks          []DebugMatchedTask
	MatchedBusinessStates []DebugMatchedBusinessState
	ArchivedRecords       []DebugMatchedRecord
	DeletedTasks          []DebugMatchedTask
	DeletedBusinessStates int
	DeletedTaskEvents     int
	SkippedItems          []DebugCleanupSkippedItem
	Warnings              []string
}

type DebugBusinessDataClearResult struct {
	DeletedCounts     map[string]int
	DeletedTotal      int
	ClearedTableNames []string
	Warnings          []string
}

type DebugMatchedRecord struct {
	ID         int
	ModuleKey  string
	DocumentNo string
	Title      string
}

type DebugMatchedTask struct {
	ID        int
	TaskCode  string
	TaskGroup string
	TaskName  string
	SourceNo  string
}

type DebugMatchedBusinessState struct {
	ID                int
	SourceType        string
	SourceID          int
	SourceNo          string
	BusinessStatusKey string
}

type DebugCleanupSkippedItem struct {
	Type   string
	ID     int
	Reason string
}

type DebugSeedPlan struct {
	ScenarioKey     string
	ScenarioCode    string
	DebugRunID      string
	CoverageStatus  string
	Partial         bool
	CleanupToken    string
	Warnings        []string
	Records         []DebugRecordPlan
	Tasks           []DebugTaskPlan
	BusinessStates  []DebugBusinessStatePlan
	NextCheckpoints []DebugCheckpoint
}

type DebugRecordPlan struct {
	Ref               string
	ModuleKey         string
	DocumentNo        string
	Title             string
	BusinessStatusKey string
	OwnerRoleKey      string
	SourceNo          *string
	CustomerName      *string
	SupplierName      *string
	StyleNo           *string
	ProductNo         *string
	ProductName       *string
	MaterialName      *string
	WarehouseLocation *string
	Quantity          *float64
	Unit              *string
	Amount            *float64
	DocumentDate      *string
	DueDate           *string
	Payload           map[string]any
	Items             []*BusinessRecordItemMutation
}

type DebugTaskPlan struct {
	RecordRef         string
	TaskCode          string
	TaskGroup         string
	TaskName          string
	BusinessStatusKey string
	TaskStatusKey     string
	OwnerRoleKey      string
	Priority          int16
	DueAt             *time.Time
	BlockedReason     *string
	Payload           map[string]any
}

type DebugBusinessStatePlan struct {
	RecordRef         string
	BusinessStatusKey string
	OwnerRoleKey      string
	BlockedReason     *string
	Payload           map[string]any
}

type DebugRepo interface {
	SeedBusinessChainDebugData(ctx context.Context, plan DebugSeedPlan, actorID int) (*DebugBusinessChainSeedResult, error)
	CleanupBusinessChainDebugData(ctx context.Context, in DebugBusinessChainCleanupInput) (*DebugBusinessChainCleanupResult, error)
	ClearBusinessData(ctx context.Context) (*DebugBusinessDataClearResult, error)
}

type DebugUsecase struct {
	repo   DebugRepo
	config DebugSafetyConfig
	now    func() time.Time
}

func NewDebugUsecase(repo DebugRepo, config DebugSafetyConfig) *DebugUsecase {
	return &DebugUsecase{
		repo:   repo,
		config: NormalizeDebugSafetyConfig(config),
		now:    time.Now,
	}
}

func NormalizeDebugSafetyConfig(config DebugSafetyConfig) DebugSafetyConfig {
	config.Environment = normalizeDebugEnvironment(config.Environment)
	config.CleanupScope = strings.TrimSpace(config.CleanupScope)
	if config.CleanupScope == "" {
		config.CleanupScope = DebugDefaultCleanupScope
	}
	return config
}

func (uc *DebugUsecase) Capabilities() DebugCapabilities {
	config := DebugSafetyConfig{}
	if uc != nil {
		config = uc.config
	}
	config = NormalizeDebugSafetyConfig(config)
	return DebugCapabilities{
		Environment:                     config.Environment,
		SeedEnabled:                     config.SeedEnabled,
		SeedAllowed:                     debugSeedAllowed(config),
		SeedDisabledReason:              debugSeedDisabledReason(config),
		CleanupEnabled:                  config.CleanupEnabled,
		CleanupAllowed:                  debugCleanupAllowed(config),
		CleanupDisabledReason:           debugCleanupDisabledReason(config),
		BusinessDataClearEnabled:        config.CleanupEnabled,
		BusinessDataClearAllowed:        debugBusinessDataClearAllowed(config),
		BusinessDataClearDisabledReason: debugBusinessDataClearDisabledReason(config),
		CleanupScope:                    config.CleanupScope,
		SupportedScenarios:              ListDebugScenarioSummaries(),
	}
}

func (uc *DebugUsecase) SeedBusinessChainScenario(ctx context.Context, in DebugBusinessChainSeedInput, actorID int) (*DebugBusinessChainSeedResult, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	config := NormalizeDebugSafetyConfig(uc.config)
	if !debugSeedAllowed(config) {
		return nil, ErrDebugSeedDisabled
	}

	scenario, ok := debugBusinessChainScenarios[strings.TrimSpace(in.ScenarioKey)]
	if !ok {
		return nil, ErrDebugScenarioNotFound
	}
	debugRunID := strings.TrimSpace(in.DebugRunID)
	if debugRunID == "" {
		debugRunID = generateDebugRunID(uc.now)
	}
	if !debugRunIDPattern.MatchString(debugRunID) {
		return nil, ErrBadParam
	}

	plan := scenario.buildPlan(debugRunID, uc.now())
	return uc.repo.SeedBusinessChainDebugData(ctx, plan, actorID)
}

func (uc *DebugUsecase) CleanupBusinessChainScenario(ctx context.Context, in DebugBusinessChainCleanupInput) (*DebugBusinessChainCleanupResult, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	config := NormalizeDebugSafetyConfig(uc.config)
	if !debugCleanupAllowed(config) {
		return nil, ErrDebugCleanupDisabled
	}
	if config.CleanupScope != DebugDefaultCleanupScope {
		return nil, ErrDebugCleanupScopeInvalid
	}

	in.DebugRunID = strings.TrimSpace(in.DebugRunID)
	in.ScenarioKey = strings.TrimSpace(in.ScenarioKey)
	if in.DebugRunID == "" {
		return nil, ErrDebugRunIDRequired
	}
	if !debugRunIDPattern.MatchString(in.DebugRunID) {
		return nil, ErrBadParam
	}
	if in.ScenarioKey != "" {
		if _, ok := debugBusinessChainScenarios[in.ScenarioKey]; !ok {
			return nil, ErrDebugScenarioNotFound
		}
	}
	return uc.repo.CleanupBusinessChainDebugData(ctx, in)
}

func (uc *DebugUsecase) ClearBusinessData(ctx context.Context) (*DebugBusinessDataClearResult, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	config := NormalizeDebugSafetyConfig(uc.config)
	if !debugBusinessDataClearAllowed(config) {
		return nil, ErrDebugBusinessDataClearDisabled
	}
	return uc.repo.ClearBusinessData(ctx)
}

func ListDebugScenarioSummaries() []DebugScenarioSummary {
	out := make([]DebugScenarioSummary, 0, len(debugBusinessChainScenarioOrder))
	for _, key := range debugBusinessChainScenarioOrder {
		scenario := debugBusinessChainScenarios[key]
		out = append(out, scenario.summary())
	}
	return out
}

func IsDebugPayloadForRun(payload map[string]any, debugRunID string, scenarioKey string) bool {
	if !debugPayloadBool(payload, "debug") || !debugPayloadBool(payload, "created_by_debug") {
		return false
	}
	if debugPayloadString(payload, "debug_run_id") != strings.TrimSpace(debugRunID) {
		return false
	}
	if scenarioKey != "" && debugPayloadString(payload, "scenario_key") != strings.TrimSpace(scenarioKey) {
		return false
	}
	return true
}

func DebugDocumentPrefix(debugRunID string, scenarioKey string) (string, error) {
	debugRunID = strings.TrimSpace(debugRunID)
	if !debugRunIDPattern.MatchString(debugRunID) {
		return "", ErrBadParam
	}
	prefix := fmt.Sprintf("%s-%s-", debugDocumentPrefix, debugRunID)
	if scenarioKey != "" {
		scenario, ok := debugBusinessChainScenarios[strings.TrimSpace(scenarioKey)]
		if !ok {
			return "", ErrDebugScenarioNotFound
		}
		prefix = fmt.Sprintf("%s%s-", prefix, scenario.code)
	}
	return prefix, nil
}

func debugSeedAllowed(config DebugSafetyConfig) bool {
	return config.SeedEnabled
}

func debugCleanupAllowed(config DebugSafetyConfig) bool {
	return config.CleanupEnabled &&
		config.CleanupScope == DebugDefaultCleanupScope
}

func debugBusinessDataClearAllowed(config DebugSafetyConfig) bool {
	return debugCleanupAllowed(config)
}

func debugSeedDisabledReason(config DebugSafetyConfig) string {
	if debugSeedAllowed(config) {
		return ""
	}
	if !config.SeedEnabled {
		return "后端未开启生成调试数据开关 ERP_DEBUG_SEED_ENABLED"
	}
	return "生成调试数据能力不可用"
}

func debugCleanupDisabledReason(config DebugSafetyConfig) string {
	if debugCleanupAllowed(config) {
		return ""
	}
	if !config.CleanupEnabled {
		return "后端未开启清理调试数据开关 ERP_DEBUG_CLEANUP_ENABLED"
	}
	if config.CleanupScope != DebugDefaultCleanupScope {
		return fmt.Sprintf("清理范围 %s 不受支持，只允许 %s", config.CleanupScope, DebugDefaultCleanupScope)
	}
	return "清理调试数据能力不可用"
}

func debugBusinessDataClearDisabledReason(config DebugSafetyConfig) string {
	if debugBusinessDataClearAllowed(config) {
		return ""
	}
	if !config.CleanupEnabled {
		return "后端未开启业务数据清空开关 ERP_DEBUG_CLEANUP_ENABLED"
	}
	if config.CleanupScope != DebugDefaultCleanupScope {
		return fmt.Sprintf("清理范围 %s 不受支持，只允许 %s", config.CleanupScope, DebugDefaultCleanupScope)
	}
	return "业务数据清空能力不可用"
}

func normalizeDebugEnvironment(value string) string {
	env := strings.ToLower(strings.TrimSpace(value))
	switch env {
	case "local", "localhost":
		return "local"
	case "dev", "development":
		return "dev"
	case "shared", "qa", "test":
		return "shared"
	case "prod", "production", "remote":
		return "remote"
	case "":
		return "remote"
	default:
		return env
	}
}

func generateDebugRunID(now func() time.Time) string {
	current := time.Now
	if now != nil {
		current = now
	}
	suffix := make([]byte, 3)
	if _, err := rand.Read(suffix); err != nil {
		return "RUN-" + current().UTC().Format("20060102T150405")
	}
	return "RUN-" + current().UTC().Format("20060102T150405") + "-" + strings.ToUpper(hex.EncodeToString(suffix))
}

func debugPayloadBool(payload map[string]any, key string) bool {
	raw, ok := payload[key]
	if !ok || raw == nil {
		return false
	}
	switch value := raw.(type) {
	case bool:
		return value
	case string:
		return strings.EqualFold(strings.TrimSpace(value), "true")
	default:
		return false
	}
}

func debugPayloadString(payload map[string]any, key string) string {
	raw, ok := payload[key]
	if !ok || raw == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(raw))
}

type debugBusinessChainScenario struct {
	key             string
	title           string
	code            string
	coverageStatus  string
	partial         bool
	warnings        []string
	nextCheckpoints []DebugCheckpoint
	records         []debugRecordTemplate
	tasks           []debugTaskTemplate
	states          []debugStateTemplate
}

type debugRecordTemplate struct {
	ref               string
	moduleKey         string
	title             string
	statusKey         string
	ownerRoleKey      string
	customerName      string
	supplierName      string
	styleNo           string
	productNo         string
	productName       string
	materialName      string
	warehouseLocation string
	quantity          float64
	unit              string
	amount            float64
	dueOffsetDays     int
	items             []debugItemTemplate
}

type debugItemTemplate struct {
	itemName          string
	materialName      string
	spec              string
	unit              string
	quantity          float64
	unitPrice         float64
	amount            float64
	supplierName      string
	warehouseLocation string
}

type debugTaskTemplate struct {
	recordRef         string
	suffix            string
	group             string
	name              string
	statusKey         string
	businessStatusKey string
	ownerRoleKey      string
	priority          int16
	dueOffsetDays     int
	blockedReason     string
}

type debugStateTemplate struct {
	recordRef     string
	statusKey     string
	ownerRoleKey  string
	blockedReason string
}

var debugBusinessChainScenarioOrder = []string{
	"order_approval_engineering",
	"purchase_iqc_inbound",
	"outsource_return_inbound",
	"finished_goods_shipment",
	"shipment_receivable_invoice",
	"payable_reconciliation",
}

var debugBusinessChainScenarios = map[string]debugBusinessChainScenario{
	"order_approval_engineering": {
		key:            "order_approval_engineering",
		title:          "订单到工程",
		code:           "ORDENG",
		coverageStatus: "partial",
		partial:        true,
		warnings: []string{
			"当前只复用通用业务记录和协同任务，不代表工程 BOM 专表已经落地。",
		},
		nextCheckpoints: []DebugCheckpoint{
			{Label: "订单/款式立项", Path: "/erp/sales/project-orders", Reason: "核对订单调试单据和业务状态"},
			{Label: "协同任务调试", Path: "/erp/qa/workflow-task-debug", Reason: "核对工程资料任务是否进入 PMC / 相关角色池"},
		},
		records: []debugRecordTemplate{
			{ref: "order", moduleKey: "project-orders", title: "订单审批通过，待工程资料", statusKey: "engineering_preparing", ownerRoleKey: "sales", customerName: "调试客户 A", styleNo: "DBG-STYLE-A", productNo: "DBG-TOY-A", productName: "调试款毛绒熊", quantity: 1200, unit: "只", amount: 57600, dueOffsetDays: 21},
			{ref: "bom", moduleKey: "material-bom", title: "工程资料准备中", statusKey: "engineering_preparing", ownerRoleKey: "pmc", customerName: "调试客户 A", styleNo: "DBG-STYLE-A", productNo: "DBG-TOY-A", productName: "调试款毛绒熊", materialName: "BOM / 色卡 / 包装资料", quantity: 1, unit: "套", dueOffsetDays: 3},
		},
		tasks: []debugTaskTemplate{
			{recordRef: "bom", suffix: "ENG", group: "engineering_material", name: "准备 BOM、色卡和包装资料", statusKey: "ready", businessStatusKey: "engineering_preparing", ownerRoleKey: "pmc", priority: 2, dueOffsetDays: 3},
		},
		states: []debugStateTemplate{
			{recordRef: "order", statusKey: "engineering_preparing", ownerRoleKey: "sales"},
			{recordRef: "bom", statusKey: "engineering_preparing", ownerRoleKey: "pmc"},
		},
	},
	"purchase_iqc_inbound": {
		key:            "purchase_iqc_inbound",
		title:          "采购到入库",
		code:           "PURIN",
		coverageStatus: "partial",
		partial:        true,
		warnings: []string{
			"当前不生成库存流水和库存余额，只生成采购、IQC 与入库调试记录。",
		},
		nextCheckpoints: []DebugCheckpoint{
			{Label: "辅材/包材采购", Path: "/erp/purchase/accessories", Reason: "核对采购到货调试单据"},
			{Label: "入库通知/检验/入库", Path: "/erp/warehouse/inbound", Reason: "核对 IQC 与仓库入库任务"},
		},
		records: []debugRecordTemplate{
			{ref: "purchase", moduleKey: "accessories-purchase", title: "辅材到货待 IQC", statusKey: "iqc_pending", ownerRoleKey: "purchase", supplierName: "调试辅料供应商", materialName: "调试塑料眼睛", quantity: 5000, unit: "对", amount: 1500, dueOffsetDays: 2, items: []debugItemTemplate{{itemName: "塑料眼睛", materialName: "黑色 12mm", unit: "对", quantity: 5000, unitPrice: 0.3, amount: 1500, supplierName: "调试辅料供应商"}}},
			{ref: "inbound", moduleKey: "inbound", title: "辅材 IQC 放行后待入库", statusKey: "warehouse_inbound_pending", ownerRoleKey: "warehouse", supplierName: "调试辅料供应商", materialName: "调试塑料眼睛", warehouseLocation: "A-DEBUG-01", quantity: 5000, unit: "对", amount: 1500, dueOffsetDays: 3},
		},
		tasks: []debugTaskTemplate{
			{recordRef: "purchase", suffix: "IQC", group: "purchase_iqc", name: "辅材来料 IQC", statusKey: "ready", businessStatusKey: "iqc_pending", ownerRoleKey: "quality", priority: 2, dueOffsetDays: 1},
			{recordRef: "inbound", suffix: "IN", group: "warehouse_inbound", name: "确认辅材入库", statusKey: "pending", businessStatusKey: "warehouse_inbound_pending", ownerRoleKey: "warehouse", priority: 1, dueOffsetDays: 3},
		},
		states: []debugStateTemplate{
			{recordRef: "purchase", statusKey: "iqc_pending", ownerRoleKey: "quality"},
			{recordRef: "inbound", statusKey: "warehouse_inbound_pending", ownerRoleKey: "warehouse"},
		},
	},
	"outsource_return_inbound": {
		key:            "outsource_return_inbound",
		title:          "委外到入库",
		code:           "OUTIN",
		coverageStatus: "partial",
		partial:        true,
		warnings: []string{
			"当前不生成委外专表和委外成本结算，只生成加工合同、回货检验和入库调试记录。",
		},
		nextCheckpoints: []DebugCheckpoint{
			{Label: "加工合同/委外下单", Path: "/erp/purchase/processing-contracts", Reason: "核对委外回货来源"},
			{Label: "入库通知/检验/入库", Path: "/erp/warehouse/inbound", Reason: "核对委外回货检验和入库"},
		},
		records: []debugRecordTemplate{
			{ref: "contract", moduleKey: "processing-contracts", title: "委外加工回货待检", statusKey: "qc_pending", ownerRoleKey: "purchase", supplierName: "调试加工厂", productName: "调试款毛绒兔半成品", quantity: 800, unit: "只", amount: 9600, dueOffsetDays: 4},
			{ref: "inbound", moduleKey: "inbound", title: "委外回货合格待入库", statusKey: "warehouse_inbound_pending", ownerRoleKey: "warehouse", supplierName: "调试加工厂", productName: "调试款毛绒兔半成品", warehouseLocation: "B-DEBUG-02", quantity: 780, unit: "只", amount: 9360, dueOffsetDays: 5},
		},
		tasks: []debugTaskTemplate{
			{recordRef: "contract", suffix: "OQC", group: "outsource_return_qc", name: "委外回货检验", statusKey: "ready", businessStatusKey: "qc_pending", ownerRoleKey: "quality", priority: 2, dueOffsetDays: 1},
			{recordRef: "inbound", suffix: "OIN", group: "warehouse_inbound", name: "委外回货入库", statusKey: "pending", businessStatusKey: "warehouse_inbound_pending", ownerRoleKey: "warehouse", priority: 1, dueOffsetDays: 2},
		},
		states: []debugStateTemplate{
			{recordRef: "contract", statusKey: "qc_pending", ownerRoleKey: "quality"},
			{recordRef: "inbound", statusKey: "warehouse_inbound_pending", ownerRoleKey: "warehouse"},
		},
	},
	"finished_goods_shipment": {
		key:            "finished_goods_shipment",
		title:          "生产到出货",
		code:           "PROSHIP",
		coverageStatus: "partial",
		partial:        true,
		warnings: []string{
			"当前不生成 production_order、shipment_order 或 inventory_txn 专表数据。",
		},
		nextCheckpoints: []DebugCheckpoint{
			{Label: "生产进度", Path: "/erp/production/progress", Reason: "核对成品完工调试记录"},
			{Label: "待出货/出货放行", Path: "/erp/warehouse/shipping-release", Reason: "核对出货放行任务"},
			{Label: "出库", Path: "/erp/warehouse/outbound", Reason: "核对出库事实快照"},
		},
		records: []debugRecordTemplate{
			{ref: "progress", moduleKey: "production-progress", title: "成品完工待抽检", statusKey: "qc_pending", ownerRoleKey: "production", customerName: "调试客户 B", productName: "调试款毛绒狗", quantity: 600, unit: "只", amount: 33000, dueOffsetDays: 2},
			{ref: "shipping", moduleKey: "shipping-release", title: "成品入库后待出货放行", statusKey: "shipping_released", ownerRoleKey: "warehouse", customerName: "调试客户 B", productName: "调试款毛绒狗", warehouseLocation: "FG-DEBUG-01", quantity: 590, unit: "只", amount: 32450, dueOffsetDays: 5},
			{ref: "outbound", moduleKey: "outbound", title: "出库待确认", statusKey: "shipped", ownerRoleKey: "warehouse", customerName: "调试客户 B", productName: "调试款毛绒狗", quantity: 590, unit: "只", amount: 32450, dueOffsetDays: 6},
		},
		tasks: []debugTaskTemplate{
			{recordRef: "progress", suffix: "FQC", group: "finished_goods_qc", name: "成品抽检", statusKey: "ready", businessStatusKey: "qc_pending", ownerRoleKey: "quality", priority: 2, dueOffsetDays: 1},
			{recordRef: "shipping", suffix: "SHIP", group: "shipment_release", name: "出货放行确认", statusKey: "ready", businessStatusKey: "shipping_released", ownerRoleKey: "sales", priority: 2, dueOffsetDays: 3},
			{recordRef: "outbound", suffix: "OUT", group: "warehouse_outbound", name: "仓库出库确认", statusKey: "pending", businessStatusKey: "shipped", ownerRoleKey: "warehouse", priority: 1, dueOffsetDays: 4},
		},
		states: []debugStateTemplate{
			{recordRef: "progress", statusKey: "qc_pending", ownerRoleKey: "quality"},
			{recordRef: "shipping", statusKey: "shipping_released", ownerRoleKey: "sales"},
			{recordRef: "outbound", statusKey: "shipped", ownerRoleKey: "warehouse"},
		},
	},
	"shipment_receivable_invoice": {
		key:            "shipment_receivable_invoice",
		title:          "出货到应收 / 开票",
		code:           "SHIPFIN",
		coverageStatus: "partial",
		partial:        true,
		warnings: []string{
			"当前不生成 ar_receivable、ar_invoice、总账或凭证专表。",
		},
		nextCheckpoints: []DebugCheckpoint{
			{Label: "出库", Path: "/erp/warehouse/outbound", Reason: "核对出货来源"},
			{Label: "应收", Path: "/erp/finance/receivables", Reason: "核对应收登记调试记录"},
			{Label: "开票", Path: "/erp/finance/invoices", Reason: "核对开票登记调试记录"},
		},
		records: []debugRecordTemplate{
			{ref: "outbound", moduleKey: "outbound", title: "客户出货已完成", statusKey: "shipped", ownerRoleKey: "warehouse", customerName: "调试客户 C", productName: "调试款抱枕", quantity: 300, unit: "只", amount: 21000, dueOffsetDays: -1},
			{ref: "receivable", moduleKey: "receivables", title: "出货后应收登记", statusKey: "reconciling", ownerRoleKey: "finance", customerName: "调试客户 C", productName: "调试款抱枕", quantity: 300, unit: "只", amount: 21000, dueOffsetDays: 2},
			{ref: "invoice", moduleKey: "invoices", title: "出货后开票登记", statusKey: "reconciling", ownerRoleKey: "finance", customerName: "调试客户 C", productName: "调试款抱枕", quantity: 300, unit: "只", amount: 21000, dueOffsetDays: 4},
		},
		tasks: []debugTaskTemplate{
			{recordRef: "receivable", suffix: "AR", group: "receivable_registration", name: "登记应收", statusKey: "ready", businessStatusKey: "reconciling", ownerRoleKey: "finance", priority: 2, dueOffsetDays: 1},
			{recordRef: "invoice", suffix: "INV", group: "invoice_registration", name: "登记开票", statusKey: "pending", businessStatusKey: "reconciling", ownerRoleKey: "finance", priority: 1, dueOffsetDays: 3},
		},
		states: []debugStateTemplate{
			{recordRef: "outbound", statusKey: "shipped", ownerRoleKey: "warehouse"},
			{recordRef: "receivable", statusKey: "reconciling", ownerRoleKey: "finance"},
			{recordRef: "invoice", statusKey: "reconciling", ownerRoleKey: "finance"},
		},
	},
	"payable_reconciliation": {
		key:            "payable_reconciliation",
		title:          "采购 / 委外到应付 / 对账",
		code:           "PAYREC",
		coverageStatus: "partial",
		partial:        true,
		warnings: []string{
			"当前不生成 ap_payable、ap_reconciliation 或付款流水专表。",
		},
		nextCheckpoints: []DebugCheckpoint{
			{Label: "待付款/应付提醒", Path: "/erp/finance/payables", Reason: "核对应付登记调试记录"},
			{Label: "对账/结算", Path: "/erp/finance/reconciliation", Reason: "核对供应商或加工厂对账状态"},
		},
		records: []debugRecordTemplate{
			{ref: "payable", moduleKey: "payables", title: "采购/委外应付登记", statusKey: "reconciling", ownerRoleKey: "finance", supplierName: "调试综合供应商", materialName: "辅料与委外加工费", quantity: 1, unit: "批", amount: 26800, dueOffsetDays: 3},
			{ref: "reconciliation", moduleKey: "reconciliation", title: "供应商对账中", statusKey: "reconciling", ownerRoleKey: "finance", supplierName: "调试综合供应商", materialName: "辅料与委外加工费", quantity: 1, unit: "批", amount: 26800, dueOffsetDays: 5},
		},
		tasks: []debugTaskTemplate{
			{recordRef: "payable", suffix: "AP", group: "purchase_payable_registration", name: "登记采购/委外应付", statusKey: "ready", businessStatusKey: "reconciling", ownerRoleKey: "finance", priority: 2, dueOffsetDays: 1},
			{recordRef: "reconciliation", suffix: "REC", group: "purchase_reconciliation", name: "核对供应商账单", statusKey: "pending", businessStatusKey: "reconciling", ownerRoleKey: "finance", priority: 1, dueOffsetDays: 4},
		},
		states: []debugStateTemplate{
			{recordRef: "payable", statusKey: "reconciling", ownerRoleKey: "finance"},
			{recordRef: "reconciliation", statusKey: "reconciling", ownerRoleKey: "finance"},
		},
	},
}

func (s debugBusinessChainScenario) summary() DebugScenarioSummary {
	return DebugScenarioSummary{
		Key:             s.key,
		Title:           s.title,
		ScenarioCode:    s.code,
		CoverageStatus:  s.coverageStatus,
		Partial:         s.partial,
		Warnings:        append([]string(nil), s.warnings...),
		NextCheckpoints: append([]DebugCheckpoint(nil), s.nextCheckpoints...),
	}
}

func (s debugBusinessChainScenario) buildPlan(debugRunID string, now time.Time) DebugSeedPlan {
	cleanupToken := fmt.Sprintf("%s:%s", debugRunID, s.key)
	basePayload := func(extra map[string]any) map[string]any {
		payload := map[string]any{
			"debug":            true,
			"created_by_debug": true,
			"debug_run_id":     debugRunID,
			"scenario_key":     s.key,
			"scenario_code":    s.code,
			"cleanup_token":    cleanupToken,
			"debug_seed":       debugSeedVersion,
			"debug_created_at": now.UTC().Format(time.RFC3339),
		}
		for key, value := range extra {
			payload[key] = value
		}
		return payload
	}

	records := make([]DebugRecordPlan, 0, len(s.records))
	for index, template := range s.records {
		documentNo := fmt.Sprintf("%s-%s-%s-%02d", debugDocumentPrefix, debugRunID, s.code, index+1)
		record := DebugRecordPlan{
			Ref:               template.ref,
			ModuleKey:         template.moduleKey,
			DocumentNo:        documentNo,
			Title:             "[DEBUG] " + template.title,
			BusinessStatusKey: template.statusKey,
			OwnerRoleKey:      template.ownerRoleKey,
			SourceNo:          stringPtr(documentNo),
			CustomerName:      optionalDebugString(template.customerName),
			SupplierName:      optionalDebugString(template.supplierName),
			StyleNo:           optionalDebugString(template.styleNo),
			ProductNo:         optionalDebugString(template.productNo),
			ProductName:       optionalDebugString(template.productName),
			MaterialName:      optionalDebugString(template.materialName),
			WarehouseLocation: optionalDebugString(template.warehouseLocation),
			Quantity:          optionalDebugFloat(template.quantity),
			Unit:              optionalDebugString(template.unit),
			Amount:            optionalDebugFloat(template.amount),
			DocumentDate:      stringPtr(now.Format("2006-01-02")),
			DueDate:           stringPtr(now.AddDate(0, 0, template.dueOffsetDays).Format("2006-01-02")),
			Payload: basePayload(map[string]any{
				"record_ref":  template.ref,
				"document_no": documentNo,
			}),
			Items: make([]*BusinessRecordItemMutation, 0, len(template.items)),
		}
		for itemIndex, item := range template.items {
			itemPayload := basePayload(map[string]any{
				"record_ref": template.ref,
				"line_no":    itemIndex + 1,
			})
			record.Items = append(record.Items, &BusinessRecordItemMutation{
				LineNo:            itemIndex + 1,
				ItemName:          optionalDebugString(item.itemName),
				MaterialName:      optionalDebugString(item.materialName),
				Spec:              optionalDebugString(item.spec),
				Unit:              optionalDebugString(item.unit),
				Quantity:          optionalDebugFloat(item.quantity),
				UnitPrice:         optionalDebugFloat(item.unitPrice),
				Amount:            optionalDebugFloat(item.amount),
				SupplierName:      optionalDebugString(item.supplierName),
				WarehouseLocation: optionalDebugString(item.warehouseLocation),
				Payload:           itemPayload,
			})
		}
		records = append(records, record)
	}

	tasks := make([]DebugTaskPlan, 0, len(s.tasks))
	for _, template := range s.tasks {
		taskCode := fmt.Sprintf("%s-%s-%s-%s", debugDocumentPrefix, debugRunID, s.code, template.suffix)
		var blockedReason *string
		if strings.TrimSpace(template.blockedReason) != "" {
			blockedReason = stringPtr(template.blockedReason)
		}
		tasks = append(tasks, DebugTaskPlan{
			RecordRef:         template.recordRef,
			TaskCode:          taskCode,
			TaskGroup:         template.group,
			TaskName:          "[DEBUG] " + template.name,
			BusinessStatusKey: template.businessStatusKey,
			TaskStatusKey:     template.statusKey,
			OwnerRoleKey:      template.ownerRoleKey,
			Priority:          template.priority,
			DueAt:             timePtr(now.AddDate(0, 0, template.dueOffsetDays)),
			BlockedReason:     blockedReason,
			Payload: basePayload(map[string]any{
				"record_ref": template.recordRef,
				"task_group": template.group,
			}),
		})
	}

	states := make([]DebugBusinessStatePlan, 0, len(s.states))
	for _, template := range s.states {
		var blockedReason *string
		if strings.TrimSpace(template.blockedReason) != "" {
			blockedReason = stringPtr(template.blockedReason)
		}
		states = append(states, DebugBusinessStatePlan{
			RecordRef:         template.recordRef,
			BusinessStatusKey: template.statusKey,
			OwnerRoleKey:      template.ownerRoleKey,
			BlockedReason:     blockedReason,
			Payload: basePayload(map[string]any{
				"record_ref": template.recordRef,
			}),
		})
	}

	checkpoints := make([]DebugCheckpoint, len(s.nextCheckpoints))
	for index, checkpoint := range s.nextCheckpoints {
		checkpoints[index] = checkpoint
		checkpoints[index].Query = debugRunID
	}

	warnings := append([]string(nil), s.warnings...)
	sort.Strings(warnings)
	return DebugSeedPlan{
		ScenarioKey:     s.key,
		ScenarioCode:    s.code,
		DebugRunID:      debugRunID,
		CoverageStatus:  s.coverageStatus,
		Partial:         s.partial,
		CleanupToken:    cleanupToken,
		Warnings:        warnings,
		Records:         records,
		Tasks:           tasks,
		BusinessStates:  states,
		NextCheckpoints: checkpoints,
	}
}

func optionalDebugString(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func optionalDebugFloat(value float64) *float64 {
	if value == 0 {
		return nil
	}
	return &value
}

func stringPtr(value string) *string {
	return &value
}

func timePtr(value time.Time) *time.Time {
	return &value
}
