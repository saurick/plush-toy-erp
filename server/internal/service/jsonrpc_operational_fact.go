package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleOperationalFact(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.operationalFactUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_production_fact", "createProductionFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPMCPlanCreate, biz.PermissionPMCPlanUpdate, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
		in, ok := operationalFactMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateProductionFactDraft(ctx, in)
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "post_production_fact", "postProductionFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPMCPlanUpdate, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.PostProductionFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "cancel_production_fact", "cancelProductionFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPMCPlanUpdate, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelPostedProductionFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "list_production_facts", "listProductionFacts":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPMCPlanRead, biz.PermissionWarehouseInventoryRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.operationalFactUC.ListProductionFacts(ctx, operationalFactFilterFromParams(pm))
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"production_facts": productionFactsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil

	case "create_outsourcing_fact", "createOutsourcingFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseOrderCreate, biz.PermissionPurchaseOrderUpdate); res != nil {
			return id, res, nil
		}
		in, ok := operationalFactMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateOutsourcingFactDraft(ctx, in)
		return id, operationalFactOutsourcingFactResult(ctx, d, item, err), nil
	case "post_outsourcing_fact", "postOutsourcingFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseOrderUpdate, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.PostOutsourcingFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactOutsourcingFactResult(ctx, d, item, err), nil
	case "cancel_outsourcing_fact", "cancelOutsourcingFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseOrderUpdate, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelPostedOutsourcingFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactOutsourcingFactResult(ctx, d, item, err), nil
	case "list_outsourcing_facts", "listOutsourcingFacts":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseOrderRead, biz.PermissionWarehouseInventoryRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.operationalFactUC.ListOutsourcingFacts(ctx, operationalFactFilterFromParams(pm))
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"outsourcing_facts": outsourcingFactsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil

	case "create_shipment", "createShipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCreate); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CreateShipmentDraft(ctx, shipmentCreateFromParams(pm))
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "create_shipment_with_items", "createShipmentWithItems":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCreate); res != nil {
			return id, res, nil
		}
		in, ok := shipmentCreateWithItemsFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateShipmentDraftWithItems(ctx, in)
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "add_shipment_item", "addShipmentItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCreate); res != nil {
			return id, res, nil
		}
		in, ok := shipmentItemCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.AddShipmentItem(ctx, in)
		return id, operationalFactShipmentItemResult(ctx, d, item, err), nil
	case "ship_shipment", "shipShipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentShip); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.ShipShipment(ctx, getInt(pm, "id", 0))
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "cancel_shipment", "cancelShipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCancel); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelShippedShipment(ctx, getInt(pm, "id", 0))
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "list_shipments", "listShipments":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentRead); res != nil {
			return id, res, nil
		}
		filter, ok := operationalFactShipmentFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.operationalFactUC.ListShipments(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"shipments": shipmentsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil

	case "create_stock_reservation", "createStockReservation":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionSalesOrderUpdate, biz.PermissionWarehouseInventoryRead); res != nil {
			return id, res, nil
		}
		in, ok := stockReservationCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateStockReservation(ctx, in)
		return id, operationalFactStockReservationResult(ctx, d, item, err), nil
	case "release_stock_reservation", "releaseStockReservation":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionSalesOrderUpdate, biz.PermissionWarehouseOutboundConfirm); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.ReleaseStockReservation(ctx, getInt(pm, "id", 0))
		return id, operationalFactStockReservationResult(ctx, d, item, err), nil
	case "consume_stock_reservation", "consumeStockReservation":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWarehouseOutboundConfirm); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.ConsumeStockReservation(ctx, getInt(pm, "id", 0))
		return id, operationalFactStockReservationResult(ctx, d, item, err), nil
	case "list_stock_reservations", "listStockReservations":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionWarehouseInventoryRead, biz.PermissionSalesOrderRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.operationalFactUC.ListStockReservations(ctx, operationalFactFilterFromParams(pm))
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"stock_reservations": stockReservationsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil

	case "create_finance_fact", "createFinanceFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionFinanceReceivableConfirm, biz.PermissionFinancePayableConfirm); res != nil {
			return id, res, nil
		}
		in, ok := financeFactCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateFinanceFactDraft(ctx, in)
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "post_finance_fact", "postFinanceFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionFinanceReceivableConfirm, biz.PermissionFinancePayableConfirm); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.PostFinanceFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "settle_finance_fact", "settleFinanceFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionFinanceReceivableConfirm, biz.PermissionFinancePayableConfirm); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.SettleFinanceFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "cancel_finance_fact", "cancelFinanceFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionFinanceReceivableConfirm, biz.PermissionFinancePayableConfirm); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelPostedFinanceFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "list_finance_facts", "listFinanceFacts":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionFinanceReceivableRead, biz.PermissionFinancePayableRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.operationalFactUC.ListFinanceFacts(ctx, operationalFactFilterFromParams(pm))
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"finance_facts": financeFactsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil
	default:
		return id, &v1.JsonrpcResult{Code: errcode.UnknownMethod.Code, Message: fmt.Sprintf("未知业务事实接口 method=%s", method)}, nil
	}
}

