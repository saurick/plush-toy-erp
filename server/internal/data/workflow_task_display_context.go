package data

import (
	"context"
	"sort"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/businessattachment"
	"server/internal/data/model/ent/inventoryoperation"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/processinstance"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productionexceptiondecision"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
	"server/internal/data/model/ent/shipment"
)

type workflowDisplayRef struct {
	kind, name, code, orderNo string
	id, salesItemID           int
}

type workflowDisplaySource struct {
	no    string
	items []workflowDisplayRef
}

func workflowDisplaySourceKind(value string) string {
	switch value {
	case "sales_order", "sales-orders", "project-orders":
		return "sales_order"
	case "purchase_order", "purchase-order", "accessories-purchase":
		return "purchase_order"
	case "outsourcing_order", "outsourcing-order", "processing-contracts":
		return "outsourcing_order"
	case "production_order", "production-order", "production-orders":
		return "production_order"
	case "purchase_receipt", "purchase-receipt", "inbound":
		return "purchase_receipt"
	case "shipment", "shipments":
		return "shipment"
	case "production_fact", "production-fact", "production-progress":
		return "production_fact"
	case "quality_inspection", "quality-inspection", "quality-inspections":
		return "quality_inspection"
	case "production_exception_decision", "inventory_operation":
		return value
	case "bom_header", "material-bom":
		return "bom_header"
	default:
		return ""
	}
}

