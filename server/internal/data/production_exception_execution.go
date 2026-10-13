package data

import (
	"context"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorderoperation"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"
)

func (r *operationalFactRepo) GetProductionExceptionContext(ctx context.Context, inspectionID int) (*biz.ProductionExceptionContext, error) {
	client := r.data.postgres
	inspection, err := client.QualityInspection.Get(ctx, inspectionID)
	if err != nil || inspection.ProductionWipBatchID == nil {
		return nil, biz.ErrProductionExceptionSourceInvalid
	}
	batch, inspection, err := productionExceptionWIPSource(ctx, client, *inspection.ProductionWipBatchID, inspectionID)
	if err != nil || batch.Status != biz.ProductionWIPStatusRejected || inspection.Status != biz.QualityInspectionStatusRejected {
		return nil, biz.ErrProductionExceptionSourceInvalid
	}
	operation, err := client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
	if err != nil {
		return nil, err
	}
	item, err := client.ProductionOrderItem.Get(ctx, batch.ProductionOrderItemID)
	if err != nil {
		return nil, err
	}
	unit, err := client.Unit.Get(ctx, item.UnitID)
	if err != nil {
		return nil, err
	}
	fabric, err := client.ProductionOrderOperation.Query().Where(productionorderoperation.ProductionOrderItemID(item.ID), productionorderoperation.OperationCode(biz.ProductionWIPOperationFabricProcessing)).Only(ctx)
	if err != nil {
		return nil, biz.ErrProductionExceptionSourceInvalid
	}
	result := &biz.ProductionExceptionContext{ProductionOrderID: batch.ProductionOrderID, ProductionOrderItemID: item.ID, BatchID: batch.ID, BatchNo: batch.BatchNo, Quantity: batch.Quantity.String(), UnitPrecision: unit.Precision, UnitName: unit.Name, OperationID: operation.ID, OperationName: operation.ProcessNameSnapshot, FabricOperationID: fabric.ID}
	allocations, err := client.ProductionWIPOutsourcingAllocation.Query().Where(productionwipoutsourcingallocation.ProductionWipBatchID(batch.ID)).WithOutsourcingOrderItem(func(q *ent.OutsourcingOrderItemQuery) {
		q.WithOutsourcingOrder(func(q *ent.OutsourcingOrderQuery) { q.WithSupplier() })
	}).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, allocation := range allocations {
		line, err := allocation.Edges.OutsourcingOrderItemOrErr()
		if err != nil {
			return nil, err
		}
		contract, err := line.Edges.OutsourcingOrderOrErr()
		if err != nil {
			return nil, err
		}
		vendor, err := contract.Edges.SupplierOrErr()
		if err != nil {
			return nil, err
		}
		id := vendor.ID
		result.OriginalSupplierID, result.OriginalSupplierName = &id, vendor.Name
	}
	result.StockDispositionRequired, err = client.ProductionFact.Query().Where(productionfact.ProductionWipBatchID(batch.ID), productionfact.FactType(biz.ProductionFactFinishedGoodsReceipt), productionfact.StatusNEQ(biz.OperationalFactStatusCancelled)).Exist(ctx)
	return result, err
}

