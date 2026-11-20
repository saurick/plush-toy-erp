package calc

import "github.com/shopspring/decimal"

func InventoryAvailableQuantity(balanceQuantity, activeReservedQuantity decimal.Decimal) decimal.Decimal {
	return balanceQuantity.Sub(activeReservedQuantity)
}

func HasInventoryAvailableQuantity(balanceQuantity, activeReservedQuantity, requiredQuantity decimal.Decimal) bool {
	return InventoryAvailableQuantity(balanceQuantity, activeReservedQuantity).Cmp(requiredQuantity) >= 0
}
