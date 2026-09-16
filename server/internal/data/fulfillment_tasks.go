package data

import (
	"context"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionpackagingconfirmation"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/purchaserejectiondisposition"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/workflowtask"
)

// Call only from the transaction that owns the source mutation. An empty
// desired status means the step is not applicable and creates no historical
// task; an existing open step is withdrawn when its source stops applying.
func syncFulfillmentTask(ctx context.Context, client *ent.Client, kind string, id int, no, path, status, reason string, actorID int) error {
	expected, err := biz.BuildFulfillmentTask(kind, id, no, path)
	if err != nil {
		return err
	}
	row, err := client.WorkflowTask.Query().Where(workflowtask.TaskCode(expected.TaskCode)).Only(ctx)
	if ent.IsNotFound(err) {
		if status != "ready" && status != "blocked" {
			return nil
		}
		expected.TaskStatusKey = status
		if reason != "" {
			expected.BlockedReason = &reason
		}
		_, _, err = ensureSourceWorkflowTaskRecordWithClient(ctx, client, expected, actorID)
		return err
	}
	if err != nil {
		return err
	}
	if !biz.IsTrustedFulfillmentTask(entWorkflowTaskToBiz(row)) {
		return biz.ErrIdempotencyConflict
	}
	if status == "" {
		if biz.IsTerminalWorkflowTaskStatus(row.TaskStatusKey) {
			return nil
		}
		status = "withdrawn"
	}
	if status == "withdrawn" && reason == "" {
		reason = "来源已取消或本步骤不再适用"
	}
	if row.TaskStatusKey == status && optionalStringValueOrEmpty(row.BlockedReason) == reason && optionalStringValueOrEmpty(row.SourceNo) == no {
		return nil
	}
	update := client.WorkflowTask.Update().Where(workflowtask.ID(row.ID), workflowtask.Version(row.Version)).
		SetTaskStatusKey(status).SetSourceNo(no).AddVersion(1)
	if reason == "" {
		update.ClearBlockedReason()
	} else {
		update.SetBlockedReason(reason)
	}
	if biz.IsTerminalWorkflowTaskStatus(status) {
		update.SetCompletedAt(time.Now())
	} else {
		update.ClearCompletedAt()
	}
	if actorID > 0 {
		update.SetUpdatedBy(actorID)
	}
	count, err := update.Save(ctx)
	if err != nil {
		return err
	}
	if count != 1 {
		return biz.ErrIdempotencyConflict
	}
	event := client.WorkflowTaskEvent.Create().SetTaskID(row.ID).SetTaskVersion(row.Version + 1).
		SetEventType("status_changed").SetFromStatusKey(row.TaskStatusKey).SetToStatusKey(status).
		SetPayload(map[string]any{"source_task_producer": biz.FulfillmentTaskProducer, "source_action": kind, "source_id": id})
	if reason != "" {
		event.SetReason(reason)
	}
	if actorID > 0 {
		event.SetActorID(actorID)
	}
	_, err = event.Save(ctx)
	return err
}

func fulfillmentInspectionTask(ctx context.Context, client *ent.Client, row *ent.QualityInspection) error {
	kind := ""
	switch optionalStringValueOrEmpty(row.SourceType) {
	case biz.QualityInspectionSourcePurchaseReceipt:
		kind = "receipt_quality"
	case biz.QualityInspectionSourceProductionWIP:
		kind = "production_quality"
	case biz.QualityInspectionSourceOutsourcingFact:
		kind = "outsourcing_quality"
	default:
		return nil
	}
	status := "ready"
	switch row.Status {
	case "PASSED", "REJECTED":
		status = "done"
	case "CANCELLED":
		status = "withdrawn"
	}
	return syncFulfillmentTask(ctx, client, kind, row.ID, row.InspectionNo, "", status, "", optionalIntValueOrZero(row.InspectorID))
}

