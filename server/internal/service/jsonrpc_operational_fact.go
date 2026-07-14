package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
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
	claims, res := d.requireAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	if d.operationalFactUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_production_completion_from_order",
		"create_production_material_issue_from_order",
		"create_production_rework_from_completion",
		"post_production_fact",
		"cancel_production_fact",
		"list_production_facts",
		"list_production_order_material_requirements":
		return d.handleOperationalFactProduction(ctx, method, id, pm)
	case "create_outsourcing_material_issue_from_order",
		"create_outsourcing_return_receipt_from_order",
		"post_outsourcing_fact",
		"cancel_outsourcing_fact",
		"list_outsourcing_facts":
		return d.handleOperationalFactOutsourcing(ctx, method, id, pm)
	case "create_shipment_with_items",
		"ship_shipment",
		"cancel_shipment",
		"list_shipments":
		return d.handleOperationalFactShipment(ctx, method, id, pm, claims.UserID)
	case "create_stock_reservation_from_sales_order",
		"release_stock_reservation",
		"list_stock_reservations":
		return d.handleOperationalFactReservation(ctx, method, id, pm)
	case "create_receivable_from_shipment",
		"create_invoice_from_shipment",
		"create_payable_from_purchase_receipt",
		"create_payable_from_outsourcing_return",
		"create_reconciliation_from_finance_fact",
		"post_finance_fact",
		"settle_finance_fact",
		"cancel_finance_fact",
		"list_finance_facts":
		return d.handleOperationalFactFinance(ctx, method, id, pm, claims.UserID)
	default:
		return id, unknownOperationalFactResult(method), nil
	}
}
