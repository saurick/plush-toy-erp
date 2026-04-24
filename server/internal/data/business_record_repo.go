package data

import (
	"context"
	"fmt"
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

func (r *businessRecordRepo) CountBusinessRecordsByModuleAndStatus(ctx context.Context) ([]biz.BusinessRecordModuleStatusCount, error) {
	type statusCountRow struct {
		ModuleKey         string `json:"module_key,omitempty"`
		BusinessStatusKey string `json:"business_status_key,omitempty"`
		Count             int    `json:"count,omitempty"`
	}

	rows := make([]statusCountRow, 0)
	err := r.data.postgres.BusinessRecord.Query().
		Where(businessrecord.DeletedAtIsNil()).
		GroupBy(businessrecord.FieldModuleKey, businessrecord.FieldBusinessStatusKey).
		Aggregate(ent.Count()).
		Scan(ctx, &rows)
	if err != nil {
		return nil, err
	}

	out := make([]biz.BusinessRecordModuleStatusCount, 0, len(rows))
	for _, row := range rows {
		out = append(out, biz.BusinessRecordModuleStatusCount{
			ModuleKey:         row.ModuleKey,
			BusinessStatusKey: row.BusinessStatusKey,
			Count:             row.Count,
		})
	}
	return out, nil
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
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	builder := tx.BusinessRecord.Create().
		SetModuleKey(in.ModuleKey).
		SetNillableDocumentNo(in.DocumentNo).
		SetTitle(in.Title).
		SetBusinessStatusKey(in.BusinessStatusKey).
		SetOwnerRoleKey(in.OwnerRoleKey).
		SetNillableSourceNo(in.SourceNo).
		SetNillableCustomerName(in.CustomerName).
		SetNillableSupplierName(in.SupplierName).
		SetNillableStyleNo(in.StyleNo).
		SetNillableProductNo(in.ProductNo).
		SetNillableProductName(in.ProductName).
		SetNillableMaterialName(in.MaterialName).
		SetNillableWarehouseLocation(in.WarehouseLocation).
		SetNillableQuantity(in.Quantity).
		SetNillableUnit(in.Unit).
		SetNillableAmount(in.Amount).
		SetNillableDocumentDate(in.DocumentDate).
		SetNillableDueDate(in.DueDate).
		SetPayload(in.Payload)
	if actorID > 0 {
		builder.SetCreatedBy(actorID).SetUpdatedBy(actorID)
	}

	row, err := builder.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, biz.ErrBusinessRecordExists
		}
		return nil, err
	}

	if in.DocumentNo == nil {
		generatedNo := fmt.Sprintf("%s%06d", biz.BusinessRecordDocumentPrefix(in.ModuleKey), row.ID)
		update := tx.BusinessRecord.UpdateOneID(row.ID).
			SetDocumentNo(generatedNo)
		if row.Title == "未命名单据" {
			update.SetTitle(generatedNo)
		}
		row, err = update.Save(ctx)
		if err != nil {
			if ent.IsConstraintError(err) {
				return nil, biz.ErrBusinessRecordExists
			}
			return nil, err
		}
	}

	if err := replaceBusinessRecordItems(ctx, tx, row.ID, row.ModuleKey, in.Items); err != nil {
		return nil, err
	}
	if err := createBusinessRecordEvent(ctx, tx, row.ID, row.ModuleKey, "created", nil, &row.BusinessStatusKey, actorID, "", ""); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil

	out := entBusinessRecordToBiz(row)
	out.Items = businessRecordItemMutationsToBiz(row.ID, row.ModuleKey, in.Items)
	return out, nil
}

