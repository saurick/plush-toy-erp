package data

import (
	"context"
	"errors"
	"io"
	"server/internal/biz"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
)

func TestMaterialSupplierIdentitySeparatesSameItemAndColor(t *testing.T) {
	ctx := context.Background()
	uc, client := openMasterDataRepoTest(t, "material_supplier_identity")
	defer mustCloseEntClient(t, client)
	unit := createSalesOrderTestUnit(t, ctx, client, "IDENTITY-U", true)
	first := createPurchaseOrderTestSupplier(t, ctx, client, "FABRIC-A", true)
	second := createPurchaseOrderTestSupplier(t, ctx, client, "FABRIC-B", true)
	number, color := "FAB-001", "C-01"
	input := biz.MaterialMutation{Code: "MAT-A", Name: "短毛绒", SupplierID: &first.ID, SupplierItemNo: &number, Color: &color, DefaultUnitID: unit.ID}
	a, err := uc.CreateMaterial(ctx, &input)
	if err != nil || a.SupplierName == nil || *a.SupplierName != first.Name {
		t.Fatalf("first supplier: %+v %v", a, err)
	}
	input.Code = "MAT-B"
	if _, err := uc.CreateMaterial(ctx, &input); !errors.Is(err, biz.ErrMaterialIdentityConflict) {
		t.Fatalf("duplicate supplier/item/color must fail: %v", err)
	}
	input.SupplierID = &second.ID
	b, err := uc.CreateMaterial(ctx, &input)
	if err != nil || a.ID == b.ID {
		t.Fatalf("different suppliers must stay distinct: %+v %v", b, err)
	}
	rows, total, err := uc.ListMaterials(ctx, biz.MasterDataFilter{Keyword: first.Name, Limit: 20})
	if err != nil || total != 1 || rows[0].ID != a.ID {
		t.Fatalf("supplier search: %+v %d %v", rows, total, err)
	}
	input.SupplierID = nil
	cleared, err := uc.UpdateMaterial(ctx, b.ID, &input)
	if err != nil || cleared.SupplierID != nil || cleared.SupplierName != nil {
		t.Fatalf("clearing supplier left stale identity: %+v %v", cleared, err)
	}
	input.SupplierID = &second.ID
	input.Color = nil
	input.Code = "MAT-NO-COLOR"
	if _, err := uc.CreateMaterial(ctx, &input); err != nil {
		t.Fatal(err)
	}
	input.Code = "MAT-NO-COLOR-DUP"
	if _, err := uc.CreateMaterial(ctx, &input); !errors.Is(err, biz.ErrMaterialIdentityConflict) {
		t.Fatalf("missing color must not bypass identity: %v", err)
	}
}

func TestMasterDataSchemaPostgresMaterialSupplierSwitchClearsSnapshots(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	uc := biz.NewMasterDataUsecase(NewMasterDataRepo(data, log.NewStdLogger(io.Discard)))
	suffix := postgresTestSuffix()
	unit := createSalesOrderTestUnit(t, ctx, data.postgres, "SUP-UNIT-"+suffix, true)
	first := createPurchaseOrderTestSupplier(t, ctx, data.postgres, "SUP-A-"+suffix, true)
	second := createPurchaseOrderTestSupplier(t, ctx, data.postgres, "SUP-B-"+suffix, true)
	number, color := "FAB-001", "C-01"
	input := biz.MaterialMutation{Code: "SUP-MAT-" + suffix, Name: "模拟短毛绒", SupplierID: &first.ID, SupplierItemNo: &number, Color: &color, DefaultUnitID: unit.ID}
	created, err := uc.CreateMaterial(ctx, &input)
	if err != nil {
		t.Fatal(err)
	}
	input.SupplierID = &second.ID
	changed, err := uc.UpdateMaterial(ctx, created.ID, &input)
	if err != nil || changed.SupplierID == nil || *changed.SupplierID != second.ID || changed.SupplierName == nil || *changed.SupplierName != second.Name {
		t.Fatalf("supplier replacement and readback: %+v %v", changed, err)
	}
	input.SupplierID = nil
	cleared, err := uc.UpdateMaterial(ctx, created.ID, &input)
	if err != nil || cleared.SupplierID != nil || cleared.SupplierName != nil {
		t.Fatalf("supplier clearing and readback: %+v %v", cleared, err)
	}
	input.SupplierID = &first.ID
	restored, err := uc.UpdateMaterial(ctx, created.ID, &input)
	if err != nil || restored.SupplierName == nil || *restored.SupplierName != first.Name {
		t.Fatalf("supplier reassociation and readback: %+v %v", restored, err)
	}
}