// A decision freezes the destination; execution must not silently substitute a
// different supplier or turn fresh-material replacement into product rework.
func validateProductionExceptionTarget(ctx context.Context, client *ent.Client, source *ent.ProductionWIPBatch, kind string, operationID, supplierID *int) error {
	if !biz.ProductionExceptionCreatesBatch(kind) {
		if operationID != nil || supplierID != nil {
			return biz.ErrProductionExceptionSourceInvalid
		}
		return nil
	}
	if operationID == nil {
		return biz.ErrProductionExceptionSourceInvalid
	}
	target, err := client.ProductionOrderOperation.Get(ctx, *operationID)
	if err != nil || target.ProductionOrderItemID != source.ProductionOrderItemID || target.ProductionOrderID != source.ProductionOrderID || target.OperationCode == biz.ProductionWIPOperationPackaging {
		return biz.ErrProductionExceptionSourceInvalid
	}
	if kind == biz.ProductionExceptionRemake {
		if target.OperationCode != biz.ProductionWIPOperationFabricProcessing || supplierID == nil {
			return biz.ErrProductionExceptionSourceInvalid
		}
	} else if target.ID != source.ProductionOrderOperationID {
		return biz.ErrProductionExceptionSourceInvalid
	}
	var originalSupplier *int
	allocations, err := client.ProductionWIPOutsourcingAllocation.Query().Where(productionwipoutsourcingallocation.ProductionWipBatchID(source.ID)).WithOutsourcingOrderItem(func(q *ent.OutsourcingOrderItemQuery) { q.WithOutsourcingOrder() }).All(ctx)
	if err != nil {
		return err
	}
	for _, allocation := range allocations {
		item, err := allocation.Edges.OutsourcingOrderItemOrErr()
		if err != nil {
			return err
		}
		contract, err := item.Edges.OutsourcingOrderOrErr()
		if err != nil || (originalSupplier != nil && *originalSupplier != contract.SupplierID) {
			return biz.ErrProductionExceptionSourceInvalid
		}
		id := contract.SupplierID
		originalSupplier = &id
	}
	if kind == biz.ProductionExceptionReworkOriginal && !sameOptionalInt(originalSupplier, supplierID) {
		return biz.ErrProductionExceptionSourceInvalid
	}
	if kind == biz.ProductionExceptionReworkSwitch && (supplierID == nil || sameOptionalInt(originalSupplier, supplierID)) {
		return biz.ErrProductionExceptionSourceInvalid
	}
	if supplierID != nil {
		vendor, err := client.Supplier.Get(ctx, *supplierID)
		if err != nil || !vendor.IsActive || !target.OutsourcingAllowed {
			return biz.ErrProductionExceptionSourceInvalid
		}
	} else if !target.InhouseAllowed {
		return biz.ErrProductionExceptionSourceInvalid
	}
	return nil
}

func createProductionExceptionExecutionBatch(ctx context.Context, client *ent.Client, row *ent.ProductionExceptionDecision, source *ent.ProductionWIPBatch, actorID int) error {
	if err := validateProductionExceptionTarget(ctx, client, source, row.DecisionType, row.TargetOperationID, row.TargetSupplierID); err != nil {
		return err
	}
	flow := biz.ProductionWIPFlowRework
	if row.DecisionType == biz.ProductionExceptionRemake {
		flow = biz.ProductionWIPFlowRemake
	}
	_, err := client.ProductionWIPBatch.Create().
		SetProductionOrderID(source.ProductionOrderID).SetProductionOrderItemID(source.ProductionOrderItemID).
		SetProductionOrderOperationID(*row.TargetOperationID).SetSourceBatchID(source.ID).
		SetNillableOriginReworkFactID(source.OriginReworkFactID).SetOriginExceptionDecisionID(row.ID).
		SetBatchNo(fmt.Sprintf("EX-%d-WIP", row.ID)).SetFlowType(flow).SetReworkReason(row.Reason).
		SetQuantity(*row.ApprovedQuantity).SetStatus(biz.ProductionWIPStatusPlanned).SetCreatedBy(actorID).Save(ctx)
	return err
}

func cancelProductionExceptionExecutionBatch(ctx context.Context, client *ent.Client, row *ent.ProductionExceptionDecision) error {
	batches, err := client.ProductionWIPBatch.Query().Where(productionwipbatch.OriginExceptionDecisionID(row.ID), productionwipbatch.StatusNEQ(biz.ProductionWIPStatusCancelled)).All(ctx)
	if err != nil {
		return err
	}
	for _, batch := range batches {
		if batch.Status != biz.ProductionWIPStatusPlanned || batch.ExecutionMode != nil || batch.SourceBatchID == nil || *batch.SourceBatchID != *row.ProductionWipBatchID {
			return biz.ErrProductionExceptionWIPDependency
		}
		exists, err := client.OutsourcingOrder.Query().Where(outsourcingorder.SourceWipBatchID(batch.ID), outsourcingorder.LifecycleStatusNEQ(biz.OutsourcingOrderStatusCanceled)).Exist(ctx)
		if err != nil {
			return err
		}
		if exists {
			return biz.ErrProductionWIPPreparedContractDependency
		}
		affected, err := client.ProductionWIPBatch.Update().Where(productionwipbatch.ID(batch.ID), productionwipbatch.Version(batch.Version), productionwipbatch.Status(biz.ProductionWIPStatusPlanned)).SetStatus(biz.ProductionWIPStatusCancelled).AddVersion(1).Save(ctx)
		if err != nil {
			return err
		}
		if affected != 1 {
			return biz.ErrProductionExceptionConflict
		}
	}
	return nil
}

