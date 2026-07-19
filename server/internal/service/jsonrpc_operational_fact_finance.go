package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleOperationalFactFinance(
	ctx context.Context,
	method, id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_receivable_from_shipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionFinanceReceivableConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "shipments"); res != nil {
			return id, res, nil
		}
		in, ok := financeFactFromShipmentCreateFromParams(pm, false)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateReceivableFromShipment(ctx, in)
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "create_invoice_from_shipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionFinanceInvoiceConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "shipments"); res != nil {
			return id, res, nil
		}
		in, ok := financeFactFromShipmentCreateFromParams(pm, true)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateInvoiceFromShipment(ctx, in)
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "create_payable_from_purchase_receipt":
		if res := d.RequireAdminPermission(ctx, biz.PermissionFinancePayableConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "purchase_receipts"); res != nil {
			return id, res, nil
		}
		in, ok := financeFactFromPurchaseReceiptCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreatePayableFromPurchaseReceipt(ctx, in)
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "create_payable_from_outsourcing_return":
		if res := d.RequireAdminPermission(ctx, biz.PermissionFinancePayableConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "outsourcing_orders", "quality_inspections"); res != nil {
			return id, res, nil
		}
		in, ok := financeFactFromOutsourcingReturnCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreatePayableFromOutsourcingReturn(ctx, in)
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "create_reconciliation_from_finance_fact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionFinanceReconciliationConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
			return id, res, nil
		}
		in, ok := financeReconciliationFromFactCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireAnySourceActionReadPermission(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		source, err := d.operationalFactUC.GetFinanceFact(ctx, in.FinanceFactID)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		if source == nil {
			return id, d.mapOperationalFactError(ctx, biz.ErrFinanceFactNotFound), nil
		}
		condition, ok := biz.FinanceSourceReadCondition(source.FactType)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method, condition); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CreateReconciliationFromFinanceFact(ctx, in)
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "post_finance_fact":
		scope, res := d.financeFactConfirmAccessScope(ctx)
		if res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
			return id, res, nil
		}
		factID := getInt(pm, "id", 0)
		if res := d.requireFinanceFactAccess(ctx, factID, scope); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.PostFinanceFact(ctx, factID)
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "settle_finance_fact":
		scope, res := d.financeFactConfirmAccessScope(ctx)
		if res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
			return id, res, nil
		}
		factID := getInt(pm, "id", 0)
		if res := d.requireFinanceFactAccess(ctx, factID, scope); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.SettleFinanceFact(ctx, factID)
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "cancel_finance_fact":
		if !financeFactAllowsOnly(pm, "id", "reason") {
			return id, invalidParamResult(), nil
		}
		scope, res := d.financeFactConfirmAccessScope(ctx)
		if res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, "", "finance"); res != nil {
			return id, res, nil
		}
		reason, ok := pm["reason"].(string)
		if !ok {
			return id, invalidParamResult(), nil
		}
		factID := getInt(pm, "id", 0)
		if res := d.requireFinanceFactAccess(ctx, factID, scope); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelPostedFinanceFact(ctx, factID, actorID, reason)
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "list_finance_facts":
		scope, res := d.financeFactReadAccessScope(ctx)
		if res != nil {
			return id, res, nil
		}
		filter, ok := operationalFactFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if filter.FactType != "" && !scope.AllowsType(filter.FactType) {
			return id, financeFactPermissionDeniedResult(), nil
		}
		items, total, err := d.operationalFactUC.ListFinanceFactsForAccess(ctx, filter, scope)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"finance_facts": financeFactsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil
	default:
		return id, unknownOperationalFactResult(method), nil
	}
}

func (d *jsonrpcDispatcher) financeFactConfirmAccessScope(ctx context.Context) (biz.FinanceFactAccessScope, *v1.JsonrpcResult) {
	permissions, res := d.CurrentEffectiveAdminPermissions(ctx)
	if res != nil {
		return biz.FinanceFactAccessScope{}, res
	}
	scope := biz.FinanceFactConfirmAccessScope(permissions)
	if scope.Empty() {
		return biz.FinanceFactAccessScope{}, financeFactPermissionDeniedResult()
	}
	return scope, nil
}

func (d *jsonrpcDispatcher) financeFactReadAccessScope(ctx context.Context) (biz.FinanceFactAccessScope, *v1.JsonrpcResult) {
	permissions, res := d.CurrentEffectiveAdminPermissions(ctx)
	if res != nil {
		return biz.FinanceFactAccessScope{}, res
	}
	scope := biz.FinanceFactReadAccessScope(permissions)
	if scope.Empty() {
		return biz.FinanceFactAccessScope{}, financeFactPermissionDeniedResult()
	}
	return scope, nil
}

func (d *jsonrpcDispatcher) requireFinanceFactAccess(ctx context.Context, factID int, scope biz.FinanceFactAccessScope) *v1.JsonrpcResult {
	item, err := d.operationalFactUC.GetFinanceFact(ctx, factID)
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	if item == nil || !scope.AllowsType(item.FactType) {
		return financeFactPermissionDeniedResult()
	}
	return nil
}

func financeFactPermissionDeniedResult() *v1.JsonrpcResult {
	return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
}

