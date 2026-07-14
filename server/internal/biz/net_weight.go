package biz

import "github.com/shopspring/decimal"

const netWeightScale int32 = 6

var maxNetWeightKg = decimal.RequireFromString("99999999999999.999999")

func validNetWeightKg(value *decimal.Decimal) bool {
	if value == nil {
		return true
	}
	return value.IsPositive() &&
		value.Equal(value.Truncate(netWeightScale)) &&
		value.LessThanOrEqual(maxNetWeightKg)
}

func validShipmentNetWeightQuantity(value decimal.Decimal) bool {
	return value.IsPositive() &&
		value.Equal(value.Truncate(netWeightScale)) &&
		value.LessThanOrEqual(maxNetWeightKg)
}

type ShipmentNetWeightLine struct {
	Quantity        decimal.Decimal
	UnitNetWeightKg *decimal.Decimal
}

// ResolveShipmentItemUnitNetWeightKg returns the effective unit net weight only
// when its basis unit matches the immutable shipment-line unit. Unit conversion
// is intentionally outside this contract.
func ResolveShipmentItemUnitNetWeightKg(lineUnitID int, product *Product, sku *ProductSKU) (*decimal.Decimal, error) {
	if lineUnitID <= 0 || product == nil || product.DefaultUnitID <= 0 {
		return nil, ErrBadParam
	}
	if sku != nil {
		if sku.ProductID != product.ID {
			return nil, ErrBadParam
		}
		if sku.UnitNetWeightKg != nil {
			if sku.DefaultUnitID == nil || !validNetWeightKg(sku.UnitNetWeightKg) {
				return nil, ErrBadParam
			}
			if lineUnitID != *sku.DefaultUnitID {
				return nil, nil
			}
			resolved := *sku.UnitNetWeightKg
			return &resolved, nil
		}
	}
	if product.UnitNetWeightKg != nil && !validNetWeightKg(product.UnitNetWeightKg) {
		return nil, ErrBadParam
	}
	if lineUnitID != product.DefaultUnitID || product.UnitNetWeightKg == nil {
		return nil, nil
	}
	resolved := *product.UnitNetWeightKg
	return &resolved, nil
}

// CalculateShipmentTotalNetWeightKg returns complete=false when any line has no
// resolvable unit net weight. It never returns a partial total.
func CalculateShipmentTotalNetWeightKg(lines []ShipmentNetWeightLine) (*decimal.Decimal, bool, error) {
	if len(lines) == 0 {
		return nil, false, ErrBadParam
	}
	total := decimal.Zero
	complete := true
	for _, line := range lines {
		if !validShipmentNetWeightQuantity(line.Quantity) {
			return nil, false, ErrBadParam
		}
		if line.UnitNetWeightKg == nil {
			complete = false
			continue
		}
		if !validNetWeightKg(line.UnitNetWeightKg) {
			return nil, false, ErrBadParam
		}
		total = total.Add(line.Quantity.Mul(*line.UnitNetWeightKg))
	}
	if !complete {
		return nil, false, nil
	}
	total = total.Round(netWeightScale)
	if !validNetWeightKg(&total) {
		return nil, false, ErrBadParam
	}
	return &total, true, nil
}