func syncPurchaseReceiptHandoffs(ctx context.Context, client *ent.Client, receiptID int) error {
	row, err := client.PurchaseReceipt.Get(ctx, receiptID)
	if err != nil {
		return err
	}
	inspections, err := client.QualityInspection.Query().Where(qualityinspection.PurchaseReceiptID(receiptID)).All(ctx)
	if err != nil {
		return err
	}
	for _, inspection := range inspections {
		if err := fulfillmentInspectionTask(ctx, client, inspection); err != nil {
			return err
		}
	}
	status, exception, reason := "", "", ""
	switch row.Status {
	case "POSTED":
		status, exception = "done", "done"
	case "CANCELLED":
		status, exception = "withdrawn", "withdrawn"
	case "DRAFT":
		items, err := client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receiptID)).All(ctx)
		if err != nil {
			return err
		}
		if len(items) > 0 {
			gate, err := evaluatePurchaseReceiptQualityGateInTx(ctx, &inventoryDBTx{client: client}, row, items, false)
			if err != nil {
				return err
			}
			status = "blocked"
			switch gate.Outcome {
			case biz.PurchaseReceiptQualityGateReady:
				status, exception = "ready", "done"
			case biz.PurchaseReceiptQualityGateRejected:
				exception, reason = "ready", "来料检验未通过，等待采购处理"
				dispositions, err := client.PurchaseRejectionDisposition.Query().Where(
					purchaserejectiondisposition.PurchaseReceiptID(receiptID),
					purchaserejectiondisposition.Status(biz.PurchaseRejectionStatusPosted),
				).All(ctx)
				if err != nil {
					return err
				}
				handled := map[int]decimal.Decimal{}
				for _, disposition := range dispositions {
					handled[disposition.PurchaseReceiptItemID] = handled[disposition.PurchaseReceiptItemID].Add(disposition.Quantity)
				}
				allHandled := true
				for _, id := range gate.RejectedLineIDs {
					for _, item := range items {
						if item.ID == id && handled[id].LessThan(item.Quantity) {
							allHandled = false
						}
					}
				}
				if allHandled {
					exception = "done"
					// The rejected source remains a draft for audit. It never
					// becomes an inbound fact after disposal or replacement.
					status, reason = "withdrawn", "拒收数量已处置，原收货单不可入库"
				}
			default:
				reason = "等待全部来料检验通过"
			}
		}
	}
	if err := syncFulfillmentTask(ctx, client, "receipt_inbound", row.ID, row.ReceiptNo, "", status, reason, 0); err != nil {
		return err
	}
	if err := syncFulfillmentTask(ctx, client, "receipt_exception", row.ID, row.ReceiptNo, "", exception, "", 0); err != nil {
		return err
	}
	items, err := client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receiptID)).All(ctx)
	if err != nil {
		return err
	}
	seen := map[int]bool{}
	for _, item := range items {
		if item.PurchaseOrderItemID == nil {
			continue
		}
		source, err := client.PurchaseOrderItem.Get(ctx, *item.PurchaseOrderItemID)
		if err != nil {
			return err
		}
		if !seen[source.PurchaseOrderID] {
			if err := syncPurchaseOrderHandoffs(ctx, client, source.PurchaseOrderID, 0); err != nil {
				return err
			}
			seen[source.PurchaseOrderID] = true
		}
	}
	return nil
}

func syncQualityHandoffs(ctx context.Context, client *ent.Client, inspectionID int) error {
	row, err := client.QualityInspection.Get(ctx, inspectionID)
	if err != nil {
		return err
	}
	if err := fulfillmentInspectionTask(ctx, client, row); err != nil {
		return err
	}
	if row.PurchaseReceiptID != nil {
		return syncPurchaseReceiptHandoffs(ctx, client, *row.PurchaseReceiptID)
	}
	if row.ProductionWipBatchID != nil {
		batch, err := client.ProductionWIPBatch.Get(ctx, *row.ProductionWipBatchID)
		if err != nil {
			return err
		}
		return syncProductionHandoffs(ctx, client, batch.ProductionOrderID, optionalIntValueOrZero(row.InspectorID))
	}
	if optionalStringValueOrEmpty(row.SourceType) == biz.QualityInspectionSourceOutsourcingFact && row.SourceID != nil {
		return syncOutsourcingFactHandoffs(ctx, client, *row.SourceID)
	}
	return nil
}

