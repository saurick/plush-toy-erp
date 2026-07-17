package data

import (
	"context"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/unit"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
)

func (r *inventoryRepo) SaveBOMWithItems(ctx context.Context, id int, in *biz.BOMVersionMutation, items []*biz.BOMItemSaveMutation) (*biz.BOMVersionDetail, error) {
	if in == nil || id < 0 || in.ProductID <= 0 || (id == 0 && in.ExpectedVersion != 0) || (id > 0 && in.ExpectedVersion <= 0) {
		return nil, biz.ErrBadParam
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() {
		if tx != nil {
			rollbackEntTx(ctx, tx, r.log)
		}
	}()

	var headerRow *ent.BOMHeader
	if id == 0 {
		for _, item := range items {
			if item == nil || item.ID != 0 {
				return nil, biz.ErrBadParam
			}
		}
		if err := validateBOMSaveReferences(ctx, tx, r.data.sqlDialect, in.ProductID, items); err != nil {
			return nil, err
		}
		editTime := nextBOMEditTime(0)
		headerRow, err = tx.BOMHeader.Create().
			SetProductID(in.ProductID).
			SetVersion(in.Version).
			SetStatus(biz.BOMStatusDraft).
			SetNillableEffectiveFrom(in.EffectiveFrom).
			SetNillableEffectiveTo(in.EffectiveTo).
			SetNillableSourceOrderNo(in.SourceOrderNo).
			SetNillableQuantityText(in.QuantityText).
			SetNillableSpareText(in.SpareText).
			SetNillablePrintDate(in.PrintDate).
			SetNillableDesigner(in.Designer).
			SetNillableMaker(in.Maker).
			SetNillableAuditor(in.Auditor).
			SetNillableHairDirection(in.HairDirection).
			SetNillableNote(in.Note).
			SetUpdatedAt(editTime).
			Save(ctx)
		if err != nil {
			return nil, err
		}
	} else {
		current, err := tx.BOMHeader.Get(ctx, id)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrBOMHeaderNotFound
			}
			return nil, err
		}
		if current.Status != biz.BOMStatusDraft {
			return nil, biz.ErrBOMActiveImmutable
		}
		if current.ProductID != in.ProductID {
			return nil, biz.ErrBadParam
		}

		existingItems, err := tx.BOMItem.Query().
			Where(bomitem.BomHeaderID(id)).
			All(ctx)
		if err != nil {
			return nil, err
		}
		existingByID := make(map[int]*ent.BOMItem, len(existingItems))
		for _, item := range existingItems {
			existingByID[item.ID] = item
		}
		seenItemIDs := make(map[int]struct{}, len(items))
		for _, item := range items {
			if item == nil || item.ID < 0 {
				return nil, biz.ErrBadParam
			}
			if item.ID == 0 {
				continue
			}
			if _, duplicate := seenItemIDs[item.ID]; duplicate {
				return nil, biz.ErrBadParam
			}
			if _, exists := existingByID[item.ID]; !exists {
				return nil, biz.ErrBOMItemNotFound
			}
			seenItemIDs[item.ID] = struct{}{}
		}
		if err := validateBOMSaveReferences(ctx, tx, r.data.sqlDialect, in.ProductID, items); err != nil {
			return nil, err
		}

		expectedStart := time.UnixMicro(in.ExpectedVersion).UTC()
		nextEditTime := nextBOMEditTime(in.ExpectedVersion)
		update := tx.BOMHeader.Update().
			Where(
				bomheader.ID(id),
				bomheader.Status(biz.BOMStatusDraft),
				bomheader.UpdatedAtGTE(expectedStart),
				bomheader.UpdatedAtLT(expectedStart.Add(time.Microsecond)),
			).
			SetVersion(in.Version).
			SetUpdatedAt(nextEditTime)
		applyBOMHeaderOptionalUpdate(update, in)
		affected, err := update.Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected == 0 {
			latest, err := tx.BOMHeader.Get(ctx, id)
			if err != nil {
				if ent.IsNotFound(err) {
					return nil, biz.ErrBOMHeaderNotFound
				}
				return nil, err
			}
			if latest.Status != biz.BOMStatusDraft {
				return nil, biz.ErrBOMActiveImmutable
			}
			return nil, biz.ErrBOMVersionConflict
		}
		headerRow, err = tx.BOMHeader.Get(ctx, id)
		if err != nil {
			return nil, err
		}

		for _, item := range items {
			if item.ID == 0 {
				if _, err := createBOMSaveItem(ctx, tx, id, item); err != nil {
					return nil, err
				}
				continue
			}
			update := tx.BOMItem.Update().
				Where(bomitem.ID(item.ID), bomitem.BomHeaderID(id)).
				SetMaterialID(item.MaterialID).
				SetQuantity(item.Quantity).
				SetUnitID(item.UnitID).
				SetLossRate(item.LossRate)
			applyBOMItemOptionalUpdate(update, &item.BOMItemUpdate)
			affected, err := update.Save(ctx)
			if err != nil {
				return nil, err
			}
			if affected != 1 {
				return nil, biz.ErrBOMItemNotFound
			}
		}
		for _, existing := range existingItems {
			if _, retained := seenItemIDs[existing.ID]; retained {
				continue
			}
			if err := tx.BOMItem.DeleteOneID(existing.ID).Exec(ctx); err != nil {
				return nil, err
			}
		}
	}

	if id == 0 {
		for _, item := range items {
			if _, err := createBOMSaveItem(ctx, tx, headerRow.ID, item); err != nil {
				return nil, err
			}
		}
	}
	itemRows, err := tx.BOMItem.Query().
		Where(bomitem.BomHeaderID(headerRow.ID)).
		Order(ent.Asc(bomitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return &biz.BOMVersionDetail{
		Header: entBOMHeaderToBiz(headerRow),
		Items:  bomItemRowsToBiz(itemRows),
	}, nil
}

func bomItemRowsToBiz(rows []*ent.BOMItem) []*biz.BOMItem {
	out := make([]*biz.BOMItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, entBOMItemToBiz(row))
	}
	return out
}

