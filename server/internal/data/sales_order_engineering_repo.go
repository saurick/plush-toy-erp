package data

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/engineeringmaterialrequest"
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
	if in.Complete {
		openIDs, err := tx.SalesOrderItem.Query().Where(salesorderitem.SalesOrderID(in.SalesOrderID), salesorderitem.LineStatus(biz.SalesOrderItemStatusOpen)).IDs(ctx)
		if err != nil {
			return nil, err
		}
		if len(openIDs) != len(in.Items) {
			return nil, biz.ErrSalesOrderEngineeringNotReady
		}
	}
	// Lock order and BOMs deterministically; completion must not upgrade shared
	// BOM locks while another order is activating the same versions.
	itemsToSave := append([]biz.SalesOrderEngineeringItemMutation(nil), in.Items...)
	sort.Slice(itemsToSave, func(i, j int) bool {
		a, b := itemsToSave[i], itemsToSave[j]
		if a.ProductID != b.ProductID {
			return a.ProductID < b.ProductID
		}
		if a.BOMID != nil && b.BOMID != nil && *a.BOMID != *b.BOMID {
			return *a.BOMID < *b.BOMID
		}
		return a.ID < b.ID
	})
	bomVersions := map[int]int64{}
	bomFingerprints := map[int]string{}
	for _, item := range itemsToSave {
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
		sourceChanged := current.ProductID != item.ProductID || !sameOptionalInt(current.ProductSkuID, item.ProductSkuID) || !sameOptionalInt(current.BomID, item.BOMID)
		if sourceChanged {
			if err := validateSalesOrderEngineeringDependencies(ctx, tx.Client(), item.ID); err != nil {
				return nil, err
			}
		}
		update := tx.SalesOrderItem.UpdateOneID(item.ID)
		if sourceChanged && !in.Complete {
			update.ClearBomFingerprint()
		}
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
		if item.BOMID == nil {
			update.ClearBomID()
		} else {
			update.SetBomID(*item.BOMID)
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
		if item.BOMID != nil {
			selectedBOM, err := tx.BOMHeader.Query().Where(bomheader.ID(*item.BOMID), bomheader.ProductID(item.ProductID), bomheader.StatusNEQ("ARCHIVED")).
				Where(func(s *sql.Selector) {
					if in.Complete && r.data.sqlDialect == dialect.Postgres {
						s.ForUpdate()
					} else {
						applyBOMReferenceShareLock(s, r.data.sqlDialect)
					}
				}).Only(ctx)
			if ent.IsNotFound(err) {
				return nil, biz.ErrSalesOrderEngineeringNotReady
			}
			if err != nil {
				return nil, err
			}
			version, seen := bomVersions[selectedBOM.ID]
			if !seen {
				version = selectedBOM.UpdatedAt.UnixMicro()
				bomVersions[selectedBOM.ID] = version
			}
			if version != item.ExpectedBOMVersion {
				return nil, biz.ErrSalesOrderConflict
			}
			if in.Complete {
				fingerprint = bomFingerprints[selectedBOM.ID]
				if fingerprint == "" {
					if _, err := activateBOMVersion(ctx, tx.Client(), selectedBOM.ID, r.data.sqlDialect); err != nil {
						if err == biz.ErrBadParam || err == biz.ErrMaterialInactive || err == biz.ErrUnitInactive {
							return nil, biz.ErrSalesOrderEngineeringNotReady
						}
						return nil, err
					}
					fingerprint, err = salesOrderBOMFingerprint(ctx, tx.Client(), selectedBOM, r.data.sqlDialect)
					if err != nil {
						return nil, err
					}
					bomFingerprints[selectedBOM.ID] = fingerprint
				}
				update.SetBomFingerprint(fingerprint)
			}
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
	if in.Complete {
		preview, err := r.buildEngineeringMaterialSources(ctx, tx.Client(), order, true)
		if err != nil {
			return nil, err
		}
		if len(preview.Issues) > 0 || len(preview.Items) == 0 {
			return nil, biz.ErrMaterialRequestNotReady
		}
		if err := r.submitReadyEngineeringMaterials(ctx, tx.Client(), order, in.ActorID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return &biz.SalesOrderWithItems{Order: entSalesOrderToBiz(order), Items: entSalesOrderItemsToBiz(items)}, nil
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

// Completion binds the manufacturing content used by material review and release.
// Lifecycle changes do not change that content; material and consumption edits do.
func salesOrderBOMFingerprint(ctx context.Context, client *ent.Client, header *ent.BOMHeader, sqlDialect string) (string, error) {
	parts, err := client.BOMItem.Query().Where(bomitem.BomHeaderID(header.ID)).Order(ent.Asc(bomitem.FieldID)).
		WithMaterial(func(q *ent.MaterialQuery) {
			q.Where(func(s *sql.Selector) { applyBOMReferenceShareLock(s, sqlDialect) })
		}).All(ctx)
	if err != nil {
		return "", err
	}
	return salesOrderBOMFingerprintFromParts(header, parts)
}

func salesOrderBOMFingerprintFromParts(header *ent.BOMHeader, parts []*ent.BOMItem) (string, error) {
	content := []any{header.ProductID, header.Version}
	for _, part := range parts {
		m, err := part.Edges.MaterialOrErr()
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
