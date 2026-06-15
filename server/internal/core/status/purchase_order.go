package status

const (
	PurchaseOrderDraft     = "draft"
	PurchaseOrderSubmitted = "submitted"
	PurchaseOrderApproved  = "approved"
	PurchaseOrderClosed    = "closed"
	PurchaseOrderCanceled  = "canceled"

	PurchaseOrderItemOpen     = "open"
	PurchaseOrderItemClosed   = "closed"
	PurchaseOrderItemCanceled = "canceled"
)

var (
	purchaseOrderStatuses = map[string]struct{}{
		PurchaseOrderDraft:     {},
		PurchaseOrderSubmitted: {},
		PurchaseOrderApproved:  {},
		PurchaseOrderClosed:    {},
		PurchaseOrderCanceled:  {},
	}
	purchaseOrderItemStatuses = map[string]struct{}{
		PurchaseOrderItemOpen:     {},
		PurchaseOrderItemClosed:   {},
		PurchaseOrderItemCanceled: {},
	}
)

func NormalizePurchaseOrderStatus(value string) string {
	return NormalizeSalesOrderStatus(value)
}

func IsPurchaseOrderStatus(value string) bool {
	_, ok := purchaseOrderStatuses[NormalizePurchaseOrderStatus(value)]
	return ok
}

func IsPurchaseOrderItemStatus(value string) bool {
	_, ok := purchaseOrderItemStatuses[NormalizePurchaseOrderStatus(value)]
	return ok
}

func CanChangePurchaseOrderLifecycle(current string, next string) bool {
	current = NormalizePurchaseOrderStatus(current)
	next = NormalizePurchaseOrderStatus(next)
	if !IsPurchaseOrderStatus(current) || !IsPurchaseOrderStatus(next) {
		return false
	}
	if current == next {
		return true
	}
	switch current {
	case PurchaseOrderDraft:
		return next == PurchaseOrderSubmitted || next == PurchaseOrderCanceled
	case PurchaseOrderSubmitted:
		return next == PurchaseOrderApproved || next == PurchaseOrderCanceled
	case PurchaseOrderApproved:
		return next == PurchaseOrderClosed || next == PurchaseOrderCanceled
	default:
		return false
	}
}

func IsPurchaseOrderSettled(status string) bool {
	status = NormalizePurchaseOrderStatus(status)
	return status == PurchaseOrderClosed || status == PurchaseOrderCanceled
}
