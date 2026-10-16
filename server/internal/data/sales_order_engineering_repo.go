package data

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/businessattachment"
	"server/internal/data/model/ent/engineeringmaterialrequest"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/shipmentitem"
	"server/internal/data/model/ent/stockreservation"
)

var _ biz.SalesOrderEngineeringRepo = (*salesOrderRepo)(nil)

func (r *salesOrderRepo) SaveSalesOrderEngineering(ctx context.Context, in *biz.SalesOrderEngineeringMutation) (*biz.SalesOrderWithItems, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { rollbackEntTx(ctx, tx, r.log) }()
	affected, err := tx.SalesOrder.Update().Where(
		salesorder.ID(in.SalesOrderID), salesorder.Version(in.ExpectedVersion),
		salesorder.LifecycleStatusIn(biz.SalesOrderStatusDraft, biz.SalesOrderStatusSubmitted, biz.SalesOrderStatusActive),
	).AddVersion(1).Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrSalesOrderConflict
	}
	locked, err := tx.EngineeringMaterialRequest.Query().Where(engineeringmaterialrequest.SalesOrderID(in.SalesOrderID), engineeringmaterialrequest.StatusNEQ(biz.MaterialRequestRejected)).Exist(ctx)
	if err != nil {
		return nil, err
	}
	if locked {
		return nil, biz.ErrSalesOrderEngineeringDependency
	}
	parent, err := tx.SalesOrder.Get(ctx, in.SalesOrderID)
	if err != nil {
		return nil, err
	}
	for _, item := range in.Items {
		query := tx.SalesOrderItem.Query().Where(salesorderitem.ID(item.ID), salesorderitem.SalesOrderID(in.SalesOrderID))
		if r.data.sqlDialect == dialect.Postgres {
			query = query.Where(func(s *sql.Selector) { s.ForUpdate() })
		}
		current, err := query.Only(ctx)
		if ent.IsNotFound(err) {
			return nil, biz.ErrSalesOrderItemNotFound
		}
		if err != nil {
			return nil, err
		}
		if current.LineStatus != biz.SalesOrderItemStatusOpen {
			return nil, biz.ErrBadParam
		}
		sourceChanged := current.ProductID != item.ProductID || !sameOptionalInt(current.ProductSkuID, item.ProductSkuID) || !sameOptionalInt(current.SampleBomID, item.SampleBOMID)
		if item.ReuseConfirmedSample && (current.OrderCategory != "REPEAT" || item.EngineeringStatus != biz.SalesOrderEngineeringConfirmed) {
			return nil, biz.ErrSalesOrderEngineeringTransition
		}
		statusChanged := current.EngineeringStatus != item.EngineeringStatus
		if sourceChanged || statusChanged {
			if err := validateSalesOrderEngineeringDependencies(ctx, tx.Client(), item.ID); err != nil {
				return nil, err
			}
		}
		if sourceChanged && item.EngineeringStatus != biz.SalesOrderEngineeringPreparing && !item.ReuseConfirmedSample {
			return nil, biz.ErrSalesOrderEngineeringTransition
		}
		if item.EngineeringStatus == biz.SalesOrderEngineeringConfirmed && item.SampleNote == nil {
			return nil, biz.ErrSalesOrderEngineeringTransition
		}
		if statusChanged {
			switch item.EngineeringStatus {
			case biz.SalesOrderEngineeringConfirmed:
				if (!item.ReuseConfirmedSample && current.EngineeringStatus != biz.SalesOrderEngineeringSampling) || item.SampleNote == nil {
					return nil, biz.ErrSalesOrderEngineeringTransition
				}
			case biz.SalesOrderEngineeringSampling:
				if current.EngineeringStatus != biz.SalesOrderEngineeringPreparing {
					return nil, biz.ErrSalesOrderEngineeringTransition
				}
			case biz.SalesOrderEngineeringPreparing:
				if item.SampleNote == nil {
					return nil, biz.ErrSalesOrderEngineeringTransition
				}
			}
		}
		update := tx.SalesOrderItem.UpdateOneID(item.ID).SetEngineeringStatus(item.EngineeringStatus)
		if item.ProductID == 0 {
			update.ClearProductID()
		} else {
			update.SetProductID(item.ProductID)
		}
		if item.ProductSkuID == nil {
			update.ClearProductSkuID()
		} else {
			update.SetProductSkuID(*item.ProductSkuID)
		}
		if item.SampleBOMID == nil {
			update.ClearSampleBomID()
		} else {
			update.SetSampleBomID(*item.SampleBOMID)
		}
		if item.SampleNote == nil {
			update.ClearSampleNote()
		} else {
			update.SetSampleNote(*item.SampleNote)
		}
		if item.ProductID > 0 {
			p, err := tx.Product.Query().Where(product.ID(item.ProductID), product.IsActive(true)).
				Where(func(s *sql.Selector) { applyBOMReferenceShareLock(s, r.data.sqlDialect) }).Only(ctx)
			if ent.IsNotFound(err) {
				return nil, biz.ErrProductNotFound
			}
			if err != nil {
				return nil, err
			}
			code, name := p.Code, p.Name
			var color *string
			if item.ProductSkuID != nil {
				sku, err := tx.ProductSKU.Query().Where(productsku.ID(*item.ProductSkuID), productsku.ProductID(p.ID), productsku.IsActive(true)).
					Where(func(s *sql.Selector) { applyBOMReferenceShareLock(s, r.data.sqlDialect) }).Only(ctx)
				if ent.IsNotFound(err) {
					return nil, biz.ErrProductSKUNotFound
				}
				if err != nil {
					return nil, err
				}
				code, color = sku.SkuCode, sku.Color
				if sku.SkuName != nil && *sku.SkuName != "" {
					name = *sku.SkuName
				}
			}
			if current.ProductID != item.ProductID || !sameOptionalInt(current.ProductSkuID, item.ProductSkuID) || current.ProductNameSnapshot == nil {
				update.SetProductCodeSnapshot(code).SetProductNameSnapshot(name)
				if color == nil {
					update.ClearColorSnapshot()
				} else {
					update.SetColorSnapshot(*color)
				}
			}
		} else {
			update.ClearProductCodeSnapshot().ClearProductNameSnapshot().ClearColorSnapshot()
		}
		fingerprint := ""
		if item.SampleBOMID != nil {
			selectedBOM, err := tx.BOMHeader.Query().Where(bomheader.ID(*item.SampleBOMID), bomheader.ProductID(item.ProductID), bomheader.StatusNEQ("ARCHIVED")).
				Where(func(s *sql.Selector) { applyBOMReferenceShareLock(s, r.data.sqlDialect) }).Only(ctx)
			if ent.IsNotFound(err) {
				return nil, biz.ErrSalesOrderEngineeringNotReady
			}
			if err != nil {
				return nil, err
			}
			fingerprint, err = salesOrderBOMFingerprint(ctx, tx.Client(), selectedBOM, r.data.sqlDialect)
			if err != nil {
				return nil, err
			}
			if selectedBOM.UpdatedAt.UnixMicro() != item.ExpectedBOMVersion {
				return nil, biz.ErrSalesOrderConflict
			}
		}
		if item.EngineeringStatus != biz.SalesOrderEngineeringPreparing {
			if err := validateSalesOrderSamplingSources(ctx, tx.Client(), item.ProductID, *item.SampleBOMID); err != nil {
				return nil, err
			}
			imageID, err := currentSalesOrderSampleImage(ctx, tx.Client(), item.ProductID)
			if err != nil {
				return nil, err
			}
			if item.ReuseConfirmedSample {
				query := tx.SalesOrderItem.Query().Where(salesorderitem.IDLT(current.ID), salesorderitem.SalesOrderIDNEQ(parent.ID), salesorderitem.LineStatusNEQ(biz.SalesOrderItemStatusCanceled), salesorderitem.ProductID(item.ProductID), salesorderitem.SampleBomID(*item.SampleBOMID), salesorderitem.SampleBomFingerprint(fingerprint), salesorderitem.SampleImageAttachmentID(imageID), salesorderitem.EngineeringStatus(biz.SalesOrderEngineeringConfirmed), salesorderitem.HasSalesOrderWith(salesorder.CustomerID(parent.CustomerID), salesorder.LifecycleStatusIn(biz.SalesOrderStatusActive, biz.SalesOrderStatusClosed)))
				if item.ProductSkuID == nil {
					query.Where(salesorderitem.ProductSkuIDIsNil())
				} else {
					query.Where(salesorderitem.ProductSkuID(*item.ProductSkuID))
				}
				previous, err := query.Order(ent.Desc(salesorderitem.FieldID)).First(ctx)
				if ent.IsNotFound(err) {
					return nil, biz.ErrSalesOrderEngineeringNotReady
				}
				if err != nil {
					return nil, err
				}
				update.SetSampleReusedFromItemID(previous.ID)
			} else if item.EngineeringStatus == biz.SalesOrderEngineeringConfirmed && (current.SampleBomFingerprint == nil || *current.SampleBomFingerprint != fingerprint || current.SampleImageAttachmentID == nil || *current.SampleImageAttachmentID != imageID) {
				return nil, biz.ErrSalesOrderEngineeringNotReady
			}
			update.SetSampleBomFingerprint(fingerprint).SetSampleImageAttachmentID(imageID)
		} else {
			update.ClearSampleBomFingerprint().ClearSampleImageAttachmentID().ClearSampleReusedFromItemID()
		}
		if item.EngineeringStatus != biz.SalesOrderEngineeringConfirmed {
			update.ClearSampleConfirmedAt().ClearSampleConfirmedBy()
		} else if current.EngineeringStatus != biz.SalesOrderEngineeringConfirmed {
			update.SetSampleConfirmedAt(time.Now()).SetSampleConfirmedBy(in.ActorID)
		}
		if _, err := update.Save(ctx); err != nil {
			return nil, err
		}
	}
	order, err := tx.SalesOrder.Get(ctx, in.SalesOrderID)
	if err != nil {
		return nil, err
	}
	items, err := tx.SalesOrderItem.Query().Where(salesorderitem.SalesOrderID(in.SalesOrderID)).Order(sourceDocumentItemOrder(salesorderitem.FieldDisplayOrder, salesorderitem.FieldLineNo, salesorderitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return &biz.SalesOrderWithItems{Order: entSalesOrderToBiz(order), Items: entSalesOrderItemsToBiz(items)}, nil
}

func validateSalesOrderSamplingSources(ctx context.Context, client *ent.Client, productID, bomID int) error {
	imageID, err := currentSalesOrderSampleImage(ctx, client, productID)
	if err != nil {
		return err
	}
	hasMaterials, err := client.BOMItem.Query().Where(bomitem.BomHeaderID(bomID)).Exist(ctx)
	if err != nil {
		return err
	}
	if imageID == 0 || !hasMaterials {
		return biz.ErrSalesOrderEngineeringNotReady
	}
	return nil
}

func currentSalesOrderSampleImage(ctx context.Context, client *ent.Client, productID int) (int, error) {
	row, err := client.BusinessAttachment.Query().Where(
		businessattachment.OwnerTypeEQ(biz.BusinessAttachmentOwnerProduct), businessattachment.OwnerID(productID),
		businessattachment.AttachmentTypeEQ(biz.BusinessAttachmentTypeProductImage),
		businessattachment.SlotKeyEQ(biz.BusinessAttachmentProductImageSlotPrimary), businessattachment.WithdrawnAtIsNil(),
	).Only(ctx)
	if ent.IsNotFound(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return row.ID, nil
}

func validateSalesOrderEngineeringDependencies(ctx context.Context, client *ent.Client, itemID int) error {
	hasShipment, err := client.ShipmentItem.Query().Where(shipmentitem.SalesOrderItemID(itemID), shipmentitem.HasShipmentWith(shipment.StatusNEQ(biz.ShipmentStatusCancelled))).Exist(ctx)
	if err != nil {
		return err
	}
	hasReservation, err := client.StockReservation.Query().Where(stockreservation.SalesOrderItemID(itemID), stockreservation.Status(biz.StockReservationStatusActive)).Exist(ctx)
	if err != nil {
		return err
	}
	hasProduction, err := client.ProductionOrderItem.Query().Where(productionorderitem.SalesOrderItemID(itemID), productionorderitem.HasProductionOrderWith(productionorder.StatusNEQ(biz.ProductionOrderStatusCancelled))).Exist(ctx)
	if err != nil {
		return err
	}
	if hasShipment || hasReservation || hasProduction {
		return biz.ErrSalesOrderEngineeringDependency
	}
	return nil
}

// The approval binds manufacturing content. Activating an unchanged draft does
// not change the sample; edits to material, consumption or process do.
func salesOrderBOMFingerprint(ctx context.Context, client *ent.Client, header *ent.BOMHeader, sqlDialect string) (string, error) {
	parts, err := client.BOMItem.Query().Where(bomitem.BomHeaderID(header.ID)).Order(ent.Asc(bomitem.FieldID)).All(ctx)
	if err != nil {
		return "", err
	}
	content := []any{header.ProductID, header.Version}
	for _, part := range parts {
		m, err := client.Material.Query().Where(material.ID(part.MaterialID)).Where(func(s *sql.Selector) { applyBOMReferenceShareLock(s, sqlDialect) }).Only(ctx)
		if err != nil {
			return "", err
		}
		content = append(content, []any{m.ID, m.SupplierID, m.SupplierItemNo, m.Color, m.Spec, m.DefaultUnitID})
		content = append(content, []any{part.ID, part.MaterialID, part.UnitID, part.Quantity.String(), part.LossRate.String(), part.Position, part.PieceCount, part.ProcessBase, part.ProcessMethod})
	}
	payload, err := json.Marshal(content)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}
