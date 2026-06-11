package data

import (
	"context"
	"fmt"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/businessrecord"
	"server/internal/data/model/ent/businessrecorditem"

	"github.com/go-kratos/kratos/v2/log"
)

type businessRecordRepo struct {
	data *Data
	log  *log.Helper
}

func NewBusinessRecordRepo(d *Data, logger log.Logger) *businessRecordRepo {
	return &businessRecordRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.business_record_repo")),
	}
}

var _ biz.BusinessRecordRepo = (*businessRecordRepo)(nil)

func (r *businessRecordRepo) ListBusinessRecords(ctx context.Context, filter biz.BusinessRecordFilter) ([]*biz.BusinessRecord, int, error) {
	query := r.data.postgres.BusinessRecord.Query()
	if filter.ModuleKey != "" {
		query = query.Where(businessrecord.ModuleKey(filter.ModuleKey))
	}
	if len(filter.BusinessStatusKeys) > 0 {
		query = query.Where(businessrecord.BusinessStatusKeyIn(filter.BusinessStatusKeys...))
	} else if filter.BusinessStatusKey != "" {
		query = query.Where(businessrecord.BusinessStatusKey(filter.BusinessStatusKey))
	}
	if filter.OwnerRoleKey != "" {
		query = query.Where(businessrecord.OwnerRoleKey(filter.OwnerRoleKey))
	}
	if filter.DeletedOnly {
		query = query.Where(businessrecord.DeletedAtNotNil())
	} else if !filter.IncludeDeleted {
		query = query.Where(businessrecord.DeletedAtIsNil())
	}

	if needsBusinessRecordMemoryFilter(filter) {
		return r.listBusinessRecordsWithMemoryFilter(ctx, query, filter)
	}

	if filter.Keyword != "" {
		query = query.Where(businessrecord.Or(
			businessrecord.DocumentNoContainsFold(filter.Keyword),
			businessrecord.TitleContainsFold(filter.Keyword),
			businessrecord.SourceNoContainsFold(filter.Keyword),
			businessrecord.CustomerNameContainsFold(filter.Keyword),
			businessrecord.SupplierNameContainsFold(filter.Keyword),
			businessrecord.StyleNoContainsFold(filter.Keyword),
			businessrecord.ProductNoContainsFold(filter.Keyword),
			businessrecord.ProductNameContainsFold(filter.Keyword),
			businessrecord.MaterialNameContainsFold(filter.Keyword),
			businessrecord.WarehouseLocationContainsFold(filter.Keyword),
		))
	}
	query = applyBusinessRecordDateFilter(query, filter)

	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}

	if filter.SortOrder == "asc" {
		query = query.Order(ent.Asc(businessrecord.FieldCreatedAt, businessrecord.FieldID))
	} else {
		query = query.Order(ent.Desc(businessrecord.FieldCreatedAt, businessrecord.FieldID))
	}

	rows, err := query.
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}

	itemsByRecordID, err := r.loadBusinessRecordItems(ctx, rows)
	if err != nil {
		return nil, 0, err
	}

	out := make([]*biz.BusinessRecord, 0, len(rows))
	for _, row := range rows {
		record := entBusinessRecordToBiz(row)
		record.Items = itemsByRecordID[row.ID]
		out = append(out, record)
	}
	return out, total, nil
}

func (r *businessRecordRepo) listBusinessRecordsWithMemoryFilter(ctx context.Context, query *ent.BusinessRecordQuery, filter biz.BusinessRecordFilter) ([]*biz.BusinessRecord, int, error) {
	query = applyBusinessRecordSort(query, filter)
	rows, err := query.All(ctx)
	if err != nil {
		return nil, 0, err
	}
	itemsByRecordID, err := r.loadBusinessRecordItems(ctx, rows)
	if err != nil {
		return nil, 0, err
	}

	records := make([]*biz.BusinessRecord, 0, len(rows))
	for _, row := range rows {
		record := entBusinessRecordToBiz(row)
		record.Items = itemsByRecordID[row.ID]
		if matchesBusinessRecordMemoryFilter(record, filter) {
			records = append(records, record)
		}
	}

	total := len(records)
	if filter.Offset >= total {
		return []*biz.BusinessRecord{}, total, nil
	}
	end := filter.Offset + filter.Limit
	if end > total {
		end = total
	}
	return records[filter.Offset:end], total, nil
}