func operationalFactMutationFromParams(pm map[string]any) (*biz.OperationalFactMutation, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "quantity")
	if !ok {
		return nil, false
	}
	occurredAt, ok := getOptionalJSONRPCTime(pm, "occurred_at")
	if !ok {
		return nil, false
	}
	return &biz.OperationalFactMutation{
		FactNo:         getString(pm, "fact_no"),
		FactType:       getString(pm, "fact_type"),
		SubjectType:    getString(pm, "subject_type"),
		SubjectID:      getInt(pm, "subject_id", 0),
		WarehouseID:    getInt(pm, "warehouse_id", 0),
		UnitID:         getInt(pm, "unit_id", 0),
		LotID:          getOptionalInt(pm, "lot_id"),
		Quantity:       quantity,
		SupplierID:     getOptionalInt(pm, "supplier_id"),
		SupplierName:   getWorkflowStringPtr(pm, "supplier_name"),
		SourceType:     getWorkflowStringPtr(pm, "source_type"),
		SourceID:       getOptionalInt(pm, "source_id"),
		SourceLineID:   getOptionalInt(pm, "source_line_id"),
		IdempotencyKey: getString(pm, "idempotency_key"),
		OccurredAt:     optionalTimeValue(occurredAt),
		Note:           getWorkflowStringPtr(pm, "note"),
	}, true
}

func shipmentCreateFromParams(pm map[string]any) *biz.ShipmentCreate {
	plannedShipAt, _ := getOptionalJSONRPCTime(pm, "planned_ship_at")
	return &biz.ShipmentCreate{
		ShipmentNo:       getString(pm, "shipment_no"),
		SalesOrderID:     getOptionalInt(pm, "sales_order_id"),
		CustomerID:       getOptionalInt(pm, "customer_id"),
		CustomerSnapshot: getWorkflowStringPtr(pm, "customer_snapshot"),
		IdempotencyKey:   getString(pm, "idempotency_key"),
		PlannedShipAt:    plannedShipAt,
		Note:             getWorkflowStringPtr(pm, "note"),
	}
}

func shipmentItemCreateFromParams(pm map[string]any) (*biz.ShipmentItemCreate, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "quantity")
	if !ok {
		return nil, false
	}
	return &biz.ShipmentItemCreate{
		ShipmentID:       getInt(pm, "shipment_id", 0),
		SalesOrderItemID: getOptionalInt(pm, "sales_order_item_id"),
		ProductID:        getInt(pm, "product_id", 0),
		WarehouseID:      getInt(pm, "warehouse_id", 0),
		UnitID:           getInt(pm, "unit_id", 0),
		LotID:            getOptionalInt(pm, "lot_id"),
		Quantity:         quantity,
		Note:             getWorkflowStringPtr(pm, "note"),
	}, true
}

func shipmentCreateWithItemsFromParams(pm map[string]any) (*biz.ShipmentCreateWithItems, bool) {
	rawItems, ok := pm["items"].([]any)
	if !ok || len(rawItems) == 0 {
		return nil, false
	}
	items := make([]*biz.ShipmentItemCreate, 0, len(rawItems))
	for _, rawItem := range rawItems {
		itemParams, ok := rawItem.(map[string]any)
		if !ok {
			return nil, false
		}
		item, ok := shipmentItemCreateFromParams(itemParams)
		if !ok {
			return nil, false
		}
		item.ShipmentID = 0
		items = append(items, item)
	}
	return &biz.ShipmentCreateWithItems{
		Shipment: shipmentCreateFromParams(pm),
		Items:    items,
	}, true
}

