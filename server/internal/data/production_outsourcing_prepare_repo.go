package data

import (
	"context"
	"entgo.io/ent/dialect/sql"
	"fmt"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/productionordermaterialrequirement"
	"server/internal/data/model/ent/supplier"
	"time"
)

var _ biz.ProductionOutsourcingPrepareRepo = (*productionOrderRepo)(nil)

func (r *productionOrderRepo) PrepareProductionOutsourcing(ctx context.Context, in *biz.ProductionOutsourcingPrepare) (_ *biz.ProductionOutsourcingPrepared, resultErr error) {
	defer func() { resultErr = mapInventoryPersistenceError(resultErr, biz.ErrProductionOrderConflict) }()
	preflight, err := r.data.postgres.ProductionWIPBatch.Get(ctx, in.BatchID)
	if ent.IsNotFound(err) {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	if err != nil {
		return nil, err
	}
	tx, err := r.beginProductionOrderCommandTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() {
		if tx != nil && tx.sqlTx != nil {
			_ = tx.sqlTx.Rollback()
		}
	}()
	if err := r.lockProductionOrderCommandSource(ctx, tx.sqlTx, preflight.ProductionOrderID); err != nil {
		return nil, err
	}
	for _, scope := range []struct {
		table string
		id    int
	}{{"production_order_items", preflight.ProductionOrderItemID}, {"production_order_operations", preflight.ProductionOrderOperationID}, {"production_wip_batches", in.BatchID}} {
		if err := r.lockProductionWIPRows(ctx, tx.sqlTx, scope.table, []int{scope.id}); err != nil {
			return nil, err
		}
	}
	client := tx.client
	existing, err := client.OutsourcingOrder.Query().Where(outsourcingorder.SourceWipBatchID(in.BatchID), outsourcingorder.LifecycleStatusNEQ(biz.OutsourcingOrderStatusCanceled)).Only(ctx)
	if err == nil {
		if existing.SourceWipIntentHash == nil || *existing.SourceWipIntentHash != in.IntentHash {
			return nil, biz.ErrProductionOrderConflict
		}
		return &biz.ProductionOutsourcingPrepared{OutsourcingOrderID: existing.ID, OutsourcingOrderNo: existing.OutsourcingOrderNo}, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}
	batch, err := client.ProductionWIPBatch.Get(ctx, in.BatchID)
	if err != nil {
		return nil, err
	}
	if batch.Version != in.ExpectedVersion {
		return nil, biz.ErrProductionOrderConflict
	}
	order, err := client.ProductionOrder.Get(ctx, batch.ProductionOrderID)
	if err != nil {
		return nil, err
	}
	operation, err := client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
	if err != nil {
		return nil, err
	}
	if order.Status != biz.ProductionOrderStatusReleased || batch.Status != biz.ProductionWIPStatusPlanned || batch.ExecutionMode != nil || !operation.OutsourcingAllowed {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	process, err := client.Process.Get(ctx, operation.ProcessID)
	if err != nil {
		return nil, err
	}
	if !process.IsActive || !process.OutsourcingEnabled {
		return nil, biz.ErrProcessNotOutsourcingEnabled
	}
	vendor, err := client.Supplier.Query().Where(supplier.ID(in.SupplierID), supplier.IsActive(true)).Where(func(s *sql.Selector) { applyBOMReferenceShareLock(s, r.data.sqlDialect) }).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, biz.ErrSupplierInactive
	}
	if err != nil {
		return nil, err
	}
	item, err := client.ProductionOrderItem.Get(ctx, batch.ProductionOrderItemID)
	if err != nil {
		return nil, err
	}
	isFabric := operation.OperationCode == biz.ProductionWIPOperationFabricProcessing && batch.FlowType == biz.ProductionWIPFlowNormal
	var requirements []*ent.ProductionOrderMaterialRequirement
	if isFabric {
		if len(in.RequirementIDs) == 0 || batch.SourceBatchID != nil || !batch.Quantity.Equal(item.PlannedQuantity) {
			return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
		requirements, err = client.ProductionOrderMaterialRequirement.Query().Where(productionordermaterialrequirement.IDIn(in.RequirementIDs...), productionordermaterialrequirement.ProductionOrderItemID(item.ID)).Order(ent.Asc(productionordermaterialrequirement.FieldID)).All(ctx)
		if err != nil {
			return nil, err
		}
		if len(requirements) != len(in.RequirementIDs) {
			return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
	} else if len(in.RequirementIDs) > 0 {
		return nil, biz.ErrBadParam
	}
	// A frozen production requirement supplies quantities, while current master
	// data still controls whether a new purchasing document can be prepared.
	if isFabric {
		for _, req := range requirements {
			m, err := client.Material.Get(ctx, req.MaterialID)
			if err != nil {
				return nil, err
			}
			if !m.IsActive {
				return nil, biz.ErrMaterialInactive
			}
			u, err := client.Unit.Get(ctx, req.UnitID)
			if err != nil {
				return nil, err
			}
			if !u.IsActive {
				return nil, biz.ErrUnitInactive
			}
		}
	} else {
		p, err := client.Product.Get(ctx, item.ProductID)
		if err != nil {
			return nil, err
		}
		if !p.IsActive {
			return nil, biz.ErrProductInactive
		}
		u, err := client.Unit.Get(ctx, item.UnitID)
		if err != nil {
			return nil, err
		}
		if !u.IsActive {
			return nil, biz.ErrUnitInactive
		}
		if item.ProductSkuID != nil {
			sku, err := client.ProductSKU.Get(ctx, *item.ProductSkuID)
			if err != nil {
				return nil, err
			}
			if !sku.IsActive || sku.ProductID != item.ProductID || sku.DefaultUnitID == nil || *sku.DefaultUnitID != item.UnitID {
				return nil, biz.ErrProductSKUInactive
			}
		}
	}
	count, err := client.OutsourcingOrder.Query().Where(outsourcingorder.SourceWipBatchID(batch.ID)).Count(ctx)
	if err != nil {
		return nil, err
	}
	contract, err := client.OutsourcingOrder.Create().SetSourceWipBatchID(batch.ID).SetSourceWipIntentHash(in.IntentHash).SetSourceWipPreparedBy(in.ActorID).SetOutsourcingOrderNo(fmt.Sprintf("OS-WIP-%d-%d", batch.ID, count+1)).SetSupplierID(vendor.ID).SetCurrency("CNY").SetPaymentTermDays(vendor.DefaultPaymentTermDays).SetSupplierSnapshot(map[string]any{"code": vendor.Code, "name": vendor.Name}).SetSourceOrderNo(order.OrderNo).SetOrderDate(time.Now()).SetExpectedReturnDate(in.ExpectedReturnDate).SetNote(fmt.Sprintf("生产负责人 #%d 安排：%s", in.ActorID, operation.ProcessNameSnapshot)).Save(ctx)
	if err != nil {
		return nil, err
	}
	makeLine := func(lineNo int) *ent.OutsourcingOrderItemCreate {
		return client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(contract.ID).SetLineNo(lineNo).SetDisplayOrder(lineNo).SetProcessID(operation.ProcessID).SetProcessNameSnapshot(operation.ProcessNameSnapshot).SetNillableProcessCategorySnapshot(process.Category).SetProductOrderNoSnapshot(order.OrderNo).SetExpectedReturnDate(in.ExpectedReturnDate)
	}
	if isFabric {
		for i, req := range requirements {
			_, err = makeLine(i + 1).SetSubjectType(biz.OutsourcingOrderSubjectMaterial).SetMaterialID(req.MaterialID).SetUnitID(req.UnitID).SetMaterialCodeSnapshot(req.MaterialCodeSnapshot).SetMaterialNameSnapshot(req.MaterialNameSnapshot).SetUnitNameSnapshot(req.UnitNameSnapshot).SetOutsourcingQuantity(req.PlannedQuantity).Save(ctx)
			if err != nil {
				return nil, err
			}
		}
	} else {
		_, err = makeLine(1).SetSubjectType(biz.OutsourcingOrderSubjectProduct).SetProductID(item.ProductID).SetNillableProductSkuID(item.ProductSkuID).SetUnitID(item.UnitID).SetNillableProductNoSnapshot(item.ProductCodeSnapshot).SetNillableProductNameSnapshot(item.ProductNameSnapshot).SetNillableSkuCodeSnapshot(item.SkuCodeSnapshot).SetNillableUnitNameSnapshot(item.UnitNameSnapshot).SetOutsourcingQuantity(batch.Quantity).Save(ctx)
		if err != nil {
			return nil, err
		}
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	tx = nil
	return &biz.ProductionOutsourcingPrepared{OutsourcingOrderID: contract.ID, OutsourcingOrderNo: contract.OutsourcingOrderNo}, nil
}
