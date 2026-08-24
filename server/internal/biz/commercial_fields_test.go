package biz

import (
	"errors"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func TestCalculateSalesOrderAmounts(t *testing.T) {
	amount := func(value string) *decimal.Decimal {
		parsed := decimal.RequireFromString(value)
		return &parsed
	}
	tests := []struct {
		name      string
		mode      string
		rate      *decimal.Decimal
		amounts   []*decimal.Decimal
		wantGoods string
		wantTax   string
		wantTotal string
	}{
		{name: "no tax", mode: SalesOrderTaxModeNone, amounts: []*decimal.Decimal{amount("10.5"), amount("2.5")}, wantGoods: "13", wantTax: "0", wantTotal: "13"},
		{name: "exclusive tax", mode: SalesOrderTaxModeExclusive, rate: amount("13"), amounts: []*decimal.Decimal{amount("100")}, wantGoods: "100", wantTax: "13", wantTotal: "113"},
		{name: "inclusive tax", mode: SalesOrderTaxModeInclusive, rate: amount("13"), amounts: []*decimal.Decimal{amount("113")}, wantGoods: "113", wantTax: "13", wantTotal: "113"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			goods, tax, total, err := CalculateSalesOrderAmounts(&tt.mode, tt.rate, tt.amounts)
			if err != nil || goods == nil || tax == nil || total == nil || goods.String() != tt.wantGoods || tax.String() != tt.wantTax || total.String() != tt.wantTotal {
				t.Fatalf("amounts goods=%v tax=%v total=%v err=%v", goods, tax, total, err)
			}
		})
	}

	mode := SalesOrderTaxModeExclusive
	if goods, tax, total, err := CalculateSalesOrderAmounts(&mode, amount("13"), nil); err != nil || goods != nil || tax != nil || total != nil {
		t.Fatalf("order without lines must keep totals incomplete: goods=%v tax=%v total=%v err=%v", goods, tax, total, err)
	}
	if goods, tax, total, err := CalculateSalesOrderAmounts(&mode, amount("13"), []*decimal.Decimal{nil}); err != nil || goods != nil || tax != nil || total != nil {
		t.Fatalf("incomplete line must keep totals incomplete: goods=%v tax=%v total=%v err=%v", goods, tax, total, err)
	}
	negative := decimal.NewFromInt(-1)
	if _, _, _, err := CalculateSalesOrderAmounts(&mode, amount("13"), []*decimal.Decimal{&negative}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("negative line amount error=%v, want ErrBadParam", err)
	}
}

func TestNormalizeSalesOrderCommercialTerms(t *testing.T) {
	mode := " none "
	rate := decimal.RequireFromString("13")
	freight := " included "
	normalizedMode, normalizedRate, normalizedFreight, err := normalizeSalesOrderCommercialTerms(&mode, &rate, &freight)
	if err != nil || normalizedMode == nil || *normalizedMode != SalesOrderTaxModeNone || normalizedRate != nil || normalizedFreight == nil || *normalizedFreight != SalesOrderFreightTermsIncluded {
		t.Fatalf("normalized commercial terms mode=%v rate=%v freight=%v err=%v", normalizedMode, normalizedRate, normalizedFreight, err)
	}

	invalidMode := "unknown"
	if _, _, _, err := normalizeSalesOrderCommercialTerms(&invalidMode, nil, &freight); !errors.Is(err, ErrBadParam) {
		t.Fatalf("invalid tax mode error=%v, want ErrBadParam", err)
	}
}

func TestNormalizeDeliverySnapshot(t *testing.T) {
	got, err := normalizeDeliverySnapshot(map[string]any{
		"country_region": " 中国 ",
		"recipient":      " 王小明 ",
		"phone":          " +86 138-0000-0000 ",
		"address":        " 深圳市测试路 1 号 ",
	})
	if err != nil || got["country_region"] != "中国" || got["recipient"] != "王小明" || got["phone"] != "+86 138-0000-0000" || got["address"] != "深圳市测试路 1 号" {
		t.Fatalf("normalized delivery snapshot=%#v err=%v", got, err)
	}
	if _, err := normalizeDeliverySnapshot(map[string]any{"unknown": "value"}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unknown delivery field error=%v, want ErrBadParam", err)
	}
	if _, err := normalizeDeliverySnapshot(map[string]any{"phone": "invalid"}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("invalid delivery phone error=%v, want ErrBadParam", err)
	}
	if _, err := normalizeDeliverySnapshot(map[string]any{"address": strings.Repeat("址", 513)}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("oversized delivery address error=%v, want ErrBadParam", err)
	}
}