func (r *businessRecordRepo) UpdateBusinessRecord(ctx context.Context, id int, in *biz.BusinessRecordMutation, actorID int) (*biz.BusinessRecord, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	current, err := tx.BusinessRecord.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBusinessRecordNotFound
		}
		return nil, err
	}
	if in.ExpectedRowVersion > 0 && current.RowVersion != in.ExpectedRowVersion {
		return nil, biz.ErrBusinessRecordVersionConflict
	}
	moduleKey := in.ModuleKey
	if moduleKey == "" {
		moduleKey = current.ModuleKey
	}

	update := tx.BusinessRecord.UpdateOneID(id).
		SetModuleKey(moduleKey).
		SetTitle(in.Title).
		SetBusinessStatusKey(in.BusinessStatusKey).
		SetOwnerRoleKey(in.OwnerRoleKey).
		SetPayload(in.Payload).
		AddRowVersion(1)
	setBusinessRecordString(update, "document_no", in.DocumentNo)
	setBusinessRecordString(update, "source_no", in.SourceNo)
	setBusinessRecordString(update, "customer_name", in.CustomerName)
	setBusinessRecordString(update, "supplier_name", in.SupplierName)
	setBusinessRecordString(update, "style_no", in.StyleNo)
	setBusinessRecordString(update, "product_no", in.ProductNo)
	setBusinessRecordString(update, "product_name", in.ProductName)
	setBusinessRecordString(update, "material_name", in.MaterialName)
	setBusinessRecordString(update, "warehouse_location", in.WarehouseLocation)
	setBusinessRecordString(update, "unit", in.Unit)
	setBusinessRecordString(update, "document_date", in.DocumentDate)
	setBusinessRecordString(update, "due_date", in.DueDate)
	setBusinessRecordFloat(update, "quantity", in.Quantity)
	setBusinessRecordFloat(update, "amount", in.Amount)
	if actorID > 0 {
		update.SetUpdatedBy(actorID)
	}

	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBusinessRecordNotFound
		}
		if ent.IsConstraintError(err) {
			return nil, biz.ErrBusinessRecordExists
		}
		return nil, err
	}

	if err := replaceBusinessRecordItems(ctx, tx, row.ID, row.ModuleKey, in.Items); err != nil {
		return nil, err
	}
	if err := createBusinessRecordEvent(ctx, tx, row.ID, row.ModuleKey, "updated", &current.BusinessStatusKey, &row.BusinessStatusKey, actorID, "", ""); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil

	out := entBusinessRecordToBiz(row)
	out.Items = businessRecordItemMutationsToBiz(row.ID, row.ModuleKey, in.Items)
	return out, nil
}

func (r *businessRecordRepo) DeleteBusinessRecords(ctx context.Context, ids []int, deleteReason string, actorID int) (int, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return 0, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	rows, err := tx.BusinessRecord.Query().
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

	now := time.Now()
	update := tx.BusinessRecord.Update().
		Where(
			businessrecord.IDIn(ids...),
			businessrecord.DeletedAtIsNil(),
		).
		SetDeletedAt(now).
		SetDeleteReason(deleteReason).
		AddRowVersion(1)
	if actorID > 0 {
		update.SetDeletedBy(actorID).SetUpdatedBy(actorID)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return 0, err
	}
	for _, row := range rows {
		if err := createBusinessRecordEvent(ctx, tx, row.ID, row.ModuleKey, "deleted", &row.BusinessStatusKey, &row.BusinessStatusKey, actorID, "", deleteReason); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	tx = nil
	return affected, nil
}

func (r *businessRecordRepo) RestoreBusinessRecord(ctx context.Context, id int, actorID int) (*biz.BusinessRecord, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	current, err := tx.BusinessRecord.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBusinessRecordNotFound
		}
		return nil, err
	}
	update := tx.BusinessRecord.UpdateOneID(id).
		ClearDeletedAt().
		ClearDeletedBy().
		ClearDeleteReason().
		AddRowVersion(1)
	if actorID > 0 {
		update.SetUpdatedBy(actorID)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBusinessRecordNotFound
		}
		return nil, err
	}
	if err := createBusinessRecordEvent(ctx, tx, row.ID, row.ModuleKey, "restored", &current.BusinessStatusKey, &row.BusinessStatusKey, actorID, "", ""); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil

	out := entBusinessRecordToBiz(row)
	itemsByRecordID, err := r.loadBusinessRecordItems(ctx, []*ent.BusinessRecord{row})
	if err != nil {
		return nil, err
	}
	out.Items = itemsByRecordID[row.ID]
	return out, nil
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