func stockReservationCreateFromParams(pm map[string]any) (*biz.StockReservationCreate, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "quantity")
	if !ok {
		return nil, false
	}
	reservedAt, ok := getOptionalJSONRPCTime(pm, "reserved_at")
	if !ok {
		return nil, false
	}
	return &biz.StockReservationCreate{
		ReservationNo:    getString(pm, "reservation_no"),
		SalesOrderID:     getOptionalInt(pm, "sales_order_id"),
		SalesOrderItemID: getOptionalInt(pm, "sales_order_item_id"),
		ProductID:        getInt(pm, "product_id", 0),
		WarehouseID:      getInt(pm, "warehouse_id", 0),
		UnitID:           getInt(pm, "unit_id", 0),
		LotID:            getOptionalInt(pm, "lot_id"),
		Quantity:         quantity,
		IdempotencyKey:   getString(pm, "idempotency_key"),
		ReservedAt:       optionalTimeValue(reservedAt),
		Note:             getWorkflowStringPtr(pm, "note"),
	}, true
}

func financeFactCreateFromParams(pm map[string]any) (*biz.FinanceFactCreate, bool) {
	amount, ok := getRequiredJSONRPCDecimal(pm, "amount")
	if !ok {
		return nil, false
	}
	occurredAt, ok := getOptionalJSONRPCTime(pm, "occurred_at")
	if !ok {
		return nil, false
	}
	return &biz.FinanceFactCreate{
		FactNo:           getString(pm, "fact_no"),
		FactType:         getString(pm, "fact_type"),
		CounterpartyType: getString(pm, "counterparty_type"),
		CounterpartyID:   getOptionalInt(pm, "counterparty_id"),
		Amount:           amount,
		Currency:         getString(pm, "currency"),
		SourceType:       getWorkflowStringPtr(pm, "source_type"),
		SourceID:         getOptionalInt(pm, "source_id"),
		SourceLineID:     getOptionalInt(pm, "source_line_id"),
		IdempotencyKey:   getString(pm, "idempotency_key"),
		OccurredAt:       optionalTimeValue(occurredAt),
		Note:             getWorkflowStringPtr(pm, "note"),
	}, true
}

func operationalFactFilterFromParams(pm map[string]any) biz.OperationalFactFilter {
	return biz.OperationalFactFilter{Status: getString(pm, "status"), Limit: getInt(pm, "limit", 50), Offset: getInt(pm, "offset", 0)}
}

func operationalFactShipmentFilterFromParams(pm map[string]any) (biz.OperationalFactFilter, bool) {
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.OperationalFactFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.OperationalFactFilter{}, false
	}
	filter := operationalFactFilterFromParams(pm)
	filter.DateField = getString(pm, "date_field")
	filter.DateFrom = dateFrom
	filter.DateTo = dateTo
	return filter, true
}

func getOptionalInt(pm map[string]any, key string) *int {
	value := getInt(pm, key, 0)
	if value <= 0 {
		return nil
	}
	return &value
}

func optionalTimeValue(value *time.Time) time.Time {
	if value == nil {
		return time.Time{}
	}
	return *value
}

func invalidParamResult() *v1.JsonrpcResult {
	return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
}

func okData(data map[string]any) *v1.JsonrpcResult {
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(data)}
}

func operationalFactProductionFactResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.ProductionFact, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"production_fact": productionFactToAny(item)})
}

func operationalFactOutsourcingFactResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.OutsourcingFact, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"outsourcing_fact": outsourcingFactToAny(item)})
}

func operationalFactShipmentResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Shipment, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"shipment": shipmentToAny(item)})
}

func operationalFactShipmentItemResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.ShipmentItem, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"shipment_item": shipmentItemToAny(item)})
}

func operationalFactStockReservationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.StockReservation, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"stock_reservation": stockReservationToAny(item)})
}

func operationalFactFinanceFactResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.FinanceFact, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"finance_fact": financeFactToAny(item)})
}