func syncOutsourcingHandoffs(ctx context.Context, client *ent.Client, orderID, actorID int) error {
	row, err := client.OutsourcingOrder.Get(ctx, orderID)
	if err != nil {
		return err
	}
	contract, issue, receive := "", "", ""
	switch row.LifecycleStatus {
	case biz.OutsourcingOrderStatusDraft, biz.OutsourcingOrderStatusSubmitted:
		contract = "ready"
	case biz.OutsourcingOrderStatusConfirmed:
		contract, issue, receive = "done", "done", "done"
		items, err := client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(orderID)).All(ctx)
		if err != nil {
			return err
		}
		for _, item := range items {
			if item.LineStatus != biz.OutsourcingOrderItemStatusOpen {
				continue
			}
			facts, err := client.OutsourcingFact.Query().Where(outsourcingfact.SourceType(biz.OutsourcingOrderSourceType), outsourcingfact.SourceID(orderID), outsourcingfact.SourceLineID(item.ID), outsourcingfact.Status("POSTED")).All(ctx)
			if err != nil {
				return err
			}
			issued, returned := decimal.Zero, decimal.Zero
			for _, fact := range facts {
				if fact.FactType == biz.OutsourcingFactMaterialIssue {
					issued = issued.Add(fact.Quantity)
				}
				if fact.FactType == biz.OutsourcingFactReturnReceipt {
					returned = returned.Add(fact.Quantity)
				}
			}
			if item.SubjectType == biz.OutsourcingOrderSubjectMaterial && issued.LessThan(item.OutsourcingQuantity) {
				issue = "ready"
			}
			if returned.LessThan(item.OutsourcingQuantity) {
				receive = "ready"
			}
		}
	case biz.OutsourcingOrderStatusClosed:
		contract, issue, receive = "done", "done", "done"
	case biz.OutsourcingOrderStatusCanceled:
		contract, issue, receive = "withdrawn", "withdrawn", "withdrawn"
	}
	if row.SourceWipBatchID != nil {
		receive = ""
	}
	for _, step := range []struct{ kind, status string }{{"outsourcing_contract", contract}, {"outsourcing_issue", issue}, {"outsourcing_return", receive}} {
		if err := syncFulfillmentTask(ctx, client, step.kind, row.ID, row.OutsourcingOrderNo, "", step.status, "", actorID); err != nil {
			return err
		}
	}
	return nil
}

func syncOutsourcingFactHandoffs(ctx context.Context, client *ent.Client, factID int) error {
	row, err := client.OutsourcingFact.Get(ctx, factID)
	if err != nil {
		return err
	}
	if row.SourceID == nil || optionalStringValueOrEmpty(row.SourceType) != biz.OutsourcingOrderSourceType {
		return nil
	}
	if row.FactType == biz.OutsourcingFactReturnReceipt {
		status, reason := "ready", ""
		inspections, err := client.QualityInspection.Query().Where(qualityinspection.SourceType(biz.QualityInspectionSourceOutsourcingFact), qualityinspection.SourceID(row.ID)).All(ctx)
		if err != nil {
			return err
		}
		for _, inspection := range inspections {
			if err := fulfillmentInspectionTask(ctx, client, inspection); err != nil {
				return err
			}
			if inspection.Status == "PASSED" && inspection.SupersededAt == nil {
				status, reason = "ready", ""
			}
		}
		if row.Status == "POSTED" {
			status, reason = "done", ""
		}
		if row.Status == "CANCELLED" {
			status, reason = "withdrawn", ""
		}
		path := fmt.Sprintf("/erp/purchase/processing-contracts?outsourcing_order_id=%d&outsourcing_fact_id=%d", *row.SourceID, row.ID)
		if err := syncFulfillmentTask(ctx, client, "outsourcing_inbound", row.ID, row.FactNo, path, status, reason, 0); err != nil {
			return err
		}
	}
	return syncOutsourcingHandoffs(ctx, client, *row.SourceID, 0)
}

