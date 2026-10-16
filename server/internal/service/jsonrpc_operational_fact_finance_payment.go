package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleFinancePayment(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	permission := map[string]string{"list_finance_payment_allocation_candidates": biz.PermissionFinancePaymentRead, "allocate_finance_payment": biz.PermissionFinancePaymentPost, "reverse_finance_allocation": biz.PermissionFinancePaymentReverse, "create_finance_payment": biz.PermissionFinancePaymentCreate, "cancel_finance_payment": biz.PermissionFinancePaymentCreate, "reverse_finance_payment": biz.PermissionFinancePaymentReverse, "get_finance_payment": biz.PermissionFinancePaymentRead, "list_finance_payments": biz.PermissionFinancePaymentRead, "get_finance_credit_note": biz.PermissionFinancePaymentRead, "list_finance_credit_notes": biz.PermissionFinancePaymentRead, "create_finance_credit_note": biz.PermissionFinanceCreditNoteCreate, "reverse_finance_credit_note": biz.PermissionFinanceCreditNoteReverse}[method]
	if permission == "" {
		return id, unknownOperationalFactResult(method), nil
	}
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if method != "list_finance_payment_allocation_candidates" && method != "get_finance_payment" && method != "list_finance_payments" && method != "get_finance_credit_note" && method != "list_finance_credit_notes" {
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "finance", "finance_payments"); res != nil {
			return id, res, nil
		}
	} else if res := d.requireCustomerConfigModulesReadable(ctx, "finance", "finance_payments"); res != nil {
		return id, res, nil
	}
	switch method {
	case "create_finance_payment":
		if !jsonRPCParamsAllowed(pm, "customer_key", "payment_no", "direction", "counterparty_type", "counterparty_id", "amount", "currency", "account_ref", "evidence_ref", "idempotency_key", "occurred_at", "kind", "source_type", "source_id", "refund_of_payment_id", "purpose_note") {
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
		in := &biz.FinancePaymentCreate{Kind: getString(pm, "kind"), SourceType: getString(pm, "source_type"), SourceID: getInt(pm, "source_id", 0), RefundOfPaymentID: getInt(pm, "refund_of_payment_id", 0), PurposeNote: getString(pm, "purpose_note"), PaymentNo: getString(pm, "payment_no"), Direction: getString(pm, "direction"), CounterpartyType: getString(pm, "counterparty_type"), CounterpartyID: getInt(pm, "counterparty_id", 0), Amount: amount, Currency: getString(pm, "currency"), AccountRef: getString(pm, "account_ref"), EvidenceRef: getString(pm, "evidence_ref"), IdempotencyKey: getString(pm, "idempotency_key")}
		if occurred != nil {
			in.OccurredAt = *occurred
			in.OccurredAtSpecified = true
		}
		if in.SourceType != "" {
			sourcePermission := map[string]string{"sales_order": biz.PermissionSalesOrderRead, "purchase_order": biz.PermissionPurchaseOrderRead, "outsourcing_order": biz.PermissionOutsourcingOrderRead}[in.SourceType]
			if sourcePermission == "" {
				return id, invalidParamResult(), nil
			}
			if res := d.RequireAdminPermission(ctx, sourcePermission); res != nil {
				return id, res, nil
			}
		}
		if in.RefundOfPaymentID > 0 {
			if res := d.RequireAdminPermission(ctx, biz.PermissionFinancePaymentRead); res != nil {
				return id, res, nil
			}
		}
		out, err := d.operationalFactUC.CreateFinancePayment(ctx, in, actorID)
		return id, financePaymentResult(d, ctx, out, err), nil
	case "list_finance_payment_allocation_candidates", "allocate_finance_payment", "reverse_finance_allocation":
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		paymentID := getInt(pm, "id", 0)
		payment, err := d.operationalFactUC.GetFinancePayment(ctx, paymentID)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		if payment == nil {
			return id, invalidParamResult(), nil
		}
		condition := biz.SourceReadConditionFinancePayable
		if payment.CounterpartyType == biz.FinanceCounterpartyCustomer {
			condition = biz.SourceReadConditionFinanceReceivable
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method, condition); res != nil {
			return id, res, nil
		}
		if method == "list_finance_payment_allocation_candidates" {
			if !jsonRPCParamsAllowed(pm, "customer_key", "id") {
				return id, invalidParamResult(), nil
			}
			rows, err := d.operationalFactUC.FinancePaymentAllocationCandidates(ctx, paymentID)
			if err != nil {
				return id, d.mapOperationalFactError(ctx, err), nil
			}
			return id, okData(map[string]any{"facts": financeFactsToAny(rows)}), nil
		}
		if method == "reverse_finance_allocation" {
			if !jsonRPCParamsAllowed(pm, "customer_key", "id", "expected_version", "allocation_id", "reason") {
				return id, invalidParamResult(), nil
			}
			out, err := d.operationalFactUC.ReverseFinanceAllocation(ctx, &biz.FinanceAllocationReverse{PaymentID: paymentID, AllocationID: getInt(pm, "allocation_id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), Reason: getString(pm, "reason")}, actorID)
			return id, financePaymentResult(d, ctx, out, err), nil
		}
		if !jsonRPCParamsAllowed(pm, "customer_key", "id", "expected_version", "allocations", "idempotency_key") {
			return id, invalidParamResult(), nil
		}
		raw, ok := pm["allocations"].([]any)
		if !ok || len(raw) == 0 {
			return id, invalidParamResult(), nil
		}
		allocations := make([]biz.FinancePaymentAllocationInput, 0, len(raw))
		for _, value := range raw {
			row, ok := value.(map[string]any)
			if !ok || !jsonRPCParamsAllowed(row, "finance_fact_id", "amount") {
				return id, invalidParamResult(), nil
			}
			amount, ok := getRequiredJSONRPCNumeric20Scale6(row, "amount")
			if !ok {
				return id, invalidParamResult(), nil
			}
			allocations = append(allocations, biz.FinancePaymentAllocationInput{FinanceFactID: getInt(row, "finance_fact_id", 0), Amount: amount})
		}
		out, err := d.operationalFactUC.AllocateFinancePayment(ctx, &biz.FinancePaymentAllocate{ID: paymentID, ExpectedVersion: getInt(pm, "expected_version", 0), IdempotencyKey: getString(pm, "idempotency_key"), Allocations: allocations}, actorID)
		return id, financePaymentResult(d, ctx, out, err), nil
	case "cancel_finance_payment":
		if !jsonRPCParamsAllowed(pm, "customer_key", "id", "expected_version", "reason") {
			return id, invalidParamResult(), nil
		}
		out, err := d.operationalFactUC.CancelFinancePayment(ctx, &biz.FinancePaymentTransition{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), Reason: getString(pm, "reason")}, actorID)
		return id, financePaymentResult(d, ctx, out, err), nil
	case "reverse_finance_payment":
		if !jsonRPCParamsAllowed(pm, "customer_key", "id", "expected_version", "reason") {
			return id, invalidParamResult(), nil
		}
		out, err := d.operationalFactUC.ReverseFinancePayment(ctx, &biz.FinancePaymentReverse{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), Reason: getString(pm, "reason")}, actorID)
		return id, financePaymentResult(d, ctx, out, err), nil
	case "get_finance_payment":
		if !jsonRPCParamsAllowed(pm, "customer_key", "id") {
			return id, invalidParamResult(), nil
		}
		out, err := d.operationalFactUC.GetFinancePayment(ctx, getInt(pm, "id", 0))
		return id, financePaymentResult(d, ctx, out, err), nil
	case "list_finance_payments":
		if !jsonRPCParamsAllowed(pm, "include_status_counts", "customer_key", "keyword", "status", "direction", "counterparty_type", "counterparty_id", "limit", "offset", "kind", "source_type", "source_id", "refund_of_payment_id") {
			return id, invalidParamResult(), nil
		}
		filter := biz.FinancePaymentFilter{Kind: getString(pm, "kind"), SourceType: getString(pm, "source_type"), SourceID: getInt(pm, "source_id", 0), RefundOfPaymentID: getInt(pm, "refund_of_payment_id", 0), Keyword: getString(pm, "keyword"), Status: getString(pm, "status"), Direction: getString(pm, "direction"), CounterpartyType: getString(pm, "counterparty_type"), CounterpartyID: getInt(pm, "counterparty_id", 0), Limit: getInt(pm, "limit", 50), Offset: getInt(pm, "offset", 0)}
		items, total, err := d.operationalFactUC.ListFinancePayments(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		statusCounts, err := requestedBusinessStatusCounts(pm, func() (map[string]int, error) {
			return d.operationalFactUC.CountFinancePaymentsByStatus(ctx, filter)
		})
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, financePaymentToMap(item))
		}
		return id, okData(withBusinessStatusCounts(map[string]any{"payments": out, "total": total, "limit": getInt(pm, "limit", 50), "offset": getInt(pm, "offset", 0)}, statusCounts)), nil
	case "get_finance_credit_note":
		if !jsonRPCParamsAllowed(pm, "customer_key", "id") {
			return id, invalidParamResult(), nil
		}
		out, err := d.operationalFactUC.GetFinanceCreditNote(ctx, getInt(pm, "id", 0))
		return id, financeCreditNoteResult(d, ctx, out, err), nil
	case "list_finance_credit_notes":
		if !jsonRPCParamsAllowed(pm, "include_status_counts", "customer_key", "keyword", "status", "finance_fact_id", "limit", "offset") {
			return id, invalidParamResult(), nil
		}
		limit, offset := getInt(pm, "limit", 50), getInt(pm, "offset", 0)
		filter := biz.FinanceCreditNoteFilter{Keyword: getString(pm, "keyword"), Status: getString(pm, "status"), FinanceFactID: getInt(pm, "finance_fact_id", 0), Limit: limit, Offset: offset}
		items, total, err := d.operationalFactUC.ListFinanceCreditNotes(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		statusCounts, err := requestedBusinessStatusCounts(pm, func() (map[string]int, error) {
			return d.operationalFactUC.CountFinanceCreditNotesByStatus(ctx, filter)
		})
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, financeCreditNoteToMap(item))
		}
		return id, okData(withBusinessStatusCounts(map[string]any{"credit_notes": out, "total": total, "limit": limit, "offset": offset}, statusCounts)), nil
	case "create_finance_credit_note":
		if !jsonRPCParamsAllowed(pm, "customer_key", "credit_note_no", "finance_fact_id", "amount", "reason", "idempotency_key") {
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
		if !jsonRPCParamsAllowed(pm, "customer_key", "credit_note_id", "credit_note_no", "reason", "idempotency_key") {
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
		allocations = append(allocations, map[string]any{"id": a.ID, "finance_fact_id": a.FinanceFactID, "finance_fact_no": a.FinanceFactNo, "finance_fact_type": a.FinanceFactType, "finance_fact_original_amount": a.FinanceFactOriginalAmount.String(), "finance_fact_outstanding_amount": a.FinanceFactOutstandingAmount.String(), "amount": a.Amount.String(), "currency": a.Currency, "status": a.Status, "reason": optionalStringValue(a.Reason), "reversal_of_allocation_id": optionalIntValue(a.ReversalOfAllocationID)})
	}
	return map[string]any{
		"id":                   item.ID,
		"payment_no":           item.PaymentNo,
		"kind":                 item.Kind,
		"source_type":          optionalStringValue(item.SourceType),
		"source_id":            optionalIntValue(item.SourceID),
		"source_no":            item.SourceNo,
		"refund_of_payment_id": optionalIntValue(item.RefundOfPaymentID),
		"refund_of_payment_no": item.RefundOfPaymentNo,
		"purpose_note":         optionalStringValue(item.PurposeNote),
		"allocated_amount":     item.AllocatedAmount.String(),
		"refunded_amount":      item.RefundedAmount.String(),
		"available_amount":     item.AvailableAmount.String(),
		"direction":            item.Direction,
		"status":               item.Status,
		"counterparty_type":    item.CounterpartyType,
		"counterparty_id":      item.CounterpartyID,
		"amount":               item.Amount.String(),
		"currency":             item.Currency,
		"account_ref":          item.AccountRef,
		"evidence_ref":         item.EvidenceRef,
		"version":              item.Version,
		"occurred_at":          item.OccurredAt.Unix(),
		"approved_at":          optionalTimeUnix(item.ApprovedAt),
		"approved_by":          optionalIntValue(item.ApprovedBy),
		"rejected_at":          optionalTimeUnix(item.RejectedAt),
		"rejected_by":          optionalIntValue(item.RejectedBy),
		"reject_reason":        optionalStringValue(item.RejectReason),
		"posted_at":            optionalTimeUnix(item.PostedAt),
		"posted_by":            optionalIntValue(item.PostedBy),
		"cancelled_at":         optionalTimeUnix(item.CancelledAt),
		"cancelled_by":         optionalIntValue(item.CancelledBy),
		"cancel_reason":        optionalStringValue(item.CancelReason),
		"reversed_at":          optionalTimeUnix(item.ReversedAt),
		"reversed_by":          optionalIntValue(item.ReversedBy),
		"reverse_reason":       optionalStringValue(item.ReverseReason),
		"created_by":           item.CreatedBy,
		"created_at":           item.CreatedAt.Unix(),
		"updated_at":           item.UpdatedAt.Unix(),
		"allocations":          allocations,
	}
}
func financeCreditNoteToMap(item *biz.FinanceCreditNote) map[string]any {
	if item == nil {
		return nil
	}
	return map[string]any{"id": item.ID, "credit_note_no": item.CreditNoteNo, "finance_fact_id": item.FinanceFactID, "finance_fact_no": item.FinanceFactNo, "finance_fact_type": item.FinanceFactType, "finance_fact_original_amount": item.FinanceFactOriginalAmount.String(), "finance_fact_outstanding_amount": item.FinanceFactOutstandingAmount.String(), "reversal_of_credit_note_id": optionalIntValue(item.ReversalOfCreditNoteID), "amount": item.Amount.String(), "currency": item.Currency, "status": item.Status, "reason": item.Reason}
}
