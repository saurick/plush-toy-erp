package data

import (
	"context"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestWorkflowDocumentFilterMergesSourcesBeforePagingAndCounts(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_document_filter?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	for i := 0; i < 37; i++ {
		source, group, role := "production_fact", "handoff_production_inbound", biz.WarehouseRoleKey
		if i >= 20 {
			source, group, role = "production-progress", "production_exception", biz.ProductionRoleKey
		}
		status := "ready"
		if i >= 30 {
			status = "done"
		}
		client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("DOCUMENT-%d", i)).SetTaskGroup(group).
			SetTaskName("核对生产记录").SetSourceType(source).SetSourceID(i + 1).
			SetOwnerRoleKey(role).SetTaskStatusKey(status).SaveX(ctx)
	}
	for i, row := range []struct{ source, role string }{
		{"production-progress", biz.FinanceRoleKey}, {"purchase_receipt", biz.WarehouseRoleKey},
	} {
		client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("DOCUMENT-OTHER-%d", i)).SetTaskGroup("other").
			SetTaskName("其他任务").SetSourceType(row.source).SetSourceID(100 + i).
			SetOwnerRoleKey(row.role).SetTaskStatusKey("ready").SaveX(ctx)
	}
	query := biz.WorkflowTaskBoardQuery{SourceType: "production_fact", VisibleOwnerRoleKeys: []string{biz.WarehouseRoleKey, biz.ProductionRoleKey},
		LaneKey: "all", Limit: 20, Sort: "newest", SnapshotAt: time.Now()}
	for _, source := range []string{"production_fact", "production-progress"} {
		query.SourceType = source
		for _, offset := range []int{0, 20} {
			query.Offset = offset
			board, err := repo.GetWorkflowTaskBoard(ctx, query)
			if err != nil {
				t.Fatal(err)
			}
			want := 20
			if offset == 20 {
				want = 17
			}
			if board.Total != 37 || board.Counts.Actionable != 30 || board.Counts.Finished != 7 || len(board.Lanes[0].Tasks) != want {
				t.Fatalf("merged filter lost rows or leaked roles: total=%d counts=%+v rows=%d", board.Total, board.Counts, len(board.Lanes[0].Tasks))
			}
			if fmt.Sprint(board.SourceTypes) != "[production_fact purchase_receipt]" {
				t.Fatalf("document facets disagree with merged scope: %v", board.SourceTypes)
			}
		}
	}
	query.Offset, query.SourceType = 0, ""
	board, err := repo.GetWorkflowTaskBoard(ctx, query)
	if err != nil || board.Total != 38 {
		t.Fatalf("clear restores authorized scope: %+v %v", board, err)
	}
	query.SourceType = "finance_payment"
	board, err = repo.GetWorkflowTaskBoard(ctx, query)
	if err != nil || board.Total != 0 {
		t.Fatalf("empty type must not return old rows: %+v %v", board, err)
	}
	page, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{SourceType: "production_fact", RoleKey: biz.ProductionRoleKey,
		ViewKey: "todo", Limit: 20, IncludeCounts: true, SnapshotAt: time.Now()})
	if err != nil || page.Counts == nil || page.Counts.Todo != 10 || len(page.Items) != 10 {
		t.Fatalf("mobile merged filter must retain its own role scope: %+v %v", page, err)
	}
}

func TestWorkflowDocumentRejectionDispositionDisplay(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "workflow_rejection_document_display")
	fixture := createInventoryTestFixtures(t, ctx, client)
	receipt := client.PurchaseReceipt.Create().SetReceiptNo("RECEIPT-DISPLAY").SetSupplierName("模拟供应商").SetReceivedAt(time.Now()).SaveX(ctx)
	item := client.PurchaseReceiptItem.Create().SetReceiptID(receipt.ID).SetMaterialID(fixture.materialID).
		SetWarehouseID(fixture.warehouseID).SetUnitID(fixture.unitID).SetQuantity(decimal.NewFromInt(1)).SaveX(ctx)
	disposition := client.PurchaseRejectionDisposition.Create().SetDispositionNo("REJECTION-DISPLAY").
		SetQualityInspectionID(1).SetPurchaseReceiptID(receipt.ID).SetPurchaseReceiptItemID(item.ID).
		SetDispositionType("REPLACE").SetQuantity(decimal.NewFromInt(1)).SetSupplierName("模拟供应商").
		SetReason("来料不合格补换").SetCreatedBy(1).SetIdempotencyKey("rejection-display").
		SetIdempotencyPayloadHash(strings.Repeat("a", 64)).SaveX(ctx)
	if err := syncFulfillmentTask(ctx, client, "receipt_replacement", disposition.ID, disposition.DispositionNo, "/erp/warehouse/inbound", "ready", "", 1); err != nil {
		t.Fatal(err)
	}
	task := assertFulfillmentTask(t, ctx, client, "receipt_replacement", disposition.ID, "ready", biz.WarehouseRoleKey)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	result, err := repo.GetWorkflowTask(ctx, task.ID)
	if err != nil || result.DisplayContext == nil || !result.DisplayContext.Available || result.DisplayContext.SourceNo != disposition.DispositionNo ||
		len(result.DisplayContext.Items) != 1 || result.DisplayContext.Items[0].Kind != "material" {
		t.Fatalf("rejection record must show its real reference and material: %+v %v", result, err)
	}
	client.WorkflowTask.UpdateOneID(task.ID).SetTaskCode("UNTRUSTED-REJECTION").SaveX(ctx)
	result, err = repo.GetWorkflowTask(ctx, task.ID)
	if err != nil || result.DisplayContext != nil {
		t.Fatal("untrusted source must not reveal a rejection record")
	}
}

func TestWorkflowDocumentOutsourcingDispositionDisplay(t *testing.T) {
	ctx := context.Background()
	_, client := openInventoryRepoTestData(t, "workflow_outsourcing_disposition_display")
	fixture := createInventoryTestFixtures(t, ctx, client)
	fact := client.OutsourcingFact.Create().SetFactNo("RETURN-DISPLAY").SetFactType(biz.OutsourcingFactReturnReceipt).
		SetSubjectType(biz.InventorySubjectProduct).SetSubjectID(fixture.productID).SetWarehouseID(fixture.productWarehouseID).
		SetUnitID(fixture.unitID).SetQuantity(decimal.NewFromInt(1)).SetIdempotencyKey("return-display").SaveX(ctx)
	disposition := client.OutsourcingReturnDisposition.Create().SetDispositionNo("RETURN-DISPOSITION").
		SetQualityInspectionID(1).SetOutsourcingReturnFactID(fact.ID).SetDispositionType("RETURN_TO_VENDOR").
		SetQuantity(decimal.NewFromInt(1)).SetReason("回货拒收").SetCreatedBy(1).
		SetIdempotencyKey("return-disposition").SetIdempotencyPayloadHash(strings.Repeat("b", 64)).SaveX(ctx)
	sources, err := loadWorkflowDisplaySources(ctx, client, "outsourcing_return_disposition", []int{disposition.ID})
	source := sources[disposition.ID]
	if err != nil || source.no != disposition.DispositionNo || len(source.items) != 1 || source.items[0].id != fixture.productID {
		t.Fatalf("outsourcing disposition must retain its own number and referenced goods: %+v %v", source, err)
	}
}
