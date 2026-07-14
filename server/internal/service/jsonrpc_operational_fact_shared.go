package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

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
		ProductSkuID:   getOptionalInt(pm, "product_sku_id"),
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

func operationalFactFilterFromParams(pm map[string]any) (biz.OperationalFactFilter, bool) {
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.OperationalFactFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.OperationalFactFilter{}, false
	}
	return biz.OperationalFactFilter{
		Status:         getString(pm, "status"),
		FactType:       getString(pm, "fact_type"),
		Keyword:        getString(pm, "keyword"),
		DateField:      getString(pm, "date_field"),
		DateFrom:       dateFrom,
		DateTo:         dateTo,
		SubjectType:    getString(pm, "subject_type"),
		SubjectID:      getInt(pm, "subject_id", 0),
		WarehouseID:    getInt(pm, "warehouse_id", 0),
		LotID:          getInt(pm, "lot_id", 0),
		SourceType:     getString(pm, "source_type"),
		SourceID:       getInt(pm, "source_id", 0),
		CustomerID:     getInt(pm, "customer_id", 0),
		ProductID:      getInt(pm, "product_id", 0),
		ProductSkuID:   getInt(pm, "product_sku_id", 0),
		CounterpartyID: getInt(pm, "counterparty_id", 0),
		Limit:          getInt(pm, "limit", 50),
		Offset:         getInt(pm, "offset", 0),
	}, true
}

func operationalFactShipmentFilterFromParams(pm map[string]any) (biz.OperationalFactFilter, bool) {
	filter, ok := operationalFactFilterFromParams(pm)
	if !ok {
		return biz.OperationalFactFilter{}, false
	}
	return filter, true
}

func getOptionalInt(pm map[string]any, key string) *int {
	value := getInt(pm, key, 0)
	if value <= 0 {
		return nil
	}
	return &value
}

