package biz

import (
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestResolveShipmentItemUnitNetWeightKg(t *testing.T) {
	productWeight := decimal.RequireFromString("0.400000")
	skuWeight := decimal.RequireFromString("0.425000")
	product := &Product{ID: 7, DefaultUnitID: 1, UnitNetWeightKg: &productWeight}
	skuUnitID := 2
	sku := &ProductSKU{ID: 11, ProductID: product.ID, DefaultUnitID: &skuUnitID, UnitNetWeightKg: &skuWeight}

	resolved, err := ResolveShipmentItemUnitNetWeightKg(skuUnitID, product, sku)
	if err != nil {
		t.Fatalf("resolve SKU weight: %v", err)
	}
	if resolved == nil || !resolved.Equal(skuWeight) {
		t.Fatalf("resolved SKU weight = %v, want %s", resolved, skuWeight)
	}

	resolved, err = ResolveShipmentItemUnitNetWeightKg(product.DefaultUnitID, product, &ProductSKU{ID: 12, ProductID: product.ID})
	if err != nil {
		t.Fatalf("resolve product fallback: %v", err)
	}
	if resolved == nil || !resolved.Equal(productWeight) {
		t.Fatalf("resolved product fallback = %v, want %s", resolved, productWeight)
	}

	for _, tc := range []struct {
		name       string
		lineUnitID int
		product    *Product
		sku        *ProductSKU
	}{
		{name: "SKU unit mismatch does not fall back", lineUnitID: product.DefaultUnitID, product: product, sku: sku},
		{name: "product unit mismatch", lineUnitID: 3, product: product},
		{name: "missing product weight", lineUnitID: 1, product: &Product{ID: 8, DefaultUnitID: 1}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, resolveErr := ResolveShipmentItemUnitNetWeightKg(tc.lineUnitID, tc.product, tc.sku)
			if resolveErr != nil {
				t.Fatalf("resolve weight: %v", resolveErr)
			}
			if got != nil {
				t.Fatalf("resolved weight = %s, want nil", got)
			}
		})
	}

	for _, tc := range []struct {
		name string
		sku  *ProductSKU
	}{
		{name: "SKU belongs to another product", sku: &ProductSKU{ID: 13, ProductID: 999, DefaultUnitID: &skuUnitID, UnitNetWeightKg: &skuWeight}},
		{name: "weighted SKU has no basis unit", sku: &ProductSKU{ID: 14, ProductID: product.ID, UnitNetWeightKg: &skuWeight}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, resolveErr := ResolveShipmentItemUnitNetWeightKg(product.DefaultUnitID, product, tc.sku); !errors.Is(resolveErr, ErrBadParam) {
				t.Fatalf("resolve error = %v, want ErrBadParam", resolveErr)
			}
		})
	}
}

func TestCalculateShipmentTotalNetWeightKg(t *testing.T) {
	weightA := decimal.RequireFromString("0.333333")
	weightB := decimal.RequireFromString("0.125000")
	total, complete, err := CalculateShipmentTotalNetWeightKg([]ShipmentNetWeightLine{
		{Quantity: decimal.RequireFromString("1.5"), UnitNetWeightKg: &weightA},
		{Quantity: decimal.NewFromInt(2), UnitNetWeightKg: &weightB},
	})
	if err != nil {
		t.Fatalf("calculate complete total: %v", err)
	}
	if !complete || total == nil || !total.Equal(decimal.RequireFromString("0.750000")) {
		t.Fatalf("complete total = %v complete=%t, want 0.750000", total, complete)
	}

	smallWeight := decimal.RequireFromString("0.000001")
	total, complete, err = CalculateShipmentTotalNetWeightKg([]ShipmentNetWeightLine{
		{Quantity: decimal.RequireFromString("0.4"), UnitNetWeightKg: &smallWeight},
		{Quantity: decimal.RequireFromString("0.4"), UnitNetWeightKg: &smallWeight},
	})
	if err != nil || !complete || total == nil || !total.Equal(decimal.RequireFromString("0.000001")) {
		t.Fatalf("single final rounding total = %v complete=%t err=%v, want 0.000001", total, complete, err)
	}

	total, complete, err = CalculateShipmentTotalNetWeightKg([]ShipmentNetWeightLine{
		{Quantity: decimal.NewFromInt(1), UnitNetWeightKg: &weightA},
		{Quantity: decimal.NewFromInt(2)},
	})
	if err != nil {
		t.Fatalf("calculate incomplete total: %v", err)
	}
	if complete || total != nil {
		t.Fatalf("incomplete total = %v complete=%t, want nil false", total, complete)
	}

	overflowWeight := decimal.RequireFromString("99999999999999.999999")
	if _, _, err = CalculateShipmentTotalNetWeightKg([]ShipmentNetWeightLine{{
		Quantity:        decimal.NewFromInt(2),
		UnitNetWeightKg: &overflowWeight,
	}}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("overflow error = %v, want ErrBadParam", err)
	}
	for _, quantity := range []decimal.Decimal{
		decimal.RequireFromString("0.0000001"),
		decimal.RequireFromString("100000000000000"),
	} {
		if _, _, err = CalculateShipmentTotalNetWeightKg([]ShipmentNetWeightLine{{
			Quantity:        quantity,
			UnitNetWeightKg: &weightA,
		}}); !errors.Is(err, ErrBadParam) {
			t.Fatalf("invalid quantity %s error = %v, want ErrBadParam", quantity, err)
		}
	}
}
