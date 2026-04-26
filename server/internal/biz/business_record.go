package biz

import (
	"context"
	"errors"
	"strings"
	"time"
)

var (
	ErrBusinessRecordNotFound        = errors.New("business record not found")
	ErrBusinessRecordExists          = errors.New("business record already exists")
	ErrBusinessRecordVersionConflict = errors.New("business record version conflict")
)

var businessRecordModuleKeyOrder = []string{
	"partners",
	"products",
	"project-orders",
	"material-bom",
	"accessories-purchase",
	"processing-contracts",
	"inbound",
	"inventory",
	"shipping-release",
	"outbound",
	"production-scheduling",
	"production-progress",
	"production-exceptions",
	"quality-inspections",
	"reconciliation",
	"payables",
	"receivables",
	"invoices",
}

var businessRecordModulePrefixes = map[string]string{
	"partners":              "PT",
	"products":              "PD",
	"project-orders":        "PO",
	"material-bom":          "BOM",
	"accessories-purchase":  "AP",
	"processing-contracts":  "PC",
	"inbound":               "IN",
	"inventory":             "ST",
	"shipping-release":      "SR",
	"outbound":              "OUT",
	"production-scheduling": "PS",
	"production-progress":   "PP",
	"production-exceptions": "PX",
	"quality-inspections":   "QC",
	"reconciliation":        "RC",
	"payables":              "PY",
	"receivables":           "AR",
	"invoices":              "INV",
}

var businessRecordModuleSet = buildBusinessRecordModuleSet()

func buildBusinessRecordModuleSet() map[string]struct{} {
	out := make(map[string]struct{}, len(businessRecordModulePrefixes))
	for key := range businessRecordModulePrefixes {
		out[key] = struct{}{}
	}
	return out
}

func IsValidBusinessRecordModule(key string) bool {
	_, ok := businessRecordModuleSet[strings.TrimSpace(key)]
	return ok
}

func ListBusinessRecordModuleKeys() []string {
	out := make([]string, len(businessRecordModuleKeyOrder))
	copy(out, businessRecordModuleKeyOrder)
	return out
}

func BusinessRecordDocumentPrefix(moduleKey string) string {
	if prefix, ok := businessRecordModulePrefixes[strings.TrimSpace(moduleKey)]; ok {
		return prefix
	}
	return "BR"
}

type BusinessRecord struct {
	ID                int
	ModuleKey         string
	DocumentNo        *string
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
	Items             []*BusinessRecordItem
	RowVersion        int64
	CreatedBy         *int
	UpdatedBy         *int
	CreatedAt         time.Time
	UpdatedAt         time.Time
	DeletedAt         *time.Time
	DeletedBy         *int
	DeleteReason      *string
}

