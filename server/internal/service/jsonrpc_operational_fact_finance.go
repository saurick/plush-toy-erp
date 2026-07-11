package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"

	"github.com/shopspring/decimal"
)

func (d *jsonrpcDispatcher) handleOperationalFactFinance(
	ctx context.Context,
	method, id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_finance_fact", "createFinanceFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionFinanceReceivableConfirm, biz.PermissionFinancePayableConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
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
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.PostFinanceFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "settle_finance_fact", "settleFinanceFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionFinanceReceivableConfirm, biz.PermissionFinancePayableConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.SettleFinanceFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "cancel_finance_fact", "cancelFinanceFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionFinanceReceivableConfirm, biz.PermissionFinancePayableConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance"); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelPostedFinanceFactWithActor(ctx, getInt(pm, "id", 0), actorID)
		return id, operationalFactFinanceFactResult(ctx, d, item, err), nil
	case "list_finance_facts", "listFinanceFacts":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionFinanceReceivableRead, biz.PermissionFinancePayableRead); res != nil {
			return id, res, nil
		}
		filter, ok := operationalFactFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.operationalFactUC.ListFinanceFacts(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"finance_facts": financeFactsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil
	default:
		return id, unknownOperationalFactResult(method), nil
	}
}

func financeFactCreateFromParams(pm map[string]any) (*biz.FinanceFactCreate, bool) {
	amount, ok := getRequiredJSONRPCDecimal(pm, "amount")
	if !ok {
		return nil, false
	}
	feeAmount, ok := getOptionalJSONRPCDecimal(pm, "fee_amount")
	if !ok {
		return nil, false
	}
	occurredAt, ok := getOptionalJSONRPCTime(pm, "occurred_at")
	if !ok {
		return nil, false
	}
	normalizedFeeAmount := decimal.Zero
	if feeAmount != nil {
		normalizedFeeAmount = *feeAmount
	}
	return &biz.FinanceFactCreate{
		FactNo:           getString(pm, "fact_no"),
		FactType:         getString(pm, "fact_type"),
		CounterpartyType: getString(pm, "counterparty_type"),
		CounterpartyID:   getOptionalInt(pm, "counterparty_id"),
		Amount:           amount,
		FeeAmount:        normalizedFeeAmount,
		Currency:         getString(pm, "currency"),
		CollectionType:   getWorkflowStringPtr(pm, "collection_type"),
		PaymentTerm:      getWorkflowStringPtr(pm, "payment_term"),
		PaymentTermDays:  getOptionalNonNegativeInt(pm, "payment_term_days"),
		InvoiceCategory:  getWorkflowStringPtr(pm, "invoice_category"),
		SourceType:       getWorkflowStringPtr(pm, "source_type"),
		SourceID:         getOptionalInt(pm, "source_id"),
		SourceLineID:     getOptionalInt(pm, "source_line_id"),
		IdempotencyKey:   getString(pm, "idempotency_key"),
		OccurredAt:       optionalTimeValue(occurredAt),
		Note:             getWorkflowStringPtr(pm, "note"),
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
	return map[string]any{"id": item.ID, "fact_no": item.FactNo, "fact_type": item.FactType, "status": item.Status, "counterparty_type": item.CounterpartyType, "counterparty_id": optionalIntToAny(item.CounterpartyID), "amount": item.Amount.String(), "fee_amount": item.FeeAmount.String(), "currency": item.Currency, "collection_type": optionalStringToAny(item.CollectionType), "payment_term": optionalStringToAny(item.PaymentTerm), "payment_term_days": optionalIntToAny(item.PaymentTermDays), "invoice_category": optionalStringToAny(item.InvoiceCategory), "source_type": optionalStringToAny(item.SourceType), "source_id": optionalIntToAny(item.SourceID), "source_line_id": optionalIntToAny(item.SourceLineID), "idempotency_key": item.IdempotencyKey, "occurred_at": item.OccurredAt.Unix(), "posted_at": optionalUnix(item.PostedAt), "settled_at": optionalUnix(item.SettledAt), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}
