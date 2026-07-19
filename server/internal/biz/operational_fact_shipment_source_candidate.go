package biz

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/shopspring/decimal"
)

const (
	ShipmentSourceCandidateDisabledLineNotOpen             = "line_not_open"
	ShipmentSourceCandidateDisabledFullyShipped            = "fully_shipped"
	ShipmentSourceCandidateDisabledSourceMismatch          = "source_mismatch"
	ShipmentSourceCandidateDisabledShippedQuantityExceeded = "shipped_quantity_exceeded"

	shipmentSourceCandidateMaxKeywordRunes = 128
)

// ShipmentSourceCandidate is the server-owned read model used when a shipment
// draft carries source lines from an active sales order. OrderedQuantity comes
// from the sales-order line; ShippedQuantity includes only SHIPPED shipments.
// DRAFT and CANCELLED shipments never consume RemainingQuantity.
type ShipmentSourceCandidate struct {
	SalesOrderID     int
	OrderNo          string
	OrderStatus      string
	OrderVersion     int
	CustomerID       int
	CustomerSnapshot map[string]any
	// CustomerName is a current-master search/display projection. The immutable
	// order-time value remains CustomerSnapshot.
	CustomerName     string
	SalesOrderItemID int
	LineNo           int
	LineStatus       string
	ProductID        int
	ProductSkuID     *int
	// ProductCode/ProductName are current-master fallback projections. The
	// nullable *Snapshot fields below remain the immutable order-time truth.
	ProductCode         string
	ProductName         string
	ProductCodeSnapshot *string
	ProductNameSnapshot *string
	ColorSnapshot       *string
	// SKUCode/SKUName and UnitCode/UnitName are current-master display
	// projections. SalesOrderItem does not persist SKU or unit text snapshots.
	SKUCode           *string
	SKUName           *string
	UnitID            int
	UnitCode          string
	UnitName          string
	OrderedQuantity   decimal.Decimal
	ShippedQuantity   decimal.Decimal
	RemainingQuantity decimal.Decimal
	Selectable        bool
	DisabledReason    string
}

type ShipmentSourceCandidateFilter struct {
	Keyword      string
	SalesOrderID int
	Limit        int
	Offset       int
}

// ShipmentSourceCandidateRepo owns the cross-domain shipment-source read
// projection. Keeping it as a capability interface avoids widening the base
// operational-fact adapter contract used by isolated test doubles.
type ShipmentSourceCandidateRepo interface {
	ListShipmentSourceCandidates(ctx context.Context, filter ShipmentSourceCandidateFilter) ([]*ShipmentSourceCandidate, int, error)
}

func (uc *OperationalFactUsecase) ListShipmentSourceCandidates(
	ctx context.Context,
	filter ShipmentSourceCandidateFilter,
) ([]*ShipmentSourceCandidate, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeShipmentSourceCandidateFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	repo, ok := uc.repo.(ShipmentSourceCandidateRepo)
	if !ok {
		return nil, 0, ErrBadParam
	}
	return repo.ListShipmentSourceCandidates(ctx, normalized)
}

func normalizeShipmentSourceCandidateFilter(in ShipmentSourceCandidateFilter) (ShipmentSourceCandidateFilter, error) {
	in.Keyword = strings.TrimSpace(in.Keyword)
	if utf8.RuneCountInString(in.Keyword) > shipmentSourceCandidateMaxKeywordRunes ||
		in.SalesOrderID < 0 ||
		in.Limit <= 0 || in.Limit > 200 ||
		in.Offset < 0 {
		return ShipmentSourceCandidateFilter{}, ErrBadParam
	}
	return in, nil
}