func applyBusinessRecordDateFilter(query *ent.BusinessRecordQuery, filter biz.BusinessRecordFilter) *ent.BusinessRecordQuery {
	if filter.DateFilterKey == "" || (filter.DateRangeStart == "" && filter.DateRangeEnd == "") {
		return query
	}

	switch filter.DateFilterKey {
	case "document_date":
		if filter.DateRangeStart != "" {
			query = query.Where(businessrecord.DocumentDateGTE(filter.DateRangeStart))
		}
		if filter.DateRangeEnd != "" {
			query = query.Where(businessrecord.DocumentDateLTE(filter.DateRangeEnd))
		}
	case "due_date":
		if filter.DateRangeStart != "" {
			query = query.Where(businessrecord.DueDateGTE(filter.DateRangeStart))
		}
		if filter.DateRangeEnd != "" {
			query = query.Where(businessrecord.DueDateLTE(filter.DateRangeEnd))
		}
	case "created_at":
		if start, ok := parseBusinessRecordDateStart(filter.DateRangeStart); ok {
			query = query.Where(businessrecord.CreatedAtGTE(start))
		}
		if end, ok := parseBusinessRecordDateEnd(filter.DateRangeEnd); ok {
			query = query.Where(businessrecord.CreatedAtLTE(end))
		}
	case "updated_at":
		if start, ok := parseBusinessRecordDateStart(filter.DateRangeStart); ok {
			query = query.Where(businessrecord.UpdatedAtGTE(start))
		}
		if end, ok := parseBusinessRecordDateEnd(filter.DateRangeEnd); ok {
			query = query.Where(businessrecord.UpdatedAtLTE(end))
		}
	}
	return query
}

func applyBusinessRecordSort(query *ent.BusinessRecordQuery, filter biz.BusinessRecordFilter) *ent.BusinessRecordQuery {
	if filter.SortOrder == "asc" {
		return query.Order(ent.Asc(businessrecord.FieldCreatedAt, businessrecord.FieldID))
	}
	return query.Order(ent.Desc(businessrecord.FieldCreatedAt, businessrecord.FieldID))
}

func needsBusinessRecordMemoryFilter(filter biz.BusinessRecordFilter) bool {
	if strings.TrimSpace(filter.Keyword) != "" {
		return true
	}
	if filter.DateFilterKey == "" || (filter.DateRangeStart == "" && filter.DateRangeEnd == "") {
		return false
	}
	return !isBusinessRecordDBDateFilter(filter.DateFilterKey)
}

func isBusinessRecordDBDateFilter(key string) bool {
	switch key {
	case "document_date", "due_date", "created_at", "updated_at":
		return true
	default:
		return false
	}
}

func matchesBusinessRecordMemoryFilter(record *biz.BusinessRecord, filter biz.BusinessRecordFilter) bool {
	if filter.Keyword != "" && !businessRecordContainsKeyword(record, filter.Keyword) {
		return false
	}
	if !matchesBusinessRecordDateFilter(record, filter) {
		return false
	}
	return true
}

func businessRecordContainsKeyword(record *biz.BusinessRecord, keyword string) bool {
	needle := strings.ToLower(strings.TrimSpace(keyword))
	if needle == "" {
		return true
	}
	for _, value := range []any{
		record.DocumentNo,
		record.Title,
		record.BusinessStatusKey,
		record.OwnerRoleKey,
		record.SourceNo,
		record.CustomerName,
		record.SupplierName,
		record.StyleNo,
		record.ProductNo,
		record.ProductName,
		record.MaterialName,
		record.WarehouseLocation,
		record.Quantity,
		record.Unit,
		record.Amount,
		record.DocumentDate,
		record.DueDate,
		record.Payload,
	} {
		if businessRecordValueContainsKeyword(value, needle) {
			return true
		}
	}
	for _, item := range record.Items {
		if businessRecordValueContainsKeyword(item, needle) {
			return true
		}
	}
	return false
}