func createBusinessRecordEvent(ctx context.Context, tx *ent.Tx, recordID int, moduleKey string, actionKey string, fromStatus *string, toStatus *string, actorID int, actorRoleKey string, note string) error {
	builder := tx.BusinessRecordEvent.Create().
		SetRecordID(recordID).
		SetModuleKey(moduleKey).
		SetActionKey(actionKey).
		SetNillableFromStatusKey(fromStatus).
		SetNillableToStatusKey(toStatus).
		SetPayload(map[string]any{})
	if actorID > 0 {
		builder.SetActorID(actorID)
	}
	if actorRoleKey != "" {
		builder.SetActorRoleKey(actorRoleKey)
	}
	if note != "" {
		builder.SetNote(note)
	}
	_, err := builder.Save(ctx)
	return err
}

func setBusinessRecordString(update *ent.BusinessRecordUpdateOne, fieldName string, value *string) {
	switch fieldName {
	case "document_no":
		if value == nil {
			update.ClearDocumentNo()
		} else {
			update.SetDocumentNo(*value)
		}
	case "source_no":
		if value == nil {
			update.ClearSourceNo()
		} else {
			update.SetSourceNo(*value)
		}
	case "customer_name":
		if value == nil {
			update.ClearCustomerName()
		} else {
			update.SetCustomerName(*value)
		}
	case "supplier_name":
		if value == nil {
			update.ClearSupplierName()
		} else {
			update.SetSupplierName(*value)
		}
	case "style_no":
		if value == nil {
			update.ClearStyleNo()
		} else {
			update.SetStyleNo(*value)
		}
	case "product_no":
		if value == nil {
			update.ClearProductNo()
		} else {
			update.SetProductNo(*value)
		}
	case "product_name":
		if value == nil {
			update.ClearProductName()
		} else {
			update.SetProductName(*value)
		}
	case "material_name":
		if value == nil {
			update.ClearMaterialName()
		} else {
			update.SetMaterialName(*value)
		}
	case "warehouse_location":
		if value == nil {
			update.ClearWarehouseLocation()
		} else {
			update.SetWarehouseLocation(*value)
		}
	case "unit":
		if value == nil {
			update.ClearUnit()
		} else {
			update.SetUnit(*value)
		}
	case "document_date":
		if value == nil {
			update.ClearDocumentDate()
		} else {
			update.SetDocumentDate(*value)
		}
	case "due_date":
		if value == nil {
			update.ClearDueDate()
		} else {
			update.SetDueDate(*value)
		}
	}
}

func setBusinessRecordFloat(update *ent.BusinessRecordUpdateOne, fieldName string, value *float64) {
	switch fieldName {
	case "quantity":
		if value == nil {
			update.ClearQuantity()
		} else {
			update.SetQuantity(*value)
		}
	case "amount":
		if value == nil {
			update.ClearAmount()
		} else {
			update.SetAmount(*value)
		}
	}
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
		OwnerRoleKey:      row.OwnerRoleKey,
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

func businessRecordItemMutationsToBiz(recordID int, moduleKey string, items []*biz.BusinessRecordItemMutation) []*biz.BusinessRecordItem {
	out := make([]*biz.BusinessRecordItem, 0, len(items))
	for _, item := range items {
		out = append(out, &biz.BusinessRecordItem{
			RecordID:          recordID,
			ModuleKey:         moduleKey,
			LineNo:            item.LineNo,
			ItemName:          item.ItemName,
			MaterialName:      item.MaterialName,
			Spec:              item.Spec,
			Unit:              item.Unit,
			Quantity:          item.Quantity,
			UnitPrice:         item.UnitPrice,
			Amount:            item.Amount,
			SupplierName:      item.SupplierName,
			WarehouseLocation: item.WarehouseLocation,
			Payload:           item.Payload,
		})
	}
	return out
}