// Receipt-linked stock movements keep disposal auditable at the same exact
// inventory grain as receiving. Original receipts and IQC results stay intact.
func (r *operationalFactRepo) applyProductionExceptionStock(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionExceptionDecision, actorID int, reason string, reverse bool) error {
	if row.ProductionWipBatchID == nil {
		return biz.ErrProductionExceptionSourceInvalid
	}
	if reverse {
		txns, err := tx.client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ProductionExceptionSourceType), inventorytxn.SourceID(row.ID), inventorytxn.Direction(-1)).Order(ent.Asc(inventorytxn.FieldID)).All(ctx)
		if err != nil {
			return err
		}
		keys := make([]biz.InventoryBalanceKey, 0, len(txns))
		for _, txn := range txns {
			keys = append(keys, inventoryBalanceKeyFromEntTxn(txn))
		}
		if err := lockInventoryOperationResources(ctx, tx, keys); err != nil {
			return err
		}
		for _, txn := range txns {
			if txn.SourceLineID == nil {
				return biz.ErrProductionExceptionSourceInvalid
			}
			if err := r.applyOperationalFactInventory(ctx, tx, operationalFactInventoryArgs{sourceType: biz.ProductionExceptionSourceType, sourceID: row.ID, sourceLineID: *txn.SourceLineID, actorID: actorID, reason: reason, cancel: true}); err != nil {
				return err
			}
		}
		return nil
	}
	receipts, err := tx.client.ProductionFact.Query().Where(productionfact.ProductionWipBatchID(*row.ProductionWipBatchID), productionfact.FactType(biz.ProductionFactFinishedGoodsReceipt), productionfact.StatusNEQ(biz.OperationalFactStatusCancelled)).Order(ent.Asc(productionfact.FieldID)).All(ctx)
	if err != nil {
		return err
	}
	keys := make([]biz.InventoryBalanceKey, 0, len(receipts))
	for _, receipt := range receipts {
		if receipt.Status != biz.OperationalFactStatusPosted {
			return biz.ErrProductionExceptionFactDependency
		}
		if err := lockOperationalFactRow(ctx, tx, "production_facts", receipt.ID, biz.ErrProductionFactNotFound); err != nil {
			return err
		}
		packed, err := productionReceiptPackagingBatches(ctx, tx.client, receipt.ID)
		if err != nil {
			return err
		}
		reworked, err := productionReceiptReworkedQuantity(ctx, tx.client, receipt.ID)
		if err != nil {
			return err
		}
		if len(packed) != 0 || reworked.IsPositive() {
			return biz.ErrProductionExceptionFactDependency
		}
		keys = append(keys, biz.InventoryBalanceKey{SubjectType: receipt.SubjectType, SubjectID: receipt.SubjectID, ProductSkuID: receipt.ProductSkuID, WarehouseID: receipt.WarehouseID, LotID: receipt.LotID, UnitID: receipt.UnitID})
	}
	if err := lockInventoryOperationResources(ctx, tx, keys); err != nil {
		return err
	}
	for _, receipt := range receipts {
		if err := r.applyOperationalFactInventory(ctx, tx, operationalFactInventoryArgs{sourceType: biz.ProductionExceptionSourceType, sourceID: row.ID, sourceLineID: receipt.ID, subjectType: receipt.SubjectType, subjectID: receipt.SubjectID, productSkuID: receipt.ProductSkuID, warehouseID: receipt.WarehouseID, lotID: receipt.LotID, unitID: receipt.UnitID, quantity: receipt.Quantity, direction: -1, txnType: biz.InventoryTxnOut, actorID: actorID, occurredAt: time.Now(), reason: reason}); err != nil {
			return err
		}
	}
	return nil
}