type BusinessRecordItem struct {
	ID                int
	RecordID          int
	ModuleKey         string
	LineNo            int
	ItemName          *string
	MaterialName      *string
	Spec              *string
	Unit              *string
	Quantity          *float64
	UnitPrice         *float64
	Amount            *float64
	SupplierName      *string
	WarehouseLocation *string
	Payload           map[string]any
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type BusinessRecordFilter struct {
	ModuleKey          string
	BusinessStatusKey  string
	BusinessStatusKeys []string
	OwnerRoleKey       string
	IncludeDeleted     bool
	DeletedOnly        bool
	Keyword            string
	DateFilterKey      string
	DateRangeStart     string
	DateRangeEnd       string
	SortOrder          string
	Limit              int
	Offset             int
}

type BusinessRecordMutation struct {
	ModuleKey          string
	DocumentNo         *string
	Title              string
	BusinessStatusKey  string
	OwnerRoleKey       string
	SourceNo           *string
	CustomerName       *string
	SupplierName       *string
	StyleNo            *string
	ProductNo          *string
	ProductName        *string
	MaterialName       *string
	WarehouseLocation  *string
	Quantity           *float64
	Unit               *string
	Amount             *float64
	DocumentDate       *string
	DueDate            *string
	Payload            map[string]any
	Items              []*BusinessRecordItemMutation
	ExpectedRowVersion int64
}

type BusinessRecordItemMutation struct {
	LineNo            int
	ItemName          *string
	MaterialName      *string
	Spec              *string
	Unit              *string
	Quantity          *float64
	UnitPrice         *float64
	Amount            *float64
	SupplierName      *string
	WarehouseLocation *string
	Payload           map[string]any
}

type BusinessRecordModuleStatusCount struct {
	ModuleKey         string
	BusinessStatusKey string
	Count             int
}

type BusinessDashboardModuleStats struct {
	ModuleKey    string
	TotalRecords int
	StatusCounts map[string]int
}

type BusinessRecordRepo interface {
	ListBusinessRecords(ctx context.Context, filter BusinessRecordFilter) ([]*BusinessRecord, int, error)
	CountBusinessRecordsByModuleAndStatus(ctx context.Context) ([]BusinessRecordModuleStatusCount, error)
	CreateBusinessRecord(ctx context.Context, in *BusinessRecordMutation, actorID int) (*BusinessRecord, error)
	UpdateBusinessRecord(ctx context.Context, id int, in *BusinessRecordMutation, actorID int) (*BusinessRecord, error)
	DeleteBusinessRecords(ctx context.Context, ids []int, deleteReason string, actorID int) (int, error)
	RestoreBusinessRecord(ctx context.Context, id int, actorID int) (*BusinessRecord, error)
}

type BusinessRecordUsecase struct {
	repo BusinessRecordRepo
}

func NewBusinessRecordUsecase(repo BusinessRecordRepo) *BusinessRecordUsecase {
	return &BusinessRecordUsecase{repo: repo}
}

func (uc *BusinessRecordUsecase) ListRecords(ctx context.Context, filter BusinessRecordFilter) ([]*BusinessRecord, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	filter = normalizeBusinessRecordFilter(filter)
	if filter.ModuleKey != "" && !IsValidBusinessRecordModule(filter.ModuleKey) {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListBusinessRecords(ctx, filter)
}

func (uc *BusinessRecordUsecase) DashboardStats(ctx context.Context) ([]BusinessDashboardModuleStats, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	rows, err := uc.repo.CountBusinessRecordsByModuleAndStatus(ctx)
	if err != nil {
		return nil, err
	}

	statsByModule := make(map[string]*BusinessDashboardModuleStats, len(businessRecordModuleKeyOrder))
	for _, moduleKey := range businessRecordModuleKeyOrder {
		statsByModule[moduleKey] = &BusinessDashboardModuleStats{
			ModuleKey:    moduleKey,
			StatusCounts: map[string]int{},
		}
	}
	for _, row := range rows {
		moduleKey := strings.TrimSpace(row.ModuleKey)
		statusKey := strings.TrimSpace(row.BusinessStatusKey)
		if row.Count <= 0 || !IsValidBusinessRecordModule(moduleKey) || statusKey == "" {
			continue
		}
		stats := statsByModule[moduleKey]
		stats.TotalRecords += row.Count
		stats.StatusCounts[statusKey] += row.Count
	}

	out := make([]BusinessDashboardModuleStats, 0, len(businessRecordModuleKeyOrder))
	for _, moduleKey := range businessRecordModuleKeyOrder {
		stats := statsByModule[moduleKey]
		statusCounts := make(map[string]int, len(stats.StatusCounts))
		for key, count := range stats.StatusCounts {
			statusCounts[key] = count
		}
		out = append(out, BusinessDashboardModuleStats{
			ModuleKey:    stats.ModuleKey,
			TotalRecords: stats.TotalRecords,
			StatusCounts: statusCounts,
		})
	}
	return out, nil
}

func (uc *BusinessRecordUsecase) CreateRecord(ctx context.Context, in *BusinessRecordMutation, actorID int) (*BusinessRecord, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeBusinessRecordMutation(*in, true)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateBusinessRecord(ctx, &normalized, actorID)
}

func (uc *BusinessRecordUsecase) UpdateRecord(ctx context.Context, id int, in *BusinessRecordMutation, actorID int) (*BusinessRecord, error) {
	if uc == nil || uc.repo == nil || in == nil || id <= 0 {
		return nil, ErrBadParam
	}
	normalized, err := normalizeBusinessRecordMutation(*in, false)
	if err != nil {
		return nil, err
	}
	return uc.repo.UpdateBusinessRecord(ctx, id, &normalized, actorID)
}

func (uc *BusinessRecordUsecase) DeleteRecords(ctx context.Context, ids []int, deleteReason string, actorID int) (int, error) {
	if uc == nil || uc.repo == nil {
		return 0, ErrBadParam
	}
	normalizedIDs := normalizeBusinessRecordIDs(ids)
	if len(normalizedIDs) == 0 {
		return 0, ErrBadParam
	}
	return uc.repo.DeleteBusinessRecords(ctx, normalizedIDs, strings.TrimSpace(deleteReason), actorID)
}

func (uc *BusinessRecordUsecase) RestoreRecord(ctx context.Context, id int, actorID int) (*BusinessRecord, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.RestoreBusinessRecord(ctx, id, actorID)
}

func normalizeBusinessRecordFilter(filter BusinessRecordFilter) BusinessRecordFilter {
	filter.ModuleKey = strings.TrimSpace(filter.ModuleKey)
	filter.BusinessStatusKey = strings.TrimSpace(filter.BusinessStatusKey)
	filter.BusinessStatusKeys = normalizeBusinessRecordStatusKeys(filter.BusinessStatusKeys)
	filter.OwnerRoleKey = NormalizeRoleKey(filter.OwnerRoleKey)
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.DateFilterKey = normalizeBusinessRecordDateFilterKey(filter.DateFilterKey)
	filter.DateRangeStart = normalizeBusinessRecordDateFilterValue(filter.DateRangeStart)
	filter.DateRangeEnd = normalizeBusinessRecordDateFilterValue(filter.DateRangeEnd)
	filter.SortOrder = strings.TrimSpace(filter.SortOrder)
	if filter.SortOrder != "asc" {
		filter.SortOrder = "desc"
	}
	if filter.DeletedOnly {
		filter.IncludeDeleted = true
	}
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 200 {
		filter.Limit = 200
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	return filter
}

func normalizeBusinessRecordStatusKeys(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		text := strings.TrimSpace(value)
		if text == "" {
			continue
		}
		if _, ok := seen[text]; ok {
			continue
		}
		seen[text] = struct{}{}
		out = append(out, text)
	}
	return out
}

func normalizeBusinessRecordDateFilterKey(value string) string {
	text := strings.TrimSpace(value)
	switch text {
	case "document_date", "due_date", "created_at", "updated_at":
		return text
	default:
		if strings.HasPrefix(text, "payload.") && isSafeBusinessRecordPayloadDateFilterKey(strings.TrimPrefix(text, "payload.")) {
			return text
		}
		return ""
	}
}

func isSafeBusinessRecordPayloadDateFilterKey(value string) bool {
	if value == "" {
		return false
	}
	for _, char := range value {
		if char >= 'a' && char <= 'z' {
			continue
		}
		if char >= 'A' && char <= 'Z' {
			continue
		}
		if char >= '0' && char <= '9' {
			continue
		}
		if char == '_' || char == '-' {
			continue
		}
		return false
	}
	return true
}

func normalizeBusinessRecordDateFilterValue(value string) string {
	text := strings.TrimSpace(value)
	if text == "" {
		return ""
	}
	parsed, err := time.Parse("2006-01-02", text)
	if err != nil {
		return ""
	}
	return parsed.Format("2006-01-02")
}

func normalizeBusinessRecordMutation(in BusinessRecordMutation, requireModule bool) (BusinessRecordMutation, error) {
	in.ModuleKey = strings.TrimSpace(in.ModuleKey)
	in.Title = strings.TrimSpace(in.Title)
	in.BusinessStatusKey = strings.TrimSpace(in.BusinessStatusKey)
	in.OwnerRoleKey = NormalizeRoleKey(in.OwnerRoleKey)
	in.DocumentNo = normalizeOptionalString(in.DocumentNo)
	in.SourceNo = normalizeOptionalString(in.SourceNo)
	in.CustomerName = normalizeOptionalString(in.CustomerName)
	in.SupplierName = normalizeOptionalString(in.SupplierName)
	in.StyleNo = normalizeOptionalString(in.StyleNo)
	in.ProductNo = normalizeOptionalString(in.ProductNo)
	in.ProductName = normalizeOptionalString(in.ProductName)
	in.MaterialName = normalizeOptionalString(in.MaterialName)
	in.WarehouseLocation = normalizeOptionalString(in.WarehouseLocation)
	in.Unit = normalizeOptionalString(in.Unit)
	in.DocumentDate = normalizeOptionalString(in.DocumentDate)
	in.DueDate = normalizeOptionalString(in.DueDate)
	if in.BusinessStatusKey == "" {
		in.BusinessStatusKey = "project_pending"
	}
	if in.OwnerRoleKey == "" {
		in.OwnerRoleKey = BusinessRoleKey
	}
	if in.Title == "" && in.DocumentNo != nil {
		in.Title = *in.DocumentNo
	}
	if in.Title == "" {
		in.Title = "未命名单据"
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	for index, item := range in.Items {
		if item == nil {
			return BusinessRecordMutation{}, ErrBadParam
		}
		item.LineNo = normalizeBusinessRecordLineNo(item.LineNo, index)
		item.ItemName = normalizeOptionalString(item.ItemName)
		item.MaterialName = normalizeOptionalString(item.MaterialName)
		item.Spec = normalizeOptionalString(item.Spec)
		item.Unit = normalizeOptionalString(item.Unit)
		item.SupplierName = normalizeOptionalString(item.SupplierName)
		item.WarehouseLocation = normalizeOptionalString(item.WarehouseLocation)
		if item.Payload == nil {
			item.Payload = map[string]any{}
		}
	}
	if requireModule && !IsValidBusinessRecordModule(in.ModuleKey) {
		return BusinessRecordMutation{}, ErrBadParam
	}
	if in.ModuleKey != "" && !IsValidBusinessRecordModule(in.ModuleKey) {
		return BusinessRecordMutation{}, ErrBadParam
	}
	if !IsValidWorkflowBusinessState(in.BusinessStatusKey) {
		return BusinessRecordMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	normalized := strings.TrimSpace(*value)
	if normalized == "" {
		return nil
	}
	return &normalized
}

func normalizeBusinessRecordLineNo(value int, index int) int {
	if value > 0 {
		return value
	}
	return index + 1
}

func normalizeBusinessRecordIDs(ids []int) []int {
	seen := make(map[int]struct{}, len(ids))
	out := make([]int, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
