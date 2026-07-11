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
	case "create_production_fact", "createProductionFact",
		"post_production_fact", "postProductionFact",
		"cancel_production_fact", "cancelProductionFact",
		"list_production_facts", "listProductionFacts":
		return d.handleOperationalFactProduction(ctx, method, id, pm)
	case "create_outsourcing_fact", "createOutsourcingFact",
		"post_outsourcing_fact", "postOutsourcingFact",
		"cancel_outsourcing_fact", "cancelOutsourcingFact",
		"list_outsourcing_facts", "listOutsourcingFacts":
		return d.handleOperationalFactOutsourcing(ctx, method, id, pm)
	case "create_shipment", "createShipment",
		"create_shipment_with_items", "createShipmentWithItems",
		"add_shipment_item", "addShipmentItem",
		"ship_shipment", "shipShipment",
		"cancel_shipment", "cancelShipment",
		"list_shipments", "listShipments":
		return d.handleOperationalFactShipment(ctx, method, id, pm, claims.UserID)
	case "create_stock_reservation", "createStockReservation",
		"release_stock_reservation", "releaseStockReservation",
		"list_stock_reservations", "listStockReservations":
		return d.handleOperationalFactReservation(ctx, method, id, pm)
	case "create_finance_fact", "createFinanceFact",
		"post_finance_fact", "postFinanceFact",
		"settle_finance_fact", "settleFinanceFact",
		"cancel_finance_fact", "cancelFinanceFact",
		"list_finance_facts", "listFinanceFacts":
		return d.handleOperationalFactFinance(ctx, method, id, pm, claims.UserID)
	default:
		return id, unknownOperationalFactResult(method), nil
	}
}