func validateBOMSaveReferences(ctx context.Context, tx *ent.Tx, sqlDialect string, productID int, items []*biz.BOMItemSaveMutation) error {
	productQuery := tx.Product.Query().Where(product.ID(productID))
	if sqlDialect == dialect.Postgres {
		productQuery = productQuery.Where(func(selector *entsql.Selector) {
			applyBOMReferenceShareLock(selector, sqlDialect)
		})
	}
	productRow, err := productQuery.Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProductInactive
		}
		return err
	}
	if !productRow.IsActive {
		return biz.ErrProductInactive
	}

	materialIDs := make(map[int]struct{}, len(items))
	unitIDs := make(map[int]struct{}, len(items))
	for _, item := range items {
		if item == nil || item.MaterialID <= 0 || item.UnitID <= 0 {
			return biz.ErrBadParam
		}
		materialIDs[item.MaterialID] = struct{}{}
		unitIDs[item.UnitID] = struct{}{}
	}
	materialIDList := make([]int, 0, len(materialIDs))
	for id := range materialIDs {
		materialIDList = append(materialIDList, id)
	}
	if len(materialIDList) > 0 {
		query := tx.Material.Query().
			Where(material.IDIn(materialIDList...)).
			Order(ent.Asc(material.FieldID))
		if sqlDialect == dialect.Postgres {
			query = query.Where(func(selector *entsql.Selector) {
				applyBOMReferenceShareLock(selector, sqlDialect)
			})
		}
		rows, err := query.All(ctx)
		if err != nil {
			return err
		}
		if len(rows) != len(materialIDList) {
			return biz.ErrMaterialInactive
		}
		for _, row := range rows {
			if !row.IsActive {
				return biz.ErrMaterialInactive
			}
		}
	}
	unitIDList := make([]int, 0, len(unitIDs))
	for id := range unitIDs {
		unitIDList = append(unitIDList, id)
	}
	if len(unitIDList) > 0 {
		query := tx.Unit.Query().
			Where(unit.IDIn(unitIDList...)).
			Order(ent.Asc(unit.FieldID))
		if sqlDialect == dialect.Postgres {
			query = query.Where(func(selector *entsql.Selector) {
				applyBOMReferenceShareLock(selector, sqlDialect)
			})
		}
		rows, err := query.All(ctx)
		if err != nil {
			return err
		}
		if len(rows) != len(unitIDList) {
			return biz.ErrUnitInactive
		}
		for _, row := range rows {
			if !row.IsActive {
				return biz.ErrUnitInactive
			}
		}
	}
	return nil
}

