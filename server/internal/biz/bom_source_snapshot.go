package biz

import (
	"math"
	"regexp"
	"strings"
	"unicode/utf8"

	corevalue "server/internal/core/value"

	"github.com/shopspring/decimal"
)

const (
	BOMSourceMaxNumberCharacters  = 384
	BOMSourceMaxScale             = 324
	BOMSourceMaxTextCharacters    = 255
	BOMSourceMaxFormulaCharacters = 512
	BOMSourceMaxRow               = 1048576

	BOMLossSourceExplicit   = "explicit"
	BOMLossSourceHeader     = "header"
	BOMLossSourceCalculated = "calculated"
	BOMLossSourceUnresolved = "unresolved"
)

var bomSourceDecimalPattern = regexp.MustCompile(`^\+?\d+(?:\.\d+)?(?:[eE][+-]?\d{1,3})?$`)

// ParseBOMDecimal keeps Excel's full decimal value. Bounds reject excessive input
// rather than rounding it; PostgreSQL stores BOM coefficients without a fixed scale.
func ParseBOMDecimal(text string) (decimal.Decimal, bool) {
	if len(text) > BOMSourceMaxNumberCharacters || !bomSourceDecimalPattern.MatchString(text) {
		return decimal.Zero, false
	}
	number, err := decimal.NewFromString(text)
	if err != nil || number.Exponent() < -BOMSourceMaxScale || number.Exponent() > BOMSourceMaxNumberCharacters || len(number.Truncate(0).String()) > corevalue.NumericIntegerDigits {
		return decimal.Zero, false
	}
	return number, true
}

func normalizeBOMSourceSnapshot(source map[string]any) (map[string]any, error) {
	if len(source) == 0 {
		return nil, nil
	}
	textFields := map[string]int{
		"file_name": BOMSourceMaxTextCharacters, "sheet_name": BOMSourceMaxTextCharacters,
		"quantity_label": BOMSourceMaxTextCharacters, "quantity_format": BOMSourceMaxTextCharacters,
		"total_label": BOMSourceMaxTextCharacters, "total_format": BOMSourceMaxTextCharacters,
		"loss_label": BOMSourceMaxTextCharacters, "loss_format": BOMSourceMaxTextCharacters,
		"unit": BOMSourceMaxTextCharacters, "loss_source": BOMSourceMaxTextCharacters,
		"total_formula": BOMSourceMaxFormulaCharacters,
	}
	numberFields := map[string]bool{"quantity_value": true, "total_value": true, "loss_value": true, "loss_rate": true, "order_quantity": true}
	out := make(map[string]any, len(source))
	for key, raw := range source {
		if key == "row_number" {
			var row int
			switch value := raw.(type) {
			case int:
				row = value
			case float64:
				if math.IsNaN(value) || math.IsInf(value, 0) || math.Trunc(value) != value || value < 1 || value > BOMSourceMaxRow {
					return nil, ErrBadParam
				}
				row = int(value)
			default:
				return nil, ErrBadParam
			}
			if row < 1 || row > BOMSourceMaxRow {
				return nil, ErrBadParam
			}
			out[key] = row
			continue
		}
		text, ok := raw.(string)
		if !ok || !utf8.ValidString(text) || strings.ContainsAny(text, "\x00\r") {
			return nil, ErrBadParam
		}
		if numberFields[key] {
			// Invalid source text can remain evidence after the operator corrects a business value.
			if utf8.RuneCountInString(text) > BOMSourceMaxNumberCharacters {
				return nil, ErrBadParam
			}
		} else if limit, allowed := textFields[key]; !allowed || utf8.RuneCountInString(text) > limit {
			return nil, ErrBadParam
		}
		out[key] = text
	}
	_, quantityOK := out["quantity_value"].(string)
	if !quantityOK || out["row_number"] == nil || out["sheet_name"] == nil || out["sheet_name"] == "" {
		return nil, ErrBadParam
	}
	switch out["loss_source"] {
	case BOMLossSourceExplicit, BOMLossSourceHeader, BOMLossSourceCalculated, BOMLossSourceUnresolved:
	default:
		return nil, ErrBadParam
	}
	return out, nil
}

// BOMQuantityTextMatches compares bounded numeric values and unchanged descriptive headers.
func BOMQuantityTextMatches(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	if strings.TrimSpace(*left) == strings.TrimSpace(*right) {
		return true
	}
	previous, previousOK := ParseBOMDecimal(strings.TrimSpace(*left))
	current, currentOK := ParseBOMDecimal(strings.TrimSpace(*right))
	return previousOK && currentOK && previous.Equal(current)
}

// BOMSourceTotalIsCurrent prevents documentary totals from surviving changed inputs.
func BOMSourceTotalIsCurrent(item BOMItemUpdate, orderQuantity *string) bool {
	if item.SourceSnapshot == nil {
		return true
	}
	if orderQuantity == nil {
		return false
	}
	text := func(key string) string { value, _ := item.SourceSnapshot[key].(string); return value }
	sourceOrder, orderOK := ParseBOMDecimal(text("order_quantity"))
	currentOrder, currentOK := ParseBOMDecimal(strings.TrimSpace(*orderQuantity))
	quantity, quantityOK := ParseBOMDecimal(text("quantity_value"))
	loss, lossOK := ParseBOMDecimal(text("loss_rate"))
	return orderOK && currentOK && sourceOrder.IsPositive() && sourceOrder.Equal(currentOrder) &&
		quantityOK && quantity.Equal(item.Quantity) && lossOK && loss.Equal(item.LossRate)
}
