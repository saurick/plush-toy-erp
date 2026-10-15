package status

import "strings"

const (
	InventoryLotActive   = "ACTIVE"
	InventoryLotHold     = "HOLD"
	InventoryLotRejected = "REJECTED"
	InventoryLotDisabled = "DISABLED"
)

var inventoryLotStatuses = map[string]struct{}{
	InventoryLotActive:   {},
	InventoryLotHold:     {},
	InventoryLotRejected: {},
	InventoryLotDisabled: {},
}

func NormalizeUpperStatus(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func NormalizeInventoryLotStatus(value string) string {
	return NormalizeUpperStatus(value)
}

func IsInventoryLotStatus(value string) bool {
	_, ok := inventoryLotStatuses[NormalizeInventoryLotStatus(value)]
	return ok
}

func CanChangeInventoryLotStatus(currentStatus, newStatus string, hasPositiveBalance bool) bool {
	currentStatus = NormalizeInventoryLotStatus(currentStatus)
	newStatus = NormalizeInventoryLotStatus(newStatus)
	if !IsInventoryLotStatus(currentStatus) || !IsInventoryLotStatus(newStatus) {
		return false
	}
	if currentStatus == newStatus {
		return true
	}
	if currentStatus == InventoryLotDisabled {
		return false
	}
	if newStatus == InventoryLotDisabled {
		return !hasPositiveBalance
	}
	switch currentStatus {
	case InventoryLotActive:
		return newStatus == InventoryLotHold
	case InventoryLotHold:
		return newStatus == InventoryLotActive || newStatus == InventoryLotRejected
	case InventoryLotRejected:
		return newStatus == InventoryLotActive || newStatus == InventoryLotHold
	default:
		return false
	}
}