func displayString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func displayInt(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

// Only already-visible tasks with a persisted source binding may read source
// identities. This projection grants no access to prices, parties or documents.
// Source-time name/code snapshots are preserved; product style and supplier item
// numbers come from their distinct master fields, never from internal codes.
func hydrateWorkflowTaskDisplayContexts(ctx context.Context, client *ent.Client, tasks []*biz.WorkflowTask) error {
	processIDs := []int{}
	for _, task := range tasks {
		if task != nil && workflowDisplaySourceKind(task.SourceType) != "" && task.ProcessInstanceID != nil {
			processIDs = append(processIDs, *task.ProcessInstanceID)
		}
	}
	instances := map[int]*ent.ProcessInstance{}
	if len(processIDs) > 0 {
		rows, err := client.ProcessInstance.Query().Where(processinstance.IDIn(processIDs...)).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			instances[row.ID] = row
		}
	}
	groups := map[string]map[int][]*biz.WorkflowTask{}
	for _, task := range tasks {
		if task == nil {
			continue
		}
		task.DisplayContext = nil
		kind := workflowDisplaySourceKind(task.SourceType)
		if kind == "" || task.SourceID <= 0 {
			continue
		}
		trusted := biz.IsTrustedProductionSchedulingSourceTask(task) || biz.IsTrustedProductionExceptionSourceTask(task) || biz.IsTrustedShipmentReleaseSourceTask(task)
		if instance := instances[displayInt(task.ProcessInstanceID)]; instance != nil {
			trusted = instance.BusinessRefID == task.SourceID && workflowDisplaySourceKind(instance.BusinessRefType) == kind
		}
		if !trusted {
			continue
		}
		if groups[kind] == nil {
			groups[kind] = map[int][]*biz.WorkflowTask{}
		}
		groups[kind][task.SourceID] = append(groups[kind][task.SourceID], task)
	}
	if len(groups) == 0 {
		return nil
	}
	sources := map[string]map[int]workflowDisplaySource{}
	productIDs, materialIDs, salesItemIDs := []int{}, []int{}, []int{}
	kinds := make([]string, 0, len(groups))
	for kind := range groups {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)
	for _, kind := range kinds {
		ids := make([]int, 0, len(groups[kind]))
		for id := range groups[kind] {
			ids = append(ids, id)
		}
		sort.Ints(ids)
		loaded, err := loadWorkflowDisplaySources(ctx, client, kind, ids)
		if err != nil {
			return err
		}
		sources[kind] = loaded
		for _, source := range loaded {
			for _, item := range source.items {
				if item.id > 0 {
					if item.kind == "product" {
						productIDs = append(productIDs, item.id)
					} else {
						materialIDs = append(materialIDs, item.id)
					}
				}
				if item.salesItemID > 0 {
					salesItemIDs = append(salesItemIDs, item.salesItemID)
				}
			}
		}
	}
	products := map[int]*ent.Product{}
	primaryImages := map[int]int{}
	materials := map[int]*ent.Material{}
	orderNos := map[int]string{}
	if len(productIDs) > 0 {
		rows, err := client.Product.Query().Where(product.IDIn(productIDs...)).Select(product.FieldID, product.FieldName, product.FieldCode, product.FieldStyleNo).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			products[row.ID] = row
		}
		// Only the current primary image of the same product identifies this item.
		images, err := client.BusinessAttachment.Query().Where(
			businessattachment.OwnerTypeEQ(biz.BusinessAttachmentOwnerProduct),
			businessattachment.OwnerIDIn(productIDs...),
			businessattachment.AttachmentTypeEQ(biz.BusinessAttachmentTypeProductImage),
			businessattachment.SlotKeyEQ(biz.BusinessAttachmentProductImageSlotPrimary),
			businessattachment.WithdrawnAtIsNil(),
		).Select(businessattachment.FieldID, businessattachment.FieldOwnerID).All(ctx)
		if err != nil {
			return err
		}
		for _, image := range images {
			primaryImages[image.OwnerID] = image.ID
		}
	}
	if len(materialIDs) > 0 {
		rows, err := client.Material.Query().Where(material.IDIn(materialIDs...)).Select(material.FieldID, material.FieldName, material.FieldCode, material.FieldSupplierItemNo).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			materials[row.ID] = row
		}
	}
	if len(salesItemIDs) > 0 {
		rows, err := client.SalesOrderItem.Query().Where(salesorderitem.IDIn(salesItemIDs...)).WithSalesOrder().All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			if row.Edges.SalesOrder != nil {
				orderNos[row.ID] = row.Edges.SalesOrder.OrderNo
			}
		}
	}
	for _, kind := range kinds {
		for id, linkedTasks := range groups[kind] {
			source, exists := sources[kind][id]
			projection := &biz.WorkflowTaskDisplayContext{Available: exists, SourceNo: source.no, Items: []biz.WorkflowTaskDisplayItem{}}
			seen := map[biz.WorkflowTaskDisplayItem]bool{}
			for _, ref := range source.items {
				item := biz.WorkflowTaskDisplayItem{Kind: ref.kind, Name: ref.name, Code: ref.code, OrderNo: ref.orderNo}
				if row := products[ref.id]; ref.kind == "product" && row != nil {
					if item.Name == "" {
						item.Name = row.Name
					}
					if item.Code == "" {
						item.Code = row.Code
					}
					item.StyleNo = displayString(row.StyleNo)
					item.ProductID = row.ID
					item.ImageAttachmentID = primaryImages[row.ID]
				}
				if row := materials[ref.id]; ref.kind == "material" && row != nil {
					item.SupplierItemNo = displayString(row.SupplierItemNo)
					if item.Name == "" {
						item.Name = row.Name
					}
					if item.Code == "" {
						item.Code = row.Code
					}
				}
				if item.OrderNo == "" {
					item.OrderNo = orderNos[ref.salesItemID]
				}
				if (item.Name != "" || item.Code != "") && !seen[item] {
					projection.Items = append(projection.Items, item)
					seen[item] = true
				}
			}
			for _, task := range linkedTasks {
				task.DisplayContext = projection
			}
		}
	}
	return nil
}

