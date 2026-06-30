package data

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
)

func TestQualityInspectionPostgresShapeAndFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)

	for _, table := range []string{"quality_inspections"} {
		assertPostgresTableExists(t, data.sqldb, table)
	}
	for _, column := range []string{
		"inspection_no",
		"purchase_receipt_id",
		"purchase_receipt_item_id",
		"inventory_lot_id",
		"material_id",
		"warehouse_id",
		"source_type",
		"source_id",
		"inspection_type",
		"subject_type",
		"subject_id",
		"status",
		"result",
		"original_lot_status",
		"inspected_at",
		"inspector_id",
		"decision_note",
		"created_at",
		"updated_at",
	} {
		assertPostgresColumnExists(t, data.sqldb, "quality_inspections", column)
	}
	assertPostgresUniqueIndex(t, data.sqldb, "quality_inspections", "qualityinspection_inspection_no")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "quality_inspections", "qualityinspection_inventory_lot_id_submitted", "status = 'SUBMITTED'")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "quality_inspections", "quality_inspections_purchase_receipts_quality_inspections", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "quality_inspections", "quality_inspections_purchase_receipt_items_quality_inspections", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "quality_inspections", "quality_inspections_inventory_lots_quality_inspections", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "quality_inspections", "quality_inspections_materials_quality_inspections", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "quality_inspections", "quality_inspections_warehouses_quality_inspections", "NO ACTION")

	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-QI-PASS-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-QI-PASS-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected postgres quality receipt lot_id")
	}
	qualityTxnCount := inventoryTxnCount(t, ctx, client)
	draft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "PG-QI-PASS-"+fixtures.suffix, postedReceipt, invFixtures)
	assertInventoryTxnCount(t, ctx, client, qualityTxnCount)
	if _, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:          "PG-QI-PASS-" + fixtures.suffix,
		PurchaseReceiptID:     postedReceipt.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		InventoryLotID:        *receiptItem.LotID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres inspection_no unique constraint, got %v", err)
	}
	submitted, err := uc.SubmitQualityInspection(ctx, draft.ID)
	if err != nil {
		t.Fatalf("submit postgres quality inspection failed: %v", err)
	}
	if submitted.Status != biz.QualityInspectionStatusSubmitted || submitted.OriginalLotStatus != biz.InventoryLotActive {
		t.Fatalf("unexpected postgres submitted quality state: %+v", submitted)
	}
	assertLotStatus(t, ctx, uc, *receiptItem.LotID, biz.InventoryLotHold)
	assertInventoryTxnCount(t, ctx, client, qualityTxnCount)
	if _, err := client.QualityInspection.Create().
		SetInspectionNo("PG-QI-PASS-SUBMITTED-DUP-" + fixtures.suffix).
		SetPurchaseReceiptID(postedReceipt.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetInventoryLotID(*receiptItem.LotID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetStatus(biz.QualityInspectionStatusSubmitted).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres SUBMITTED partial unique constraint, got %v", err)
	}
	passed, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{
		InspectionID: draft.ID,
		Result:       biz.QualityInspectionResultConcession,
		InspectedAt:  time.Date(2026, 4, 26, 12, 30, 0, 0, time.UTC),
		DecisionNote: stringPtr("让步接收"),
	})
	if err != nil {
		t.Fatalf("pass postgres quality inspection failed: %v", err)
	}
	if passed.Status != biz.QualityInspectionStatusPassed || passed.Result == nil || *passed.Result != biz.QualityInspectionResultConcession {
		t.Fatalf("unexpected postgres passed quality state: %+v", passed)
	}
	assertLotStatus(t, ctx, uc, *receiptItem.LotID, biz.InventoryLotActive)
	assertInventoryTxnCount(t, ctx, client, qualityTxnCount)

	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipt_items WHERE id = $1`, receiptItem.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt_item referenced by quality_inspection to fail")
	}
	if _, err := client.PurchaseReceiptItem.Get(ctx, receiptItem.ID); err != nil {
		t.Fatalf("receipt item should remain after failed quality FK delete: %v", err)
	}

	headerReceipt, err := client.PurchaseReceipt.Create().
		SetReceiptNo("PG-QI-FK-HEAD-" + fixtures.suffix).
		SetSupplierName("PG质检供应商").
		SetStatus(biz.PurchaseReceiptStatusPosted).
		SetReceivedAt(time.Date(2026, 4, 26, 13, 0, 0, 0, time.UTC)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create header receipt for postgres quality FK test failed: %v", err)
	}
	manualLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PG-QI-FK-LOT-"+fixtures.suffix)
	headerInspection, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:      "PG-QI-FK-HEAD-" + fixtures.suffix,
		PurchaseReceiptID: headerReceipt.ID,
		InventoryLotID:    manualLot.ID,
		MaterialID:        fixtures.materialID,
		WarehouseID:       fixtures.warehouseID,
	})
	if err != nil {
		t.Fatalf("create header quality inspection for FK test failed: %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipts WHERE id = $1`, headerReceipt.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt referenced by quality_inspection to fail")
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM inventory_lots WHERE id = $1`, manualLot.ID); err == nil {
		t.Fatalf("expected direct SQL delete of inventory_lot referenced by quality_inspection to fail")
	}
	if _, err := client.QualityInspection.Get(ctx, headerInspection.ID); err != nil {
		t.Fatalf("quality inspection should remain after failed FK deletes: %v", err)
	}

	rejectReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-QI-REJECT-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-QI-REJECT-LOT-"+fixtures.suffix), mustDecimal(t, "5"))
	rejectDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "PG-QI-REJECT-"+fixtures.suffix, rejectReceipt, invFixtures)
	if _, err := uc.SubmitQualityInspection(ctx, rejectDraft.ID); err != nil {
		t.Fatalf("submit postgres reject quality fixture failed: %v", err)
	}
	if _, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: rejectDraft.ID}); err != nil {
		t.Fatalf("reject postgres quality inspection failed: %v", err)
	}
	assertLotStatus(t, ctx, uc, *rejectReceipt.Items[0].LotID, biz.InventoryLotRejected)

	cancelReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-QI-CANCEL-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-QI-CANCEL-LOT-"+fixtures.suffix), mustDecimal(t, "5"))
	cancelDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "PG-QI-CANCEL-"+fixtures.suffix, cancelReceipt, invFixtures)
	if _, err := uc.SubmitQualityInspection(ctx, cancelDraft.ID); err != nil {
		t.Fatalf("submit postgres cancel quality fixture failed: %v", err)
	}
	assertLotStatus(t, ctx, uc, *cancelReceipt.Items[0].LotID, biz.InventoryLotHold)
	cancelled, err := uc.CancelQualityInspection(ctx, cancelDraft.ID, nil)
	if err != nil {
		t.Fatalf("cancel postgres submitted quality inspection failed: %v", err)
	}
	if cancelled.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("expected postgres cancelled quality inspection, got %s", cancelled.Status)
	}
	assertLotStatus(t, ctx, uc, *cancelReceipt.Items[0].LotID, biz.InventoryLotActive)
}
