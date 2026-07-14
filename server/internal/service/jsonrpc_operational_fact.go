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
	case "create_production_fact",
		"post_production_fact",
		"cancel_production_fact",
		"list_production_facts":
		return d.handleOperationalFactProduction(ctx, method, id, pm)
	case "create_outsourcing_fact",
		"post_outsourcing_fact",
		"cancel_outsourcing_fact",
		"list_outsourcing_facts":
		return d.handleOperationalFactOutsourcing(ctx, method, id, pm)
	case "create_shipment_with_items",
		"ship_shipment",
		"cancel_shipment",
		"list_shipments":
		return d.handleOperationalFactShipment(ctx, method, id, pm, claims.UserID)
	case "create_stock_reservation",
		"release_stock_reservation",
		"list_stock_reservations":
		return d.handleOperationalFactReservation(ctx, method, id, pm)
	case "create_finance_fact",
		"post_finance_fact",
		"settle_finance_fact",
		"cancel_finance_fact",
		"list_finance_facts":
		return d.handleOperationalFactFinance(ctx, method, id, pm, claims.UserID)
	default:
		return id, unknownOperationalFactResult(method), nil
	}
}