func businessRecordValueContainsKeyword(value any, needle string) bool {
	switch item := value.(type) {
	case nil:
		return false
	case *string:
		if item == nil {
			return false
		}
		return businessRecordValueContainsKeyword(*item, needle)
	case *float64:
		if item == nil {
			return false
		}
		return businessRecordValueContainsKeyword(*item, needle)
	case map[string]any:
		for key, nestedValue := range item {
			if businessRecordValueContainsKeyword(key, needle) ||
				businessRecordValueContainsKeyword(nestedValue, needle) {
				return true
			}
		}
		return false
	case []any:
		for _, nestedValue := range item {
			if businessRecordValueContainsKeyword(nestedValue, needle) {
				return true
			}
		}
		return false
	case *biz.BusinessRecordItem:
		return businessRecordValueContainsKeyword([]any{
			item.ItemName,
			item.MaterialName,
			item.Spec,
			item.Unit,
			item.Quantity,
			item.UnitPrice,
			item.Amount,
			item.SupplierName,
			item.WarehouseLocation,
			item.Payload,
		}, needle)
	default:
		text := strings.ToLower(strings.TrimSpace(fmt.Sprint(item)))
		return text != "" && strings.Contains(text, needle)
	}
}

func matchesBusinessRecordDateFilter(record *biz.BusinessRecord, filter biz.BusinessRecordFilter) bool {
	if filter.DateFilterKey == "" || (filter.DateRangeStart == "" && filter.DateRangeEnd == "") {
		return true
	}
	dateValue := businessRecordDateFilterValue(record, filter.DateFilterKey)
	if dateValue == "" {
		return false
	}
	if filter.DateRangeStart != "" && dateValue < filter.DateRangeStart {
		return false
	}
	if filter.DateRangeEnd != "" && dateValue > filter.DateRangeEnd {
		return false
	}
	return true
}

func businessRecordDateFilterValue(record *biz.BusinessRecord, key string) string {
	switch key {
	case "document_date":
		return comparableBusinessRecordDate(record.DocumentDate)
	case "due_date":
		return comparableBusinessRecordDate(record.DueDate)
	case "created_at":
		return record.CreatedAt.Format("2006-01-02")
	case "updated_at":
		return record.UpdatedAt.Format("2006-01-02")
	default:
		payloadKey, ok := strings.CutPrefix(key, "payload.")
		if !ok || payloadKey == "" {
			return ""
		}
		return comparableBusinessRecordDate(record.Payload[payloadKey])
	}
}

func comparableBusinessRecordDate(value any) string {
	switch item := value.(type) {
	case nil:
		return ""
	case *string:
		if item == nil {
			return ""
		}
		return comparableBusinessRecordDate(*item)
	case time.Time:
		return item.Format("2006-01-02")
	default:
		text := strings.TrimSpace(fmt.Sprint(item))
		if len(text) >= len("2006-01-02") {
			candidate := text[:len("2006-01-02")]
			if _, err := time.Parse("2006-01-02", candidate); err == nil {
				return candidate
			}
		}
		if _, err := time.Parse("2006-01-02", text); err == nil {
			return text
		}
		return ""
	}
}

func parseBusinessRecordDateStart(value string) (time.Time, bool) {
	if value == "" {
		return time.Time{}, false
	}
	date, err := time.ParseInLocation("2006-01-02", value, time.Local)
	return date, err == nil
}

func parseBusinessRecordDateEnd(value string) (time.Time, bool) {
	start, ok := parseBusinessRecordDateStart(value)
	if !ok {
		return time.Time{}, false
	}
	return start.AddDate(0, 0, 1).Add(-time.Nanosecond), true
}

func (r *businessRecordRepo) CreateBusinessRecord(ctx context.Context, in *biz.BusinessRecordMutation, actorID int) (*biz.BusinessRecord, error) {
	if in == nil || !biz.IsValidBusinessRecordModule(in.ModuleKey) {
		return nil, biz.ErrBadParam
	}
	return nil, biz.ErrBusinessRecordArchiveReadOnly
}

func (r *businessRecordRepo) UpdateBusinessRecord(ctx context.Context, id int, in *biz.BusinessRecordMutation, actorID int) (*biz.BusinessRecord, error) {
	if id <= 0 || in == nil {
		return nil, biz.ErrBadParam
	}
	_, err := r.data.postgres.BusinessRecord.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBusinessRecordNotFound
		}
		return nil, err
	}
	return nil, biz.ErrBusinessRecordArchiveReadOnly
}

func (r *businessRecordRepo) DeleteBusinessRecords(ctx context.Context, ids []int, deleteReason string, actorID int) (int, error) {
	if len(ids) == 0 {
		return 0, biz.ErrBadParam
	}
	rows, err := r.data.postgres.BusinessRecord.Query().
		Where(
			businessrecord.IDIn(ids...),
			businessrecord.DeletedAtIsNil(),
		).
		All(ctx)
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, nil
	}
	return 0, biz.ErrBusinessRecordArchiveReadOnly
}

