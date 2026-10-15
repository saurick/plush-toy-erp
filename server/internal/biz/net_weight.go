package biz

import "github.com/shopspring/decimal"

const numeric20Scale6 int32 = 6

var maxPositiveNumeric20Scale6 = decimal.RequireFromString("99999999999999.999999")

func validOptionalPositiveNumeric20Scale6(value *decimal.Decimal) bool {
	if value == nil {
		return true
	}
	return value.IsPositive() &&
		value.Equal(value.Truncate(numeric20Scale6)) &&
		value.LessThanOrEqual(maxPositiveNumeric20Scale6)
}

func validNetWeightG(value *decimal.Decimal) bool {
	return validOptionalPositiveNumeric20Scale6(value)
}

func validShipmentNetWeightQuantity(value decimal.Decimal) bool {
	return validOptionalPositiveNumeric20Scale6(&value)
}

type ShipmentNetWeightLine struct {
	Quantity       decimal.Decimal
	UnitNetWeightG *decimal.Decimal
}

// ResolveShipmentItemUnitNetWeightG returns the effective unit net weight only
// when its basis unit matches the immutable shipment-line unit. Unit conversion
// is intentionally outside this contract.
func ResolveShipmentItemUnitNetWeightG(lineUnitID int, product *Product, sku *ProductSKU) (*decimal.Decimal, error) {
	if lineUnitID <= 0 || product == nil || product.DefaultUnitID <= 0 {
		return nil, ErrBadParam
	}
	if sku != nil {
		if sku.ProductID != product.ID {
			return nil, ErrBadParam
		}
		if sku.UnitNetWeightG != nil {
			if sku.DefaultUnitID == nil || !validNetWeightG(sku.UnitNetWeightG) {
				return nil, ErrBadParam
			}
			if lineUnitID != *sku.DefaultUnitID {
				return nil, nil
			}
			resolved := *sku.UnitNetWeightG
			return &resolved, nil
		}
	}
	if product.UnitNetWeightG != nil && !validNetWeightG(product.UnitNetWeightG) {
		return nil, ErrBadParam
	}
	if lineUnitID != product.DefaultUnitID || product.UnitNetWeightG == nil {
		return nil, nil
	}
	resolved := *product.UnitNetWeightG
	return &resolved, nil
}

// CalculateShipmentTotalNetWeightG returns complete=false when any line has no
// resolvable unit net weight. It never returns a partial total.
func CalculateShipmentTotalNetWeightG(lines []ShipmentNetWeightLine) (*decimal.Decimal, bool, error) {
	if len(lines) == 0 {
		return nil, false, ErrBadParam
	}
	total := decimal.Zero
	complete := true
	for _, line := range lines {
		if !validShipmentNetWeightQuantity(line.Quantity) {
			return nil, false, ErrBadParam
		}
		if line.UnitNetWeightG == nil {
			complete = false
			continue
		}
		if !validNetWeightG(line.UnitNetWeightG) {
			return nil, false, ErrBadParam
		}
		total = total.Add(line.Quantity.Mul(*line.UnitNetWeightG))
	}
	if !complete {
		return nil, false, nil
	}
	total = total.Round(numeric20Scale6)
	if !validNetWeightG(&total) {
		return nil, false, ErrBadParam
	}
	return &total, true, nil
}