func TestNormalizeInvoicePreference(t *testing.T) {
	required := true
	category := " vat_special_13 "
	normalizedRequired, normalizedCategory, err := normalizeInvoicePreference(&required, &category)
	if err != nil || normalizedRequired == nil || !*normalizedRequired || normalizedCategory == nil || *normalizedCategory != FinanceInvoiceCategoryVATSpecial13 {
		t.Fatalf("normalized invoice preference required=%v category=%v err=%v", normalizedRequired, normalizedCategory, err)
	}

	notRequired := false
	normalizedRequired, normalizedCategory, err = normalizeInvoicePreference(&notRequired, &category)
	if err != nil || normalizedRequired == nil || *normalizedRequired || normalizedCategory != nil {
		t.Fatalf("not-required invoice preference must clear category: required=%v category=%v err=%v", normalizedRequired, normalizedCategory, err)
	}
	if _, _, err := normalizeInvoicePreference(nil, &category); !errors.Is(err, ErrBadParam) {
		t.Fatalf("category without requirement error=%v, want ErrBadParam", err)
	}
}

func TestNormalizeShipmentLogisticsAndFreight(t *testing.T) {
	transportMethod := " 海运 "
	carrierName := " 测试船运 "
	trackingNo := " TRACK-001 "
	shippingMark := " YS / SHANGHAI "
	currency := " usd "
	packageCount := 8
	amount := decimal.RequireFromString("88.500000")
	grossWeight := decimal.RequireFromString("12.750000")
	volume := decimal.RequireFromString("1.250000")
	normalized, err := normalizeShipmentCreate(&ShipmentCreate{
		ShipmentNo:      " SHIP-001 ",
		IdempotencyKey:  "shipment/001",
		TransportMethod: &transportMethod,
		CarrierName:     &carrierName,
		TrackingNo:      &trackingNo,
		PackageCount:    &packageCount,
		GrossWeightKg:   &grossWeight,
		VolumeM3:        &volume,
		ShippingMark:    &shippingMark,
		FreightAmount:   &amount,
		FreightCurrency: &currency,
	})
	if err != nil || normalized.ShipmentNo != "SHIP-001" || normalized.TransportMethod == nil || *normalized.TransportMethod != "海运" || normalized.CarrierName == nil || *normalized.CarrierName != "测试船运" || normalized.TrackingNo == nil || *normalized.TrackingNo != "TRACK-001" || normalized.ShippingMark == nil || *normalized.ShippingMark != "YS / SHANGHAI" || normalized.FreightCurrency == nil || *normalized.FreightCurrency != "USD" {
		t.Fatalf("normalized shipment=%#v err=%v", normalized, err)
	}

	if _, err := normalizeShipmentCreate(&ShipmentCreate{ShipmentNo: "SHIP-002", IdempotencyKey: "shipment/002", FreightAmount: &amount}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("freight amount without currency error=%v, want ErrBadParam", err)
	}
	invalidPackageCount := 0
	if _, err := normalizeShipmentCreate(&ShipmentCreate{ShipmentNo: "SHIP-003", IdempotencyKey: "shipment/003", PackageCount: &invalidPackageCount}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("zero package count error=%v, want ErrBadParam", err)
	}
	zeroMeasurement := decimal.Zero
	if _, err := normalizeShipmentCreate(&ShipmentCreate{ShipmentNo: "SHIP-004", IdempotencyKey: "shipment/004", VolumeM3: &zeroMeasurement}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("zero volume error=%v, want ErrBadParam", err)
	}

	packageDescription := " 2 个 / 箱 "
	caseNo := " A01-A10 "
	item, err := normalizeShipmentItemCreate(&ShipmentItemCreate{
		ProductID:          1,
		WarehouseID:        2,
		UnitID:             3,
		Quantity:           decimal.NewFromInt(1),
		PackageDescription: &packageDescription,
		CaseNo:             &caseNo,
	})
	if err != nil || item.PackageDescription == nil || *item.PackageDescription != "2 个 / 箱" || item.CaseNo == nil || *item.CaseNo != "A01-A10" {
		t.Fatalf("normalized shipment item=%#v err=%v", item, err)
	}
}

func TestNormalizeCustomerDefaultDeliveryPhone(t *testing.T) {
	phone := " +86 138-0000-0000 "
	normalized, err := normalizeCustomerMutation(CustomerMutation{
		Code:                 " C-001 ",
		Name:                 " 客户一 ",
		DefaultDeliveryPhone: &phone,
	})
	if err != nil || normalized.DefaultDeliveryPhone == nil || *normalized.DefaultDeliveryPhone != "+86 138-0000-0000" {
		t.Fatalf("normalized customer=%#v err=%v", normalized, err)
	}
	invalidPhone := "invalid"
	if _, err := normalizeCustomerMutation(CustomerMutation{Code: "C-002", Name: "客户二", DefaultDeliveryPhone: &invalidPhone}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("invalid default delivery phone error=%v, want ErrBadParam", err)
	}
}
