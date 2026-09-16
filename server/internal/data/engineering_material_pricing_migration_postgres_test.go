package data

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent/workflowtaskevent"
)

func TestSourceDocumentPostgresRemoveEngineeringMaterialPricing(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	f := prepareMaterialRequestFixture(t, ctx, data, fmt.Sprintf("PG-MP-%x", time.Now().UnixNano()))
	request := submitMaterialRequestFixture(t, ctx, f)
	// Stage a pending approval as produced before pricing was removed.
	row := client.EngineeringMaterialRequest.UpdateOneID(request.ID).
		SetStatus(biz.MaterialRequestBossApproved).SetBossReviewedBy(22).SetBossReviewedAt(time.Now()).AddVersion(1).SaveX(ctx)
	request, err := loadEngineeringMaterialRequest(ctx, client, row)
	if err != nil {
		t.Fatal(err)
	}
	oldTask, err := biz.BuildEngineeringMaterialTask(request)
	if err != nil {
		t.Fatal(err)
	}
	oldTask.TaskName = "核价并批准采购用料"
	oldTask.Payload["complete_condition"] = "打开材料汇总表核对用料，并在表内提交或审批。"
	task, _, err := ensureSourceWorkflowTaskRecordWithClient(ctx, client, oldTask, 22)
	if err != nil {
		t.Fatal(err)
	}
	created := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("created")).OnlyX(ctx)
	existingPO := client.PurchaseOrder.Create().SetPurchaseOrderNo(fmt.Sprintf("PG-PRICED-%d", time.Now().UnixNano())).
		SetSupplierID(request.Items[0].SupplierID).SetPurchaseDate(time.Now()).SetLifecycleStatus("approved").SaveX(ctx)
	existingLine := client.PurchaseOrderItem.Create().SetPurchaseOrderID(existingPO.ID).SetLineNo(1).
		SetMaterialID(request.Items[0].MaterialID).SetUnitID(request.Items[0].UnitID).
		SetPurchasedQuantity(decimal.NewFromInt(2)).SetUnitPrice(decimal.NewFromInt(9)).SetAmount(decimal.NewFromInt(18)).SaveX(ctx)
	_, err = data.sqldb.ExecContext(ctx, `ALTER TABLE engineering_material_request_items
		ADD COLUMN purchase_quantity numeric(20,6), ADD COLUMN unit_price numeric(20,6),
		ADD COLUMN expected_arrival_date timestamptz, ADD COLUMN note varchar(255),
		ADD CONSTRAINT engineering_material_request_items_price_valid CHECK (unit_price IS NULL OR unit_price >= 0);
		UPDATE engineering_material_request_items SET purchase_quantity = required_quantity + 1,
		unit_price = 9.5, expected_arrival_date = CURRENT_TIMESTAMP, note = '模拟核价填写';`)
	if err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile("model/migrate/20260915155801_migrate.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := data.sqldb.ExecContext(ctx, string(migration)); err != nil {
		t.Fatalf("apply pricing removal to populated approval: %v", err)
	}
	var remaining int
	if err := data.sqldb.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'engineering_material_request_items'
		AND column_name IN ('purchase_quantity', 'unit_price', 'expected_arrival_date', 'note')`).Scan(&remaining); err != nil || remaining != 0 {
		t.Fatalf("pricing columns remain: %d %v", remaining, err)
	}
	if after := client.PurchaseOrderItem.GetX(ctx, existingLine.ID); after.UnitPrice == nil || !after.UnitPrice.Equal(*existingLine.UnitPrice) || after.Amount == nil || !after.Amount.Equal(*existingLine.Amount) {
		t.Fatal("migration changed an existing purchase order price")
	}
	updated := materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialFinanceReviewGroup, request.ID, "ready")
	if updated.TaskName != "审核并批准采购用料" || updated.Version != task.Version+1 ||
		updated.Payload[workflowSourceTaskIntentHashPayloadKey] != task.Payload[workflowSourceTaskIntentHashPayloadKey] {
		t.Fatalf("migration changed task identity or missed display/version: %+v", updated)
	}
	if after := client.WorkflowTaskEvent.GetX(ctx, created.ID); !reflect.DeepEqual(created.Payload, after.Payload) || created.EventType != after.EventType {
		t.Fatal("migration rewrote creation evidence")
	}
	if client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("updated")).CountX(ctx) != 1 {
		t.Fatal("display update has no audit event")
	}
	// Submission replay reads the existing source; it must not recreate the task
	// using current display text and a different creation intent.
	if _, err := f.uc.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{
		SalesOrderID: request.SalesOrderID, ExpectedVersion: request.SourceOrderVersion,
		ExpectedSourceHash: request.SourceHash, ActorID: 11,
	}); err != nil {
		t.Fatalf("submission replay after migration: %v", err)
	}
	in := financeMaterialRequestInput(request)
	in.WorkflowTaskID, in.ExpectedTaskVersion = task.ID, task.Version
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in); !errors.Is(err, biz.ErrMaterialRequestConflict) {
		t.Fatalf("stale task version approved: %v", err)
	}
	in.ExpectedTaskVersion = updated.Version
	approved, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in)
	if err != nil || len(approved.PurchaseOrders) != 2 {
		t.Fatalf("pending approval did not continue: %+v %v", approved, err)
	}
	for _, po := range approved.PurchaseOrders {
		for _, line := range client.PurchaseOrder.GetX(ctx, po.ID).QueryItems().AllX(ctx) {
			if line.UnitPrice != nil || line.Amount != nil || line.ExpectedArrivalDate != nil {
				t.Fatal("removed pricing input leaked into purchase order")
			}
			for _, source := range request.Items {
				if source.MaterialID == line.MaterialID && !line.PurchasedQuantity.Equal(source.RequiredQuantity) {
					t.Fatal("purchase quantity did not use frozen BOM demand")
				}
			}
		}
	}
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in); err != nil {
		t.Fatalf("finance replay after upgrade: %v", err)
	}
}