func getOptionalNonNegativeInt(pm map[string]any, key string) *int {
	if _, ok := pm[key]; !ok {
		return nil
	}
	value := getInt(pm, key, -1)
	if value < 0 {
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

func unknownOperationalFactResult(method string) *v1.JsonrpcResult {
	return &v1.JsonrpcResult{Code: errcode.UnknownMethod.Code, Message: fmt.Sprintf("未知业务事实接口 method=%s", method)}
}

func (d *jsonrpcDispatcher) mapOperationalFactError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrIdempotencyConflict):
		l.Warnf("[operational_fact] idempotency payload conflict err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.IdempotencyConflict.Code, Message: errcode.IdempotencyConflict.Message}
	case errors.Is(err, biz.ErrFinanceFactSourceConflict):
		l.Warnf("[operational_fact] active finance fact source conflict err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.IdempotencyConflict.Code, Message: "该业务来源已生成同类型的有效财务记录"}
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[operational_fact] invalid param err=%v", err)
		return invalidParamResult()
	case errors.Is(err, biz.ErrInventoryInsufficientStock):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "库存不足"}
	case errors.Is(err, biz.ErrInventoryLotStatusBlocked):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "批次状态不允许扣减"}
	case errors.Is(err, biz.ErrOperationalInboundLotRequired):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "请选择已有批次或填写新批次号"}
	case errors.Is(err, biz.ErrCustomerNotFound), errors.Is(err, biz.ErrCustomerInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该客户已停用，不能用于新业务；历史单据仍保留原引用"}
	case errors.Is(err, biz.ErrMaterialNotFound), errors.Is(err, biz.ErrMaterialInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该材料已停用，不能新增引用；历史事实仍保留原引用"}
	case errors.Is(err, biz.ErrProductNotFound), errors.Is(err, biz.ErrProductInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该产品已停用，不能用于新业务；历史单据仍保留原引用"}
	case errors.Is(err, biz.ErrProductSKUNotFound), errors.Is(err, biz.ErrProductSKUInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该 SKU 已停用，不能用于新业务；历史单据仍保留原引用"}
	case errors.Is(err, biz.ErrSupplierNotFound), errors.Is(err, biz.ErrSupplierInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该供应商已停用，不能用于新业务；历史单据仍保留原引用"}
	case errors.Is(err, biz.ErrUnitNotFound), errors.Is(err, biz.ErrUnitInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该单位已停用，不能新增引用；历史单据仍保留原引用"}
	case errors.Is(err, biz.ErrWarehouseNotFound), errors.Is(err, biz.ErrWarehouseInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该仓库已停用，不能用于新业务"}
	case errors.Is(err, biz.ErrProductionFactNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产事实不存在"}
	case errors.Is(err, biz.ErrProductionOrderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产订单不存在"}
	case errors.Is(err, biz.ErrProductionOrderFactSourceInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产订单明细与完工来源不一致，请刷新订单后重试"}
	case errors.Is(err, biz.ErrProductionOrderMaterialRequirementNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产订单物料需求不存在，请刷新订单后重试"}
	case errors.Is(err, biz.ErrProductionOrderMaterialRequirementInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产订单物料需求与订单、材料或单位不一致，请刷新订单后重试"}
	case errors.Is(err, biz.ErrProductionOrderMaterialRequirementsNeedReview):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该历史生产订单缺少完整的物料需求快照，请复核后再领料"}
	case errors.Is(err, biz.ErrProductionOrderInvalidState):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产订单当前状态不允许登记或确认生产记录"}
	case errors.Is(err, biz.ErrProductionOrderQuantityExceeded):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "本次完工将超过生产订单明细剩余可完工数量"}
	case errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "本次领料将超过生产订单物料需求剩余可领数量"}
	case errors.Is(err, biz.ErrProductionReworkSourceInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "返工来源必须是已关联批次的生产完工记录，请刷新后重试"}
	case errors.Is(err, biz.ErrProductionReworkSourceState):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "来源完工记录尚未确认或已取消，不能发起返工"}
	case errors.Is(err, biz.ErrProductionReworkQuantityExceeded):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "本次返工数量将超过来源完工批次剩余可返工数量"}
	case errors.Is(err, biz.ErrProductionReworkDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该完工记录已有未取消的返工，请先取消返工后再撤销完工"}
	case errors.Is(err, biz.ErrOutsourcingFactNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外事实不存在"}
	case errors.Is(err, biz.ErrOutsourcingOrderNotFound), errors.Is(err, biz.ErrOutsourcingOrderItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外合同或明细不存在"}
	case errors.Is(err, biz.ErrOutsourcingOrderFactSourceInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外记录与合同明细不一致，请刷新来源后重试"}
	case errors.Is(err, biz.ErrOutsourcingOrderFactInvalidState):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外合同或明细当前状态不允许登记或确认"}
	case errors.Is(err, biz.ErrOutsourcingOrderFactQuantityExceeded):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "本次数量将超过委外合同明细剩余可办理数量"}
	case errors.Is(err, biz.ErrOutsourcingReturnQualityDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该委外回货已有未取消的质检单，请先完成或取消质检后再撤销回货"}
	case errors.Is(err, biz.ErrOutsourcingReturnFinanceDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该委外回货已有未取消的应付记录，请先取消应付后再撤销回货"}
	case errors.Is(err, biz.ErrOutsourcingReturnQualityPending):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该委外回货尚未完成合格或让步接收判定，不能生成应付"}
	case errors.Is(err, biz.ErrOutsourcingReturnQualityRejected):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该委外回货质检不合格，请先完成返工、退回等质量处置"}
	case errors.Is(err, biz.ErrShipmentNotFound), errors.Is(err, biz.ErrShipmentItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "出货单或出货行不存在"}
	case errors.Is(err, biz.ErrShipmentSourceMismatch):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "出货来源与销售订单、客户或订单行不一致，请刷新来源后重试"}
	case errors.Is(err, biz.ErrShipmentOrderNotActive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单尚未生效或已关闭，不能确认出货"}
	case errors.Is(err, biz.ErrShipmentQuantityExceeded):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "本次出货将超过销售订单行剩余可出货数量"}
	case errors.Is(err, biz.ErrShipmentReservationSplit):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "本次出货小于对应的原子预留数量，请先释放并按本次出货数量重建预留"}
	case errors.Is(err, biz.ErrShipmentFinanceDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该出货单已有未取消的应收或发票记录，请先取消相关财务记录"}
	case errors.Is(err, biz.ErrStockReservationNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "库存预留不存在"}
	case errors.Is(err, biz.ErrStockReservationSourceMismatch):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "库存预留与销售订单或订单行不一致，请刷新来源后重试"}
	case errors.Is(err, biz.ErrStockReservationQuantityExceeded):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "预留数量与已出货数量合计超过销售订单行数量"}
	case errors.Is(err, biz.ErrFinanceFactNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "财务事实不存在"}
	case errors.Is(err, biz.ErrFinanceFactSourceInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "财务记录缺少有效业务来源，不能过账或结清"}
	case errors.Is(err, biz.ErrFinanceFactShipmentAmountInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "出货金额快照不完整或币种不一致，不能生成财务记录"}
	case errors.Is(err, biz.ErrFinanceFactSourceAmountInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "来源单据金额不完整或有效金额不大于零，不能生成财务记录"}
	case errors.Is(err, biz.ErrPurchaseReceiptFinanceDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该采购入库已有未取消的应付记录，请先取消应付后再更正或撤销来源"}
	case errors.Is(err, biz.ErrFinanceReconciliationDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该财务记录已有未取消的单笔核对，请先取消核对记录"}
	case errors.Is(err, biz.ErrFinanceReconciliationSourceInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该财务记录当前不能生成单笔核对，请确认已过账且往来方和金额完整"}
	case errors.Is(err, biz.ErrFinanceFactSettlementNotAllowed):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该类财务记录不支持结清操作"}
	default:
		l.Errorf("[operational_fact] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
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