func (d *jsonrpcDispatcher) mapOperationalFactError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[operational_fact] invalid param err=%v", err)
		return invalidParamResult()
	case errors.Is(err, biz.ErrInventoryInsufficientStock):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "库存不足"}
	case errors.Is(err, biz.ErrInventoryLotStatusBlocked):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "批次状态不允许扣减"}
	case errors.Is(err, biz.ErrProductionFactNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产事实不存在"}
	case errors.Is(err, biz.ErrOutsourcingFactNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外事实不存在"}
	case errors.Is(err, biz.ErrShipmentNotFound), errors.Is(err, biz.ErrShipmentItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "出货单或出货行不存在"}
	case errors.Is(err, biz.ErrStockReservationNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "库存预留不存在"}
	case errors.Is(err, biz.ErrFinanceFactNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "财务事实不存在"}
	default:
		l.Errorf("[operational_fact] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func productionFactsToAny(items []*biz.ProductionFact) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, productionFactToAny(item))
	}
	return out
}

func productionFactToAny(item *biz.ProductionFact) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "fact_no": item.FactNo, "fact_type": item.FactType, "status": item.Status, "subject_type": item.SubjectType, "subject_id": item.SubjectID, "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "source_type": optionalStringToAny(item.SourceType), "source_id": optionalIntToAny(item.SourceID), "source_line_id": optionalIntToAny(item.SourceLineID), "idempotency_key": item.IdempotencyKey, "occurred_at": item.OccurredAt.Unix(), "posted_at": optionalUnix(item.PostedAt), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}

func outsourcingFactsToAny(items []*biz.OutsourcingFact) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, outsourcingFactToAny(item))
	}
	return out
}

func outsourcingFactToAny(item *biz.OutsourcingFact) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "fact_no": item.FactNo, "fact_type": item.FactType, "status": item.Status, "subject_type": item.SubjectType, "subject_id": item.SubjectID, "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "supplier_id": optionalIntToAny(item.SupplierID), "supplier_name": optionalStringToAny(item.SupplierName), "source_type": optionalStringToAny(item.SourceType), "source_id": optionalIntToAny(item.SourceID), "source_line_id": optionalIntToAny(item.SourceLineID), "idempotency_key": item.IdempotencyKey, "occurred_at": item.OccurredAt.Unix(), "posted_at": optionalUnix(item.PostedAt), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}

func shipmentsToAny(items []*biz.Shipment) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, shipmentToAny(item))
	}
	return out
}

func shipmentToAny(item *biz.Shipment) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	lines := make([]any, 0, len(item.Items))
	for _, line := range item.Items {
		lines = append(lines, shipmentItemToAny(line))
	}
	return map[string]any{"id": item.ID, "shipment_no": item.ShipmentNo, "sales_order_id": optionalIntToAny(item.SalesOrderID), "customer_id": optionalIntToAny(item.CustomerID), "customer_snapshot": optionalStringToAny(item.CustomerSnapshot), "status": item.Status, "idempotency_key": item.IdempotencyKey, "planned_ship_at": optionalUnix(item.PlannedShipAt), "shipped_at": optionalUnix(item.ShippedAt), "note": optionalStringToAny(item.Note), "items": lines, "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}

func shipmentItemToAny(item *biz.ShipmentItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "shipment_id": item.ShipmentID, "sales_order_item_id": optionalIntToAny(item.SalesOrderItemID), "product_id": item.ProductID, "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}

func stockReservationsToAny(items []*biz.StockReservation) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, stockReservationToAny(item))
	}
	return out
}

func stockReservationToAny(item *biz.StockReservation) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "reservation_no": item.ReservationNo, "status": item.Status, "sales_order_id": optionalIntToAny(item.SalesOrderID), "sales_order_item_id": optionalIntToAny(item.SalesOrderItemID), "product_id": item.ProductID, "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "idempotency_key": item.IdempotencyKey, "reserved_at": item.ReservedAt.Unix(), "released_at": optionalUnix(item.ReleasedAt), "consumed_at": optionalUnix(item.ConsumedAt), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}

func financeFactsToAny(items []*biz.FinanceFact) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, financeFactToAny(item))
	}
	return out
}

func financeFactToAny(item *biz.FinanceFact) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "fact_no": item.FactNo, "fact_type": item.FactType, "status": item.Status, "counterparty_type": item.CounterpartyType, "counterparty_id": optionalIntToAny(item.CounterpartyID), "amount": item.Amount.String(), "currency": item.Currency, "source_type": optionalStringToAny(item.SourceType), "source_id": optionalIntToAny(item.SourceID), "source_line_id": optionalIntToAny(item.SourceLineID), "idempotency_key": item.IdempotencyKey, "occurred_at": item.OccurredAt.Unix(), "posted_at": optionalUnix(item.PostedAt), "settled_at": optionalUnix(item.SettledAt), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}

func optionalIntToAny(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func optionalStringToAny(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func optionalUnix(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.Unix()
}