func productionReceiptExceptionDisposedQuantity(ctx context.Context, client *ent.Client, receiptIDs ...int) (decimal.Decimal, error) {
	if len(receiptIDs) == 0 {
		return decimal.Zero, nil
	}
	rows, err := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ProductionExceptionSourceType), inventorytxn.SourceLineIDIn(receiptIDs...)).All(ctx)
	total := decimal.Zero
	for _, row := range rows {
		total = total.Sub(row.Quantity.Mul(decimal.NewFromInt(int64(row.Direction))))
	}
	return total, err
}

func productionWIPNeedsFreshMaterial(operationCode, flowType string) bool {
	return operationCode == biz.ProductionWIPOperationFabricProcessing && (flowType == biz.ProductionWIPFlowNormal || flowType == biz.ProductionWIPFlowRemake)
}

func productionWIPFabricRequirementQuantity(ctx context.Context, client *ent.Client, batch *ent.ProductionWIPBatch, requirement *ent.ProductionOrderMaterialRequirement) (decimal.Decimal, error) {
	if batch.FlowType != biz.ProductionWIPFlowRemake {
		return requirement.PlannedQuantity, nil
	}
	unit, err := client.Unit.Get(ctx, requirement.UnitID)
	if err != nil {
		return decimal.Zero, err
	}
	return biz.RoundRequiredUnitQuantity(batch.Quantity.Mul(requirement.UnitQuantitySnapshot).Mul(decimal.NewFromInt(1).Add(requirement.LossRateSnapshot)), unit.Precision)
}

func validateProductionExceptionBatchDestination(ctx context.Context, client *ent.Client, batch *ent.ProductionWIPBatch, supplierID *int) error {
	if batch.OriginExceptionDecisionID == nil {
		return nil
	}
	decision, err := client.ProductionExceptionDecision.Get(ctx, *batch.OriginExceptionDecisionID)
	if err != nil || decision.ExecutionStatus != biz.ProductionExceptionExecutionApplied || decision.ProductionOrderItemID != batch.ProductionOrderItemID || decision.TargetOperationID == nil {
		return biz.ErrProductionExceptionSourceInvalid
	}
	// The decision fixes its repair operation. Later normal operations keep
	// their own production-manager assignment and supplier selection.
	if *decision.TargetOperationID == batch.ProductionOrderOperationID && !sameOptionalInt(decision.TargetSupplierID, supplierID) {
		return biz.ErrProductionExceptionSourceInvalid
	}
	return nil
}

func validateProductionExceptionWarehouseScope(ctx context.Context, client *ent.Client, row *ent.ProductionExceptionDecision, scope *biz.WarehouseDataScope, command *biz.ProcessDomainCommandInput) error {
	if row.ProductionWipBatchID == nil {
		return nil
	}
	receipts, err := client.ProductionFact.Query().Where(productionfact.ProductionWipBatchID(*row.ProductionWipBatchID), productionfact.FactType(biz.ProductionFactFinishedGoodsReceipt), productionfact.StatusNEQ(biz.OperationalFactStatusCancelled)).All(ctx)
	if err != nil {
		return err
	}
	if len(receipts) == 0 {
		return nil
	}
	if scope == nil {
		return biz.ErrNoPermission
	}
	// Validate the frozen execution node as well as its capability. A former
	// production-only process must never dispose received stock silently.
	if command != nil && (command.Node == nil || command.Node.NodeKey != "execute_warehouse_production_exception") {
		return biz.ErrNoPermission
	}
	for _, receipt := range receipts {
		if err := biz.ValidateWarehouseDataScopeAccess(*scope, receipt.WarehouseID); err != nil {
			return err
		}
	}
	return nil
}
