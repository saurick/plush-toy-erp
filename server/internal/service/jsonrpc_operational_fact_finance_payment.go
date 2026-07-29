package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleFinancePaymentV1(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	permission := map[string]string{"create_finance_payment": biz.PermissionFinancePaymentCreate, "cancel_finance_payment": biz.PermissionFinancePaymentCreate, "reverse_finance_payment": biz.PermissionFinancePaymentReverse, "get_finance_payment": biz.PermissionFinancePaymentRead, "list_finance_payments": biz.PermissionFinancePaymentRead, "get_finance_credit_note": biz.PermissionFinancePaymentRead, "list_finance_credit_notes": biz.PermissionFinancePaymentRead, "create_finance_credit_note": biz.PermissionFinanceCreditNoteCreate, "reverse_finance_credit_note": biz.PermissionFinanceCreditNoteReverse}[method]
	if permission == "" {
		return id, unknownOperationalFactResult(method), nil
	}
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if method != "get_finance_payment" && method != "list_finance_payments" && method != "get_finance_credit_note" && method != "list_finance_credit_notes" {
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance", "finance_payments"); res != nil {
			return id, res, nil
		}
	} else if res := d.requireCustomerConfigModulesReadable(ctx, "finance", "finance_payments"); res != nil {
		return id, res, nil
	}
	switch method {
	case "create_finance_payment":
		if !financeFactAllowsOnly(pm, "customer_key", "payment_no", "direction", "counterparty_type", "counterparty_id", "amount", "currency", "account_ref", "evidence_ref", "idempotency_key", "occurred_at") {
			return id, invalidParamResult(), nil
		}
		amount, ok := getRequiredJSONRPCNumeric20Scale6(pm, "amount")
		if !ok {
			return id, invalidParamResult(), nil
		}
		occurred, ok := getOptionalJSONRPCTime(pm, "occurred_at")
		if !ok {
			return id, invalidParamResult(), nil
		}
		in := &biz.FinancePaymentCreate{PaymentNo: getString(pm, "payment_no"), Direction: getString(pm, "direction"), CounterpartyType: getString(pm, "counterparty_type"), CounterpartyID: getInt(pm, "counterparty_id", 0), Amount: amount, Currency: getString(pm, "currency"), AccountRef: getString(pm, "account_ref"), EvidenceRef: getString(pm, "evidence_ref"), IdempotencyKey: getString(pm, "idempotency_key")}
		if occurred != nil {
			in.OccurredAt = *occurred
			in.OccurredAtSpecified = true
		}
		out, err := d.operationalFactUC.CreateFinancePayment(ctx, in, actorID)
		return id, financePaymentResult(d, ctx, out, err), nil
	case "cancel_finance_payment":
		if !financeFactAllowsOnly(pm, "customer_key", "id", "expected_version", "reason") {
			return id, invalidParamResult(), nil
		}
		out, err := d.operationalFactUC.CancelFinancePayment(ctx, &biz.FinancePaymentTransition{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), Reason: getString(pm, "reason")}, actorID)
		return id, financePaymentResult(d, ctx, out, err), nil
	case "reverse_finance_payment":
		if !financeFactAllowsOnly(pm, "customer_key", "id", "expected_version", "reason") {
			return id, invalidParamResult(), nil
		}
		out, err := d.operationalFactUC.ReverseFinancePayment(ctx, &biz.FinancePaymentReverse{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), Reason: getString(pm, "reason")}, actorID)
		return id, financePaymentResult(d, ctx, out, err), nil
	case "get_finance_payment":
		if !financeFactAllowsOnly(pm, "customer_key", "id") {
			return id, invalidParamResult(), nil
		}
		out, err := d.operationalFactUC.GetFinancePayment(ctx, getInt(pm, "id", 0))
		return id, financePaymentResult(d, ctx, out, err), nil
	case "list_finance_payments":
		if !financeFactAllowsOnly(pm, "customer_key", "status", "direction", "counterparty_type", "counterparty_id", "limit", "offset") {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.operationalFactUC.ListFinancePayments(ctx, biz.FinancePaymentFilter{Status: getString(pm, "status"), Direction: getString(pm, "direction"), CounterpartyType: getString(pm, "counterparty_type"), CounterpartyID: getInt(pm, "counterparty_id", 0), Limit: getInt(pm, "limit", 50), Offset: getInt(pm, "offset", 0)})
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, financePaymentToMap(item))
		}
		return id, okData(map[string]any{"payments": out, "total": total, "limit": getInt(pm, "limit", 50), "offset": getInt(pm, "offset", 0)}), nil
	case "get_finance_credit_note":
		if !financeFactAllowsOnly(pm, "customer_key", "id") {
			return id, invalidParamResult(), nil
		}
		out, err := d.operationalFactUC.GetFinanceCreditNote(ctx, getInt(pm, "id", 0))
		return id, financeCreditNoteResult(d, ctx, out, err), nil
	case "list_finance_credit_notes":
		if !financeFactAllowsOnly(pm, "customer_key", "status", "finance_fact_id", "limit", "offset") {
			return id, invalidParamResult(), nil
		}
		limit, offset := getInt(pm, "limit", 50), getInt(pm, "offset", 0)
		items, total, err := d.operationalFactUC.ListFinanceCreditNotes(ctx, biz.FinanceCreditNoteFilter{Status: getString(pm, "status"), FinanceFactID: getInt(pm, "finance_fact_id", 0), Limit: limit, Offset: offset})
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, financeCreditNoteToMap(item))
		}
		return id, okData(map[string]any{"credit_notes": out, "total": total, "limit": limit, "offset": offset}), nil
	case "create_finance_credit_note":
		if !financeFactAllowsOnly(pm, "customer_key", "credit_note_no", "finance_fact_id", "amount", "reason", "idempotency_key") {
			return id, invalidParamResult(), nil
		}
		amount, ok := getRequiredJSONRPCNumeric20Scale6(pm, "amount")
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireAnySourceActionReadPermission(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		factID := getInt(pm, "finance_fact_id", 0)
		source, err := d.operationalFactUC.GetFinanceFact(ctx, factID)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		if source == nil {
			return id, d.mapOperationalFactError(ctx, biz.ErrFinanceFactNotFound), nil
		}
		condition, ok := biz.FinanceCreditSourceReadCondition(source.FactType)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method, condition); res != nil {
			return id, res, nil
		}
		out, err := d.operationalFactUC.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{CreditNoteNo: getString(pm, "credit_note_no"), FinanceFactID: factID, Amount: amount, Reason: getString(pm, "reason"), IdempotencyKey: getString(pm, "idempotency_key")}, actorID)
		return id, financeCreditNoteResult(d, ctx, out, err), nil
	case "reverse_finance_credit_note":
		if !financeFactAllowsOnly(pm, "customer_key", "credit_note_id", "credit_note_no", "reason", "idempotency_key") {
			return id, invalidParamResult(), nil
		}
		if res := d.requireAnySourceActionReadPermission(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		creditNoteID := getInt(pm, "credit_note_id", 0)
		creditNote, err := d.operationalFactUC.GetFinanceCreditNote(ctx, creditNoteID)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		if creditNote == nil {
			return id, d.mapOperationalFactError(ctx, biz.ErrBadParam), nil
		}
		source, err := d.operationalFactUC.GetFinanceFact(ctx, creditNote.FinanceFactID)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		if source == nil {
			return id, d.mapOperationalFactError(ctx, biz.ErrFinanceFactNotFound), nil
		}
		condition, ok := biz.FinanceCreditSourceReadCondition(source.FactType)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method, condition); res != nil {
			return id, res, nil
		}
		out, err := d.operationalFactUC.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: creditNoteID, CreditNoteNo: getString(pm, "credit_note_no"), Reason: getString(pm, "reason"), IdempotencyKey: getString(pm, "idempotency_key")}, actorID)
		return id, financeCreditNoteResult(d, ctx, out, err), nil
	}
	return id, unknownOperationalFactResult(method), nil
}
func financePaymentResult(d *jsonrpcDispatcher, ctx context.Context, item *biz.FinancePayment, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"payment": financePaymentToMap(item)})
}
func financeCreditNoteResult(d *jsonrpcDispatcher, ctx context.Context, item *biz.FinanceCreditNote, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"credit_note": financeCreditNoteToMap(item)})
}
func financePaymentToMap(item *biz.FinancePayment) map[string]any {
	if item == nil {
		return nil
	}
	allocations := make([]any, 0, len(item.Allocations))
	for _, a := range item.Allocations {
		allocations = append(allocations, map[string]any{"id": a.ID, "finance_fact_id": a.FinanceFactID, "finance_fact_no": a.FinanceFactNo, "finance_fact_type": a.FinanceFactType, "finance_fact_original_amount": a.FinanceFactOriginalAmount.String(), "finance_fact_outstanding_amount": a.FinanceFactOutstandingAmount.String(), "amount": a.Amount.String(), "currency": a.Currency, "status": a.Status, "reversal_of_allocation_id": optionalIntValue(a.ReversalOfAllocationID)})
	}
	return map[string]any{
		"id":                item.ID,
		"payment_no":        item.PaymentNo,
		"direction":         item.Direction,
		"status":            item.Status,
		"counterparty_type": item.CounterpartyType,
		"counterparty_id":   item.CounterpartyID,
		"amount":            item.Amount.String(),
		"currency":          item.Currency,
		"account_ref":       item.AccountRef,
		"evidence_ref":      item.EvidenceRef,
		"version":           item.Version,
		"occurred_at":       item.OccurredAt.Unix(),
		"approved_at":       optionalTimeUnix(item.ApprovedAt),
		"approved_by":       optionalIntValue(item.ApprovedBy),
		"rejected_at":       optionalTimeUnix(item.RejectedAt),
		"rejected_by":       optionalIntValue(item.RejectedBy),
		"reject_reason":     optionalStringValue(item.RejectReason),
		"posted_at":         optionalTimeUnix(item.PostedAt),
		"posted_by":         optionalIntValue(item.PostedBy),
		"cancelled_at":      optionalTimeUnix(item.CancelledAt),
		"cancelled_by":      optionalIntValue(item.CancelledBy),
		"cancel_reason":     optionalStringValue(item.CancelReason),
		"reversed_at":       optionalTimeUnix(item.ReversedAt),
		"reversed_by":       optionalIntValue(item.ReversedBy),
		"reverse_reason":    optionalStringValue(item.ReverseReason),
		"created_by":        item.CreatedBy,
		"created_at":        item.CreatedAt.Unix(),
		"updated_at":        item.UpdatedAt.Unix(),
		"allocations":       allocations,
	}
}
func financeCreditNoteToMap(item *biz.FinanceCreditNote) map[string]any {
	if item == nil {
		return nil
	}
	return map[string]any{"id": item.ID, "credit_note_no": item.CreditNoteNo, "finance_fact_id": item.FinanceFactID, "finance_fact_no": item.FinanceFactNo, "finance_fact_type": item.FinanceFactType, "finance_fact_original_amount": item.FinanceFactOriginalAmount.String(), "finance_fact_outstanding_amount": item.FinanceFactOutstandingAmount.String(), "reversal_of_credit_note_id": optionalIntValue(item.ReversalOfCreditNoteID), "amount": item.Amount.String(), "currency": item.Currency, "status": item.Status, "reason": item.Reason}
}