func applyBOMReferenceShareLock(selector *entsql.Selector, sqlDialect string) {
	if selector != nil && sqlDialect == dialect.Postgres {
		selector.ForShare()
	}
}

func nextBOMEditTime(expectedVersion int64) time.Time {
	next := time.Now().UTC().UnixMicro()
	if next <= expectedVersion {
		next = expectedVersion + 1
	}
	if next <= 0 {
		next = 1
	}
	return time.UnixMicro(next).UTC()
}

func applyBOMHeaderOptionalUpdate(update *ent.BOMHeaderUpdate, in *biz.BOMVersionMutation) {
	if in.EffectiveFrom == nil {
		update.ClearEffectiveFrom()
	} else {
		update.SetEffectiveFrom(*in.EffectiveFrom)
	}
	if in.EffectiveTo == nil {
		update.ClearEffectiveTo()
	} else {
		update.SetEffectiveTo(*in.EffectiveTo)
	}
	if in.SourceOrderNo == nil {
		update.ClearSourceOrderNo()
	} else {
		update.SetSourceOrderNo(*in.SourceOrderNo)
	}
	if in.QuantityText == nil {
		update.ClearQuantityText()
	} else {
		update.SetQuantityText(*in.QuantityText)
	}
	if in.SpareText == nil {
		update.ClearSpareText()
	} else {
		update.SetSpareText(*in.SpareText)
	}
	if in.PrintDate == nil {
		update.ClearPrintDate()
	} else {
		update.SetPrintDate(*in.PrintDate)
	}
	if in.Designer == nil {
		update.ClearDesigner()
	} else {
		update.SetDesigner(*in.Designer)
	}
	if in.Maker == nil {
		update.ClearMaker()
	} else {
		update.SetMaker(*in.Maker)
	}
	if in.Auditor == nil {
		update.ClearAuditor()
	} else {
		update.SetAuditor(*in.Auditor)
	}
	if in.HairDirection == nil {
		update.ClearHairDirection()
	} else {
		update.SetHairDirection(*in.HairDirection)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
}

func createBOMSaveItem(ctx context.Context, tx *ent.Tx, headerID int, item *biz.BOMItemSaveMutation) (*ent.BOMItem, error) {
	return tx.BOMItem.Create().
		SetBomHeaderID(headerID).
		SetMaterialID(item.MaterialID).
		SetQuantity(item.Quantity).
		SetUnitID(item.UnitID).
		SetLossRate(item.LossRate).
		SetNillablePosition(item.Position).
		SetNillablePieceCount(item.PieceCount).
		SetNillableTotalUsageSnapshot(item.TotalUsageSnapshot).
		SetNillableProcessBase(item.ProcessBase).
		SetNillableProcessMethod(item.ProcessMethod).
		SetNillableProductionOperationCode(item.ProductionOperationCode).
		SetNillableNote(item.Note).
		Save(ctx)
}

func applyBOMItemOptionalUpdate(update *ent.BOMItemUpdate, in *biz.BOMItemUpdate) {
	if in.Position == nil {
		update.ClearPosition()
	} else {
		update.SetPosition(*in.Position)
	}
	if in.PieceCount == nil {
		update.ClearPieceCount()
	} else {
		update.SetPieceCount(*in.PieceCount)
	}
	if in.TotalUsageSnapshot == nil {
		update.ClearTotalUsageSnapshot()
	} else {
		update.SetTotalUsageSnapshot(*in.TotalUsageSnapshot)
	}
	if in.ProcessBase == nil {
		update.ClearProcessBase()
	} else {
		update.SetProcessBase(*in.ProcessBase)
	}
	if in.ProcessMethod == nil {
		update.ClearProcessMethod()
	} else {
		update.SetProcessMethod(*in.ProcessMethod)
	}
	if in.ProductionOperationCode == nil {
		update.ClearProductionOperationCode()
	} else {
		update.SetProductionOperationCode(*in.ProductionOperationCode)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
}