func syncProductionHandoffs(ctx context.Context, client *ent.Client, orderID, actorID int) error {
	order, err := client.ProductionOrder.Get(ctx, orderID)
	if err != nil {
		return err
	}
	batches, err := client.ProductionWIPBatch.Query().Where(productionwipbatch.ProductionOrderID(orderID)).Order(ent.Asc(productionwipbatch.FieldID)).All(ctx)
	if err != nil {
		return err
	}
	for _, batch := range batches {
		operation, err := client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
		if err != nil {
			return err
		}
		path := fmt.Sprintf("/erp/production/orders?production_order_id=%d&wip_batch_id=%d", orderID, batch.ID)
		execute, transfer, exception, completion := "", "", "", ""
		switch batch.Status {
		case "PLANNED", "IN_PROGRESS":
			execute = "ready"
		case "OUTSOURCED":
			execute = "done"
		case "WAITING_QUALITY":
			execute = "done"
		case "REJECTED":
			execute, exception = "done", "ready"
		case "ACCEPTED":
			execute, exception = "done", "done"
			allocated := decimal.Zero
			if operation.OperationCode == biz.ProductionWIPOperationPackaging {
				facts, err := client.ProductionFact.Query().Where(productionfact.ProductionWipBatchID(batch.ID), productionfact.StatusNEQ("CANCELLED"), productionfact.FactType(biz.ProductionFactFinishedGoodsReceipt)).All(ctx)
				if err != nil {
					return err
				}
				for _, fact := range facts {
					allocated = allocated.Add(fact.Quantity)
				}
				completion = "done"
				if allocated.LessThan(batch.Quantity) {
					completion = "ready"
				}
			} else {
				for _, child := range batches {
					if child.SourceBatchID != nil && *child.SourceBatchID == batch.ID && child.Status != "CANCELLED" && child.FlowType == biz.ProductionWIPFlowNormal && child.ProductionOrderOperationID != batch.ProductionOrderOperationID {
						allocated = allocated.Add(child.Quantity)
					}
				}
				transfer = "done"
				if allocated.LessThan(batch.Quantity) {
					transfer = "ready"
				}
			}
		case "SPLIT":
			execute = "done"
		case "CANCELLED":
			execute, transfer, exception, completion = "withdrawn", "withdrawn", "withdrawn", "withdrawn"
		}
		if exception == "ready" {
			allocated := decimal.Zero
			for _, child := range batches {
				if child.SourceBatchID != nil && *child.SourceBatchID == batch.ID && child.FlowType == "REWORK" && child.Status != "CANCELLED" {
					allocated = allocated.Add(child.Quantity)
				}
			}
			if !allocated.LessThan(batch.Quantity) {
				exception = "done"
			}
		}
		inactive := order.Status == biz.ProductionOrderStatusCancelled ||
			(order.Status == biz.ProductionOrderStatusClosed && batch.OriginReworkFactID == nil)
		if inactive {
			execute, transfer, exception, completion = "", "", "", ""
		}
		for _, step := range []struct{ kind, status string }{{"production_execute", execute}, {"production_transfer", transfer}, {"production_exception", exception}, {"production_completion", completion}} {
			if err := syncFulfillmentTask(ctx, client, step.kind, batch.ID, batch.BatchNo, path, step.status, "", actorID); err != nil {
				return err
			}
		}
		returnStatus := ""
		switch batch.Status {
		case "OUTSOURCED":
			returnStatus = "ready"
		case "WAITING_QUALITY", "ACCEPTED", "REJECTED":
			returnStatus = "done"
		}
		if inactive {
			returnStatus = ""
		}
		if err := syncFulfillmentTask(ctx, client, "production_return", batch.ID, batch.BatchNo, path, returnStatus, "", actorID); err != nil {
			return err
		}
		inspections, err := client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(batch.ID)).All(ctx)
		if err != nil {
			return err
		}
		for _, inspection := range inspections {
			if err := fulfillmentInspectionTask(ctx, client, inspection); err != nil {
				return err
			}
		}
	}
	confirmations, err := client.ProductionPackagingConfirmation.Query().Where(productionpackagingconfirmation.ProductionOrderID(orderID)).All(ctx)
	if err != nil {
		return err
	}
	for _, row := range confirmations {
		status := "ready"
		if row.Status == "CONFIRMED" {
			status = "done"
		}
		if order.Status == biz.ProductionOrderStatusCancelled || order.Status == biz.ProductionOrderStatusClosed {
			status = ""
		}
		path := fmt.Sprintf("/erp/production/orders?production_order_id=%d&production_order_item_id=%d", orderID, row.ProductionOrderItemID)
		if err := syncFulfillmentTask(ctx, client, "production_packaging", row.ID, order.OrderNo, path, status, "", actorID); err != nil {
			return err
		}
	}
	return nil
}

