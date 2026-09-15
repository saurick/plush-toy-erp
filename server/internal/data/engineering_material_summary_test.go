package data

import (
	"context"
	"encoding/json"
	"server/internal/biz"
	"server/internal/data/model/ent/bomitem"
	"testing"
)

func TestEngineeringMaterialSummaryPreservesSourceHeaderAndNotes(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "material_summary_snapshot")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "SUMMARY-SNAPSHOT")
	part := client.BOMItem.Query().Where(bomitem.BomHeaderID(f.bom.ID)).FirstX(ctx)
	client.BOMItem.UpdateOneID(part.ID).SetNote("公扣与母扣为一套").SaveX(ctx)
	fingerprint, err := salesOrderBOMFingerprint(ctx, client, f.bom, "")
	if err != nil {
		t.Fatal(err)
	}
	client.SalesOrderItem.UpdateOneID(f.line.ID).SetSampleBomFingerprint(fingerprint).
		SetCustomerProductNo("PRODUCT-REF").SetProcessRequirement("颜色需对样").SaveX(ctx)
	submitted := submitMaterialRequestFixture(t, ctx, f)
	firstJSON, _ := json.Marshal(submitted.Sources[0])
	var first map[string]any
	if err := json.Unmarshal(firstJSON, &first); err != nil {
		t.Fatal(err)
	}
	for key, expected := range map[string]string{
		"customer_product_no": "PRODUCT-REF", "process_requirement": "颜色需对样",
		"material_note": "公扣与母扣为一套", "ordered_quantity": "1000",
		"pre_shipment_sample_quantity": "12", "production_quantity": "1012",
		"order_date": f.order.OrderDate.Format("2006-01-02"),
	} {
		if first[key] != expected {
			t.Fatalf("%s snapshot = %#v", key, first[key])
		}
	}
	before, _ := json.Marshal(submitted.Sources)
	client.SalesOrderItem.UpdateOneID(f.line.ID).ClearCustomerProductNo().ClearProcessRequirement().SaveX(ctx)
	client.BOMItem.UpdateOneID(part.ID).ClearNote().SaveX(ctx)
	previous, err := f.uc.GetEngineeringMaterialRequestByID(ctx, f.order.ID, submitted.ID)
	if err != nil {
		t.Fatal(err)
	}
	after, _ := json.Marshal(previous.Sources)
	if string(before) != string(after) || previous.SourceHash != submitted.SourceHash {
		t.Fatal("historical source changed with current engineering data")
	}
	preview, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(preview.Sources[0])
	var current map[string]any
	if err := json.Unmarshal(encoded, &current); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"customer_product_no", "process_requirement", "material_note"} {
		if current[key] != nil {
			t.Fatalf("cleared %s remains in preview: %#v", key, current[key])
		}
	}
}

func TestEngineeringMaterialSummaryAnnotationsDoNotChangeProcurementInputs(t *testing.T) {
	in := &biz.EngineeringMaterialRequest{SalesOrderID: 1, SourceOrderVersion: 2, Sources: []map[string]any{{"material_id": 3, "production_quantity": "10", "bom_edit_version": 4}}}
	before := engineeringMaterialSourceHash(in)
	in.Sources[0]["customer_product_no"] = "PRODUCT-REF"
	in.Sources[0]["material_note"] = "材料说明"
	if engineeringMaterialSourceHash(in) != before {
		t.Fatal("display annotations changed manufacturing inputs")
	}
	in.SourceOrderVersion++
	if engineeringMaterialSourceHash(in) == before {
		t.Fatal("source order changes must invalidate approval")
	}
	in.SourceOrderVersion--
	in.Sources[0]["bom_edit_version"] = 5
	if engineeringMaterialSourceHash(in) == before {
		t.Fatal("BOM changes must invalidate approval")
	}
}
