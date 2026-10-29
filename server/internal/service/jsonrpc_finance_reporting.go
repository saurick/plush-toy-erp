package service

import (
	"context"
	"encoding/json"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleFinanceReporting(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "get_finance_statement":
		if !jsonRPCParamsAllowed(pm, "customer_key", "counterparty_type", "counterparty_id", "currency", "date_from", "date_to", "snapshot_at", "limit", "offset") {
			return id, invalidParamResult(), nil
		}
		partyType := getString(pm, "counterparty_type")
		condition := biz.SourceReadConditionFinancePayable
		if partyType == biz.FinanceCounterpartyCustomer {
			condition = biz.SourceReadConditionFinanceReceivable
		} else if partyType != biz.FinanceCounterpartySupplier {
			return id, invalidParamResult(), nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method, condition); res != nil {
			return id, res, nil
		}
		snapshot, ok := getOptionalJSONRPCTime(pm, "snapshot_at")
		if !ok {
			return id, invalidParamResult(), nil
		}
		q := biz.FinanceStatementQuery{CounterpartyType: partyType, CounterpartyID: getInt(pm, "counterparty_id", 0), Currency: getString(pm, "currency"), DateFrom: getString(pm, "date_from"), DateTo: getString(pm, "date_to"), Limit: normalizedBusinessListLimit(pm), Offset: getInt(pm, "offset", 0)}
		if snapshot != nil {
			q.SnapshotAt = *snapshot
		}
		out, err := d.operationalFactUC.GetFinanceStatement(ctx, q)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		result, err := financeReportingResult(map[string]any{"statement": out})
		return id, result, err
	case "list_finance_source_adjustments", "create_finance_source_adjustment":
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if method == "list_finance_source_adjustments" {
			if !jsonRPCParamsAllowed(pm, "customer_key", "finance_fact_id", "limit", "offset") {
				return id, invalidParamResult(), nil
			}
			items, total, err := d.operationalFactUC.ListFinanceSourceAdjustments(ctx, biz.FinanceSourceAdjustmentFilter{FinanceFactID: getInt(pm, "finance_fact_id", 0), Limit: normalizedBusinessListLimit(pm), Offset: getInt(pm, "offset", 0)})
			if err != nil {
				return id, d.mapOperationalFactError(ctx, err), nil
			}
			result, err := financeReportingResult(map[string]any{"adjustments": items, "total": total})
			return id, result, err
		}
		if !jsonRPCParamsAllowed(pm, "customer_key", "source_type", "source_id", "credit_note_no", "reason", "idempotency_key") {
			return id, invalidParamResult(), nil
		}
		out, err := d.operationalFactUC.CreateFinanceSourceAdjustment(ctx, &biz.FinanceSourceAdjustmentCreate{SourceType: getString(pm, "source_type"), SourceID: getInt(pm, "source_id", 0), CreditNoteNo: getString(pm, "credit_note_no"), Reason: getString(pm, "reason"), IdempotencyKey: getString(pm, "idempotency_key")}, actorID)
		return id, financeCreditNoteResult(d, ctx, out, err), nil
	}
	return id, unknownOperationalFactResult(method), nil
}

// Typed projections contain decimals and timestamps. Convert through their JSON
// contract before constructing protobuf data, preserving decimal strings.
func financeReportingResult(value map[string]any) (*v1.JsonrpcResult, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	data := map[string]any{}
	if err := json.Unmarshal(encoded, &data); err != nil {
		return nil, err
	}
	return okData(data), nil
}