func loadWorkflowDisplaySources(ctx context.Context, client *ent.Client, kind string, ids []int) (map[int]workflowDisplaySource, error) {
	out := map[int]workflowDisplaySource{}
	switch kind {
	case "sales_order":
		rows, err := client.SalesOrder.Query().Where(salesorder.IDIn(ids...)).WithItems(func(q *ent.SalesOrderItemQuery) { q.Order(ent.Asc(salesorderitem.FieldLineNo)) }).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			source := workflowDisplaySource{no: row.OrderNo}
			for _, item := range row.Edges.Items {
				source.items = append(source.items, workflowDisplayRef{kind: "product", id: item.ProductID, name: displayString(item.ProductNameSnapshot), code: displayString(item.ProductCodeSnapshot)})
			}
			out[row.ID] = source
		}
	case "purchase_order":
		rows, err := client.PurchaseOrder.Query().Where(purchaseorder.IDIn(ids...)).WithItems(func(q *ent.PurchaseOrderItemQuery) { q.Order(ent.Asc("id")) }).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			source := workflowDisplaySource{no: row.PurchaseOrderNo}
			for _, item := range row.Edges.Items {
				source.items = append(source.items, workflowDisplayRef{kind: "material", id: item.MaterialID, name: displayString(item.MaterialNameSnapshot), code: displayString(item.MaterialCodeSnapshot), orderNo: displayString(item.ProductOrderNoSnapshot)})
				if displayString(item.ProductNameSnapshot) != "" || displayString(item.ProductNoSnapshot) != "" {
					source.items = append(source.items, workflowDisplayRef{kind: "product", name: displayString(item.ProductNameSnapshot), code: displayString(item.ProductNoSnapshot), orderNo: displayString(item.ProductOrderNoSnapshot)})
				}
			}
			out[row.ID] = source
		}
	case "outsourcing_order":
		rows, err := client.OutsourcingOrder.Query().Where(outsourcingorder.IDIn(ids...)).WithItems(func(q *ent.OutsourcingOrderItemQuery) { q.Order(ent.Asc("id")) }).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			source := workflowDisplaySource{no: row.OutsourcingOrderNo}
			for _, item := range row.Edges.Items {
				if item.ProductID != nil || displayString(item.ProductNameSnapshot) != "" || displayString(item.ProductNoSnapshot) != "" {
					source.items = append(source.items, workflowDisplayRef{kind: "product", id: displayInt(item.ProductID), name: displayString(item.ProductNameSnapshot), code: displayString(item.ProductNoSnapshot), orderNo: displayString(item.ProductOrderNoSnapshot)})
				}
				if item.MaterialID != nil {
					source.items = append(source.items, workflowDisplayRef{kind: "material", id: *item.MaterialID, name: displayString(item.MaterialNameSnapshot), code: displayString(item.MaterialCodeSnapshot), orderNo: displayString(item.ProductOrderNoSnapshot)})
				}
			}
			out[row.ID] = source
		}
	case "production_order":
		rows, err := client.ProductionOrder.Query().Where(productionorder.IDIn(ids...)).WithItems(func(q *ent.ProductionOrderItemQuery) { q.Order(ent.Asc("id")) }).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			source := workflowDisplaySource{no: row.OrderNo}
			for _, item := range row.Edges.Items {
				source.items = append(source.items, workflowDisplayRef{kind: "product", id: item.ProductID, name: displayString(item.ProductNameSnapshot), code: displayString(item.ProductCodeSnapshot), salesItemID: displayInt(item.SalesOrderItemID)})
			}
			out[row.ID] = source
		}
	case "purchase_receipt":
		rows, err := client.PurchaseReceipt.Query().Where(purchasereceipt.IDIn(ids...)).WithItems(func(q *ent.PurchaseReceiptItemQuery) { q.Order(ent.Asc("id")) }).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			source := workflowDisplaySource{no: row.ReceiptNo}
			for _, item := range row.Edges.Items {
				source.items = append(source.items, workflowDisplayRef{kind: "material", id: item.MaterialID})
			}
			out[row.ID] = source
		}
	case "shipment":
		rows, err := client.Shipment.Query().Where(shipment.IDIn(ids...)).WithItems(func(q *ent.ShipmentItemQuery) { q.Order(ent.Asc("id")) }).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			source := workflowDisplaySource{no: row.ShipmentNo}
			for _, item := range row.Edges.Items {
				source.items = append(source.items, workflowDisplayRef{kind: "product", id: item.ProductID, salesItemID: displayInt(item.SalesOrderItemID)})
			}
			out[row.ID] = source
		}
	case "bom_header":
		rows, err := client.BOMHeader.Query().Where(bomheader.IDIn(ids...)).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			out[row.ID] = workflowDisplaySource{items: []workflowDisplayRef{{kind: "product", id: row.ProductID, orderNo: displayString(row.SourceOrderNo)}}}
		}
	case "quality_inspection":
		rows, err := client.QualityInspection.Query().Where(qualityinspection.IDIn(ids...)).All(ctx)
		if err != nil {
			return nil, err
		}
		wipIDs := []int{}
		for _, row := range rows {
			if displayString(row.SubjectType) == "WIP" {
				wipIDs = append(wipIDs, displayInt(row.SubjectID))
			}
		}
		wipProducts := map[int]int{}
		if len(wipIDs) > 0 {
			batches, readErr := client.ProductionWIPBatch.Query().Where(productionwipbatch.IDIn(wipIDs...)).WithProductionOrderItem().All(ctx)
			if readErr != nil {
				return nil, readErr
			}
			for _, batch := range batches {
				if batch.Edges.ProductionOrderItem != nil {
					wipProducts[batch.ID] = batch.Edges.ProductionOrderItem.ProductID
				}
			}
		}
		for _, row := range rows {
			ref := workflowDisplayRef{kind: strings.ToLower(displayString(row.SubjectType)), id: displayInt(row.SubjectID)}
			if ref.kind == "wip" {
				ref = workflowDisplayRef{kind: "product", id: wipProducts[ref.id]}
			}
			if ref.id <= 0 {
				ref = workflowDisplayRef{kind: "material", id: displayInt(row.MaterialID)}
			}
			out[row.ID] = workflowDisplaySource{no: row.InspectionNo, items: []workflowDisplayRef{ref}}
		}
	case "production_fact":
		rows, err := client.ProductionFact.Query().Where(productionfact.IDIn(ids...)).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			out[row.ID] = workflowDisplaySource{no: row.FactNo, items: []workflowDisplayRef{{kind: strings.ToLower(row.SubjectType), id: row.SubjectID}}}
		}
	case "inventory_operation":
		rows, err := client.InventoryOperation.Query().Where(inventoryoperation.IDIn(ids...)).WithItems(func(q *ent.InventoryOperationItemQuery) { q.Order(ent.Asc("id")) }).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			source := workflowDisplaySource{no: row.OperationNo}
			for _, item := range row.Edges.Items {
				source.items = append(source.items, workflowDisplayRef{kind: strings.ToLower(item.SubjectType), id: item.SubjectID})
			}
			out[row.ID] = source
		}
	case "production_exception_decision":
		rows, err := client.ProductionExceptionDecision.Query().Where(productionexceptiondecision.IDIn(ids...)).All(ctx)
		if err != nil {
			return nil, err
		}
		itemIDs := []int{}
		for _, row := range rows {
			itemIDs = append(itemIDs, row.ProductionOrderItemID)
		}
		if len(itemIDs) == 0 {
			return out, nil
		}
		items, err := client.ProductionOrderItem.Query().Where(productionorderitem.IDIn(itemIDs...)).All(ctx)
		if err != nil {
			return nil, err
		}
		refs := map[int]workflowDisplayRef{}
		for _, item := range items {
			refs[item.ID] = workflowDisplayRef{kind: "product", id: item.ProductID, name: displayString(item.ProductNameSnapshot), code: displayString(item.ProductCodeSnapshot), salesItemID: displayInt(item.SalesOrderItemID)}
		}
		for _, row := range rows {
			out[row.ID] = workflowDisplaySource{no: row.DecisionNo, items: []workflowDisplayRef{refs[row.ProductionOrderItemID]}}
		}
	}
	return out, nil
}