func syncProductionFactHandoffs(ctx context.Context, client *ent.Client, row *ent.ProductionFact) error {
	if row.FactType == biz.ProductionFactRework {
		root, err := client.ProductionWIPBatch.Query().Where(
			productionwipbatch.OriginReworkFactID(row.ID), productionwipbatch.SourceBatchIDIsNil(),
		).Only(ctx)
		if ent.IsNotFound(err) {
			return nil
		}
		if err != nil {
			return err
		}
		return syncProductionHandoffs(ctx, client, root.ProductionOrderID, optionalIntValueOrZero(row.PostedBy))
	}
	if row.FactType != biz.ProductionFactFinishedGoodsReceipt {
		return nil
	}
	status := "ready"
	if row.Status == "POSTED" {
		status = "done"
	}
	if row.Status == "CANCELLED" {
		status = "withdrawn"
	}
	if err := syncFulfillmentTask(ctx, client, "production_inbound", row.ID, row.FactNo, "", status, "", optionalIntValueOrZero(row.PostedBy)); err != nil {
		return err
	}
	if row.ProductionWipBatchID != nil {
		batch, err := client.ProductionWIPBatch.Get(ctx, *row.ProductionWipBatchID)
		if err != nil {
			return err
		}
		return syncProductionHandoffs(ctx, client, batch.ProductionOrderID, 0)
	}
	return nil
}

func syncPurchaseOrderHandoffs(ctx context.Context, client *ent.Client, id, actorID int) error {
	row, err := client.PurchaseOrder.Get(ctx, id)
	if err != nil {
		return err
	}
	status := ""
	switch row.LifecycleStatus {
	case biz.PurchaseOrderStatusApproved:
		items, err := client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(id), purchaseorderitem.LineStatus(biz.PurchaseOrderItemStatusOpen)).All(ctx)
		if err != nil {
			return err
		}
		remaining, err := purchaseOrderItemRemainingQuantities(ctx, client, items)
		if err != nil {
			return err
		}
		status = "done"
		for _, qty := range remaining {
			if qty.IsPositive() {
				status = "ready"
				break
			}
		}
	case biz.PurchaseOrderStatusClosed:
		status = "done"
	case biz.PurchaseOrderStatusCanceled:
		status = "withdrawn"
	}
	return syncFulfillmentTask(ctx, client, "purchase_arrival", id, row.PurchaseOrderNo, "", status, "", actorID)
}
