package data

import (
	"io"
	"reflect"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestBOMHeaderOptionalFieldsReplaceAndClearThroughAggregateSave(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryRepoTestData(t, "bom_optional_fields_aggregate")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	created, err := uc.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{
		ProductID:       fixtures.productID,
		BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "V1"},
	}, []*biz.BOMItemSaveMutation{{BOMItemUpdate: biz.BOMItemUpdate{
		MaterialID: fixtures.materialID,
		UnitID:     fixtures.unitID,
		Quantity:   decimal.NewFromInt(1),
		LossRate:   decimal.Zero,
	}}})
	if err != nil {
		t.Fatal(err)
	}
	header := created.Header
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := from.AddDate(0, 1, 0)
	printed := from.AddDate(0, 0, 2)
	filled := biz.BOMHeaderUpdate{
		Version:       "V2",
		EffectiveFrom: &from,
		EffectiveTo:   &to,
		PrintDate:     &printed,
		SourceOrderNo: stringPtr("source"),
		QuantityText:  stringPtr("100"),
		SpareText:     stringPtr("5"),
		Designer:      stringPtr("designer"),
		Maker:         stringPtr("maker"),
		Auditor:       stringPtr("auditor"),
		HairDirection: stringPtr("direction"),
		Note:          stringPtr("note"),
	}
	fields := []string{"EffectiveFrom", "EffectiveTo", "PrintDate", "SourceOrderNo", "QuantityText", "SpareText", "Designer", "Maker", "Auditor", "HairDirection", "Note"}
	for _, input := range []biz.BOMHeaderUpdate{filled, {Version: "V3"}} {
		detail, saveErr := uc.SaveBOMWithItems(ctx, header.ID, &biz.BOMVersionMutation{
			ExpectedVersion: header.EditVersion,
			ProductID:       fixtures.productID,
			BOMHeaderUpdate: input,
		}, []*biz.BOMItemSaveMutation{{BOMItemUpdate: biz.BOMItemUpdate{
			MaterialID: fixtures.materialID,
			UnitID:     fixtures.unitID,
			Quantity:   decimal.NewFromInt(1),
			LossRate:   decimal.Zero,
		}}})
		if saveErr != nil {
			t.Fatal(saveErr)
		}
		header = detail.Header
		storedDetail, err := uc.GetBOMVersion(ctx, header.ID)
		if err != nil {
			t.Fatal(err)
		}
		header = storedDetail.Header
		for _, field := range fields {
			got := reflect.ValueOf(storedDetail.Header).Elem().FieldByName(field).Interface()
			want := reflect.ValueOf(input).FieldByName(field).Interface()
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("%s: got %v, want %v", field, got, want)
			}
		}
	}
}
