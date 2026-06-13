package status

import "strings"

const (
	SalesOrderDraft     = "draft"
	SalesOrderSubmitted = "submitted"
	SalesOrderActive    = "active"
	SalesOrderClosed    = "closed"
	SalesOrderCanceled  = "canceled"

	SalesOrderItemOpen     = "open"
	SalesOrderItemClosed   = "closed"
	SalesOrderItemCanceled = "canceled"
)

var (
	salesOrderStatuses = map[string]struct{}{
		SalesOrderDraft:     {},
		SalesOrderSubmitted: {},
		SalesOrderActive:    {},
		SalesOrderClosed:    {},
		SalesOrderCanceled:  {},
	}
	salesOrderItemStatuses = map[string]struct{}{
		SalesOrderItemOpen:     {},
		SalesOrderItemClosed:   {},
		SalesOrderItemCanceled: {},
	}
)

func NormalizeSalesOrderStatus(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func IsSalesOrderStatus(value string) bool {
	_, ok := salesOrderStatuses[NormalizeSalesOrderStatus(value)]
	return ok
}

func IsSalesOrderItemStatus(value string) bool {
	_, ok := salesOrderItemStatuses[NormalizeSalesOrderStatus(value)]
	return ok
}

func CanChangeSalesOrderLifecycle(current string, next string) bool {
	current = NormalizeSalesOrderStatus(current)
	next = NormalizeSalesOrderStatus(next)
	if !IsSalesOrderStatus(current) || !IsSalesOrderStatus(next) {
		return false
	}
	if current == next {
		return true
	}
	switch current {
	case SalesOrderDraft:
		return next == SalesOrderSubmitted || next == SalesOrderCanceled
	case SalesOrderSubmitted:
		return next == SalesOrderActive || next == SalesOrderCanceled
	case SalesOrderActive:
		return next == SalesOrderClosed || next == SalesOrderCanceled
	default:
		return false
	}
}

func IsSalesOrderSettled(status string) bool {
	status = NormalizeSalesOrderStatus(status)
	return status == SalesOrderClosed || status == SalesOrderCanceled
}