func financeFactFromShipmentCreateFromParams(pm map[string]any, allowInvoiceCategory bool) (*biz.FinanceFactFromShipmentCreate, bool) {
	allowed := []string{"customer_key", "fact_no", "shipment_id", "idempotency_key", "occurred_at", "note"}
	if allowInvoiceCategory {
		allowed = append(allowed, "invoice_category")
	}
	if !financeFactAllowsOnly(pm, allowed...) {
		return nil, false
	}
	occurredAt, ok := getOptionalJSONRPCTime(pm, "occurred_at")
	if !ok {
		return nil, false
	}
	invoiceCategory := getWorkflowStringPtr(pm, "invoice_category")
	if allowInvoiceCategory && invoiceCategory == nil {
		return nil, false
	}
	return &biz.FinanceFactFromShipmentCreate{
		FactNo:          getString(pm, "fact_no"),
		ShipmentID:      getInt(pm, "shipment_id", 0),
		IdempotencyKey:  getString(pm, "idempotency_key"),
		OccurredAt:      optionalTimeValue(occurredAt),
		Note:            getWorkflowStringPtr(pm, "note"),
		InvoiceCategory: invoiceCategory,
	}, true
}

func financeFactFromPurchaseReceiptCreateFromParams(pm map[string]any) (*biz.FinanceFactFromPurchaseReceiptCreate, bool) {
	if !financeFactAllowsOnly(pm, "customer_key", "fact_no", "purchase_receipt_id", "idempotency_key", "occurred_at", "note") {
		return nil, false
	}
	occurredAt, ok := getOptionalJSONRPCTime(pm, "occurred_at")
	if !ok {
		return nil, false
	}
	return &biz.FinanceFactFromPurchaseReceiptCreate{
		FactNo:            getString(pm, "fact_no"),
		PurchaseReceiptID: getInt(pm, "purchase_receipt_id", 0),
		IdempotencyKey:    getString(pm, "idempotency_key"),
		OccurredAt:        optionalTimeValue(occurredAt),
		Note:              getWorkflowStringPtr(pm, "note"),
	}, true
}

func financeFactFromOutsourcingReturnCreateFromParams(pm map[string]any) (*biz.FinanceFactFromOutsourcingReturnCreate, bool) {
	if !financeFactAllowsOnly(pm, "customer_key", "fact_no", "outsourcing_fact_id", "idempotency_key", "occurred_at", "note") {
		return nil, false
	}
	occurredAt, ok := getOptionalJSONRPCTime(pm, "occurred_at")
	if !ok {
		return nil, false
	}
	return &biz.FinanceFactFromOutsourcingReturnCreate{
		FactNo:            getString(pm, "fact_no"),
		OutsourcingFactID: getInt(pm, "outsourcing_fact_id", 0),
		IdempotencyKey:    getString(pm, "idempotency_key"),
		OccurredAt:        optionalTimeValue(occurredAt),
		Note:              getWorkflowStringPtr(pm, "note"),
	}, true
}

func financeReconciliationFromFactCreateFromParams(pm map[string]any) (*biz.FinanceReconciliationFromFactCreate, bool) {
	if !financeFactAllowsOnly(pm, "customer_key", "fact_no", "finance_fact_id", "idempotency_key", "occurred_at", "note") {
		return nil, false
	}
	occurredAt, ok := getOptionalJSONRPCTime(pm, "occurred_at")
	if !ok {
		return nil, false
	}
	return &biz.FinanceReconciliationFromFactCreate{
		FactNo:         getString(pm, "fact_no"),
		FinanceFactID:  getInt(pm, "finance_fact_id", 0),
		IdempotencyKey: getString(pm, "idempotency_key"),
		OccurredAt:     optionalTimeValue(occurredAt),
		Note:           getWorkflowStringPtr(pm, "note"),
	}, true
}

func operationalFactFinanceFactResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.FinanceFact, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"finance_fact": financeFactToAny(item)})
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
	return map[string]any{"id": item.ID, "fact_no": item.FactNo, "fact_type": item.FactType, "status": item.Status, "counterparty_type": item.CounterpartyType, "counterparty_id": optionalIntToAny(item.CounterpartyID), "amount": item.Amount.String(), "fee_amount": item.FeeAmount.String(), "currency": item.Currency, "collection_type": optionalStringToAny(item.CollectionType), "payment_term": optionalStringToAny(item.PaymentTerm), "payment_term_days": optionalIntToAny(item.PaymentTermDays), "invoice_category": optionalStringToAny(item.InvoiceCategory), "source_type": optionalStringToAny(item.SourceType), "source_id": optionalIntToAny(item.SourceID), "source_no": optionalStringToAny(item.SourceNo), "source_line_id": optionalIntToAny(item.SourceLineID), "idempotency_key": item.IdempotencyKey, "occurred_at": item.OccurredAt.Unix(), "posted_at": optionalUnix(item.PostedAt), "settled_at": optionalUnix(item.SettledAt), "cancelled_at": optionalUnix(item.CancelledAt), "cancelled_by_name": optionalStringToAny(item.CancelledByName), "cancel_reason": optionalStringToAny(item.CancelReason), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}

func financeFactAllowsOnly(pm map[string]any, keys ...string) bool {
	allowed := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		allowed[key] = struct{}{}
	}
	for key := range pm {
		if _, ok := allowed[key]; !ok {
			return false
		}
	}
	return true
}