func (r *businessRecordRepo) RestoreBusinessRecord(ctx context.Context, id int, actorID int) (*biz.BusinessRecord, error) {
	if id <= 0 {
		return nil, biz.ErrBadParam
	}
	_, err := r.data.postgres.BusinessRecord.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBusinessRecordNotFound
		}
		return nil, err
	}
	return nil, biz.ErrBusinessRecordArchiveReadOnly
}

func (r *businessRecordRepo) loadBusinessRecordItems(ctx context.Context, rows []*ent.BusinessRecord) (map[int][]*biz.BusinessRecordItem, error) {
	out := make(map[int][]*biz.BusinessRecordItem, len(rows))
	if len(rows) == 0 {
		return out, nil
	}
	ids := make([]int, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	itemRows, err := r.data.postgres.BusinessRecordItem.Query().
		Where(businessrecorditem.RecordIDIn(ids...)).
		Order(ent.Asc(businessrecorditem.FieldLineNo), ent.Asc(businessrecorditem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range itemRows {
		out[item.RecordID] = append(out[item.RecordID], entBusinessRecordItemToBiz(item))
	}
	return out, nil
}

func replaceBusinessRecordItems(ctx context.Context, tx *ent.Tx, recordID int, moduleKey string, items []*biz.BusinessRecordItemMutation) error {
	if _, err := tx.BusinessRecordItem.Delete().
		Where(businessrecorditem.RecordID(recordID)).
		Exec(ctx); err != nil {
		return err
	}
	for _, item := range items {
		builder := tx.BusinessRecordItem.Create().
			SetRecordID(recordID).
			SetModuleKey(moduleKey).
			SetLineNo(item.LineNo).
			SetNillableItemName(item.ItemName).
			SetNillableMaterialName(item.MaterialName).
			SetNillableSpec(item.Spec).
			SetNillableUnit(item.Unit).
			SetNillableQuantity(item.Quantity).
			SetNillableUnitPrice(item.UnitPrice).
			SetNillableAmount(item.Amount).
			SetNillableSupplierName(item.SupplierName).
			SetNillableWarehouseLocation(item.WarehouseLocation).
			SetPayload(item.Payload)
		if _, err := builder.Save(ctx); err != nil {
			return err
		}
	}
	return nil
}

func entBusinessRecordToBiz(row *ent.BusinessRecord) *biz.BusinessRecord {
	if row == nil {
		return nil
	}
	return &biz.BusinessRecord{
		ID:                row.ID,
		ModuleKey:         row.ModuleKey,
		DocumentNo:        row.DocumentNo,
		Title:             row.Title,
		BusinessStatusKey: row.BusinessStatusKey,
		OwnerRoleKey:      biz.NormalizeRoleKey(row.OwnerRoleKey),
		SourceNo:          row.SourceNo,
		CustomerName:      row.CustomerName,
		SupplierName:      row.SupplierName,
		StyleNo:           row.StyleNo,
		ProductNo:         row.ProductNo,
		ProductName:       row.ProductName,
		MaterialName:      row.MaterialName,
		WarehouseLocation: row.WarehouseLocation,
		Quantity:          row.Quantity,
		Unit:              row.Unit,
		Amount:            row.Amount,
		DocumentDate:      row.DocumentDate,
		DueDate:           row.DueDate,
		Payload:           row.Payload,
		RowVersion:        row.RowVersion,
		CreatedBy:         row.CreatedBy,
		UpdatedBy:         row.UpdatedBy,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
		DeletedAt:         row.DeletedAt,
		DeletedBy:         row.DeletedBy,
		DeleteReason:      row.DeleteReason,
	}
}

func entBusinessRecordItemToBiz(row *ent.BusinessRecordItem) *biz.BusinessRecordItem {
	if row == nil {
		return nil
	}
	return &biz.BusinessRecordItem{
		ID:                row.ID,
		RecordID:          row.RecordID,
		ModuleKey:         row.ModuleKey,
		LineNo:            row.LineNo,
		ItemName:          row.ItemName,
		MaterialName:      row.MaterialName,
		Spec:              row.Spec,
		Unit:              row.Unit,
		Quantity:          row.Quantity,
		UnitPrice:         row.UnitPrice,
		Amount:            row.Amount,
		SupplierName:      row.SupplierName,
		WarehouseLocation: row.WarehouseLocation,
		Payload:           row.Payload,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
}
